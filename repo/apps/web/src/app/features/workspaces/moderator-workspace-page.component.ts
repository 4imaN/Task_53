import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-moderator-workspace-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Moderator Workspace</p>
        <h2>Triaged cases, reporter-safe updates, and inbox activity</h2>
      </div>
      <span class="pill">Content safety</span>
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
          <h3>Moderator actions</h3>
          <span class="pill">Case work</span>
        </div>
        <div class="tab-strip">
          <a class="tab" routerLink="/moderation">Moderation queue</a>
          <a class="tab" routerLink="/inbox">Reporter inbox</a>
          <a class="tab" routerLink="/profile">Profile</a>
        </div>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>Case posture</h3>
          <span class="pill">{{ statusBadge }}</span>
        </div>
        <p class="supporting">{{ summary }}</p>
      </article>
    </section>
  `
})
export class ModeratorWorkspacePageComponent implements OnInit {
  private readonly api = inject(ApiService);

  metrics = [
    { label: 'Open cases', value: '0', detail: 'Reports in queue' },
    { label: 'Under review', value: '0', detail: 'Active investigations' },
    { label: 'Inbox updates', value: '0', detail: 'Reporter notifications' },
    { label: 'Resolved cases', value: '0', detail: 'Closed moderation items' }
  ];
  statusBadge = 'Ready';
  summary = 'Moderator access is isolated to report review, status publishing, and inbox follow-through.';

  async ngOnInit() {
    const [queueResult, inboxResult] = await Promise.allSettled([
      this.api.moderationQueue(),
      this.api.inbox()
    ]);

    const queue = queueResult.status === 'fulfilled' ? queueResult.value : [];
    const inbox = inboxResult.status === 'fulfilled' ? inboxResult.value : [];
    const underReview = queue.filter((item: any) => item.reporter_status === 'under_review').length;
    const resolved = queue.filter((item: any) => item.reporter_status === 'resolved').length;

    this.metrics = [
      { label: 'Open cases', value: String(queue.length), detail: 'Current moderation queue size' },
      { label: 'Under review', value: String(underReview), detail: 'Reporter-visible investigations' },
      { label: 'Inbox updates', value: String(inbox.length), detail: 'Notification records visible to you' },
      { label: 'Resolved cases', value: String(resolved), detail: 'Reporter-visible resolutions' }
    ];

    this.statusBadge = underReview ? `${underReview} investigating` : 'Queue stable';
    this.summary = queue.length
      ? `${queue.length} report(s) are currently visible in the moderation queue.`
      : 'No active reports are waiting in the queue.';
  }
}
