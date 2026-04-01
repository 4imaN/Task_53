import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, AuditEntry } from '../../core/services/api.service';

@Component({
  selector: 'app-audit-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Audit Log</p>
        <h2>Immutable operational and security events</h2>
      </div>
      <div class="button-row">
        <select class="form-input" [(ngModel)]="limit" (ngModelChange)="reload()">
          <option [ngValue]="25">25</option>
          <option [ngValue]="50">50</option>
          <option [ngValue]="100">100</option>
        </select>
        <button class="secondary-button" type="button" [disabled]="loading" (click)="reload()">{{ loading ? 'Refreshing...' : 'Refresh' }}</button>
      </div>
    </section>

    <div class="inline-status" *ngIf="loading">Refreshing immutable audit events.</div>
    <div class="inline-status error-status" *ngIf="errorMessage">
      <strong>Audit log unavailable</strong>
      <p>{{ errorMessage }}</p>
      <button class="secondary-button" type="button" [disabled]="loading" (click)="reload()">Retry</button>
    </div>

    <section class="two-column layout-tight" *ngIf="!errorMessage">
      <article class="panel">
        <div class="section-title">
          <h3>Events</h3>
          <span class="pill">{{ filteredEntries().length }}</span>
        </div>
        <div class="filter-strip">
          <input class="form-input" [(ngModel)]="query" placeholder="Filter by action, resource, IP, or details" />
        </div>

        <div class="timeline-row"
             *ngFor="let entry of filteredEntries()"
             [class.table-row-active]="selectedEntry?.timestamp === entry.timestamp && selectedEntry?.action_type === entry.action_type"
             (click)="selectedEntry = entry">
          <span class="timeline-mark"></span>
          <div>
            <strong>{{ entry.action_type }}</strong>
            <p>{{ entry.resource_type }} · {{ entry.ip_address || 'local' }}</p>
          </div>
          <small>{{ entry.timestamp | date:'short' }}</small>
        </div>
        <p class="supporting" *ngIf="!filteredEntries().length && !loading">No audit events match the current filter.</p>
      </article>

      <article class="panel" *ngIf="selectedEntry; else noAuditSelection">
        <div class="section-title">
          <div>
            <h3>{{ selectedEntry.action_type }}</h3>
            <p class="supporting catalog-section-gap">{{ selectedEntry.resource_type }} · {{ selectedEntry.resource_id || 'n/a' }}</p>
          </div>
          <span class="pill">{{ selectedEntry.timestamp | date:'short' }}</span>
        </div>

        <div class="detail-grid">
          <div><span>IP address</span><strong>{{ selectedEntry.ip_address || 'local' }}</strong></div>
          <div><span>User id</span><strong>{{ selectedEntry.user_id || 'system' }}</strong></div>
          <div><span>Resource type</span><strong>{{ selectedEntry.resource_type }}</strong></div>
          <div><span>Resource id</span><strong>{{ selectedEntry.resource_id || 'n/a' }}</strong></div>
        </div>

        <div class="section-title catalog-section-gap">
          <h3>Details payload</h3>
          <span class="pill">JSON</span>
        </div>
        <pre class="payload-block">{{ selectedEntry.details | json }}</pre>
      </article>
    </section>

    <ng-template #noAuditSelection>
      <article class="panel">
        <p class="supporting">Select an audit event to inspect the immutable payload.</p>
      </article>
    </ng-template>
  `
})
export class AuditPageComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly entries = signal<AuditEntry[]>([]);
  readonly filteredEntries = computed(() => {
    const needle = this.query.trim().toLowerCase();
    if (!needle) {
      return this.entries();
    }

    return this.entries().filter((entry) =>
      [
        entry.action_type,
        entry.resource_type,
        entry.resource_id,
        entry.ip_address,
        JSON.stringify(entry.details ?? {})
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  });

  query = '';
  limit = 50;
  selectedEntry: AuditEntry | null = null;
  loading = false;
  errorMessage = '';

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    try {
      this.loading = true;
      this.errorMessage = '';
      const entries = await this.api.auditLog(this.limit);
      this.entries.set(entries);
      this.selectedEntry = entries.find((entry) => entry.timestamp === this.selectedEntry?.timestamp && entry.action_type === this.selectedEntry?.action_type)
        ?? entries[0]
        ?? null;
    } catch (error) {
      this.entries.set([]);
      this.selectedEntry = null;
      this.errorMessage = this.toMessage(error);
    } finally {
      this.loading = false;
    }
  }

  private toMessage(error: unknown) {
    if (typeof error === 'object' && error && 'error' in error) {
      return (error as { error?: { message?: string } }).error?.message ?? 'Audit log request failed';
    }

    return 'Audit log request failed';
  }
}
