import { describe, expect, it } from 'vitest';
import { buildSearchQuery } from '../src/services/search.service.js';

const globalScope = {
  global: true,
  warehouseIds: [],
  departmentIds: []
};

const mixedScope = {
  global: false,
  warehouseIds: ['warehouse-1'],
  departmentIds: ['department-1']
};

describe('search query builder', () => {
  it('ties document filtering to inventory-linked documents instead of warehouse-level joins', () => {
    const { query } = buildSearchQuery(globalScope, {
      item: 'gloves',
      documentStatus: 'completed',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      sortBy: 'documentStatus',
      sortDir: 'asc'
    });

    expect(query).toContain('WITH barcode_rollup AS');
    expect(query).toContain('MIN(b.barcode) AS display_barcode');
    expect(query).toContain('OR EXISTS (');
    expect(query).toContain('FROM barcodes barcode_filter');
    expect(query).toContain('LEFT JOIN LATERAL');
    expect(query).toContain('FROM inventory_transactions it');
    expect(query).toContain('JOIN documents d ON d.id = it.document_id');
    expect(query).toContain('AND (l.id IS NULL OR it.lot_id = l.id)');
    expect(query).toContain('AND (w.id IS NULL OR it.warehouse_id = w.id)');
    expect(query).not.toContain('documents d ON d.warehouse_id = w.id');
    expect(query).not.toContain('LEFT JOIN barcodes b ON b.item_id = i.id');
    expect(query).toContain('AND d.status = $');
    expect(query).toContain('AND COALESCE(d.updated_at, d.created_at) >= $');
    expect(query).toContain('AND COALESCE(d.updated_at, d.created_at) < $');
    expect(query).toContain('doc_view.document_id IS NOT NULL');
    expect(query).toContain('ORDER BY document_status ASC NULLS LAST');
  });

  it('appends pagination values after other filter values', () => {
    const { values, page, pageSize } = buildSearchQuery(globalScope, {
      item: 'mask',
      page: 2,
      pageSize: 10
    });

    expect(page).toBe(2);
    expect(pageSize).toBe(10);
    expect(values.at(-2)).toBe(10);
    expect(values.at(-1)).toBe(10);
  });

  it('supports combined warehouse and department scope without forcing one role model onto every user', () => {
    const { query, values } = buildSearchQuery(mixedScope, {
      item: 'scope check'
    });

    expect(query).toContain('(w.id = ANY($');
    expect(query).toContain('OR i.department_id = ANY($');
    expect(values).toContain(mixedScope.warehouseIds);
    expect(values).toContain(mixedScope.departmentIds);
  });
});
