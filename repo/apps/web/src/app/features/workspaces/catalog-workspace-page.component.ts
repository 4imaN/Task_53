import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-catalog-workspace-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Catalog Editor Workspace</p>
        <h2>Maintain item content, reviews, questions, and import quality</h2>
      </div>
      <span class="pill">Content operations</span>
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
          <h3>Catalog actions</h3>
          <span class="pill">Editorial</span>
        </div>
        <div class="tab-strip">
          <a class="tab" routerLink="/catalog">Catalog</a>
          <a class="tab" routerLink="/bulk">Bulk import</a>
          <a class="tab" routerLink="/search">Search</a>
          <a class="tab" routerLink="/inbox">Inbox</a>
        </div>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>Content posture</h3>
          <span class="pill">{{ statusBadge }}</span>
        </div>
        <p class="supporting">{{ summary }}</p>
      </article>
    </section>
  `
})
export class CatalogWorkspacePageComponent implements OnInit {
  private readonly api = inject(ApiService);

  metrics = [
    { label: 'Catalog items', value: '0', detail: 'Items visible for content work' },
    { label: 'Bulk jobs', value: '0', detail: 'Historical import/export runs' },
    { label: 'Inbox updates', value: '0', detail: 'Reporter and workflow notices' },
    { label: 'Saved views', value: '0', detail: 'Reusable search filters' }
  ];
  statusBadge = 'Editorial';
  summary = 'Catalog editor access is focused on product content, Q&A response, and bulk content maintenance.';

  async ngOnInit() {
    const [itemsResult, jobsResult, inboxResult, viewsResult] = await Promise.allSettled([
      this.api.catalogItems(),
      this.api.bulkJobs(),
      this.api.inbox(),
      this.api.savedViews()
    ]);

    const items = itemsResult.status === 'fulfilled' ? itemsResult.value : [];
    const jobs = jobsResult.status === 'fulfilled' ? jobsResult.value : [];
    const inbox = inboxResult.status === 'fulfilled' ? inboxResult.value : [];
    const views = viewsResult.status === 'fulfilled' ? viewsResult.value : [];

    this.metrics = [
      { label: 'Catalog items', value: String(items.length), detail: 'Items currently loaded' },
      { label: 'Bulk jobs', value: String(jobs.length), detail: 'Import/export jobs on record' },
      { label: 'Inbox updates', value: String(inbox.length), detail: 'Current notifications' },
      { label: 'Saved views', value: String(views.length), detail: 'Personal search views' }
    ];

    this.statusBadge = items.length ? `${items.length} items loaded` : 'No catalog items';
    this.summary = items.length
      ? 'Catalog workspaces are limited to content, questions, reviews, and bulk editorial maintenance.'
      : 'No catalog items are currently available in this environment.';
  }
}
