import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import {
  PRESETS,
  resolvePreset,
  listPresets,
  type PresetDefinition,
  type PresetSafety,
} from '../src/presets.js';

describe('PRESETS catalog', () => {
  it('defines the 4 required presets', () => {
    expect(Object.keys(PRESETS).sort()).toEqual([
      'appdata',
      'build-dirs',
      'dev-cache',
      'temp',
    ]);
  });

  it('defines build-dirs preset with expected configuration', () => {
    const preset = PRESETS['build-dirs'];
    expect(preset.name).toBe('build-dirs');
    expect(preset.safety).toBe('safe');
    expect(preset.description).toBe('Standard project build and dependency directories');
    expect(preset.targets).toEqual(['node_modules', '.next', 'dist', 'build', 'target']);
    expect(preset.patterns).toBeUndefined();
    expect(preset.defaultSearchDir).toBeUndefined();
  });

  it('defines appdata preset with expected configuration', () => {
    const preset = PRESETS['appdata'];
    expect(preset.name).toBe('appdata');
    expect(preset.safety).toBe('caution');
    expect(preset.description).toBe('Windows AppData temporary files, crash dumps, and logs');
    expect(preset.targets).toEqual(['Temp', 'CrashDumps', 'logs']);
    expect(preset.patterns).toEqual(['*.tmp', '*.log', '*.dmp', 'thumbs.db']);
    expect(typeof preset.defaultSearchDir).toBe('function');
  });

  it('defines temp preset with expected configuration', () => {
    const preset = PRESETS['temp'];
    expect(preset.name).toBe('temp');
    expect(preset.safety).toBe('safe');
    expect(preset.description).toBe('Operating system temporary directories and files');
    expect(preset.targets).toEqual(['Temp', 'tmp']);
    expect(preset.patterns).toEqual(['*.tmp', '*.log', '*.dmp']);
    expect(typeof preset.defaultSearchDir).toBe('function');
  });

  it('defines dev-cache preset with expected configuration', () => {
    const preset = PRESETS['dev-cache'];
    expect(preset.name).toBe('dev-cache');
    expect(preset.safety).toBe('safe');
    expect(preset.description).toBe('Package manager and compiler caches');
    expect(preset.targets).toEqual(['npm-cache', '.pnpm-store', 'pip/cache', 'yarn/Cache']);
    expect(preset.patterns).toEqual(['*.tmp']);
    expect(preset.defaultSearchDir).toBeUndefined();
  });
});

describe('resolvePreset', () => {
  it('resolves preset names exactly', () => {
    expect(resolvePreset('build-dirs')?.name).toBe('build-dirs');
    expect(resolvePreset('appdata')?.name).toBe('appdata');
    expect(resolvePreset('temp')?.name).toBe('temp');
    expect(resolvePreset('dev-cache')?.name).toBe('dev-cache');
  });

  it('resolves preset names case-insensitively and with whitespace', () => {
    expect(resolvePreset('AppData')?.name).toBe('appdata');
    expect(resolvePreset('TEMP')?.name).toBe('temp');
    expect(resolvePreset('  Build-Dirs  ')?.name).toBe('build-dirs');
    expect(resolvePreset('Dev-Cache')?.name).toBe('dev-cache');
  });

  it('resolves "default" alias to build-dirs', () => {
    expect(resolvePreset('default')?.name).toBe('build-dirs');
    expect(resolvePreset('DEFAULT')?.name).toBe('build-dirs');
    expect(resolvePreset('  Default  ')?.name).toBe('build-dirs');
  });

  it('resolves aliases node, appdata-temp, and dev-caches', () => {
    expect(resolvePreset('node')?.name).toBe('build-dirs');
    expect(resolvePreset('NODE')?.name).toBe('build-dirs');
    expect(resolvePreset('appdata-temp')?.name).toBe('appdata');
    expect(resolvePreset('dev-caches')?.name).toBe('dev-cache');
  });

  it('guards against prototype pollution and unknown preset names', () => {
    expect(resolvePreset('toString')).toBeUndefined();
    expect(resolvePreset('valueOf')).toBeUndefined();
    expect(resolvePreset('__proto__')).toBeUndefined();
    expect(resolvePreset('unknown')).toBeUndefined();
    expect(resolvePreset('')).toBeUndefined();
    expect(resolvePreset('   ')).toBeUndefined();
    expect(resolvePreset('node_modules')).toBeUndefined();
  });
});

describe('listPresets', () => {
  it('returns all defined presets in an array', () => {
    const list = listPresets();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(4);
    const names = list.map((p) => p.name).sort();
    expect(names).toEqual(['appdata', 'build-dirs', 'dev-cache', 'temp']);
  });
});

describe('defaultSearchDir', () => {
  const originalEnv = process.env.LOCALAPPDATA;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.LOCALAPPDATA = originalEnv;
    } else {
      delete process.env.LOCALAPPDATA;
    }
  });

  it('returns os.tmpdir() for temp preset', () => {
    const tempPreset = resolvePreset('temp');
    expect(tempPreset?.defaultSearchDir).toBeDefined();
    expect(tempPreset?.defaultSearchDir?.()).toBe(os.tmpdir());
  });

  it('resolves LOCALAPPDATA environment variable when present for appdata preset', () => {
    process.env.LOCALAPPDATA = 'C:\\Custom\\AppData\\Local';
    const appdataPreset = resolvePreset('appdata');
    expect(appdataPreset?.defaultSearchDir).toBeDefined();
    expect(appdataPreset?.defaultSearchDir?.()).toBe('C:\\Custom\\AppData\\Local');
  });

  it('falls back appropriately when LOCALAPPDATA is unset for appdata preset', () => {
    delete process.env.LOCALAPPDATA;
    const appdataPreset = resolvePreset('appdata');
    const resolvedDir = appdataPreset?.defaultSearchDir?.();
    expect(typeof resolvedDir).toBe('string');
    expect(resolvedDir?.length).toBeGreaterThan(0);

    if (process.platform === 'win32') {
      expect(resolvedDir).toBe(path.join(os.homedir(), 'AppData', 'Local'));
    } else {
      expect(resolvedDir).toBe(os.homedir());
    }
  });
});
