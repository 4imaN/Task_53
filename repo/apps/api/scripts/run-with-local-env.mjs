import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const apiDir = path.resolve(scriptDir, '..');

const envFiles = [
  path.join(apiDir, '.env'),
  path.join(apiDir, '.env.local')
];

const parseEnvFile = (fileContents) => {
  const entries = [];
  for (const rawLine of fileContents.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = rawLine.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = rawLine.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    let value = rawLine.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const inlineCommentIndex = value.indexOf(' #');
      if (inlineCommentIndex >= 0) {
        value = value.slice(0, inlineCommentIndex).trim();
      }
    }

    entries.push({ key, value });
  }

  return entries;
};

for (const envFile of envFiles) {
  if (!existsSync(envFile)) {
    continue;
  }

  const parsedEntries = parseEnvFile(readFileSync(envFile, 'utf8'));
  for (const { key, value } of parsedEntries) {
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

const requiredVars = ['JWT_SECRET', 'ENCRYPTION_KEY', 'DEFAULT_ADMIN_PASSWORD'];
const missingVars = requiredVars.filter((name) => !process.env[name] || !process.env[name].trim());

if (missingVars.length > 0) {
  console.error(
    `[omnistock-api] Missing required environment variables: ${missingVars.join(', ')}.\n`
    + 'Create apps/api/.env.local from apps/api/.env.example, set secure values, then rerun.'
  );
  process.exit(1);
}

const tsxCliPath = path.join(apiDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const tsxArgs = process.argv.slice(2);

if (!tsxArgs.length) {
  console.error('[omnistock-api] No tsx target provided.');
  process.exit(1);
}

const child = spawn(process.execPath, [tsxCliPath, ...tsxArgs], {
  cwd: apiDir,
  env: process.env,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
