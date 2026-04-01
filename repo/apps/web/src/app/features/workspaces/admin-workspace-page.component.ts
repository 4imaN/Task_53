import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-admin-workspace-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Administrator Workspace</p>
        <h2>Control access, audit, and system-wide governance</h2>
      </div>
      <span class="pill">Full authority</span>
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
          <h3>Admin control points</h3>
          <span class="pill">Restricted</span>
        </div>
        <div class="tab-strip">
          <a class="tab" routerLink="/users">Users</a>
          <a class="tab" routerLink="/audit">Audit log</a>
          <a class="tab" routerLink="/admin">RBAC</a>
          <a class="tab" routerLink="/warehouse">Warehouse setup</a>
        </div>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>Oversight posture</h3>
          <span class="pill">{{ auditHeadline }}</span>
        </div>
        <p class="supporting">{{ summary }}</p>
      </article>
    </section>
  `
})
export class AdminWorkspacePageComponent implements OnInit {
  private readonly api = inject(ApiService);

  metrics = [
    { label: 'Users', value: '0', detail: 'Seeded operators and administrators' },
    { label: 'Sessions', value: '0', detail: 'Revocable active sessions' },
    { label: 'Recent audit events', value: '0', detail: 'Immutable log window' },
    { label: 'Locked accounts', value: '0', detail: 'Accounts requiring intervention' }
  ];
  auditHeadline = 'Audit ready';
  summary = 'Administrative visibility is scoped to account control, audit review, and warehouse governance.';

  async ngOnInit() {
    const [usersResult, sessionsResult, auditResult] = await Promise.allSettled([
      this.api.users(),
      this.api.sessions(),
      this.api.auditLog(20)
    ]);

    const users = usersResult.status === 'fulfilled' ? usersResult.value : [];
    const sessions = sessionsResult.status === 'fulfilled' ? sessionsResult.value : [];
    const audit = auditResult.status === 'fulfilled' ? auditResult.value : [];
    const lockedUsers = users.filter((user: any) => Boolean(user.locked_until)).length;

    this.metrics = [
      { label: 'Users', value: String(users.length), detail: 'Accounts provisioned in the system' },
      { label: 'Sessions', value: String(sessions.length), detail: 'Current revocable sessions' },
      { label: 'Recent audit events', value: String(audit.length), detail: 'Latest immutable entries' },
      { label: 'Locked accounts', value: String(lockedUsers), detail: 'Manual unlock required' }
    ];

    this.auditHeadline = audit.length ? `${audit.length} recent events` : 'No recent events';
    this.summary = lockedUsers
      ? `${lockedUsers} user account(s) are currently locked. Review account posture from the Users workspace.`
      : 'No locked accounts currently require administrative intervention.';
  }
}
