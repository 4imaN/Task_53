import type { FastifyInstance } from 'fastify';
import type { AuthenticatedUser } from '../types/fastify.js';

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
  itemName: 'i.name',
  sku: 'i.sku',
  warehouse: 'w.name',
  lot: 'l.lot_code',
  documentStatus: 'doc_view.status',
  updatedAt: 'COALESCE(doc_view.document_timestamp, l.created_at, i.created_at)'
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

export const buildSearchQuery = (user: AuthenticatedUser, filters: SearchFilters) => {
  const values: unknown[] = [];
  const conditions: string[] = ['i.deleted_at IS NULL'];
  const documentFilters: string[] = [];

  if (filters.item) {
    values.push(`%${filters.item}%`);
    conditions.push(`(i.name ILIKE $${values.length} OR i.sku ILIKE $${values.length} OR b.barcode ILIKE $${values.length})`);
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
  if (!user.roleCodes.includes('administrator') && !user.roleCodes.includes('manager')) {
    if (!user.assignedWarehouseIds.length) {
      conditions.push('1 = 0');
    } else {
      values.push(user.assignedWarehouseIds);
      conditions.push(`w.id = ANY($${values.length}::uuid[])`);
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
      SELECT
        i.id AS item_id,
        i.name AS item_name,
        i.sku,
        b.barcode,
        l.id AS lot_id,
        l.lot_code,
        l.quantity_on_hand,
        w.id AS warehouse_id,
        w.name AS warehouse_name,
        doc_view.status AS document_status,
        COALESCE(doc_view.document_timestamp, l.created_at, i.created_at) AS updated_at,
        COUNT(*) OVER() AS total_count
      FROM items i
      LEFT JOIN barcodes b ON b.item_id = i.id
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
      ORDER BY ${sortColumn} ${sortDirection}, i.name ASC
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
    `
  };
};

export class SearchService {
  constructor(private readonly fastify: FastifyInstance) {}

  async search(user: AuthenticatedUser, filters: SearchFilters) {
    const { query, values, page, pageSize } = buildSearchQuery(user, filters);
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
    const countResult = await this.fastify.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM saved_views WHERE user_id = $1`,
      [userId]
    );

    if (Number(countResult.rows[0]?.count ?? 0) >= 50) {
      throw new Error('Saved view limit reached');
    }

    const result = await this.fastify.db.query(
      `
        INSERT INTO saved_views (user_id, view_name, filters)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (user_id, view_name)
        DO UPDATE SET filters = EXCLUDED.filters
        RETURNING id, view_name, filters, created_at
      `,
      [userId, viewName, JSON.stringify(filters)]
    );

    return result.rows[0];
  }
}
