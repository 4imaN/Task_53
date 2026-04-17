import test from 'node:test';
import assert from 'node:assert/strict';
import { TestBed } from '@angular/core/testing';
import { AdminPageComponent } from '../../src/app/features/admin/admin-page.component.ts';
import { UsersPageComponent } from '../../src/app/features/users/users-page.component.ts';
import { ProfilePageComponent } from '../../src/app/features/profile/profile-page.component.ts';
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

// ---- AdminPageComponent ----

const stubSessions = [
  { token_id: 'tok-1', rotation_reason: 'login', ip_address: '10.0.0.1', user_agent: 'Chrome', created_at: '2026-04-01T08:00:00.000Z' }
];

const stubUsers = [
  { id: 'u-1', display_name: 'Operator One', username: 'operator.one', roles: ['warehouse_clerk'], warehouses: ['WH-01'], locked_until: null }
];

const stubAudit = [
  { timestamp: '2026-04-01T09:00:00.000Z', action_type: 'login', resource_type: 'user', resource_id: 'u-1', details: {}, ip_address: '10.0.0.1', user_id: 'u-1' }
];

test('admin page renders admin data on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AdminPageComponent],
    providers: [
      {
        provide: ApiService,
        useValue: {
          sessions: async () => stubSessions,
          users: async () => stubUsers,
          auditLog: async () => stubAudit,
          unlockUser: async () => undefined
        }
      },
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const fixture = TestBed.createComponent(AdminPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Operator One/);
  assert.match(fixture.nativeElement.textContent, /Administration/i);
  assert.match(fixture.nativeElement.textContent, /Admin User/);
});

test('admin page shows error and recovers on retry', async () => {
  let calls = 0;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AdminPageComponent],
    providers: [
      {
        provide: ApiService,
        useValue: {
          sessions: async () => {
            calls += 1;
            if (calls === 1) {
              throw { error: { message: 'Admin service offline' } };
            }
            return stubSessions;
          },
          users: async () => stubUsers,
          auditLog: async () => stubAudit,
          unlockUser: async () => undefined
        }
      },
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const fixture = TestBed.createComponent(AdminPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Admin service offline/i);

  await (fixture.componentInstance as AdminPageComponent).reload();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Operator One/);
});

// ---- UsersPageComponent ----

const stubAccessControlOptions = {
  roles: [{ code: 'warehouse_clerk', name: 'Warehouse Clerk' }],
  warehouses: [{ id: 'wh-1', code: 'WH-01', name: 'Main Warehouse' }],
  departments: [{ id: 'dept-1', code: 'OPS', name: 'Operations' }]
};

const stubUserList = [
  {
    id: 'u-2',
    display_name: 'Warehouse Operator',
    username: 'wh.operator',
    roles: ['warehouse_clerk'],
    warehouses: ['WH-01'],
    departments: [],
    warehouse_ids: ['wh-1'],
    department_ids: [],
    is_active: true,
    locked_until: null
  }
];

test('users page renders user list on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UsersPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        users: async () => stubUserList,
        accessControlOptions: async () => stubAccessControlOptions,
        createUser: async () => undefined,
        updateUser: async () => undefined,
        updateUserAccessControl: async () => undefined,
        unlockUser: async () => undefined
      }
    }]
  });

  const fixture = TestBed.createComponent(UsersPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Warehouse Operator/);
  assert.match(fixture.nativeElement.textContent, /Access Control Management/i);
  assert.match(fixture.nativeElement.textContent, /wh\.operator/);
});

test('users page shows error and recovers on retry', async () => {
  let calls = 0;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UsersPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        users: async () => {
          calls += 1;
          if (calls === 1) {
            throw { error: { message: 'User directory unavailable' } };
          }
          return stubUserList;
        },
        accessControlOptions: async () => stubAccessControlOptions,
        createUser: async () => undefined,
        updateUser: async () => undefined,
        updateUserAccessControl: async () => undefined,
        unlockUser: async () => undefined
      }
    }]
  });

  const fixture = TestBed.createComponent(UsersPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /User directory unavailable/i);

  await (fixture.componentInstance as UsersPageComponent).reload();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Warehouse Operator/);
});

// ---- ProfilePageComponent ----

const stubProfileSessions = [
  { token_id: 'tok-1', rotation_reason: 'login', ip_address: '127.0.0.1', user_agent: 'Firefox', created_at: '2026-04-01T07:00:00.000Z' }
];

const stubInboxMessages = [
  { id: 'm-1', title: 'Welcome', body: 'Your account is active.', created_at: '2026-04-01T06:00:00.000Z', read_at: null }
];

test('profile page renders profile info from session on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProfilePageComponent],
    providers: [
      {
        provide: ApiService,
        useValue: {
          sessions: async () => stubProfileSessions,
          inbox: async () => stubInboxMessages,
          changePassword: async () => undefined,
          revokeSession: async () => undefined
        }
      },
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const fixture = TestBed.createComponent(ProfilePageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Admin User/);
  assert.match(fixture.nativeElement.textContent, /Profile & Access/i);
  assert.match(fixture.nativeElement.textContent, /Welcome/);
});

test('profile page shows error and recovers on retry', async () => {
  let calls = 0;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProfilePageComponent],
    providers: [
      {
        provide: ApiService,
        useValue: {
          sessions: async () => {
            calls += 1;
            if (calls === 1) {
              throw { error: { message: 'Profile service offline' } };
            }
            return stubProfileSessions;
          },
          inbox: async () => stubInboxMessages,
          changePassword: async () => undefined,
          revokeSession: async () => undefined
        }
      },
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const fixture = TestBed.createComponent(ProfilePageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Profile service offline/i);

  await (fixture.componentInstance as ProfilePageComponent).reload();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Admin User/);
});
