import path from 'node:path';
import { resolvePreset } from './presets.js';

export interface CliParsedOptions {
  searchDir: string;
  targets?: string[];
  preset?: string;
  cleanEmpty?: boolean;
  olderThan?: string;
  olderThanMs?: number;
  trash?: boolean;
  patterns?: string[];
}

const DURATION_UNITS: Record<string, number> = {
  s: 1_000,
  m: 60 * 1_000,
  h: 60 * 60 * 1_000,
  d: 24 * 60 * 60 * 1_000,
  w: 7 * 24 * 60 * 60 * 1_000,
};

/**
 * Parses duration strings like '30d', '24h', '60m', '10s', '2w' into milliseconds.
 * Case-insensitive. Plain numbers with no unit are treated as days.
 * Returns undefined for invalid duration strings.
 */
export function parseDuration(val: string): number | undefined {
  if (!val || typeof val !== 'string') {
    return undefined;
  }
  const trimmed = val.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([smhdw])?$/i);
  if (!match) {
    return undefined;
  }
  const num = parseFloat(match[1]);
  if (Number.isNaN(num) || num < 0) {
    return undefined;
  }
  const unit = match[2]?.toLowerCase();
  const multiplier = unit ? DURATION_UNITS[unit] : DURATION_UNITS.d;
  if (!multiplier) {
    return undefined;
  }
  return Math.round(num * multiplier);
}

/**
 * Robustly parses CLI flags and positional arguments.
 * Handles single flags, multi-flags (-t a -t b), comma-separated lists (node_modules,.next),
 * space-separated lists (node_modules, .next), presets, patterns, cleanEmpty, olderThan, and trash flags.
 */
export function parseCliArgs(argv: string[]): CliParsedOptions {
  const targetTokens: string[] = [];
  const patternTokens: string[] = [];
  const positional: string[] = [];
  let presetToken: string | undefined;
  let cleanEmptyFlag: boolean | undefined;
  let trashFlag: boolean | undefined;
  let olderThanToken: string | undefined;
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '--target' || arg === '-t') {
      i++;
      while (i < argv.length && !argv[i].startsWith('-')) {
        const val = argv[i];
        targetTokens.push(val);
        i++;
        if (
          !val.endsWith(',') &&
          (i >= argv.length ||
            argv[i].startsWith('-') ||
            argv[i].includes('/') ||
            argv[i].includes('\\'))
        ) {
          break;
        }
      }
    } else if (arg.startsWith('--target=') || arg.startsWith('-t=')) {
      targetTokens.push(arg.slice(arg.indexOf('=') + 1));
      i++;
    } else if (arg === '--pattern') {
      i++;
      while (i < argv.length && !argv[i].startsWith('-')) {
        const val = argv[i];
        patternTokens.push(val);
        i++;
        if (
          !val.endsWith(',') &&
          (i >= argv.length ||
            argv[i].startsWith('-') ||
            argv[i].includes('/') ||
            argv[i].includes('\\'))
        ) {
          break;
        }
      }
    } else if (arg.startsWith('--pattern=')) {
      patternTokens.push(arg.slice(arg.indexOf('=') + 1));
      i++;
    } else if (arg === '--preset' || arg === '-p') {
      i++;
      if (i < argv.length && !argv[i].startsWith('-')) {
        presetToken = argv[i];
        i++;
      }
    } else if (arg.startsWith('--preset=') || arg.startsWith('-p=')) {
      presetToken = arg.slice(arg.indexOf('=') + 1);
      i++;
    } else if (arg === '--clean-empty' || arg === '--clean-empty=true') {
      cleanEmptyFlag = true;
      i++;
    } else if (arg === '--trash' || arg === '--trash=true') {
      trashFlag = true;
      i++;
    } else if (arg === '--older-than') {
      i++;
      if (i < argv.length && !argv[i].startsWith('-')) {
        olderThanToken = argv[i];
        i++;
      }
    } else if (arg.startsWith('--older-than=')) {
      olderThanToken = arg.slice(arg.indexOf('=') + 1);
      i++;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
      i++;
    } else {
      i++;
    }
  }

  const presetDef = presetToken ? resolvePreset(presetToken) : undefined;

  const userTargets =
    targetTokens.length > 0
      ? targetTokens
          .flatMap((t) => t.split(/[\s,]+/))
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

  const targets =
    userTargets !== undefined
      ? userTargets
      : presetDef?.targets
        ? [...presetDef.targets]
        : undefined;

  const userPatterns =
    patternTokens.length > 0
      ? patternTokens
          .flatMap((t) => t.split(/[\s,]+/))
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

  const patterns =
    userPatterns !== undefined
      ? userPatterns
      : presetDef?.patterns
        ? [...presetDef.patterns]
        : undefined;

  const rawDir = positional[0];
  let searchDir: string;
  if (rawDir) {
    searchDir = path.resolve(process.cwd(), rawDir);
  } else if (presetDef?.defaultSearchDir) {
    searchDir = path.resolve(presetDef.defaultSearchDir());
  } else {
    searchDir = process.cwd();
  }

  const cleanEmpty = cleanEmptyFlag ? true : (presetDef?.cleanEmpty ? true : undefined);
  const trash = trashFlag ? true : undefined;

  let olderThan: string | undefined;
  let olderThanMs: number | undefined;
  if (olderThanToken !== undefined) {
    olderThan = olderThanToken;
    olderThanMs = parseDuration(olderThanToken);
  }

  return {
    searchDir,
    targets,
    preset: presetToken,
    cleanEmpty,
    olderThan,
    olderThanMs,
    trash,
    patterns,
  };
}
