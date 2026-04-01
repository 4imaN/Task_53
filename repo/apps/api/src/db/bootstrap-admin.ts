import argon2 from 'argon2';
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

const permissions = [
  'users.manage',
  'roles.manage',
  'warehouses.read',
  'warehouses.manage',
  'bins.toggle',
  'inventory.receive',
  'inventory.move',
  'inventory.pick',
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

const demoUsers = [
  {
    username: 'manager.demo',
    displayName: 'Mara Jensen',
    password: 'ManagerDemo!123',
    roleCode: 'manager',
    assignWarehouse: false
  },
  {
    username: 'moderator.demo',
    displayName: 'Noah Grant',
    password: 'ModeratorDemo!123',
    roleCode: 'moderator',
    assignWarehouse: false
  },
  {
    username: 'catalog.demo',
    displayName: 'Elena Park',
    password: 'CatalogDemo!123',
    roleCode: 'catalog_editor',
    assignWarehouse: false
  },
  {
    username: 'clerk.demo',
    displayName: 'Luis Romero',
    password: 'ClerkDemo!123',
    roleCode: 'warehouse_clerk',
    assignWarehouse: true
  }
] as const;

const run = async (): Promise<void> => {
  const pool = new Pool({ connectionString: config.databaseUrl });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const warehouseResult = await client.query<{ id: string }>(
      `SELECT id FROM warehouses ORDER BY created_at ASC LIMIT 1`
    );

    const upsertUser = async (input: {
      username: string;
      displayName: string;
      password: string;
      roleCode: string;
      assignWarehouse?: boolean;
      auditAction: string;
    }) => {
      const passwordHash = await argon2.hash(input.password, {
        type: argon2.argon2id,
        memoryCost: config.argon2MemoryCost,
        timeCost: config.argon2TimeCost,
        parallelism: config.argon2Parallelism
      });

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

      if (input.assignWarehouse && warehouseResult.rowCount) {
        await client.query(
          `
            INSERT INTO attribute_rules (user_id, resource_type, resource_id, rule_type, metadata)
            VALUES ($1, 'warehouse', $2, 'access', '{}'::jsonb)
            ON CONFLICT (user_id, resource_type, resource_id, rule_type) DO NOTHING
          `,
          [userId, warehouseResult.rows[0].id]
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
      auditAction: 'bootstrap_admin'
    });

    if (process.env.SEED_DEMO_USERS === '1') {
      for (const demoUser of demoUsers) {
        await upsertUser({
          username: demoUser.username,
          displayName: demoUser.displayName,
          password: demoUser.password,
          roleCode: demoUser.roleCode,
          assignWarehouse: demoUser.assignWarehouse,
          auditAction: 'bootstrap_demo_user'
        });
      }
    }

    await client.query('COMMIT');
    console.log(`Bootstrap admin ready: ${config.defaultAdminUsername}`);
    if (process.env.SEED_DEMO_USERS === '1') {
      console.log(`Bootstrap demo users ready: ${demoUsers.map((user) => user.username).join(', ')}`);
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

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
