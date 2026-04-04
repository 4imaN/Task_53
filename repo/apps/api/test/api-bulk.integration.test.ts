import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { createIntegrationHarness, loginAsAdmin, loginAsUser, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;
const canonicalTemperatureBands = ['ambient', 'chilled', 'frozen'] as const;
const parseCsvRow = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('"')) {
    return trimmed.split(',').map((entry) => entry.trim());
  }

  const withoutQuotes = trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed;

  return withoutQuotes
    .split('","')
    .map((entry) => entry.replace(/""/g, '"'));
};

describeIfIntegration('bulk API integration', () => {
  const harness = createIntegrationHarness();

  const createScopedCatalogUser = async (
    server: ReturnType<typeof createIntegrationHarness>['server'],
    departmentId: string
  ) => {
    const username = `bulk_scope_${randomUUID().slice(0, 8)}`;
    const password = 'ScopedBulk!123';
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const roleResult = await server.db.query<{ id: string }>(
      `SELECT id FROM roles WHERE code = 'catalog_editor'`
    );
    const userResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO users (username, display_name, password_hash, password_history)
        VALUES ($1, $2, $3, '[]'::jsonb)
        RETURNING id
      `,
      [username, username, passwordHash]
    );
    const userId = userResult.rows[0].id;

    await server.db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [
      userId,
      roleResult.rows[0].id
    ]);
    await server.db.query(
      `
        INSERT INTO attribute_rules (user_id, resource_type, resource_id, rule_type, metadata)
        VALUES ($1, 'department', $2, 'access', '{}'::jsonb)
      `,
      [userId, departmentId]
    );

    return {
      userId,
      username,
      password,
      cleanup: async () => {
        await server.db.query(`DELETE FROM attribute_rules WHERE user_id = $1`, [userId]);
        await server.db.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
        await server.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
      }
    };
  };

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

  it('preserves a durable failed batch job when import work rolls back after precheck', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = Date.now().toString().slice(-6);
    const sku = `SKU-ROLLBACK-${suffix}`;
    const conflictingSku = `SKU-CONFLICT-${suffix}`;
    const barcode = `44${suffix}2211`;
    const filename = `rollback-${suffix}.csv`;
    const csv = [
      'department_code,sku,name,description,unit_of_measure,temperature_band,barcode,weight_lbs,length_in,width_in,height_in',
      `district-ops,${sku},Rollback Fixture,For durable failed job coverage,each,ambient,${barcode},1,12,8,6`
    ].join('\n');
    const triggerSuffix = Date.now().toString().replace(/\D/g, '');
    const functionName = `test_item_import_delay_${triggerSuffix}`;
    const triggerName = `test_item_import_delay_trigger_${triggerSuffix}`;
    const departmentResult = await server.db.query<{ id: string }>(
      `SELECT id FROM departments WHERE code = 'district-ops' LIMIT 1`
    );
    let jobId = '';
    let competingItemId = '';

    try {
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
      expect((precheckResponse.json() as { summary: { errorRows: number } }).summary.errorRows).toBe(0);

      await server.db.query(
        `
          CREATE FUNCTION ${functionName}()
          RETURNS trigger
          LANGUAGE plpgsql
          AS $$
          BEGIN
            IF NEW.sku = '${sku}' THEN
              PERFORM pg_sleep(0.5);
            END IF;
            RETURN NEW;
          END;
          $$
        `
      );
      await server.db.query(
        `
          CREATE TRIGGER ${triggerName}
          BEFORE INSERT ON items
          FOR EACH ROW
          EXECUTE FUNCTION ${functionName}()
        `
      );

      const importPromise = server.inject({
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

      await new Promise((resolve) => setTimeout(resolve, 150));

      const competingItemResult = await server.db.query<{ id: string }>(
        `
          INSERT INTO items (
            department_id,
            sku,
            name,
            description,
            unit_of_measure,
            temperature_band,
            weight_lbs,
            length_in,
            width_in,
            height_in
          )
          VALUES ($1, $2, 'Competing Barcode Fixture', 'Introduced after precheck', 'each', 'ambient', 1, 1, 1, 1)
          RETURNING id
        `,
        [departmentResult.rows[0].id, conflictingSku]
      );
      competingItemId = competingItemResult.rows[0].id;
      await server.db.query(
        `INSERT INTO barcodes (item_id, barcode) VALUES ($1, $2)`,
        [competingItemId, barcode]
      );

      const importResponse = await importPromise;
      expect(importResponse.statusCode).toBe(422);
      const importBody = importResponse.json() as {
        message: string;
      };
      expect(importBody.message).toContain('Row 2 Barcode conflicts with an existing catalog record');
      const failedJobLookup = await server.db.query<{ id: string }>(
        `
          SELECT id
          FROM batch_jobs
          WHERE filename = $1
            AND status = 'failed'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [filename]
      );
      expect(failedJobLookup.rowCount).toBe(1);
      jobId = failedJobLookup.rows[0].id;

      const importedItemResult = await server.db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM items WHERE sku = $1`,
        [sku]
      );
      expect(Number(importedItemResult.rows[0].count)).toBe(0);

      const jobResult = await server.db.query<{ status: string; summary: Record<string, unknown> }>(
        `
          SELECT status, summary
          FROM batch_jobs
          WHERE id = $1
        `,
        [jobId]
      );
      expect(jobResult.rowCount).toBe(1);
      expect(jobResult.rows[0].status).toBe('failed');
      expect(jobResult.rows[0].summary).toMatchObject({
        failedRow: 2,
        errorMessage: 'Row 2 Barcode conflicts with an existing catalog record'
      });

      const resultsResponse = await server.inject({
        method: 'GET',
        url: `/api/bulk/jobs/${jobId}/results`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(resultsResponse.statusCode).toBe(200);
      expect(resultsResponse.json()).toEqual([
        expect.objectContaining({
          row_number: 2,
          outcome: 'error',
          message: 'Row 2 Barcode conflicts with an existing catalog record'
        })
      ]);
    } finally {
      await server.db.query(`DROP TRIGGER IF EXISTS ${triggerName} ON items`);
      await server.db.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
      if (jobId) {
        await server.db.query(`DELETE FROM batch_jobs WHERE id = $1`, [jobId]);
      }
      if (competingItemId) {
        await server.db.query(`DELETE FROM barcodes WHERE item_id = $1`, [competingItemId]);
        await server.db.query(`DELETE FROM items WHERE id = $1`, [competingItemId]);
      }
      await server.db.query(`DELETE FROM barcodes WHERE barcode = $1`, [barcode]);
      await server.db.query(`DELETE FROM items WHERE sku = $1`, [sku]);
    }
  });

  it('keeps seeded bins and items on the canonical temperature taxonomy', async () => {
    const server = harness.server;
    const invalidBandResult = await server.db.query<{ invalid_count: string }>(
      `
        SELECT (
          SELECT COUNT(*) FROM items WHERE temperature_band NOT IN ('ambient', 'chilled', 'frozen')
        ) + (
          SELECT COUNT(*) FROM bins WHERE temperature_band NOT IN ('ambient', 'chilled', 'frozen')
        ) AS invalid_count
      `
    );

    expect(Number(invalidBandResult.rows[0].invalid_count)).toBe(0);
  });

  it('keeps export -> precheck -> import temperature taxonomy consistent across all canonical values', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const departmentResult = await server.db.query<{ id: string; code: string }>(
      `SELECT id, code FROM departments WHERE code = 'district-ops' LIMIT 1`
    );
    const department = departmentResult.rows[0];
    const suffix = Date.now().toString().slice(-7);
    const sourceSkus = canonicalTemperatureBands.map((band) => `TEMP-SRC-${band.toUpperCase()}-${suffix}`);
    const importedSkus: string[] = [];
    const importBarcodes: string[] = [];
    let importedJobId = '';

    try {
      for (const [index, band] of canonicalTemperatureBands.entries()) {
        const sku = sourceSkus[index];
        const barcode = `98${suffix}${index}${Math.floor(Math.random() * 9_999_999).toString().padStart(7, '0')}`.slice(0, 12);
        const itemResult = await server.db.query<{ id: string }>(
          `
            INSERT INTO items (department_id, sku, name, description, unit_of_measure, temperature_band, weight_lbs, length_in, width_in, height_in)
            VALUES ($1, $2, $3, $4, 'each', $5, 1, 1, 1, 1)
            RETURNING id
          `,
          [department.id, sku, `Temp ${band}`, `Seed ${band}`, band]
        );
        await server.db.query(`INSERT INTO barcodes (item_id, barcode) VALUES ($1, $2)`, [itemResult.rows[0].id, barcode]);
      }

      const exportResponse = await server.inject({
        method: 'GET',
        url: '/api/bulk/catalog-items/export?format=csv',
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(exportResponse.statusCode).toBe(200);
      const csvLines = exportResponse.body
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      expect(csvLines.length).toBeGreaterThan(1);
      const headers = parseCsvRow(csvLines[0]);
      const temperatureIndex = headers.indexOf('temperature_band');
      const skuIndex = headers.indexOf('sku');
      const barcodeIndex = headers.indexOf('barcode');
      expect(temperatureIndex).toBeGreaterThan(-1);
      expect(skuIndex).toBeGreaterThan(-1);
      expect(barcodeIndex).toBeGreaterThan(-1);

      const sourceRows = csvLines
        .slice(1)
        .map((line) => parseCsvRow(line))
        .filter((row) => sourceSkus.includes(row[skuIndex]));
      expect(sourceRows).toHaveLength(canonicalTemperatureBands.length);
      expect(new Set(sourceRows.map((row) => row[temperatureIndex]))).toEqual(new Set(canonicalTemperatureBands));

      const importRows = sourceRows.map((row, index) => {
        const nextSku = `TEMP-DST-${canonicalTemperatureBands[index].toUpperCase()}-${suffix}`;
        const nextBarcode = `97${suffix}${index}${Math.floor(Math.random() * 9_999_999).toString().padStart(7, '0')}`.slice(0, 12);
        importedSkus.push(nextSku);
        importBarcodes.push(nextBarcode);
        row[skuIndex] = nextSku;
        row[barcodeIndex] = nextBarcode;
        return row;
      });
      const importCsv = [
        headers.join(','),
        ...importRows.map((row) => row.join(','))
      ].join('\n');

      const precheckResponse = await server.inject({
        method: 'POST',
        url: '/api/bulk/catalog-items/precheck',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          filename: `temp-roundtrip-${suffix}.csv`,
          content: importCsv
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
          filename: `temp-roundtrip-${suffix}.csv`,
          content: importCsv
        }
      });
      expect(importResponse.statusCode).toBe(200);
      const imported = importResponse.json() as { jobId: string; status: string };
      importedJobId = imported.jobId;
      expect(imported.status).toBe('completed');

      const importedResult = await server.db.query<{ sku: string; temperature_band: string }>(
        `
          SELECT sku, temperature_band
          FROM items
          WHERE sku = ANY($1::text[])
        `,
        [importedSkus]
      );
      expect(importedResult.rowCount).toBe(canonicalTemperatureBands.length);
      expect(new Set(importedResult.rows.map((row) => row.temperature_band))).toEqual(new Set(canonicalTemperatureBands));
    } finally {
      if (importedJobId) {
        await server.db.query(`DELETE FROM batch_jobs WHERE id = $1`, [importedJobId]);
      }
      if (importBarcodes.length) {
        await server.db.query(`DELETE FROM barcodes WHERE barcode = ANY($1::text[])`, [importBarcodes]);
      }
      if (importedSkus.length) {
        await server.db.query(`DELETE FROM items WHERE sku = ANY($1::text[])`, [importedSkus]);
      }
      if (sourceSkus.length) {
        await server.db.query(
          `DELETE FROM barcodes WHERE item_id IN (SELECT id FROM items WHERE sku = ANY($1::text[]))`,
          [sourceSkus]
        );
        await server.db.query(`DELETE FROM items WHERE sku = ANY($1::text[])`, [sourceSkus]);
      }
    }
  });

  it('normalizes legacy cold temperature values during precheck and import', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = Date.now().toString().slice(-7);
    const sku = `TEMP-LEGACY-${suffix}`;
    const barcode = `96${suffix}${Math.floor(Math.random() * 9_999_999).toString().padStart(7, '0')}`.slice(0, 12);
    let jobId = '';

    try {
      const csv = [
        'department_code,sku,name,description,unit_of_measure,temperature_band,barcode,weight_lbs,length_in,width_in,height_in',
        `district-ops,${sku},Legacy Cold Item,Legacy alias normalization,each,cold,${barcode},1,1,1,1`
      ].join('\n');

      const precheckResponse = await server.inject({
        method: 'POST',
        url: '/api/bulk/catalog-items/precheck',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          filename: 'legacy-cold.csv',
          content: csv
        }
      });

      expect(precheckResponse.statusCode).toBe(200);
      const precheck = precheckResponse.json() as {
        summary: { warningRows: number; errorRows: number };
        rows: Array<{ message: string; payload: { temperature_band: string } }>;
      };
      expect(precheck.summary.errorRows).toBe(0);
      expect(precheck.summary.warningRows).toBe(1);
      expect(precheck.rows[0].message).toContain("normalized to 'chilled'");
      expect(precheck.rows[0].payload.temperature_band).toBe('chilled');

      const importResponse = await server.inject({
        method: 'POST',
        url: '/api/bulk/catalog-items/import',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          filename: 'legacy-cold.csv',
          content: csv
        }
      });
      expect(importResponse.statusCode).toBe(200);
      const imported = importResponse.json() as { jobId: string; status: string };
      jobId = imported.jobId;
      expect(imported.status).toBe('completed');

      const itemResult = await server.db.query<{ temperature_band: string }>(
        `SELECT temperature_band FROM items WHERE sku = $1`,
        [sku]
      );
      expect(itemResult.rows[0].temperature_band).toBe('chilled');
    } finally {
      if (jobId) {
        await server.db.query(`DELETE FROM batch_jobs WHERE id = $1`, [jobId]);
      }
      await server.db.query(`DELETE FROM barcodes WHERE barcode = $1`, [barcode]);
      await server.db.query(`DELETE FROM items WHERE sku = $1`, [sku]);
    }
  });

  it('keeps warehouse setup temperature options aligned with bulk validators', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const optionsResponse = await server.inject({
      method: 'GET',
      url: '/api/warehouse-setup/options',
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    expect(optionsResponse.statusCode).toBe(200);
    const options = optionsResponse.json() as { temperatureBands: string[] };
    expect(options.temperatureBands).toEqual(canonicalTemperatureBands);

    const suffix = Date.now().toString().slice(-7);
    const rows = options.temperatureBands.map((band, index) => {
      const sku = `TEMP-OPT-${index}-${suffix}`;
      const barcode = `95${suffix}${index}${Math.floor(Math.random() * 9_999_999).toString().padStart(7, '0')}`.slice(0, 12);
      return `district-ops,${sku},Temp Option ${band},Option alignment test,each,${band},${barcode},1,1,1,1`;
    });
    const csv = [
      'department_code,sku,name,description,unit_of_measure,temperature_band,barcode,weight_lbs,length_in,width_in,height_in',
      ...rows
    ].join('\n');

    const precheckResponse = await server.inject({
      method: 'POST',
      url: '/api/bulk/catalog-items/precheck',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        filename: `temp-options-${suffix}.csv`,
        content: csv
      }
    });
    expect(precheckResponse.statusCode).toBe(200);
    const precheck = precheckResponse.json() as { summary: { errorRows: number } };
    expect(precheck.summary.errorRows).toBe(0);
  });

  it('surfaces global SKU and barcode conflicts even when they are outside the caller scope', async () => {
    const server = harness.server;
    const departmentSeed = await server.db.query<{ id: string; code: string }>(
      `
        SELECT id, code
        FROM departments
        ORDER BY code ASC
        LIMIT 2
      `
    );
    expect(departmentSeed.rowCount).toBe(2);
    const accessibleDepartment = departmentSeed.rows[0];
    const restrictedDepartment = departmentSeed.rows[1];
    const restrictedSku = `GLOBAL-CONFLICT-SKU-${Date.now()}`;
    const restrictedBarcode = `66${Date.now().toString().slice(-8)}`;
    const restrictedItem = await server.db.query<{ id: string }>(
      `
        INSERT INTO items (department_id, sku, name, description, unit_of_measure, temperature_band, weight_lbs, length_in, width_in, height_in)
        VALUES ($1, $2, 'Restricted Conflict Item', 'Restricted conflict seed', 'each', 'ambient', 0, 0, 0, 0)
        RETURNING id
      `,
      [restrictedDepartment.id, restrictedSku]
    );
    await server.db.query(
      `INSERT INTO barcodes (item_id, barcode) VALUES ($1, $2)`,
      [restrictedItem.rows[0].id, restrictedBarcode]
    );

    const scopedUser = await createScopedCatalogUser(server, accessibleDepartment.id);

    try {
      const { token } = await loginAsUser(server, scopedUser.username, scopedUser.password);
      const csv = [
        'department_code,sku,name,description,unit_of_measure,temperature_band,barcode,weight_lbs,length_in,width_in,height_in',
        `${accessibleDepartment.code},${restrictedSku},Scoped Conflict,Conflicts globally,each,ambient,${restrictedBarcode},1,1,1,1`
      ].join('\n');

      const response = await server.inject({
        method: 'POST',
        url: '/api/bulk/catalog-items/precheck',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          filename: 'scoped-conflict.csv',
          content: csv
        }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        summary: { errorRows: number };
        rows: Array<{ message: string; conflicts?: Array<{ field: string; scope: string }> }>;
      };
      expect(body.summary.errorRows).toBe(1);
      expect(body.rows[0].message).toContain('outside your accessible departments');
      expect(body.rows[0].conflicts).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'sku', scope: 'restricted' }),
        expect.objectContaining({ field: 'barcode', scope: 'restricted' })
      ]));
    } finally {
      await scopedUser.cleanup();
      await server.db.query(`DELETE FROM barcodes WHERE barcode = $1`, [restrictedBarcode]);
      await server.db.query(`DELETE FROM items WHERE sku = $1`, [restrictedSku]);
    }
  });

  it('lets a scoped user import successfully after a clean uniqueness precheck', async () => {
    const server = harness.server;
    const departmentResult = await server.db.query<{ id: string; code: string }>(
      `
        SELECT DISTINCT d.id, d.code
        FROM departments d
        JOIN items i ON i.department_id = d.id
        WHERE i.deleted_at IS NULL
        ORDER BY d.code ASC
        LIMIT 1
      `
    );
    const department = departmentResult.rows[0];
    const scopedUser = await createScopedCatalogUser(server, department.id);
    const suffix = Date.now().toString().slice(-6);
    const sku = `SCOPED-SKU-${suffix}`;
    const barcode = `55${suffix}9911`;

    try {
      const { token } = await loginAsUser(server, scopedUser.username, scopedUser.password);
      const csv = [
        'department_code,sku,name,description,unit_of_measure,temperature_band,barcode,weight_lbs,length_in,width_in,height_in',
        `${department.code},${sku},Scoped Import,Scoped user import,each,ambient,${barcode},1,1,1,1`
      ].join('\n');

      const precheckResponse = await server.inject({
        method: 'POST',
        url: '/api/bulk/catalog-items/precheck',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          filename: 'scoped-success.csv',
          content: csv
        }
      });

      expect(precheckResponse.statusCode).toBe(200);
      expect((precheckResponse.json() as { summary: { errorRows: number } }).summary.errorRows).toBe(0);

      const importResponse = await server.inject({
        method: 'POST',
        url: '/api/bulk/catalog-items/import',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          filename: 'scoped-success.csv',
          content: csv
        }
      });

      expect(importResponse.statusCode).toBe(200);
      const imported = importResponse.json() as { jobId: string; status: string };
      expect(imported.status).toBe('completed');

      await server.db.query(`DELETE FROM batch_jobs WHERE id = $1`, [imported.jobId]);
      await server.db.query(`DELETE FROM barcodes WHERE barcode = $1`, [barcode]);
      await server.db.query(`DELETE FROM items WHERE sku = $1`, [sku]);
    } finally {
      await scopedUser.cleanup();
    }
  });
});
