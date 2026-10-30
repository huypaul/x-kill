import fs from 'node:fs/promises';
import trash from 'trash';

export interface DeleteResult {
  success: boolean;
  path: string;
  error?: string;
  isLocked?: boolean;
}

/**
 * Safely deletes a file or directory permanently or moves it to the OS trash / Recycle Bin.
 *
 * @param itemPath - Absolute or relative path to file or directory
 * @param useTrash - When true, moves to trash; when false, removes permanently with fs.rm
 * @returns DeleteResult indicating outcome and classification of errors
 */
export async function deleteItem(
  itemPath: string,
  useTrash: boolean = false
): Promise<DeleteResult> {
  try {
    if (useTrash) {
      await trash(itemPath);
    } else {
      await fs.rm(itemPath, { recursive: true, force: true });
    }
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
    if (
      code === 'EBUSY' ||
      code === 'EPERM' ||
      normalizedMessage.includes('busy') ||
      normalizedMessage.includes('locked') ||
      normalizedMessage.includes('operation not permitted')
    ) {
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
