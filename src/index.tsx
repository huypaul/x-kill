#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import App from './App.js';
import { parseCliArgs } from './cli-parser.js';

meow(
  `
  Usage
    $ xkill [options] [path]

  Options
    --target, -t     Target folder names to search (comma or space separated)
    --preset, -p     Target preset (build-dirs, appdata, temp, dev-cache)
    --pattern        Glob pattern to match files or folders
    --clean-empty    Find and delete empty directories
    --older-than     Filter targets older than duration (e.g. 30d, 24h, 60m)
    --trash          Move items to OS trash / Recycle Bin instead of permanent deletion
    --help           Show help
    --version        Show version

  Examples
    $ xkill
    $ xkill ./projects
    $ xkill --preset appdata
    $ xkill --preset build-dirs --trash
    $ xkill --preset dev-cache
    $ xkill --target node_modules, .next
    $ xkill -t node_modules -t .next
    $ xkill --pattern "*.log" --older-than 30d
    $ xkill --clean-empty --trash
`,
  {
    importMeta: import.meta,
    flags: {
      target: {
        type: 'string',
        shortFlag: 't',
        isMultiple: true,
      },
      preset: {
        type: 'string',
        shortFlag: 'p',
      },
      pattern: {
        type: 'string',
        isMultiple: true,
      },
      cleanEmpty: {
        type: 'boolean',
      },
      olderThan: {
        type: 'string',
      },
      trash: {
        type: 'boolean',
      },
    },
  }
);

const cliOptions = parseCliArgs(process.argv.slice(2));

render(
  <App
    baseDir={cliOptions.searchDir}
    targetNames={cliOptions.targets}
    preset={cliOptions.preset}
    patterns={cliOptions.patterns}
    cleanEmpty={cliOptions.cleanEmpty}
    olderThanMs={cliOptions.olderThanMs}
    trash={cliOptions.trash}
  />
);
