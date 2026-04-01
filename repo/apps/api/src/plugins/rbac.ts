import fp from 'fastify-plugin';

export default fp(async (fastify) => {
  fastify.decorate('requirePermission', (required: string | string[]) => {
    const requiredCodes = Array.isArray(required) ? required : [required];

    return async (request, reply) => {
      const currentUser = request.authUser;
      if (!currentUser) {
        return reply.code(401).send({ message: 'Authentication required' });
      }

      const hasAllPermissions = requiredCodes.every((code) => currentUser.permissionCodes.includes(code));
      if (!hasAllPermissions) {
        return reply.code(403).send({ message: 'Insufficient permissions' });
      }
    };
  });
});
