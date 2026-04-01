import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export type IntegrationClientWrite = {
  name: string;
  clientKey: string;
  hmacSecret: Buffer;
  allowedDepartments: string[];
  scopes: string[];
  rateLimitPerMinute?: number;
  webhookUrl?: string | null;
  isActive?: boolean;
};

export class IntegrationClientService {
  constructor(private readonly fastify: FastifyInstance) {}

  async createClient(input: IntegrationClientWrite) {
    const result = await this.fastify.db.query<{ id: string }>(
      `
        INSERT INTO integration_clients (
          name,
          client_key,
          hmac_secret,
          allowed_departments,
          scopes,
          rate_limit_per_minute,
          webhook_url,
          is_active
        )
        VALUES (
          $1,
          $2,
          pgp_sym_encrypt_bytea($3::bytea, $4::text, 'cipher-algo=aes256,compress-algo=0'),
          $5::jsonb,
          $6::jsonb,
          $7,
          $8,
          $9
        )
        RETURNING id
      `,
      [
        input.name.trim(),
        input.clientKey.trim(),
        input.hmacSecret,
        config.encryptionKey,
        JSON.stringify(input.allowedDepartments),
        JSON.stringify(input.scopes),
        input.rateLimitPerMinute ?? config.integrationRateLimit,
        input.webhookUrl ?? null,
        input.isActive ?? true
      ]
    );

    return result.rows[0];
  }

  async findByClientKey(clientKey: string) {
    const result = await this.fastify.db.query<{
      id: string;
      hmac_secret: Buffer;
      rate_limit_per_minute: number;
      scopes: string[];
      allowed_departments: string[];
      is_active: boolean;
      webhook_url: string | null;
    }>(
      `
        SELECT
          id,
          omnistock_try_decrypt_bytea(hmac_secret, $2::text) AS hmac_secret,
          rate_limit_per_minute,
          scopes,
          allowed_departments,
          is_active,
          webhook_url
        FROM integration_clients
        WHERE client_key = $1
      `,
      [clientKey, config.encryptionKey]
    );

    return result.rows[0] ?? null;
  }

  async listClients() {
    const result = await this.fastify.db.query<{
      id: string;
      name: string;
      client_key: string;
      allowed_departments: string[];
      scopes: string[];
      rate_limit_per_minute: number;
      webhook_url: string | null;
      is_active: boolean;
      created_at: string;
    }>(
      `
        SELECT
          id,
          name,
          client_key,
          allowed_departments,
          scopes,
          rate_limit_per_minute,
          webhook_url,
          is_active,
          created_at
        FROM integration_clients
        ORDER BY name ASC
      `
    );

    return result.rows;
  }
}
