import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer, sanitizeErrorForLog } from '../src/server.js';
import { AuthService } from '../src/services/auth.service.js';

describe('error response sanitization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitizes unhandled 500 responses from the global server error handler', async () => {
    const server = await buildServer();
    server.get('/api/_test/internal-error', async () => {
      const error = new Error('connection failed for postgres://internal-secret@db');
      error.name = 'DatabaseConnectionError';
      throw error;
    });
    await server.ready();

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/_test/internal-error'
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Internal server error'
      });
      expect(response.body).not.toContain('DatabaseConnectionError');
      expect(response.body).not.toContain('postgres://internal-secret@db');
    } finally {
      await server.close();
    }
  });

  it('sanitizes internal auth route failures and does not leak error details', async () => {
    vi.spyOn(AuthService.prototype, 'login').mockRejectedValueOnce(Object.assign(
      new Error('token signing failed with key material xxxxx'),
      {
        statusCode: 500,
        name: 'TokenSigningError',
        details: { internalReason: 'private-key-missing' }
      }
    ));

    const server = await buildServer();
    await server.ready();

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'admin',
          password: 'irrelevant'
        }
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Internal server error'
      });
      expect(response.body).not.toContain('TokenSigningError');
      expect(response.body).not.toContain('private-key-missing');
      expect(response.body).not.toContain('key material');
    } finally {
      await server.close();
    }
  });

  it('redacts secret-like values from server error logs', async () => {
    const capturedLogs: string[] = [];
    const server = await buildServer({
      logger: {
        level: 'error',
        stream: {
          write: (entry: string) => {
            capturedLogs.push(entry);
          }
        }
      }
    });

    server.get('/api/_test/log-redaction', async () => {
      const error = new Error('Failed with postgres://omnistock:supersecret@localhost:5432/app and Bearer abc.def.ghi');
      error.name = 'JWT_SECRET=topsecret';
      throw error;
    });
    await server.ready();

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/_test/log-redaction'
      });
      expect(response.statusCode).toBe(500);

      const mergedLogs = capturedLogs.join('\n');
      expect(mergedLogs).toContain('request_error');
      expect(mergedLogs).not.toContain('postgres://omnistock:supersecret@localhost:5432/app');
      expect(mergedLogs).not.toContain('Bearer abc.def.ghi');
      expect(mergedLogs).not.toContain('JWT_SECRET=topsecret');
      expect(mergedLogs).toContain('[REDACTED_DSN]');
      expect(mergedLogs).toContain('Bearer [REDACTED_TOKEN]');
      expect(mergedLogs).toContain('[REDACTED_SECRET]');
    } finally {
      await server.close();
    }
  });

  it('sanitizes standalone error payloads for logging helpers', () => {
    const sanitized = sanitizeErrorForLog(new Error('password=abc123 token=jwt-token'));
    expect(sanitized.message).not.toContain('abc123');
    expect(sanitized.message).not.toContain('jwt-token');
    expect(sanitized.message).toContain('[REDACTED_SECRET]');
  });
});
