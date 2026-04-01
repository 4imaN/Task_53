import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorizedForRoles, resolveHomeUrl, resolvePrimaryRole } from '../../src/app/core/auth/auth-utils.ts';

test('resolvePrimaryRole falls back to warehouse clerk', () => {
  assert.equal(resolvePrimaryRole([]), 'warehouse_clerk');
});

test('resolveHomeUrl maps administrator home correctly', () => {
  assert.equal(resolveHomeUrl(['administrator']), '/workspace/administrator');
});

test('isAuthorizedForRoles allows empty required roles and matching roles only', () => {
  assert.equal(isAuthorizedForRoles(['warehouse_clerk'], []), true);
  assert.equal(isAuthorizedForRoles(['warehouse_clerk'], ['manager']), false);
  assert.equal(isAuthorizedForRoles(['manager'], ['administrator', 'manager']), true);
});
