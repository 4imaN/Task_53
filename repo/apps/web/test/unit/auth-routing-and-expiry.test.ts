import test from 'node:test';
import assert from 'node:assert/strict';
import { firstValueFrom } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router, type UrlTree } from '@angular/router';
import { authGuard } from '../../src/app/core/auth/auth.guard.ts';
import { roleGuard } from '../../src/app/core/auth/role.guard.ts';
import { SessionStore } from '../../src/app/core/auth/session.store.ts';
import { authExpiryInterceptor } from '../../src/app/core/auth/auth-expiry.interceptor.ts';
import { setupAngularTestEnvironment } from './angular-test-setup.ts';

setupAngularTestEnvironment();

test('authGuard redirects unauthenticated access to actor-specific login', async () => {
  const sessionStub = {
    ensureLoaded: async () => undefined,
    isAuthenticated: () => false
  } as Pick<SessionStore, 'ensureLoaded' | 'isAuthenticated'>;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const router = TestBed.inject(Router);
  const result = await TestBed.runInInjectionContext(() =>
    authGuard({} as never, { url: '/inventory' } as never)
  );
  assert.equal(router.serializeUrl(result as UrlTree), '/login/warehouse-clerk');
});

test('roleGuard redirects unauthorized users to their role home', async () => {
  const sessionStub = {
    ensureLoaded: async () => undefined,
    isAuthenticated: () => true,
    hasAnyRole: () => false,
    homeUrl: () => '/workspace/warehouse-clerk'
  } as Pick<SessionStore, 'ensureLoaded' | 'isAuthenticated' | 'hasAnyRole' | 'homeUrl'>;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const router = TestBed.inject(Router);
  const result = await TestBed.runInInjectionContext(() =>
    roleGuard({ data: { roles: ['administrator'] } } as never, {} as never)
  );

  assert.equal(router.serializeUrl(result as UrlTree), '/workspace/warehouse-clerk');
});

test('authExpiryInterceptor expires session on 401 from protected APIs but ignores public pre-login auth routes', async () => {
  const expiredUrls: string[] = [];
  const sessionStub = {
    expireAuth: async (currentUrl?: string) => {
      expiredUrls.push(currentUrl ?? '');
    }
  } as Pick<SessionStore, 'expireAuth'>;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([authExpiryInterceptor])),
      provideHttpClientTesting(),
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const http = TestBed.inject(HttpClient);
  const httpMock = TestBed.inject(HttpTestingController);

  const protectedRequest = firstValueFrom(http.get('/api/search'));
  httpMock.expectOne('/api/search').flush({ message: 'Expired' }, { status: 401, statusText: 'Unauthorized' });
  await assert.rejects(protectedRequest, (error: unknown) => error instanceof HttpErrorResponse && error.status === 401);

  const publicRequest = firstValueFrom(http.get('/api/auth/login-hints'));
  httpMock.expectOne('/api/auth/login-hints').flush({ message: 'No hints' }, { status: 401, statusText: 'Unauthorized' });
  await assert.rejects(publicRequest, (error: unknown) => error instanceof HttpErrorResponse && error.status === 401);

  assert.equal(expiredUrls.length, 1);
  httpMock.verify();
});
