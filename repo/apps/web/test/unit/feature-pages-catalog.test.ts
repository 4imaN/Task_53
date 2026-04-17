import test from 'node:test';
import assert from 'node:assert/strict';
import { TestBed } from '@angular/core/testing';
import { CatalogPageComponent } from '../../src/app/features/catalog/catalog-page.component.ts';
import { ModerationPageComponent } from '../../src/app/features/moderation/moderation-page.component.ts';
import { ApiService } from '../../src/app/core/services/api.service.ts';
import { SessionStore } from '../../src/app/core/auth/session.store.ts';
import { setupAngularTestEnvironment } from './angular-test-setup.ts';

setupAngularTestEnvironment();

const sessionStub = {
  user: () => ({
    displayName: 'Admin User',
    username: 'admin',
    primaryRole: 'administrator',
    roleCodes: ['administrator'],
    permissionCodes: ['users.manage', 'warehouses.read', 'metrics.read', 'search.read', 'audit.read', 'catalog.manage', 'content.moderate', 'exports.manage'],
    assignedWarehouseIds: [],
    departmentIds: [],
    sid: 'session-1'
  }),
  isAuthenticated: () => true,
  hasRole: (role: string) => role === 'administrator',
  hasAnyRole: (roles: string[]) => roles.includes('administrator'),
  hasAnyPermission: (_perms: string[]) => true,
  logout: async () => {},
  loaded: () => true,
  loading: () => false,
  error: () => null,
  ensureLoaded: async () => {},
  homeUrl: () => '/dashboard'
};

// ---- CatalogPageComponent ----

const stubCatalogItems = [
  { id: 'item-1', sku: 'SKU-001', name: 'Widget Alpha' }
];

const stubCatalogDetail = {
  item: {
    id: 'item-1',
    sku: 'SKU-001',
    name: 'Widget Alpha',
    description: 'A reliable warehouse widget.',
    average_rating: '4.5',
    rating_count: 10,
    is_favorited: false,
    unit_of_measure: 'each',
    temperature_band: 'ambient',
    weight_lbs: '2.5',
    length_in: '10',
    width_in: '5',
    height_in: '3'
  },
  reviews: [],
  questions: [],
  favorites: [],
  history: []
};

test('catalog page renders items list on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CatalogPageComponent],
    providers: [
      {
        provide: ApiService,
        useValue: {
          catalogItems: async () => stubCatalogItems,
          catalogItem: async () => stubCatalogDetail,
          favoriteItem: async () => undefined,
          upsertReview: async () => undefined,
          createReviewFollowup: async () => undefined,
          uploadReviewImage: async () => undefined,
          createQuestion: async () => undefined,
          createAnswer: async () => undefined,
          submitAbuseReport: async () => undefined,
          updateCatalogItem: async () => undefined
        }
      },
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const fixture = TestBed.createComponent(CatalogPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /SKU-001/);
  assert.match(fixture.nativeElement.textContent, /Widget Alpha/);
  assert.match(fixture.nativeElement.textContent, /Catalog Content/i);
});

test('catalog page shows error and recovers on retry', async () => {
  let calls = 0;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CatalogPageComponent],
    providers: [
      {
        provide: ApiService,
        useValue: {
          catalogItems: async () => {
            calls += 1;
            if (calls === 1) {
              throw { error: { message: 'Catalog service unavailable' } };
            }
            return stubCatalogItems;
          },
          catalogItem: async () => stubCatalogDetail,
          favoriteItem: async () => undefined,
          upsertReview: async () => undefined,
          createReviewFollowup: async () => undefined,
          uploadReviewImage: async () => undefined,
          createQuestion: async () => undefined,
          createAnswer: async () => undefined,
          submitAbuseReport: async () => undefined,
          updateCatalogItem: async () => undefined
        }
      },
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const fixture = TestBed.createComponent(CatalogPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Catalog service unavailable/i);

  // Retry: reinitialize via ngOnInit directly since catalog uses ngOnInit logic inline (no exposed reload())
  calls = 1; // allow next call to succeed
  (fixture.componentInstance as CatalogPageComponent).errorMessage = '';
  await (fixture.componentInstance as CatalogPageComponent).ngOnInit();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /SKU-001/);
});

// ---- ModerationPageComponent ----

const stubQueue = [
  {
    id: 'case-1',
    reason: 'Offensive language',
    target_type: 'review',
    target_id: 'rev-1',
    reporter_name: 'Reporter One',
    reporter_status: 'submitted',
    moderation_status: 'new'
  }
];

test('moderation page renders queue on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ModerationPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        moderationQueue: async () => stubQueue,
        updateModerationStatus: async () => undefined
      }
    }]
  });

  const fixture = TestBed.createComponent(ModerationPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Offensive language/);
  assert.match(fixture.nativeElement.textContent, /Moderation Queue/i);
  assert.match(fixture.nativeElement.textContent, /Reporter One/);
});

test('moderation page shows error and recovers on retry', async () => {
  let calls = 0;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ModerationPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        moderationQueue: async () => {
          calls += 1;
          if (calls === 1) {
            throw { error: { message: 'Moderation queue unavailable' } };
          }
          return stubQueue;
        },
        updateModerationStatus: async () => undefined
      }
    }]
  });

  const fixture = TestBed.createComponent(ModerationPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Moderation queue unavailable/i);

  await (fixture.componentInstance as ModerationPageComponent).reload();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Offensive language/);
});
