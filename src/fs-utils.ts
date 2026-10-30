import fs from 'node:fs/promises';
import path from 'node:path';
import { fdir } from 'fdir';

export interface ScanResult {
  path: string;
  size: number;
  isDirectory: boolean;
  isEmpty?: boolean;
}

export interface ScanOptions {
  targetNames?: string[];
  patterns?: string[];
  cleanEmpty?: boolean;
  olderThanMs?: number;
  ignoredDirs?: string[];
  signal?: AbortSignal;
  onFound?: (item: ScanResult) => void;
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

function compileGlobPattern(pattern: string): { regex: RegExp; matchPath: boolean } {
  const matchPath = pattern.includes('/') || pattern.includes('\\');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  let regexStr = '^';
  for (let i = 0; i < normalizedPattern.length; i++) {
    const c = normalizedPattern[i];
    if (c === '*') {
      if (normalizedPattern[i + 1] === '*') {
        regexStr += '.*';
        i++;
      } else {
        regexStr += matchPath ? '[^/]*' : '.*';
      }
    } else if (c === '?') {
      regexStr += matchPath ? '[^/]' : '.';
    } else if (
      ['.', '+', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\'].includes(c)
    ) {
      regexStr += '\\' + c;
    } else {
      regexStr += c;
    }
  }
  regexStr += '$';
  return {
    regex: new RegExp(regexStr, 'i'),
    matchPath,
  };
}

/**
 * Recursively scans directories to find target directory/file names using fdir engine.
 */
export async function scanTargets(
  rootDir: string,
  optionsOrTargets?: ScanOptions | string[],
  onFound?: (item: ScanResult) => void,
  signal?: AbortSignal,
  ignoredDirs?: string[]
): Promise<ScanResult[]> {
  let targetNames: string[] | undefined;
  let patterns: string[] | undefined;
  let cleanEmpty: boolean | undefined;
  let olderThanMs: number | undefined;
  let ignoredDirsList: string[] = DEFAULT_IGNORED_DIRS;
  let onFoundCallback: ((item: ScanResult) => void) | undefined = onFound;
  let abortSignal: AbortSignal | undefined = signal;

  if (Array.isArray(optionsOrTargets)) {
    targetNames = optionsOrTargets;
    if (ignoredDirs) {
      ignoredDirsList = ignoredDirs;
    }
  } else if (optionsOrTargets && typeof optionsOrTargets === 'object') {
    targetNames = optionsOrTargets.targetNames;
    patterns = optionsOrTargets.patterns;
    cleanEmpty = optionsOrTargets.cleanEmpty;
    olderThanMs = optionsOrTargets.olderThanMs;
    if (optionsOrTargets.ignoredDirs) {
      ignoredDirsList = optionsOrTargets.ignoredDirs;
    }
    if (optionsOrTargets.onFound) {
      onFoundCallback = optionsOrTargets.onFound;
    }
    if (optionsOrTargets.signal) {
      abortSignal = optionsOrTargets.signal;
    }
  } else {
    if (ignoredDirs) {
      ignoredDirsList = ignoredDirs;
    }
  }

  if (!targetNames && !patterns && !cleanEmpty) {
    targetNames = ['node_modules', '.next', 'dist', 'build', 'target'];
  }

  if (abortSignal?.aborted) {
    return [];
  }

  try {
    const rootStat = await fs.lstat(rootDir);
    if (!rootStat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const targetSet = targetNames
    ? new Set(targetNames.filter((t) => !t.includes('/') && !t.includes('\\')))
    : null;
  const subpathTargets = (targetNames || [])
    .filter((t) => t.includes('/') || t.includes('\\'))
    .map((t) => t.replace(/\\/g, '/'));
  const compiledPatterns = patterns ? patterns.map(compileGlobPattern) : null;
  const ignoredSet = new Set(ignoredDirsList);

  function isMatch(name: string, relativePath: string): boolean {
    if (targetSet && targetSet.has(name)) {
      return true;
    }
    if (subpathTargets.length > 0) {
      const normalizedRel = relativePath.replace(/\\/g, '/');
      const lowerRel = normalizedRel.toLowerCase();
      for (const target of subpathTargets) {
        const lowerTarget = target.toLowerCase();
        if (
          normalizedRel === target ||
          normalizedRel.endsWith('/' + target) ||
          lowerRel === lowerTarget ||
          lowerRel.endsWith('/' + lowerTarget)
        ) {
          return true;
        }
      }
    }
    if (compiledPatterns) {
      const normalizedRel = relativePath.replace(/\\/g, '/');
      for (const p of compiledPatterns) {
        if (p.matchPath) {
          if (p.regex.test(normalizedRel)) return true;
        } else {
          if (p.regex.test(name)) return true;
        }
      }
    }
    return false;
  }

  const matchedDirs: string[] = [];
  const nonTargetDirs: string[] = [];

  let crawler = new fdir()
    .withFullPaths()
    .exclude((dirName, dirPath) => {
      if (ignoredSet.has(dirName)) return true;
      const fullDirPath = path.resolve(dirPath);
      const relPath = path.relative(rootDir, fullDirPath);
      if (isMatch(dirName, relPath)) {
        matchedDirs.push(fullDirPath);
        return true;
      }
      if (cleanEmpty) {
        nonTargetDirs.push(fullDirPath);
      }
      return false;
    })
    .filter((filePath) => {
      const fileName = path.basename(filePath);
      const relPath = path.relative(rootDir, filePath);
      return isMatch(fileName, relPath);
    });

  if (abortSignal) {
    crawler = crawler.withAbortSignal(abortSignal);
  }

  let matchedFiles: string[] = [];
  try {
    matchedFiles = (await crawler.crawl(rootDir).withPromise()) as string[];
  } catch {
    return [];
  }

  if (abortSignal?.aborted) {
    return [];
  }

  const results: ScanResult[] = [];

  for (const dirPath of matchedDirs) {
    if (abortSignal?.aborted) return results;

    if (olderThanMs !== undefined) {
      try {
        const stat = await fs.lstat(dirPath);
        if (Date.now() - stat.mtimeMs < olderThanMs) {
          continue;
        }
      } catch {
        continue;
      }
    }

    const size = await getPathSize(dirPath, abortSignal);
    if (abortSignal?.aborted) return results;

    const item: ScanResult = {
      path: dirPath,
      size,
      isDirectory: true,
      isEmpty: size === 0,
    };
    results.push(item);
    if (onFoundCallback) {
      onFoundCallback(item);
    }
  }

  for (const filePath of matchedFiles) {
    if (abortSignal?.aborted) return results;

    let size = 0;
    try {
      const stat = await fs.lstat(filePath);
      if (olderThanMs !== undefined && Date.now() - stat.mtimeMs < olderThanMs) {
        continue;
      }
      size = stat.size;
    } catch {
      continue;
    }

    const item: ScanResult = {
      path: filePath,
      size,
      isDirectory: false,
    };
    results.push(item);
    if (onFoundCallback) {
      onFoundCallback(item);
    }
  }

  if (cleanEmpty) {
    for (const emptyCandidate of nonTargetDirs) {
      if (abortSignal?.aborted) return results;
      try {
        if (olderThanMs !== undefined) {
          const stat = await fs.lstat(emptyCandidate);
          if (Date.now() - stat.mtimeMs < olderThanMs) {
            continue;
          }
        }
        const entries = await fs.readdir(emptyCandidate);
        if (entries.length === 0) {
          const item: ScanResult = {
            path: emptyCandidate,
            size: 0,
            isDirectory: true,
            isEmpty: true,
          };
          results.push(item);
          if (onFoundCallback) {
            onFoundCallback(item);
          }
        }
      } catch {
        // ignore unreadable dirs
      }
    }
  }

  return results;
}
