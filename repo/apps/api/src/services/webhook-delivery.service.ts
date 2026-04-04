import { setTimeout as delay } from 'node:timers/promises';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { signPayload } from '../utils/hmac.js';
import { validateInternalWebhookUrl } from './webhook-url.service.js';

type IntegrationWebhookClient = {
  id: string;
  client_key: string;
  hmac_secret: Buffer;
  webhook_url?: string | null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const SAFE_SUMMARY_SCALAR_KEYS = new Set(['departmentCode', 'warehouseId', 'documentId', 'eventVersion']);

export const summarizeWebhookPayloadForStorage = (payload: Record<string, unknown>) => {
  const topLevelKeys = Object.keys(payload).sort();
  const scalarFields = Object.fromEntries(
    Object.entries(payload).filter(([key, value]) =>
      SAFE_SUMMARY_SCALAR_KEYS.has(key)
      && (
        typeof value === 'string'
        || typeof value === 'number'
        || typeof value === 'boolean'
        || value === null
      )
    )
  );
  const collectionCounts = Object.fromEntries(
    Object.entries(payload)
      .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
      .map(([key, value]) => [key, value.length])
  );

  return {
    kind: 'summary',
    topLevelKeys,
    scalarFields,
    collectionCounts,
    hasNestedObjects: Object.values(payload).some((value) => isPlainObject(value))
  };
};

export class WebhookDeliveryService {
  constructor(
    private readonly fastify: FastifyInstance,
    private readonly retryBackoffMs = config.webhookRetryBackoffMs,
    private readonly timeoutMs = config.webhookRequestTimeoutMs
  ) {}

  async deliverForClient(client: IntegrationWebhookClient, eventType: string, payload: Record<string, unknown>) {
    if (!client.webhook_url) {
      return null;
    }
    const storedPayload = summarizeWebhookPayloadForStorage(payload);

    let targetUrl: string;
    try {
      targetUrl = await this.validateTargetUrl(client.webhook_url);
    } catch (error) {
      const deliveryResult = await this.fastify.db.query<{ id: string }>(
        `
          INSERT INTO webhook_deliveries (integration_client_id, event_type, payload, target_url, delivery_status, attempt_count, last_attempt_at)
          VALUES ($1, $2, $3::jsonb, $4, 'blocked', 0, NOW())
          RETURNING id
        `,
        [client.id, eventType, JSON.stringify(storedPayload), client.webhook_url]
      );

      await this.fastify.writeAudit({
        userId: null,
        actionType: 'webhook_delivery_blocked',
        resourceType: 'integration_client',
        resourceId: client.id,
        details: {
          deliveryId: deliveryResult.rows[0].id,
          eventType,
          targetUrl: client.webhook_url,
          reason: (error as Error).message
        }
      });

      return { deliveryId: deliveryResult.rows[0].id, status: 'blocked' };
    }

    const deliveryResult = await this.fastify.db.query<{ id: string }>(
      `
        INSERT INTO webhook_deliveries (integration_client_id, event_type, payload, target_url, delivery_status)
        VALUES ($1, $2, $3::jsonb, $4, 'pending')
        RETURNING id
      `,
      [client.id, eventType, JSON.stringify(storedPayload), targetUrl]
    );
    const deliveryId = deliveryResult.rows[0].id;

    for (let attempt = 0; attempt <= this.retryBackoffMs.length; attempt += 1) {
      if (attempt > 0) {
        await delay(this.retryBackoffMs[attempt - 1]);
      }

      const response = await this.sendAttempt(client, targetUrl, eventType, payload);
      const finalAttempt = attempt === this.retryBackoffMs.length;
      const delivered = response.ok;
      const deliveryStatus = delivered ? 'delivered' : finalAttempt ? 'failed' : 'retrying';

      await this.fastify.db.query(
        `
          UPDATE webhook_deliveries
          SET delivery_status = $2,
              response_code = $3,
              attempt_count = $4,
              last_attempt_at = NOW()
          WHERE id = $1
        `,
        [deliveryId, deliveryStatus, response.statusCode, attempt + 1]
      );

      if (delivered) {
        await this.fastify.writeAudit({
          userId: null,
          actionType: 'webhook_delivery',
          resourceType: 'integration_client',
          resourceId: client.id,
          details: { deliveryId, eventType, targetUrl, status: deliveryStatus, attemptCount: attempt + 1 }
        });
        return { deliveryId, status: deliveryStatus };
      }
    }

    await this.fastify.writeAudit({
      userId: null,
      actionType: 'webhook_delivery_failed',
      resourceType: 'integration_client',
      resourceId: client.id,
      details: { deliveryId, eventType, targetUrl, status: 'failed', attemptCount: this.retryBackoffMs.length + 1 }
    });

    return { deliveryId, status: 'failed' };
  }

  private async validateTargetUrl(rawUrl: string) {
    return validateInternalWebhookUrl(rawUrl, {
      allowedHostnames: config.webhookAllowedHostnames,
      allowedDomainSuffixes: config.webhookAllowedDomainSuffixes,
      allowLoopback: config.allowDevWebhookLoopback
    });
  }

  private async sendAttempt(
    client: IntegrationWebhookClient,
    targetUrl: string,
    eventType: string,
    payload: Record<string, unknown>
  ) {
    const timestamp = String(Date.now());
    const body = JSON.stringify(payload);
    const signature = signPayload(`${timestamp}.${body}`, client.hmac_secret);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const verifiedTargetUrl = await this.validateTargetUrl(targetUrl);
      const response = await fetch(verifiedTargetUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-omnistock-client': client.client_key,
          'x-omnistock-event': eventType,
          'x-omnistock-timestamp': timestamp,
          'x-omnistock-signature': signature
        },
        body,
        signal: controller.signal
      });

      return {
        ok: response.ok,
        statusCode: response.status
      };
    } catch {
      return {
        ok: false,
        statusCode: null
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
