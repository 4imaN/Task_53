import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { withTransaction } from '../utils/db.js';

type IntegrationClient = {
  id: string;
  allowed_departments: string[];
  rate_limit_per_minute: number;
};

const integrationError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

const departmentFieldValues = (value: unknown): string[] => {
  if (typeof value === 'string' || typeof value === 'number') {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => departmentFieldValues(entry));
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return [
      ...departmentFieldValues(record.departmentId),
      ...departmentFieldValues(record.department_id),
      ...departmentFieldValues(record.departmentCode),
      ...departmentFieldValues(record.department_code)
    ];
  }

  return [];
};

export class IntegrationSecurityService {
  constructor(private readonly fastify: FastifyInstance) {}

  validateTimestampFreshness(timestampHeader: string) {
    const parsed = this.parseTimestamp(timestampHeader);
    const maxSkewMs = config.integrationTimestampSkewSeconds * 1000;
    if (Math.abs(Date.now() - parsed) > maxSkewMs) {
      throw integrationError(401, 'Integration request timestamp is outside the allowed clock skew');
    }

    return parsed;
  }

  async enforceRateLimit(client: IntegrationClient) {
    await withTransaction(this.fastify.db, async (db) => {
      await db.query(`SELECT id FROM integration_clients WHERE id = $1 FOR UPDATE`, [client.id]);
      await db.query(
        `DELETE FROM integration_rate_limit_events WHERE created_at <= NOW() - INTERVAL '60 seconds'`
      );

      const recentResult = await db.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM integration_rate_limit_events
          WHERE integration_client_id = $1
            AND created_at > NOW() - INTERVAL '60 seconds'
        `,
        [client.id]
      );

      if (Number(recentResult.rows[0]?.count ?? 0) >= client.rate_limit_per_minute) {
        throw integrationError(429, 'Integration client rate limit exceeded');
      }

      await db.query(
        `INSERT INTO integration_rate_limit_events (integration_client_id) VALUES ($1)`,
        [client.id]
      );
    });
  }

  async assertNotReplayed(clientId: string, replayKey: string, timestampMs: number) {
    if (!replayKey.trim()) {
      throw integrationError(401, 'Integration replay key is missing');
    }

    const ttlSeconds = config.integrationReplayTtlSeconds;
    try {
      await this.fastify.db.query(`DELETE FROM integration_request_replays WHERE expires_at <= NOW()`);
      await this.fastify.db.query(
        `
          INSERT INTO integration_request_replays (integration_client_id, replay_key, request_timestamp, expires_at)
          VALUES ($1, $2, to_timestamp($3 / 1000.0), NOW() + ($4 || ' seconds')::interval)
        `,
        [clientId, replayKey.trim(), timestampMs, ttlSeconds]
      );
    } catch (error) {
      const dbError = error as { code?: string };
      if (dbError.code === '23505') {
        throw integrationError(409, 'Integration request replay detected');
      }

      throw error;
    }
  }

  async ensureDepartmentScope(client: IntegrationClient, payload: unknown) {
    const payloadDepartments = new Set(
      [
        ...departmentFieldValues(payload),
        ...departmentFieldValues((payload as Record<string, unknown> | null)?.records),
        ...departmentFieldValues((payload as Record<string, unknown> | null)?.items),
        ...departmentFieldValues((payload as Record<string, unknown> | null)?.department),
        ...departmentFieldValues((payload as Record<string, unknown> | null)?.departments)
      ]
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    );

    if (!payloadDepartments.size) {
      throw integrationError(422, 'Integration payload must declare at least one department scope');
    }

    const allowedDepartments = new Set(
      client.allowed_departments
        .map((entry) => String(entry).trim().toLowerCase())
        .filter(Boolean)
    );

    if (!allowedDepartments.size) {
      throw integrationError(403, 'Integration client has no allowed departments configured');
    }

    const lookups = Array.from(new Set([...payloadDepartments, ...allowedDepartments]));
    const departmentResult = await this.fastify.db.query<{ id: string; code: string }>(
      `
        SELECT id::text, code
        FROM departments
        WHERE LOWER(code) = ANY($1::text[])
           OR id::text = ANY($1::text[])
      `,
      [lookups]
    );

    const canonicalMap = new Map<string, string>();
    for (const row of departmentResult.rows) {
      canonicalMap.set(row.id.toLowerCase(), row.code.toLowerCase());
      canonicalMap.set(row.code.toLowerCase(), row.code.toLowerCase());
    }

    const canonicalAllowed = new Set(Array.from(allowedDepartments, (entry) => canonicalMap.get(entry) ?? entry));
    const canonicalPayload = Array.from(payloadDepartments, (entry) => canonicalMap.get(entry) ?? entry);
    const denied = canonicalPayload.filter((entry) => !canonicalAllowed.has(entry));

    if (denied.length) {
      throw integrationError(403, `Integration payload references unauthorized department scope: ${denied.join(', ')}`);
    }

    return Array.from(canonicalAllowed);
  }

  private parseTimestamp(timestampHeader: string) {
    const trimmed = timestampHeader.trim();
    if (!trimmed) {
      throw integrationError(401, 'Integration request timestamp is required');
    }

    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      if (String(Math.trunc(asNumber)).length <= 10) {
        return Math.trunc(asNumber) * 1000;
      }

      return Math.trunc(asNumber);
    }

    const asDate = Date.parse(trimmed);
    if (!Number.isNaN(asDate)) {
      return asDate;
    }

    throw integrationError(401, 'Integration request timestamp is invalid');
  }
}
