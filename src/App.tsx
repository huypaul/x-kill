import React, { useState, useEffect, useRef } from "react";
import { Text, Box, useInput, useApp } from "ink";
import fs from "node:fs/promises";
import { scanTargets, formatBytes, ScanResult } from "./fs-utils.js";
import { deleteItem } from "./delete-utils.js";

type ItemStatus = "found" | "deleting" | "deleted" | "error";

interface TargetItem {
  path: string;
  size: number;
  lastMod: number;
  status: ItemStatus;
  errorMsg?: string;
  isEmpty?: boolean;
  isLocked?: boolean;
}

export interface AppProps {
  baseDir?: string;
  targetNames?: string[];
  preset?: string;
  patterns?: string[];
  cleanEmpty?: boolean;
  olderThanMs?: number;
  trash?: boolean;
  force?: boolean;
  autoRemove?: boolean;
}

const DEFAULT_TARGETS = ["node_modules", ".next", "dist", "build", "target"];
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function truncateMiddle(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const left = Math.floor((maxLen - 3) / 2);
  const right = maxLen - 3 - left;
  return `${text.slice(0, left)}...${text.slice(-right)}`;
}

async function runPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await fn(current);
    }
  });
  await Promise.all(workers);
}

export default function App({
  baseDir = process.cwd(),
  targetNames,
  preset,
  patterns,
  cleanEmpty,
  olderThanMs,
  trash,
  force,
  autoRemove,
}: AppProps) {
  const activeTargets = targetNames ?? (!patterns && !cleanEmpty ? DEFAULT_TARGETS : undefined);
  const { exit } = useApp();
  const [items, setItems] = useState<TargetItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set<string>());
  const [confirmTargets, setConfirmTargets] = useState<TargetItem[] | null>(null);
  const [isSearching, setIsSearching] = useState(true);
  const [searchTime, setSearchTime] = useState<string>("0.00");
  const [spaceSaved, setSpaceSaved] = useState(0);
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  const autoRemoveTriggered = useRef(false);

  useEffect(() => {
    if (!isSearching) return;
    const interval = setInterval(() => {
      setSpinnerIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [isSearching]);

  useEffect(() => {
    const startTime = performance.now();
    const abortController = new AbortController();
    const { signal } = abortController;

    const handleFound = async (result: ScanResult) => {
      if (signal.aborted) return;

      let lastMod = 0;
      try {
        const stat = await fs.stat(result.path);
        lastMod = Math.floor(
          (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24),
        );
      } catch (e) {}

      if (signal.aborted) return;

      setItems((prev) => [
        ...prev,
        {
          path: result.path,
          size: result.size,
          lastMod,
          status: "found",
          isEmpty: result.isEmpty,
        },
      ]);
    };

    scanTargets(baseDir, {
      targetNames: activeTargets,
      patterns,
      cleanEmpty,
      olderThanMs,
      signal,
      onFound: handleFound,
    }).then(() => {
      if (!signal.aborted) {
        setIsSearching(false);
        setSearchTime(((performance.now() - startTime) / 1000).toFixed(2));
      }
    });

    return () => {
      abortController.abort();
    };
  }, [
    baseDir,
    activeTargets ? activeTargets.join(",") : "",
    patterns ? patterns.join(",") : "",
    cleanEmpty,
    olderThanMs,
  ]);

  const executeBatchDelete = async (targets: TargetItem[], isForce: boolean) => {
    if (targets.length === 0) return;
    const targetPaths = new Set(targets.map((t) => t.path));
    setItems((prev) =>
      prev.map((it) => (targetPaths.has(it.path) ? { ...it, status: "deleting" } : it)),
    );

    await runPool(targets, 3, async (target) => {
      const result = isForce
        ? await deleteItem(target.path, Boolean(trash), true)
        : await deleteItem(target.path, Boolean(trash));

      if (result.success) {
        setItems((prev) =>
          prev.map((it) =>
            it.path === target.path
              ? { ...it, status: "deleted", size: 0, isLocked: false }
              : it,
          ),
        );
        setSelectedPaths((prev) => {
          const next = new Set(prev);
          next.delete(target.path);
          return next;
        });
        setSpaceSaved((prev) => prev + target.size);
      } else {
        const errorMsg = result.isLocked
          ? "LOCKED (in use)"
          : (result.error || "Failed");
        setItems((prev) =>
          prev.map((it) =>
            it.path === target.path
              ? { ...it, status: "error", errorMsg, isLocked: result.isLocked }
              : it,
          ),
        );
      }
    });
  };

  const getTargets = (): TargetItem[] => {
    if (selectedPaths.size > 0) {
      return items.filter(
        (it) => selectedPaths.has(it.path) && (it.status === "found" || it.status === "error"),
      );
    }
    if (items.length > 0) {
      const clamped = Math.min(Math.max(0, selectedIndex), items.length - 1);
      const item = items[clamped];
      if (item && (item.status === "found" || item.status === "error")) {
        return [item];
      }
    }
    return [];
  };

  useEffect(() => {
    if (autoRemove && !isSearching && !autoRemoveTriggered.current) {
      const foundItems = items.filter((it) => it.status === "found");
      if (foundItems.length > 0) {
        autoRemoveTriggered.current = true;
        if (force) {
          executeBatchDelete(foundItems, true);
        } else {
          setSelectedPaths(new Set(foundItems.map((it) => it.path)));
          setConfirmTargets(foundItems);
        }
      }
    }
  }, [autoRemove, isSearching, items, force]);

  useInput(
    (input, key) => {
      if (confirmTargets !== null) {
        if (input.toLowerCase() === "y") {
          const targetsToDelete = confirmTargets;
          setConfirmTargets(null);
          executeBatchDelete(targetsToDelete, false);
        } else if (input.toLowerCase() === "n" || key.escape) {
          setConfirmTargets(null);
        }
        return;
      }

      if (input === "q" || key.escape) {
        exit();
        return;
      }

      if (key.upArrow) setSelectedIndex((prev) => Math.max(0, prev - 1));
      if (key.downArrow)
        setSelectedIndex((prev) =>
          items.length === 0 ? 0 : Math.min(items.length - 1, prev + 1),
        );

      if (input === " " && items.length > 0) {
        const clamped = Math.min(Math.max(0, selectedIndex), items.length - 1);
        const item = items[clamped];
        if (item) {
          setSelectedPaths((prev) => {
            const next = new Set(prev);
            if (next.has(item.path)) {
              next.delete(item.path);
            } else if (item.status === "found" || item.status === "error") {
              next.add(item.path);
            }
            return next;
          });
        }
      }

      if ((input === "a" || input === "A") && items.length > 0) {
        const candidates = items.filter(
          (c) => c.status === "found" || c.status === "error",
        );
        if (candidates.length > 0) {
          setSelectedPaths((prev) => {
            const allSelected = candidates.every((c) => prev.has(c.path));
            const next = new Set(prev);
            if (allSelected) {
              candidates.forEach((c) => next.delete(c.path));
            } else {
              candidates.forEach((c) => next.add(c.path));
            }
            return next;
          });
        }
      }

      if (input === "d" || input === "D") {
        const targets = getTargets();
        if (targets.length === 0) return;
        if (force) {
          executeBatchDelete(targets, true);
        } else {
          setConfirmTargets(targets);
        }
      }

      if (input === "f" || input === "F") {
        const targets = getTargets();
        if (targets.length === 0) return;
        executeBatchDelete(targets, true);
      }
    },
    { isActive: Boolean(process.stdin?.isTTY) },
  );

  const releasableSpace = items
    .filter((i) => i.status === "found")
    .reduce((acc, curr) => acc + curr.size, 0);
  const selectedSize = items
    .filter((i) => selectedPaths.has(i.path))
    .reduce((acc, curr) => acc + curr.size, 0);

  const terminalRows = process.stdout?.rows || 24;
  const headerOffset =
    11 +
    (preset ? 1 : 0) +
    (patterns && patterns.length > 0 ? 1 : 0) +
    (trash || cleanEmpty || olderThanMs !== undefined || force || autoRemove ? 1 : 0);
  const maxVisibleItems = Math.max(5, terminalRows - headerOffset);
  const clampedIndex =
    items.length === 0 ? 0 : Math.min(Math.max(0, selectedIndex), items.length - 1);
  const halfVisible = Math.floor(maxVisibleItems / 2);
  const startIdx = Math.max(
    0,
    Math.min(clampedIndex - halfVisible, Math.max(0, items.length - maxVisibleItems)),
  );
  const visibleItems = items.slice(startIdx, startIdx + maxVisibleItems);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box
        flexDirection="row"
        justifyContent="space-between"
        marginBottom={1}
        borderStyle="single"
        borderColor="gray"
        paddingX={1}>
        <Box flexDirection="column">
          <Box flexDirection="row">
            <Text bold color="cyan">
              ⚡ xkill
            </Text>
            <Text color="gray"> v1.0.0</Text>
          </Box>
          {preset && (
            <Box flexDirection="row">
              <Text color="gray">Preset: </Text>
              <Text color="magenta" bold>
                {preset}
              </Text>
            </Box>
          )}
          <Box flexDirection="row">
            <Text color="gray">Directory: </Text>
            <Text color="white" bold>
              {truncateMiddle(baseDir, 50)}
            </Text>
          </Box>
          {activeTargets && activeTargets.length > 0 && (
            <Box flexDirection="row">
              <Text color="gray">Targets: </Text>
              <Text color="yellow">{activeTargets.join(", ")}</Text>
            </Box>
          )}
          {patterns && patterns.length > 0 && (
            <Box flexDirection="row">
              <Text color="gray">Patterns: </Text>
              <Text color="yellow">{patterns.join(", ")}</Text>
            </Box>
          )}
          {(trash || cleanEmpty || olderThanMs !== undefined || force || autoRemove) && (
            <Box flexDirection="row">
              <Text color="gray">Modes: </Text>
              {trash && <Text color="green" bold>[Recycle Bin] </Text>}
              {cleanEmpty && <Text color="cyan" bold>[Empty Dirs] </Text>}
              {olderThanMs !== undefined && <Text color="yellow" bold>[Filtered Age] </Text>}
              {force && <Text color="red" bold>[Force] </Text>}
              {autoRemove && <Text color="magenta" bold>[Auto-Remove] </Text>}
            </Box>
          )}
        </Box>

        <Box flexDirection="column" alignItems="flex-end">
          {selectedPaths.size > 0 && (
            <Box flexDirection="row">
              <Text color="yellow" bold>
                Selected: {selectedPaths.size} ({formatBytes(selectedSize)})
              </Text>
            </Box>
          )}
          <Box flexDirection="row">
            <Text color="gray">Releasable: </Text>
            <Text color="magenta" bold>
              {formatBytes(releasableSpace)}
            </Text>
          </Box>
          <Box flexDirection="row">
            <Text color="gray">Saved: </Text>
            <Text color="green" bold>
              {formatBytes(spaceSaved)}
            </Text>
          </Box>
          <Box flexDirection="row">
            {isSearching ? (
              <>
                <Text color="cyan">{SPINNER_FRAMES[spinnerIndex]} </Text>
                <Text color="cyan">Scanning ({items.length} found)</Text>
              </>
            ) : (
              <Text color="green">✔ Scan complete ({searchTime}s)</Text>
            )}
          </Box>
        </Box>
      </Box>

      {confirmTargets && confirmTargets.length > 0 ? (
        <Box flexDirection="row" backgroundColor="red" paddingX={1}>
          <Text color="white" bold>
            {confirmTargets.length === 1
              ? trash
                ? `⚠ Move "${truncateMiddle(confirmTargets[0].path, 60)}" to Recycle Bin? Press [y] Confirm • [n / Esc] Cancel`
                : `⚠ Permanently delete "${truncateMiddle(confirmTargets[0].path, 60)}"? Press [y] Confirm • [n / Esc] Cancel`
              : trash
                ? `⚠ Move ${confirmTargets.length} selected items (${formatBytes(confirmTargets.reduce((acc, curr) => acc + curr.size, 0))}) to Recycle Bin? Press [y] Confirm • [n / Esc] Cancel`
                : `⚠ Permanently delete ${confirmTargets.length} selected items (${formatBytes(confirmTargets.reduce((acc, curr) => acc + curr.size, 0))})? Press [y] Confirm • [n / Esc] Cancel`}
          </Text>
        </Box>
      ) : (
        <Box flexDirection="row" backgroundColor="blue" paddingX={1}>
          <Box flexGrow={1}>
            <Text color="white" bold>
              [↑/↓] Navigate  •  [Space] Select  •  [a] All  •  [d] Delete  •  [f] Force  •  [q/Esc] Exit
            </Text>
          </Box>
          <Box width={10} justifyContent="flex-end">
            <Text color="white" bold>
              AGE
            </Text>
          </Box>
          <Box width={12} justifyContent="flex-end">
            <Text color="white" bold>
              SIZE
            </Text>
          </Box>
        </Box>
      )}

      {isSearching && items.length === 0 && (
        <Box paddingY={1} paddingX={1} flexDirection="row">
          <Text color="cyan">{SPINNER_FRAMES[spinnerIndex]} </Text>
          <Text color="gray">Traversing filesystem for targets...</Text>
        </Box>
      )}

      {!isSearching && items.length === 0 && (
        <Box paddingY={1} paddingX={1}>
          <Text color="yellow">✔ No matching targets found in {baseDir}</Text>
        </Box>
      )}

      {items.length > 0 && (
        <Box flexDirection="column" marginTop={0}>
          {visibleItems.map((item, index) => {
            const actualIndex = startIdx + index;
            const isSelected = actualIndex === clampedIndex;

            let badge = "";
            let badgeColor = "cyan";

            if (item.status === "deleting") {
              badge = "⏳ [deleting...]";
              badgeColor = "yellow";
            } else if (item.status === "deleted") {
              badge = "✔ [DELETED]";
              badgeColor = isSelected ? "black" : "green";
            } else if (item.status === "error") {
              if (item.isLocked || item.errorMsg?.includes("LOCKED")) {
                badge = "🔒 [LOCKED]";
              } else {
                badge = "✖ [ERROR]";
              }
              badgeColor = isSelected ? "black" : "red";
            } else if (item.isEmpty) {
              badge = "[EMPTY]";
              badgeColor = isSelected ? "black" : "gray";
            }

            const prefix = isSelected ? "❯ " : "  ";
            const checkbox =
              item.status === "found" || item.status === "error"
                ? selectedPaths.has(item.path)
                  ? "[x] "
                  : "[ ] "
                : "    ";
            const statusDisplay = badge ? `${prefix}${checkbox}${badge}` : `${prefix}${checkbox}`;

            return (
              <Box
                key={item.path}
                flexDirection="row"
                backgroundColor={isSelected ? "green" : undefined}>
                <Box width={22} flexShrink={0}>
                  <Text
                    color={isSelected ? "black" : badgeColor}
                    bold={isSelected}
                    wrap="truncate-end">
                    {statusDisplay}
                  </Text>
                </Box>
                <Box flexGrow={1}>
                  <Text
                    color={
                      isSelected
                        ? "black"
                        : item.status === "deleted"
                        ? "gray"
                        : "white"
                    }
                    bold={isSelected}>
                    {item.path}
                    {item.status === "error" && item.errorMsg
                      ? ` (${item.errorMsg})`
                      : ""}
                  </Text>
                </Box>
                <Box width={10} justifyContent="flex-end" flexShrink={0}>
                  <Text
                    color={
                      isSelected
                        ? "black"
                        : item.status === "deleted"
                        ? "gray"
                        : "cyan"
                    }
                    bold={isSelected}>
                    {item.lastMod}d
                  </Text>
                </Box>
                <Box width={12} justifyContent="flex-end" flexShrink={0}>
                  <Text
                    color={
                      isSelected
                        ? "black"
                        : item.status === "deleted"
                        ? "gray"
                        : "yellow"
                    }
                    bold={isSelected}>
                    {formatBytes(item.size)}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
