import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

type MultipartFileLike = {
  filename: string;
  mimetype: string;
  toBuffer: () => Promise<Buffer>;
};

const uploadError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

const MIME_EXTENSION_ALIASES: Record<string, Set<string>> = {
  'image/jpeg': new Set(['jpg', 'jpeg']),
  'image/png': new Set(['png']),
  'image/webp': new Set(['webp']),
  'image/gif': new Set(['gif'])
};

const AMBIGUOUS_EXTENSION_SEGMENTS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'svg',
  'php',
  'phtml',
  'exe',
  'dll',
  'sh',
  'bash',
  'js',
  'ts',
  'cmd',
  'bat'
]);

const isWithinRoot = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const detectImageMime = (buffer: Buffer): string | null => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  const gifHeader = buffer.subarray(0, 6).toString('ascii');
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    return 'image/gif';
  }

  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
};

export class ReviewImageStorageService {
  constructor(private readonly fastify: FastifyInstance) {}

  async storeUpload(file: MultipartFileLike) {
    const originalFilename = this.validateOriginalFilename(file.filename, file.mimetype);
    const buffer = await file.toBuffer();

    if (buffer.byteLength > 10 * 1024 * 1024) {
      throw uploadError(422, 'Image exceeds 10 MB limit');
    }

    const detectedMime = detectImageMime(buffer);
    if (!detectedMime || !(detectedMime in MIME_TO_EXTENSION)) {
      throw uploadError(422, 'Unsupported image format');
    }

    if (file.mimetype !== detectedMime) {
      throw uploadError(422, 'Declared image type does not match the uploaded file');
    }

    const uploadRoot = path.resolve(config.uploadRoot);
    const storageDir = path.resolve(uploadRoot, 'review-images', new Date().toISOString().slice(0, 10));
    if (!isWithinRoot(uploadRoot, storageDir)) {
      throw uploadError(500, 'Resolved upload directory is invalid');
    }

    await mkdir(storageDir, { recursive: true });

    const filename = `${randomUUID()}.${MIME_TO_EXTENSION[detectedMime]}`;
    const filePath = path.resolve(storageDir, filename);
    if (!isWithinRoot(uploadRoot, filePath)) {
      throw uploadError(500, 'Resolved upload path is invalid');
    }

    await writeFile(filePath, buffer);

    return {
      buffer,
      filePath,
      mimeType: detectedMime,
      originalFilename
    };
  }

  private validateOriginalFilename(filename: string, mimeType: string) {
    if (!(mimeType in MIME_EXTENSION_ALIASES)) {
      throw uploadError(422, 'Unsupported image format');
    }

    const trimmed = String(filename ?? '').trim();
    if (!trimmed) {
      throw uploadError(422, 'Image filename is required');
    }

    if (
      trimmed.includes('\0')
      || trimmed.includes('/')
      || trimmed.includes('\\')
      || trimmed.startsWith('/')
      || /^[A-Za-z]:[\\/]/.test(trimmed)
      || trimmed === '.'
      || trimmed === '..'
    ) {
      throw uploadError(422, 'Image filename contains an invalid path');
    }

    const basename = path.posix.basename(trimmed);
    if (basename !== trimmed) {
      throw uploadError(422, 'Image filename contains an invalid path');
    }

    const suffixes = basename
      .split('.')
      .slice(1)
      .map((suffix) => suffix.trim().toLowerCase())
      .filter(Boolean);

    if (!suffixes.length) {
      return trimmed;
    }

    const finalSuffix = suffixes[suffixes.length - 1];
    if (!MIME_EXTENSION_ALIASES[mimeType].has(finalSuffix)) {
      throw uploadError(422, 'Image filename extension does not match the uploaded file type');
    }

    const intermediateSuffixes = suffixes.slice(0, -1);
    if (intermediateSuffixes.some((suffix) => AMBIGUOUS_EXTENSION_SEGMENTS.has(suffix))) {
      throw uploadError(422, 'Image filename uses an ambiguous extension');
    }

    return trimmed;
  }
}
