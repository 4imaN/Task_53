export const redactSensitiveText = (value: string): string => value
  .replace(/\bpostgres(?:ql)?:\/\/[^\s)]+/gi, '[REDACTED_DSN]')
  .replace(/\b[\w.-]*(?:jwt|token|secret|password|encryption[_-]?key|api[_-]?key)[\w.-]*\s*[=:]\s*[^\s,;]+/gi, '[REDACTED_SECRET]')
  .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]');

export const sanitizeErrorForLog = (error: unknown): { name: string; message: string; stack?: string } => {
  if (!(error instanceof Error)) {
    return {
      name: 'Error',
      message: 'Unknown error'
    };
  }

  return {
    name: redactSensitiveText(error.name || 'Error'),
    message: redactSensitiveText(error.message || 'Internal server error'),
    stack: typeof error.stack === 'string' ? redactSensitiveText(error.stack) : undefined
  };
};

export const formatProcessErrorLog = (context: string, error: unknown) => JSON.stringify({
  event: 'process_error',
  context,
  error: sanitizeErrorForLog(error)
});

export const logProcessError = (
  context: string,
  error: unknown,
  writer: (entry: string) => void = (entry) => console.error(entry)
) => {
  writer(formatProcessErrorLog(context, error));
};
