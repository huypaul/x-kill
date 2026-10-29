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
    --target, -t  Target folder names to search (comma or space separated)
    --help        Show help
    --version     Show version

  Examples
    $ xkill
    $ xkill ./projects
    $ xkill --target node_modules, .next
    $ xkill -t node_modules -t .next
`,
  {
    importMeta: import.meta,
    flags: {
      target: {
        type: 'string',
        shortFlag: 't',
        isMultiple: true,
      },
    },
  }
);

const { searchDir, targets } = parseCliArgs(process.argv.slice(2));

render(<App baseDir={searchDir} targetNames={targets} />);
