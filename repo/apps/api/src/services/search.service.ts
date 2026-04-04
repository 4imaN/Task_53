import type { FastifyInstance } from 'fastify';
import { AccessControlService, type SearchAccessScope } from './access-control.service.js';
import type { AuthenticatedUser } from '../types/fastify.js';
import { withTransaction } from '../utils/db.js';

type SearchFilters = {
  item?: string;
  lot?: string;
  warehouseId?: string;
  documentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
};

const SORT_COLUMNS: Record<string, string> = {
  itemName: 'item_name',
  sku: 'sku',
  warehouse: 'warehouse_name',
  lot: 'lot_code',
  documentStatus: 'document_status',
  updatedAt: 'updated_at'
};

const normalizeDateUpperBound = (rawDateTo: string) => {
  const normalizedDateTo = /^\d{4}-\d{2}-\d{2}$/.test(rawDateTo)
    ? new Date(`${rawDateTo}T00:00:00.000Z`)
    : new Date(rawDateTo);

  if (Number.isNaN(normalizedDateTo.getTime())) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDateTo)) {
    normalizedDateTo.setUTCDate(normalizedDateTo.getUTCDate() + 1);
    return { operator: '<', value: normalizedDateTo.toISOString() };
  }

  return { operator: '<=', value: normalizedDateTo.toISOString() };
};

export const buildSearchQuery = (scope: SearchAccessScope, filters: SearchFilters) => {
  const values: unknown[] = [];
  const conditions: string[] = ['i.deleted_at IS NULL'];
  const documentFilters: string[] = [];

  if (filters.item) {
    values.push(`%${filters.item}%`);
    conditions.push(`
      (
        i.name ILIKE $${values.length}
        OR i.sku ILIKE $${values.length}
        OR EXISTS (
          SELECT 1
          FROM barcodes barcode_filter
          WHERE barcode_filter.item_id = i.id
            AND barcode_filter.barcode ILIKE $${values.length}
        )
      )
    `);
  }
  if (filters.lot) {
    values.push(`%${filters.lot}%`);
    conditions.push(`l.lot_code ILIKE $${values.length}`);
  }
  if (filters.warehouseId) {
    values.push(filters.warehouseId);
    conditions.push(`w.id = $${values.length}`);
  }
  if (filters.documentStatus) {
    values.push(filters.documentStatus);
    documentFilters.push(`d.status = $${values.length}`);
  }
  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    documentFilters.push(`COALESCE(d.updated_at, d.created_at) >= $${values.length}`);
  }
  if (filters.dateTo) {
    const upperBound = normalizeDateUpperBound(filters.dateTo.trim());
    if (upperBound) {
      values.push(upperBound.value);
      documentFilters.push(`COALESCE(d.updated_at, d.created_at) ${upperBound.operator} $${values.length}`);
    }
  }
  if (!scope.global) {
    const scopeConditions: string[] = [];

    if (scope.warehouseIds.length) {
      values.push(scope.warehouseIds);
      scopeConditions.push(`w.id = ANY($${values.length}::uuid[])`);
    }

    if (scope.departmentIds.length) {
      values.push(scope.departmentIds);
      scopeConditions.push(`i.department_id = ANY($${values.length}::uuid[])`);
    }

    if (!scopeConditions.length) {
      conditions.push('1 = 0');
    } else {
      conditions.push(`(${scopeConditions.join(' OR ')})`);
    }
  }

  if (documentFilters.length) {
    conditions.push('doc_view.document_id IS NOT NULL');
  }

  const page = Math.max(filters.page ?? 1, 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 100);
  const sortColumn = SORT_COLUMNS[filters.sortBy ?? 'updatedAt'] ?? SORT_COLUMNS.updatedAt;
  const sortDirection = filters.sortDir === 'asc' ? 'ASC' : 'DESC';

  values.push(pageSize, (page - 1) * pageSize);
  const limitIndex = values.length - 1;
  const offsetIndex = values.length;
  const documentFilterSql = documentFilters.length ? `AND ${documentFilters.join(' AND ')}` : '';

  return {
    page,
    pageSize,
    values,
    query: `
      WITH barcode_rollup AS (
        SELECT
          b.item_id,
          MIN(b.barcode) AS display_barcode
        FROM barcodes b
        GROUP BY b.item_id
      ),
      search_rows AS (
        SELECT
          i.id AS item_id,
          i.name AS item_name,
          i.sku,
          barcode_rollup.display_barcode AS barcode,
          l.id AS lot_id,
          l.lot_code,
          l.quantity_on_hand,
          w.id AS warehouse_id,
          w.name AS warehouse_name,
          doc_view.status AS document_status,
          COALESCE(doc_view.document_timestamp, l.created_at, i.created_at) AS updated_at
        FROM items i
        LEFT JOIN barcode_rollup ON barcode_rollup.item_id = i.id
        LEFT JOIN lots l ON l.item_id = i.id
        LEFT JOIN warehouses w ON w.id = l.warehouse_id
        LEFT JOIN LATERAL (
          SELECT
            d.id AS document_id,
            d.status,
            COALESCE(d.updated_at, d.created_at) AS document_timestamp
          FROM inventory_transactions it
          JOIN documents d ON d.id = it.document_id
          WHERE it.item_id = i.id
            AND (l.id IS NULL OR it.lot_id = l.id)
            AND (w.id IS NULL OR it.warehouse_id = w.id)
            ${documentFilterSql}
          ORDER BY COALESCE(d.updated_at, d.created_at) DESC, d.id DESC
          LIMIT 1
        ) doc_view ON TRUE
        WHERE ${conditions.join(' AND ')}
      )
      SELECT
        item_id,
        item_name,
        sku,
        barcode,
        lot_id,
        lot_code,
        quantity_on_hand,
        warehouse_id,
        warehouse_name,
        document_status,
        updated_at,
        COUNT(*) OVER() AS total_count
      FROM search_rows
      ORDER BY ${sortColumn} ${sortDirection} NULLS LAST,
               item_name ASC,
               sku ASC,
               warehouse_name ASC NULLS LAST,
               lot_code ASC NULLS LAST,
               item_id ASC,
               COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) ASC,
               COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid) ASC
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
    `
  };
};

const searchError = (statusCode: number, message: string, name = 'Error') => Object.assign(new Error(message), {
  statusCode,
  name
});

export class SearchService {
  private readonly accessControl: AccessControlService;

  constructor(private readonly fastify: FastifyInstance) {
    this.accessControl = new AccessControlService(fastify);
  }

  async search(user: AuthenticatedUser, filters: SearchFilters) {
    const scope = await this.accessControl.getSearchScope(user);
    const { query, values, page, pageSize } = buildSearchQuery(scope, filters);
    const result = await this.fastify.db.query(query, values);
    const total = result.rowCount ? Number(result.rows[0].total_count) : 0;

    return {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      results: result.rows
    };
  }

  async listSavedViews(userId: string) {
    const result = await this.fastify.db.query(
      `SELECT id, view_name, filters, created_at FROM saved_views WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows;
  }

  async saveView(userId: string, viewName: string, filters: Record<string, unknown>) {
    return withTransaction(this.fastify.db, async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [userId]);

      const existingResult = await client.query<{ id: string; view_name: string; filters: Record<string, unknown>; created_at: string }>(
        `
          SELECT id, view_name, filters, created_at
          FROM saved_views
          WHERE user_id = $1 AND view_name = $2
        `,
        [userId, viewName]
      );

      if (existingResult.rowCount) {
        const updateResult = await client.query(
          `
            UPDATE saved_views
            SET filters = $3::jsonb
            WHERE user_id = $1 AND view_name = $2
            RETURNING id, view_name, filters, created_at
          `,
          [userId, viewName, JSON.stringify(filters)]
        );

        return {
          operation: 'updated' as const,
          savedView: updateResult.rows[0]
        };
      }

      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM saved_views WHERE user_id = $1`,
        [userId]
      );

      if (Number(countResult.rows[0]?.count ?? 0) >= 50) {
        throw searchError(
          409,
          'Saved view limit reached. Update an existing view or delete one before creating another.',
          'Conflict'
        );
      }

      const insertResult = await client.query(
        `
          INSERT INTO saved_views (user_id, view_name, filters)
          VALUES ($1, $2, $3::jsonb)
          RETURNING id, view_name, filters, created_at
        `,
        [userId, viewName, JSON.stringify(filters)]
      );

      return {
        operation: 'created' as const,
        savedView: insertResult.rows[0]
      };
    });
  }
}
