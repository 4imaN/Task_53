import { describe, expect, it } from 'vitest';
import { summarizeWebhookPayloadForStorage } from '../src/services/webhook-delivery.service.js';

describe('webhook delivery payload storage', () => {
  it('stores only a minimized summary instead of raw nested payload content', () => {
    const summary = summarizeWebhookPayloadForStorage({
      departmentCode: 'district-ops',
      eventVersion: 2,
      records: [
        { sku: 'SKU-1001', quantity: 4, itemName: 'Sensitive nested payload' }
      ],
      metadata: {
        correlationId: 'abc-123',
        source: 'integration-test'
      }
    });

    expect(summary).toEqual({
      kind: 'summary',
      topLevelKeys: ['departmentCode', 'eventVersion', 'metadata', 'records'],
      scalarFields: {
        departmentCode: 'district-ops',
        eventVersion: 2
      },
      collectionCounts: {
        records: 1
      },
      hasNestedObjects: true
    });
    expect(JSON.stringify(summary)).not.toContain('SKU-1001');
    expect(JSON.stringify(summary)).not.toContain('Sensitive nested payload');
    expect(JSON.stringify(summary)).not.toContain('abc-123');
  });
});
