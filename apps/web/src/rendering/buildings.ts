/**
 * Building Rendering
 *
 * Draws buildings as filled polygons with optional draft previews.
 */

import type { Point } from '../entities/index.js';
import type { Building } from '../entities/index.js';
import type { CanvasTheme } from '../types/theme.js';
import { drawPolygon, drawDashedRect, drawDimensionBox, drawHandle, drawPolyline } from './primitives.js';
import {
  BUILDING_HANDLE_RADIUS,
  BUILDING_ROTATION_HANDLE_RADIUS,
  BUILDING_ROTATION_HANDLE_OFFSET_PX,
} from '../entities/index.js';

/**
 * Draw a single building
 */
export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  building: Building,
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme,
  pixelsPerMeter: number
): void {
  const vertices = building.getVertices();
  if (vertices.length < 3) return;

  // Convert to canvas coordinates
  const canvasVertices = vertices.map((v) => worldToCanvas(v));

  // Draw filled polygon
  drawPolygon(ctx, canvasVertices, building.color, theme.panelStroke, 2);

  // Draw controls (handles, rotation)
  const handleOffset = BUILDING_ROTATION_HANDLE_OFFSET_PX / pixelsPerMeter;
  building.renderControls(ctx, worldToCanvas, {
    stroke: theme.panelSelected,
    lineWidth: 2,
    dash: [6, 6],
    handleFill: '#ffffff',
    handleStroke: theme.panelStroke,
    handleRadius: BUILDING_HANDLE_RADIUS,
    rotationHandleOffset: handleOffset,
    rotationHandleRadius: BUILDING_ROTATION_HANDLE_RADIUS,
    rotationHandleStroke: theme.panelStroke,
  });
}

/**
 * Draw all buildings
 */
export function drawBuildings(
  ctx: CanvasRenderingContext2D,
  buildings: Building[],
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme,
  pixelsPerMeter: number
): void {
  ctx.lineWidth = 2;

  for (const building of buildings) {
    drawBuilding(ctx, building, worldToCanvas, theme, pixelsPerMeter);
  }
}

/**
 * Building draft for diagonal drawing mode
 */
export type BuildingDraftData = {
  corner1: Point;
  corner2: Point;
};

/**
 * Building center draft for center-outward mode
 */
export type BuildingCenterDraftData = {
  center: Point;
  corner: Point;
};

/**
 * Draw building draft preview (diagonal mode)
 */
export function drawBuildingDraft(
  ctx: CanvasRenderingContext2D,
  draft: BuildingDraftData,
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme
): void {
  const c1 = worldToCanvas(draft.corner1);
  const c2 = worldToCanvas(draft.corner2);

  const left = Math.min(c1.x, c2.x);
  const right = Math.max(c1.x, c2.x);
  const top = Math.min(c1.y, c2.y);
  const bottom = Math.max(c1.y, c2.y);

  // Draw dashed rectangle
  drawDashedRect(ctx, left, top, right - left, bottom - top, theme.barrierStroke, 2);

  // Calculate and show dimensions
  const worldWidth = Math.abs(draft.corner2.x - draft.corner1.x);
  const worldHeight = Math.abs(draft.corner2.y - draft.corner1.y);

  if (worldWidth > 0.5 || worldHeight > 0.5) {
    drawDimensionBox(ctx, {
      lines: [
        `W: ${worldWidth.toFixed(1)}m`,
        `H: ${worldHeight.toFixed(1)}m`,
        `A: ${(worldWidth * worldHeight).toFixed(0)} m²`,
      ],
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2,
    });
  }
}

/**
 * Draw building center draft preview (center-outward mode)
 */
export function drawBuildingCenterDraft(
  ctx: CanvasRenderingContext2D,
  draft: BuildingCenterDraftData,
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme
): void {
  const dx = Math.abs(draft.corner.x - draft.center.x);
  const dy = Math.abs(draft.corner.y - draft.center.y);

  const left = draft.center.x - dx;
  const right = draft.center.x + dx;
  const top = draft.center.y - dy;
  const bottom = draft.center.y + dy;

  const c1 = worldToCanvas({ x: left, y: top });
  const c2 = worldToCanvas({ x: right, y: bottom });

  const canvasLeft = Math.min(c1.x, c2.x);
  const canvasRight = Math.max(c1.x, c2.x);
  const canvasTop = Math.min(c1.y, c2.y);
  const canvasBottom = Math.max(c1.y, c2.y);

  // Draw dashed rectangle
  drawDashedRect(
    ctx,
    canvasLeft,
    canvasTop,
    canvasRight - canvasLeft,
    canvasBottom - canvasTop,
    theme.barrierStroke,
    2
  );

  // Draw center indicator
  const center = worldToCanvas(draft.center);
  ctx.beginPath();
  ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 136, 0, 0.8)';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Show dimensions
  const worldWidth = dx * 2;
  const worldHeight = dy * 2;

  if (worldWidth > 0.5 || worldHeight > 0.5) {
    drawDimensionBox(ctx, {
      lines: [
        `W: ${worldWidth.toFixed(1)}m`,
        `H: ${worldHeight.toFixed(1)}m`,
        `A: ${(worldWidth * worldHeight).toFixed(0)} m²`,
      ],
      centerX: (canvasLeft + canvasRight) / 2,
      centerY: (canvasTop + canvasBottom) / 2,
    });
  }
}

/**
 * Draw polygon building draft preview with validation
 */
export function drawBuildingPolygonDraft(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  previewPoint: Point | null,
  worldToCanvas: (point: Point) => Point,
  theme: CanvasTheme,
  isValidQuadrilateral?: (p0: Point, p1: Point, p2: Point, p3: Point) => boolean,
  canvasWidth?: number
): void {
  if (points.length === 0) return;

  const canvasPoints = points.map((p) => worldToCanvas(p));

  // Draw edges between placed points
  ctx.strokeStyle = theme.barrierStroke;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);

  if (canvasPoints.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
    for (let i = 1; i < canvasPoints.length; i++) {
      ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
    }
    ctx.stroke();
  }

  // Draw preview line to mouse position
  if (previewPoint && canvasPoints.length < 4) {
    const previewCanvas = worldToCanvas(previewPoint);
    const lastPoint = canvasPoints[canvasPoints.length - 1];

    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(previewCanvas.x, previewCanvas.y);
    ctx.stroke();

    // If this would be the 4th point, show closing line and validation preview
    if (canvasPoints.length === 3 && isValidQuadrilateral) {
      // Draw closing line preview
      ctx.beginPath();
      ctx.moveTo(previewCanvas.x, previewCanvas.y);
      ctx.lineTo(canvasPoints[0].x, canvasPoints[0].y);
      ctx.stroke();

      // Check if this position would create valid quadrilateral
      const [p0, p1, p2] = points;
      const p3 = previewPoint;
      const isValid = isValidQuadrilateral(p0, p1, p2, p3);

      // Show semi-transparent fill preview
      ctx.beginPath();
      ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
      ctx.lineTo(canvasPoints[1].x, canvasPoints[1].y);
      ctx.lineTo(canvasPoints[2].x, canvasPoints[2].y);
      ctx.lineTo(previewCanvas.x, previewCanvas.y);
      ctx.closePath();
      ctx.fillStyle = isValid ? 'rgba(100, 200, 100, 0.2)' : 'rgba(255, 100, 100, 0.2)';
      ctx.fill();
    }
  }
  ctx.setLineDash([]);

  // Draw corner points with numbers
  for (let i = 0; i < canvasPoints.length; i++) {
    const point = canvasPoints[i];

    // Corner circle
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 136, 0, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Corner number
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px "Work Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), point.x, point.y);
  }

  // Show instruction text
  if (canvasWidth !== undefined) {
    const instruction = points.length < 4
      ? `Click corner ${points.length + 1} of 4`
      : 'Validating...';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.font = '12px "Work Sans", sans-serif';
    const textWidth = ctx.measureText(instruction).width;
    const textX = canvasWidth / 2;
    const textY = 60;
    ctx.fillRect(textX - textWidth / 2 - 8, textY - 10, textWidth + 16, 20);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(instruction, textX, textY);
  }
}
