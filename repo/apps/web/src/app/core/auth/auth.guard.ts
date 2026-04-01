import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from './session.store';
import { resolveLoginUrlForTarget } from './auth-utils';

export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);

  await session.ensureLoaded();
  if (session.isAuthenticated()) {
    return true;
  }

  return router.parseUrl(resolveLoginUrlForTarget(state.url));
};
