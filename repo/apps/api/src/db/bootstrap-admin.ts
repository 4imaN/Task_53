import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { assertPasswordComplexity, hashPassword } from '../utils/password-policy.js';
import { logProcessError } from '../utils/error-logging.js';

const { Pool } = pg;

const permissions = [
  'users.manage',
  'roles.manage',
  'warehouses.read',
  'warehouses.manage',
  'bins.toggle',
  'inventory.scan',
  'inventory.receive',
  'inventory.move',
  'inventory.pick',
  'inventory.count',
  'inventory.adjust',
  'documents.approve',
  'catalog.manage',
  'content.moderate',
  'metrics.read',
  'search.read',
  'saved_views.manage',
  'exports.manage',
  'images.export',
  'integrations.manage',
  'audit.read'
];

export const seedDemoUsers = [
  {
    username: 'manager.demo',
    displayName: 'Mara Jensen',
    password: 'ManagerDemo!123',
    roleCode: 'manager',
    warehouseCodes: [] as string[],
    departmentCodes: [] as string[]
  },
  {
    username: 'moderator.demo',
    displayName: 'Noah Grant',
    password: 'ModeratorDemo!123',
    roleCode: 'moderator',
    warehouseCodes: [] as string[],
    departmentCodes: ['district-ops']
  },
  {
    username: 'catalog.demo',
    displayName: 'Elena Park',
    password: 'CatalogDemo!123',
    roleCode: 'catalog_editor',
    warehouseCodes: [] as string[],
    departmentCodes: ['district-ops']
  },
  {
    username: 'clerk.demo',
    displayName: 'Luis Romero',
    password: 'ClerkDemo!123',
    roleCode: 'warehouse_clerk',
    warehouseCodes: ['WH-01'],
    departmentCodes: [] as string[]
  }
] as const;

export const validateSeedUserPasswords = (
  users: ReadonlyArray<{ username: string; password: string }>
) => {
  for (const user of users) {
    assertPasswordComplexity(user.password, { subject: `Seeded password for ${user.username}` });
  }
};

export const validateBootstrapPasswords = () => {
  assertPasswordComplexity(config.defaultAdminPassword, { subject: 'Default admin password' });

  if (process.env.SEED_DEMO_USERS === '1') {
    validateSeedUserPasswords(seedDemoUsers);
  }
};

export const bootstrapAdmin = async (): Promise<void> => {
  validateBootstrapPasswords();
  const pool = new Pool({ connectionString: config.databaseUrl });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const upsertUser = async (input: {
      username: string;
      displayName: string;
      password: string;
      roleCode: string;
      warehouseCodes?: readonly string[];
      departmentCodes?: readonly string[];
      auditAction: string;
    }) => {
      const passwordHash = await hashPassword(input.password);

      const userResult = await client.query<{ id: string }>(
        `
          INSERT INTO users (username, display_name, password_hash, password_history)
          VALUES ($1, $2, $3, jsonb_build_array($3::text))
          ON CONFLICT (username) DO UPDATE
          SET display_name = EXCLUDED.display_name,
              password_hash = EXCLUDED.password_hash,
              password_history = EXCLUDED.password_history,
              failed_login_count = 0,
              locked_until = NULL,
              updated_at = NOW()
          RETURNING id
        `,
        [input.username, input.displayName, passwordHash]
      );

      const roleResult = await client.query<{ id: string }>(
        `SELECT id FROM roles WHERE code = $1`,
        [input.roleCode]
      );

      if (!roleResult.rowCount) {
        throw new Error(`${input.roleCode} role was not seeded`);
      }

      const userId = userResult.rows[0].id;
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, roleResult.rows[0].id]
      );

      if (input.warehouseCodes?.length) {
        await client.query(
          `
            INSERT INTO attribute_rules (user_id, resource_type, resource_id, rule_type, metadata)
            SELECT $1, 'warehouse', w.id, 'access', '{}'::jsonb
            FROM warehouses w
            WHERE w.code = ANY($2::text[])
            ON CONFLICT (user_id, resource_type, resource_id, rule_type) DO NOTHING
          `,
          [userId, input.warehouseCodes]
        );
      }

      if (input.departmentCodes?.length) {
        await client.query(
          `
            INSERT INTO attribute_rules (user_id, resource_type, resource_id, rule_type, metadata)
            SELECT $1, 'department', d.id, 'access', '{}'::jsonb
            FROM departments d
            WHERE d.code = ANY($2::text[])
            ON CONFLICT (user_id, resource_type, resource_id, rule_type) DO NOTHING
          `,
          [userId, input.departmentCodes]
        );
      }

      await client.query(
        `
          INSERT INTO audit_log (user_id, action_type, resource_type, resource_id, details, ip_address)
          VALUES ($1, $2, 'user', $1, $3::jsonb, '127.0.0.1')
        `,
        [userId, input.auditAction, JSON.stringify({ username: input.username, roleCode: input.roleCode, seededPermissions: permissions })]
      );
    };

    await upsertUser({
      username: config.defaultAdminUsername,
      displayName: 'Default Administrator',
      password: config.defaultAdminPassword,
      roleCode: 'administrator',
      warehouseCodes: [],
      departmentCodes: [],
      auditAction: 'bootstrap_admin'
    });

    if (process.env.SEED_DEMO_USERS === '1') {
      for (const demoUser of seedDemoUsers) {
        await upsertUser({
          username: demoUser.username,
          displayName: demoUser.displayName,
          password: demoUser.password,
          roleCode: demoUser.roleCode,
          warehouseCodes: demoUser.warehouseCodes,
          departmentCodes: demoUser.departmentCodes,
          auditAction: 'bootstrap_demo_user'
        });
      }
    }

    await client.query('COMMIT');
    console.log(`Bootstrap admin ready: ${config.defaultAdminUsername}`);
    if (process.env.SEED_DEMO_USERS === '1') {
      console.log(`Bootstrap demo users ready: ${seedDemoUsers.map((user) => user.username).join(', ')}`);
    } else {
      console.log('Bootstrap demo users skipped (set SEED_DEMO_USERS=1 to enable)');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isMain) {
  bootstrapAdmin().catch((error) => {
    logProcessError('bootstrap_admin', error);
    process.exitCode = 1;
  });
}
