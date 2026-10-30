import React from 'react';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Console } from 'node:console';
import { render } from 'ink';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import App from '../src/App.js';
import * as deleteUtils from '../src/delete-utils.js';

function createMockStdin(): NodeJS.ReadStream {
  const stream = new PassThrough() as any;
  stream.isTTY = true;
  stream.setRawMode = () => stream;
  stream.isRaw = true;
  stream.ref = () => stream;
  stream.unref = () => stream;
  return stream;
}

describe('App TUI Component', () => {
  beforeAll(() => {
    if (!console.Console) {
      (console as any).Console = Console;
    }
  });

  it('renders preset and mode tags in header', async () => {
    const stdout = new PassThrough();
    let output = '';
    stdout.on('data', (chunk) => {
      output += chunk.toString();
    });

    const instance = render(
      <App
        baseDir="/mock/test/dir"
        preset="appdata-temp"
        trash={true}
        cleanEmpty={true}
        olderThanMs={86400000}
      />,
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stdin: createMockStdin(),
      }
    );

    await new Promise((r) => setTimeout(r, 100));
    instance.unmount();

    expect(output).toContain('Preset:');
    expect(output).toContain('appdata-temp');
    expect(output).toContain('[Recycle Bin]');
    expect(output).toContain('[Empty Dirs]');
    expect(output).toContain('[Filtered Age]');
  });

  it('renders [EMPTY] badge for empty scanned directories', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkill-app-empty-'));
    const emptySub = path.join(tmpDir, 'empty_dir');
    await fs.mkdir(emptySub, { recursive: true });

    try {
      const stdout = new PassThrough();
      let output = '';
      stdout.on('data', (chunk) => {
        output += chunk.toString();
      });

      const instance = render(
        <App
          baseDir={tmpDir}
          targetNames={['empty_dir']}
          cleanEmpty={true}
        />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin: createMockStdin(),
        }
      );

      await new Promise((r) => setTimeout(r, 400));
      instance.unmount();

      expect(output).toContain('[EMPTY]');
      expect(output).toContain('empty_dir');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('displays trash confirmation prompt when deleting in trash mode', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkill-app-trash-'));
    const targetDir = path.join(tmpDir, 'node_modules');
    await fs.mkdir(targetDir, { recursive: true });

    try {
      const stdout = new PassThrough();
      const stdin = createMockStdin();
      let output = '';
      stdout.on('data', (chunk) => {
        output += chunk.toString();
      });

      const instance = render(
        <App
          baseDir={tmpDir}
          targetNames={['node_modules']}
          trash={true}
        />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin,
        }
      );

      await new Promise((r) => setTimeout(r, 400));
      stdin.write('d');
      await new Promise((r) => setTimeout(r, 200));
      instance.unmount();

      expect(output).toContain('Move');
      expect(output).toContain('Recycle Bin');
      expect(output).toContain('Press [y] Confirm');
    } finally {
      process.stdin.isTTY = originalIsTTY;
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('displays permanent delete confirmation prompt when trash is false', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkill-app-perm-'));
    const targetDir = path.join(tmpDir, 'node_modules');
    await fs.mkdir(targetDir, { recursive: true });

    try {
      const stdout = new PassThrough();
      const stdin = createMockStdin();
      let output = '';
      stdout.on('data', (chunk) => {
        output += chunk.toString();
      });

      const instance = render(
        <App
          baseDir={tmpDir}
          targetNames={['node_modules']}
          trash={false}
        />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin,
        }
      );

      await new Promise((r) => setTimeout(r, 400));
      stdin.write('d');
      await new Promise((r) => setTimeout(r, 200));
      instance.unmount();

      expect(output).toContain('Permanently delete');
      expect(output).toContain('Confirm');
      expect(output).toContain('[y]');
    } finally {
      process.stdin.isTTY = originalIsTTY;
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('renders 🔒 [LOCKED] badge when deletion fails due to locked item', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const deleteSpy = vi.spyOn(deleteUtils, 'deleteItem').mockResolvedValueOnce({
      success: false,
      path: '/mock/locked/item',
      error: 'Item is in use by another process',
      isLocked: true,
    });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkill-app-locked-'));
    const targetDir = path.join(tmpDir, 'node_modules');
    await fs.mkdir(targetDir, { recursive: true });

    try {
      const stdout = new PassThrough();
      const stdin = createMockStdin();
      let output = '';
      stdout.on('data', (chunk) => {
        output += chunk.toString();
      });

      const instance = render(
        <App
          baseDir={tmpDir}
          targetNames={['node_modules']}
        />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin,
        }
      );

      await new Promise((r) => setTimeout(r, 400));
      // Press 'd' to confirm dialog, then 'y' to attempt delete
      stdin.write('d');
      await new Promise((r) => setTimeout(r, 100));
      stdin.write('y');
      await new Promise((r) => setTimeout(r, 300));
      instance.unmount();

      expect(deleteSpy).toHaveBeenCalledWith(targetDir, false);
      expect(output).toContain('🔒 [LOCKED]');
      expect(output).toContain('LOCKED (in use)');
    } finally {
      deleteSpy.mockRestore();
      process.stdin.isTTY = originalIsTTY;
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('calls deleteItem with useTrash=true when trash option is true', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const deleteSpy = vi.spyOn(deleteUtils, 'deleteItem').mockResolvedValueOnce({
      success: true,
      path: '/mock/trash/item',
    });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkill-app-trashdel-'));
    const targetDir = path.join(tmpDir, 'node_modules');
    await fs.mkdir(targetDir, { recursive: true });

    try {
      const stdout = new PassThrough();
      const stdin = createMockStdin();
      let output = '';
      stdout.on('data', (chunk) => {
        output += chunk.toString();
      });

      const instance = render(
        <App
          baseDir={tmpDir}
          targetNames={['node_modules']}
          trash={true}
        />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin,
        }
      );

      await new Promise((r) => setTimeout(r, 400));
      stdin.write('d');
      await new Promise((r) => setTimeout(r, 100));
      stdin.write('y');
      await new Promise((r) => setTimeout(r, 300));
      instance.unmount();

      expect(deleteSpy).toHaveBeenCalledWith(targetDir, true);
      expect(output).toContain('✔ [DELETED]');
    } finally {
      deleteSpy.mockRestore();
      process.stdin.isTTY = originalIsTTY;
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
