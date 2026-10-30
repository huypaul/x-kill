# Fast Scanner & AppData Cleanup Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `x-kill` into a high-performance system and workspace cleanup CLI using `fdir` for rapid filesystem traversal, supporting AppData presets (`%TEMP%`, caches, logs), empty folder detection, age-based filters, and soft deletion into Windows Recycle Bin.

**Architecture:** 
1. **Crawler Layer (`src/fs-utils.ts`)**: Replace manual recursive traversal with `fdir` while retaining bounded concurrency for calculating target sizes and respecting `AbortSignal`.
2. **Preset & Rule Engine (`src/presets.ts`)**: Modular presets (`appdata`, `temp`, `dev-cache`) providing pattern and path rules.
3. **CLI Parser Layer (`src/cli-parser.ts`)**: Extended argument parser accepting `--preset` / `-p`, `--clean-empty`, `--older-than`, `--trash`, and custom file/folder patterns.
4. **Safety & Deletion Layer (`src/delete-utils.ts`)**: Soft deletion to Recycle Bin (`trash`), and resilient error handling for locked files (`EBUSY`, `EPERM`).
5. **Interactive TUI Layer (`src/App.tsx`)**: Ink UI badges (`[SAFE]`, `[EMPTY]`, `[LOCKED]`), category headers, and safe bulk actions.

**Tech Stack:**
- Node.js ESM, TypeScript 7.0+, React 19, Ink 8.0
- `fdir` (ultra-fast async directory crawler)
- `trash` (cross-platform soft deletion to Recycle Bin)
- Vitest 5.0

## Global Constraints
- Preserve non-TTY protection and interactive navigation in Ink TUI.
- Zero data loss: require confirmation before deletion; default to safe deletion in system presets.
- Surgical edits only: no breaking changes to existing `--target` and positional search directory syntax.
- All unit tests must pass via `node ./node_modules/vitest/vitest.mjs run`.

## Review Focus
1. **Windows Path Separators**: Normalizing backslashes vs forward slashes when matching `AppData\Local` rules.
2. **File Locks (`EBUSY`)**: Handling files held open by running background processes without crashing the scan or deletion batch.
3. **Permissions (`EPERM` / `EACCES`)**: Gracefully skipping protected system directories in `AppData`.
4. **Symbolic Links / Junctions**: Preventing infinite recursive loops by ignoring symlinks during size calculation.
5. **Empty Folder Invalidation**: An empty folder might become non-empty or deleted during traversal.

---

### Task 1: Add `fdir` & `trash` Dependencies and Fix Package Manager Engine

**Files:**
- Modify: `package.json`
- Test: `tests/fs-utils.test.ts`

**Interfaces:**
- Consumes: `fdir` package
- Produces: Installed dependencies ready for ESM import

- [ ] **Step 1: Update package.json to relax devEngines and add `fdir` and `trash`**
Adjust `package.json` so npm/pnpm can install dependencies without engine mismatch blocking.
- [ ] **Step 2: Run dependency installation**
Run: `npm install fdir trash` or `pnpm add fdir trash`
- [ ] **Step 3: Verify existing tests still run and pass**
Run: `node ./node_modules/vitest/vitest.mjs run`
Expected: 21 tests pass

---

### Task 2: Implement High-Performance Directory Crawler with `fdir` in `src/fs-utils.ts`

**Files:**
- Modify: `src/fs-utils.ts`
- Modify: `tests/fs-utils.test.ts`

**Interfaces:**
- Consumes: `fdir`
- Produces:
  ```ts
  export interface ScanOptions {
    targetNames?: string[];
    patterns?: string[];
    cleanEmpty?: boolean;
    olderThanMs?: number;
    ignoredDirs?: string[];
    signal?: AbortSignal;
    onFound?: (item: ScanResult) => void;
  }
  export async function scanTargets(rootDir: string, options?: ScanOptions): Promise<ScanResult[]>;
  ```

- [ ] **Step 1: Write unit tests for `fdir`-based scanning with pattern and ignore matching**
Add tests in `tests/fs-utils.test.ts` verifying pattern matching, cancellation, and speed.
- [ ] **Step 2: Verify tests fail before implementation**
Run: `node ./node_modules/vitest/vitest.mjs run tests/fs-utils.test.ts`
- [ ] **Step 3: Refactor `scanTargets` in `src/fs-utils.ts` to use `fdir` crawler**
Use `fdir` with `withFullPaths()`, crawling directories and applying target name/pattern filters, computing sizes with `getPathSize`.
- [ ] **Step 4: Verify all tests pass**
Run: `node ./node_modules/vitest/vitest.mjs run tests/fs-utils.test.ts`
Expected: All tests PASS.

---

### Task 3: Preset Catalog & Rules (`src/presets.ts`)

**Files:**
- Create: `src/presets.ts`
- Test: `tests/presets.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PresetDefinition {
    name: string;
    description: string;
    defaultSearchDir?: () => string;
    targets: string[];
    patterns?: string[];
    safety: 'safe' | 'caution';
  }
  export const PRESETS: Record<string, PresetDefinition>;
  export function resolvePreset(name: string): PresetDefinition | undefined;
  ```

- [ ] **Step 1: Write tests for preset lookup and path expansion**
Test `appdata`, `temp`, `dev-cache` presets in `tests/presets.test.ts`.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `src/presets.ts`**
Define rules for `appdata` (`%LOCALAPPDATA%\Temp`, crash dumps, logs), `dev-cache` (`npm-cache`, `.pnpm-store`, `yarn/Cache`), and `temp`.
- [ ] **Step 4: Verify tests pass**
Run: `node ./node_modules/vitest/vitest.mjs run tests/presets.test.ts`

---

### Task 4: CLI Flags Expansion (`src/cli-parser.ts`)

**Files:**
- Modify: `src/cli-parser.ts`
- Modify: `tests/cli-args.test.ts`

**Interfaces:**
- Produces:
  ```ts
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
  ```

- [ ] **Step 1: Write unit tests for new flags in `tests/cli-args.test.ts`**
Test `--preset appdata`, `-p temp`, `--clean-empty`, `--older-than 30d`, `--trash`, `--pattern "*.log,*.tmp"`.
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement new flag parsers and duration converter in `src/cli-parser.ts`**
- [ ] **Step 4: Run tests to verify pass**
Run: `node ./node_modules/vitest/vitest.mjs run tests/cli-args.test.ts`

---

### Task 5: Safety Guardrails, Soft Delete & Locked File Handling

**Files:**
- Create: `src/delete-utils.ts`
- Test: `tests/delete-utils.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface DeleteResult {
    success: boolean;
    path: string;
    error?: string;
    isLocked?: boolean;
  }
  export async function deleteItem(itemPath: string, useTrash: boolean): Promise<DeleteResult>;
  ```

- [ ] **Step 1: Write unit tests for `deleteItem` with permanent delete vs soft delete (`trash`) and error classification**
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement `deleteItem` in `src/delete-utils.ts`**
Handle `trash(itemPath)`, fallback to `fs.rm`, and map `EBUSY` / `EPERM` to `isLocked: true`.
- [ ] **Step 4: Run tests to verify pass**

---

### Task 6: TUI Display Updates for Badges, Categories & Safety Info

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.tsx`

**Interfaces:**
- Consumes: `ScanResult` with safety and locked status, `deleteItem`

- [ ] **Step 1: Update `App.tsx` to render safety tags (`[SAFE]`, `[EMPTY]`, `[LOCKED]`)**
- [ ] **Step 2: Wire `--trash` option into UI prompt ("Move to Recycle Bin" vs "Delete Permanently")**
- [ ] **Step 3: Test CLI manually via `npm run dev -- --preset appdata`**
- [ ] **Step 4: Run full test suite and TypeScript build**
Run: `node ./node_modules/vitest/vitest.mjs run` && `npm run build`
