export type RoleCode = 'administrator' | 'manager' | 'moderator' | 'catalog_editor' | 'warehouse_clerk';
export type LoginActor = 'administrator' | 'manager' | 'moderator' | 'catalog-editor' | 'warehouse-clerk';

const roleHomeMap: Record<RoleCode, string> = {
  administrator: '/workspace/administrator',
  manager: '/workspace/manager',
  moderator: '/workspace/moderator',
  catalog_editor: '/workspace/catalog-editor',
  warehouse_clerk: '/workspace/warehouse-clerk'
};

const roleLoginMap: Record<RoleCode, LoginActor> = {
  administrator: 'administrator',
  manager: 'manager',
  moderator: 'moderator',
  catalog_editor: 'catalog-editor',
  warehouse_clerk: 'warehouse-clerk'
};

const loginRouteMap: Array<{ actor: LoginActor; prefixes: string[] }> = [
  { actor: 'administrator', prefixes: ['/workspace/administrator', '/users', '/admin', '/audit'] },
  { actor: 'manager', prefixes: ['/workspace/manager', '/dashboard', '/warehouse', '/bulk'] },
  { actor: 'moderator', prefixes: ['/workspace/moderator', '/moderation'] },
  { actor: 'catalog-editor', prefixes: ['/workspace/catalog-editor'] },
  { actor: 'warehouse-clerk', prefixes: ['/workspace/warehouse-clerk', '/inventory', '/documents'] }
];

export const DEFAULT_LOGIN_URL = '/login/warehouse-clerk';

export function resolvePrimaryRole(roleCodes: string[]): RoleCode {
  const first = roleCodes[0];
  return (first && first in roleHomeMap ? first : 'warehouse_clerk') as RoleCode;
}

export function resolveHomeUrl(roleCodes: string[]): string {
  return roleHomeMap[resolvePrimaryRole(roleCodes)];
}

export function isAuthorizedForRoles(assignedRoles: readonly string[], requiredRoles: readonly string[]): boolean {
  return requiredRoles.length === 0 || requiredRoles.some((role) => assignedRoles.includes(role));
}

export function resolveLoginUrl(roleCodes: string[]): string {
  const actor = roleLoginMap[resolvePrimaryRole(roleCodes)];
  return `/login/${actor}`;
}

export function resolveLoginUrlForTarget(url: string | undefined): string {
  if (!url) {
    return DEFAULT_LOGIN_URL;
  }

  for (const entry of loginRouteMap) {
    if (entry.prefixes.some((prefix) => url.startsWith(prefix))) {
      return `/login/${entry.actor}`;
    }
  }

  return DEFAULT_LOGIN_URL;
}
