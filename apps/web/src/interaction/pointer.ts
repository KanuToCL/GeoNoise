/**
 * Pointer Handlers Module
 *
 * Handles mouse/pointer events for canvas interaction including:
 * - Panning the canvas
 * - Dragging elements (sources, receivers, probes, panels, barriers, buildings)
 * - Drawing tools (barriers, buildings, measurement)
 * - Selection and hit testing
 * - Resize handles
 *
 * Uses dependency injection for all state and callbacks to avoid tight coupling.
 */

import type {
  Point,
  Selection,
  DragState,
  SelectableElementType,
  SelectionItem,
} from '../types/index.js';
import type { Barrier } from '../entities/index.js';

// =============================================================================
// LOCAL TYPES
// =============================================================================

export type BarrierDrawingMode = 'end-to-end' | 'center';
export type BuildingDrawingMode = 'diagonal' | 'center' | 'polygon';

export interface PanState {
  start: Point;
  origin: Point;
}

export interface BarrierDraft {
  p1: Point;
  p2: Point;
}

export interface BarrierCenterDraft {
  center: Point;
  end: Point;
}

export interface BuildingDraft {
  corner1: Point;
  corner2: Point;
}

export interface BuildingCenterDraft {
  center: Point;
  corner: Point;
}

/**
 * Context providing access to scene state and transforms (getters/setters)
 */
export interface PointerContext {
  canvas: HTMLCanvasElement;
  canvasToWorld: (point: Point) => Point;
  worldToCanvas: (point: Point) => Point;
  snapPoint: (point: Point) => { point: Point; snapped: boolean };

  // State getters
  getPixelsPerMeter: () => number;
  getPanOffset: () => Point;
  getActiveTool: () => string;
  getDragState: () => DragState;
  getPanState: () => PanState | null;
  getSelection: () => Selection;
  getHoverSelection: () => Selection | null;

  // Barrier draft state
  getBarrierDrawingMode: () => BarrierDrawingMode;
  getBarrierDraft: () => BarrierDraft | null;
  getBarrierCenterDraft: () => BarrierCenterDraft | null;
  getBarrierDraftAnchored: () => boolean;
  getBarrierDragActive: () => boolean;

  // Building draft state
  getBuildingDrawingMode: () => BuildingDrawingMode;
  getBuildingDraft: () => BuildingDraft | null;
  getBuildingCenterDraft: () => BuildingCenterDraft | null;
  getBuildingDraftAnchored: () => boolean;
  getBuildingDragActive: () => boolean;
  getBuildingPolygonDraft: () => Point[];

  // Measure tool state
  getMeasureStart: () => Point | null;
  getMeasureEnd: () => Point | null;
  getMeasureLocked: () => boolean;

  // State setters
  setPanOffset: (offset: Point) => void;
  setDragState: (state: DragState) => void;
  setPanState: (state: PanState | null) => void;
  setSelection: (selection: Selection) => void;
  setHoverSelection: (selection: Selection | null) => void;

  // Barrier draft setters
  setBarrierDraft: (draft: BarrierDraft | null) => void;
  setBarrierCenterDraft: (draft: BarrierCenterDraft | null) => void;
  setBarrierDraftAnchored: (anchored: boolean) => void;
  setBarrierDragActive: (active: boolean) => void;

  // Building draft setters
  setBuildingDraft: (draft: BuildingDraft | null) => void;
  setBuildingCenterDraft: (draft: BuildingCenterDraft | null) => void;
  setBuildingDraftAnchored: (anchored: boolean) => void;
  setBuildingDragActive: (active: boolean) => void;
  setBuildingPolygonPreviewPoint: (point: Point | null) => void;
  pushBuildingPolygonDraft: (point: Point) => void;
  popBuildingPolygonDraft: () => void;

  // Measure setters
  setMeasureStart: (point: Point | null) => void;
  setMeasureEnd: (point: Point | null) => void;
  setMeasureLocked: (locked: boolean) => void;

  // Drag dirty flag
  setDragDirty: (dirty: boolean) => void;
}

/**
 * Callbacks for actions triggered by pointer events
 */
export interface PointerCallbacks {
  requestRender: () => void;

  // Element operations
  applyDrag: (worldPoint: Point) => void;
  throttledDragMove: (worldPoint: Point) => void;
  hitTest: (canvasPoint: Point) => Selection | null;
  hitTestPanelHandle: (canvasPoint: Point) => { panelId: string; index: number } | null;
  hitTestBarrierHandle: (canvasPoint: Point) => { type: 'p1' | 'p2' | 'rotate' } | null;
  hitTestBuildingHandle: (canvasPoint: Point) => { type: 'corner' | 'rotate'; index?: number } | null;
  sameSelection: (a: Selection | null, b: Selection | null) => boolean;

  // Multi-selection
  selectionToItems: (sel: Selection) => SelectionItem[];
  itemsToSelection: (items: SelectionItem[]) => Selection;
  isElementSelected: (sel: Selection, elementType: string, id: string) => boolean;
  getElementsInSelectBox: (start: Point, end: Point) => SelectionItem[];

  // Adding elements
  addSourceAt: (point: Point) => void;
  addReceiverAt: (point: Point) => void;
  addProbeAt: (point: Point) => void;
  addPanelAt: (point: Point) => void;

  // Draft commits
  commitBarrierDraft: () => void;
  commitBarrierCenterDraft: () => void;
  commitBuildingDraft: () => void;
  commitBuildingCenterDraft: () => void;
  commitBuildingPolygonDraft: () => void;
  isValidQuadrilateral: (p0: Point, p1: Point, p2: Point, p3: Point) => boolean;

  // Barrier/building info
  getBarrierById: (id: string) => Barrier | null;
  getBuildingById: (id: string) => { id: string; x: number; y: number; rotation: number } | null;
  getBarrierMidpoint: (barrier: Barrier) => Point;
  getBarrierRotation: (barrier: Barrier) => number;
  getBarrierLength: (barrier: Barrier) => number;

  // Source/receiver/probe/panel lookup
  getSourceById: (id: string) => { id: string; x: number; y: number } | null;
  getReceiverById: (id: string) => { id: string; x: number; y: number } | null;
  getProbeById: (id: string) => { id: string; x: number; y: number } | null;
  getPanelById: (id: string) => { id: string; points: Point[] } | null;

  // Interaction state
  startInteractionForDrag: (drag: DragState) => void;
  setInteractionActive: (active: boolean) => void;
  primeDragContribution: (sourceId: string) => void;

  // Map sync
  isMapVisible: () => boolean;
  isMapInteractive: () => boolean;
  syncMapToCanvasPan: (deltaX: number, deltaY: number, pixelsPerMeter: number) => void;

  // UI updates
  updateSnapIndicator: (snapped: boolean, screenPoint: Point) => void;
  updateDebugCoords: (worldPoint: Point) => void;

  // Delete
  deleteSelection: (sel: Selection) => void;
}

// =============================================================================
// POINTER MOVE HANDLER
// =============================================================================

export function handlePointerMove(
  event: MouseEvent,
  ctx: PointerContext,
  callbacks: PointerCallbacks
): void {
  const rect = ctx.canvas.getBoundingClientRect();
  const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const worldPoint = ctx.canvasToWorld(canvasPoint);

  const panState = ctx.getPanState();
  if (panState) {
    const pixelsPerMeter = ctx.getPixelsPerMeter();
    const panOffset = ctx.getPanOffset();
    const dx = canvasPoint.x - panState.start.x;
    const dy = canvasPoint.y - panState.start.y;
    const newPanOffset = {
      x: panState.origin.x + dx / pixelsPerMeter,
      y: panState.origin.y - dy / pixelsPerMeter,
    };

    const deltaX = newPanOffset.x - panOffset.x;
    const deltaY = newPanOffset.y - panOffset.y;

    ctx.setPanOffset(newPanOffset);

    if (callbacks.isMapVisible() && !callbacks.isMapInteractive()) {
      callbacks.syncMapToCanvasPan(deltaX, deltaY, pixelsPerMeter);
    }

    callbacks.requestRender();
  }

  const { point: snappedPoint, snapped } = ctx.snapPoint(worldPoint);
  const screenPoint = ctx.worldToCanvas(snappedPoint);
  callbacks.updateSnapIndicator(snapped, screenPoint);
  callbacks.updateDebugCoords(worldPoint);

  if (panState) return;

  const activeTool = ctx.getActiveTool();
  const dragState = ctx.getDragState();

  // Handle barrier drawing
  if (activeTool === 'add-barrier' && ctx.getBarrierDragActive()) {
    const mode = ctx.getBarrierDrawingMode();
    if (mode === 'center') {
      const draft = ctx.getBarrierCenterDraft();
      if (draft) {
        ctx.setBarrierCenterDraft({ ...draft, end: snappedPoint });
        callbacks.requestRender();
        return;
      }
    } else {
      const draft = ctx.getBarrierDraft();
      if (draft) {
        ctx.setBarrierDraft({ ...draft, p2: snappedPoint });
        callbacks.requestRender();
        return;
      }
    }
  }

  // Handle building drawing
  if (activeTool === 'add-building') {
    const mode = ctx.getBuildingDrawingMode();
    const polygonDraft = ctx.getBuildingPolygonDraft();

    if (mode === 'polygon' && polygonDraft.length > 0 && polygonDraft.length < 4) {
      ctx.setBuildingPolygonPreviewPoint(snappedPoint);
      callbacks.requestRender();
      return;
    } else if (ctx.getBuildingDragActive()) {
      if (mode === 'center') {
        const draft = ctx.getBuildingCenterDraft();
        if (draft) {
          ctx.setBuildingCenterDraft({ ...draft, corner: snappedPoint });
          callbacks.requestRender();
          return;
        }
      } else {
        const draft = ctx.getBuildingDraft();
        if (draft) {
          ctx.setBuildingDraft({ ...draft, corner2: snappedPoint });
          callbacks.requestRender();
          return;
        }
      }
    }
  }

  // Update hover state
  if (!dragState && (activeTool === 'select' || activeTool === 'delete')) {
    const nextHover = callbacks.hitTest(canvasPoint);
    if (!callbacks.sameSelection(ctx.getHoverSelection(), nextHover)) {
      ctx.setHoverSelection(nextHover);
      callbacks.requestRender();
    }
  } else if (!dragState && ctx.getHoverSelection()) {
    ctx.setHoverSelection(null);
    callbacks.requestRender();
  }

  // Handle active drag
  if (dragState) {
    if (dragState.type === 'select-box') {
      ctx.setDragState({ ...dragState, currentCanvasPoint: canvasPoint });
      callbacks.requestRender();
    } else {
      callbacks.throttledDragMove(worldPoint);
    }
  }

  // Measure tool
  if (activeTool === 'measure' && ctx.getMeasureStart() && !ctx.getMeasureLocked()) {
    ctx.setMeasureEnd(worldPoint);
    callbacks.requestRender();
  }
}

// =============================================================================
// POINTER DOWN HANDLER
// =============================================================================

export function handlePointerDown(
  event: MouseEvent,
  ctx: PointerContext,
  callbacks: PointerCallbacks
): void {
  const rect = ctx.canvas.getBoundingClientRect();
  const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const worldPoint = ctx.canvasToWorld(canvasPoint);
  const { point: snappedPoint } = ctx.snapPoint(worldPoint);
  ctx.setHoverSelection(null);

  const activeTool = ctx.getActiveTool();

  // Tool-specific add actions
  if (activeTool === 'add-source') {
    callbacks.addSourceAt(snappedPoint);
    return;
  }

  if (activeTool === 'add-receiver') {
    callbacks.addReceiverAt(snappedPoint);
    return;
  }

  if (activeTool === 'add-probe') {
    callbacks.addProbeAt(snappedPoint);
    return;
  }

  if (activeTool === 'add-panel') {
    callbacks.addPanelAt(snappedPoint);
    return;
  }

  // Barrier tool
  if (activeTool === 'add-barrier') {
    const mode = ctx.getBarrierDrawingMode();
    if (mode === 'center') {
      const draft = ctx.getBarrierCenterDraft();
      if (!draft) {
        ctx.setBarrierCenterDraft({ center: snappedPoint, end: snappedPoint });
      } else {
        ctx.setBarrierCenterDraft({ ...draft, end: snappedPoint });
      }
    } else {
      const draft = ctx.getBarrierDraft();
      if (!draft) {
        ctx.setBarrierDraft({ p1: snappedPoint, p2: snappedPoint });
        ctx.setBarrierDraftAnchored(false);
      } else {
        ctx.setBarrierDraft({ ...draft, p2: snappedPoint });
      }
    }
    ctx.setBarrierDragActive(true);
    callbacks.requestRender();
    return;
  }

  // Building tool
  if (activeTool === 'add-building') {
    const mode = ctx.getBuildingDrawingMode();
    if (mode === 'polygon') {
      const polygonDraft = ctx.getBuildingPolygonDraft();
      ctx.pushBuildingPolygonDraft(snappedPoint);
      ctx.setBuildingPolygonPreviewPoint(null);

      if (polygonDraft.length + 1 === 4) {
        const [p0, p1, p2] = polygonDraft;
        const p3 = snappedPoint;
        if (callbacks.isValidQuadrilateral(p0, p1, p2, p3)) {
          callbacks.commitBuildingPolygonDraft();
        } else {
          console.warn('Invalid quadrilateral: edges cross each other');
          ctx.popBuildingPolygonDraft();
        }
      }
      callbacks.requestRender();
      return;
    } else if (mode === 'center') {
      const draft = ctx.getBuildingCenterDraft();
      if (!draft) {
        ctx.setBuildingCenterDraft({ center: snappedPoint, corner: snappedPoint });
      } else {
        ctx.setBuildingCenterDraft({ ...draft, corner: snappedPoint });
      }
      ctx.setBuildingDragActive(true);
    } else {
      const draft = ctx.getBuildingDraft();
      if (!draft) {
        ctx.setBuildingDraft({ corner1: snappedPoint, corner2: snappedPoint });
        ctx.setBuildingDraftAnchored(false);
      } else {
        ctx.setBuildingDraft({ ...draft, corner2: snappedPoint });
      }
      ctx.setBuildingDragActive(true);
    }
    callbacks.requestRender();
    return;
  }

  // Measure tool
  if (activeTool === 'measure') {
    const measureStart = ctx.getMeasureStart();
    const measureLocked = ctx.getMeasureLocked();
    if (!measureStart || measureLocked) {
      ctx.setMeasureStart(worldPoint);
      ctx.setMeasureEnd(worldPoint);
      ctx.setMeasureLocked(false);
    } else {
      ctx.setMeasureEnd(worldPoint);
      ctx.setMeasureLocked(true);
    }
    callbacks.requestRender();
    return;
  }

  // Select tool - handle resize/rotate handles
  if (activeTool === 'select') {
    const barrierHandle = callbacks.hitTestBarrierHandle(canvasPoint);
    if (barrierHandle) {
      const current = ctx.getSelection();
      if (current.type === 'barrier') {
        const barrier = callbacks.getBarrierById(current.id);
        if (barrier) {
          ctx.setDragDirty(false);
          if (barrierHandle.type === 'rotate') {
            const midpoint = callbacks.getBarrierMidpoint(barrier);
            const startAngle = Math.atan2(worldPoint.y - midpoint.y, worldPoint.x - midpoint.x);
            ctx.setDragState({
              type: 'barrier-rotate',
              id: barrier.id,
              startAngle,
              startRotation: callbacks.getBarrierRotation(barrier),
              startLength: callbacks.getBarrierLength(barrier),
              startMidpoint: midpoint,
            });
          } else {
            ctx.setDragState({
              type: 'barrier-endpoint',
              id: barrier.id,
              endpoint: barrierHandle.type,
            });
          }
          callbacks.startInteractionForDrag(ctx.getDragState());
          return;
        }
      }
    }

    const buildingHandle = callbacks.hitTestBuildingHandle(canvasPoint);
    if (buildingHandle) {
      const current = ctx.getSelection();
      if (current.type === 'building') {
        const building = callbacks.getBuildingById(current.id);
        if (building) {
          ctx.setDragDirty(false);
          if (buildingHandle.type === 'rotate') {
            const startAngle = Math.atan2(worldPoint.y - building.y, worldPoint.x - building.x);
            ctx.setDragState({
              type: 'building-rotate',
              id: building.id,
              startAngle,
              startRotation: building.rotation,
            });
          } else {
            ctx.setDragState({ type: 'building-resize', id: building.id });
          }
          callbacks.startInteractionForDrag(ctx.getDragState());
          return;
        }
      }
    }

    const handleHit = callbacks.hitTestPanelHandle(canvasPoint);
    if (handleHit) {
      ctx.setSelection({ type: 'panel', id: handleHit.panelId });
      const panel = callbacks.getPanelById(handleHit.panelId);
      if (panel) {
        const vertex = panel.points[handleHit.index];
        ctx.setDragState({
          type: 'panel-vertex',
          id: panel.id,
          index: handleHit.index,
          offset: { x: worldPoint.x - vertex.x, y: worldPoint.y - vertex.y },
        });
        callbacks.startInteractionForDrag(ctx.getDragState());
      }
      return;
    }
  }

  // Hit test for element selection
  const hit = callbacks.hitTest(canvasPoint);

  if (activeTool === 'delete') {
    if (hit) callbacks.deleteSelection(hit);
    return;
  }

  if (hit && hit.type !== 'none') {
    const worldHit = ctx.canvasToWorld(canvasPoint);
    const selection = ctx.getSelection();

    // Shift+click adds/removes from multi-selection
    if (event.shiftKey && activeTool === 'select') {
      const currentItems = callbacks.selectionToItems(selection);
      const hitType = hit.type as SelectableElementType;
      const hitId = 'id' in hit ? hit.id : '';
      const existingIndex = currentItems.findIndex(
        (item) => item.elementType === hitType && item.id === hitId
      );

      if (existingIndex >= 0) {
        currentItems.splice(existingIndex, 1);
      } else {
        currentItems.push({ elementType: hitType, id: hitId });
      }

      ctx.setSelection(callbacks.itemsToSelection(currentItems));
      callbacks.requestRender();
      return;
    }

    // Multi-move if clicking element in multi-selection
    const hitId = 'id' in hit ? hit.id : '';
    const isInMultiSelection =
      selection.type === 'multi' && callbacks.isElementSelected(selection, hit.type, hitId);
    if (selection.type === 'multi' && isInMultiSelection) {
      const offsets = new Map<string, Point>();
      for (const item of selection.items) {
        let pos: Point | null = null;
        if (item.elementType === 'source') {
          const s = callbacks.getSourceById(item.id);
          if (s) pos = { x: s.x, y: s.y };
        } else if (item.elementType === 'receiver') {
          const r = callbacks.getReceiverById(item.id);
          if (r) pos = { x: r.x, y: r.y };
        } else if (item.elementType === 'probe') {
          const p = callbacks.getProbeById(item.id);
          if (p) pos = { x: p.x, y: p.y };
        } else if (item.elementType === 'panel') {
          const pan = callbacks.getPanelById(item.id);
          if (pan && pan.points[0]) pos = pan.points[0];
        } else if (item.elementType === 'barrier') {
          const b = callbacks.getBarrierById(item.id);
          if (b) pos = b.p1;
        } else if (item.elementType === 'building') {
          const bld = callbacks.getBuildingById(item.id);
          if (bld) pos = { x: bld.x, y: bld.y };
        }
        if (pos) offsets.set(item.id, { x: worldHit.x - pos.x, y: worldHit.y - pos.y });
      }
      ctx.setDragState({ type: 'move-multi', offsets });
      ctx.setDragDirty(false);
      callbacks.startInteractionForDrag(ctx.getDragState());
      return;
    }

    // Single element selection + drag
    ctx.setSelection(hit);
    ctx.setDragDirty(false);

    if (hit.type === 'source') {
      const source = callbacks.getSourceById(hit.id);
      if (source) {
        ctx.setDragState({
          type: 'source',
          id: source.id,
          offset: { x: worldHit.x - source.x, y: worldHit.y - source.y },
        });
        callbacks.primeDragContribution(source.id);
      }
    }
    if (hit.type === 'probe') {
      const probe = callbacks.getProbeById(hit.id);
      if (probe) {
        ctx.setDragState({
          type: 'probe',
          id: probe.id,
          offset: { x: worldHit.x - probe.x, y: worldHit.y - probe.y },
        });
      }
    }
    if (hit.type === 'receiver') {
      const receiver = callbacks.getReceiverById(hit.id);
      if (receiver) {
        ctx.setDragState({
          type: 'receiver',
          id: receiver.id,
          offset: { x: worldHit.x - receiver.x, y: worldHit.y - receiver.y },
        });
      }
    }
    if (hit.type === 'panel') {
      const panel = callbacks.getPanelById(hit.id);
      if (panel) {
        const first = panel.points[0];
        ctx.setDragState({
          type: 'panel',
          id: panel.id,
          offset: { x: worldHit.x - first.x, y: worldHit.y - first.y },
        });
      }
    }
    if (hit.type === 'barrier') {
      const barrier = callbacks.getBarrierById(hit.id);
      if (barrier) {
        ctx.setDragState({
          type: 'barrier',
          id: barrier.id,
          offset: { x: worldHit.x - barrier.p1.x, y: worldHit.y - barrier.p1.y },
        });
      }
    }
    if (hit.type === 'building') {
      const building = callbacks.getBuildingById(hit.id);
      if (building) {
        ctx.setDragState({
          type: 'building',
          id: building.id,
          offset: { x: worldHit.x - building.x, y: worldHit.y - building.y },
        });
      }
    }
  } else {
    // No hit - start pan or select-box
    if (activeTool === 'select') {
      if (event.ctrlKey || event.metaKey) {
        ctx.setDragState({
          type: 'select-box',
          startCanvasPoint: canvasPoint,
          currentCanvasPoint: canvasPoint,
        });
        callbacks.requestRender();
      } else {
        ctx.setSelection({ type: 'none' });
        ctx.setPanState({ start: canvasPoint, origin: ctx.getPanOffset() });
      }
    } else {
      ctx.setSelection({ type: 'none' });
    }
  }

  const dragState = ctx.getDragState();
  if (dragState) {
    callbacks.startInteractionForDrag(dragState);
  }
}

// =============================================================================
// POINTER LEAVE HANDLER
// =============================================================================

export function handlePointerLeave(
  ctx: PointerContext,
  callbacks: PointerCallbacks
): void {
  if (ctx.getHoverSelection()) {
    ctx.setHoverSelection(null);
    callbacks.requestRender();
  }
  callbacks.updateSnapIndicator(false, { x: 0, y: 0 });
}
