import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPageWindowLabel } from '../../src/app/features/search/search-utils.ts';

test('buildPageWindowLabel returns empty window when total is zero', () => {
  assert.equal(buildPageWindowLabel(1, 25, 0), '0-0 of 0');
});

test('buildPageWindowLabel returns bounded range for final page', () => {
  assert.equal(buildPageWindowLabel(3, 25, 56), '51-56 of 56');
});
