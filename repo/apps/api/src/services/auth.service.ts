import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { assertPasswordNotReused, PASSWORD_REUSE_MESSAGE } from '../utils/password-history.js';
import { validatePasswordComplexity } from '../utils/password-policy.js';
import { CaptchaService } from './captcha.service.js';

type LoginInput = {
  username: string;
  password: string;
  captchaId?: string;
  captchaAnswer?: string;
  loginActor?: 'administrator' | 'manager' | 'moderator' | 'catalog-editor' | 'warehouse-clerk';
  ipAddress?: string;
  userAgent?: string;
};

type PasswordChangeInput = {
  userId: string;
  currentPassword: string;
  newPassword: string;
  ipAddress?: string;
};

type SessionPayload = {
  sub: string;
  sid: string;
  authzVersion: number;
  username: string;
  displayName: string;
  roleCodes: string[];
  permissionCodes: string[];
  assignedWarehouseIds: string[];
  departmentIds: string[];
};

type UserRecord = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  password_history: string[];
  failed_login_count: number;
  locked_until: string | null;
  is_active: boolean;
  authz_version: number;
};

type AuthFailureDetails = {
  captchaRequired?: boolean;
  lockedUntil?: string | null;
};

const actorRoleMap: Record<NonNullable<LoginInput['loginActor']>, string> = {
  administrator: 'administrator',
  manager: 'manager',
  moderator: 'moderator',
  'catalog-editor': 'catalog_editor',
  'warehouse-clerk': 'warehouse_clerk'
};

export class AuthService {
  private readonly captchaService: CaptchaService;

  constructor(private readonly fastify: FastifyInstance) {
    this.captchaService = new CaptchaService(fastify);
  }

  async getCaptcha(username: string): Promise<{ id: string; svg: string; expiresAt: string }> {
    return this.captchaService.create(username);
  }

  async getLoginHints(username: string): Promise<{ captchaRequired: boolean; lockedUntil: string | null }> {
    const user = await this.fetchUserByUsername(username);
    return {
      captchaRequired: Boolean(user && user.failed_login_count >= config.captchaFailureThreshold),
      lockedUntil: user?.locked_until ?? null
    };
  }

  async login(input: LoginInput): Promise<{ token: string; user: SessionPayload }> {
    const user = await this.fetchUserByUsername(input.username);
    if (!user || !user.is_active) {
      throw this.authError('Invalid credentials', 401);
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      throw this.authError(`Account locked until ${user.locked_until}`, 423, {
        lockedUntil: user.locked_until
      });
    }

    if (user.failed_login_count >= config.captchaFailureThreshold) {
      const verified = input.captchaId && input.captchaAnswer
        ? await this.captchaService.verify(input.captchaId, input.username, input.captchaAnswer)
        : false;

      if (!verified) {
        const failedAttempt = await this.recordFailedAttempt(user.id, user.failed_login_count + 1, input.ipAddress);
        if (failedAttempt.lockedUntil) {
          throw this.authError(`Account locked until ${failedAttempt.lockedUntil}`, 423, failedAttempt);
        }

        throw this.authError('CAPTCHA validation failed', 401, {
          captchaRequired: failedAttempt.captchaRequired ?? true,
          lockedUntil: failedAttempt.lockedUntil ?? null
        });
      }
    }

    const validPassword = await argon2.verify(user.password_hash, input.password);
    if (!validPassword) {
      const failedAttempt = await this.recordFailedAttempt(user.id, user.failed_login_count + 1, input.ipAddress);
      if (failedAttempt.lockedUntil) {
        throw this.authError(`Account locked until ${failedAttempt.lockedUntil}`, 423, failedAttempt);
      }

      throw this.authError('Invalid credentials', 401, failedAttempt);
    }

    const identity = await this.buildIdentity(user.id, user.username);

    if (input.loginActor) {
      const requiredRole = actorRoleMap[input.loginActor];
      if (!identity.roleCodes.includes(requiredRole)) {
        throw this.authError(`This account cannot sign in through the ${input.loginActor} login`, 403);
      }
    }

    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000);

    await this.fastify.db.query('BEGIN');
    try {
      await this.fastify.db.query(
        `
          UPDATE users
          SET failed_login_count = 0, locked_until = NULL, updated_at = NOW()
          WHERE id = $1
        `,
        [user.id]
      );

      await this.fastify.db.query(
        `
          INSERT INTO sessions (user_id, token_id, expires_at, last_seen_at, rotation_reason, user_agent, ip_address)
          VALUES ($1, $2, $3, NOW(), 'login', $4, $5)
        `,
        [user.id, sessionId, expiresAt.toISOString(), input.userAgent ?? null, input.ipAddress ?? null]
      );

      await this.fastify.db.query('COMMIT');
    } catch (error) {
      await this.fastify.db.query('ROLLBACK');
      throw error;
    }

    const payload: SessionPayload = {
      sub: user.id,
      sid: sessionId,
      authzVersion: user.authz_version,
      username: user.username,
      displayName: user.display_name,
      roleCodes: identity.roleCodes,
      permissionCodes: identity.permissionCodes,
      assignedWarehouseIds: identity.assignedWarehouseIds,
      departmentIds: identity.departmentIds
    };

    const token = await this.fastify.jwt.sign(payload, {
      expiresIn: `${config.sessionTtlHours}h`
    });

    await this.fastify.writeAudit({
      userId: user.id,
      actionType: 'login',
      resourceType: 'session',
      resourceId: sessionId,
      details: { username: user.username },
      ipAddress: input.ipAddress
    });

    return { token, user: payload };
  }

  async listSessions(userId: string) {
    const result = await this.fastify.db.query(
      `
        SELECT id, token_id, created_at, expires_at, last_seen_at, revoked_at, rotation_reason, user_agent, ip_address
        FROM sessions
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
      [userId]
    );

    return result.rows;
  }

  async getCurrentUser(userId: string): Promise<SessionPayload> {
    const result = await this.fastify.db.query<{
      id: string;
      username: string;
      display_name: string;
      authz_version: number;
    }>(
      `
        SELECT id, username, display_name, authz_version
        FROM users
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [userId]
    );

    if (!result.rowCount) {
      throw new Error('User not found');
    }

    const user = result.rows[0];
    const identity = await this.buildIdentity(user.id, user.username);

    return {
      sub: user.id,
      sid: '',
      authzVersion: user.authz_version,
      username: user.username,
      displayName: user.display_name,
      roleCodes: identity.roleCodes,
      permissionCodes: identity.permissionCodes,
      assignedWarehouseIds: identity.assignedWarehouseIds,
      departmentIds: identity.departmentIds
    };
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.fastify.db.query(
      `
        UPDATE sessions
        SET revoked_at = NOW()
        WHERE user_id = $1 AND token_id = $2 AND revoked_at IS NULL
      `,
      [userId, sessionId]
    );

    await this.fastify.writeAudit({
      userId,
      actionType: 'session_revoke',
      resourceType: 'session',
      resourceId: sessionId
    });
  }

  async invalidateAuthorizationState(userId: string, rotationReason: string): Promise<void> {
    const client = await this.fastify.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `
          UPDATE users
          SET authz_version = authz_version + 1,
              updated_at = NOW()
          WHERE id = $1
        `,
        [userId]
      );
      await client.query(
        `
          UPDATE sessions
          SET revoked_at = NOW(),
              rotation_reason = $2
          WHERE user_id = $1
            AND revoked_at IS NULL
        `,
        [userId, rotationReason]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async changePassword(input: PasswordChangeInput): Promise<void> {
    const result = await this.fastify.db.query<UserRecord>(
      `
        SELECT id, username, display_name, password_hash, password_history, failed_login_count, locked_until, is_active
        FROM users
        WHERE id = $1
      `,
      [input.userId]
    );

    if (!result.rowCount) {
      throw this.authError('User not found', 404);
    }

    const user = result.rows[0];
    const currentValid = await argon2.verify(user.password_hash, input.currentPassword);
    if (!currentValid) {
      throw this.authError('Current password is incorrect', 401);
    }

    const complexityErrors = validatePasswordComplexity(input.newPassword);
    if (complexityErrors.length) {
      throw this.authError(complexityErrors.join(' '), 422);
    }

    try {
      await assertPasswordNotReused(
        input.newPassword,
        user.password_hash,
        user.password_history,
        config.passwordHistoryDepth
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : PASSWORD_REUSE_MESSAGE;
      throw this.authError(message, 422);
    }

    const newHash = await argon2.hash(input.newPassword, {
      type: argon2.argon2id,
      memoryCost: config.argon2MemoryCost,
      timeCost: config.argon2TimeCost,
      parallelism: config.argon2Parallelism
    });

    const nextHistory = [user.password_hash, ...(user.password_history ?? [])].slice(0, config.passwordHistoryDepth);

    await this.fastify.db.query(
      `
        UPDATE users
        SET password_hash = $2,
            password_history = $3::jsonb,
            authz_version = authz_version + 1,
            password_changed_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [input.userId, newHash, JSON.stringify(nextHistory)]
    );

    await this.fastify.db.query(
      `
        UPDATE sessions
        SET revoked_at = NOW(), rotation_reason = 'password_change'
        WHERE user_id = $1 AND revoked_at IS NULL
      `,
      [input.userId]
    );

    await this.fastify.writeAudit({
      userId: input.userId,
      actionType: 'password_change',
      resourceType: 'user',
      resourceId: input.userId,
      ipAddress: input.ipAddress
    });
  }

  async touchSession(input: { sessionId: string; userId: string; authzVersion: number }): Promise<boolean> {
    const result = await this.fastify.db.query<{
      user_id: string;
      expires_at: string;
      revoked_at: string | null;
      last_seen_at: string;
      is_active: boolean;
      deleted_at: string | null;
      authz_version: number;
    }>(
      `
        SELECT
          s.user_id,
          s.expires_at,
          s.revoked_at,
          s.last_seen_at,
          u.is_active,
          u.deleted_at,
          u.authz_version
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_id = $1
      `,
      [input.sessionId]
    );

    if (!result.rowCount) {
      return false;
    }

    const session = result.rows[0];
    if (session.user_id !== input.userId) {
      await this.revokeSessionByTokenId(input.sessionId, 'session_user_mismatch');
      return false;
    }

    if (!session.is_active || session.deleted_at) {
      await this.revokeSessionByTokenId(input.sessionId, 'user_inactive');
      return false;
    }

    if (session.authz_version !== input.authzVersion) {
      await this.revokeSessionByTokenId(input.sessionId, 'authz_version_changed');
      return false;
    }

    if (session.revoked_at || new Date(session.expires_at).getTime() < Date.now()) {
      return false;
    }

    const idleLimit = new Date(session.last_seen_at).getTime() + config.sessionIdleTimeoutMinutes * 60_000;
    if (idleLimit < Date.now()) {
      await this.fastify.db.query(
        `UPDATE sessions SET revoked_at = NOW(), rotation_reason = 'idle_timeout' WHERE token_id = $1`,
        [input.sessionId]
      );
      return false;
    }

    await this.fastify.db.query(`UPDATE sessions SET last_seen_at = NOW() WHERE token_id = $1`, [input.sessionId]);
    return true;
  }

  private async fetchUserByUsername(username: string): Promise<UserRecord | null> {
    const result = await this.fastify.db.query<UserRecord>(
      `
        SELECT id, username, display_name, password_hash, password_history, failed_login_count, locked_until, is_active
             , authz_version
        FROM users
        WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL
      `,
      [username]
    );

    return result.rowCount ? result.rows[0] : null;
  }

  private async recordFailedAttempt(userId: string, failedCount: number, ipAddress?: string): Promise<AuthFailureDetails> {
    const lockedUntil = failedCount >= config.loginLockoutAttempts
      ? new Date(Date.now() + config.loginLockoutMinutes * 60_000).toISOString()
      : null;

    await this.fastify.db.query(
      `
        UPDATE users
        SET failed_login_count = $2,
            locked_until = COALESCE($3, locked_until),
            updated_at = NOW()
        WHERE id = $1
      `,
      [userId, failedCount, lockedUntil]
    );

    await this.fastify.writeAudit({
      userId,
      actionType: 'login_failed',
      resourceType: 'user',
      resourceId: userId,
      details: { failedCount, lockedUntil },
      ipAddress
    });

    return {
      captchaRequired: failedCount >= config.captchaFailureThreshold,
      lockedUntil
    };
  }

  private async revokeSessionByTokenId(sessionId: string, rotationReason: string): Promise<void> {
    await this.fastify.db.query(
      `
        UPDATE sessions
        SET revoked_at = NOW(),
            rotation_reason = $2
        WHERE token_id = $1
          AND revoked_at IS NULL
      `,
      [sessionId, rotationReason]
    );
  }

  private authError(message: string, statusCode: number, details?: AuthFailureDetails) {
    const error = new Error(message) as Error & { statusCode?: number; details?: AuthFailureDetails };
    error.statusCode = statusCode;
    error.details = details;
    return error;
  }

  private async buildIdentity(userId: string, username: string) {
    const permissionResult = await this.fastify.db.query<{
      role_code: string;
      permission_code: string;
    }>(
      `
        SELECT r.code AS role_code, p.code AS permission_code
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        JOIN role_permissions rp ON rp.role_id = r.id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = $1
      `,
      [userId]
    );

    const warehouseRuleResult = await this.fastify.db.query<{ resource_id: string }>(
      `
        SELECT resource_id
        FROM attribute_rules
        WHERE user_id = $1 AND resource_type = 'warehouse' AND rule_type = 'access'
      `,
      [userId]
    );

    const departmentRuleResult = await this.fastify.db.query<{ resource_id: string }>(
      `
        SELECT resource_id
        FROM attribute_rules
        WHERE user_id = $1 AND resource_type = 'department' AND rule_type = 'access'
      `,
      [userId]
    );

    const roleCodes = [...new Set(permissionResult.rows.map((row) => row.role_code))];
    const permissionCodes = [...new Set(permissionResult.rows.map((row) => row.permission_code))];

    return {
      username,
      roleCodes,
      permissionCodes,
      assignedWarehouseIds: warehouseRuleResult.rows.map((row) => row.resource_id),
      departmentIds: departmentRuleResult.rows.map((row) => row.resource_id)
    };
  }
}
