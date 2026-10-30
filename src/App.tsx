import React, { useState, useEffect } from "react";
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
}

const DEFAULT_TARGETS = ["node_modules", ".next", "dist", "build", "target"];
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function truncateMiddle(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const left = Math.floor((maxLen - 3) / 2);
  const right = maxLen - 3 - left;
  return `${text.slice(0, left)}...${text.slice(-right)}`;
}

export default function App({
  baseDir = process.cwd(),
  targetNames,
  preset,
  patterns,
  cleanEmpty,
  olderThanMs,
  trash,
}: AppProps) {
  const activeTargets = targetNames ?? (!patterns && !cleanEmpty ? DEFAULT_TARGETS : undefined);
  const { exit } = useApp();
  const [items, setItems] = useState<TargetItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(true);
  const [searchTime, setSearchTime] = useState<string>("0.00");
  const [spaceSaved, setSpaceSaved] = useState(0);
  const [spinnerIndex, setSpinnerIndex] = useState(0);

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

  useInput((input, key) => {
    if (confirmTarget) {
      if (input.toLowerCase() === "y") {
        const targetPath = confirmTarget;
        const targetItem = items.find((i) => i.path === targetPath);
        setConfirmTarget(null);
        if (targetItem && (targetItem.status === "found" || targetItem.status === "error")) {
          handleDelete(targetPath, targetItem.size);
        }
      } else if (input.toLowerCase() === "n" || key.escape) {
        setConfirmTarget(null);
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
    if ((input === " " || input === "d") && items.length > 0) {
      const clamped = Math.min(Math.max(0, selectedIndex), items.length - 1);
      const item = items[clamped];
      if (item && (item.status === "found" || item.status === "error")) {
        setConfirmTarget(item.path);
      }
    }
  }, { isActive: Boolean(process.stdin?.isTTY) });

  const handleDelete = async (targetPath: string, size: number) => {
    setItems((prev) =>
      prev.map((it) => (it.path === targetPath ? { ...it, status: "deleting" } : it)),
    );
    const result = await deleteItem(targetPath, Boolean(trash));
    if (result.success) {
      setItems((prev) =>
        prev.map((it) =>
          it.path === targetPath
            ? { ...it, status: "deleted", size: 0, isLocked: false }
            : it,
        ),
      );
      setSpaceSaved((prev) => prev + size);
    } else {
      const errorMsg = result.isLocked
        ? "LOCKED (in use)"
        : (result.error || "Failed");
      setItems((prev) =>
        prev.map((it) =>
          it.path === targetPath
            ? { ...it, status: "error", errorMsg, isLocked: result.isLocked }
            : it,
        ),
      );
    }
  };

  const releasableSpace = items
    .filter((i) => i.status === "found")
    .reduce((acc, curr) => acc + curr.size, 0);
  const pendingTasks = items.filter((i) => i.status === "deleting").length;

  const terminalRows = process.stdout?.rows || 24;
  const headerOffset =
    11 +
    (preset ? 1 : 0) +
    (patterns && patterns.length > 0 ? 1 : 0) +
    (trash || cleanEmpty || olderThanMs !== undefined ? 1 : 0);
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
          {(trash || cleanEmpty || olderThanMs !== undefined) && (
            <Box flexDirection="row">
              <Text color="gray">Modes: </Text>
              {trash && <Text color="green" bold>[Recycle Bin] </Text>}
              {cleanEmpty && <Text color="cyan" bold>[Empty Dirs] </Text>}
              {olderThanMs !== undefined && <Text color="yellow" bold>[Filtered Age] </Text>}
            </Box>
          )}
        </Box>

        <Box flexDirection="column" alignItems="flex-end">
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

      {confirmTarget ? (
        <Box flexDirection="row" backgroundColor="red" paddingX={1}>
          <Text color="white" bold>
            {trash
              ? `⚠ Move "${truncateMiddle(confirmTarget, 60)}" to Recycle Bin? Press [y] Confirm • [n / Esc] Cancel`
              : `⚠ Permanently delete "${truncateMiddle(confirmTarget, 60)}"? Press [y] Confirm • [n / Esc] Cancel`}
          </Text>
        </Box>
      ) : (
        <Box flexDirection="row" backgroundColor="blue" paddingX={1}>
          <Box flexGrow={1}>
            <Text color="white" bold>
              [↑/↓] Navigate  •  [Space/d] Delete  •  [q/Esc] Exit
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
            const statusDisplay = badge ? `${prefix}${badge}` : prefix;

            return (
              <Box
                key={item.path}
                flexDirection="row"
                backgroundColor={isSelected ? "green" : undefined}>
                <Box width={20}>
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
                <Box width={10} justifyContent="flex-end">
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
                <Box width={12} justifyContent="flex-end">
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
