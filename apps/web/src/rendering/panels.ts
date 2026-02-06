/**
 * Panel Rendering
 *
 * Draws measurement panels (grid areas) and sample points.
 */

import type { Point, Panel } from '../entities/index.js';
import type { CanvasTheme } from '../types/theme.js';
import { drawPolygon, drawHandle, drawCircle } from './primitives.js';

/** Panel vertex handle radius */
const PANEL_HANDLE_RADIUS = 6;

/**
 * Draw a single panel
 */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  panel: Panel,
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme,
  isSelected: boolean
): void {
  if (panel.points.length < 3) return;

  const canvasPoints = panel.points.map((p) => worldToCanvas(p));

  // Draw selection halo first
  if (isSelected) {
    // Draw wider stroke as halo
    ctx.strokeStyle = theme.selectionHalo;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
    for (let i = 1; i < canvasPoints.length; i++) {
      ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Draw panel polygon
  drawPolygon(ctx, canvasPoints, theme.panelFill, theme.panelStroke, 2);

  // Draw selected ring
  if (isSelected) {
    ctx.strokeStyle = theme.panelSelected;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
    for (let i = 1; i < canvasPoints.length; i++) {
      ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // Draw vertex handles
    for (const pt of canvasPoints) {
      drawHandle(ctx, pt, {
        fillColor: theme.panelHandleFill,
        strokeColor: theme.panelHandleStroke,
        radius: PANEL_HANDLE_RADIUS,
      });
    }
  }
}

/**
 * Draw all panels
 */
export function drawPanels(
  ctx: CanvasRenderingContext2D,
  panels: Panel[],
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme,
  isSelected: (id: string) => boolean
): void {
  for (const panel of panels) {
    drawPanel(ctx, panel, worldToCanvas, theme, isSelected(panel.id));
  }
}

/**
 * Panel sample point with computed value
 */
export type PanelSamplePoint = {
  x: number;
  y: number;
  LAeq: number;
};

/**
 * Color type for sample point rendering
 */
export type SampleColor = {
  r: number;
  g: number;
  b: number;
};

/**
 * Convert color to CSS string
 */
export function colorToCss(color: SampleColor): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

/**
 * Calculate sample ratio for color mapping
 */
export function panelSampleRatio(sample: PanelSamplePoint, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (sample.LAeq - min) / (max - min)));
}

/**
 * Get sample color from ratio (0 = low/blue, 1 = high/red)
 */
export function getSampleColor(ratio: number): SampleColor {
  // Simple blue-to-red gradient
  const r = Math.round(ratio * 255);
  const g = Math.round((1 - Math.abs(ratio - 0.5) * 2) * 128);
  const b = Math.round((1 - ratio) * 255);
  return { r, g, b };
}

/**
 * Draw panel sample points
 */
export function drawPanelSamples(
  ctx: CanvasRenderingContext2D,
  samples: PanelSamplePoint[],
  minValue: number,
  maxValue: number,
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme
): void {
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.sampleStroke;

  for (const sample of samples) {
    const ratio = panelSampleRatio(sample, minValue, maxValue);
    const color = getSampleColor(ratio);
    const pos = worldToCanvas(sample);

    drawCircle(ctx, pos, 4, colorToCss(color), theme.sampleStroke, 1);
  }
}
