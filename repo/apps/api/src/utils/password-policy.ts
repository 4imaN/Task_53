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
