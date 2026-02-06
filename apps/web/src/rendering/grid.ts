/**
 * Grid Rendering
 *
 * Draws the background grid at 20-meter intervals.
 */

import type { CanvasTheme } from '../types/theme.js';

/** Default grid step in meters */
export const GRID_STEP_METERS = 20;

/**
 * Draw the background grid
 *
 * @param ctx - 2D rendering context
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @param pixelsPerMeter - Current scale
 * @param theme - Canvas theme for colors
 * @param stepMeters - Grid spacing in meters (default: 20)
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  pixelsPerMeter: number,
  theme: CanvasTheme,
  stepMeters = GRID_STEP_METERS
): void {
  const stepPixels = stepMeters * pixelsPerMeter;

  ctx.strokeStyle = theme.gridLine;
  ctx.lineWidth = 1;

  // Vertical lines
  for (let x = (canvasWidth / 2) % stepPixels; x <= canvasWidth; x += stepPixels) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = (canvasHeight / 2) % stepPixels; y <= canvasHeight; y += stepPixels) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth, y);
    ctx.stroke();
  }
}
