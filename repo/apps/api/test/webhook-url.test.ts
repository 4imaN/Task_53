import { describe, expect, it } from 'vitest';
import { validateInternalWebhookUrl } from '../src/services/webhook-url.service.js';

describe('validateInternalWebhookUrl', () => {
  it('accepts internal-only targets used in offline deployments', () => {
    expect(validateInternalWebhookUrl('http://127.0.0.1:8080/hook')).toBe('http://127.0.0.1:8080/hook');
    expect(validateInternalWebhookUrl('http://inventory-api.internal/hooks')).toBe('http://inventory-api.internal/hooks');
    expect(validateInternalWebhookUrl('http://warehouse-app/hook')).toBe('http://warehouse-app/hook');
    expect(validateInternalWebhookUrl('https://192.168.10.20:9443/events')).toBe('https://192.168.10.20:9443/events');
  });

  it('rejects malformed or non-internal webhook targets', () => {
    expect(() => validateInternalWebhookUrl('https://example.com/hook')).toThrow(/internal network host/i);
    expect(() => validateInternalWebhookUrl('http://user:pass@127.0.0.1/hook')).toThrow(/embedded credentials/i);
    expect(() => validateInternalWebhookUrl('ftp://127.0.0.1/hook')).toThrow(/http or https/i);
    expect(() => validateInternalWebhookUrl('')).toThrow(/required/i);
  });
});
