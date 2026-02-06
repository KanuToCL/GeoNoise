/**
 * Measure Tool State
 *
 * Manages the state for the measurement tool.
 */

import type { Point } from '../../types/ui.js';

// =============================================================================
// MEASURE STATE
// =============================================================================

/** Start point of measurement */
let measureStart: Point | null = null;

/** End point of measurement */
let measureEnd: Point | null = null;

/** Whether the measurement is locked (completed) */
let measureLocked = false;

// =============================================================================
// GETTERS
// =============================================================================

export function getMeasureStart(): Point | null {
  return measureStart;
}

export function getMeasureEnd(): Point | null {
  return measureEnd;
}

export function isMeasureLocked(): boolean {
  return measureLocked;
}

// =============================================================================
// SETTERS
// =============================================================================

export function setMeasureStart(point: Point | null): void {
  measureStart = point;
}

export function setMeasureEnd(point: Point | null): void {
  measureEnd = point;
}

export function setMeasureLocked(locked: boolean): void {
  measureLocked = locked;
}

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Start a new measurement at a point.
 */
export function startMeasurement(point: Point): void {
  measureStart = point;
  measureEnd = point;
  measureLocked = false;
}

/**
 * Update the measurement end point while dragging.
 */
export function updateMeasurement(point: Point): void {
  measureEnd = point;
}

/**
 * Lock the measurement (finalize it).
 */
export function lockMeasurement(point: Point): void {
  measureEnd = point;
  measureLocked = true;
}

/**
 * Clear the current measurement.
 */
export function clearMeasurement(): void {
  measureStart = null;
  measureEnd = null;
  measureLocked = false;
}

/**
 * Check if a measurement is in progress (has start point).
 */
export function hasMeasurement(): boolean {
  return measureStart !== null;
}

/**
 * Get both measurement points if they exist.
 */
export function getMeasurePoints(): { start: Point; end: Point } | null {
  if (!measureStart || !measureEnd) return null;
  return { start: measureStart, end: measureEnd };
}
