import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ApiService, InboxMessage } from '../../core/services/api.service';

@Component({
  selector: 'app-inbox-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">In-App Inbox</p>
        <h2>Reporter-safe case updates and local operational notifications</h2>
      </div>
      <div class="button-row">
        <button class="secondary-button" type="button" [disabled]="loading || busy || !messages.length" (click)="markAllRead()">{{ busy ? 'Updating...' : 'Mark All Read' }}</button>
        <button class="secondary-button" type="button" [disabled]="loading || busy" (click)="reload()">{{ loading ? 'Refreshing...' : 'Refresh' }}</button>
      </div>
    </section>

    <div class="inline-status" *ngIf="loading">Refreshing inbox updates.</div>
    <div class="inline-status error-status" *ngIf="errorMessage">
      <strong>Inbox unavailable</strong>
      <p>{{ errorMessage }}</p>
      <button class="secondary-button" type="button" [disabled]="loading || busy" (click)="reload()">Retry</button>
    </div>

    <section class="stacked-grid" *ngIf="!loading && messages.length; else inboxEmptyState">
      <article class="panel message-card" *ngFor="let message of messages">
        <div class="section-title">
          <div>
            <strong>{{ message.title }}</strong>
            <p>{{ message.body }}</p>
          </div>
          <div class="button-row">
            <span class="pill" [class.pill-warning]="!message.read_at">{{ message.read_at ? 'read' : 'unread' }}</span>
            <button class="secondary-button" type="button" *ngIf="!message.read_at" [disabled]="busy || loading" (click)="markRead(message.id)">Mark Read</button>
          </div>
        </div>
        <small>{{ message.created_at | date:'short' }}</small>
      </article>
    </section>

    <ng-template #inboxEmptyState>
      <section class="panel" *ngIf="!loading && !errorMessage">
        <p class="supporting">No inbox messages are waiting. Reporter-safe updates and operational notices will appear here.</p>
      </section>
    </ng-template>
  `
})
export class InboxPageComponent implements OnInit {
  private readonly api = inject(ApiService);

  messages: InboxMessage[] = [];
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
      this.messages = await this.api.inbox();
    } catch (error) {
      this.messages = [];
      this.errorMessage = this.toMessage(error);
    } finally {
      this.loading = false;
    }
  }

  async markRead(notificationId: string) {
    try {
      this.busy = true;
      this.errorMessage = '';
      await this.api.markInboxItemRead(notificationId);
      await this.reload();
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.busy = false;
    }
  }

  async markAllRead() {
    try {
      this.busy = true;
      this.errorMessage = '';
      await this.api.markAllInboxRead();
      await this.reload();
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.busy = false;
    }
  }

  private toMessage(error: unknown) {
    if (typeof error === 'object' && error && 'error' in error) {
      return (error as { error?: { message?: string } }).error?.message ?? 'Inbox request failed';
    }

    return 'Inbox request failed';
  }
}
