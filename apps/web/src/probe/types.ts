/**
 * Probe Module Types
 *
 * Types and state management for the acoustic probe subsystem.
 */

import type { ProbeResult } from '@geonoise/engine';

// === State Types ===

/** A pinned probe panel that shows live frequency response */
export type PinnedProbePanel = {
  id: string;
  panel: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  status: HTMLElement;
};

/** A frozen snapshot of probe data */
export type ProbeSnapshot = {
  id: string;
  data: ProbeResult['data'];
  panel: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

// === Probe State ===

/** Active probe being inspected (null if none) */
let activeProbeId: string | null = null;

/** Cached results from probe worker keyed by probe ID */
const probeResults = new Map<string, ProbeResult['data']>();

/** Set of probe IDs with pending calculations */
const probePending = new Set<string>();

/** Pinned probe panels (live monitors) */
const pinnedProbePanels = new Map<string, PinnedProbePanel>();

/** Frozen probe snapshots */
const probeSnapshots: ProbeSnapshot[] = [];

/** Counter for snapshot IDs */
let probeSnapshotSeq = 1;

/** Z-index counter for inspector panels */
let inspectorZIndex = 100;

/** Maximum z-index for inspector panels (dock stays above) */
export const INSPECTOR_MAX_ZINDEX = 200;

// === State Accessors ===

export function getActiveProbeId(): string | null {
  return activeProbeId;
}

export function setActiveProbeId(id: string | null): void {
  activeProbeId = id;
}

export function getProbeResults(): Map<string, ProbeResult['data']> {
  return probeResults;
}

export function getProbeResult(probeId: string): ProbeResult['data'] | undefined {
  return probeResults.get(probeId);
}

export function setProbeResult(probeId: string, data: ProbeResult['data']): void {
  probeResults.set(probeId, data);
}

export function deleteProbeResult(probeId: string): boolean {
  return probeResults.delete(probeId);
}

export function isProbePending(probeId: string): boolean {
  return probePending.has(probeId);
}

export function addProbePending(probeId: string): void {
  probePending.add(probeId);
}

export function deleteProbePending(probeId: string): boolean {
  return probePending.delete(probeId);
}

export function getProbePendingIds(): Set<string> {
  return probePending;
}

export function getPinnedProbePanels(): Map<string, PinnedProbePanel> {
  return pinnedProbePanels;
}

export function getPinnedProbePanel(probeId: string): PinnedProbePanel | undefined {
  return pinnedProbePanels.get(probeId);
}

export function setPinnedProbePanel(probeId: string, panel: PinnedProbePanel): void {
  pinnedProbePanels.set(probeId, panel);
}

export function deletePinnedProbePanel(probeId: string): boolean {
  return pinnedProbePanels.delete(probeId);
}

export function hasPinnedProbePanel(probeId: string): boolean {
  return pinnedProbePanels.has(probeId);
}

export function getProbeSnapshots(): ProbeSnapshot[] {
  return probeSnapshots;
}

export function addProbeSnapshot(snapshot: ProbeSnapshot): void {
  probeSnapshots.push(snapshot);
}

export function removeProbeSnapshot(snapshotId: string): boolean {
  const idx = probeSnapshots.findIndex((item) => item.id === snapshotId);
  if (idx >= 0) {
    probeSnapshots.splice(idx, 1);
    return true;
  }
  return false;
}

export function nextSnapshotSeq(): number {
  return probeSnapshotSeq++;
}

export function getInspectorZIndex(): number {
  return inspectorZIndex;
}

export function incrementInspectorZIndex(): number {
  inspectorZIndex++;
  if (inspectorZIndex > INSPECTOR_MAX_ZINDEX) {
    inspectorZIndex = INSPECTOR_MAX_ZINDEX;
  }
  return inspectorZIndex;
}

// === Snapshot State for Undo/Redo ===

export interface ProbeStateSnapshot {
  activeProbeId: string | null;
}

export function snapshotProbeState(): ProbeStateSnapshot {
  return { activeProbeId };
}

export function restoreProbeState(snap: ProbeStateSnapshot): void {
  activeProbeId = snap.activeProbeId;
}

/** Prune stale probe data that no longer exists in the scene */
export function pruneProbeData(validProbeIds: Set<string>): void {
  for (const id of probeResults.keys()) {
    if (!validProbeIds.has(id)) probeResults.delete(id);
  }
  for (const id of probePending) {
    if (!validProbeIds.has(id)) probePending.delete(id);
  }
}

/** Clone probe data for snapshotting */
export function cloneProbeData(data: ProbeResult['data']): ProbeResult['data'] {
  return {
    frequencies: [...data.frequencies],
    magnitudes: [...data.magnitudes],
    interferenceDetails: data.interferenceDetails ? { ...data.interferenceDetails } : undefined,
  };
}
