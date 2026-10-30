import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { parseCliArgs, parseDuration } from '../src/cli-parser.js';
import { resolvePreset } from '../src/presets.js';

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

  it('parses --preset appdata with automatic searchDir, targets, and patterns', () => {
    const appdataPreset = resolvePreset('appdata');
    const expectedDir = appdataPreset?.defaultSearchDir ? appdataPreset.defaultSearchDir() : cwd;
    const res = parseCliArgs(['--preset', 'appdata']);
    expect(res.preset).toBe('appdata');
    expect(res.searchDir).toBe(path.resolve(expectedDir));
    expect(res.targets).toEqual(['Temp', 'CrashDumps', 'logs']);
    expect(res.patterns).toEqual(['*.tmp', '*.log', '*.dmp', 'thumbs.db']);
  });

  it('parses -p temp with automatic searchDir, targets, and patterns', () => {
    const res = parseCliArgs(['-p', 'temp']);
    expect(res.preset).toBe('temp');
    expect(res.searchDir).toBe(path.resolve(os.tmpdir()));
    expect(res.targets).toEqual(['Temp', 'tmp']);
    expect(res.patterns).toEqual(['*.tmp', '*.log', '*.dmp']);
  });

  it('parses --preset=temp and -p=temp equals syntax', () => {
    const res1 = parseCliArgs(['--preset=temp']);
    expect(res1.preset).toBe('temp');
    expect(res1.targets).toEqual(['Temp', 'tmp']);

    const res2 = parseCliArgs(['-p=temp']);
    expect(res2.preset).toBe('temp');
    expect(res2.targets).toEqual(['Temp', 'tmp']);
  });

  it('allows positional directory to override preset default search directory', () => {
    const res1 = parseCliArgs(['-p', 'appdata', './custom-search']);
    expect(res1.preset).toBe('appdata');
    expect(res1.searchDir).toBe(path.resolve(cwd, './custom-search'));
    expect(res1.targets).toEqual(['Temp', 'CrashDumps', 'logs']);

    const res2 = parseCliArgs(['./custom-search', '--preset', 'appdata']);
    expect(res2.preset).toBe('appdata');
    expect(res2.searchDir).toBe(path.resolve(cwd, './custom-search'));
  });

  it('allows explicit --target to override preset targets while keeping patterns', () => {
    const res = parseCliArgs(['-p', 'appdata', '--target', 'custom_cache']);
    expect(res.preset).toBe('appdata');
    expect(res.targets).toEqual(['custom_cache']);
    expect(res.patterns).toEqual(['*.tmp', '*.log', '*.dmp', 'thumbs.db']);
  });

  it('allows explicit --pattern to override preset patterns while keeping targets', () => {
    const res = parseCliArgs(['-p', 'appdata', '--pattern', '*.log, *.bak']);
    expect(res.preset).toBe('appdata');
    expect(res.targets).toEqual(['Temp', 'CrashDumps', 'logs']);
    expect(res.patterns).toEqual(['*.log', '*.bak']);
  });

  it('handles unknown preset gracefully without throwing', () => {
    const res = parseCliArgs(['--preset', 'unknown-preset']);
    expect(res.preset).toBe('unknown-preset');
    expect(res.searchDir).toBe(cwd);
    expect(res.targets).toBeUndefined();
    expect(res.patterns).toBeUndefined();
  });

  it('parses --clean-empty flag', () => {
    const res1 = parseCliArgs(['--clean-empty']);
    expect(res1.cleanEmpty).toBe(true);

    const res2 = parseCliArgs([]);
    expect(res2.cleanEmpty).toBeUndefined();
  });

  it('parses --trash flag', () => {
    const res1 = parseCliArgs(['--trash']);
    expect(res1.trash).toBe(true);

    const res2 = parseCliArgs([]);
    expect(res2.trash).toBeUndefined();
  });

  it('parses --older-than with duration string and computes olderThanMs', () => {
    const res = parseCliArgs(['--older-than', '30d']);
    expect(res.olderThan).toBe('30d');
    expect(res.olderThanMs).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('parses --older-than=24h syntax', () => {
    const res = parseCliArgs(['--older-than=24h']);
    expect(res.olderThan).toBe('24h');
    expect(res.olderThanMs).toBe(24 * 60 * 60 * 1000);
  });

  it('handles invalid --older-than gracefully with undefined olderThanMs', () => {
    const res = parseCliArgs(['--older-than', 'not-a-date']);
    expect(res.olderThan).toBe('not-a-date');
    expect(res.olderThanMs).toBeUndefined();
  });

  it('parses --pattern flag with comma-separated and repeated arguments', () => {
    const res1 = parseCliArgs(['--pattern', '*.tmp, *.log']);
    expect(res1.patterns).toEqual(['*.tmp', '*.log']);

    const res2 = parseCliArgs(['--pattern', '*.tmp', '--pattern', '*.log']);
    expect(res2.patterns).toEqual(['*.tmp', '*.log']);

    const res3 = parseCliArgs(['--pattern=*.tmp,*.log']);
    expect(res3.patterns).toEqual(['*.tmp', '*.log']);
  });
});

describe('parseDuration', () => {
  it('parses seconds, minutes, hours, days, and weeks', () => {
    expect(parseDuration('10s')).toBe(10 * 1000);
    expect(parseDuration('60m')).toBe(60 * 60 * 1000);
    expect(parseDuration('24h')).toBe(24 * 60 * 60 * 1000);
    expect(parseDuration('30d')).toBe(30 * 24 * 60 * 60 * 1000);
    expect(parseDuration('2w')).toBe(2 * 7 * 24 * 60 * 60 * 1000);
  });

  it('is case-insensitive', () => {
    expect(parseDuration('30D')).toBe(30 * 24 * 60 * 60 * 1000);
    expect(parseDuration('24H')).toBe(24 * 60 * 60 * 1000);
    expect(parseDuration('60M')).toBe(60 * 60 * 1000);
    expect(parseDuration('10S')).toBe(10 * 1000);
    expect(parseDuration('2W')).toBe(2 * 7 * 24 * 60 * 60 * 1000);
  });

  it('treats plain numbers without unit as days', () => {
    expect(parseDuration('30')).toBe(30 * 24 * 60 * 60 * 1000);
    expect(parseDuration('1')).toBe(24 * 60 * 60 * 1000);
  });

  it('parses fractional numbers', () => {
    expect(parseDuration('1.5d')).toBe(Math.round(1.5 * 24 * 60 * 60 * 1000));
    expect(parseDuration('0.5h')).toBe(Math.round(0.5 * 60 * 60 * 1000));
  });

  it('returns undefined for invalid duration strings', () => {
    expect(parseDuration('')).toBeUndefined();
    expect(parseDuration('abc')).toBeUndefined();
    expect(parseDuration('30x')).toBeUndefined();
    expect(parseDuration('-5d')).toBeUndefined();
    expect(parseDuration('d')).toBeUndefined();
  });
});
