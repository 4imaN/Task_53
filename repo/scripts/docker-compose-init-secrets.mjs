import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const secretDir = process.env.OMNISTOCK_SECRET_DIR || '/run/omnistock-secrets';

const ensureSecretDir = () => {
  mkdirSync(secretDir, { recursive: true });
  chmodSync(secretDir, 0o700);
};

const generateHexSecret = (bytes = 32) => randomBytes(bytes).toString('hex');
const generateAdminPassword = () => `Omni-${randomBytes(18).toString('base64url')}A1!`;

const writeSecretIfMissing = (filename, fallbackValueFactory, providedValue) => {
  const filePath = join(secretDir, filename);
  if (existsSync(filePath)) {
    chmodSync(filePath, 0o600);
    return { filename, created: false };
  }

  const value = (providedValue || '').trim() || fallbackValueFactory();
  writeFileSync(filePath, `${value}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(filePath, 0o600);
  return { filename, created: true };
};

const main = () => {
  ensureSecretDir();

  const results = [
    writeSecretIfMissing('postgres_password', () => generateHexSecret(24), process.env.POSTGRES_PASSWORD),
    writeSecretIfMissing('jwt_secret', () => generateHexSecret(32), process.env.JWT_SECRET),
    writeSecretIfMissing('encryption_key', () => generateHexSecret(32), process.env.ENCRYPTION_KEY),
    writeSecretIfMissing('default_admin_password', generateAdminPassword, process.env.DEFAULT_ADMIN_PASSWORD)
  ];

  const created = results.filter((result) => result.created).map((result) => result.filename);
  const preserved = results.filter((result) => !result.created).map((result) => result.filename);

  if (created.length) {
    console.log(`Created runtime secrets: ${created.join(', ')}`);
  }

  if (preserved.length) {
    console.log(`Reused existing runtime secrets: ${preserved.join(', ')}`);
  }

  // Fail fast if any secret file ended up empty.
  for (const { filename } of results) {
    const filePath = join(secretDir, filename);
    if (!readFileSync(filePath, 'utf8').trim()) {
      throw new Error(`Runtime secret file ${filename} is empty`);
    }
  }
};

main();
