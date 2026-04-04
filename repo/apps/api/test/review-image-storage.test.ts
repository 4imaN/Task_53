import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00]);

describe('ReviewImageStorageService', () => {
  const originalUploadRoot = process.env.UPLOAD_ROOT;
  let tmpRoot: string | null = null;

  const createService = async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'omnistock-upload-root-'));
    process.env.UPLOAD_ROOT = tmpRoot;
    vi.resetModules();
    const { ReviewImageStorageService } = await import('../src/services/review-image-storage.service.js');

    return {
      service: new ReviewImageStorageService({} as any),
      root: tmpRoot
    };
  };

  const createFile = (filename: string, mimetype: string, buffer: Buffer) => ({
    filename,
    mimetype,
    toBuffer: async () => buffer
  });

  afterEach(async () => {
    process.env.UPLOAD_ROOT = originalUploadRoot;
    vi.resetModules();
    if (tmpRoot) {
      await rm(tmpRoot, { recursive: true, force: true });
      tmpRoot = null;
    }
  });

  it('stores uploads under the configured root using a server-generated filename', async () => {
    const { service, root } = await createService();
    const result = await service.storeUpload(createFile('review.png', 'image/png', pngBuffer));

    expect(result.filePath.startsWith(root)).toBe(true);
    expect(path.basename(result.filePath)).toMatch(/^[0-9a-f-]+\.png$/);
    expect(result.mimeType).toBe('image/png');

    const stats = await stat(result.filePath);
    expect(stats.isFile()).toBe(true);
  });

  it('rejects forward-slash traversal attempts without writing anything', async () => {
    const { service, root } = await createService();

    await expect(service.storeUpload(createFile('../escape.png', 'image/png', pngBuffer))).rejects.toMatchObject({
      statusCode: 422,
      message: 'Image filename contains an invalid path'
    });

    const entries = existsSync(root) ? await readdir(root) : [];
    expect(entries).toEqual([]);
  });

  it('rejects backslash and absolute-path-like filenames', async () => {
    const { service } = await createService();

    await expect(service.storeUpload(createFile('..\\escape.png', 'image/png', pngBuffer))).rejects.toMatchObject({
      statusCode: 422,
      message: 'Image filename contains an invalid path'
    });

    await expect(service.storeUpload(createFile('/tmp/escape.png', 'image/png', pngBuffer))).rejects.toMatchObject({
      statusCode: 422,
      message: 'Image filename contains an invalid path'
    });

    await expect(service.storeUpload(createFile('C:\\temp\\escape.png', 'image/png', pngBuffer))).rejects.toMatchObject({
      statusCode: 422,
      message: 'Image filename contains an invalid path'
    });
  });

  it('rejects ambiguous and mismatched filename extensions', async () => {
    const { service } = await createService();

    await expect(service.storeUpload(createFile('avatar.php.png', 'image/png', pngBuffer))).rejects.toMatchObject({
      statusCode: 422,
      message: 'Image filename uses an ambiguous extension'
    });

    await expect(service.storeUpload(createFile('avatar.jpg', 'image/png', pngBuffer))).rejects.toMatchObject({
      statusCode: 422,
      message: 'Image filename extension does not match the uploaded file type'
    });
  });

  it('rejects MIME declarations that do not match the uploaded content', async () => {
    const { service } = await createService();

    await expect(service.storeUpload(createFile('avatar.png', 'image/png', jpegBuffer))).rejects.toMatchObject({
      statusCode: 422,
      message: 'Declared image type does not match the uploaded file'
    });
  });
});
