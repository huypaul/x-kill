import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  formatBytes,
  getPathSize,
  scanTargets,
  DEFAULT_IGNORED_DIRS,
  type ScanOptions,
} from '../src/fs-utils.js';

describe('formatBytes', () => {
  it('formats zero and negative values to 0 B', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-100)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });

  it('formats bytes correctly', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes correctly', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes correctly', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(2621440, 1)).toBe('2.5 MB');
  });

  it('formats gigabytes and terabytes correctly', () => {
    expect(formatBytes(1024 ** 3)).toBe('1 GB');
    expect(formatBytes(1024 ** 4 * 2.5)).toBe('2.5 TB');
  });
});

describe('getPathSize', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'x-kill-size-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('returns 0 for non-existent path', async () => {
    const size = await getPathSize(path.join(testDir, 'non-existent'));
    expect(size).toBe(0);
  });

  it('returns correct size for a single file', async () => {
    const filePath = path.join(testDir, 'sample.txt');
    const content = Buffer.alloc(512, 'a');
    await fs.writeFile(filePath, content);

    const size = await getPathSize(filePath);
    expect(size).toBe(512);
  });

  it('recursively calculates directory size with nested items', async () => {
    const subDir = path.join(testDir, 'nested', 'deep');
    await fs.mkdir(subDir, { recursive: true });

    await fs.writeFile(path.join(testDir, 'root.txt'), Buffer.alloc(100, 'a'));
    await fs.writeFile(path.join(subDir, 'deep.txt'), Buffer.alloc(300, 'b'));

    const size = await getPathSize(testDir);
    expect(size).toBe(400);
  });

  it('cancels calculation when AbortSignal is triggered', async () => {
    const ac = new AbortController();
    ac.abort();

    const size = await getPathSize(testDir, ac.signal);
    expect(size).toBe(0);
  });
});

describe('scanTargets', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'x-kill-scan-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('discovers target directories and does not recurse into them', async () => {
    const targetDir = path.join(testDir, 'project-a', 'node_modules');
    const nestedInTarget = path.join(targetDir, 'sub-pkg', 'dist');
    await fs.mkdir(nestedInTarget, { recursive: true });

    await fs.writeFile(path.join(targetDir, 'package.json'), Buffer.alloc(120, 'c'));

    const foundItems: string[] = [];
    const results = await scanTargets(
      testDir,
      ['node_modules', 'dist'],
      (item) => foundItems.push(item.path)
    );

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(targetDir);
    expect(results[0].size).toBe(120);
    expect(results[0].isDirectory).toBe(true);
    expect(foundItems).toContain(targetDir);
    expect(foundItems).not.toContain(nestedInTarget);
  });

  it('skips ignored directories like .git', async () => {
    const gitDir = path.join(testDir, '.git', 'node_modules');
    await fs.mkdir(gitDir, { recursive: true });
    await fs.writeFile(path.join(gitDir, 'file.txt'), Buffer.alloc(50, 'd'));

    const results = await scanTargets(testDir, ['node_modules']);
    expect(results).toHaveLength(0);
  });

  it('aborts scan early when AbortSignal is triggered', async () => {
    const projectDir = path.join(testDir, 'node_modules');
    await fs.mkdir(projectDir, { recursive: true });

    const ac = new AbortController();
    ac.abort();

    const results = await scanTargets(testDir, ['node_modules'], undefined, ac.signal);
    expect(results).toHaveLength(0);
  });

  it('supports ScanOptions object syntax with targetNames and onFound', async () => {
    const targetDir = path.join(testDir, 'app', 'node_modules');
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, 'package.json'), Buffer.alloc(80, 'a'));

    const foundItems: string[] = [];
    const options: ScanOptions = {
      targetNames: ['node_modules'],
      onFound: (item) => foundItems.push(item.path),
    };

    const results = await scanTargets(testDir, options);
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(targetDir);
    expect(results[0].size).toBe(80);
    expect(results[0].isDirectory).toBe(true);
    expect(foundItems).toEqual([targetDir]);
  });

  it('supports patterns filter to discover matching files and folders', async () => {
    const tmpFile = path.join(testDir, 'cache.tmp');
    const logFile = path.join(testDir, 'app.log');
    const tmpDir = path.join(testDir, 'nested.tmp');
    const insideTmpDir = path.join(tmpDir, 'child.txt');
    const normalFile = path.join(testDir, 'index.ts');

    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(tmpFile, Buffer.alloc(100, 'x'));
    await fs.writeFile(logFile, Buffer.alloc(50, 'y'));
    await fs.writeFile(insideTmpDir, Buffer.alloc(200, 'z'));
    await fs.writeFile(normalFile, Buffer.alloc(300, 'n'));

    const results = await scanTargets(testDir, {
      patterns: ['*.tmp'],
    });

    const resultPaths = results.map((r) => r.path);
    expect(resultPaths).toContain(tmpFile);
    expect(resultPaths).toContain(tmpDir);
    expect(resultPaths).not.toContain(logFile);
    expect(resultPaths).not.toContain(normalFile);
    expect(resultPaths).not.toContain(insideTmpDir);

    const dirResult = results.find((r) => r.path === tmpDir);
    expect(dirResult?.isDirectory).toBe(true);
    expect(dirResult?.size).toBe(200);

    const fileResult = results.find((r) => r.path === tmpFile);
    expect(fileResult?.isDirectory).toBe(false);
    expect(fileResult?.size).toBe(100);
  });

  it('supports combining targetNames and patterns in ScanOptions', async () => {
    const nmDir = path.join(testDir, 'node_modules');
    const logFile = path.join(testDir, 'server.log');
    await fs.mkdir(nmDir, { recursive: true });
    await fs.writeFile(path.join(nmDir, 'lib.js'), Buffer.alloc(150, 'l'));
    await fs.writeFile(logFile, Buffer.alloc(75, 'm'));

    const results = await scanTargets(testDir, {
      targetNames: ['node_modules'],
      patterns: ['*.log'],
    });

    expect(results).toHaveLength(2);
    const paths = results.map((r) => r.path);
    expect(paths).toContain(nmDir);
    expect(paths).toContain(logFile);
  });

  it('aborts scan early when AbortSignal is triggered via ScanOptions', async () => {
    const projectDir = path.join(testDir, 'node_modules');
    await fs.mkdir(projectDir, { recursive: true });

    const ac = new AbortController();
    ac.abort();

    const results = await scanTargets(testDir, {
      targetNames: ['node_modules'],
      signal: ac.signal,
    });
    expect(results).toHaveLength(0);
  });

  it('detects empty directories when cleanEmpty is true', async () => {
    const emptyFolder = path.join(testDir, 'empty-folder');
    const nonEmptyFolder = path.join(testDir, 'non-empty-folder');
    await fs.mkdir(emptyFolder, { recursive: true });
    await fs.mkdir(nonEmptyFolder, { recursive: true });
    await fs.writeFile(path.join(nonEmptyFolder, 'file.txt'), 'hello');

    const results = await scanTargets(testDir, {
      cleanEmpty: true,
      targetNames: [],
    });

    const emptyResult = results.find((r) => r.path === emptyFolder);
    expect(emptyResult).toBeDefined();
    expect(emptyResult?.isEmpty).toBe(true);
    expect(emptyResult?.size).toBe(0);

    const nonEmptyResult = results.find((r) => r.path === nonEmptyFolder);
    expect(nonEmptyResult).toBeUndefined();
  });

  it('filters items by olderThanMs when specified', async () => {
    const oldFile = path.join(testDir, 'old.tmp');
    const newFile = path.join(testDir, 'new.tmp');
    await fs.writeFile(oldFile, 'old content');
    await fs.writeFile(newFile, 'new content');

    const pastTime = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
    await fs.utimes(oldFile, pastTime, pastTime);

    const results = await scanTargets(testDir, {
      patterns: ['*.tmp'],
      olderThanMs: 1000 * 60 * 10, // older than 10 mins
    });

    const paths = results.map((r) => r.path);
    expect(paths).toContain(oldFile);
    expect(paths).not.toContain(newFile);
  });
});
