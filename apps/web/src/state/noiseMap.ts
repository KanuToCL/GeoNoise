/**
 * Noise Map State Module
 *
 * Manages the noise-map overlay state: computed map data,
 * display range, render style, and band stepping.
 */

import type { NoiseMap, MapRange, MapRenderStyle } from '../types/index.js';
import { DEFAULT_MAP_BAND_STEP } from '../constants.js';

// =============================================================================
// NOISE MAP STATE
// =============================================================================

/** The most recently computed noise map data */
let noiseMap: NoiseMap | null = null;

/** Current display range for the noise map colour scale */
let currentMapRange: MapRange | null = null;

/** Render style for the noise map (Smooth, Banded, Contour) */
let mapRenderStyle: MapRenderStyle = 'Smooth';

/** Band step size for banded / contour render styles */
let mapBandStep = DEFAULT_MAP_BAND_STEP;

/** Whether the colour scale auto-adjusts to the computed data range */
let mapAutoScale = true;

// =============================================================================
// GETTERS / SETTERS
// =============================================================================

export function getNoiseMap(): NoiseMap | null {
  return noiseMap;
}
export function setNoiseMap(map: NoiseMap | null): void {
  noiseMap = map;
}

export function getCurrentMapRange(): MapRange | null {
  return currentMapRange;
}
export function setCurrentMapRange(range: MapRange | null): void {
  currentMapRange = range;
}

export function getMapRenderStyle(): MapRenderStyle {
  return mapRenderStyle;
}
export function setMapRenderStyle(style: MapRenderStyle): void {
  mapRenderStyle = style;
}

export function getMapBandStep(): number {
  return mapBandStep;
}
export function setMapBandStep(step: number): void {
  mapBandStep = step;
}

export function getMapAutoScale(): boolean {
  return mapAutoScale;
}
export function setMapAutoScale(value: boolean): void {
  mapAutoScale = value;
}
