/**
 * Tools State Module
 *
 * Manages the active tool, drawing modes, drag state,
 * and tool-specific draft states.
 */

import type { Tool, DragState, DragContribution, Point } from '../types/index.js';

// =============================================================================
// TYPES
// =============================================================================

/** Drawing mode for building tool */
export type BuildingDrawingMode = 'diagonal' | 'center' | 'polygon';

/** Drawing mode for barrier tool */
export type BarrierDrawingMode = 'end-to-end' | 'center';

/** Draft state for barrier being drawn */
export type BarrierDraft = { p1: Point; p2: Point } | null;

/** Draft state for building being drawn (diagonal mode) */
export type BuildingDraft = { corner1: Point; corner2: Point } | null;

/** Draft state for building being drawn (center mode) */
export type BuildingCenterDraft = { center: Point; corner: Point } | null;

/** Draft state for barrier being drawn (center mode) */
export type BarrierCenterDraft = { center: Point; end: Point } | null;

// =============================================================================
// TOOL STATE
// =============================================================================

/** Currently active tool */
let activeTool: Tool = 'select';

/** Drawing mode for buildings */
let buildingDrawingMode: BuildingDrawingMode = 'diagonal';

/** Drawing mode for barriers */
let barrierDrawingMode: BarrierDrawingMode = 'end-to-end';

// =============================================================================
// DRAG STATE
// =============================================================================

/** Current drag operation */
let dragState: DragState = null;

/** Cached energy contributions for drag preview */
let dragContribution: DragContribution | null = null;

/** Whether a drag operation needs visual update */
let dragDirty = false;

// =============================================================================
// MEASURE TOOL STATE
// =============================================================================

/** Start point for measure tool */
let measureStart: Point | null = null;

/** End point for measure tool */
let measureEnd: Point | null = null;

/** Whether the measurement is locked (click to dismiss) */
let measureLocked = false;

// =============================================================================
// BARRIER DRAFT STATE
// =============================================================================

/** Current barrier draft (end-to-end mode) */
let barrierDraft: BarrierDraft = null;

/** Whether the barrier draft start point is anchored */
let barrierDraftAnchored = false;

/** Whether a barrier drag is currently active */
let barrierDragActive = false;

/** Current barrier draft (center mode) */
let barrierCenterDraft: BarrierCenterDraft = null;

// =============================================================================
// BUILDING DRAFT STATE
// =============================================================================

/** Current building draft (diagonal mode) */
let buildingDraft: BuildingDraft = null;

/** Whether the building draft start corner is anchored */
let buildingDraftAnchored = false;

/** Whether a building drag is currently active */
let buildingDragActive = false;

/** Current building draft (center mode) */
let buildingCenterDraft: BuildingCenterDraft = null;

/** Polygon draft points for polygon mode */
let buildingPolygonDraft: Point[] = [];

/** Preview point for next polygon vertex */
let buildingPolygonPreviewPoint: Point | null = null;

// =============================================================================
// ACTIVE TOOL GETTERS/SETTERS
// =============================================================================

export function getActiveTool(): Tool {
  return activeTool;
}

export function setActiveTool(tool: Tool): void {
  activeTool = tool;
}

export function getBuildingDrawingMode(): BuildingDrawingMode {
  return buildingDrawingMode;
}

export function setBuildingDrawingMode(mode: BuildingDrawingMode): void {
  buildingDrawingMode = mode;
}

export function getBarrierDrawingMode(): BarrierDrawingMode {
  return barrierDrawingMode;
}

export function setBarrierDrawingMode(mode: BarrierDrawingMode): void {
  barrierDrawingMode = mode;
}

// =============================================================================
// DRAG STATE GETTERS/SETTERS
// =============================================================================

export function getDragState(): DragState {
  return dragState;
}

export function setDragState(state: DragState): void {
  dragState = state;
}

export function getDragContribution(): DragContribution | null {
  return dragContribution;
}

export function setDragContribution(contribution: DragContribution | null): void {
  dragContribution = contribution;
}

export function isDragDirty(): boolean {
  return dragDirty;
}

export function setDragDirty(dirty: boolean): void {
  dragDirty = dirty;
}

export function clearDragState(): void {
  dragState = null;
  dragContribution = null;
  dragDirty = false;
}

// =============================================================================
// MEASURE TOOL GETTERS/SETTERS
// =============================================================================

export function getMeasureStart(): Point | null {
  return measureStart;
}

export function setMeasureStart(point: Point | null): void {
  measureStart = point;
}

export function getMeasureEnd(): Point | null {
  return measureEnd;
}

export function setMeasureEnd(point: Point | null): void {
  measureEnd = point;
}

export function isMeasureLocked(): boolean {
  return measureLocked;
}

export function setMeasureLocked(locked: boolean): void {
  measureLocked = locked;
}

export function clearMeasure(): void {
  measureStart = null;
  measureEnd = null;
  measureLocked = false;
}

// =============================================================================
// BARRIER DRAFT GETTERS/SETTERS
// =============================================================================

export function getBarrierDraft(): BarrierDraft {
  return barrierDraft;
}

export function setBarrierDraft(draft: BarrierDraft): void {
  barrierDraft = draft;
}

export function isBarrierDraftAnchored(): boolean {
  return barrierDraftAnchored;
}

export function setBarrierDraftAnchored(anchored: boolean): void {
  barrierDraftAnchored = anchored;
}

export function isBarrierDragActive(): boolean {
  return barrierDragActive;
}

export function setBarrierDragActive(active: boolean): void {
  barrierDragActive = active;
}

export function getBarrierCenterDraft(): BarrierCenterDraft {
  return barrierCenterDraft;
}

export function setBarrierCenterDraft(draft: BarrierCenterDraft): void {
  barrierCenterDraft = draft;
}

export function clearBarrierDraft(): void {
  barrierDraft = null;
  barrierDraftAnchored = false;
  barrierDragActive = false;
  barrierCenterDraft = null;
}

// =============================================================================
// BUILDING DRAFT GETTERS/SETTERS
// =============================================================================

export function getBuildingDraft(): BuildingDraft {
  return buildingDraft;
}

export function setBuildingDraft(draft: BuildingDraft): void {
  buildingDraft = draft;
}

export function isBuildingDraftAnchored(): boolean {
  return buildingDraftAnchored;
}

export function setBuildingDraftAnchored(anchored: boolean): void {
  buildingDraftAnchored = anchored;
}

export function isBuildingDragActive(): boolean {
  return buildingDragActive;
}

export function setBuildingDragActive(active: boolean): void {
  buildingDragActive = active;
}

export function getBuildingCenterDraft(): BuildingCenterDraft {
  return buildingCenterDraft;
}

export function setBuildingCenterDraft(draft: BuildingCenterDraft): void {
  buildingCenterDraft = draft;
}

export function getBuildingPolygonDraft(): Point[] {
  return buildingPolygonDraft;
}

export function setBuildingPolygonDraft(draft: Point[]): void {
  buildingPolygonDraft = draft;
}

export function addBuildingPolygonPoint(point: Point): void {
  buildingPolygonDraft.push(point);
}

export function getBuildingPolygonPreviewPoint(): Point | null {
  return buildingPolygonPreviewPoint;
}

export function setBuildingPolygonPreviewPoint(point: Point | null): void {
  buildingPolygonPreviewPoint = point;
}

export function clearBuildingDraft(): void {
  buildingDraft = null;
  buildingDraftAnchored = false;
  buildingDragActive = false;
  buildingCenterDraft = null;
  buildingPolygonDraft = [];
  buildingPolygonPreviewPoint = null;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/** Clear all draft states (when switching tools) */
export function clearAllDrafts(): void {
  clearMeasure();
  clearBarrierDraft();
  clearBuildingDraft();
}

/** Check if any drawing operation is in progress */
export function isDrawing(): boolean {
  return (
    barrierDraftAnchored ||
    barrierDragActive ||
    buildingDraftAnchored ||
    buildingDragActive ||
    buildingPolygonDraft.length > 0 ||
    (measureStart !== null && !measureLocked)
  );
}

/**
 * Get a display label for a tool
 */
export function toolLabel(tool: Tool): string {
  switch (tool) {
    case 'add-panel':
      return 'Add Measure Grid';
    case 'add-barrier':
      return 'Add Barrier';
    case 'add-building':
      return 'Add Building';
    case 'add-source':
      return 'Add Source';
    case 'add-receiver':
      return 'Add Receiver';
    case 'add-probe':
      return 'Add Probe';
    case 'measure':
      return 'Measure';
    case 'delete':
      return 'Delete';
    default:
      return 'Select';
  }
}
