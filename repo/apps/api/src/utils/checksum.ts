import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';

export const sha256File = async (filePath: string): Promise<string> => {
  const hash = crypto.createHash('sha256');

  await new Promise<void>((resolve, reject) => {
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve())
      .on('error', reject);
  });

  return hash.digest('hex');
};

export const sha256Buffer = (buffer: Buffer): string => (
  crypto.createHash('sha256').update(buffer).digest('hex')
);
