import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { SessionStore } from '../../core/auth/session.store';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Administration</p>
        <h2>Control center for access, visibility, and compliance</h2>
      </div>
      <button class="primary-button" type="button" [disabled]="loading || busy" (click)="reload()">{{ loading ? 'Refreshing...' : 'Refresh' }}</button>
    </section>

    <div class="inline-status" *ngIf="loading">Refreshing administrative data.</div>
    <div class="inline-status error-status" *ngIf="errorMessage">{{ errorMessage }}</div>

    <section class="metric-grid">
      <article class="panel metric-card">
        <p class="eyebrow">Users</p>
        <strong>{{ users.length }}</strong>
        <span>Local accounts in the system</span>
      </article>
      <article class="panel metric-card">
        <p class="eyebrow">Sessions</p>
        <strong>{{ sessions.length }}</strong>
        <span>Currently active server-side sessions</span>
      </article>
      <article class="panel metric-card">
        <p class="eyebrow">Locked</p>
        <strong>{{ lockedUsers() }}</strong>
        <span>Accounts requiring unlock</span>
      </article>
      <article class="panel metric-card">
        <p class="eyebrow">Audit</p>
        <strong>{{ audit.length }}</strong>
        <span>Recent immutable log records loaded</span>
      </article>
    </section>

    <section class="two-column">
      <article class="panel">
        <div class="section-title">
          <h3>Current operator</h3>
          <span class="pill">{{ session.user()?.primaryRole }}</span>
        </div>
        <div class="detail-grid">
          <div><span>Display name</span><strong>{{ session.user()?.displayName }}</strong></div>
          <div><span>Username</span><strong>{{ session.user()?.username }}</strong></div>
          <div><span>Roles</span><strong>{{ (session.user()?.roleCodes || []).join(', ') }}</strong></div>
          <div><span>Permissions</span><strong>{{ (session.user()?.permissionCodes || []).length }}</strong></div>
        </div>

        <div class="section-title catalog-section-gap">
          <h3>Admin surfaces</h3>
          <span class="pill">Routes</span>
        </div>
        <div class="tab-strip">
          <a routerLink="/users" class="tab">Users</a>
          <a routerLink="/audit" class="tab">Audit Log</a>
          <a routerLink="/profile" class="tab">Profile</a>
        </div>

        <div class="section-title catalog-section-gap">
          <h3>Users</h3>
          <span class="pill">{{ users.length }}</span>
        </div>
        <div class="list-row" *ngFor="let user of users">
          <div>
            <strong>{{ user.display_name }}</strong>
            <p>{{ user.roles.join(', ') }} · {{ user.warehouses.join(', ') || 'no warehouse scope' }}</p>
          </div>
          <div class="button-row">
            <small>{{ user.locked_until ? 'locked' : 'active' }}</small>
            <button class="secondary-button" type="button" *ngIf="user.locked_until" [disabled]="busy || loading" (click)="unlock(user.id)">Unlock</button>
          </div>
        </div>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>Active sessions</h3>
          <span class="pill">{{ sessions.length }}</span>
        </div>
        <div class="list-row" *ngFor="let item of sessions">
          <div>
            <strong>{{ item.rotation_reason || 'login' }}</strong>
            <p>{{ item.ip_address || 'local' }} · {{ item.user_agent || 'browser' }}</p>
          </div>
          <small>{{ item.created_at | date:'short' }}</small>
        </div>

        <div class="section-title catalog-section-gap">
          <h3>Recent audit</h3>
          <span class="pill">{{ audit.length }}</span>
        </div>
        <div class="timeline-row" *ngFor="let entry of audit">
          <span class="timeline-mark"></span>
          <div>
            <strong>{{ entry.action_type }}</strong>
            <p>{{ entry.resource_type }} · {{ entry.ip_address || 'local' }}</p>
          </div>
          <small>{{ entry.timestamp | date:'short' }}</small>
        </div>
      </article>
    </section>
  `
})
export class AdminPageComponent implements OnInit {
  readonly session = inject(SessionStore);
  private readonly api = inject(ApiService);

  sessions: any[] = [];
  users: any[] = [];
  audit: any[] = [];
  loading = false;
  busy = false;
  errorMessage = '';

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    try {
      this.loading = true;
      this.errorMessage = '';
      const [sessions, users, audit] = await Promise.all([
        this.api.sessions(),
        this.api.users(),
        this.api.auditLog(15)
      ]);

      this.sessions = sessions;
      this.users = users;
      this.audit = audit;
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.loading = false;
    }
  }

  async unlock(userId: string) {
    try {
      this.busy = true;
      await this.api.unlockUser(userId);
      await this.reload();
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.busy = false;
    }
  }

  lockedUsers() {
    return this.users.filter((user) => Boolean(user.locked_until)).length;
  }

  private toMessage(error: unknown) {
    if (typeof error === 'object' && error && 'error' in error) {
      return (error as { error?: { message?: string } }).error?.message ?? 'Administrative request failed';
    }

    return 'Administrative request failed';
  }
}
