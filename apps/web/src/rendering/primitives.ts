/**
 * Canvas Primitives
 *
 * Low-level drawing primitives for canvas rendering.
 * These are stateless functions that take a context and draw shapes.
 */

import type { Point } from '../entities/index.js';
import type { HandleOptions, LineOptions, LabelOptions, BadgeOptions, DimensionBox } from './types.js';

/**
 * Draw a line between two canvas points
 */
export function drawLine(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  options: LineOptions
): void {
  ctx.strokeStyle = options.color;
  ctx.lineWidth = options.width;
  ctx.lineCap = options.cap ?? 'round';
  ctx.lineJoin = options.join ?? 'round';

  if (options.dash) {
    ctx.setLineDash(options.dash);
  }

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  if (options.dash) {
    ctx.setLineDash([]);
  }
}

/**
 * Draw a circular handle (for resize/rotate controls)
 */
export function drawHandle(
  ctx: CanvasRenderingContext2D,
  center: Point,
  options: HandleOptions
): void {
  ctx.beginPath();
  ctx.arc(center.x, center.y, options.radius, 0, Math.PI * 2);
  ctx.fillStyle = options.fillColor;
  ctx.fill();
  ctx.strokeStyle = options.strokeColor;
  ctx.lineWidth = options.lineWidth ?? 1.5;
  ctx.stroke();
}

/**
 * Draw a filled circle
 */
export function drawCircle(
  ctx: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  fillColor: string,
  strokeColor?: string,
  lineWidth = 2
): void {
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();

  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/**
 * Draw a selection halo (filled circle + ring stroke)
 */
export function drawSelectionHalo(
  ctx: CanvasRenderingContext2D,
  center: Point,
  haloColor: string,
  ringColor: string,
  haloRadius = 18,
  ringRadius = 14
): void {
  // Filled halo
  ctx.fillStyle = haloColor;
  ctx.beginPath();
  ctx.arc(center.x, center.y, haloRadius, 0, Math.PI * 2);
  ctx.fill();

  // Ring stroke
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(center.x, center.y, ringRadius, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Draw a polygon from vertices (closed path)
 */
export function drawPolygon(
  ctx: CanvasRenderingContext2D,
  vertices: Point[],
  fillColor: string,
  strokeColor: string,
  lineWidth = 2
): void {
  if (vertices.length < 3) return;

  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();

  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/**
 * Draw a polyline (open path, no fill)
 */
export function drawPolyline(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  options: LineOptions
): void {
  if (points.length < 2) return;

  ctx.strokeStyle = options.color;
  ctx.lineWidth = options.width;
  ctx.lineCap = options.cap ?? 'round';
  ctx.lineJoin = options.join ?? 'round';

  if (options.dash) {
    ctx.setLineDash(options.dash);
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  if (options.dash) {
    ctx.setLineDash([]);
  }
}

/**
 * Draw a text label
 */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: Point,
  options: LabelOptions
): void {
  ctx.fillStyle = options.color;
  ctx.font = options.font ?? '12px "Work Sans", sans-serif';
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = options.baseline ?? 'alphabetic';

  const x = position.x + (options.offsetX ?? 0);
  const y = position.y + (options.offsetY ?? 0);
  ctx.fillText(text, x, y);
}

/**
 * Draw a badge with background
 */
export function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: Point,
  options: BadgeOptions
): void {
  const padding = options.padding ?? 7;
  const offsetX = options.offsetX ?? 12;
  const offsetY = options.offsetY ?? 14;

  ctx.font = '12px "Work Sans", sans-serif';
  const textWidth = ctx.measureText(text).width;
  const width = textWidth + padding * 2;
  const height = 20;

  const x = position.x + offsetX;
  const y = position.y + offsetY;

  // Background
  ctx.fillStyle = options.bgColor;
  ctx.fillRect(x, y, width, height);

  // Border
  ctx.strokeStyle = options.borderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);

  // Text
  ctx.fillStyle = options.textColor;
  ctx.fillText(text, x + padding, y + 14);
}

/**
 * Draw a dimension info box (for building/barrier drafts)
 */
export function drawDimensionBox(
  ctx: CanvasRenderingContext2D,
  options: DimensionBox
): void {
  const {
    lines,
    centerX,
    centerY,
    bgColor = 'rgba(0, 0, 0, 0.85)',
    textColor = '#00ff88',
    font = '12px "Work Sans", monospace',
  } = options;

  const lineHeight = 16;
  const padding = 6;

  ctx.font = font;
  const maxWidth = Math.max(...lines.map((t) => ctx.measureText(t).width));
  const boxWidth = maxWidth + padding * 2;
  const boxHeight = lines.length * lineHeight + padding * 2;

  const boxX = centerX - boxWidth / 2;
  const boxY = centerY - boxHeight / 2;

  // Background box
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 4);
  ctx.fill();

  // Text
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((text, i) => {
    const y = boxY + padding + lineHeight / 2 + i * lineHeight;
    ctx.fillText(text, centerX, y);
  });
}

/**
 * Draw a dashed rectangle
 */
export function drawDashedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  strokeColor: string,
  lineWidth = 2,
  dash: number[] = [6, 6]
): void {
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.strokeRect(x, y, width, height);
  ctx.setLineDash([]);
}

/**
 * Draw a triangle (downward pointing by default)
 */
export function drawTriangle(
  ctx: CanvasRenderingContext2D,
  center: Point,
  size: number,
  fillColor: string,
  strokeColor: string,
  lineWidth = 2
): void {
  ctx.beginPath();
  ctx.moveTo(center.x, center.y - size); // top
  ctx.lineTo(center.x + size, center.y + size); // bottom right
  ctx.lineTo(center.x - size, center.y + size); // bottom left
  ctx.closePath();

  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}
