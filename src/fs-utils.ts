import fs from 'node:fs/promises';
import path from 'node:path';

export interface ScanResult {
  path: string;
  size: number;
  isDirectory: boolean;
}

export const DEFAULT_IGNORED_DIRS = [
  '.git',
  '.svn',
  '.hg',
  '.turbo',
  '.cache',
];

/**
 * Format bytes to human readable string (KB, MB, GB, etc.)
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes <= 0 || isNaN(bytes)) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1
  );
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

type SizeQueueItem =
  | { type: 'dir'; dirPath: string }
  | { type: 'files'; filePaths: string[] };

/**
 * Iteratively calculates total size of a file or directory using bounded concurrency.
 */
export async function getPathSize(
  itemPath: string,
  signal?: AbortSignal,
  maxConcurrency: number = 16
): Promise<number> {
  if (signal?.aborted) return 0;

  try {
    const rootStat = await fs.lstat(itemPath);
    if (!rootStat.isDirectory()) {
      return rootStat.size;
    }
  } catch {
    return 0;
  }

  let totalSize = 0;
  const queue: SizeQueueItem[] = [{ type: 'dir', dirPath: itemPath }];
  let activeWorkers = 0;

  return new Promise<number>((resolve) => {
    let resolved = false;

    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve(totalSize);
      }
    };

    if (signal?.aborted) {
      done();
      return;
    }

    signal?.addEventListener('abort', done, { once: true });

    const pump = () => {
      if (resolved) return;

      if (queue.length === 0 && activeWorkers === 0) {
        done();
        return;
      }

      while (activeWorkers < maxConcurrency && queue.length > 0 && !resolved) {
        const item = queue.shift()!;
        activeWorkers++;

        if (item.type === 'dir') {
          fs.readdir(item.dirPath, { withFileTypes: true })
            .then((entries) => {
              if (resolved || signal?.aborted) return;
              const files: string[] = [];
              for (const entry of entries) {
                const fullPath = path.join(item.dirPath, entry.name);
                if (entry.isDirectory()) {
                  if (!entry.isSymbolicLink()) {
                    queue.push({ type: 'dir', dirPath: fullPath });
                  }
                } else {
                  files.push(fullPath);
                }
              }

              const CHUNK_SIZE = 32;
              for (let i = 0; i < files.length; i += CHUNK_SIZE) {
                queue.push({
                  type: 'files',
                  filePaths: files.slice(i, i + CHUNK_SIZE),
                });
              }
            })
            .catch(() => {})
            .finally(() => {
              activeWorkers--;
              pump();
            });
        } else {
          Promise.all(
            item.filePaths.map(async (filePath) => {
              if (signal?.aborted) return 0;
              try {
                const stat = await fs.lstat(filePath);
                return stat.size;
              } catch {
                return 0;
              }
            })
          )
            .then((sizes) => {
              if (!resolved && !signal?.aborted) {
                for (const sz of sizes) {
                  totalSize += sz;
                }
              }
            })
            .finally(() => {
              activeWorkers--;
              pump();
            });
        }
      }
    };

    pump();
  });
}

/**
 * Recursively scans directories to find target directory/file names.
 */
export async function scanTargets(
  rootDir: string,
  targetNames: string[] = ['node_modules', '.next', 'dist', 'build', 'target'],
  onFound?: (item: ScanResult) => void,
  signal?: AbortSignal,
  ignoredDirs: string[] = DEFAULT_IGNORED_DIRS
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  const ignoredSet = new Set(ignoredDirs);

  async function traverse(currentDir: string): Promise<void> {
    if (signal?.aborted) return;

    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (signal?.aborted) return;
      const fullPath = path.join(currentDir, entry.name);

      if (targetNames.includes(entry.name)) {
        const size = await getPathSize(fullPath, signal);
        if (signal?.aborted) return;

        const item: ScanResult = {
          path: fullPath,
          size,
          isDirectory: entry.isDirectory(),
        };
        results.push(item);
        if (onFound) onFound(item);
        continue;
      }

      if (
        entry.isDirectory() &&
        !entry.isSymbolicLink() &&
        !ignoredSet.has(entry.name)
      ) {
        await traverse(fullPath);
      }
    }
  }

  await traverse(rootDir);
  return results;
}
