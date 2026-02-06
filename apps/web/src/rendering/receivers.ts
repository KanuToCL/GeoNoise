/**
 * Receiver Rendering
 *
 * Draws receiver points as triangles with labels and result badges.
 */

import type { Point, Receiver } from '../entities/index.js';
import type { CanvasTheme } from '../types/theme.js';
import { drawTriangle, drawSelectionHalo, drawLabel, drawBadge } from './primitives.js';

/** Receiver triangle size in pixels */
export const RECEIVER_SIZE = 10;

/** Selection halo radius */
export const RECEIVER_HALO_RADIUS = 18;

/** Selection ring radius */
export const RECEIVER_RING_RADIUS = 14;

/**
 * Draw a single receiver (triangle shape)
 */
export function drawReceiver(
  ctx: CanvasRenderingContext2D,
  receiver: Receiver,
  canvasPos: Point,
  theme: CanvasTheme,
  isSelected: boolean
): void {
  // Draw selection halo first (behind icon)
  if (isSelected) {
    drawSelectionHalo(ctx, canvasPos, theme.selectionHalo, theme.receiverRing);
  }

  // Draw receiver triangle
  drawTriangle(ctx, canvasPos, RECEIVER_SIZE, theme.receiverFill, theme.receiverStroke, 2);

  // Draw label
  const displayName = receiver.name || receiver.id.toUpperCase();
  drawLabel(ctx, displayName, canvasPos, {
    color: theme.receiverLabel,
    offsetX: 14,
    offsetY: 4,
  });
}

/**
 * Draw all receivers
 */
export function drawReceivers(
  ctx: CanvasRenderingContext2D,
  receivers: Receiver[],
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme,
  isSelected: (id: string) => boolean
): void {
  ctx.fillStyle = theme.receiverFill;
  ctx.strokeStyle = theme.receiverStroke;
  ctx.lineWidth = 2;

  for (const receiver of receivers) {
    const canvasPos = worldToCanvas(receiver);
    drawReceiver(ctx, receiver, canvasPos, theme, isSelected(receiver.id));
  }
}

/**
 * Receiver result data for badge rendering
 */
export type ReceiverResultData = {
  id: string;
  level: number;
  unit: string;
};

/**
 * Draw receiver result badges
 */
export function drawReceiverBadges(
  ctx: CanvasRenderingContext2D,
  receivers: Receiver[],
  results: Map<string, ReceiverResultData>,
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme,
  formatLevel: (value: number) => string
): void {
  for (const receiver of receivers) {
    const result = results.get(receiver.id);
    if (!result) continue;

    const canvasPos = worldToCanvas(receiver);
    const label = `${formatLevel(result.level)} ${result.unit}`;

    drawBadge(ctx, label, canvasPos, {
      bgColor: theme.badgeBg,
      borderColor: theme.badgeBorder,
      textColor: theme.badgeText,
      offsetX: 12,
      offsetY: 14,
    });
  }
}
