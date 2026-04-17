import test from 'node:test';
import assert from 'node:assert/strict';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ApiService } from '../../src/app/core/services/api.service.ts';
import { SessionStore } from '../../src/app/core/auth/session.store.ts';
import { setupAngularTestEnvironment } from './angular-test-setup.ts';

setupAngularTestEnvironment();

const routerStub = {
  navigateByUrl: async () => true,
  navigate: async () => true,
  url: '/',
  events: { subscribe: () => ({ unsubscribe: () => {} }) },
  isActive: () => false,
  serializeUrl: () => '',
  createUrlTree: () => ({})
};

const adminSession = {
  sub: 'user-1',
  sid: 'session-1',
  username: 'admin',
  displayName: 'Admin User',
  roleCodes: ['administrator'],
  permissionCodes: ['users.manage', 'audit.read', 'warehouses.read'],
  assignedWarehouseIds: [],
  departmentIds: []
};

const clerkSession = {
  sub: 'user-2',
  sid: 'session-2',
  username: 'clerk',
  displayName: 'Warehouse Clerk',
  roleCodes: ['warehouse_clerk'],
  permissionCodes: ['inventory.receive', 'inventory.pick'],
  assignedWarehouseIds: ['wh-1'],
  departmentIds: ['dept-1']
};

test('session store hasRole returns true for matching role', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      SessionStore,
      {
        provide: ApiService,
        useValue: {
          rotateSession: async () => ({ user: adminSession }),
          logout: async () => undefined
        }
      },
      { provide: Router, useValue: routerStub }
    ]
  });

  const store = TestBed.inject(SessionStore);
  await store.ensureLoaded();

  assert.equal(store.hasRole('administrator'), true);
  assert.equal(store.hasRole('manager'), false);
  assert.equal(store.hasRole('warehouse_clerk'), false);
});

test('session store hasAnyRole returns true when any role matches', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      SessionStore,
      {
        provide: ApiService,
        useValue: {
          rotateSession: async () => ({ user: adminSession }),
          logout: async () => undefined
        }
      },
      { provide: Router, useValue: routerStub }
    ]
  });

  const store = TestBed.inject(SessionStore);
  await store.ensureLoaded();

  assert.equal(store.hasAnyRole(['administrator', 'manager']), true);
  assert.equal(store.hasAnyRole(['manager', 'moderator']), false);
  assert.equal(store.hasAnyRole(['warehouse_clerk', 'administrator']), true);
});

test('session store hasAnyPermission returns true when any permission matches', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      SessionStore,
      {
        provide: ApiService,
        useValue: {
          rotateSession: async () => ({ user: clerkSession }),
          logout: async () => undefined
        }
      },
      { provide: Router, useValue: routerStub }
    ]
  });

  const store = TestBed.inject(SessionStore);
  await store.ensureLoaded();

  assert.equal(store.hasAnyPermission(['inventory.receive']), true);
  assert.equal(store.hasAnyPermission(['inventory.pick', 'catalog.manage']), true);
  assert.equal(store.hasAnyPermission(['audit.read', 'users.manage']), false);
});

test('session store isAuthenticated computed signal reflects user state', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      SessionStore,
      {
        provide: ApiService,
        useValue: {
          rotateSession: async () => {
            throw new Error('Not authenticated');
          },
          logout: async () => undefined
        }
      },
      { provide: Router, useValue: routerStub }
    ]
  });

  const store = TestBed.inject(SessionStore);
  // Before loading: user is null, not authenticated
  assert.equal(store.isAuthenticated(), false);

  await store.ensureLoaded();
  // After failed load: still not authenticated
  assert.equal(store.isAuthenticated(), false);
  assert.equal(store.user(), null);
});

test('session store isAuthenticated is true after successful login hydration', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      SessionStore,
      {
        provide: ApiService,
        useValue: {
          rotateSession: async () => ({ user: adminSession }),
          logout: async () => undefined
        }
      },
      { provide: Router, useValue: routerStub }
    ]
  });

  const store = TestBed.inject(SessionStore);
  assert.equal(store.isAuthenticated(), false);

  await store.ensureLoaded();

  assert.equal(store.isAuthenticated(), true);
  assert.equal(store.user()?.username, 'admin');
  assert.equal(store.user()?.primaryRole, 'administrator');
});
