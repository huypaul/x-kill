import fs from 'node:fs/promises';
import path from 'node:path';
import trash from 'trash';

export interface DeleteResult {
  success: boolean;
  path: string;
  error?: string;
  isLocked?: boolean;
}

/**
 * Recursively changes file and directory permissions to writable.
 * Chmods directories to 0o777 and files to 0o666.
 */
export async function makeWritable(itemPath: string): Promise<void> {
  try {
    const stat = await fs.lstat(itemPath);
    if (stat.isDirectory()) {
      await fs.chmod(itemPath, 0o777).catch(() => {});
      const entries = await fs.readdir(itemPath, { withFileTypes: true }).catch(() => []);
      await Promise.all(
        entries.map((entry) => makeWritable(path.join(itemPath, entry.name)))
      );
    } else {
      await fs.chmod(itemPath, 0o666).catch(() => {});
    }
  } catch {
    // Ignore errors (e.g. non-existent files or permission errors during traversal)
  }
}

/**
 * Safely deletes a file or directory permanently or moves it to the OS trash / Recycle Bin.
 *
 * @param itemPath - Absolute or relative path to file or directory
 * @param useTrash - When true, moves to trash; when false, removes permanently with fs.rm
 * @param force - When true, resets read-only permissions and retries deletion if locked
 * @returns DeleteResult indicating outcome and classification of errors
 */
export async function deleteItem(
  itemPath: string,
  useTrash: boolean = false,
  force: boolean = false
): Promise<DeleteResult> {
  const performDelete = async () => {
    if (useTrash) {
      await trash(itemPath);
    } else {
      await fs.rm(itemPath, { recursive: true, force: true });
    }
  };

  if (force) {
    await makeWritable(itemPath);
  }

  try {
    await performDelete();
    return {
      success: true,
      path: itemPath,
    };
  } catch (err: unknown) {
    const errorObj = err as { code?: string; message?: string } | null;
    const code = errorObj?.code;
    const originalMessage =
      errorObj?.message ?? (typeof err === 'string' ? err : String(err));
    const normalizedMessage = originalMessage.toLowerCase();

    // Idempotent delete: target already gone
    if (code === 'ENOENT' || normalizedMessage.includes('no such file or directory')) {
      return {
        success: true,
        path: itemPath,
      };
    }

    // Locked file detection: EBUSY, EPERM, or matching error message phrases
    const isLocked =
      code === 'EBUSY' ||
      code === 'EPERM' ||
      normalizedMessage.includes('busy') ||
      normalizedMessage.includes('locked') ||
      normalizedMessage.includes('operation not permitted');

    if (force && isLocked) {
      try {
        await makeWritable(itemPath);
        await performDelete();
        return {
          success: true,
          path: itemPath,
        };
      } catch (retryErr: unknown) {
        const retryErrObj = retryErr as { code?: string; message?: string } | null;
        const retryCode = retryErrObj?.code;
        const retryOriginalMessage =
          retryErrObj?.message ?? (typeof retryErr === 'string' ? retryErr : String(retryErr));
        const retryNormalizedMessage = retryOriginalMessage.toLowerCase();

        if (retryCode === 'ENOENT' || retryNormalizedMessage.includes('no such file or directory')) {
          return {
            success: true,
            path: itemPath,
          };
        }

        const retryIsLocked =
          retryCode === 'EBUSY' ||
          retryCode === 'EPERM' ||
          retryNormalizedMessage.includes('busy') ||
          retryNormalizedMessage.includes('locked') ||
          retryNormalizedMessage.includes('operation not permitted');

        return {
          success: false,
          path: itemPath,
          error: retryIsLocked ? 'Item is in use by another process' : retryOriginalMessage,
          isLocked: retryIsLocked,
        };
      }
    }

    if (isLocked) {
      return {
        success: false,
        path: itemPath,
        error: 'Item is in use by another process',
        isLocked: true,
      };
    }

    // Generic error fallback
    return {
      success: false,
      path: itemPath,
      error: originalMessage,
      isLocked: false,
    };
  }
}
