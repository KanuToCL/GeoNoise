/**
 * Compute State Module
 *
 * Manages computation lifecycle state: tokens for cancellation,
 * in-progress flags, pending counts, and queued map resolution.
 */

// =============================================================================
// COMPUTE STATE
// =============================================================================

/** Token incremented each time a receiver/panel compute is requested */
let computeToken = 0;

/** Token of the currently active receiver/panel compute */
let activeComputeToken = 0;

/** Whether a receiver/panel compute is currently in progress */
let isComputing = false;

/** Token incremented each time a noise-map compute is requested */
let mapComputeToken = 0;

/** Token of the currently active noise-map compute */
let activeMapToken = 0;

/** Whether a noise-map compute is currently in progress */
let isMapComputing = false;

/** Number of pending compute operations (controls spinner visibility) */
let pendingComputes = 0;

/** Whether the canvas needs a re-render */
let needsUpdate = true;

/** Queued noise-map resolution (px); null means no pending request */
let queuedMapResolutionPx: number | null = null;

/** Timer ID for the "map computing" toast notification */
let mapToastTimer: number | null = null;

// =============================================================================
// GETTERS / SETTERS
// =============================================================================

export function getComputeToken(): number {
  return computeToken;
}
export function nextComputeToken(): number {
  return ++computeToken;
}

export function getActiveComputeToken(): number {
  return activeComputeToken;
}
export function setActiveComputeToken(token: number): void {
  activeComputeToken = token;
}

export function getIsComputing(): boolean {
  return isComputing;
}
export function setIsComputing(value: boolean): void {
  isComputing = value;
}

export function getMapComputeToken(): number {
  return mapComputeToken;
}
export function nextMapComputeToken(): number {
  return ++mapComputeToken;
}

export function getActiveMapToken(): number {
  return activeMapToken;
}
export function setActiveMapToken(token: number): void {
  activeMapToken = token;
}

export function getIsMapComputing(): boolean {
  return isMapComputing;
}
export function setIsMapComputing(value: boolean): void {
  isMapComputing = value;
}

export function getPendingComputes(): number {
  return pendingComputes;
}
export function setPendingComputes(count: number): void {
  pendingComputes = count;
}
export function incrementPendingComputes(): number {
  return ++pendingComputes;
}
export function decrementPendingComputes(): number {
  return --pendingComputes;
}

export function getNeedsUpdate(): boolean {
  return needsUpdate;
}
export function setNeedsUpdate(value: boolean): void {
  needsUpdate = value;
}

export function getQueuedMapResolutionPx(): number | null {
  return queuedMapResolutionPx;
}
export function setQueuedMapResolutionPx(value: number | null): void {
  queuedMapResolutionPx = value;
}

export function getMapToastTimer(): number | null {
  return mapToastTimer;
}
export function setMapToastTimer(value: number | null): void {
  mapToastTimer = value;
}
export function clearMapToastTimer(): void {
  if (mapToastTimer !== null) {
    clearTimeout(mapToastTimer);
    mapToastTimer = null;
  }
}
