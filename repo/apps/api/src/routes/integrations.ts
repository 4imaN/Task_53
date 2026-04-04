import type { FastifyInstance } from 'fastify';
import { signPayload, timingSafeCompare } from '../utils/hmac.js';
import { IntegrationSecurityService } from '../services/integration-security.service.js';
import { IntegrationClientService } from '../services/integration-client.service.js';
import { WebhookDeliveryService } from '../services/webhook-delivery.service.js';

export const registerIntegrationRoutes = async (fastify: FastifyInstance) => {
  const integrationSecurity = new IntegrationSecurityService(fastify);
  const integrationClients = new IntegrationClientService(fastify);
  const webhookDelivery = new WebhookDeliveryService(fastify);

  fastify.post('/integrations/inventory-sync', async (request, reply) => {
    const signature = request.headers['x-omnistock-signature'];
    const clientKey = request.headers['x-omnistock-client'];
    const timestamp = request.headers['x-omnistock-timestamp'];
    const nonce = request.headers['x-omnistock-nonce'];

    if (typeof signature !== 'string' || typeof clientKey !== 'string' || typeof timestamp !== 'string') {
      return reply.code(401).send({ message: 'Missing HMAC headers' });
    }

    const client = await integrationClients.findByClientKey(clientKey);

    if (!client || !client.is_active) {
      return reply.code(401).send({ message: 'Unknown integration client' });
    }
    const requestTimestampMs = integrationSecurity.validateTimestampFreshness(timestamp);
    const rawBody = JSON.stringify(request.body ?? {});
    const canonicalPayload = `${timestamp}.${rawBody}`;
    const expectedSignature = signPayload(canonicalPayload, client.hmac_secret);

    if (!timingSafeCompare(expectedSignature, signature)) {
      return reply.code(401).send({ message: 'Invalid HMAC signature' });
    }

    if (!client.scopes.includes('inventory:write')) {
      return reply.code(403).send({ message: 'Client scope does not permit inventory sync' });
    }

    try {
      await integrationSecurity.enforceRateLimit(client);
      await integrationSecurity.assertNotReplayed(client.id, typeof nonce === 'string' && nonce.trim() ? nonce : signature, requestTimestampMs);
      const scopedDepartments = await integrationSecurity.ensureDepartmentScope(client, request.body ?? {});

      const webhookResult = client.webhook_url
        ? await webhookDelivery.deliverForClient(
          {
            id: client.id,
            client_key: clientKey,
            hmac_secret: client.hmac_secret,
            webhook_url: client.webhook_url
          },
          'inventory.sync.accepted',
          {
            allowedDepartments: scopedDepartments,
            timestamp,
            clientKey,
            payload: request.body ?? {}
          }
        )
        : null;

      request.auditContext = {
        actionType: 'integration_inventory_sync',
        resourceType: 'integration_client',
        resourceId: client.id,
        details: {
          allowedDepartments: scopedDepartments,
          timestamp,
          nonce: typeof nonce === 'string' ? nonce : null,
          webhookDeliveryStatus: webhookResult?.status ?? null
        }
      };

      return { accepted: true, allowedDepartments: scopedDepartments };
    } catch (error) {
      const handledError = error as Error & { statusCode?: number };
      return reply.code(handledError.statusCode ?? 500).send({ message: handledError.message });
    }
  });
};
