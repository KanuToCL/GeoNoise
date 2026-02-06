/**
 * Progress Tracking
 *
 * Track computation progress and provide callbacks for UI updates.
 */

import type { ComputeProgress, MapComputeState } from './types.js';

/**
 * Create a new compute progress tracker
 */
export function createComputeProgress(): ComputeProgress {
  return {
    isComputing: false,
    pendingCount: 0,
    totalCount: 0,
    token: 0,
  };
}

/**
 * Create a new map compute state
 */
export function createMapComputeState(): MapComputeState {
  return {
    isComputing: false,
    token: 0,
    queuedResolution: null,
  };
}

/**
 * Start a computation session
 *
 * @param progress - Current progress state
 * @param count - Number of sub-computations
 * @returns Updated progress state with new token
 */
export function startCompute(
  progress: ComputeProgress,
  count: number
): ComputeProgress {
  return {
    isComputing: true,
    pendingCount: count,
    totalCount: count,
    token: progress.token + 1,
  };
}

/**
 * Mark a sub-computation as complete
 *
 * @param progress - Current progress state
 * @param token - Token that must match current token
 * @returns Updated progress state, or null if token is stale
 */
export function finishSubCompute(
  progress: ComputeProgress,
  token: number
): ComputeProgress | null {
  if (token !== progress.token) return null;

  const pendingCount = Math.max(0, progress.pendingCount - 1);
  return {
    ...progress,
    pendingCount,
    isComputing: pendingCount > 0,
  };
}

/**
 * Cancel all pending computations
 *
 * @param progress - Current progress state
 * @returns Updated progress state with incremented token
 */
export function cancelCompute(progress: ComputeProgress): ComputeProgress {
  return {
    isComputing: false,
    pendingCount: 0,
    totalCount: 0,
    token: progress.token + 1,
  };
}

/**
 * Check if a token is stale (computation was cancelled or superseded)
 */
export function isStaleToken(progress: ComputeProgress, token: number): boolean {
  return token !== progress.token;
}

/**
 * Get progress percentage (0-100)
 */
export function getProgressPercent(progress: ComputeProgress): number {
  if (progress.totalCount === 0) return 0;
  const completed = progress.totalCount - progress.pendingCount;
  return Math.round((completed / progress.totalCount) * 100);
}

/**
 * Start a map computation
 *
 * @param state - Current map state
 * @returns Updated state with new token
 */
export function startMapCompute(state: MapComputeState): MapComputeState {
  return {
    isComputing: true,
    token: state.token + 1,
    queuedResolution: null,
  };
}

/**
 * Finish a map computation
 *
 * @param state - Current map state
 * @param token - Token that must match
 * @returns Updated state, or null if token is stale
 */
export function finishMapCompute(
  state: MapComputeState,
  token: number
): MapComputeState | null {
  if (token !== state.token) return null;

  return {
    ...state,
    isComputing: false,
  };
}

/**
 * Invalidate the current map computation
 *
 * @param state - Current map state
 * @returns Updated state with incremented token
 */
export function invalidateMapCompute(state: MapComputeState): MapComputeState {
  return {
    isComputing: false,
    token: state.token + 1,
    queuedResolution: null,
  };
}

/**
 * Queue a resolution for after current computation completes
 */
export function queueMapResolution(
  state: MapComputeState,
  resolution: number
): MapComputeState {
  return {
    ...state,
    queuedResolution: resolution,
  };
}
