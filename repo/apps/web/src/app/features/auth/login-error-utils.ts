function readErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = error as {
    message?: string;
    error?: {
      message?: string;
    } | string;
  };

  if (typeof candidate.error === 'string' && candidate.error.trim()) {
    return candidate.error.trim();
  }

  if (candidate.error && typeof candidate.error === 'object' && typeof candidate.error.message === 'string' && candidate.error.message.trim()) {
    return candidate.error.message.trim();
  }

  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return candidate.message.trim();
  }

  return null;
}

export function describeLoginPrecheckFailure(error: unknown) {
  const message = readErrorMessage(error);
  if (message && message.toLowerCase() !== 'http failure response for /api/auth/login-hints: 0 unknown error') {
    return `Login precheck failed: ${message}`;
  }

  return 'Login precheck failed. The local authentication service did not return login requirements. Try again.';
}

export function describeCaptchaLoadFailure(error: unknown) {
  const message = readErrorMessage(error);
  if (message && message.toLowerCase() !== 'http failure response for /api/auth/captcha: 0 unknown error') {
    return `CAPTCHA load failed: ${message}`;
  }

  return 'CAPTCHA load failed. Refresh the challenge and try again.';
}

export function describeLoginRequestFailure(error: unknown) {
  const message = readErrorMessage(error);
  if (!message) {
    return 'Login request failed. Check the local API connection and try again.';
  }

  const normalized = message.toLowerCase();
  if (normalized.includes('invalid username or password')) {
    return 'Invalid username or password.';
  }

  if (normalized.includes('captcha')) {
    return message;
  }

  return message;
}
