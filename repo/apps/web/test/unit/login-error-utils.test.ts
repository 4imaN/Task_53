import test from 'node:test';
import assert from 'node:assert/strict';
import { describeCaptchaLoadFailure, describeLoginPrecheckFailure, describeLoginRequestFailure } from '../../src/app/features/auth/login-error-utils.ts';

test('describeLoginPrecheckFailure returns a stable inline message', () => {
  assert.equal(
    describeLoginPrecheckFailure({ error: { message: 'Service unavailable' } }),
    'Login precheck failed: Service unavailable'
  );
});

test('describeCaptchaLoadFailure returns a stable inline message', () => {
  assert.equal(
    describeCaptchaLoadFailure({ error: { message: 'Captcha service offline' } }),
    'CAPTCHA load failed: Captcha service offline'
  );
});

test('describeLoginRequestFailure preserves invalid credential messaging', () => {
  assert.equal(
    describeLoginRequestFailure({ error: { message: 'Invalid username or password' } }),
    'Invalid username or password.'
  );
});

test('describeLoginRequestFailure falls back to a general request error', () => {
  assert.equal(
    describeLoginRequestFailure(null),
    'Login request failed. Check the local API connection and try again.'
  );
});
