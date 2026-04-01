import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { SessionStore } from '../../core/auth/session.store';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Profile & Access</p>
        <h2>Identity, password controls, access scope, and active sessions</h2>
      </div>
      <button class="secondary-button" type="button" [disabled]="loading || busy" (click)="reload()">{{ loading ? 'Refreshing...' : 'Refresh' }}</button>
    </section>

    <div class="inline-status" *ngIf="loading">Refreshing profile, session, and inbox state.</div>
    <div class="inline-status error-status" *ngIf="requestError">{{ requestError }}</div>

    <section class="two-column">
      <article class="panel">
        <div class="section-title">
          <div>
            <h3>{{ session.user()?.displayName }}</h3>
            <p class="supporting catalog-section-gap">{{ session.user()?.username }}</p>
          </div>
          <span class="pill">{{ session.user()?.primaryRole }}</span>
        </div>

        <div class="detail-grid">
          <div><span>Roles</span><strong>{{ (session.user()?.roleCodes || []).join(', ') }}</strong></div>
          <div><span>Permissions</span><strong>{{ (session.user()?.permissionCodes || []).length }}</strong></div>
          <div><span>Warehouse scope</span><strong>{{ warehouseScopeLabel() }}</strong></div>
          <div><span>Departments</span><strong>{{ departmentCount() }}</strong></div>
        </div>

        <div class="section-title catalog-section-gap">
          <h3>Change password</h3>
          <span class="pill">12+ chars</span>
        </div>
        <div class="filter-strip">
          <input class="form-input" [(ngModel)]="passwordForm.currentPassword" type="password" placeholder="Current password" />
          <input class="form-input" [(ngModel)]="passwordForm.newPassword" type="password" placeholder="New password" />
          <button class="primary-button" type="button" [disabled]="busy || loading" (click)="changePassword()">{{ busy ? 'Updating...' : 'Update Password' }}</button>
        </div>
        <div class="inline-status success" *ngIf="passwordMessage">{{ passwordMessage }}</div>
        <div class="inline-status error-status" *ngIf="passwordError">{{ passwordError }}</div>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>Unread inbox</h3>
          <span class="pill">{{ unreadCount }}</span>
        </div>
        <div class="list-row" *ngFor="let item of inboxPreview">
          <div>
            <strong>{{ item.title }}</strong>
            <p>{{ item.body }}</p>
          </div>
          <small>{{ item.created_at | date:'short' }}</small>
        </div>
        <p class="supporting" *ngIf="!inboxPreview.length">No current notifications.</p>
      </article>
    </section>

    <section class="panel">
      <div class="section-title">
        <h3>Active sessions</h3>
        <span class="pill">{{ sessions.length }}</span>
      </div>
      <div class="list-row" *ngFor="let item of sessions">
        <div>
          <strong>{{ item.rotation_reason || 'login' }} <span *ngIf="item.token_id === session.user()?.sid">(current)</span></strong>
          <p>{{ item.ip_address || 'local network' }} · {{ item.user_agent || 'browser session' }}</p>
        </div>
        <div class="button-row">
          <small>{{ item.created_at | date:'short' }}</small>
          <button class="secondary-button"
                  type="button"
                  *ngIf="item.token_id !== session.user()?.sid"
                  [disabled]="busy || loading"
                  (click)="revoke(item.token_id)">
            Revoke
          </button>
        </div>
      </div>
    </section>
  `
})
export class ProfilePageComponent implements OnInit {
  readonly session = inject(SessionStore);
  private readonly api = inject(ApiService);

  sessions: any[] = [];
  inboxPreview: any[] = [];
  unreadCount = 0;
  passwordForm = {
    currentPassword: '',
    newPassword: ''
  };
  passwordMessage = '';
  passwordError = '';
  requestError = '';
  loading = false;
  busy = false;

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    try {
      this.loading = true;
      this.requestError = '';
      const [sessions, inbox] = await Promise.all([
        this.api.sessions(),
        this.api.inbox()
      ]);

      this.sessions = sessions;
      this.inboxPreview = inbox.slice(0, 5);
      this.unreadCount = inbox.filter((item) => !item.read_at).length;
    } catch (error) {
      this.requestError = this.toMessage(error);
    } finally {
      this.loading = false;
    }
  }

  async changePassword() {
    this.passwordMessage = '';
    this.passwordError = '';

    if (!this.passwordForm.currentPassword || !this.passwordForm.newPassword) {
      this.passwordError = 'Enter the current and new password.';
      return;
    }

    try {
      this.busy = true;
      await this.api.changePassword(this.passwordForm);
      this.passwordForm = { currentPassword: '', newPassword: '' };
      this.passwordMessage = 'Password updated. Other sessions were rotated out by the server.';
      await this.reload();
    } catch (error) {
      this.passwordError = this.toMessage(error);
    } finally {
      this.busy = false;
    }
  }

  async revoke(sessionId: string) {
    try {
      this.busy = true;
      await this.api.revokeSession(sessionId);
      await this.reload();
    } catch (error) {
      this.requestError = this.toMessage(error);
    } finally {
      this.busy = false;
    }
  }

  warehouseScopeLabel() {
    const user = this.session.user();
    if (!user) {
      return 'none';
    }

    return user.roleCodes.some((role) => role === 'administrator' || role === 'manager')
      ? 'all warehouses'
      : `${user.assignedWarehouseIds.length} assigned`;
  }

  departmentCount() {
    return this.session.user()?.departmentIds?.length ?? 0;
  }

  private toMessage(error: unknown) {
    if (typeof error === 'object' && error && 'error' in error) {
      return (error as { error?: { message?: string } }).error?.message ?? 'Request failed';
    }

    return 'Request failed';
  }
}
