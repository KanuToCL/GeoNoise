/**
 * Source Rendering
 *
 * Draws sound sources as circular icons with labels.
 */

import type { Point, Source } from '../entities/index.js';
import type { CanvasTheme } from '../types/theme.js';
import { drawCircle, drawSelectionHalo, drawLabel } from './primitives.js';

/** Source icon radius in pixels */
export const SOURCE_RADIUS = 10;

/** Selection halo radius */
export const SOURCE_HALO_RADIUS = 18;

/** Selection ring radius */
export const SOURCE_RING_RADIUS = 14;

/**
 * Source rendering options
 */
export type SourceRenderOptions = {
  isSelected: boolean;
  isMuted: boolean;
  isSuppressed: boolean;
  isHovered: boolean;
};

/**
 * Draw a single source
 */
export function drawSource(
  ctx: CanvasRenderingContext2D,
  source: Source,
  canvasPos: Point,
  theme: CanvasTheme,
  options: SourceRenderOptions
): void {
  const { isSelected, isMuted, isSuppressed, isHovered } = options;
  const isDimmed = isMuted || isSuppressed;

  const fill = isDimmed ? theme.sourceMutedFill : theme.sourceFill;
  const stroke = isDimmed ? theme.sourceMutedStroke : theme.sourceStroke;
  const labelColor = isDimmed ? theme.sourceMutedText : theme.sourceLabel;

  // Draw selection halo first (behind icon)
  if (isSelected) {
    drawSelectionHalo(ctx, canvasPos, theme.selectionHalo, theme.sourceRing);
  }

  // Draw source circle
  drawCircle(ctx, canvasPos, SOURCE_RADIUS, fill, stroke, 2);

  // Draw label
  const displayName = source.name || source.id.toUpperCase();
  drawLabel(ctx, displayName, canvasPos, {
    color: labelColor,
    offsetX: 14,
    offsetY: -6,
  });

  // Draw muted tooltip on hover
  if (isHovered && isMuted) {
    drawMutedTooltip(ctx, canvasPos, theme);
  }
}

/**
 * Draw muted source tooltip
 */
function drawMutedTooltip(
  ctx: CanvasRenderingContext2D,
  position: Point,
  theme: CanvasTheme
): void {
  const label = 'Muted';
  ctx.font = '11px "Work Sans", sans-serif';
  const paddingX = 6;
  const boxWidth = ctx.measureText(label).width + paddingX * 2;
  const boxHeight = 18;
  const boxX = position.x + 14;
  const boxY = position.y + 8;

  ctx.fillStyle = theme.sourceTooltipBg;
  ctx.strokeStyle = theme.sourceTooltipBorder;
  ctx.lineWidth = 1;
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
  ctx.fillStyle = theme.sourceTooltipText;
  ctx.fillText(label, boxX + paddingX, boxY + 12);
}

/**
 * Draw all sources
 */
export function drawSources(
  ctx: CanvasRenderingContext2D,
  sources: Source[],
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme,
  isSelected: (id: string) => boolean,
  soloSourceId: string | null,
  hoveredSourceId: string | null
): void {
  for (const source of sources) {
    const canvasPos = worldToCanvas(source);
    const options: SourceRenderOptions = {
      isSelected: isSelected(source.id),
      isMuted: !source.enabled,
      isSuppressed: soloSourceId !== null && soloSourceId !== source.id,
      isHovered: hoveredSourceId === source.id,
    };
    drawSource(ctx, source, canvasPos, theme, options);
  }
}
