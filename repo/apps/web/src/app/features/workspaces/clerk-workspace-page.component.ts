import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionStore } from '../../core/auth/session.store';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-clerk-workspace-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Warehouse Clerk Workspace</p>
        <h2>Scan, receive, move, pick, and execute assigned warehouse work</h2>
      </div>
      <a class="scan-cta" routerLink="/inventory">Start scanning</a>
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
          <h3>Clerk actions</h3>
          <span class="pill">Execution</span>
        </div>
        <div class="tab-strip">
          <a class="tab" routerLink="/inventory">Inventory</a>
          <a class="tab" routerLink="/documents">Documents</a>
          <a class="tab" routerLink="/search">Search</a>
          <a class="tab" routerLink="/catalog">Catalog</a>
        </div>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>Scope</h3>
          <span class="pill">{{ scopeBadge }}</span>
        </div>
        <p class="supporting">{{ summary }}</p>
      </article>
    </section>
  `
})
export class ClerkWorkspacePageComponent implements OnInit {
  readonly session = inject(SessionStore);
  private readonly api = inject(ApiService);

  metrics = [
    { label: 'Assigned warehouses', value: '0', detail: 'Warehouse scope on this account' },
    { label: 'Visible documents', value: '0', detail: 'Documents available for execution' },
    { label: 'Saved views', value: '0', detail: 'Reusable search presets' },
    { label: 'Inbox updates', value: '0', detail: 'Operational notifications' }
  ];
  scopeBadge = 'Assigned scope';
  summary = 'Clerk access is intentionally narrow: assigned warehouses, document execution, and scan-first inventory work.';

  async ngOnInit() {
    const [documentsResult, viewsResult, inboxResult] = await Promise.allSettled([
      this.api.documents(),
      this.api.savedViews(),
      this.api.inbox()
    ]);

    const documents = documentsResult.status === 'fulfilled' ? documentsResult.value : [];
    const views = viewsResult.status === 'fulfilled' ? viewsResult.value : [];
    const inbox = inboxResult.status === 'fulfilled' ? inboxResult.value : [];
    const assignedWarehouses = this.session.user()?.assignedWarehouseIds.length ?? 0;

    this.metrics = [
      { label: 'Assigned warehouses', value: String(assignedWarehouses), detail: 'Warehouse access on this operator' },
      { label: 'Visible documents', value: String(documents.length), detail: 'Operational documents in scope' },
      { label: 'Saved views', value: String(views.length), detail: 'Personal search presets' },
      { label: 'Inbox updates', value: String(inbox.length), detail: 'Current notifications' }
    ];

    this.scopeBadge = assignedWarehouses ? `${assignedWarehouses} assigned` : 'No assignment';
    this.summary = assignedWarehouses
      ? 'This workspace only exposes the warehouses explicitly assigned to this clerk account.'
      : 'No warehouse assignment is currently attached to this clerk account.';
  }
}
