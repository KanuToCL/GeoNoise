/**
 * History State Module
 *
 * Manages undo/redo functionality with scene snapshots.
 * Tracks dirty state for unsaved changes indication.
 */

import type { Selection, Point } from '../types/index.js';
import type { BuildingData, Barrier, Source, Receiver, Panel, Probe } from '../entities/index.js';

// =============================================================================
// TYPES
// =============================================================================

/** A complete snapshot of the scene state for undo/redo */
export type SceneSnapshot = {
  sources: Source[];
  receivers: Receiver[];
  panels: Panel[];
  probes: Probe[];
  buildings: BuildingData[];
  barriers: Barrier[];
  sourceSeq: number;
  receiverSeq: number;
  panelSeq: number;
  probeSeq: number;
  buildingSeq: number;
  barrierSeq: number;
  selection: Selection;
  activeProbeId: string | null;
  soloSourceId: string | null;
  panOffset: Point;
  zoom: number;
};

// =============================================================================
// HISTORY STATE
// =============================================================================

/** Array of scene snapshots */
let history: SceneSnapshot[] = [];

/** Current position in the history stack */
let historyIndex = -1;

/** Whether the scene has unsaved changes */
let isDirty = false;

// =============================================================================
// GETTERS/SETTERS
// =============================================================================

export function getHistory(): SceneSnapshot[] {
  return history;
}

export function setHistory(h: SceneSnapshot[]): void {
  history = h;
}

export function getHistoryIndex(): number {
  return historyIndex;
}

export function setHistoryIndex(index: number): void {
  historyIndex = index;
}

export function getIsDirty(): boolean {
  return isDirty;
}

export function setIsDirty(dirty: boolean): void {
  isDirty = dirty;
}

// =============================================================================
// HISTORY OPERATIONS
// =============================================================================

/** Check if undo is available */
export function canUndo(): boolean {
  return historyIndex > 0;
}

/** Check if redo is available */
export function canRedo(): boolean {
  return historyIndex < history.length - 1;
}

/** Get the number of history entries */
export function getHistoryLength(): number {
  return history.length;
}

/**
 * Push a new snapshot to history, truncating any redo stack.
 * Returns the new history index.
 */
export function pushSnapshot(snapshot: SceneSnapshot): number {
  // Truncate any future history (redo stack)
  history = history.slice(0, historyIndex + 1);
  history.push(snapshot);
  historyIndex = history.length - 1;
  return historyIndex;
}

/** Get the snapshot at the given index (or current if no index given) */
export function getSnapshot(index?: number): SceneSnapshot | undefined {
  const idx = index ?? historyIndex;
  return history[idx];
}

/** Move back one step in history (for undo), returns the snapshot */
export function stepBack(): SceneSnapshot | undefined {
  if (!canUndo()) return undefined;
  historyIndex -= 1;
  return history[historyIndex];
}

/** Move forward one step in history (for redo), returns the snapshot */
export function stepForward(): SceneSnapshot | undefined {
  if (!canRedo()) return undefined;
  historyIndex += 1;
  return history[historyIndex];
}

/** Clear all history */
export function clearHistory(): void {
  history = [];
  historyIndex = -1;
}

/** Mark the scene as dirty (has unsaved changes) */
export function markDirty(): void {
  isDirty = true;
}

/** Mark the scene as saved (no unsaved changes) */
export function markSaved(): void {
  isDirty = false;
}
