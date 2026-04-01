import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-manager-workspace-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Manager Workspace</p>
        <h2>Monitor throughput, documents, and warehouse execution</h2>
      </div>
      <span class="pill">Operations lead</span>
    </section>

    <section class="metric-grid">
      <article class="panel metric-card" *ngFor="let metric of metrics">
        <p class="eyebrow">{{ metric.label }}</p>
        <strong>{{ metric.value }}</strong>
        <span>{{ metric.detail }}</span>
      </article>
    </section>

    <section class="two-column">
      <article class="panel">
        <div class="section-title">
          <h3>Manager actions</h3>
          <span class="pill">Live work</span>
        </div>
        <div class="tab-strip">
          <a class="tab" routerLink="/documents">Documents</a>
          <a class="tab" routerLink="/warehouse">Warehouse</a>
          <a class="tab" routerLink="/search">Search</a>
          <a class="tab" routerLink="/bulk">Bulk jobs</a>
        </div>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>Operational readout</h3>
          <span class="pill">{{ statusBadge }}</span>
        </div>
        <p class="supporting">{{ summary }}</p>
      </article>
    </section>
  `
})
export class ManagerWorkspacePageComponent implements OnInit {
  private readonly api = inject(ApiService);

  metrics = [
    { label: 'Metrics rows', value: '0', detail: 'Nightly KPI records' },
    { label: 'Warehouses', value: '0', detail: 'Managed facilities' },
    { label: 'Open documents', value: '0', detail: 'In-flight operational docs' },
    { label: 'Completed documents', value: '0', detail: 'Closed operational docs' }
  ];
  statusBadge = 'Monitoring';
  summary = 'Manager access is limited to oversight, approval, and warehouse governance surfaces.';

  async ngOnInit() {
    const [metricsResult, warehousesResult, documentsResult] = await Promise.allSettled([
      this.api.metrics(),
      this.api.warehouses(),
      this.api.documents()
    ]);

    const metricsRows = metricsResult.status === 'fulfilled' ? metricsResult.value : [];
    const warehouses = warehousesResult.status === 'fulfilled' ? warehousesResult.value : [];
    const documents = documentsResult.status === 'fulfilled' ? documentsResult.value : [];
    const openDocuments = documents.filter((document: any) => !['completed', 'cancelled', 'archived'].includes(document.status)).length;
    const completedDocuments = documents.filter((document: any) => document.status === 'completed').length;

    this.metrics = [
      { label: 'Metrics rows', value: String(metricsRows.length), detail: 'Latest KPI records loaded' },
      { label: 'Warehouses', value: String(warehouses.length), detail: 'Visible managed facilities' },
      { label: 'Open documents', value: String(openDocuments), detail: 'Awaiting approval or execution' },
      { label: 'Completed documents', value: String(completedDocuments), detail: 'Operational work closed out' }
    ];

    this.statusBadge = openDocuments ? `${openDocuments} active docs` : 'Clear queue';
    this.summary = openDocuments
      ? `${openDocuments} document(s) still require manager or clerk attention.`
      : 'No in-flight documents currently need intervention.';
  }
}
