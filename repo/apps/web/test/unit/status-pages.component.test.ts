import test from 'node:test';
import assert from 'node:assert/strict';
import { TestBed } from '@angular/core/testing';
import { DashboardPageComponent } from '../../src/app/features/dashboard/dashboard-page.component.ts';
import { InboxPageComponent } from '../../src/app/features/inbox/inbox-page.component.ts';
import { AuditPageComponent } from '../../src/app/features/audit/audit-page.component.ts';
import { ApiService, type AuditEntry, type InboxMessage, type MetricSummaryRow } from '../../src/app/core/services/api.service.ts';
import { setupAngularTestEnvironment } from './angular-test-setup.ts';

setupAngularTestEnvironment();

test('dashboard page shows error state and recovers on retry', async () => {
  let calls = 0;
  const rows: MetricSummaryRow[] = [
    { metric_type: 'review_resolution_sla', metric_value: 92.5, warehouse_id: null, period_end: '2026-04-01T00:00:00.000Z' }
  ];

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DashboardPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        metrics: async () => {
          calls += 1;
          if (calls === 1) {
            throw { error: { message: 'Metrics backend unavailable' } };
          }
          return rows;
        }
      }
    }]
  });

  const fixture = TestBed.createComponent(DashboardPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /metrics unavailable/i);

  (fixture.componentInstance as DashboardPageComponent).reload();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /92\.50%/i);
});

test('inbox page shows error state and recovers on retry', async () => {
  let calls = 0;
  const messages: InboxMessage[] = [
    { id: 'n-1', title: 'Case update', body: 'Reporter-safe update.', created_at: '2026-04-01T10:00:00.000Z', read_at: null }
  ];

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [InboxPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        inbox: async () => {
          calls += 1;
          if (calls === 1) {
            throw { error: { message: 'Inbox offline' } };
          }
          return messages;
        },
        markInboxItemRead: async () => undefined,
        markAllInboxRead: async () => undefined
      }
    }]
  });

  const fixture = TestBed.createComponent(InboxPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /inbox unavailable/i);

  await (fixture.componentInstance as InboxPageComponent).reload();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Case update/);
});

test('audit page shows error state and recovers on retry', async () => {
  let calls = 0;
  const entries: AuditEntry[] = [
    {
      timestamp: '2026-04-01T09:00:00.000Z',
      action_type: 'login',
      resource_type: 'user',
      resource_id: 'user-1',
      details: { outcome: 'success' },
      ip_address: '127.0.0.1',
      user_id: 'user-1'
    }
  ];

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AuditPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        auditLog: async () => {
          calls += 1;
          if (calls === 1) {
            throw { error: { message: 'Audit service unavailable' } };
          }
          return entries;
        }
      }
    }]
  });

  const fixture = TestBed.createComponent(AuditPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /audit log unavailable/i);

  await (fixture.componentInstance as AuditPageComponent).reload();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /login/);
  assert.match(fixture.nativeElement.textContent, /immutable operational and security events/i);
});
