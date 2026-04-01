import { describe, expect, it } from 'vitest';
import { validatePasswordComplexity } from '../src/utils/password-policy.js';

describe('validatePasswordComplexity', () => {
  it('accepts a compliant password', () => {
    expect(validatePasswordComplexity('StrongPass!234')).toEqual([]);
  });

  it('returns failures for a weak password', () => {
    const errors = validatePasswordComplexity('weak');
    expect(errors.length).toBeGreaterThan(1);
  });
});
