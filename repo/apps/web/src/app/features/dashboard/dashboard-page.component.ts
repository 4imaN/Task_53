import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ApiService, MetricSummaryRow } from '../../core/services/api.service';

type DashboardMetricCard = {
  label: string;
  value: string;
  delta: string;
};

type DashboardFeedItem = {
  title: string;
  detail: string;
  time: string;
};

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Manager Snapshot</p>
        <h2>Throughput and compliance at a glance</h2>
      </div>
      <div class="button-row">
        <span class="pill">Nightly batch 02:00</span>
        <button class="secondary-button" type="button" [disabled]="loading" (click)="reload()">{{ loading ? 'Refreshing...' : 'Refresh' }}</button>
      </div>
    </section>

    <div class="inline-status" *ngIf="loading">Refreshing nightly operational summaries.</div>
    <div class="inline-status error-status" *ngIf="errorMessage">
      <strong>Metrics unavailable</strong>
      <p>{{ errorMessage }}</p>
      <button class="secondary-button" type="button" [disabled]="loading" (click)="reload()">Retry</button>
    </div>

    <section class="metric-grid" *ngIf="!errorMessage">
      <article class="panel metric-card" *ngFor="let metric of metrics">
        <p class="eyebrow">{{ metric.label }}</p>
        <strong>{{ metric.value }}</strong>
        <span>{{ metric.delta }}</span>
      </article>
    </section>

    <section class="two-column" *ngIf="!errorMessage; else dashboardEmptyOrError">
      <article class="panel">
        <div class="section-title">
          <h3>Latest metrics records</h3>
          <span class="pill">API-backed</span>
        </div>
        <div class="timeline-row" *ngFor="let event of feed">
          <span class="timeline-mark"></span>
          <div>
            <strong>{{ event.title }}</strong>
            <p>{{ event.detail }}</p>
          </div>
          <small>{{ event.time }}</small>
        </div>
        <p class="supporting" *ngIf="!feed.length">No nightly metric rows are stored yet.</p>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>Compliance focus</h3>
          <span class="pill pill-warning">SLA watch</span>
        </div>
        <div class="gauge-block">
          <div class="gauge-ring">{{ compliancePct }}%</div>
          <div>
            <strong>Resolved within target</strong>
            <p>{{ complianceDetail }}</p>
          </div>
        </div>
      </article>
    </section>

    <ng-template #dashboardEmptyOrError>
      <section class="panel" *ngIf="!loading && !errorMessage">
        <p class="supporting">Nightly metrics will appear here after the scheduler writes operational summaries.</p>
      </section>
    </ng-template>
  `
})
export class DashboardPageComponent implements OnInit {
  private readonly api = inject(ApiService);

  metrics: DashboardMetricCard[] = [
    { label: 'Latest metrics', value: '0', delta: 'No records yet' },
    { label: 'Put-away samples', value: '0', delta: 'Awaiting nightly job' },
    { label: 'Pick accuracy', value: '0%', delta: 'Awaiting nightly job' },
    { label: 'Review SLA', value: '0%', delta: 'Awaiting nightly job' }
  ];
  feed: DashboardFeedItem[] = [];
  compliancePct = '0';
  complianceDetail = 'Nightly metrics will appear here after the scheduled job writes operational summaries.';
  loading = false;
  errorMessage = '';

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    try {
      this.loading = true;
      this.errorMessage = '';
      const rows = await this.api.metrics();
      this.applyRows(rows);
    } catch (error) {
      this.errorMessage = this.toMessage(error);
      this.metrics = [
        { label: 'Latest metrics', value: '0', delta: 'Unavailable' },
        { label: 'Put-away samples', value: '0', delta: 'Unavailable' },
        { label: 'Pick accuracy', value: '0%', delta: 'Unavailable' },
        { label: 'Review SLA', value: '0%', delta: 'Unavailable' }
      ];
      this.feed = [];
      this.compliancePct = '0';
      this.complianceDetail = 'Metrics could not be loaded.';
    } finally {
      this.loading = false;
    }
  }

  private applyRows(rows: MetricSummaryRow[]) {
    const putAway = rows.filter((row) => row.metric_type === 'put_away_time');
    const pickAccuracy = rows.filter((row) => row.metric_type === 'pick_accuracy');
    const reviewSla = rows.filter((row) => row.metric_type === 'review_resolution_sla');

    this.metrics = [
      { label: 'Latest metrics', value: String(rows.length), delta: rows.length ? 'Operational batch data loaded' : 'No records yet' },
      { label: 'Put-away samples', value: String(putAway.length), delta: putAway[0] ? `Latest ${Number(putAway[0].metric_value).toFixed(2)}` : 'Awaiting nightly job' },
      { label: 'Pick accuracy', value: pickAccuracy[0] ? `${Number(pickAccuracy[0].metric_value).toFixed(2)}%` : '0%', delta: pickAccuracy.length ? 'Latest stored accuracy' : 'Awaiting nightly job' },
      { label: 'Review SLA', value: reviewSla[0] ? `${Number(reviewSla[0].metric_value).toFixed(2)}%` : '0%', delta: reviewSla.length ? 'Latest stored compliance' : 'Awaiting nightly job' }
    ];

    this.feed = rows.slice(0, 5).map((row) => ({
      title: row.metric_type,
      detail: `Warehouse ${row.warehouse_id ?? 'global'} · value ${Number(row.metric_value).toFixed(2)}`,
      time: new Date(row.period_end).toLocaleDateString()
    }));

    if (reviewSla[0]) {
      this.compliancePct = Number(reviewSla[0].metric_value).toFixed(0);
      this.complianceDetail = `Latest review resolution SLA result recorded for period ending ${new Date(reviewSla[0].period_end).toLocaleDateString()}.`;
      return;
    }

    this.compliancePct = '0';
    this.complianceDetail = 'Nightly metrics will appear here after the scheduled job writes operational summaries.';
  }

  private toMessage(error: unknown) {
    if (typeof error === 'object' && error && 'error' in error) {
      return (error as { error?: { message?: string } }).error?.message ?? 'Metrics request failed';
    }

    return 'Metrics request failed';
  }
}
