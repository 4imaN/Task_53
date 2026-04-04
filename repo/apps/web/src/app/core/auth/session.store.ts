import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, AuthSession } from '../services/api.service';
import { DEFAULT_LOGIN_URL, resolveHomeUrl, resolveLoginUrl, resolvePrimaryRole, type RoleCode } from './auth-utils';

export type SessionUser = AuthSession & {
  primaryRole: RoleCode;
};

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly userSignal = signal<SessionUser | null>(null);
  private readonly loadedSignal = signal(false);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private hydratePromise: Promise<void> | null = null;
  private authExpiryInFlight = false;

  readonly user = this.userSignal.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.userSignal() !== null);

  async ensureLoaded(): Promise<void> {
    if (this.loadedSignal()) {
      return;
    }

    if (!this.hydratePromise) {
      this.hydratePromise = this.hydrateInternal();
    }

    await this.hydratePromise;
  }

  async login(payload: {
    username: string;
    password: string;
    captchaId?: string;
    captchaAnswer?: string;
    loginActor?: 'administrator' | 'manager' | 'moderator' | 'catalog-editor' | 'warehouse-clerk';
  }): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const response = await this.api.login(payload);
      this.userSignal.set(this.toSessionUser(response.user));
      this.loadedSignal.set(true);
    } catch (error) {
      this.errorSignal.set(this.toMessage(error));
      throw error;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async logout(): Promise<void> {
    const user = this.userSignal();
    const loginUrl = user ? resolveLoginUrl(user.roleCodes) : DEFAULT_LOGIN_URL;
    try {
      await this.api.logout();
    } finally {
      this.clearSessionState();
      await this.router.navigateByUrl(loginUrl);
    }
  }

  async expireAuth(currentUrl?: string): Promise<void> {
    const user = this.userSignal();
    const loginUrl = user ? resolveLoginUrl(user.roleCodes) : DEFAULT_LOGIN_URL;
    this.clearSessionState();
    if (this.authExpiryInFlight) {
      return;
    }

    const activeUrl = currentUrl ?? this.router.url;
    if (activeUrl.startsWith('/login')) {
      return;
    }

    this.authExpiryInFlight = true;
    try {
      await this.router.navigateByUrl(loginUrl);
    } finally {
      this.authExpiryInFlight = false;
    }
  }

  hasRole(role: RoleCode): boolean {
    return this.userSignal()?.roleCodes.includes(role) ?? false;
  }

  hasAnyRole(roles: readonly string[]): boolean {
    const assignedRoles = this.userSignal()?.roleCodes ?? [];
    return roles.some((role) => assignedRoles.includes(role));
  }

  hasAnyPermission(permissionCodes: readonly string[]): boolean {
    const assignedPermissions = this.userSignal()?.permissionCodes ?? [];
    return permissionCodes.some((permissionCode) => assignedPermissions.includes(permissionCode));
  }

  homeUrl(): string {
    const user = this.userSignal();
    return user ? resolveHomeUrl(user.roleCodes) : DEFAULT_LOGIN_URL;
  }

  private async hydrateInternal(): Promise<void> {
    this.loadingSignal.set(true);
    try {
      const response = await this.api.rotateSession();
      this.userSignal.set(this.toSessionUser(response.user));
      this.errorSignal.set(null);
    } catch {
      this.userSignal.set(null);
    } finally {
      this.loadedSignal.set(true);
      this.loadingSignal.set(false);
      this.hydratePromise = null;
    }
  }

  private clearSessionState() {
    this.userSignal.set(null);
    this.loadedSignal.set(true);
    this.loadingSignal.set(false);
    this.errorSignal.set(null);
  }

  private toSessionUser(user: AuthSession): SessionUser {
    return {
      ...user,
      primaryRole: resolvePrimaryRole(user.roleCodes)
    };
  }

  private toMessage(error: unknown): string {
    if (typeof error === 'object' && error && 'error' in error) {
      const response = error as { error?: { message?: string } };
      return response.error?.message ?? 'Request failed';
    }

    return 'Request failed';
  }
}
