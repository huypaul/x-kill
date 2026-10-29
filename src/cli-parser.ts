import path from 'node:path';

export interface CliParsedOptions {
  searchDir: string;
  targets?: string[];
}

/**
 * Robustly parses CLI flags and positional arguments.
 * Handles single flags, multi-flags (-t a -t b), comma-separated lists (node_modules,.next),
 * space-separated lists (node_modules, .next), and distinguishes target folders from search directories.
 */
export function parseCliArgs(argv: string[]): CliParsedOptions {
  const targetTokens: string[] = [];
  const positional: string[] = [];
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
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
      i++;
    } else {
      i++;
    }
  }

  const targets =
    targetTokens.length > 0
      ? targetTokens
          .flatMap((t) => t.split(/[\s,]+/))
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

  const rawDir = positional[0];
  const searchDir = rawDir ? path.resolve(process.cwd(), rawDir) : process.cwd();

  return { searchDir, targets };
}
