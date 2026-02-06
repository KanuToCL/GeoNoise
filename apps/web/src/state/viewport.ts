/**
 * Viewport State Module
 *
 * Manages canvas viewport: pan, zoom, coordinate transforms,
 * and interaction state.
 */

import type { Point } from '../types/index.js';

// =============================================================================
// VIEWPORT STATE
// =============================================================================

/** Base pixels per meter (before zoom) */
let basePixelsPerMeter = 3;

/** Current zoom level */
let zoom = 1;

/** Current pixels per meter (basePixelsPerMeter * zoom) */
let pixelsPerMeter = 3;

/** Pan offset in world coordinates */
let panOffset: Point = { x: 0, y: 0 };

/** Active pan drag state */
let panState: { start: Point; origin: Point } | null = null;

/** Snap distance in meters */
const snapMeters = 5;

/** Whether an interaction is currently active (for low-res previews) */
let interactionActive = false;

// =============================================================================
// CANVAS REFERENCE
// =============================================================================

/** Reference to the main canvas element */
let canvasRef: HTMLCanvasElement | null = null;

export function setCanvasRef(canvas: HTMLCanvasElement): void {
  canvasRef = canvas;
}

export function getCanvasRef(): HTMLCanvasElement | null {
  return canvasRef;
}

// =============================================================================
// ZOOM/PAN GETTERS/SETTERS
// =============================================================================

export function getBasePixelsPerMeter(): number {
  return basePixelsPerMeter;
}

export function setBasePixelsPerMeter(ppm: number): void {
  basePixelsPerMeter = ppm;
  updatePixelsPerMeter();
}

export function getZoom(): number {
  return zoom;
}

export function setZoom(z: number): void {
  zoom = z;
  updatePixelsPerMeter();
}

export function getPixelsPerMeter(): number {
  return pixelsPerMeter;
}

function updatePixelsPerMeter(): void {
  pixelsPerMeter = basePixelsPerMeter * zoom;
}

export function getPanOffset(): Point {
  return panOffset;
}

export function setPanOffset(offset: Point): void {
  panOffset = offset;
}

export function getPanState(): { start: Point; origin: Point } | null {
  return panState;
}

export function setPanState(state: { start: Point; origin: Point } | null): void {
  panState = state;
}

export function getSnapMeters(): number {
  return snapMeters;
}

export function isInteractionActive(): boolean {
  return interactionActive;
}

export function setInteractionActive(active: boolean): void {
  interactionActive = active;
}

// =============================================================================
// COORDINATE TRANSFORMS
// =============================================================================

/**
 * Convert world coordinates to canvas coordinates.
 * Requires canvas reference to be set.
 */
export function worldToCanvas(point: Point): Point {
  if (!canvasRef) {
    throw new Error('Canvas reference not set. Call setCanvasRef first.');
  }
  const rect = canvasRef.getBoundingClientRect();
  return {
    x: rect.width / 2 + (point.x + panOffset.x) * pixelsPerMeter,
    y: rect.height / 2 - (point.y + panOffset.y) * pixelsPerMeter,
  };
}

/**
 * Convert canvas coordinates to world coordinates.
 * Requires canvas reference to be set.
 */
export function canvasToWorld(point: Point): Point {
  if (!canvasRef) {
    throw new Error('Canvas reference not set. Call setCanvasRef first.');
  }
  const rect = canvasRef.getBoundingClientRect();
  return {
    x: (point.x - rect.width / 2) / pixelsPerMeter - panOffset.x,
    y: -(point.y - rect.height / 2) / pixelsPerMeter - panOffset.y,
  };
}

/**
 * Get the visible world bounds.
 * Requires canvas reference to be set.
 */
export function getVisibleBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  if (!canvasRef) {
    throw new Error('Canvas reference not set. Call setCanvasRef first.');
  }
  const rect = canvasRef.getBoundingClientRect();
  const topLeft = canvasToWorld({ x: 0, y: 0 });
  const bottomRight = canvasToWorld({ x: rect.width, y: rect.height });
  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxX: Math.max(topLeft.x, bottomRight.x),
    maxY: Math.max(topLeft.y, bottomRight.y),
  };
}

/**
 * Get the canvas dimensions.
 * Requires canvas reference to be set.
 */
export function getCanvasDimensions(): { width: number; height: number } {
  if (!canvasRef) {
    throw new Error('Canvas reference not set. Call setCanvasRef first.');
  }
  const rect = canvasRef.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

/**
 * Snap a world point to the grid if within snap distance.
 */
export function snapToGrid(point: Point): Point {
  const snappedX = Math.round(point.x / snapMeters) * snapMeters;
  const snappedY = Math.round(point.y / snapMeters) * snapMeters;
  const snapThreshold = snapMeters / 2;

  return {
    x: Math.abs(point.x - snappedX) < snapThreshold ? snappedX : point.x,
    y: Math.abs(point.y - snappedY) < snapThreshold ? snappedY : point.y,
  };
}

/**
 * Check if a point is within snap distance of a grid line.
 */
export function isNearGrid(point: Point): { x: boolean; y: boolean } {
  const snapThreshold = snapMeters / 2;
  const snappedX = Math.round(point.x / snapMeters) * snapMeters;
  const snappedY = Math.round(point.y / snapMeters) * snapMeters;
  return {
    x: Math.abs(point.x - snappedX) < snapThreshold,
    y: Math.abs(point.y - snappedY) < snapThreshold,
  };
}

// =============================================================================
// ZOOM OPERATIONS
// =============================================================================

/** Apply zoom at a specific canvas point (keeps that point stationary) */
export function zoomAtPoint(delta: number, canvasPoint: Point): void {
  const oldZoom = zoom;
  const newZoom = Math.max(0.1, Math.min(10, zoom * (1 + delta)));

  if (newZoom === oldZoom) return;

  // Get world point before zoom
  const worldPoint = canvasToWorld(canvasPoint);

  // Apply new zoom
  zoom = newZoom;
  updatePixelsPerMeter();

  // Adjust pan to keep the world point at the same canvas position
  if (canvasRef) {
    const rect = canvasRef.getBoundingClientRect();
    panOffset = {
      x: (canvasPoint.x - rect.width / 2) / pixelsPerMeter - worldPoint.x,
      y: -(canvasPoint.y - rect.height / 2) / pixelsPerMeter - worldPoint.y,
    };
  }
}

/** Reset viewport to default state */
export function resetViewport(): void {
  zoom = 1;
  panOffset = { x: 0, y: 0 };
  updatePixelsPerMeter();
}
