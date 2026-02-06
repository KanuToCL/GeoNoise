/**
 * Probe Rendering
 *
 * Draws probe points as microphone icons with labels.
 */

import type { Point, Probe } from '../entities/index.js';
import type { CanvasTheme } from '../types/theme.js';
import { drawSelectionHalo, drawLabel } from './primitives.js';

/**
 * Draw a probe microphone icon
 */
export function drawProbe(
  ctx: CanvasRenderingContext2D,
  probe: Probe,
  canvasPos: Point,
  theme: CanvasTheme,
  isActive: boolean,
  isSelected: boolean
): void {
  ctx.save();

  // Draw selection/active halo
  if (isActive || isSelected) {
    drawSelectionHalo(ctx, canvasPos, theme.selectionHalo, theme.probeRing);
  }

  // Transform to probe position
  ctx.translate(canvasPos.x, canvasPos.y);
  ctx.strokeStyle = theme.probeStroke;
  ctx.fillStyle = theme.probeFill;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  // Mic head (circle)
  ctx.beginPath();
  ctx.arc(0, -6, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Mic body (rectangle part)
  ctx.beginPath();
  ctx.moveTo(-4, -6);
  ctx.lineTo(-4, 2);
  ctx.lineTo(4, 2);
  ctx.lineTo(4, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Stem
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(0, 8);
  ctx.stroke();

  // Base
  ctx.beginPath();
  ctx.moveTo(-6, 8);
  ctx.lineTo(6, 8);
  ctx.stroke();

  ctx.restore();

  // Draw label
  const probeLabel = probe.name || probe.id.toUpperCase();
  drawLabel(ctx, probeLabel, canvasPos, {
    color: theme.probeLabel,
    offsetX: 14,
    offsetY: 6,
  });
}

/**
 * Draw all probes
 */
export function drawProbes(
  ctx: CanvasRenderingContext2D,
  probes: Probe[],
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme,
  activeProbeId: string | null,
  isSelected: (id: string) => boolean
): void {
  for (const probe of probes) {
    const canvasPos = worldToCanvas(probe);
    drawProbe(
      ctx,
      probe,
      canvasPos,
      theme,
      probe.id === activeProbeId,
      isSelected(probe.id)
    );
  }
}
