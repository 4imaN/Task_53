import { describe, expect, it, vi } from 'vitest';
import { BulkImportService } from '../src/services/bulk-import.service.js';

const createService = () => {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT code') && sql.includes('FROM departments')) {
      return { rows: [{ code: 'SCH-OPS' }] };
    }

    if (sql.includes('FROM items')) {
      return {
        rows: [{
          value: 'SKU-1001',
          department_id: 'dept-1',
          department_code: 'SCH-OPS'
        }]
      };
    }

    if (sql.includes('FROM barcodes')) {
      return {
        rows: [{
          value: '123456789012',
          department_id: 'dept-1',
          department_code: 'SCH-OPS'
        }]
      };
    }

    return { rows: [] };
  });

  const fastify = {
    db: {
      query
    }
  } as any;

  return new BulkImportService(fastify);
};

describe('BulkImportService.precheckCatalogItems', () => {
  it('flags duplicate barcodes, duplicate skus, and invalid units', async () => {
    const service = createService();
    const csv = [
      'department_code,sku,name,description,unit_of_measure,temperature_band,barcode,weight_lbs,length_in,width_in,height_in',
      'SCH-OPS,SKU-1001,Duplicate Sku,Sample,crate,ambient,123456789012,1,1,1,1'
    ].join('\n');

    const result = await service.precheckCatalogItems({
      filename: 'duplicate-check.csv',
      content: csv
    });

    expect(result.summary.errorRows).toBe(1);
    expect(result.rows[0].message).toContain('SKU conflicts with an existing catalog record');
    expect(result.rows[0].message).toContain('BARCODE conflicts with an existing catalog record');
    expect(result.rows[0].message).toContain('Invalid unit of measure');
  });

  it('marks blank descriptions as warnings when the row is otherwise valid', async () => {
    const service = createService();
    const csv = [
      'department_code,sku,name,description,unit_of_measure,temperature_band,barcode,weight_lbs,length_in,width_in,height_in',
      'SCH-OPS,SKU-2004,Warning Row,,each,ambient,998877665500,1,1,1,1'
    ].join('\n');

    const result = await service.precheckCatalogItems({
      filename: 'warning-check.csv',
      content: csv
    });

    expect(result.summary.warningRows).toBe(1);
    expect(result.rows[0].outcome).toBe('warning');
    expect(result.rows[0].message).toContain('Description is blank');
  });
});

describe('BulkImportService.exportCatalogItems', () => {
  it('normalizes legacy stored temperature aliases to canonical values in exports', async () => {
    const query = vi.fn(async () => ({
      rows: [{
        department_code: 'SCH-OPS',
        sku: 'SKU-COLD-1',
        name: 'Legacy Cold Item',
        description: 'Legacy data row',
        unit_of_measure: 'each',
        temperature_band: 'cold',
        barcode: '998877665544',
        weight_lbs: '1.00',
        length_in: '1.00',
        width_in: '1.00',
        height_in: '1.00'
      }]
    }));
    const service = new BulkImportService({ db: { query } } as any);

    const result = await service.exportCatalogItems('csv');
    const lines = String(result.body).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"chilled"');
    expect(lines[1]).not.toContain('"cold"');
  });
});
