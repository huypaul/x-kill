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

  it('toggles selection with [Space] and displays [x] checkbox and Selected header', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkill-app-space-'));
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
        <App baseDir={tmpDir} targetNames={['node_modules']} />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin,
        }
      );

      await new Promise((r) => setTimeout(r, 400));
      // Press Space to select
      stdin.write(' ');
      await new Promise((r) => setTimeout(r, 200));

      instance.unmount();

      expect(output).toContain('[x]');
      expect(output).toContain('Selected: 1');
    } finally {
      process.stdin.isTTY = originalIsTTY;
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('selects all found items with "a" key', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkill-app-all-'));
    const dir1 = path.join(tmpDir, 'node_modules');
    const dir2 = path.join(tmpDir, 'dist');
    await fs.mkdir(dir1, { recursive: true });
    await fs.mkdir(dir2, { recursive: true });

    try {
      const stdout = new PassThrough();
      const stdin = createMockStdin();
      let output = '';
      stdout.on('data', (chunk) => {
        output += chunk.toString();
      });

      const instance = render(
        <App baseDir={tmpDir} targetNames={['node_modules', 'dist']} />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin,
        }
      );

      await new Promise((r) => setTimeout(r, 400));

      // Press 'a' to select all
      stdin.write('a');
      await new Promise((r) => setTimeout(r, 150));
      instance.unmount();

      expect(output).toContain('Selected: 2');
      expect(output).toContain('[x]');
    } finally {
      process.stdin.isTTY = originalIsTTY;
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('deselects all items when "a" key is pressed twice', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkill-app-all2-'));
    const dir1 = path.join(tmpDir, 'node_modules');
    const dir2 = path.join(tmpDir, 'dist');
    await fs.mkdir(dir1, { recursive: true });
    await fs.mkdir(dir2, { recursive: true });

    try {
      const stdout = new PassThrough();
      const stdin = createMockStdin();
      let output = '';
      stdout.on('data', (chunk) => {
        output += chunk.toString();
      });

      const instance = render(
        <App baseDir={tmpDir} targetNames={['node_modules', 'dist']} />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin,
        }
      );

      await new Promise((r) => setTimeout(r, 400));

      // Press 'a' to select all
      stdin.write('a');
      await new Promise((r) => setTimeout(r, 150));

      // Press 'a' again to deselect all
      stdin.write('a');
      await new Promise((r) => setTimeout(r, 150));
      instance.unmount();

      expect(output).not.toContain('Selected:');
      expect(output).toContain('[ ]');
    } finally {
      process.stdin.isTTY = originalIsTTY;
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('displays batch confirmation prompt when "d" is pressed with multiple selected items', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkill-app-batch-prompt-'));
    const dir1 = path.join(tmpDir, 'node_modules');
    const dir2 = path.join(tmpDir, 'dist');
    await fs.mkdir(dir1, { recursive: true });
    await fs.mkdir(dir2, { recursive: true });

    try {
      const stdout = new PassThrough();
      const stdin = createMockStdin();
      let output = '';
      stdout.on('data', (chunk) => {
        output += chunk.toString();
      });

      const instance = render(
        <App baseDir={tmpDir} targetNames={['node_modules', 'dist']} />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin,
        }
      );

      await new Promise((r) => setTimeout(r, 400));
      // Select all with 'a'
      stdin.write('a');
      await new Promise((r) => setTimeout(r, 100));

      // Press 'd' to open batch delete confirmation
      stdin.write('d');
      await new Promise((r) => setTimeout(r, 150));
      instance.unmount();

      expect(output).toContain('2 selected items');
      expect(output).toContain('Permanently delete');
    } finally {
      process.stdin.isTTY = originalIsTTY;
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('deletes all selected items in batch when "d" and then "y" are pressed', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const deleteSpy = vi.spyOn(deleteUtils, 'deleteItem').mockResolvedValue({
      success: true,
      path: '',
    });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkill-app-batch-'));
    const dir1 = path.join(tmpDir, 'node_modules');
    const dir2 = path.join(tmpDir, 'dist');
    await fs.mkdir(dir1, { recursive: true });
    await fs.mkdir(dir2, { recursive: true });

    try {
      const stdout = new PassThrough();
      const stdin = createMockStdin();
      let output = '';
      stdout.on('data', (chunk) => {
        output += chunk.toString();
      });

      const instance = render(
        <App baseDir={tmpDir} targetNames={['node_modules', 'dist']} />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin,
        }
      );

      await new Promise((r) => setTimeout(r, 400));
      // Select all with 'a'
      stdin.write('a');
      await new Promise((r) => setTimeout(r, 100));

      // Press 'd' to open batch delete confirmation
      stdin.write('d');
      await new Promise((r) => setTimeout(r, 100));

      // Confirm with 'y'
      stdin.write('y');
      await new Promise((r) => setTimeout(r, 300));
      instance.unmount();

      expect(deleteSpy).toHaveBeenCalledWith(dir1, false);
      expect(deleteSpy).toHaveBeenCalledWith(dir2, false);
      expect(output).toContain('✔ [DELETED]');
    } finally {
      deleteSpy.mockRestore();
      process.stdin.isTTY = originalIsTTY;
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('force deletes immediately via "f" key without confirmation prompt and passes force=true', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const deleteSpy = vi.spyOn(deleteUtils, 'deleteItem').mockResolvedValueOnce({
      success: true,
      path: '/mock/force/item',
    });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkill-app-forcekey-'));
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
        <App baseDir={tmpDir} targetNames={['node_modules']} />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin,
        }
      );

      await new Promise((r) => setTimeout(r, 400));
      // Press 'f' - should immediately delete without 'y'
      stdin.write('f');
      await new Promise((r) => setTimeout(r, 300));
      instance.unmount();

      expect(deleteSpy).toHaveBeenCalledWith(targetDir, false, true);
      expect(output).toContain('✔ [DELETED]');
      expect(output).not.toContain('Press [y] Confirm');
    } finally {
      deleteSpy.mockRestore();
      process.stdin.isTTY = originalIsTTY;
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('displays [Force] tag in header and bypasses confirmation when "d" is pressed with force=true', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const deleteSpy = vi.spyOn(deleteUtils, 'deleteItem').mockResolvedValueOnce({
      success: true,
      path: '/mock/forceprop/item',
    });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkill-app-forceprop-'));
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
        <App baseDir={tmpDir} targetNames={['node_modules']} force={true} />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin,
        }
      );

      await new Promise((r) => setTimeout(r, 400));

      // Press 'd' with force=true should trigger deletion without 'y'
      stdin.write('d');
      await new Promise((r) => setTimeout(r, 300));
      instance.unmount();

      expect(output).toContain('[Force]');
      expect(deleteSpy).toHaveBeenCalledWith(targetDir, false, true);
      expect(output).toContain('✔ [DELETED]');
      expect(output).not.toContain('Press [y] Confirm');
    } finally {
      deleteSpy.mockRestore();
      process.stdin.isTTY = originalIsTTY;
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('displays [Auto-Remove] tag and prompts confirmation on scan completion', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkill-app-autoremove-prompt-'));
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
        <App baseDir={tmpDir} targetNames={['node_modules']} autoRemove={true} />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin,
        }
      );

      // Wait for scan to complete and auto-remove confirmation to appear
      await new Promise((r) => setTimeout(r, 500));
      instance.unmount();

      expect(output).toContain('[Auto-Remove]');
      expect(output).toContain('[y]');
      expect(output).toContain('Confirm');
    } finally {
      process.stdin.isTTY = originalIsTTY;
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('executes deletion when autoRemove confirmation is accepted with "y"', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const deleteSpy = vi.spyOn(deleteUtils, 'deleteItem').mockResolvedValue({
      success: true,
      path: '',
    });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkill-app-autoremove-del-'));
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
        <App baseDir={tmpDir} targetNames={['node_modules']} autoRemove={true} />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin,
        }
      );

      // Wait for scan to complete and auto-remove confirmation to appear
      await new Promise((r) => setTimeout(r, 500));

      // Confirm auto-removal
      stdin.write('y');
      await new Promise((r) => setTimeout(r, 300));
      instance.unmount();

      expect(deleteSpy).toHaveBeenCalledWith(targetDir, false);
      expect(output).toContain('✔ [DELETED]');
    } finally {
      deleteSpy.mockRestore();
      process.stdin.isTTY = originalIsTTY;
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('auto-deletes immediately when autoRemove={true} and force={true}', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const deleteSpy = vi.spyOn(deleteUtils, 'deleteItem').mockResolvedValue({
      success: true,
      path: '',
    });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xkill-app-autoforce-'));
    const targetDir = path.join(tmpDir, 'node_modules');
    await fs.mkdir(targetDir, { recursive: true });

    try {
      const stdout = new PassThrough();
      let output = '';
      stdout.on('data', (chunk) => {
        output += chunk.toString();
      });

      const instance = render(
        <App
          baseDir={tmpDir}
          targetNames={['node_modules']}
          autoRemove={true}
          force={true}
        />,
        {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin: createMockStdin(),
        }
      );

      // Wait for scan to complete and auto-force deletion to execute
      await new Promise((r) => setTimeout(r, 600));
      instance.unmount();

      expect(output).toContain('[Auto-Remove]');
      expect(output).toContain('[Force]');
      expect(deleteSpy).toHaveBeenCalledWith(targetDir, false, true);
      expect(output).toContain('✔ [DELETED]');
      expect(output).not.toContain('Press [y] Confirm');
    } finally {
      deleteSpy.mockRestore();
      process.stdin.isTTY = originalIsTTY;
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
