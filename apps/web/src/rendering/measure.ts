/**
 * Measurement Tool Rendering
 *
 * Draws the measurement line and distance label.
 */

import type { Point } from '../entities/index.js';
import type { CanvasTheme } from '../types/theme.js';
import { drawLine, drawLabel } from './primitives.js';

/**
 * Calculate distance between two points
 */
export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Draw the measurement tool visualization
 *
 * @param ctx - 2D rendering context
 * @param startWorld - Start point in world coordinates
 * @param endWorld - End point in world coordinates
 * @param worldToCanvas - Coordinate transform function
 * @param theme - Canvas theme for colors
 * @param formatMeters - Function to format distance value
 */
export function drawMeasurement(
  ctx: CanvasRenderingContext2D,
  startWorld: Point,
  endWorld: Point,
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme,
  formatMeters: (value: number) => string
): void {
  const start = worldToCanvas(startWorld);
  const end = worldToCanvas(endWorld);
  const dist = distance(startWorld, endWorld);

  // Draw dashed line
  drawLine(ctx, start, end, {
    color: theme.measureLine,
    width: 2,
    dash: [6, 6],
  });

  // Draw distance label at midpoint
  const label = `${formatMeters(dist)} m`;
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  drawLabel(ctx, label, mid, {
    color: theme.measureText,
    offsetX: 6,
    offsetY: -6,
  });
}

/**
 * Draw the selection box (rubber band)
 */
export function drawSelectBox(
  ctx: CanvasRenderingContext2D,
  startCanvas: Point,
  currentCanvas: Point
): void {
  const x = Math.min(startCanvas.x, currentCanvas.x);
  const y = Math.min(startCanvas.y, currentCanvas.y);
  const w = Math.abs(currentCanvas.x - startCanvas.x);
  const h = Math.abs(currentCanvas.y - startCanvas.y);

  // Semi-transparent fill
  ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
  ctx.fillRect(x, y, w, h);

  // Dashed stroke
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}
