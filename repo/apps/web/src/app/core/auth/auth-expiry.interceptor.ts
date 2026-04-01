import { inject } from '@angular/core';
import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SessionStore } from './session.store';

const PUBLIC_AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/login-hints',
  '/api/auth/captcha'
]);

export function isProtectedApiRequest(url: string): boolean {
  if (!url.startsWith('/api/')) {
    return false;
  }

  return !PUBLIC_AUTH_PATHS.has(url);
}

export const authExpiryInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionStore);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse
        && error.status === 401
        && isProtectedApiRequest(request.url)
      ) {
        void session.expireAuth(router.url);
      }

      return throwError(() => error);
    })
  );
};
