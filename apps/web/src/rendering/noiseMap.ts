/**
 * Noise Map Rendering
 *
 * Renders the precomputed noise heatmap texture to the canvas.
 */

import type { Point } from '../entities/index.js';

/**
 * Noise map data structure
 */
export type NoiseMapRenderData = {
  texture: HTMLCanvasElement;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
};

/**
 * Draw the noise map heatmap
 *
 * The map is stretched to cover its world-space bounds, not drawn at native pixel size.
 *
 * @param ctx - 2D rendering context
 * @param noiseMap - Noise map data with texture and bounds
 * @param worldToCanvas - Coordinate transform function
 * @param smoothing - Whether to enable image smoothing (disable for crisp pixels)
 */
export function drawNoiseMap(
  ctx: CanvasRenderingContext2D,
  noiseMap: NoiseMapRenderData,
  worldToCanvas: (point: Point) => Point,
  smoothing = false
): void {
  // Convert world bounds to canvas coordinates
  const topLeft = worldToCanvas({ x: noiseMap.bounds.minX, y: noiseMap.bounds.maxY });
  const bottomRight = worldToCanvas({ x: noiseMap.bounds.maxX, y: noiseMap.bounds.minY });

  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;

  if (width <= 0 || height <= 0) return;

  ctx.save();
  ctx.imageSmoothingEnabled = smoothing;
  ctx.drawImage(noiseMap.texture, topLeft.x, topLeft.y, width, height);
  ctx.restore();
}

/**
 * Check if a noise map is valid for rendering
 */
export function isNoiseMapValid(noiseMap: NoiseMapRenderData | null): noiseMap is NoiseMapRenderData {
  return noiseMap !== null && noiseMap.texture !== null;
}
