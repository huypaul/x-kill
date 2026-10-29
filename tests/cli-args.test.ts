import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { parseCliArgs } from '../src/cli-parser.js';

describe('parseCliArgs', () => {
  const cwd = process.cwd();

  it('defaults to cwd and undefined targets when no flags provided', () => {
    const res = parseCliArgs([]);
    expect(res.searchDir).toBe(cwd);
    expect(res.targets).toBeUndefined();
  });

  it('parses standard comma-separated targets: --target node_modules,.next', () => {
    const res = parseCliArgs(['--target', 'node_modules,.next']);
    expect(res.searchDir).toBe(cwd);
    expect(res.targets).toEqual(['node_modules', '.next']);
  });

  it('parses targets separated by comma and space: --target node_modules, .next', () => {
    const res = parseCliArgs(['--target', 'node_modules,', '.next']);
    expect(res.searchDir).toBe(cwd);
    expect(res.targets).toEqual(['node_modules', '.next']);
  });

  it('parses quoted targets with spaces: --target "node_modules, .next"', () => {
    const res = parseCliArgs(['--target', 'node_modules, .next']);
    expect(res.searchDir).toBe(cwd);
    expect(res.targets).toEqual(['node_modules', '.next']);
  });

  it('parses space-separated targets: --target node_modules .next', () => {
    const res = parseCliArgs(['--target', 'node_modules', '.next']);
    expect(res.searchDir).toBe(cwd);
    expect(res.targets).toEqual(['node_modules', '.next']);
  });

  it('parses shortflag -t with multiple targets: -t node_modules -t .next', () => {
    const res = parseCliArgs(['-t', 'node_modules', '-t', '.next']);
    expect(res.searchDir).toBe(cwd);
    expect(res.targets).toEqual(['node_modules', '.next']);
  });

  it('parses equals flag: --target=node_modules,.next', () => {
    const res = parseCliArgs(['--target=node_modules,.next']);
    expect(res.searchDir).toBe(cwd);
    expect(res.targets).toEqual(['node_modules', '.next']);
  });

  it('correctly distinguishes custom directory from targets', () => {
    const res = parseCliArgs(['./my-folder', '--target', 'node_modules,', '.next']);
    expect(res.searchDir).toBe(path.resolve(cwd, './my-folder'));
    expect(res.targets).toEqual(['node_modules', '.next']);
  });

  it('handles custom directory placed after targets', () => {
    const res = parseCliArgs(['--target', 'node_modules,', '.next', './my-folder']);
    expect(res.searchDir).toBe(path.resolve(cwd, './my-folder'));
    expect(res.targets).toEqual(['node_modules', '.next']);
  });
});
