import type { FastifyInstance } from 'fastify';
import type { AuthenticatedUser } from '../types/fastify.js';

const GLOBAL_WAREHOUSE_ROLES = new Set(['administrator', 'manager']);
const GLOBAL_DEPARTMENT_ROLES = new Set(['administrator', 'manager']);
const WAREHOUSE_SCOPED_SEARCH_ROLES = new Set(['warehouse_clerk']);
const DEPARTMENT_SCOPED_SEARCH_ROLES = new Set(['moderator', 'catalog_editor']);

const accessError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

export type SearchAccessScope = {
  global: boolean;
  warehouseIds: string[];
  departmentIds: string[];
};

export const validateRoleScopeAssignments = (input: {
  roleCodes: string[];
  warehouseIds: string[];
  departmentIds: string[];
}) => {
  const hasWarehouseScopedRole = input.roleCodes.some((role) => WAREHOUSE_SCOPED_SEARCH_ROLES.has(role));
  if (hasWarehouseScopedRole && !input.warehouseIds.length) {
    throw accessError(422, 'Warehouse-scoped roles must be assigned at least one warehouse');
  }

  const hasDepartmentScopedRole = input.roleCodes.some((role) => DEPARTMENT_SCOPED_SEARCH_ROLES.has(role));
  if (hasDepartmentScopedRole && !input.departmentIds.length && !input.warehouseIds.length) {
    throw accessError(422, 'Moderator and catalog roles must be assigned at least one department or warehouse-backed department scope');
  }
};

export class AccessControlService {
  constructor(private readonly fastify: FastifyInstance) {}

  hasGlobalWarehouseAccess(user: AuthenticatedUser) {
    return user.roleCodes.some((role) => GLOBAL_WAREHOUSE_ROLES.has(role));
  }

  hasGlobalDepartmentAccess(user: AuthenticatedUser) {
    return user.roleCodes.some((role) => GLOBAL_DEPARTMENT_ROLES.has(role));
  }

  async getAllowedDepartmentIds(user: AuthenticatedUser): Promise<string[] | null> {
    if (this.hasGlobalDepartmentAccess(user)) {
      return null;
    }

    const departmentIds = new Set(
      user.departmentIds
        .map((departmentId) => String(departmentId).trim())
        .filter(Boolean)
    );

    if (user.assignedWarehouseIds.length) {
      const warehouseResult = await this.fastify.db.query<{ department_id: string }>(
        `
          SELECT DISTINCT department_id::text
          FROM warehouses
          WHERE id = ANY($1::uuid[])
            AND deleted_at IS NULL
        `,
        [user.assignedWarehouseIds]
      );

      for (const row of warehouseResult.rows) {
        departmentIds.add(row.department_id);
      }
    }

    return Array.from(departmentIds);
  }

  async getSearchScope(user: AuthenticatedUser): Promise<SearchAccessScope> {
    if (user.roleCodes.some((role) => GLOBAL_WAREHOUSE_ROLES.has(role) || GLOBAL_DEPARTMENT_ROLES.has(role))) {
      return {
        global: true,
        warehouseIds: [],
        departmentIds: []
      };
    }

    const warehouseIds = user.roleCodes.some((role) => WAREHOUSE_SCOPED_SEARCH_ROLES.has(role))
      ? [...new Set(user.assignedWarehouseIds.map((warehouseId) => String(warehouseId).trim()).filter(Boolean))]
      : [];

    const departmentIds = user.roleCodes.some((role) => DEPARTMENT_SCOPED_SEARCH_ROLES.has(role))
      ? (await this.getAllowedDepartmentIds(user) ?? [])
      : [];

    return {
      global: false,
      warehouseIds,
      departmentIds: [...new Set(departmentIds.map((departmentId) => String(departmentId).trim()).filter(Boolean))]
    };
  }

  ensureDepartmentAccess(user: AuthenticatedUser, departmentId: string, message = 'Department is outside your assigned scope') {
    if (this.hasGlobalDepartmentAccess(user)) {
      return;
    }

    if (!user.departmentIds.includes(departmentId)) {
      throw accessError(403, message);
    }
  }

  canAccessWarehouse(user: AuthenticatedUser, warehouseId: string | null | undefined) {
    if (!warehouseId) {
      return false;
    }

    if (this.hasGlobalWarehouseAccess(user)) {
      return true;
    }

    return user.assignedWarehouseIds.includes(warehouseId);
  }

  async getWarehouseScopeForWarehouse(warehouseId: string) {
    const result = await this.fastify.db.query<{ id: string }>(
      `
        SELECT id::text
        FROM warehouses
        WHERE id = $1
          AND deleted_at IS NULL
      `,
      [warehouseId]
    );

    if (!result.rowCount) {
      throw accessError(404, 'Warehouse not found');
    }

    return result.rows[0].id;
  }

  async ensureWarehouseAccess(user: AuthenticatedUser, warehouseId: string, message = 'Warehouse is outside your assigned scope') {
    const resolvedWarehouseId = await this.getWarehouseScopeForWarehouse(warehouseId);
    if (!this.canAccessWarehouse(user, resolvedWarehouseId)) {
      throw accessError(403, message);
    }

    return resolvedWarehouseId;
  }

  async getWarehouseScopeForBin(binId: string) {
    const result = await this.fastify.db.query<{ warehouse_id: string }>(
      `
        SELECT z.warehouse_id
        FROM bins b
        JOIN zones z ON z.id = b.zone_id
        WHERE b.id = $1
          AND b.deleted_at IS NULL
      `,
      [binId]
    );

    if (!result.rowCount) {
      throw accessError(404, 'Bin not found');
    }

    return result.rows[0].warehouse_id;
  }

  async ensureBinAccess(user: AuthenticatedUser, binId: string, message = 'Bin is outside your assigned warehouse scope') {
    const warehouseId = await this.getWarehouseScopeForBin(binId);
    await this.ensureWarehouseAccess(user, warehouseId, message);
    return warehouseId;
  }

  async getWarehouseScopeForDocument(documentId: string) {
    const result = await this.fastify.db.query<{ warehouse_id: string }>(
      `
        SELECT warehouse_id
        FROM documents
        WHERE id = $1
          AND deleted_at IS NULL
      `,
      [documentId]
    );

    if (!result.rowCount) {
      throw accessError(404, 'Document not found');
    }

    return result.rows[0].warehouse_id;
  }

  async ensureDocumentAccess(user: AuthenticatedUser, documentId: string, message = 'Document is outside your warehouse scope') {
    const warehouseId = await this.getWarehouseScopeForDocument(documentId);
    await this.ensureWarehouseAccess(user, warehouseId, message);
    return warehouseId;
  }

  async getDepartmentScopeForItem(itemId: string) {
    const result = await this.fastify.db.query<{ department_id: string }>(
      `
        SELECT department_id::text
        FROM items
        WHERE id = $1
          AND deleted_at IS NULL
      `,
      [itemId]
    );

    if (!result.rowCount) {
      throw accessError(404, 'Item not found');
    }

    return result.rows[0].department_id;
  }

  async ensureItemAccess(user: AuthenticatedUser, itemId: string, message = 'Item is outside your department scope') {
    const departmentId = await this.getDepartmentScopeForItem(itemId);
    if (this.hasGlobalDepartmentAccess(user)) {
      return;
    }

    const allowedDepartmentIds = await this.getAllowedDepartmentIds(user);
    if (!allowedDepartmentIds?.length) {
      throw accessError(403, message);
    }

    if (!allowedDepartmentIds.includes(departmentId)) {
      throw accessError(403, message);
    }
  }

  async ensureReviewAccess(user: AuthenticatedUser, reviewId: string, message = 'Review is outside your department scope') {
    const reviewResult = await this.fastify.db.query<{ department_id: string }>(
      `
        SELECT i.department_id::text AS department_id
        FROM reviews r
        JOIN items i ON i.id = r.item_id
        WHERE r.id = $1
          AND i.deleted_at IS NULL
      `,
      [reviewId]
    );

    if (!reviewResult.rowCount) {
      throw accessError(404, 'Review not found');
    }

    if (this.hasGlobalDepartmentAccess(user)) {
      return;
    }

    const allowedDepartmentIds = await this.getAllowedDepartmentIds(user);
    if (!allowedDepartmentIds?.includes(reviewResult.rows[0].department_id)) {
      throw accessError(403, message);
    }
  }

  async ensureQuestionAccess(user: AuthenticatedUser, questionId: string, message = 'Question is outside your department scope') {
    const questionResult = await this.fastify.db.query<{ department_id: string }>(
      `
        SELECT i.department_id::text AS department_id
        FROM qa_threads qt
        JOIN items i ON i.id = qt.item_id
        WHERE qt.id = $1
          AND i.deleted_at IS NULL
      `,
      [questionId]
    );

    if (!questionResult.rowCount) {
      throw accessError(404, 'Question not found');
    }

    if (this.hasGlobalDepartmentAccess(user)) {
      return;
    }

    const allowedDepartmentIds = await this.getAllowedDepartmentIds(user);
    if (!allowedDepartmentIds?.includes(questionResult.rows[0].department_id)) {
      throw accessError(403, message);
    }
  }

  async ensureReviewImageAccess(user: AuthenticatedUser, imageId: string, message = 'Image is outside your department scope') {
    const imageResult = await this.fastify.db.query<{ department_id: string }>(
      `
        SELECT i.department_id::text AS department_id
        FROM review_images ri
        JOIN reviews r ON r.id = ri.review_id
        JOIN items i ON i.id = r.item_id
        WHERE ri.id = $1
          AND i.deleted_at IS NULL
      `,
      [imageId]
    );

    if (!imageResult.rowCount) {
      throw accessError(404, 'Image not found');
    }

    if (this.hasGlobalDepartmentAccess(user)) {
      return;
    }

    const allowedDepartmentIds = await this.getAllowedDepartmentIds(user);
    if (!allowedDepartmentIds?.includes(imageResult.rows[0].department_id)) {
      throw accessError(403, message);
    }
  }

  ensureCatalogAnswerAccess(user: AuthenticatedUser) {
    const allowed = user.roleCodes.includes('administrator') || user.roleCodes.includes('catalog_editor');
    if (!allowed) {
      throw accessError(403, 'Only catalog editors and administrators can publish answers');
    }
  }
}

export const accessControlError = accessError;
