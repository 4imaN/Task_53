import { describe, expect, it, vi } from 'vitest';
import { BulkImportService } from '../src/services/bulk-import.service.js';

const createService = () => {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM departments')) {
      return { rows: [{ code: 'SCH-OPS' }] };
    }

    if (sql.includes('FROM items')) {
      return { rows: [{ sku: 'SKU-1001' }] };
    }

    if (sql.includes('FROM barcodes')) {
      return { rows: [{ barcode: '123456789012' }] };
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
    expect(result.rows[0].message).toContain('Duplicate SKU');
    expect(result.rows[0].message).toContain('Duplicate barcode');
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
