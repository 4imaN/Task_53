import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';
import { buildPageWindowLabel } from './search-utils';

type SearchFilters = {
  item: string;
  lot: string;
  warehouseId: string;
  documentStatus: string;
  dateFrom: string;
  dateTo: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  page: number;
  pageSize: number;
};

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="search-workspace">
      <div class="search-top-stack">
        <section class="page-header search-header">
          <div>
            <p class="eyebrow">Global Search Workspace</p>
            <h2>Saved views, combined filters, and sortable results</h2>
          </div>
          <div class="button-row">
            <input class="form-input search-view-name" [(ngModel)]="savedViewName" placeholder="Saved view name" />
            <button class="secondary-button" type="button" [disabled]="savingView || loading" (click)="saveCurrentView()">
              {{ savingView ? 'Saving...' : 'Save Current View' }}
            </button>
          </div>
        </section>

        <section class="panel filter-strip search-form-grid search-filter-panel">
          <input class="form-input" [(ngModel)]="filters.item" [disabled]="loading" placeholder="Item or barcode" />
          <input class="form-input" [(ngModel)]="filters.lot" [disabled]="loading" placeholder="Lot" />
          <input class="form-input" [(ngModel)]="filters.warehouseId" [disabled]="loading" placeholder="Warehouse id" />
          <input class="form-input" [(ngModel)]="filters.documentStatus" [disabled]="loading" placeholder="Document status" />
          <input class="form-input" [(ngModel)]="filters.dateFrom" [disabled]="loading" type="date" placeholder="Date from" />
          <input class="form-input" [(ngModel)]="filters.dateTo" [disabled]="loading" type="date" placeholder="Date to" />
          <select class="form-input" [(ngModel)]="filters.pageSize" [disabled]="loading">
            <option [ngValue]="10">10 / page</option>
            <option [ngValue]="25">25 / page</option>
            <option [ngValue]="50">50 / page</option>
          </select>
          <button class="primary-button" type="button" [disabled]="loading" (click)="runSearch(true)">{{ loading ? 'Searching...' : 'Search' }}</button>
        </section>
      </div>

      <div class="search-content-stack">
        <section class="panel search-saved-views">
          <div class="section-title">
            <h3>Saved views</h3>
            <span class="pill">{{ savedViews.length }} stored</span>
          </div>
          <div class="tab-strip" *ngIf="savedViews.length; else emptySavedViews">
            <button class="tab" *ngFor="let view of savedViews" (click)="applyView(view)">{{ view.view_name }}</button>
          </div>
          <ng-template #emptySavedViews>
            <p class="supporting search-empty-state">No saved views yet. Save the current filter set to reuse it later.</p>
          </ng-template>
        </section>

        <section class="panel search-results">
          <div class="section-title">
            <div>
              <h3>Results</h3>
              <p class="supporting search-results-meta">Page {{ pageLabel() }} of {{ totalPages }} · {{ total }} rows</p>
            </div>
            <span class="pill">{{ loading ? 'Loading...' : rows.length + ' loaded' }}</span>
          </div>
          <div class="inline-status success" *ngIf="message && !errorMessage">{{ message }}</div>
          <div class="inline-status" *ngIf="errorMessage">{{ errorMessage }}</div>
          <div class="inline-status" *ngIf="loading">Refreshing the result set with the current filters.</div>
          <div class="table-scroll" *ngIf="rows.length; else emptySearch">
            <table class="data-table">
              <thead>
                <tr>
                  <th><button class="table-sort" type="button" (click)="sort('itemName')">Item {{ sortMarker('itemName') }}</button></th>
                  <th><button class="table-sort" type="button" (click)="sort('lot')">Lot {{ sortMarker('lot') }}</button></th>
                  <th><button class="table-sort" type="button" (click)="sort('warehouse')">Warehouse {{ sortMarker('warehouse') }}</button></th>
                  <th><button class="table-sort" type="button" (click)="sort('documentStatus')">Status {{ sortMarker('documentStatus') }}</button></th>
                  <th><button class="table-sort" type="button" (click)="sort('updatedAt')">Updated {{ sortMarker('updatedAt') }}</button></th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of rows">
                  <td>
                    <strong>{{ row.item_name }}</strong>
                    <p>{{ row.barcode || row.sku }}</p>
                  </td>
                  <td>{{ row.lot_code || 'n/a' }}</td>
                  <td>{{ row.warehouse_name || 'n/a' }}</td>
                  <td><span class="pill">{{ row.document_status || 'n/a' }}</span></td>
                  <td>{{ row.updated_at ? (row.updated_at | date:'short') : 'n/a' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ng-template #emptySearch>
            <p class="supporting search-empty-state">No rows returned for the current filter set.</p>
          </ng-template>

          <div class="search-pagination">
            <button class="secondary-button" type="button" (click)="goToPage(filters.page - 1)" [disabled]="loading || filters.page <= 1">Previous</button>
            <div class="search-pagination-status">
              <strong>Page {{ filters.page }}</strong>
              <span>{{ pageWindowLabel() }}</span>
            </div>
            <button class="secondary-button" type="button" (click)="goToPage(filters.page + 1)" [disabled]="loading || filters.page >= totalPages">Next</button>
          </div>
        </section>
      </div>
    </div>
  `
})
export class SearchPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private requestVersion = 0;

  filters: SearchFilters = {
    item: '',
    lot: '',
    warehouseId: '',
    documentStatus: '',
    dateFrom: '',
    dateTo: '',
    sortBy: 'updatedAt',
    sortDir: 'desc',
    page: 1,
    pageSize: 25
  };
  rows: any[] = [];
  savedViews: any[] = [];
  total = 0;
  totalPages = 1;
  errorMessage = '';
  message = '';
  loading = false;
  savingView = false;
  savedViewName = '';

  async ngOnInit() {
    this.applyRouteFilters(this.route.snapshot.queryParamMap, false);

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        if (this.applyRouteFilters(params, true)) {
          void this.runSearch();
        }
      });

    await Promise.all([this.loadSavedViews(), this.runSearch()]);
  }

  async runSearch(resetPage = false) {
    const requestId = ++this.requestVersion;

    try {
      this.loading = true;
      this.errorMessage = '';
      this.message = '';
      if (resetPage) {
        this.filters.page = 1;
      }
      const response = await this.api.search(this.filters);
      if (requestId !== this.requestVersion) {
        return;
      }
      this.rows = response.results ?? [];
      this.total = response.total ?? 0;
      this.totalPages = Math.max(response.totalPages ?? Math.ceil(this.total / this.filters.pageSize), 1);
      this.message = this.total ? `Loaded ${this.pageWindowLabel()}.` : 'No rows returned for the current filter set.';
    } catch (error) {
      if (requestId !== this.requestVersion) {
        return;
      }
      this.rows = [];
      this.total = 0;
      this.totalPages = 1;
      this.errorMessage = this.toMessage(error);
      this.message = '';
    } finally {
      if (requestId === this.requestVersion) {
        this.loading = false;
      }
    }
  }

  async loadSavedViews() {
    try {
      this.savedViews = await this.api.savedViews();
    } catch {
      this.savedViews = [];
    }
  }

  async saveCurrentView() {
    if (this.savingView) {
      return;
    }

    const name = this.savedViewName.trim() || `view-${new Date().toISOString().slice(0, 19)}`;
    try {
      this.savingView = true;
      this.errorMessage = '';
      await this.api.saveView(name, this.filters);
      this.savedViewName = '';
      this.message = `Saved view "${name}".`;
      await this.loadSavedViews();
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.savingView = false;
    }
  }

  applyView(view: any) {
    this.filters = {
      item: view.filters?.item ?? '',
      lot: view.filters?.lot ?? '',
      warehouseId: view.filters?.warehouseId ?? '',
      documentStatus: view.filters?.documentStatus ?? '',
      dateFrom: view.filters?.dateFrom ?? '',
      dateTo: view.filters?.dateTo ?? '',
      sortBy: view.filters?.sortBy ?? 'updatedAt',
      sortDir: view.filters?.sortDir === 'asc' ? 'asc' : 'desc',
      page: Number(view.filters?.page ?? 1),
      pageSize: Number(view.filters?.pageSize ?? 25)
    };
    void this.runSearch();
  }

  sort(column: string) {
    if (this.filters.sortBy === column) {
      this.filters.sortDir = this.filters.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.filters.sortBy = column;
      this.filters.sortDir = column === 'updatedAt' ? 'desc' : 'asc';
    }

    void this.runSearch();
  }

  sortMarker(column: string) {
    if (this.filters.sortBy !== column) {
      return '';
    }

    return this.filters.sortDir === 'asc' ? '↑' : '↓';
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages || page === this.filters.page) {
      return;
    }

    this.filters.page = page;
    void this.runSearch();
  }

  pageLabel() {
    return this.total ? this.filters.page : 0;
  }

  pageWindowLabel() {
    return buildPageWindowLabel(this.filters.page, this.filters.pageSize, this.total);
  }

  private toMessage(error: unknown) {
    if (typeof error === 'object' && error && 'error' in error) {
      return (error as { error?: { message?: string } }).error?.message ?? 'Search failed';
    }

    return 'Search failed';
  }

  private applyRouteFilters(params: { get(name: string): string | null }, resetPage: boolean) {
    const nextFilters: SearchFilters = {
      item: (params.get('item') ?? '').trim(),
      lot: (params.get('lot') ?? '').trim(),
      warehouseId: (params.get('warehouseId') ?? '').trim(),
      documentStatus: (params.get('documentStatus') ?? '').trim(),
      dateFrom: (params.get('dateFrom') ?? '').trim(),
      dateTo: (params.get('dateTo') ?? '').trim(),
      sortBy: (params.get('sortBy') ?? this.filters.sortBy).trim() || 'updatedAt',
      sortDir: params.get('sortDir') === 'asc' ? 'asc' : 'desc',
      page: Number(params.get('page') ?? (resetPage ? 1 : this.filters.page)) || 1,
      pageSize: Number(params.get('pageSize') ?? this.filters.pageSize) || this.filters.pageSize
    };

    const changed = Object.entries(nextFilters).some(([key, value]) => this.filters[key as keyof SearchFilters] !== value);
    if (!changed) {
      return false;
    }

    this.filters = nextFilters;
    return true;
  }
}
