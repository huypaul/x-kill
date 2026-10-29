# xkill

Interactive terminal UI tool to inspect and purge heavy dependency and build directories (`node_modules`, `.next`, `dist`, `build`, `target`).

---

## Features

- **Bounded Concurrency:** Iterative filesystem traversal capping concurrent disk I/O to 16 workers in 32-file chunks, preventing OS file descriptor exhaustion (`EMFILE`) in large dependency trees.
- **Interactive Terminal UI:** Built with Ink and React 19. Adapts dynamically to terminal viewport height with fixed-window scrolling and middle-path truncation.
- **Two-Step Deletion Safety:** Requires explicit confirmation (`y` / `n`) before executing recursive directory removal.
- **Graceful Cancellation:** Wires `AbortSignal` through filesystem operations, terminating in-flight I/O immediately on exit.
- **Flexible Argument Parsing:** Supports comma-separated, space-separated, and repeated `-t` / `--target` flags without positional path collisions.
- **VCS Pruning:** Skips `.git`, `.svn`, `.hg`, `.turbo`, and `.cache` folders by default.

---

## Project Structure

```
x-kill/
├── src/
│   ├── App.tsx          # Ink TUI root component (navigation, status, deletion)
│   ├── cli-parser.ts    # CLI argument tokenizer and path resolver
│   ├── fs-utils.ts      # Concurrent directory sizing and target scanner
│   └── index.tsx        # Binary entry point and CLI wrapper
├── tests/
│   ├── cli-args.test.ts # Unit tests for CLI flag parsing
│   └── fs-utils.test.ts # Unit tests for traversal, sizing, and cancellation
├── dist/                # Compiled ES module output
├── package.json
├── tsconfig.json
└── README.md
```

---

## Installation

### Global Install

```bash
# npm
npm install -g xkill

# pnpm
pnpm add -g xkill

# yarn
yarn global add xkill
```

### Run Directly via npx

```bash
npx xkill
# or
pnpm dlx xkill
```

---

## Usage

### Default Search

Scan the current working directory for default targets (`node_modules`, `.next`, `dist`, `build`, `target`):

```bash
xkill
```

### Target a Specific Directory

```bash
xkill ./projects
# or absolute path
xkill D:/Workspaces
```

### Custom Target Names

```bash
# Comma-separated
xkill --target node_modules,dist

# Comma with space
xkill --target node_modules, .next, build

# Space-separated
xkill --target node_modules .next

# Repeated short flags
xkill -t node_modules -t .next -t target
```

---

## Keybindings

| Key | Action |
|---|---|
| `Up` / `Down` | Move selection cursor |
| `Space` or `d` | Request deletion confirmation for selected item |
| `y` | Confirm and permanently delete directory |
| `n` or `Esc` | Cancel deletion prompt |
| `q` or `Esc` | Exit application |

---

## Development

```bash
# Install dependencies
pnpm install

# Run development watcher
pnpm dev

# Run test suites (Vitest)
pnpm test

# Build TypeScript to dist/ (NodeNext ESM)
pnpm run build
```

---

## License

ISC
