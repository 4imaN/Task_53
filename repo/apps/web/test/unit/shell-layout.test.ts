import test from 'node:test';
import assert from 'node:assert/strict';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ShellLayoutComponent } from '../../src/app/layouts/shell-layout.component.ts';
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

const routerStub = {
  navigateByUrl: async () => true,
  navigate: async () => true,
  url: '/',
  events: { subscribe: () => ({ unsubscribe: () => {} }) },
  isActive: () => false,
  serializeUrl: () => '',
  createUrlTree: () => ({})
};

test('shell layout renders navigation and displays user name from session', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ShellLayoutComponent],
    providers: [
      { provide: SessionStore, useValue: sessionStub },
      { provide: Router, useValue: routerStub }
    ]
  });

  const fixture = TestBed.createComponent(ShellLayoutComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Admin User/);
  assert.match(fixture.nativeElement.textContent, /OmniStock/i);
  assert.match(fixture.nativeElement.textContent, /Signed In/i);
});

test('shell layout shows admin navigation items for administrator role', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ShellLayoutComponent],
    providers: [
      { provide: SessionStore, useValue: sessionStub },
      { provide: Router, useValue: routerStub }
    ]
  });

  const fixture = TestBed.createComponent(ShellLayoutComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  // Administrator role should show admin-specific nav items
  assert.match(fixture.nativeElement.textContent, /User Management/i);
  assert.match(fixture.nativeElement.textContent, /Audit Log Viewer/i);
  // Should show initials for "Admin User" -> "AU"
  assert.match(fixture.nativeElement.textContent, /AU/);
});
