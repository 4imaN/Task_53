import type { FastifyInstance } from 'fastify';
import * as XLSX from 'xlsx';
import type { AuthenticatedUser } from '../types/fastify.js';

type ParsedRow = {
  rowNumber: number;
  values: Record<string, string>;
};

type RowOutcome = {
  rowNumber: number;
  outcome: 'valid' | 'warning' | 'error';
  message: string;
  payload: Record<string, unknown>;
};

type PrecheckSummary = {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
};

type PrecheckResponse = {
  summary: PrecheckSummary;
  rows: RowOutcome[];
};

type BulkTemplate = {
  body: Buffer | string;
  contentType: string;
  filename: string;
};

type FilePayload = {
  filename: string;
  content?: string;
  contentBase64?: string;
};

type DepartmentScope = {
  ids: string[] | null;
  codes: Set<string>;
};

const REQUIRED_HEADERS = ['department_code', 'sku', 'name', 'unit_of_measure', 'temperature_band', 'barcode'];
const ALLOWED_UNITS = new Set(['each', 'box', 'case', 'pallet']);
const ALLOWED_TEMPERATURES = new Set(['ambient', 'chilled', 'frozen']);
const NUMERIC_FIELDS = ['weight_lbs', 'length_in', 'width_in', 'height_in'];
const bulkError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

export class BulkImportService {
  constructor(private readonly fastify: FastifyInstance) {}

  async template(format: 'csv' | 'xlsx' = 'csv'): Promise<BulkTemplate> {
    const rows = [
      'department_code,sku,name,description,unit_of_measure,temperature_band,barcode,weight_lbs,length_in,width_in,height_in',
      'district-ops,SKU-2001,Clear Bin,Polycarbonate classroom supply bin,each,ambient,998877665544,2.50,18,12,8'
    ];

    if (format === 'xlsx') {
      const worksheet = XLSX.utils.aoa_to_sheet(rows.map((row) => row.split(',')));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'CatalogItems');

      return {
        body: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: 'catalog-items-template.xlsx'
      };
    }

    return {
      body: rows.join('\n'),
      contentType: 'text/csv; charset=utf-8',
      filename: 'catalog-items-template.csv'
    };
  }

  async exportCatalogItems(format: 'csv' | 'xlsx' = 'csv', allowedDepartmentIds: string[] | null = null): Promise<BulkTemplate> {
    const headers = ['department_code', 'sku', 'name', 'description', 'unit_of_measure', 'temperature_band', 'barcode', 'weight_lbs', 'length_in', 'width_in', 'height_in'];

    if (allowedDepartmentIds !== null && !allowedDepartmentIds.length) {
      if (format === 'xlsx') {
        const worksheet = XLSX.utils.aoa_to_sheet([headers]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'CatalogExport');
        return {
          body: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          filename: 'catalog-items-export.xlsx'
        };
      }

      return {
        body: `${headers.join(',')}\n`,
        contentType: 'text/csv; charset=utf-8',
        filename: 'catalog-items-export.csv'
      };
    }

    const result = await this.fastify.db.query<{
      department_code: string;
      sku: string;
      name: string;
      description: string | null;
      unit_of_measure: string;
      temperature_band: string;
      barcode: string | null;
      weight_lbs: string;
      length_in: string;
      width_in: string;
      height_in: string;
    }>(
      `
        SELECT
          d.code AS department_code,
          i.sku,
          i.name,
          i.description,
          i.unit_of_measure,
          i.temperature_band,
          MIN(b.barcode) AS barcode,
          i.weight_lbs::text,
          i.length_in::text,
          i.width_in::text,
          i.height_in::text
        FROM items i
        JOIN departments d ON d.id = i.department_id
        LEFT JOIN barcodes b ON b.item_id = i.id
        WHERE i.deleted_at IS NULL
          AND ($1::uuid[] IS NULL OR i.department_id = ANY($1::uuid[]))
        GROUP BY d.code, i.id
        ORDER BY i.sku ASC
      `,
      [allowedDepartmentIds]
    );

    const rows = result.rows.map((row) => headers.map((header) => row[header as keyof typeof row] ?? ''));

    if (format === 'xlsx') {
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'CatalogExport');

      return {
        body: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: 'catalog-items-export.xlsx'
      };
    }

    const csv = [headers.join(','), ...rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))].join('\n');
    return {
      body: csv,
      contentType: 'text/csv; charset=utf-8',
      filename: 'catalog-items-export.csv'
    };
  }

  async precheckCatalogItems(file: FilePayload, allowedDepartmentIds: string[] | null = null): Promise<PrecheckResponse> {
    const departmentScope = await this.resolveDepartmentScope(allowedDepartmentIds);
    const parsedRows = this.parseFile(file);
    const rows = await this.validateCatalogRows(parsedRows, departmentScope);

    return {
      summary: this.summarize(rows),
      rows
    };
  }

  async importCatalogItems(userId: string, file: FilePayload, allowedDepartmentIds: string[] | null = null) {
    const precheck = await this.precheckCatalogItems(file, allowedDepartmentIds);
    const jobDepartmentIds = await this.resolveDepartmentIdsForRows(precheck.rows, allowedDepartmentIds);

    if (precheck.summary.errorRows > 0) {
      const failedJobId = await this.recordBatchJob({
        createdBy: userId,
        filename: file.filename,
        status: 'failed',
        summary: precheck.summary,
        rows: precheck.rows,
        departmentIds: jobDepartmentIds
      });

      return {
        jobId: failedJobId,
        status: 'failed',
        ...precheck
      };
    }

    const client = await this.fastify.db.connect();
    try {
      await client.query('BEGIN');
      const batchJobResult = await client.query<{ id: string }>(
        `
          INSERT INTO batch_jobs (job_type, entity_type, created_by, filename, status, summary, department_ids)
          VALUES ('import', 'catalog_item', $1, $2, 'processing', $3::jsonb, $4::uuid[])
          RETURNING id
        `,
        [userId, file.filename, JSON.stringify(precheck.summary), jobDepartmentIds]
      );
      const batchJobId = batchJobResult.rows[0].id;

      for (const row of precheck.rows) {
        const payload = row.payload as Record<string, string>;
        const itemResult = await client.query<{ id: string }>(
          `
            INSERT INTO items (
              department_id,
              sku,
              name,
              description,
              unit_of_measure,
              weight_lbs,
              length_in,
              width_in,
              height_in,
              temperature_band
            )
            SELECT
              d.id,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9,
              $10
            FROM departments d
            WHERE LOWER(d.code) = LOWER($1)
              AND ($11::uuid[] IS NULL OR d.id = ANY($11::uuid[]))
            ON CONFLICT (sku) DO NOTHING
            RETURNING id
          `,
          [
            payload.department_code,
            payload.sku,
            payload.name,
            payload.description || null,
            payload.unit_of_measure,
            Number(payload.weight_lbs ?? 0),
            Number(payload.length_in ?? 0),
            Number(payload.width_in ?? 0),
            Number(payload.height_in ?? 0),
            payload.temperature_band,
            allowedDepartmentIds
          ]
        );

        if (!itemResult.rowCount) {
          throw bulkError(422, `Row ${row.rowNumber} conflicts with an existing item or is outside your department scope`);
        }

        const barcodeResult = await client.query<{ id: string }>(
          `
            INSERT INTO barcodes (item_id, barcode)
            VALUES ($1, $2)
            ON CONFLICT (barcode) DO NOTHING
            RETURNING id
          `,
          [itemResult.rows[0].id, payload.barcode]
        );

        if (!barcodeResult.rowCount) {
          throw bulkError(422, `Row ${row.rowNumber} conflicts with an existing barcode`);
        }

        await client.query(
          `
            INSERT INTO batch_job_results (batch_job_id, row_number, outcome, message, payload)
            VALUES ($1, $2, $3, $4, $5::jsonb)
          `,
          [batchJobId, row.rowNumber, 'imported', 'Item imported successfully', JSON.stringify(row.payload)]
        );
      }

      await client.query(
        `
          UPDATE batch_jobs
          SET status = 'completed',
              summary = $2::jsonb
          WHERE id = $1
        `,
        [
          batchJobId,
          JSON.stringify({
            ...precheck.summary,
            importedRows: precheck.summary.validRows + precheck.summary.warningRows
          })
        ]
      );
      await client.query('COMMIT');

      return {
        jobId: batchJobId,
        status: 'completed',
        ...precheck
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listJobsForUser(user: AuthenticatedUser, allowedDepartmentIds: string[] | null) {
    const values: unknown[] = [];
    const scopeClause = this.buildJobScopeClause(user, allowedDepartmentIds, values);
    const result = await this.fastify.db.query(
      `
        SELECT
          b.id,
          b.job_type,
          b.entity_type,
          b.filename,
          b.status,
          b.summary,
          b.created_at,
          u.display_name AS created_by_name
        FROM batch_jobs b
        LEFT JOIN users u ON u.id = b.created_by
        WHERE ${scopeClause}
        ORDER BY b.created_at DESC
        LIMIT 20
      `,
      values
    );

    return result.rows;
  }

  async jobResultsForUser(user: AuthenticatedUser, jobId: string, allowedDepartmentIds: string[] | null) {
    const accessValues: unknown[] = [jobId];
    const scopeClause = this.buildJobScopeClause(user, allowedDepartmentIds, accessValues, 'b');
    const accessResult = await this.fastify.db.query(
      `
        SELECT b.id
        FROM batch_jobs b
        WHERE b.id = $1
          AND ${scopeClause}
      `,
      accessValues
    );

    if (!accessResult.rowCount) {
      throw bulkError(404, 'Batch job not found');
    }

    const result = await this.fastify.db.query(
      `
        SELECT row_number, outcome, message, payload, created_at
        FROM batch_job_results
        WHERE batch_job_id = $1
        ORDER BY row_number ASC
      `,
      [jobId]
    );

    return result.rows;
  }

  private async recordBatchJob(input: {
    createdBy: string;
    filename: string;
    status: string;
    summary: PrecheckSummary;
    rows: RowOutcome[];
    departmentIds: string[];
  }) {
    const batchJobResult = await this.fastify.db.query<{ id: string }>(
      `
        INSERT INTO batch_jobs (job_type, entity_type, created_by, filename, status, summary, department_ids)
        VALUES ('import', 'catalog_item', $1, $2, $3, $4::jsonb, $5::uuid[])
        RETURNING id
      `,
      [input.createdBy, input.filename, input.status, JSON.stringify(input.summary), input.departmentIds]
    );

    const batchJobId = batchJobResult.rows[0].id;
    for (const row of input.rows) {
      await this.fastify.db.query(
        `
          INSERT INTO batch_job_results (batch_job_id, row_number, outcome, message, payload)
          VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        [batchJobId, row.rowNumber, row.outcome, row.message, JSON.stringify(row.payload)]
      );
    }

    return batchJobId;
  }

  private async validateCatalogRows(parsedRows: ParsedRow[], departmentScope: DepartmentScope): Promise<RowOutcome[]> {
    if (!parsedRows.length) {
      return [];
    }

    const departmentResult = await this.fastify.db.query<{ code: string }>(
      `
        SELECT code
        FROM departments
        WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
      `,
      [departmentScope.ids]
    );
    const existingItemsResult = await this.fastify.db.query<{ sku: string }>(
      `
        SELECT sku
        FROM items
        WHERE deleted_at IS NULL
          AND ($1::uuid[] IS NULL OR department_id = ANY($1::uuid[]))
      `,
      [departmentScope.ids]
    );
    const existingBarcodesResult = await this.fastify.db.query<{ barcode: string }>(
      `
        SELECT b.barcode
        FROM barcodes b
        JOIN items i ON i.id = b.item_id
        WHERE i.deleted_at IS NULL
          AND ($1::uuid[] IS NULL OR i.department_id = ANY($1::uuid[]))
      `,
      [departmentScope.ids]
    );

    const departmentCodes = new Set(departmentResult.rows.map((row) => row.code.toLowerCase()));
    const existingSkus = new Set(existingItemsResult.rows.map((row) => row.sku.toLowerCase()));
    const existingBarcodes = new Set(existingBarcodesResult.rows.map((row) => row.barcode));
    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();

    return parsedRows.map((row) => {
      const normalized = this.normalizeRow(row.values);
      const messages: string[] = [];
      let outcome: RowOutcome['outcome'] = 'valid';

      for (const header of REQUIRED_HEADERS) {
        if (!normalized[header]) {
          outcome = 'error';
          messages.push(`Missing required field ${header}`);
        }
      }

      if (normalized.department_code && !departmentCodes.has(normalized.department_code.toLowerCase())) {
        outcome = 'error';
        messages.push(
          departmentScope.ids === null
            ? 'Unknown department code'
            : 'Department code is invalid or outside your access scope'
        );
      }

      if (normalized.unit_of_measure && !ALLOWED_UNITS.has(normalized.unit_of_measure)) {
        outcome = 'error';
        messages.push('Invalid unit of measure');
      }

      if (normalized.temperature_band && !ALLOWED_TEMPERATURES.has(normalized.temperature_band)) {
        outcome = 'error';
        messages.push('Invalid temperature band');
      }

      for (const field of NUMERIC_FIELDS) {
        const raw = normalized[field];
        if (!raw) {
          normalized[field] = '0';
          continue;
        }

        const numeric = Number(raw);
        if (!Number.isFinite(numeric) || numeric < 0) {
          outcome = 'error';
          messages.push(`Invalid numeric value for ${field}`);
        } else {
          normalized[field] = numeric.toFixed(2);
        }
      }

      const skuKey = normalized.sku.toLowerCase();
      if (normalized.sku) {
        if (seenSkus.has(skuKey) || existingSkus.has(skuKey)) {
          outcome = 'error';
          messages.push('Duplicate SKU');
        }
        seenSkus.add(skuKey);
      }

      if (normalized.barcode) {
        if (seenBarcodes.has(normalized.barcode) || existingBarcodes.has(normalized.barcode)) {
          outcome = 'error';
          messages.push('Duplicate barcode');
        }
        seenBarcodes.add(normalized.barcode);
      }

      if (!normalized.description) {
        if (outcome === 'valid') {
          outcome = 'warning';
        }
        messages.push('Description is blank and will remain empty');
      }

      return {
        rowNumber: row.rowNumber,
        outcome,
        message: messages.join('; ') || 'Ready for import',
        payload: normalized
      };
    });
  }

  private summarize(rows: RowOutcome[]): PrecheckSummary {
    return rows.reduce<PrecheckSummary>((summary, row) => {
      summary.totalRows += 1;
      if (row.outcome === 'error') {
        summary.errorRows += 1;
      } else if (row.outcome === 'warning') {
        summary.warningRows += 1;
      } else {
        summary.validRows += 1;
      }

      return summary;
    }, {
      totalRows: 0,
      validRows: 0,
      warningRows: 0,
      errorRows: 0
    });
  }

  private normalizeRow(values: Record<string, string>) {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      normalized[key] = value.trim();
    }

    if (normalized.sku) {
      normalized.sku = normalized.sku.toUpperCase();
    }

    if (normalized.name) {
      normalized.name = values.name?.trim() ?? '';
    }

    if (normalized.unit_of_measure) {
      normalized.unit_of_measure = normalized.unit_of_measure.toLowerCase();
    }

    if (normalized.temperature_band) {
      normalized.temperature_band = normalized.temperature_band.toLowerCase();
    }

    return normalized;
  }

  private parseFile(file: FilePayload): ParsedRow[] {
    const buffer = this.decodeFilePayload(file);

    if (file.filename.toLowerCase().endsWith('.xlsx')) {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(worksheet, {
        header: 1,
        raw: false,
        blankrows: false
      });

      if (rows.length < 2) {
        return [];
      }

      const headers = rows[0].map((value) => String(value ?? '').trim());
      this.assertHeaders(headers);

      return rows.slice(1).map((row, index) => ({
        rowNumber: index + 2,
        values: headers.reduce<Record<string, string>>((acc, header, cellIndex) => {
          acc[header] = String(row[cellIndex] ?? '');
          return acc;
        }, {})
      }));
    }

    return this.parseCsv(buffer.toString('utf8'));
  }

  private parseCsv(content: string): ParsedRow[] {
    const lines = content
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return [];
    }

    const headers = this.splitCsvLine(lines[0]).map((value) => value.trim());
    this.assertHeaders(headers);

    return lines.slice(1).map((line, index) => {
      const cells = this.splitCsvLine(line);
      const values = headers.reduce<Record<string, string>>((acc, header, cellIndex) => {
        acc[header] = cells[cellIndex] ?? '';
        return acc;
      }, {});

      return {
        rowNumber: index + 2,
        values
      };
    });
  }

  private splitCsvLine(line: string) {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];

      if (character === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (character === ',' && !inQuotes) {
        cells.push(current);
        current = '';
        continue;
      }

      current += character;
    }

    cells.push(current);
    return cells;
  }

  private assertHeaders(headers: string[]) {
    for (const header of REQUIRED_HEADERS) {
      if (!headers.includes(header)) {
        const error = new Error(`Template is missing required header ${header}`) as Error & { statusCode?: number };
        error.statusCode = 422;
        throw error;
      }
    }
  }

  private decodeFilePayload(file: FilePayload) {
    if (file.contentBase64) {
      return Buffer.from(file.contentBase64, 'base64');
    }

    if (typeof file.content === 'string') {
      return Buffer.from(file.content, 'utf8');
    }

    const error = new Error('File content is required') as Error & { statusCode?: number };
    error.statusCode = 422;
    throw error;
  }

  private async resolveDepartmentScope(allowedDepartmentIds: string[] | null): Promise<DepartmentScope> {
    const normalizedIds = allowedDepartmentIds === null
      ? null
      : Array.from(new Set(allowedDepartmentIds.map((entry) => String(entry).trim()).filter(Boolean)));

    const result = await this.fastify.db.query<{ code: string }>(
      `
        SELECT code
        FROM departments
        WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
      `,
      [normalizedIds]
    );

    return {
      ids: normalizedIds,
      codes: new Set(result.rows.map((row) => row.code.toLowerCase()))
    };
  }

  private async resolveDepartmentIdsForRows(rows: RowOutcome[], allowedDepartmentIds: string[] | null) {
    const departmentCodes = Array.from(new Set(
      rows
        .map((row) => String((row.payload as Record<string, unknown>).department_code ?? '').trim().toLowerCase())
        .filter(Boolean)
    ));

    if (!departmentCodes.length) {
      return [] as string[];
    }

    const result = await this.fastify.db.query<{ id: string }>(
      `
        SELECT id::text
        FROM departments
        WHERE LOWER(code) = ANY($1::text[])
          AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))
      `,
      [departmentCodes, allowedDepartmentIds]
    );

    return result.rows.map((row) => row.id);
  }

  private buildJobScopeClause(
    user: AuthenticatedUser,
    allowedDepartmentIds: string[] | null,
    values: unknown[],
    alias = 'b'
  ) {
    if (user.roleCodes.includes('administrator') || user.roleCodes.includes('manager')) {
      return 'TRUE';
    }

    values.push(user.id);
    const ownerIndex = values.length;
    if (allowedDepartmentIds && allowedDepartmentIds.length) {
      values.push(allowedDepartmentIds);
      return `(${alias}.created_by = $${ownerIndex} OR ${alias}.department_ids && $${values.length}::uuid[])`;
    }

    return `${alias}.created_by = $${ownerIndex}`;
  }
}
