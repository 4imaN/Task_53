import { describe, expect, it } from 'vitest';
import { buildSearchQuery } from '../src/services/search.service.js';

const adminUser = {
  id: 'user-1',
  roleCodes: ['administrator'],
  assignedWarehouseIds: []
};

describe('search query builder', () => {
  it('ties document filtering to inventory-linked documents instead of warehouse-level joins', () => {
    const { query } = buildSearchQuery(adminUser as never, {
      item: 'gloves',
      documentStatus: 'completed',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      sortBy: 'documentStatus',
      sortDir: 'asc'
    });

    expect(query).toContain('LEFT JOIN LATERAL');
    expect(query).toContain('FROM inventory_transactions it');
    expect(query).toContain('JOIN documents d ON d.id = it.document_id');
    expect(query).toContain('AND (l.id IS NULL OR it.lot_id = l.id)');
    expect(query).toContain('AND (w.id IS NULL OR it.warehouse_id = w.id)');
    expect(query).not.toContain('documents d ON d.warehouse_id = w.id');
    expect(query).toContain('AND d.status = $');
    expect(query).toContain('AND COALESCE(d.updated_at, d.created_at) >= $');
    expect(query).toContain('AND COALESCE(d.updated_at, d.created_at) < $');
    expect(query).toContain('doc_view.document_id IS NOT NULL');
    expect(query).toContain('ORDER BY doc_view.status ASC');
  });

  it('appends pagination values after other filter values', () => {
    const { values, page, pageSize } = buildSearchQuery(adminUser as never, {
      item: 'mask',
      page: 2,
      pageSize: 10
    });

    expect(page).toBe(2);
    expect(pageSize).toBe(10);
    expect(values.at(-2)).toBe(10);
    expect(values.at(-1)).toBe(10);
  });
});
