/**
 * Noise Grid Computation
 *
 * Grid configuration building and noise map texture generation.
 * Extracts grid-related logic from main.ts for better modularity.
 */

import type {
  GridBounds,
  GridConfig,
  MapRange,
  NoiseMapData,
  GridComputeResult,
} from './types.js';

/** Minimum audible level (dB) - values below this are treated as silence */
export const MIN_LEVEL = -100;

/** Default map range when auto-scale is off */
export const DEFAULT_MAP_RANGE: MapRange = { min: 30, max: 90 };

/** Default band step for contour rendering */
export const DEFAULT_MAP_BAND_STEP = 5;

/** Band step for per-band display (wider variation) */
export const DEFAULT_MAP_BAND_STEP_PERBAND = 10;

/** Maximum labels in map legend */
export const MAX_MAP_LEGEND_LABELS = 8;

/** Resolution constants */
export const RES_HIGH = 1;
export const RES_LOW = 10;

/** Point caps for different modes */
export const DRAG_POINTS = 500;
export const STATIC_POINTS = 10000;
export const REFINE_POINTS = 40000;

/**
 * Merge two bounds to encompass both
 */
export function mergeBounds(a: GridBounds, b: GridBounds): GridBounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Compute the range of values in a grid
 *
 * @param values - Array of dB values
 * @returns MapRange or null if all values are below MIN_LEVEL
 */
export function computeMapRange(values: number[]): MapRange | null {
  let min = Infinity;
  let max = -Infinity;

  for (const value of values) {
    if (!Number.isFinite(value) || value <= MIN_LEVEL) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

/**
 * Get deterministic grid counts from bounds and resolution
 *
 * @param bounds - Grid bounds
 * @param resolution - Grid cell size in meters
 * @returns Object with cols and rows
 */
export function getGridCounts(
  bounds: GridBounds,
  resolution: number
): { cols: number; rows: number } {
  const cols = Math.max(1, Math.floor((bounds.maxX - bounds.minX) / resolution + 1e-6) + 1);
  const rows = Math.max(1, Math.floor((bounds.maxY - bounds.minY) / resolution + 1e-6) + 1);
  return { cols, rows };
}

/**
 * Turbo colormap function (approximation)
 * Returns RGB values for normalized input [0, 1]
 */
function turboColormap(t: number): [number, number, number] {
  // Simplified turbo colormap approximation
  const r = Math.max(0, Math.min(255, Math.round(
    34.61 + t * (1172.33 + t * (-10793.56 + t * (33300.12 + t * (-38394.49 + t * 14825.05))))
  )));
  const g = Math.max(0, Math.min(255, Math.round(
    23.31 + t * (557.33 + t * (1225.33 + t * (-3574.96 + t * (1073.77 + t * 707.56))))
  )));
  const b = Math.max(0, Math.min(255, Math.round(
    27.2 + t * (3211.1 + t * (-15327.97 + t * (27814 + t * (-22569.18 + t * 6838.66))))
  )));
  return [r, g, b];
}

/**
 * Build a noise map texture from grid values
 *
 * @param grid - Grid computation result
 * @param range - Value range for color mapping
 * @returns Canvas element with rendered heatmap, or null if empty
 */
export function buildNoiseMapTexture(
  grid: GridComputeResult,
  range: MapRange
): HTMLCanvasElement | null {
  if (!grid.values.length) return null;

  const { cols, rows } = getGridCounts(grid.bounds, grid.resolution);
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const image = ctx.createImageData(cols, rows);
  const span = range.max - range.min;
  const alpha = 200;

  for (let y = 0; y < rows; y++) {
    // Canvas image space is y-down; grid space is y-up
    const destY = rows - 1 - y;

    for (let x = 0; x < cols; x++) {
      // Values stored with x-major order (x outer loop, y inner loop)
      const value = grid.values[x * rows + y];
      const pixelIndex = (destY * cols + x) * 4;

      if (!Number.isFinite(value) || value <= MIN_LEVEL) {
        // Transparent for inaudible values
        image.data[pixelIndex] = 0;
        image.data[pixelIndex + 1] = 0;
        image.data[pixelIndex + 2] = 0;
        image.data[pixelIndex + 3] = 0;
      } else {
        // Normalize to [0, 1] and apply colormap
        const t = span > 0 ? Math.max(0, Math.min(1, (value - range.min) / span)) : 0.5;
        const [r, g, b] = turboColormap(t);
        image.data[pixelIndex] = r;
        image.data[pixelIndex + 1] = g;
        image.data[pixelIndex + 2] = b;
        image.data[pixelIndex + 3] = alpha;
      }
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Build grid configuration for noise map computation
 *
 * @param sceneBounds - Bounds of scene elements
 * @param viewportBounds - Current viewport bounds
 * @param pixelsPerMeter - Current zoom level
 * @param options - Configuration options
 * @returns GridConfig or null if bounds invalid
 */
export function buildGridConfig(
  sceneBounds: GridBounds | null,
  viewportBounds: GridBounds,
  pixelsPerMeter: number,
  options: {
    resolutionPx?: number;
    maxPoints?: number;
    targetBand?: number;
    weighting?: 'A' | 'C' | 'Z';
  } = {}
): GridConfig | null {
  if (!sceneBounds) return null;

  let { minX, minY, maxX, maxY } = sceneBounds;

  // Handle degenerate bounds
  if (minX === maxX) {
    minX -= 5;
    maxX += 5;
  }
  if (minY === maxY) {
    minY -= 5;
    maxY += 5;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const padRatio = 0.15;

  // Pad scene bounds by 15%
  const paddedScene: GridBounds = {
    minX: minX - width * padRatio,
    minY: minY - height * padRatio,
    maxX: maxX + width * padRatio,
    maxY: maxY + height * padRatio,
  };

  // Merge with viewport bounds
  const padded = mergeBounds(paddedScene, viewportBounds);
  const paddedWidth = padded.maxX - padded.minX;
  const paddedHeight = padded.maxY - padded.minY;

  // Calculate resolution
  let resolution = Math.max(paddedWidth, paddedHeight) / 40;

  // Convert pixel resolution to meters if specified
  if (
    Number.isFinite(options.resolutionPx) &&
    Number.isFinite(pixelsPerMeter) &&
    pixelsPerMeter > 0
  ) {
    const stepPx = Math.max(1, options.resolutionPx ?? 1);
    resolution = stepPx / pixelsPerMeter;
  }

  if (!Number.isFinite(resolution) || resolution <= 0) {
    resolution = 1;
  }

  // Calculate grid size
  let cols = Math.ceil(paddedWidth / resolution) + 1;
  let rows = Math.ceil(paddedHeight / resolution) + 1;

  // Apply point cap
  const defaultCap = Number.isFinite(options.resolutionPx) ? STATIC_POINTS : 2500;
  const targetPoints = options.maxPoints ?? defaultCap;
  const pointCount = cols * rows;

  if (pointCount > targetPoints) {
    const scale = Math.sqrt(pointCount / targetPoints);
    resolution *= scale;
    cols = Math.ceil(paddedWidth / resolution) + 1;
    rows = Math.ceil(paddedHeight / resolution) + 1;
  }

  return {
    enabled: true,
    bounds: padded,
    resolution,
    elevation: 1.5,
    targetBand: options.targetBand,
    weighting: options.weighting,
  };
}

/**
 * Build legend labels for banded (contour) rendering
 *
 * @param range - Value range
 * @param step - Band step size
 * @returns Array of label values
 */
export function buildBandedLegendLabels(range: MapRange, step: number): number[] {
  const clampedStep = Math.min(20, Math.max(1, step));
  const start = Math.floor(range.min / clampedStep) * clampedStep;
  const end = Math.ceil(range.max / clampedStep) * clampedStep;
  const labels: number[] = [];

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return [range.min, range.max];
  }

  for (let value = start; value <= end + 1e-6; value += clampedStep) {
    labels.push(value);
  }

  if (labels.length <= MAX_MAP_LEGEND_LABELS) {
    return labels;
  }

  // Sample if too many labels
  const inner = labels.slice(1, -1);
  const stride = Math.ceil(inner.length / (MAX_MAP_LEGEND_LABELS - 2));
  const sampled = inner.filter((_, index) => index % stride === 0);
  return [labels[0], ...sampled, labels[labels.length - 1]];
}

/**
 * Snap a value to a band boundary for contour rendering
 */
export function snapToContourBand(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

/**
 * Convert grid result to NoiseMapData with texture
 */
export function createNoiseMapData(
  result: GridComputeResult,
  range: MapRange
): NoiseMapData | null {
  const texture = buildNoiseMapTexture(result, range);
  if (!texture) return null;

  const { cols, rows } = getGridCounts(result.bounds, result.resolution);
  const valueRange = computeMapRange(result.values);

  return {
    bounds: result.bounds,
    resolution: result.resolution,
    elevation: result.elevation,
    cols,
    rows,
    values: result.values,
    min: valueRange?.min ?? range.min,
    max: valueRange?.max ?? range.max,
    texture,
  };
}
