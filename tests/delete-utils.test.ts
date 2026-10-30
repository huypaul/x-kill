import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import trash from 'trash';
import { deleteItem, type DeleteResult } from '../src/delete-utils.js';

vi.mock('trash', async (importOriginal) => {
  const actual = await importOriginal<typeof import('trash')>();
  const mockTrash = vi.fn(async (input: any, options?: any) => {
    return actual.default(input, options);
  });
  return {
    ...actual,
    default: mockTrash,
  };
});

describe('deleteItem', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'x-kill-delete-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    vi.restoreAllMocks();
  });

  describe('permanent deletion (useTrash = false)', () => {
    it('deletes a file permanently and returns success', async () => {
      const filePath = path.join(tempDir, 'test-file.txt');
      await fs.writeFile(filePath, 'hello world');

      const result = await deleteItem(filePath, false);

      expect(result).toEqual<DeleteResult>({
        success: true,
        path: filePath,
      });

      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it('deletes a directory recursively and returns success', async () => {
      const dirPath = path.join(tempDir, 'nested-dir');
      const filePath = path.join(dirPath, 'inner.txt');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(filePath, 'inner content');

      const result = await deleteItem(dirPath, false);

      expect(result).toEqual<DeleteResult>({
        success: true,
        path: dirPath,
      });

      await expect(fs.access(dirPath)).rejects.toThrow();
    });

    it('defaults useTrash to false when omitted', async () => {
      const filePath = path.join(tempDir, 'default-test.txt');
      await fs.writeFile(filePath, 'default delete');

      const result = await deleteItem(filePath);

      expect(result.success).toBe(true);
      expect(result.path).toBe(filePath);
      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it('is idempotent when target does not exist', async () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.txt');

      const result = await deleteItem(nonExistentPath, false);

      expect(result).toEqual<DeleteResult>({
        success: true,
        path: nonExistentPath,
      });
    });
  });

  describe('soft deletion (useTrash = true)', () => {
    it('moves an existing file to the trash and returns success', async () => {
      const filePath = path.join(tempDir, 'trash-test.txt');
      await fs.writeFile(filePath, 'trash me');

      const result = await deleteItem(filePath, true);

      expect(result).toEqual<DeleteResult>({
        success: true,
        path: filePath,
      });

      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it('is idempotent when trashing a non-existent path', async () => {
      const nonExistentPath = path.join(tempDir, 'no-such-trash.txt');

      const result = await deleteItem(nonExistentPath, true);

      expect(result).toEqual<DeleteResult>({
        success: true,
        path: nonExistentPath,
      });
    });
  });

  describe('locked file & error handling', () => {
    it('identifies EBUSY error as locked item', async () => {
      const targetPath = path.join(tempDir, 'busy-file.txt');
      const busyError: any = new Error('resource busy or locked');
      busyError.code = 'EBUSY';

      vi.spyOn(fs, 'rm').mockRejectedValueOnce(busyError);

      const result = await deleteItem(targetPath, false);

      expect(result).toEqual<DeleteResult>({
        success: false,
        path: targetPath,
        error: 'Item is in use by another process',
        isLocked: true,
      });
    });

    it('identifies EPERM error as locked item', async () => {
      const targetPath = path.join(tempDir, 'eperm-file.txt');
      const epermError: any = new Error('operation not permitted');
      epermError.code = 'EPERM';

      vi.spyOn(fs, 'rm').mockRejectedValueOnce(epermError);

      const result = await deleteItem(targetPath, false);

      expect(result).toEqual<DeleteResult>({
        success: false,
        path: targetPath,
        error: 'Item is in use by another process',
        isLocked: true,
      });
    });

    it('identifies locked error by message contents (busy / locked / operation not permitted)', async () => {
      const targetPath = path.join(tempDir, 'locked-by-message.txt');
      const errorWithoutCode = new Error('Cannot delete: file is locked by process 1234');

      vi.spyOn(fs, 'rm').mockRejectedValueOnce(errorWithoutCode);

      const result = await deleteItem(targetPath, false);

      expect(result).toEqual<DeleteResult>({
        success: false,
        path: targetPath,
        error: 'Item is in use by another process',
        isLocked: true,
      });
    });

    it('handles ENOENT error as success (idempotent)', async () => {
      const targetPath = path.join(tempDir, 'enoent-mock.txt');
      const enoentError: any = new Error('no such file or directory');
      enoentError.code = 'ENOENT';

      vi.spyOn(fs, 'rm').mockRejectedValueOnce(enoentError);

      const result = await deleteItem(targetPath, false);

      expect(result).toEqual<DeleteResult>({
        success: true,
        path: targetPath,
      });
    });

    it('returns generic error description for unknown errors', async () => {
      const targetPath = path.join(tempDir, 'generic-err.txt');
      const genericError: any = new Error('Disk read failure');
      genericError.code = 'EIO';

      vi.spyOn(fs, 'rm').mockRejectedValueOnce(genericError);

      const result = await deleteItem(targetPath, false);

      expect(result).toEqual<DeleteResult>({
        success: false,
        path: targetPath,
        error: 'Disk read failure',
        isLocked: false,
      });
    });

    it('identifies locked error when trash throws EBUSY', async () => {
      const targetPath = path.join(tempDir, 'trash-busy.txt');
      const busyError: any = new Error('resource busy or locked');
      busyError.code = 'EBUSY';

      vi.mocked(trash).mockRejectedValueOnce(busyError);

      const result = await deleteItem(targetPath, true);

      expect(result).toEqual<DeleteResult>({
        success: false,
        path: targetPath,
        error: 'Item is in use by another process',
        isLocked: true,
      });
    });

    it('handles generic error when trash throws unexpected failure', async () => {
      const targetPath = path.join(tempDir, 'trash-fail.txt');
      const trashError = new Error('Trash binary unavailable');

      vi.mocked(trash).mockRejectedValueOnce(trashError);

      const result = await deleteItem(targetPath, true);

      expect(result).toEqual<DeleteResult>({
        success: false,
        path: targetPath,
        error: 'Trash binary unavailable',
        isLocked: false,
      });
    });
  });
});
