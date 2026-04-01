import type { Pool } from 'pg';

export type AuthenticatedUser = {
  id: string;
  username: string;
  displayName: string;
  authzVersion: number;
  roleCodes: string[];
  permissionCodes: string[];
  assignedWarehouseIds: string[];
  departmentIds: string[];
  sessionId: string;
};

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
    authenticate: (request: any, reply: any) => Promise<void>;
    requirePermission: (required: string | string[]) => (request: any, reply: any) => Promise<void>;
    writeAudit: (entry: {
      userId?: string | null;
      actionType: string;
      resourceType: string;
      resourceId?: string | null;
      details?: Record<string, unknown>;
      ipAddress?: string | null;
    }) => Promise<void>;
  }

  interface FastifyRequest {
    authUser?: AuthenticatedUser;
    auditContext?: {
      actionType: string;
      resourceType: string;
      resourceId?: string | null;
      details?: Record<string, unknown>;
    };
  }
}
