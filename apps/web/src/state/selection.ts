/**
 * Selection State Module
 *
 * Manages the current selection, hover state, active probe,
 * and pinned inspector panels.
 */

import type { Selection, SelectionItem, SelectableElementType } from '../types/index.js';
import { INSPECTOR_MAX_ZINDEX } from '../constants.js';

// =============================================================================
// SELECTION STATE
// =============================================================================

/** Current selection */
let selection: Selection = { type: 'none' };

/** Hovered element (for visual feedback) */
let hoverSelection: Selection | null = null;

/** Currently active probe ID (for probe inspector) */
let activeProbeId: string | null = null;

// =============================================================================
// SELECTION GETTERS/SETTERS
// =============================================================================

export function getSelection(): Selection {
  return selection;
}

export function setSelectionState(sel: Selection): void {
  selection = sel;
}

export function getHoverSelection(): Selection | null {
  return hoverSelection;
}

export function setHoverSelection(sel: Selection | null): void {
  hoverSelection = sel;
}

export function getActiveProbeId(): string | null {
  return activeProbeId;
}

export function setActiveProbeId(id: string | null): void {
  activeProbeId = id;
}

export function clearSelection(): void {
  selection = { type: 'none' };
}

// =============================================================================
// PINNED CONTEXT PANELS
// =============================================================================

/** Type for a pinned context panel (non-probe inspector) */
export type PinnedContextPanel = {
  selection: Selection;
  panel: HTMLElement;
  propertiesContainer: HTMLElement;
  legendContainer?: HTMLElement;
  statsContainer?: HTMLElement;
};

/** Active pinned context panels */
const pinnedContextPanels: PinnedContextPanel[] = [];

/** Sequence number for unique panel IDs */
let pinnedContextSeq = 1;

/** Global z-index counter for inspector panels */
let inspectorZIndex = 100;

export function getPinnedContextPanels(): PinnedContextPanel[] {
  return pinnedContextPanels;
}

export function addPinnedContextPanel(panel: PinnedContextPanel): void {
  pinnedContextPanels.push(panel);
}

export function removePinnedContextPanel(panel: PinnedContextPanel): void {
  const idx = pinnedContextPanels.indexOf(panel);
  if (idx !== -1) {
    pinnedContextPanels.splice(idx, 1);
  }
}

export function getNextPinnedContextId(): number {
  return pinnedContextSeq++;
}

export function getNextInspectorZIndex(): number {
  inspectorZIndex++;
  // Cap at max to avoid going above dock
  if (inspectorZIndex > INSPECTOR_MAX_ZINDEX) {
    inspectorZIndex = INSPECTOR_MAX_ZINDEX;
  }
  return inspectorZIndex;
}

export function bringToFront(zIndex: number): number {
  if (zIndex < inspectorZIndex) {
    return getNextInspectorZIndex();
  }
  return zIndex;
}

// =============================================================================
// PINNED PROBE PANELS
// =============================================================================

/** Type for a pinned probe panel */
export type PinnedProbePanel = {
  id: string;
  panel: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  status: HTMLSpanElement;
};

/** Active pinned probe panels (by probe ID) */
const pinnedProbePanels = new Map<string, PinnedProbePanel>();

export function getPinnedProbePanels(): Map<string, PinnedProbePanel> {
  return pinnedProbePanels;
}

export function getPinnedProbePanel(id: string): PinnedProbePanel | undefined {
  return pinnedProbePanels.get(id);
}

export function setPinnedProbePanel(id: string, panel: PinnedProbePanel): void {
  pinnedProbePanels.set(id, panel);
}

export function removePinnedProbePanel(id: string): void {
  pinnedProbePanels.delete(id);
}

// =============================================================================
// PROBE SNAPSHOTS
// =============================================================================

/** Type for a probe snapshot */
export type ProbeSnapshot = {
  id: string;
  data: unknown; // ProbeResult['data'] - avoid circular import
  panel: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

/** Saved probe snapshots */
const probeSnapshots: ProbeSnapshot[] = [];

/** Sequence number for snapshot IDs */
let probeSnapshotSeq = 1;

export function getProbeSnapshots(): ProbeSnapshot[] {
  return probeSnapshots;
}

export function addProbeSnapshot(snapshot: ProbeSnapshot): void {
  probeSnapshots.push(snapshot);
}

export function removeProbeSnapshot(snapshot: ProbeSnapshot): void {
  const idx = probeSnapshots.indexOf(snapshot);
  if (idx !== -1) {
    probeSnapshots.splice(idx, 1);
  }
}

export function getNextProbeSnapshotId(): string {
  return `snap${probeSnapshotSeq++}`;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Check if a specific entity is selected */
export function isSelected(type: Selection['type'], id: string): boolean {
  if (selection.type === 'none') return false;
  if (selection.type === 'multi') {
    return selection.items.some((item) => item.elementType === type && item.id === id);
  }
  return selection.type === type && 'id' in selection && selection.id === id;
}

/** Check if the current selection is empty */
export function hasSelection(): boolean {
  return selection.type !== 'none';
}

/** Get the single selected entity ID (returns null for multi-selection or none) */
export function getSingleSelectedId(): string | null {
  if (selection.type === 'none' || selection.type === 'multi') {
    return null;
  }
  return selection.id;
}

// =============================================================================
// PURE SELECTION UTILITIES
// =============================================================================
// These functions operate on Selection objects without accessing module state.
// They are useful for both main.ts operations and external consumers.

/**
 * Check if an element is selected (pure function version)
 * Unlike isSelected(), this takes the selection as a parameter
 */
export function isElementSelected(
  sel: Selection,
  elementType: string,
  id: string
): boolean {
  if (sel.type === 'none') return false;
  if (sel.type === 'multi') {
    return sel.items.some((item) => item.elementType === elementType && item.id === id);
  }
  return sel.type === elementType && 'id' in sel && sel.id === id;
}

/**
 * Convert a Selection to an array of SelectionItems
 */
export function selectionToItems(sel: Selection): SelectionItem[] {
  if (sel.type === 'none') return [];
  if (sel.type === 'multi') return [...sel.items];
  return [{ elementType: sel.type as SelectableElementType, id: sel.id }];
}

/**
 * Convert an array of SelectionItems back to a Selection
 */
export function itemsToSelection(items: SelectionItem[]): Selection {
  if (items.length === 0) return { type: 'none' };
  if (items.length === 1) {
    const item = items[0];
    return { type: item.elementType, id: item.id } as Selection;
  }
  return { type: 'multi', items };
}

/**
 * Get counts of each element type in the selection
 */
export function getSelectedCount(sel: Selection): Record<SelectableElementType, number> {
  const counts: Record<SelectableElementType, number> = {
    source: 0,
    receiver: 0,
    probe: 0,
    panel: 0,
    barrier: 0,
    building: 0,
  };
  const items = selectionToItems(sel);
  for (const item of items) {
    counts[item.elementType]++;
  }
  return counts;
}

/**
 * Get a display label for selection type
 */
export function selectionTypeLabel(type: Selection['type']): string {
  if (type === 'panel') return 'Measure grid';
  if (type === 'source') return 'Source';
  if (type === 'probe') return 'Probe';
  if (type === 'receiver') return 'Receiver';
  if (type === 'barrier') return 'Barrier';
  if (type === 'building') return 'Building';
  return 'None';
}
