/**
 * Barrier Rendering
 *
 * Draws noise barriers as thick lines with endpoint and rotation handles.
 */

import type { Point, Barrier } from '../entities/index.js';
import type { CanvasTheme } from '../types/theme.js';
import { drawLine, drawHandle } from './primitives.js';
import {
  getBarrierMidpoint,
  getBarrierRotationHandlePosition,
  BARRIER_HANDLE_RADIUS,
  BARRIER_ROTATION_HANDLE_RADIUS,
} from '../entities/index.js';

/** Selection halo line width */
const HALO_WIDTH = 12;

/** Barrier line width */
const BARRIER_WIDTH = 6;

/** Draft barrier line width */
const DRAFT_WIDTH = 4;

/** Draft dash pattern */
const DRAFT_DASH: [number, number] = [6, 6];

/**
 * Draw a single barrier
 */
export function drawBarrier(
  ctx: CanvasRenderingContext2D,
  barrier: Barrier,
  startCanvas: Point,
  endCanvas: Point,
  theme: CanvasTheme,
  isSelected: boolean,
  pixelsPerMeter: number,
  worldToCanvas: (point: Point) => Point,
  rotationHandleOffsetPx: number
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (isSelected) {
    // Selection halo
    drawLine(ctx, startCanvas, endCanvas, { color: theme.selectionHalo, width: HALO_WIDTH });
    // Selected stroke
    drawLine(ctx, startCanvas, endCanvas, { color: theme.barrierSelected, width: BARRIER_WIDTH });

    // Endpoint handles
    drawHandle(ctx, startCanvas, {
      fillColor: '#ffffff',
      strokeColor: theme.barrierSelected,
      radius: BARRIER_HANDLE_RADIUS,
    });
    drawHandle(ctx, endCanvas, {
      fillColor: '#ffffff',
      strokeColor: theme.barrierSelected,
      radius: BARRIER_HANDLE_RADIUS,
    });

    // Rotation handle
    const handleOffset = rotationHandleOffsetPx / pixelsPerMeter;
    const midWorld = getBarrierMidpoint(barrier);
    const midCanvas = worldToCanvas(midWorld);
    const handleWorld = getBarrierRotationHandlePosition(barrier, handleOffset);
    const handleCanvas = worldToCanvas(handleWorld);

    // Line from midpoint to rotation handle
    ctx.strokeStyle = theme.barrierSelected;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(midCanvas.x, midCanvas.y);
    ctx.lineTo(handleCanvas.x, handleCanvas.y);
    ctx.stroke();

    // Rotation handle circle
    drawHandle(ctx, handleCanvas, {
      fillColor: '#ffffff',
      strokeColor: theme.barrierSelected,
      radius: BARRIER_ROTATION_HANDLE_RADIUS,
    });
  } else {
    // Normal stroke
    drawLine(ctx, startCanvas, endCanvas, { color: theme.barrierStroke, width: BARRIER_WIDTH });
  }
}

/**
 * Draw all barriers
 */
export function drawBarriers(
  ctx: CanvasRenderingContext2D,
  barriers: Barrier[],
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme,
  isSelected: (id: string) => boolean,
  pixelsPerMeter: number,
  rotationHandleOffsetPx: number
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const barrier of barriers) {
    const start = worldToCanvas(barrier.p1);
    const end = worldToCanvas(barrier.p2);
    drawBarrier(
      ctx,
      barrier,
      start,
      end,
      theme,
      isSelected(barrier.id),
      pixelsPerMeter,
      worldToCanvas,
      rotationHandleOffsetPx
    );
  }
}

/**
 * Barrier draft for preview rendering
 */
export type BarrierDraftData = {
  p1: Point;
  p2: Point;
};

/**
 * Barrier center draft for center-outward mode
 */
export type BarrierCenterDraftData = {
  center: Point;
  end: Point;
};

/**
 * Draw barrier draft preview (endpoint mode)
 */
export function drawBarrierDraft(
  ctx: CanvasRenderingContext2D,
  draft: BarrierDraftData,
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme
): void {
  const start = worldToCanvas(draft.p1);
  const end = worldToCanvas(draft.p2);
  drawLine(ctx, start, end, {
    color: theme.barrierStroke,
    width: DRAFT_WIDTH,
    dash: DRAFT_DASH,
  });
}

/**
 * Draw barrier center draft preview (center-outward mode)
 */
export function drawBarrierCenterDraft(
  ctx: CanvasRenderingContext2D,
  draft: BarrierCenterDraftData,
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme
): void {
  // Calculate mirrored endpoints
  const dx = draft.end.x - draft.center.x;
  const dy = draft.end.y - draft.center.y;

  const p1: Point = { x: draft.center.x - dx, y: draft.center.y - dy };
  const p2: Point = { x: draft.center.x + dx, y: draft.center.y + dy };

  const start = worldToCanvas(p1);
  const end = worldToCanvas(p2);
  drawLine(ctx, start, end, {
    color: theme.barrierStroke,
    width: DRAFT_WIDTH,
    dash: DRAFT_DASH,
  });

  // Center point indicator
  const center = worldToCanvas(draft.center);
  ctx.beginPath();
  ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 136, 0, 0.8)';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();
}
