import fp from 'fastify-plugin';

export default fp(async (fastify) => {
  fastify.decorate('writeAudit', async ({ userId, actionType, resourceType, resourceId, details, ipAddress }) => {
    await fastify.db.query(
      `
        INSERT INTO audit_log (user_id, action_type, resource_type, resource_id, details, ip_address)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      `,
      [userId ?? null, actionType, resourceType, resourceId ?? null, JSON.stringify(details ?? {}), ipAddress ?? null]
    );
  });

  fastify.addHook('onResponse', async (request) => {
    if (!request.auditContext) {
      return;
    }

    await fastify.writeAudit({
      userId: request.authUser?.id ?? null,
      actionType: request.auditContext.actionType,
      resourceType: request.auditContext.resourceType,
      resourceId: request.auditContext.resourceId ?? null,
      details: request.auditContext.details,
      ipAddress: request.ip
    });
  });
});
