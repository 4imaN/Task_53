import test from 'node:test';
import assert from 'node:assert/strict';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ClerkWorkspacePageComponent } from '../../src/app/features/workspaces/clerk-workspace-page.component.ts';
import { ModeratorWorkspacePageComponent } from '../../src/app/features/workspaces/moderator-workspace-page.component.ts';
import { CatalogWorkspacePageComponent } from '../../src/app/features/workspaces/catalog-workspace-page.component.ts';
import { AdminWorkspacePageComponent } from '../../src/app/features/workspaces/admin-workspace-page.component.ts';
import { ManagerWorkspacePageComponent } from '../../src/app/features/workspaces/manager-workspace-page.component.ts';
import { ApiService } from '../../src/app/core/services/api.service.ts';
import { SessionStore } from '../../src/app/core/auth/session.store.ts';
import { setupAngularTestEnvironment } from './angular-test-setup.ts';

setupAngularTestEnvironment();

const adminSessionStub = {
  user: () => ({
    displayName: 'Admin User',
    username: 'admin.demo',
    primaryRole: 'administrator',
    roleCodes: ['administrator'],
    permissionCodes: ['admin.access', 'inventory.scan', 'inventory.receive', 'inventory.pick', 'inventory.move'],
    assignedWarehouseIds: ['wh-1'],
    departmentIds: [],
    sid: 'session-admin-1'
  }),
  isAuthenticated: () => true,
  hasRole: (role: string) => role === 'administrator',
  hasAnyRole: (roles: string[]) => roles.includes('administrator'),
  hasAnyPermission: (perms: string[]) => perms.some((p) => ['admin.access', 'inventory.scan', 'inventory.receive', 'inventory.pick', 'inventory.move'].includes(p)),
  loaded: () => true,
  loading: () => false,
  error: () => null,
  ensureLoaded: async () => {},
  logout: async () => {},
  homeUrl: () => '/workspace/administrator'
};

test('ClerkWorkspace: renders metric data and workspace branding on successful load', async () => {
  TestBed.resetTestingModule();

  const apiStub = {
    documents: async () => [{ id: 'd-1', type: 'receiving', status: 'draft' }],
    savedViews: async () => [],
    inbox: async () => []
  };

  TestBed.configureTestingModule({
    imports: [ClerkWorkspacePageComponent],
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: apiStub },
      { provide: SessionStore, useValue: adminSessionStub }
    ]
  });

  const fixture = TestBed.createComponent(ClerkWorkspacePageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const content = fixture.nativeElement.textContent as string;
  assert.match(content, /Warehouse Clerk Workspace/);
  assert.match(content, /Visible documents/);
  assert.match(content, /1 assigned/);
  assert.match(content, /Clerk actions/);
});

test('ModeratorWorkspace: renders metric data and workspace branding on successful load', async () => {
  TestBed.resetTestingModule();

  const apiStub = {
    moderationQueue: async () => [{ id: 'c-1', moderation_status: 'new' }],
    inbox: async () => []
  };

  TestBed.configureTestingModule({
    imports: [ModeratorWorkspacePageComponent],
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: apiStub }
    ]
  });

  const fixture = TestBed.createComponent(ModeratorWorkspacePageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const content = fixture.nativeElement.textContent as string;
  assert.match(content, /Moderator Workspace/);
  assert.match(content, /Open cases/);
  assert.match(content, /1 report\(s\) are currently visible in the moderation queue/);
  assert.match(content, /Moderator actions/);
});

test('CatalogWorkspace: renders metric data and workspace branding on successful load', async () => {
  TestBed.resetTestingModule();

  const apiStub = {
    catalogItems: async () => [{ id: 'i-1', sku: 'SKU-1' }],
    bulkJobs: async () => [],
    inbox: async () => [],
    savedViews: async () => []
  };

  TestBed.configureTestingModule({
    imports: [CatalogWorkspacePageComponent],
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: apiStub }
    ]
  });

  const fixture = TestBed.createComponent(CatalogWorkspacePageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const content = fixture.nativeElement.textContent as string;
  assert.match(content, /Catalog Editor Workspace/);
  assert.match(content, /Catalog items/);
  assert.match(content, /1 items loaded/);
  assert.match(content, /Catalog actions/);
});

test('AdminWorkspace: renders metric data and workspace branding on successful load', async () => {
  TestBed.resetTestingModule();

  const apiStub = {
    users: async () => [{ id: 'u-1', display_name: 'User One', locked_until: null }],
    sessions: async () => [{ token_id: 't-1' }],
    auditLog: async () => [{ action_type: 'login' }]
  };

  TestBed.configureTestingModule({
    imports: [AdminWorkspacePageComponent],
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: apiStub }
    ]
  });

  const fixture = TestBed.createComponent(AdminWorkspacePageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const content = fixture.nativeElement.textContent as string;
  assert.match(content, /Administrator Workspace/);
  assert.match(content, /Users/);
  assert.match(content, /1 recent events/);
  assert.match(content, /Admin control points/);
  assert.match(content, /No locked accounts currently require administrative intervention/);
});

test('ManagerWorkspace: renders metric data and workspace branding on successful load', async () => {
  TestBed.resetTestingModule();

  const apiStub = {
    metrics: async () => [{ metric_type: 'put_away_time' }],
    warehouses: async () => [{ id: 'wh-1', code: 'WH-01' }],
    documents: async () => [{ id: 'd-1', status: 'draft' }]
  };

  TestBed.configureTestingModule({
    imports: [ManagerWorkspacePageComponent],
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: apiStub }
    ]
  });

  const fixture = TestBed.createComponent(ManagerWorkspacePageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const content = fixture.nativeElement.textContent as string;
  assert.match(content, /Manager Workspace/);
  assert.match(content, /Metrics rows/);
  assert.match(content, /Warehouses/);
  assert.match(content, /1 active docs/);
  assert.match(content, /Manager actions/);
});
