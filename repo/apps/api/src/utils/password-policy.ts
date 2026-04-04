import argon2 from 'argon2';
import { config } from '../config.js';

export class PasswordPolicyError extends Error {
  readonly statusCode = 422;

  constructor(readonly failures: string[], message = failures.join(' ')) {
    super(message);
    this.name = 'PasswordPolicyError';
  }
}

export const validatePasswordComplexity = (password: string): string[] => {
  const failures: string[] = [];

  if (password.length < 12) {
    failures.push('Password must be at least 12 characters long.');
  }
  if (!/[A-Z]/.test(password)) {
    failures.push('Password must include an uppercase letter.');
  }
  if (!/[a-z]/.test(password)) {
    failures.push('Password must include a lowercase letter.');
  }
  if (!/[0-9]/.test(password)) {
    failures.push('Password must include a digit.');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    failures.push('Password must include a special character.');
  }

  return failures;
};

export const assertPasswordComplexity = (password: string, options?: { subject?: string }) => {
  const failures = validatePasswordComplexity(password);
  if (!failures.length) {
    return;
  }

  const prefix = options?.subject ? `${options.subject} does not satisfy the password policy. ` : '';
  throw new PasswordPolicyError(failures, `${prefix}${failures.join(' ')}`);
};

export const hashPassword = async (password: string) => {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: config.argon2MemoryCost,
    timeCost: config.argon2TimeCost,
    parallelism: config.argon2Parallelism
  });
};
