import { describe, expect, it, vi } from 'vitest';
import { formatProcessErrorLog, logProcessError } from '../src/utils/error-logging.js';

describe('process error logging', () => {
  it('redacts sensitive startup error details before they are written', () => {
    const entry = formatProcessErrorLog(
      'api_startup',
      new Error('Failed to connect to postgres://omnistock:supersecret@localhost:5432/app with Bearer abc.def.ghi')
    );

    expect(entry).toContain('"context":"api_startup"');
    expect(entry).not.toContain('postgres://omnistock:supersecret@localhost:5432/app');
    expect(entry).not.toContain('Bearer abc.def.ghi');
    expect(entry).toContain('[REDACTED_DSN]');
    expect(entry).toContain('Bearer [REDACTED_TOKEN]');
  });

  it('routes maintenance-path failures through the same sanitized logging helper', () => {
    const writer = vi.fn();

    logProcessError(
      'db_migrate',
      Object.assign(new Error('JWT_SECRET=topsecret password=adminpass'), {
        name: 'MigrationFailure'
      }),
      writer
    );

    expect(writer).toHaveBeenCalledTimes(1);
    const payload = writer.mock.calls[0][0] as string;
    expect(payload).toContain('"context":"db_migrate"');
    expect(payload).not.toContain('topsecret');
    expect(payload).not.toContain('adminpass');
    expect(payload).toContain('[REDACTED_SECRET]');
  });
});
