import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { createIntegrationHarness, loginAsAdmin, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

describeIfIntegration('bulk API integration', () => {
  const harness = createIntegrationHarness();

  it('prechecks and imports a valid catalog CSV payload', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = Date.now().toString().slice(-6);
    const sku = `SKU-IT-${suffix}`;
    const barcode = `88${suffix}1122`;
    const filename = `integration-${suffix}.csv`;
    const csv = [
      'department_code,sku,name,description,unit_of_measure,temperature_band,barcode,weight_lbs,length_in,width_in,height_in',
      `district-ops,${sku},Integration Bin,Created by integration test,each,ambient,${barcode},1,12,8,6`
    ].join('\n');

    const precheckResponse = await server.inject({
      method: 'POST',
      url: '/api/bulk/catalog-items/precheck',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        filename,
        contentBase64: Buffer.from(csv, 'utf8').toString('base64')
      }
    });

    expect(precheckResponse.statusCode).toBe(200);
    const precheck = precheckResponse.json() as { summary: { errorRows: number; warningRows: number } };
    expect(precheck.summary.errorRows).toBe(0);
    expect(precheck.summary.warningRows).toBe(0);

    const importResponse = await server.inject({
      method: 'POST',
      url: '/api/bulk/catalog-items/import',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        filename,
        contentBase64: Buffer.from(csv, 'utf8').toString('base64')
      }
    });

    expect(importResponse.statusCode).toBe(200);
    const imported = importResponse.json() as { jobId: string; status: string };
    expect(imported.status).toBe('completed');

    const resultsResponse = await server.inject({
      method: 'GET',
      url: `/api/bulk/jobs/${imported.jobId}/results`,
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(resultsResponse.statusCode).toBe(200);
    const rows = resultsResponse.json() as Array<{ outcome: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe('imported');

    await server.db.query(`DELETE FROM batch_jobs WHERE id = $1`, [imported.jobId]);
    await server.db.query(
      `
        DELETE FROM barcodes
        WHERE item_id IN (SELECT id FROM items WHERE sku = $1)
      `,
      [sku]
    );
    await server.db.query(`DELETE FROM items WHERE sku = $1`, [sku]);
  });

  it('prechecks and imports a valid catalog XLSX payload', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = Date.now().toString().slice(-6);
    const sku = `SKU-XLSX-${suffix}`;
    const barcode = `77${suffix}2211`;
    const filename = `integration-${suffix}.xlsx`;
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['department_code', 'sku', 'name', 'description', 'unit_of_measure', 'temperature_band', 'barcode', 'weight_lbs', 'length_in', 'width_in', 'height_in'],
      ['district-ops', sku, 'Integration XLSX Bin', 'Created by XLSX integration test', 'each', 'ambient', barcode, '1', '12', '8', '6']
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'CatalogItems');
    const xlsxBase64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

    const precheckResponse = await server.inject({
      method: 'POST',
      url: '/api/bulk/catalog-items/precheck',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        filename,
        contentBase64: xlsxBase64
      }
    });

    expect(precheckResponse.statusCode).toBe(200);
    const precheck = precheckResponse.json() as { summary: { errorRows: number; warningRows: number } };
    expect(precheck.summary.errorRows).toBe(0);
    expect(precheck.summary.warningRows).toBe(0);

    const importResponse = await server.inject({
      method: 'POST',
      url: '/api/bulk/catalog-items/import',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        filename,
        contentBase64: xlsxBase64
      }
    });

    expect(importResponse.statusCode).toBe(200);
    const imported = importResponse.json() as { jobId: string; status: string };
    expect(imported.status).toBe('completed');

    await server.db.query(`DELETE FROM batch_jobs WHERE id = $1`, [imported.jobId]);
    await server.db.query(
      `
        DELETE FROM barcodes
        WHERE item_id IN (SELECT id FROM items WHERE sku = $1)
      `,
      [sku]
    );
    await server.db.query(`DELETE FROM items WHERE sku = $1`, [sku]);
  });
});
