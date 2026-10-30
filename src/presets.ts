import os from 'node:os';
import path from 'node:path';

export type PresetSafety = 'safe' | 'caution';

export interface PresetDefinition {
  name: string;
  description: string;
  defaultSearchDir?: () => string;
  targets?: string[];
  patterns?: string[];
  cleanEmpty?: boolean;
  safety: PresetSafety;
}

export const PRESETS: Record<string, PresetDefinition> = {
  'build-dirs': {
    name: 'build-dirs',
    description: 'Standard project build and dependency directories',
    targets: ['node_modules', '.next', 'dist', 'build', 'target'],
    safety: 'safe',
  },
  'appdata': {
    name: 'appdata',
    description: 'Windows AppData temporary files, crash dumps, and logs',
    defaultSearchDir: () => {
      if (process.env.LOCALAPPDATA) {
        return process.env.LOCALAPPDATA;
      }
      if (process.platform === 'win32') {
        return path.join(os.homedir(), 'AppData', 'Local');
      }
      return os.homedir();
    },
    targets: ['Temp', 'CrashDumps', 'logs'],
    patterns: ['*.tmp', '*.log', '*.dmp', 'thumbs.db'],
    safety: 'caution',
  },
  'temp': {
    name: 'temp',
    description: 'Operating system temporary directories and files',
    defaultSearchDir: () => os.tmpdir(),
    targets: ['Temp', 'tmp'],
    patterns: ['*.tmp', '*.log', '*.dmp'],
    safety: 'safe',
  },
  'dev-cache': {
    name: 'dev-cache',
    description: 'Package manager and compiler caches',
    targets: ['npm-cache', '.pnpm-store', 'pip/cache', 'yarn/Cache'],
    patterns: ['*.tmp'],
    safety: 'safe',
  },
};

export const PRESET_ALIASES: Record<string, string> = {
  default: 'build-dirs',
  node: 'build-dirs',
  'appdata-temp': 'appdata',
  'dev-caches': 'dev-cache',
};

export function resolvePreset(name: string): PresetDefinition | undefined {
  if (!name || typeof name !== 'string') {
    return undefined;
  }
  const normalized = name.trim().toLowerCase();
  const targetKey = Object.prototype.hasOwnProperty.call(PRESET_ALIASES, normalized)
    ? PRESET_ALIASES[normalized]
    : normalized;

  return Object.prototype.hasOwnProperty.call(PRESETS, targetKey)
    ? PRESETS[targetKey]
    : undefined;
}

export function listPresets(): PresetDefinition[] {
  return Object.values(PRESETS);
}
