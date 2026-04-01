import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { SessionStore } from './session.store';
import { resolveLoginUrlForTarget } from './auth-utils';

function routeRoles(route: ActivatedRouteSnapshot): string[] {
  const roles = route.data['roles'];
  return Array.isArray(roles) ? roles.map(String) : [];
}

export const roleGuard: CanActivateFn = async (route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);

  await session.ensureLoaded();
  if (!session.isAuthenticated()) {
    return router.parseUrl(resolveLoginUrlForTarget(state.url));
  }

  const roles = routeRoles(route);
  if (roles.length === 0 || session.hasAnyRole(roles)) {
    return true;
  }

  return router.parseUrl(session.homeUrl());
};

export const roleHomeGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);

  await session.ensureLoaded();
  if (!session.isAuthenticated()) {
    return router.parseUrl(resolveLoginUrlForTarget(state.url));
  }

  return router.parseUrl(session.homeUrl());
};
