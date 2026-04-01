import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-bulk-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Bulk Processing</p>
        <h2>CSV/XLSX template, pre-check validation, guided import, and export delivery</h2>
      </div>
      <div class="button-row">
        <button class="secondary-button" type="button" [disabled]="templateBusy" (click)="downloadTemplate('csv')">{{ templateBusy ? 'Preparing...' : 'CSV Template' }}</button>
        <button class="secondary-button" type="button" [disabled]="templateBusy" (click)="downloadTemplate('xlsx')">{{ templateBusy ? 'Preparing...' : 'XLSX Template' }}</button>
      </div>
    </section>

    <div class="inline-status success" *ngIf="message">{{ message }}</div>
    <div class="inline-status error-status" *ngIf="errorMessage">{{ errorMessage }}</div>

    <section class="two-column">
      <article class="panel">
        <div class="section-title">
          <h3>Import workflow</h3>
          <span class="pill">{{ selectedFilename || 'No file selected' }}</span>
        </div>

        <section class="panel wizard-grid">
          <div class="wizard-step active">1. Template</div>
          <div class="wizard-step active">2. Upload</div>
          <div class="wizard-step" [class.active]="precheckRows.length > 0">3. Pre-check</div>
          <div class="wizard-step" [class.active]="canImport()">4. Confirm</div>
          <div class="wizard-step" [class.active]="jobResults.length > 0">5. Results</div>
        </section>

        <input type="file"
               accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
               (change)="onFileSelected($event)"
               [disabled]="precheckBusy || importBusy" />

        <div class="button-row catalog-section-gap">
          <button class="primary-button" type="button" [disabled]="!fileContentBase64 || precheckBusy || importBusy" (click)="runPrecheck()">
            {{ precheckBusy ? 'Checking...' : 'Run Pre-check' }}
          </button>
          <button class="secondary-button" type="button" [disabled]="!canImport() || importBusy || precheckBusy" (click)="confirmImport()">
            {{ importBusy ? 'Importing...' : 'Confirm Import' }}
          </button>
        </div>

        <p class="supporting" *ngIf="!selectedFilename">Choose a CSV or XLSX file to begin the guided import flow.</p>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>Export workflow</h3>
          <span class="pill">Catalog items</span>
        </div>
        <div class="detail-grid">
          <label>
            <span>Format</span>
            <select class="form-input" [(ngModel)]="exportFormat">
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX</option>
            </select>
          </label>
        </div>
        <div class="button-row catalog-section-gap">
          <button class="primary-button" type="button" [disabled]="exportBusy" (click)="runExport()">
            {{ exportBusy ? 'Exporting...' : 'Export Catalog Data' }}
          </button>
        </div>
        <p class="supporting">Exports honor the signed-in user’s allowed bulk-processing access.</p>
      </article>
    </section>

    <section class="panel" *ngIf="precheckRows.length">
      <div class="section-title">
        <h3>Pre-check results</h3>
        <span class="pill">{{ precheckSummary.totalRows }} rows</span>
      </div>
      <div class="detail-grid">
        <div><span>Valid</span><strong>{{ precheckSummary.validRows }}</strong></div>
        <div><span>Warnings</span><strong>{{ precheckSummary.warningRows }}</strong></div>
        <div><span>Errors</span><strong>{{ precheckSummary.errorRows }}</strong></div>
        <div><span>Filename</span><strong>{{ selectedFilename }}</strong></div>
      </div>
      <div class="list-row" *ngFor="let row of precheckRows">
        <div>
          <strong>{{ row.outcome | uppercase }}</strong>
          <p>{{ row.message }}</p>
        </div>
        <small>Row {{ row.rowNumber }}</small>
      </div>
    </section>

    <section class="two-column">
      <article class="panel">
        <div class="section-title">
          <h3>Recent jobs</h3>
          <span class="pill">{{ jobsBusy ? 'Loading...' : jobs.length }}</span>
        </div>
        <div class="inline-status" *ngIf="jobsBusy">Loading batch job history.</div>
        <div class="list-row" *ngFor="let job of jobs" (click)="selectJob(job.id)">
          <div>
            <strong>{{ job.filename }}</strong>
            <p>{{ job.status }} · {{ job.created_by_name || 'system' }}</p>
          </div>
          <small>{{ job.created_at | date:'short' }}</small>
        </div>
        <p class="supporting" *ngIf="!jobs.length">No import jobs recorded yet.</p>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>Selected job results</h3>
          <span class="pill">{{ jobResults.length }}</span>
        </div>
        <div class="list-row" *ngFor="let row of jobResults">
          <div>
            <strong>{{ row.outcome }}</strong>
            <p>{{ row.message }}</p>
          </div>
          <small>Row {{ row.row_number }}</small>
        </div>
        <p class="supporting" *ngIf="!jobResults.length">Choose a batch job to inspect its per-row outcome report.</p>
      </article>
    </section>
  `
})
export class BulkPageComponent implements OnInit {
  private readonly api = inject(ApiService);

  selectedFilename = '';
  fileContentBase64 = '';
  precheckSummary = { totalRows: 0, validRows: 0, warningRows: 0, errorRows: 0 };
  precheckRows: any[] = [];
  jobs: any[] = [];
  jobResults: any[] = [];
  message = '';
  errorMessage = '';
  jobsBusy = false;
  templateBusy = false;
  precheckBusy = false;
  importBusy = false;
  exportBusy = false;
  exportFormat: 'csv' | 'xlsx' = 'xlsx';

  async ngOnInit() {
    await this.loadJobs();
  }

  async downloadTemplate(format: 'csv' | 'xlsx') {
    if (this.templateBusy) {
      return;
    }

    try {
      this.templateBusy = true;
      this.errorMessage = '';
      const template = await this.api.bulkTemplateCatalogItems(format);
      this.downloadBuffer(template, `catalog-items-template.${format}`, format);
      this.message = `Template downloaded in ${format.toUpperCase()} format.`;
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.templateBusy = false;
    }
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.selectedFilename = file.name;
    this.fileContentBase64 = this.toBase64(await file.arrayBuffer());
    this.precheckRows = [];
    this.jobResults = [];
    this.precheckSummary = { totalRows: 0, validRows: 0, warningRows: 0, errorRows: 0 };
    this.message = `Loaded ${file.name}.`;
    this.errorMessage = '';
  }

  async runPrecheck() {
    if (this.precheckBusy || !this.fileContentBase64) {
      return;
    }

    try {
      this.precheckBusy = true;
      this.errorMessage = '';
      const result = await this.api.bulkPrecheckCatalogItems({
        filename: this.selectedFilename || 'catalog-items.csv',
        contentBase64: this.fileContentBase64
      });

      this.precheckSummary = result.summary;
      this.precheckRows = result.rows;
      this.message = result.summary.errorRows ? 'Pre-check found blocking errors. Fix and re-upload before importing.' : 'Pre-check passed. Import is ready.';
    } catch (error) {
      this.errorMessage = this.toMessage(error);
      this.message = '';
    } finally {
      this.precheckBusy = false;
    }
  }

  canImport() {
    return Boolean(this.fileContentBase64) && this.precheckRows.length > 0 && this.precheckSummary.errorRows === 0;
  }

  async confirmImport() {
    if (!this.canImport() || this.importBusy) {
      return;
    }

    try {
      this.importBusy = true;
      this.errorMessage = '';
      const result = await this.api.bulkImportCatalogItems({
        filename: this.selectedFilename || 'catalog-items.csv',
        contentBase64: this.fileContentBase64
      });

      this.message = result.status === 'completed'
        ? 'Import completed and stored in batch results.'
        : 'Import failed. Review the stored row outcomes.';
      this.jobResults = result.rows.map((row: any) => ({
        row_number: row.rowNumber,
        outcome: result.status === 'completed' ? 'imported' : row.outcome,
        message: row.message
      }));
      await this.loadJobs();
    } catch (error) {
      this.errorMessage = this.toMessage(error);
      this.message = '';
    } finally {
      this.importBusy = false;
    }
  }

  async runExport() {
    if (this.exportBusy) {
      return;
    }

    try {
      this.exportBusy = true;
      this.errorMessage = '';
      const exportFile = await this.api.bulkExportCatalogItems(this.exportFormat);
      this.downloadBuffer(exportFile, `catalog-items-export.${this.exportFormat}`, this.exportFormat);
      this.message = `Export completed in ${this.exportFormat.toUpperCase()} format.`;
    } catch (error) {
      this.errorMessage = this.toMessage(error);
      this.message = '';
    } finally {
      this.exportBusy = false;
    }
  }

  async loadJobs() {
    try {
      this.jobsBusy = true;
      this.jobs = await this.api.bulkJobs();
      if (this.jobs[0]) {
        await this.selectJob(this.jobs[0].id);
      }
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.jobsBusy = false;
    }
  }

  async selectJob(jobId: string) {
    try {
      this.jobResults = await this.api.bulkJobResults(jobId);
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    }
  }

  private downloadBuffer(content: ArrayBuffer, filename: string, format: 'csv' | 'xlsx') {
    const blob = new Blob([content], {
      type: format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private toBase64(buffer: ArrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (const value of bytes) {
      binary += String.fromCharCode(value);
    }

    return btoa(binary);
  }

  private toMessage(error: unknown) {
    if (typeof error === 'object' && error && 'error' in error) {
      const payload = (error as { error?: { message?: string } | ArrayBuffer }).error;
      if (payload instanceof ArrayBuffer) {
        try {
          const decoded = new TextDecoder().decode(payload);
          return JSON.parse(decoded).message ?? 'Bulk processing request failed';
        } catch {
          return 'Bulk processing request failed';
        }
      }

      return (payload as { message?: string } | undefined)?.message ?? 'Bulk processing request failed';
    }

    return 'Bulk processing request failed';
  }
}
