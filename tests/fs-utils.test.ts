import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  formatBytes,
  getPathSize,
  scanTargets,
  DEFAULT_IGNORED_DIRS,
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
});
