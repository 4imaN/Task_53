import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { SessionStore } from '../../core/auth/session.store';

@Component({
  selector: 'app-catalog-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Catalog Content</p>
        <h2>Ratings, reviews, Q&A, favorites, and abuse reporting</h2>
      </div>
      <span class="pill">{{ items.length }} items</span>
    </section>

    <div class="inline-status" *ngIf="loading">Loading catalog content.</div>
    <div class="inline-status success" *ngIf="message">{{ message }}</div>
    <div class="inline-status error-status" *ngIf="errorMessage">{{ errorMessage }}</div>

    <section class="three-column">
      <article class="panel tree-panel">
        <div class="tree-node" *ngFor="let item of items" [class.active]="item.id === selectedItemId" (click)="selectItem(item.id)">
          <strong>{{ item.sku }}</strong>
          <p>{{ item.name }}</p>
        </div>
      </article>

      <article class="panel" *ngIf="detail?.item as item">
        <div class="section-title">
          <div>
            <p class="eyebrow">{{ item.sku }}</p>
            <h3>{{ item.name }}</h3>
          </div>
          <button class="secondary-button" type="button" [disabled]="busy || loading" (click)="toggleFavorite()">
            {{ item.is_favorited ? 'Unfavorite' : 'Favorite' }}
          </button>
        </div>

        <div class="rating-row catalog-section-gap">
          <span class="star">★★★★★</span>
          <strong>{{ item.average_rating }}</strong>
          <small>{{ item.rating_count }} reviews</small>
        </div>

        <p class="catalog-copy">{{ item.description || 'No catalog description yet.' }}</p>

        <div class="section-title catalog-section-gap" *ngIf="canEditItem()">
          <h3>Edit item details</h3>
          <span class="pill">Catalog Manage</span>
        </div>
        <div class="catalog-edit-grid" *ngIf="canEditItem()">
          <input class="form-input" [(ngModel)]="itemForm.name" placeholder="Item name" />
          <input class="form-input" [(ngModel)]="itemForm.unitOfMeasure" placeholder="Unit of measure" />
          <input class="form-input" [(ngModel)]="itemForm.temperatureBand" placeholder="Temperature band" />
          <input class="form-input" type="number" min="0" [(ngModel)]="itemForm.weightLbs" placeholder="Weight (lbs)" />
          <input class="form-input" type="number" min="0" [(ngModel)]="itemForm.lengthIn" placeholder="Length (in)" />
          <input class="form-input" type="number" min="0" [(ngModel)]="itemForm.widthIn" placeholder="Width (in)" />
          <input class="form-input" type="number" min="0" [(ngModel)]="itemForm.heightIn" placeholder="Height (in)" />
          <input class="form-input catalog-edit-description" [(ngModel)]="itemForm.description" placeholder="Catalog description" />
          <button class="secondary-button" type="button" [disabled]="busy || loading" (click)="saveItemDetails()">Save Item Details</button>
        </div>

        <div class="section-title catalog-section-gap">
          <h3>Write review</h3>
          <span class="pill">{{ reviewForm.rating }} stars</span>
        </div>
        <div class="filter-strip">
          <select class="form-input" [(ngModel)]="reviewForm.rating">
            <option *ngFor="let rating of [5,4,3,2,1]" [value]="rating">{{ rating }} stars</option>
          </select>
          <input class="form-input" [(ngModel)]="reviewForm.body" placeholder="Share warehouse or catalog feedback" />
          <button class="primary-button" type="button" [disabled]="busy || loading" (click)="saveReview()">Save Review</button>
        </div>

        <div class="review-card" *ngFor="let review of detail.reviews">
          <div class="section-title">
            <strong>{{ review.author }}</strong>
            <span class="pill">{{ review.rating }} stars</span>
          </div>
          <p>{{ review.body }}</p>
          <small>{{ review.created_at | date:'short' }}</small>

          <div class="list-row" *ngFor="let followup of review.followups">
            <div>
              <strong>Follow-up</strong>
              <p>{{ followup.body }}</p>
            </div>
            <small>{{ followup.created_at | date:'short' }}</small>
          </div>

          <div class="filter-strip catalog-section-gap" *ngIf="canFollowUp(review)">
            <input class="form-input" [(ngModel)]="followupDrafts[review.id]" placeholder="Add a follow-up review" />
            <button class="secondary-button" type="button" [disabled]="busy || loading" (click)="addFollowup(review.id)">Add Follow-up</button>
          </div>

          <div class="filter-strip" *ngIf="canFollowUp(review)">
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" (change)="uploadReviewImage(review.id, $event)" />
          </div>

          <div class="catalog-image-grid" *ngIf="review.images?.length">
            <a class="catalog-image-card" *ngFor="let image of review.images" [href]="image.content_url" target="_blank" rel="noreferrer">
              <img [src]="image.content_url" alt="Review attachment" />
            </a>
          </div>

          <div class="filter-strip" *ngIf="canReport()">
            <input class="form-input" [(ngModel)]="reportDrafts[review.id]" placeholder="Report reason for this review" />
            <button class="secondary-button" type="button" [disabled]="busy || loading" (click)="reportReview(review.id)">Report Review</button>
          </div>
        </div>

        <div class="section-title catalog-section-gap">
          <h3>Questions & answers</h3>
          <span class="pill">Live threads</span>
        </div>
        <div class="filter-strip">
          <input class="form-input" [(ngModel)]="questionDraft" placeholder="Ask a question about this item" />
          <button class="primary-button" type="button" [disabled]="busy || loading" (click)="askQuestion()">Ask</button>
        </div>

        <div class="qa-card" *ngFor="let qa of detail.questions">
          <strong>{{ qa.question }}</strong>
          <p>Asked by {{ qa.asked_by }} · {{ qa.created_at | date:'short' }}</p>

          <div class="list-row" *ngFor="let answer of qa.answers">
            <div>
              <strong>{{ answer.answered_by }}</strong>
              <p>{{ answer.body }}</p>
            </div>
            <small>{{ answer.is_catalog_editor_answer ? 'Catalog Editor' : 'User' }}</small>
          </div>

          <div class="filter-strip catalog-section-gap" *ngIf="canAnswer()">
            <input class="form-input" [(ngModel)]="answerDrafts[qa.id]" placeholder="Add an answer" />
            <button class="secondary-button" type="button" [disabled]="busy || loading" (click)="answerQuestion(qa.id)">Answer</button>
          </div>

          <div class="filter-strip" *ngIf="canReport()">
            <input class="form-input" [(ngModel)]="reportDrafts[qa.id]" placeholder="Report reason for this question" />
            <button class="secondary-button" type="button" [disabled]="busy || loading" (click)="reportQuestion(qa.id)">Report Question</button>
          </div>
        </div>
      </article>

      <article class="panel" *ngIf="detail">
        <div class="section-title">
          <h3>Favorites</h3>
          <span class="pill">{{ detail.favorites.length }}</span>
        </div>
        <div class="list-row" *ngFor="let favorite of detail.favorites">
          <div>
            <strong>{{ favorite.sku }}</strong>
            <p>{{ favorite.name }}</p>
          </div>
          <small>{{ favorite.created_at | date:'short' }}</small>
        </div>

        <div class="section-title catalog-section-gap">
          <h3>Recently viewed</h3>
          <span class="pill">{{ detail.history.length }}</span>
        </div>
        <div class="list-row" *ngFor="let historyItem of detail.history">
          <div>
            <strong>{{ historyItem.sku }}</strong>
            <p>{{ historyItem.name }}</p>
          </div>
          <small>{{ historyItem.viewed_at | date:'short' }}</small>
        </div>
      </article>
    </section>
  `
})
export class CatalogPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly session = inject(SessionStore);

  readonly canReport = computed(() => this.session.isAuthenticated());
  readonly canAnswer = computed(() => this.session.hasAnyRole(['administrator', 'catalog_editor']));
  readonly canEditItem = computed(() => this.session.hasAnyRole(['administrator', 'catalog_editor']));

  items: any[] = [];
  selectedItemId = '';
  detail: any = null;
  message = '';
  errorMessage = '';
  loading = false;
  busy = false;
  questionDraft = '';
  followupDrafts: Record<string, string> = {};
  answerDrafts: Record<string, string> = {};
  reportDrafts: Record<string, string> = {};
  reviewForm = {
    rating: 5,
    body: ''
  };
  itemForm = {
    name: '',
    description: '',
    unitOfMeasure: '',
    temperatureBand: '',
    weightLbs: 0,
    lengthIn: 0,
    widthIn: 0,
    heightIn: 0
  };

  async ngOnInit() {
    try {
      this.loading = true;
      this.items = await this.api.catalogItems();
      if (this.items[0]) {
        await this.selectItem(this.items[0].id);
      }
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.loading = false;
    }
  }

  async selectItem(itemId: string) {
    try {
      this.loading = true;
      this.errorMessage = '';
      this.selectedItemId = itemId;
      this.detail = await this.api.catalogItem(itemId);
      if (this.detail?.item) {
        this.itemForm = {
          name: this.detail.item.name ?? '',
          description: this.detail.item.description ?? '',
          unitOfMeasure: this.detail.item.unit_of_measure ?? '',
          temperatureBand: this.detail.item.temperature_band ?? '',
          weightLbs: Number(this.detail.item.weight_lbs ?? 0),
          lengthIn: Number(this.detail.item.length_in ?? 0),
          widthIn: Number(this.detail.item.width_in ?? 0),
          heightIn: Number(this.detail.item.height_in ?? 0)
        };
      }
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.loading = false;
    }
  }

  canFollowUp(review: any) {
    return review.author === this.session.user()?.displayName;
  }

  async toggleFavorite() {
    if (!this.detail?.item || this.busy) {
      return;
    }

    try {
      this.busy = true;
      await this.api.favoriteItem(this.detail.item.id, !this.detail.item.is_favorited);
      this.message = this.detail.item.is_favorited ? 'Removed from favorites.' : 'Added to favorites.';
      await this.selectItem(this.detail.item.id);
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.busy = false;
    }
  }

  async saveItemDetails() {
    if (!this.canEditItem() || !this.detail?.item || this.busy) {
      return;
    }

    if (!this.itemForm.name.trim() || !this.itemForm.unitOfMeasure.trim() || !this.itemForm.temperatureBand.trim()) {
      this.errorMessage = 'Name, unit of measure, and temperature band are required.';
      return;
    }

    try {
      this.busy = true;
      this.errorMessage = '';
      await this.api.updateCatalogItem(this.detail.item.id, {
        name: this.itemForm.name.trim(),
        description: this.itemForm.description.trim(),
        unitOfMeasure: this.itemForm.unitOfMeasure.trim(),
        temperatureBand: this.itemForm.temperatureBand.trim(),
        weightLbs: Number(this.itemForm.weightLbs),
        lengthIn: Number(this.itemForm.lengthIn),
        widthIn: Number(this.itemForm.widthIn),
        heightIn: Number(this.itemForm.heightIn)
      });
      this.message = 'Item details updated.';
      this.items = this.items.map((entry) => entry.id === this.detail.item.id
        ? { ...entry, name: this.itemForm.name.trim() }
        : entry);
      await this.selectItem(this.detail.item.id);
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.busy = false;
    }
  }

  async saveReview() {
    if (!this.detail?.item || !this.reviewForm.body.trim()) {
      this.message = 'Enter review text before saving.';
      return;
    }

    try {
      this.busy = true;
      await this.api.upsertReview(this.detail.item.id, {
        rating: Number(this.reviewForm.rating),
        body: this.reviewForm.body.trim()
      });
      this.reviewForm.body = '';
      this.message = 'Review saved.';
      await this.selectItem(this.detail.item.id);
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.busy = false;
    }
  }

  async addFollowup(reviewId: string) {
    const body = this.followupDrafts[reviewId]?.trim();
    if (!body) {
      return;
    }

    try {
      this.busy = true;
      await this.api.createReviewFollowup(reviewId, { body });
      this.followupDrafts[reviewId] = '';
      this.message = 'Follow-up saved.';
      await this.selectItem(this.selectedItemId);
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.busy = false;
    }
  }

  async uploadReviewImage(reviewId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      this.busy = true;
      await this.api.uploadReviewImage(reviewId, file);
      input.value = '';
      this.message = 'Review image uploaded.';
      await this.selectItem(this.selectedItemId);
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.busy = false;
    }
  }

  async askQuestion() {
    if (!this.detail?.item || !this.questionDraft.trim()) {
      this.message = 'Enter a question before submitting.';
      return;
    }

    try {
      this.busy = true;
      await this.api.createQuestion(this.detail.item.id, { question: this.questionDraft.trim() });
      this.questionDraft = '';
      this.message = 'Question submitted.';
      await this.selectItem(this.detail.item.id);
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.busy = false;
    }
  }

  async answerQuestion(questionId: string) {
    if (!this.canAnswer()) {
      this.message = 'Only catalog editors and administrators can publish answers.';
      return;
    }

    const body = this.answerDrafts[questionId]?.trim();
    if (!body) {
      return;
    }

    try {
      this.busy = true;
      await this.api.createAnswer(questionId, { body });
      this.answerDrafts[questionId] = '';
      this.message = 'Answer submitted.';
      await this.selectItem(this.selectedItemId);
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.busy = false;
    }
  }

  async reportReview(reviewId: string) {
    const reason = this.reportDrafts[reviewId]?.trim();
    if (!reason) {
      return;
    }

    try {
      this.busy = true;
      await this.api.submitAbuseReport({
        targetType: 'review',
        targetId: reviewId,
        reason
      });
      this.reportDrafts[reviewId] = '';
      this.message = 'Review report submitted to moderation.';
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.busy = false;
    }
  }

  async reportQuestion(questionId: string) {
    const reason = this.reportDrafts[questionId]?.trim();
    if (!reason) {
      return;
    }

    try {
      this.busy = true;
      await this.api.submitAbuseReport({
        targetType: 'qa_thread',
        targetId: questionId,
        reason
      });
      this.reportDrafts[questionId] = '';
      this.message = 'Question report submitted to moderation.';
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.busy = false;
    }
  }

  private toMessage(error: unknown) {
    if (typeof error === 'object' && error && 'error' in error) {
      return (error as { error?: { message?: string } }).error?.message ?? 'Catalog request failed';
    }

    return 'Catalog request failed';
  }
}
