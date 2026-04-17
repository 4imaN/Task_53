import test from 'node:test';
import assert from 'node:assert/strict';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { LoginPageComponent } from '../../src/app/features/auth/login-page.component.ts';
import { WarehousePageComponent } from '../../src/app/features/warehouse/warehouse-page.component.ts';
import { DocumentsPageComponent } from '../../src/app/features/documents/documents-page.component.ts';
import { CatalogPageComponent } from '../../src/app/features/catalog/catalog-page.component.ts';
import { ModerationPageComponent } from '../../src/app/features/moderation/moderation-page.component.ts';
import { BulkPageComponent } from '../../src/app/features/bulk/bulk-page.component.ts';
import { AdminPageComponent } from '../../src/app/features/admin/admin-page.component.ts';
import { UsersPageComponent } from '../../src/app/features/users/users-page.component.ts';
import { ProfilePageComponent } from '../../src/app/features/profile/profile-page.component.ts';
import { DashboardPageComponent } from '../../src/app/features/dashboard/dashboard-page.component.ts';
import { InboxPageComponent } from '../../src/app/features/inbox/inbox-page.component.ts';
import { AuditPageComponent } from '../../src/app/features/audit/audit-page.component.ts';
import { ShellLayoutComponent } from '../../src/app/layouts/shell-layout.component.ts';
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
    permissionCodes: [
      'users.manage', 'warehouses.read', 'warehouses.manage', 'metrics.read', 'search.read',
      'audit.read', 'catalog.manage', 'content.moderate', 'exports.manage', 'bins.toggle',
      'documents.approve', 'inventory.receive', 'inventory.pick', 'inventory.move',
      'inventory.scan', 'inventory.count', 'inventory.adjust', 'saved_views.manage',
      'images.export', 'integrations.manage', 'roles.manage'
    ],
    assignedWarehouseIds: ['wh-1'],
    departmentIds: ['dept-1'],
    sid: 'session-1'
  }),
  isAuthenticated: () => true,
  hasRole: (role: string) => role === 'administrator',
  hasAnyRole: (roles: string[]) => roles.includes('administrator'),
  hasAnyPermission: () => true,
  loaded: () => true,
  loading: () => false,
  error: () => null,
  ensureLoaded: async () => {},
  logout: async () => {},
  homeUrl: () => '/dashboard'
};

// ---- WarehousePageComponent ----

test('warehouse page renders warehouse list on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WarehousePageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        warehouses: async () => [{ id: 'wh-1', code: 'WH-01', name: 'Main Warehouse', department_name: 'Ops' }],
        warehouseSetupOptions: async () => ({ departments: [{ id: 'd-1', name: 'Ops' }], temperatureBands: ['ambient'] }),
        warehouseTree: async () => [],
        binTimeline: async () => []
      }
    }]
  });

  const fixture = TestBed.createComponent(WarehousePageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Warehouse Hierarchy/);
  assert.match(fixture.nativeElement.textContent, /WH-01/);
  assert.match(fixture.nativeElement.textContent, /Main Warehouse/);
});

test('warehouse page shows error and recovers on retry', async () => {
  let calls = 0;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WarehousePageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        warehouses: async () => { calls += 1; if (calls === 1) throw { error: { message: 'Warehouse service down' } }; return [{ id: 'wh-1', code: 'WH-01', name: 'Main Warehouse' }]; },
        warehouseSetupOptions: async () => ({ departments: [], temperatureBands: [] }),
        warehouseTree: async () => [],
        binTimeline: async () => []
      }
    }]
  });

  const fixture = TestBed.createComponent(WarehousePageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Warehouse service down/i);

  await (fixture.componentInstance as WarehousePageComponent).reload();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /WH-01/);
});

// ---- DocumentsPageComponent ----

test('documents page renders document list on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DocumentsPageComponent],
    providers: [
      {
        provide: ApiService,
        useValue: {
          documents: async () => [{ id: 'doc-1', document_number: 'RECV-0001', type: 'receiving', status: 'draft', warehouse_name: 'Main', updated_at: '2026-04-01', created_by_name: 'Admin', approved_by_name: null, payload: { lines: [] } }],
          warehouses: async () => [{ id: 'wh-1', code: 'WH-01', name: 'Main' }],
          catalogItems: async () => [{ id: 'i-1', sku: 'SKU-1', name: 'Widget', unit_of_measure: 'ea', temperature_band: 'ambient' }],
          warehouseTree: async () => [],
          createDocument: async () => ({ id: 'x', documentNumber: 'X' }),
          transitionDocument: async () => undefined,
          executeReceivingDocument: async () => ({ lotIds: [] }),
          executeShippingDocument: async () => ({ pickedLotIds: [] }),
          executeTransferDocument: async () => ({ targetLotIds: [] })
        }
      },
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const fixture = TestBed.createComponent(DocumentsPageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Document Workflow/);
  assert.match(fixture.nativeElement.textContent, /RECV-0001/);
});

// ---- CatalogPageComponent ----

test('catalog page renders items on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CatalogPageComponent],
    providers: [
      {
        provide: ApiService,
        useValue: {
          catalogItems: async () => [{ id: 'item-1', sku: 'SKU-CAT', name: 'Catalog Widget' }],
          catalogItem: async () => ({ item: { id: 'item-1', sku: 'SKU-CAT', name: 'Catalog Widget', description: 'Desc', average_rating: '4.0', rating_count: 2, is_favorited: false, unit_of_measure: 'ea', temperature_band: 'ambient', weight_lbs: '1', length_in: '5', width_in: '3', height_in: '2' }, reviews: [], questions: [], favorites: [], history: [] }),
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
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Catalog Content/);
  assert.match(fixture.nativeElement.textContent, /SKU-CAT/);
  assert.match(fixture.nativeElement.textContent, /Catalog Widget/);
});

// ---- ModerationPageComponent ----

test('moderation page renders queue on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ModerationPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        moderationQueue: async () => [{ id: 'case-1', reason: 'Offensive language', target_type: 'review', target_id: 'r-1', reporter_name: 'Reporter A', reporter_status: 'submitted', moderation_status: 'new' }],
        updateModerationStatus: async () => undefined
      }
    }]
  });

  const fixture = TestBed.createComponent(ModerationPageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Moderation Queue/);
  assert.match(fixture.nativeElement.textContent, /Offensive language/);
});

test('moderation page shows error and recovers on retry', async () => {
  let calls = 0;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ModerationPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        moderationQueue: async () => { calls += 1; if (calls === 1) throw { error: { message: 'Queue offline' } }; return [{ id: 'c-1', reason: 'Spam', reporter_name: 'R', reporter_status: 'submitted', moderation_status: 'new' }]; },
        updateModerationStatus: async () => undefined
      }
    }]
  });

  const fixture = TestBed.createComponent(ModerationPageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Queue offline/i);

  await (fixture.componentInstance as ModerationPageComponent).reload();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Spam/);
});

// ---- BulkPageComponent ----

test('bulk page renders jobs on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BulkPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        bulkJobs: async () => [{ id: 'j-1', filename: 'catalog-items.csv', status: 'completed', created_by_name: 'Admin', created_at: '2026-04-01' }],
        bulkJobResults: async () => [{ row_number: 1, outcome: 'imported', message: 'OK' }],
        bulkTemplateCatalogItems: async () => new ArrayBuffer(0),
        bulkPrecheckCatalogItems: async () => ({ summary: { totalRows: 0, validRows: 0, warningRows: 0, errorRows: 0 }, rows: [] }),
        bulkImportCatalogItems: async () => ({ status: 'completed', rows: [] }),
        bulkExportCatalogItems: async () => new ArrayBuffer(0)
      }
    }]
  });

  const fixture = TestBed.createComponent(BulkPageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Bulk Processing/);
  assert.match(fixture.nativeElement.textContent, /catalog-items\.csv/);
});

// ---- AdminPageComponent ----

test('admin page renders admin data on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AdminPageComponent],
    providers: [
      {
        provide: ApiService,
        useValue: {
          sessions: async () => [{ token_id: 't-1', created_at: '2026-04-01' }],
          users: async () => [{ id: 'u-1', display_name: 'Operator', username: 'op.one', locked_until: null }],
          auditLog: async () => [{ timestamp: '2026-04-01', action_type: 'login', resource_type: 'user', resource_id: 'u-1' }],
          unlockUser: async () => undefined
        }
      },
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const fixture = TestBed.createComponent(AdminPageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Administration/);
  assert.match(fixture.nativeElement.textContent, /Operator/);
});

// ---- UsersPageComponent ----

test('users page renders user list on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UsersPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        users: async () => [{ id: 'u-1', display_name: 'Clerk User', username: 'clerk.user', roles: ['warehouse_clerk'], warehouses: ['WH-01'], departments: [], warehouse_ids: ['wh-1'], department_ids: [], is_active: true, locked_until: null }],
        accessControlOptions: async () => ({ roles: [{ code: 'warehouse_clerk', name: 'Warehouse Clerk' }], warehouses: [{ id: 'wh-1', code: 'WH-01', name: 'Main' }], departments: [] }),
        createUser: async () => undefined,
        updateUser: async () => undefined,
        updateUserAccessControl: async () => undefined,
        unlockUser: async () => undefined
      }
    }]
  });

  const fixture = TestBed.createComponent(UsersPageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Access Control Management/);
  assert.match(fixture.nativeElement.textContent, /Clerk User/);
});

// ---- ProfilePageComponent ----

test('profile page renders profile info on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProfilePageComponent],
    providers: [
      {
        provide: ApiService,
        useValue: {
          sessions: async () => [{ token_id: 't-1', created_at: '2026-04-01', ip_address: '127.0.0.1', user_agent: 'Chrome' }],
          inbox: async () => [{ id: 'n-1', title: 'Welcome', body: 'Active.', created_at: '2026-04-01', read_at: null }],
          changePassword: async () => undefined,
          revokeSession: async () => undefined
        }
      },
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const fixture = TestBed.createComponent(ProfilePageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Profile & Access/);
  assert.match(fixture.nativeElement.textContent, /Admin User/);
});

// ---- DashboardPageComponent ----

test('dashboard page renders metrics on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DashboardPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        metrics: async () => [{ metric_type: 'review_resolution_sla', metric_value: 95.0, warehouse_id: null, period_end: '2026-04-01' }]
      }
    }]
  });

  const fixture = TestBed.createComponent(DashboardPageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Manager Snapshot/);
  assert.match(fixture.nativeElement.textContent, /95\.00%/);
});

// ---- InboxPageComponent ----

test('inbox page renders notifications on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [InboxPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        inbox: async () => [{ id: 'n-1', title: 'Case update', body: 'Your report was reviewed.', created_at: '2026-04-01T10:00:00Z', read_at: null }],
        markInboxItemRead: async () => undefined,
        markAllInboxRead: async () => undefined
      }
    }]
  });

  const fixture = TestBed.createComponent(InboxPageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /In-App Inbox/);
  assert.match(fixture.nativeElement.textContent, /Case update/);
});

// ---- AuditPageComponent ----

test('audit page renders audit entries on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AuditPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        auditLog: async () => [{ timestamp: '2026-04-01T09:00:00Z', action_type: 'login', resource_type: 'user', resource_id: 'u-1', details: {}, ip_address: '127.0.0.1', user_id: 'u-1' }]
      }
    }]
  });

  const fixture = TestBed.createComponent(AuditPageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Audit Log/);
  assert.match(fixture.nativeElement.textContent, /login/);
});

// ---- ShellLayoutComponent ----

test('shell layout renders navigation and user info', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ShellLayoutComponent],
    providers: [
      provideRouter([]),
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const fixture = TestBed.createComponent(ShellLayoutComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /OmniStock/i);
  assert.match(fixture.nativeElement.textContent, /Admin User/);
});

// ---- LoginPageComponent ----

test('login page renders actor title and form fields', async () => {
  const routeStub = {
    paramMap: of({ get: (key: string) => key === 'actor' ? 'warehouse-clerk' : null }),
    snapshot: { paramMap: { get: (key: string) => key === 'actor' ? 'warehouse-clerk' : null } }
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [LoginPageComponent],
    providers: [
      {
        provide: ApiService,
        useValue: {
          loginHints: async () => ({ captchaRequired: false, lockedUntil: null }),
          login: async () => ({ token: 'tok', user: { username: 'clerk.demo' } }),
          captcha: async () => ({ id: 'c-1', svg: '<svg></svg>' })
        }
      },
      { provide: SessionStore, useValue: sessionStub },
      { provide: ActivatedRoute, useValue: routeStub },
      { provide: Router, useValue: { navigateByUrl: async () => true, navigate: async () => true } }
    ]
  });

  const fixture = TestBed.createComponent(LoginPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Warehouse Clerk Access/);
  assert.match(fixture.nativeElement.textContent, /Closed-Network Authentication/);
  assert.match(fixture.nativeElement.textContent, /Dedicated actor login/);

  const inputs = fixture.nativeElement.querySelectorAll('input.form-input');
  assert.ok(inputs.length >= 2, 'should render username and password inputs');
});

test('login page shows auth error on failed login', async () => {
  const routeStub = {
    paramMap: of({ get: (key: string) => key === 'actor' ? 'administrator' : null }),
    snapshot: { paramMap: { get: (key: string) => key === 'actor' ? 'administrator' : null } }
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [LoginPageComponent],
    providers: [
      {
        provide: ApiService,
        useValue: {
          loginHints: async () => ({ captchaRequired: false, lockedUntil: null }),
          login: async () => { throw { status: 401, error: { message: 'Invalid credentials' } }; },
          captcha: async () => ({ id: 'c-1', svg: '<svg></svg>' })
        }
      },
      {
        provide: SessionStore,
        useValue: {
          ...sessionStub,
          loading: () => false,
          login: async () => { throw { status: 401, error: { message: 'Invalid credentials' } }; }
        }
      },
      { provide: ActivatedRoute, useValue: routeStub },
      { provide: Router, useValue: { navigateByUrl: async () => true, navigate: async () => true } }
    ]
  });

  const fixture = TestBed.createComponent(LoginPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Administrator Access/);

  const component = fixture.componentInstance as LoginPageComponent;
  component.username = 'admin';
  component.password = 'wrong';
  await component.submit();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Invalid credentials|failed/i);
});
