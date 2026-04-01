import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-moderation-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Moderation Queue</p>
        <h2>Review abuse reports and publish reporter-safe status updates</h2>
      </div>
      <div class="button-row">
        <span class="pill pill-warning">{{ cases().length }} open cases</span>
        <button class="secondary-button" type="button" [disabled]="loading || busy" (click)="reload()">{{ loading ? 'Refreshing...' : 'Refresh' }}</button>
      </div>
    </section>

    <div class="inline-status success" *ngIf="message">{{ message }}</div>
    <div class="inline-status error-status" *ngIf="errorMessage">{{ errorMessage }}</div>

    <section class="three-column">
      <article class="panel">
        <div class="section-title">
          <h3>Queue</h3>
          <span class="pill">{{ filteredCases().length }}</span>
        </div>
        <div class="filter-strip">
          <input class="form-input" [(ngModel)]="query" placeholder="Filter by reporter, reason, type, or status" />
        </div>
        <div class="tree-children">
          <button class="tree-node"
                  type="button"
                  *ngFor="let caseItem of filteredCases()"
                  [class.active]="selectedCase?.id === caseItem.id"
                  (click)="selectedCase = caseItem">
            <div class="section-title">
              <div>
                <strong>{{ caseItem.reason }}</strong>
                <p>{{ caseItem.target_type }} · {{ caseItem.reporter_name }}</p>
              </div>
              <span class="pill">{{ caseItem.reporter_status }}</span>
            </div>
          </button>
        </div>
      </article>

      <article class="panel moderation-card" *ngIf="selectedCase; else noCaseSelected">
        <div class="section-title">
          <div>
            <p class="eyebrow">{{ selectedCase.target_type }}</p>
            <h3>{{ selectedCase.reason }}</h3>
          </div>
          <span class="pill">{{ selectedCase.reporter_status }}</span>
        </div>

        <div class="detail-grid">
          <div><span>Reporter</span><strong>{{ selectedCase.reporter_name }}</strong></div>
          <div><span>Moderation state</span><strong>{{ selectedCase.moderation_status }}</strong></div>
          <div><span>Reporter status</span><strong>{{ selectedCase.reporter_status }}</strong></div>
          <div><span>Target</span><strong>{{ selectedCase.target_type }} · {{ selectedCase.target_id }}</strong></div>
        </div>

        <label class="field-label">Internal note</label>
        <input class="form-input" [(ngModel)]="internalNotes" placeholder="Moderator-only context for this action" />

        <div class="button-row">
          <button class="secondary-button" type="button" [disabled]="busy || loading" (click)="setStatus(selectedCase, 'dismissed', 'no_action')">Dismiss</button>
          <button class="secondary-button" type="button" [disabled]="busy || loading" (click)="setStatus(selectedCase, 'under_review', 'investigating')">Investigate</button>
          <button class="primary-button" type="button" [disabled]="busy || loading" (click)="setStatus(selectedCase, 'resolved', 'closed')">{{ busy ? 'Saving...' : 'Resolve' }}</button>
        </div>

        <p class="supporting catalog-section-gap">Reporter-visible status is kept separate from internal moderation state.</p>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>Status guide</h3>
          <span class="pill">Workflow</span>
        </div>
        <div class="timeline-row">
          <span class="timeline-mark"></span>
          <div>
            <strong>Submitted</strong>
            <p>Initial report entered by a user from the catalog or Q&A surface.</p>
          </div>
        </div>
        <div class="timeline-row">
          <span class="timeline-mark"></span>
          <div>
            <strong>Under review</strong>
            <p>Moderator is actively verifying the report and gathering context.</p>
          </div>
        </div>
        <div class="timeline-row">
          <span class="timeline-mark"></span>
          <div>
            <strong>Resolved / dismissed</strong>
            <p>Final reporter-safe outcome has been pushed to the in-app inbox.</p>
          </div>
        </div>
      </article>
    </section>

    <ng-template #noCaseSelected>
      <article class="panel">
        <p class="supporting">Select a moderation case to inspect details and update the reporter status.</p>
      </article>
    </ng-template>
  `
})
export class ModerationPageComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly cases = signal<any[]>([]);
  readonly filteredCases = computed(() => {
    const needle = this.query.trim().toLowerCase();
    if (!needle) {
      return this.cases();
    }

    return this.cases().filter((caseItem) =>
      [caseItem.reason, caseItem.target_type, caseItem.reporter_name, caseItem.reporter_status, caseItem.moderation_status]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  });

  query = '';
  selectedCase: any = null;
  internalNotes = '';
  message = '';
  errorMessage = '';
  loading = false;
  busy = false;

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    try {
      this.loading = true;
      this.errorMessage = '';
      const cases = await this.api.moderationQueue();
      this.cases.set(cases);
      this.selectedCase = cases.find((caseItem) => caseItem.id === this.selectedCase?.id) ?? cases[0] ?? null;
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.loading = false;
    }
  }

  async setStatus(caseItem: any, reporterStatus: 'submitted' | 'under_review' | 'resolved' | 'dismissed', moderationStatus: 'new' | 'assigned' | 'investigating' | 'action_taken' | 'no_action' | 'escalated' | 'closed') {
    try {
      this.busy = true;
      this.errorMessage = '';
      await this.api.updateModerationStatus(caseItem.id, { reporterStatus, moderationStatus, internalNotes: this.internalNotes || undefined });
      this.message = `Report ${caseItem.id} updated to ${reporterStatus}.`;
      this.internalNotes = '';
      await this.reload();
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.busy = false;
    }
  }

  private toMessage(error: unknown) {
    if (typeof error === 'object' && error && 'error' in error) {
      return (error as { error?: { message?: string } }).error?.message ?? 'Moderation request failed';
    }

    return 'Moderation request failed';
  }
}
