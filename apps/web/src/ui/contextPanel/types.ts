/**
 * Context Panel Types
 *
 * Types for the context/properties panel system.
 */

import type { Selection } from '../../types/index.js';

/** A pinned context panel that shows element properties */
export interface PinnedContextPanel {
  selection: Selection;
  panel: HTMLElement;
  propertiesContainer: HTMLElement;
  legendContainer?: HTMLElement;
  statsContainer?: HTMLElement;
}

/** State for managing pinned context panels */
const pinnedContextPanels: PinnedContextPanel[] = [];
let pinnedContextSeq = 1;

// === State Accessors ===

export function getPinnedContextPanels(): PinnedContextPanel[] {
  return pinnedContextPanels;
}

export function addPinnedContextPanel(panel: PinnedContextPanel): void {
  pinnedContextPanels.push(panel);
}

export function removePinnedContextPanel(panel: HTMLElement): boolean {
  const idx = pinnedContextPanels.findIndex((p) => p.panel === panel);
  if (idx >= 0) {
    pinnedContextPanels.splice(idx, 1);
    return true;
  }
  return false;
}

export function clearPinnedContextPanels(): void {
  for (const pinned of pinnedContextPanels) {
    pinned.panel.remove();
  }
  pinnedContextPanels.length = 0;
}

export function nextPinnedContextSeq(): number {
  return pinnedContextSeq++;
}

/** Get count of pinned panels for stacking offset calculation */
export function getPinnedContextPanelCount(): number {
  return pinnedContextPanels.length;
}
