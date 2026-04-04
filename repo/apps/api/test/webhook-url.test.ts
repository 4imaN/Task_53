import { describe, expect, it } from 'vitest';
import { validateInternalWebhookUrl } from '../src/services/webhook-url.service.js';

describe('validateInternalWebhookUrl', () => {
  it('accepts private IP targets and explicit allowlisted hostname targets', async () => {
    await expect(validateInternalWebhookUrl('https://192.168.10.20:9443/events')).resolves.toBe('https://192.168.10.20:9443/events');
    await expect(validateInternalWebhookUrl('http://127.0.0.1:8080/hook', { allowLoopback: true })).resolves.toBe('http://127.0.0.1:8080/hook');

    await expect(validateInternalWebhookUrl('http://warehouse-api.internal/hook', {
      allowedDomainSuffixes: ['internal'],
      resolveHostname: async () => [{ address: '10.24.0.9', family: 4 }]
    })).resolves.toBe('http://warehouse-api.internal/hook');
  });

  it('rejects public host resolution even when hostnames are allowlisted', async () => {
    await expect(validateInternalWebhookUrl('https://example.com/webhook', {
      allowedHostnames: ['example.com'],
      resolveHostname: async () => [{ address: '93.184.216.34', family: 4 }]
    })).rejects.toThrow(/private internal ip/i);
  });

  it('rejects multi-label hostnames that are not explicitly allowlisted', async () => {
    await expect(validateInternalWebhookUrl('https://hooks.service.cluster.local/event', {
      resolveHostname: async () => [{ address: '10.24.5.10', family: 4 }]
    })).rejects.toThrow(/not allowlisted/i);
  });

  it('rejects bare single-label hosts unless explicitly allowlisted', async () => {
    await expect(validateInternalWebhookUrl('http://warehouse-app/hook', {
      resolveHostname: async () => [{ address: '10.0.0.20', family: 4 }]
    })).rejects.toThrow(/single-label/i);

    await expect(validateInternalWebhookUrl('http://warehouse-app/hook', {
      allowedHostnames: ['warehouse-app'],
      resolveHostname: async () => [{ address: '10.0.0.20', family: 4 }]
    })).resolves.toBe('http://warehouse-app/hook');
  });

  it('rejects mixed safe and unsafe DNS resolution results', async () => {
    await expect(validateInternalWebhookUrl('https://hooks.internal.example.com/event', {
      allowedDomainSuffixes: ['internal.example.com'],
      resolveHostname: async () => [
        { address: '10.42.5.10', family: 4 },
        { address: '8.8.8.8', family: 4 }
      ]
    })).rejects.toThrow(/resolve only to private internal/i);
  });

  it('fails closed on malformed URLs, DNS failures, and non-http protocols', async () => {
    await expect(validateInternalWebhookUrl('https://queue.internal/hook', {
      allowedDomainSuffixes: ['internal'],
      resolveHostname: async () => {
        throw new Error('dns failure');
      }
    })).rejects.toThrow(/could not be resolved/i);
    await expect(validateInternalWebhookUrl('http://user:pass@127.0.0.1/hook')).rejects.toThrow(/embedded credentials/i);
    await expect(validateInternalWebhookUrl('ftp://127.0.0.1/hook')).rejects.toThrow(/http or https/i);
    await expect(validateInternalWebhookUrl('')).rejects.toThrow(/required/i);
  });
});
