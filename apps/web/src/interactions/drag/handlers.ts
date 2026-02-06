/**
 * Drag Handlers
 *
 * Pure functions for applying drag operations to scene elements.
 */

import type { Point } from '../../types/ui.js';
import type { DragState, SelectionItem } from '../../types/ui.js';
import type { Source, Receiver, Panel, Probe, Barrier } from '../../entities/index.js';
import type { Building } from '../../entities/building.js';
import { BUILDING_MIN_SIZE, type DragApplyConfig, type DragApplyResult, type SceneData } from './types.js';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Set a barrier's position from its midpoint and rotation.
 */
export function setBarrierFromMidpointAndRotation(
  barrier: { p1: Point; p2: Point },
  midpoint: Point,
  rotation: number,
  length: number
): void {
  const halfLen = length / 2;
  const dx = Math.cos(rotation) * halfLen;
  const dy = Math.sin(rotation) * halfLen;
  barrier.p1 = { x: midpoint.x - dx, y: midpoint.y - dy };
  barrier.p2 = { x: midpoint.x + dx, y: midpoint.y + dy };
}

// =============================================================================
// INDIVIDUAL DRAG HANDLERS
// =============================================================================

/** Apply drag to a source */
function applySourceDrag(
  scene: SceneData,
  id: string,
  targetPoint: Point,
  onDisableRayVis?: () => void
): void {
  const source = scene.sources.find((s: Source) => s.id === id);
  if (source) {
    source.x = targetPoint.x;
    source.y = targetPoint.y;
    onDisableRayVis?.();
  }
}

/** Apply drag to a receiver */
function applyReceiverDrag(scene: SceneData, id: string, targetPoint: Point): void {
  const receiver = scene.receivers.find((r: Receiver) => r.id === id);
  if (receiver) {
    receiver.x = targetPoint.x;
    receiver.y = targetPoint.y;
  }
}

/** Apply drag to a probe */
function applyProbeDrag(
  scene: SceneData,
  id: string,
  targetPoint: Point,
  onDisableRayVis?: () => void,
  onProbeUpdate?: (probeId: string) => void
): void {
  const probe = scene.probes.find((p: Probe) => p.id === id);
  if (probe) {
    probe.x = targetPoint.x;
    probe.y = targetPoint.y;
    onDisableRayVis?.();
    onProbeUpdate?.(id);
  }
}

/** Apply drag to a panel (move all vertices) */
function applyPanelDrag(scene: SceneData, id: string, targetPoint: Point): void {
  const panel = scene.panels.find((p: Panel) => p.id === id);
  if (panel && panel.points[0]) {
    const dx = targetPoint.x - panel.points[0].x;
    const dy = targetPoint.y - panel.points[0].y;
    panel.points = panel.points.map((pt: Point) => ({ x: pt.x + dx, y: pt.y + dy }));
  }
}

/** Apply drag to a barrier (move entire barrier) */
function applyBarrierDrag(
  scene: SceneData,
  id: string,
  targetPoint: Point,
  onDisableRayVis?: () => void
): void {
  const barrier = scene.barriers.find((b: Barrier) => b.id === id);
  if (barrier) {
    const dx = targetPoint.x - barrier.p1.x;
    const dy = targetPoint.y - barrier.p1.y;
    barrier.p1 = { x: barrier.p1.x + dx, y: barrier.p1.y + dy };
    barrier.p2 = { x: barrier.p2.x + dx, y: barrier.p2.y + dy };
    onDisableRayVis?.();
  }
}

/** Apply drag to a building (translate) */
function applyBuildingDrag(
  scene: SceneData,
  id: string,
  targetPoint: Point,
  onDisableRayVis?: () => void
): void {
  const building = scene.buildings.find((b: Building) => b.id === id);
  if (building) {
    const dx = targetPoint.x - building.x;
    const dy = targetPoint.y - building.y;
    building.translate(dx, dy);
    onDisableRayVis?.();
  }
}

/** Apply building resize drag */
function applyBuildingResizeDrag(scene: SceneData, id: string, worldPoint: Point): void {
  const building = scene.buildings.find((b: Building) => b.id === id);
  if (building) {
    const dx = worldPoint.x - building.x;
    const dy = worldPoint.y - building.y;
    const cos = Math.cos(building.rotation);
    const sin = Math.sin(building.rotation);
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;
    building.width = Math.max(BUILDING_MIN_SIZE, Math.abs(localX) * 2);
    building.height = Math.max(BUILDING_MIN_SIZE, Math.abs(localY) * 2);
  }
}

/** Apply building rotation drag */
function applyBuildingRotateDrag(
  scene: SceneData,
  id: string,
  worldPoint: Point,
  startAngle: number,
  startRotation: number
): void {
  const building = scene.buildings.find((b: Building) => b.id === id);
  if (building) {
    const angle = Math.atan2(worldPoint.y - building.y, worldPoint.x - building.x);
    building.rotation = startRotation + (angle - startAngle);
  }
}

/** Apply barrier endpoint drag */
function applyBarrierEndpointDrag(
  scene: SceneData,
  id: string,
  worldPoint: Point,
  endpoint: 'p1' | 'p2'
): void {
  const barrier = scene.barriers.find((b: Barrier) => b.id === id);
  if (barrier) {
    if (endpoint === 'p1') {
      barrier.p1 = { x: worldPoint.x, y: worldPoint.y };
    } else {
      barrier.p2 = { x: worldPoint.x, y: worldPoint.y };
    }
  }
}

/** Apply barrier rotation drag */
function applyBarrierRotateDrag(
  scene: SceneData,
  id: string,
  worldPoint: Point,
  startMidpoint: Point,
  startLength: number
): void {
  const barrier = scene.barriers.find((b: Barrier) => b.id === id);
  if (barrier) {
    const angle = Math.atan2(
      worldPoint.y - startMidpoint.y,
      worldPoint.x - startMidpoint.x
    );
    // Rotation handle is perpendicular (90 deg offset)
    const newRotation = angle - Math.PI / 2;
    setBarrierFromMidpointAndRotation(barrier, startMidpoint, newRotation, startLength);
  }
}

/** Apply panel vertex drag */
function applyPanelVertexDrag(
  scene: SceneData,
  id: string,
  index: number,
  targetPoint: Point
): void {
  const panel = scene.panels.find((p: Panel) => p.id === id);
  if (panel && panel.points[index]) {
    panel.points[index] = { x: targetPoint.x, y: targetPoint.y };
  }
}

/** Apply multi-element move drag */
function applyMoveMultiDrag(
  scene: SceneData,
  items: SelectionItem[],
  worldPoint: Point,
  offsets: Map<string, Point>,
  onProbeUpdate?: (probeId: string) => void
): void {
  for (const item of items) {
    const offset = offsets.get(item.id);
    if (!offset) continue;
    const itemTarget = { x: worldPoint.x - offset.x, y: worldPoint.y - offset.y };

    if (item.elementType === 'source') {
      const source = scene.sources.find((s: Source) => s.id === item.id);
      if (source) {
        source.x = itemTarget.x;
        source.y = itemTarget.y;
      }
    } else if (item.elementType === 'receiver') {
      const receiver = scene.receivers.find((r: Receiver) => r.id === item.id);
      if (receiver) {
        receiver.x = itemTarget.x;
        receiver.y = itemTarget.y;
      }
    } else if (item.elementType === 'probe') {
      const probe = scene.probes.find((p: Probe) => p.id === item.id);
      if (probe) {
        probe.x = itemTarget.x;
        probe.y = itemTarget.y;
        onProbeUpdate?.(item.id);
      }
    } else if (item.elementType === 'panel') {
      const panel = scene.panels.find((p: Panel) => p.id === item.id);
      if (panel && panel.points[0]) {
        const dx = itemTarget.x - panel.points[0].x;
        const dy = itemTarget.y - panel.points[0].y;
        panel.points = panel.points.map((pt: Point) => ({ x: pt.x + dx, y: pt.y + dy }));
      }
    } else if (item.elementType === 'barrier') {
      const barrier = scene.barriers.find((b: Barrier) => b.id === item.id);
      if (barrier) {
        const dx = itemTarget.x - barrier.p1.x;
        const dy = itemTarget.y - barrier.p1.y;
        barrier.p1 = { x: barrier.p1.x + dx, y: barrier.p1.y + dy };
        barrier.p2 = { x: barrier.p2.x + dx, y: barrier.p2.y + dy };
      }
    } else if (item.elementType === 'building') {
      const building = scene.buildings.find((b: Building) => b.id === item.id);
      if (building) {
        building.x = itemTarget.x;
        building.y = itemTarget.y;
      }
    }
  }
}

// =============================================================================
// MAIN DRAG APPLY FUNCTION
// =============================================================================

/**
 * Apply a drag operation to the scene.
 *
 * @param config - Configuration for the drag operation
 * @param selectionItems - Items in current multi-selection (for move-multi)
 * @returns Result indicating what was affected
 */
export function applyDrag(
  config: DragApplyConfig,
  selectionItems: SelectionItem[] = []
): DragApplyResult {
  const { scene, dragState, worldPoint, onDisableRayVis, onProbeUpdate } = config;

  if (!dragState) {
    return { affectsGeometry: false };
  }

  const result: DragApplyResult = { affectsGeometry: false };

  // Calculate target point with offset if applicable
  const targetPoint =
    'offset' in dragState
      ? { x: worldPoint.x - dragState.offset.x, y: worldPoint.y - dragState.offset.y }
      : worldPoint;

  switch (dragState.type) {
    case 'source':
      applySourceDrag(scene, dragState.id, targetPoint, onDisableRayVis);
      result.affectsGeometry = true;
      result.sourceId = dragState.id;
      break;

    case 'receiver':
      applyReceiverDrag(scene, dragState.id, targetPoint);
      break;

    case 'probe':
      applyProbeDrag(scene, dragState.id, targetPoint, onDisableRayVis, onProbeUpdate);
      break;

    case 'panel':
      applyPanelDrag(scene, dragState.id, targetPoint);
      break;

    case 'barrier':
      applyBarrierDrag(scene, dragState.id, targetPoint, onDisableRayVis);
      result.affectsGeometry = true;
      break;

    case 'building':
      applyBuildingDrag(scene, dragState.id, targetPoint, onDisableRayVis);
      result.affectsGeometry = true;
      break;

    case 'building-resize':
      applyBuildingResizeDrag(scene, dragState.id, worldPoint);
      result.affectsGeometry = true;
      break;

    case 'building-rotate':
      applyBuildingRotateDrag(
        scene,
        dragState.id,
        worldPoint,
        dragState.startAngle,
        dragState.startRotation
      );
      result.affectsGeometry = true;
      break;

    case 'barrier-endpoint':
      applyBarrierEndpointDrag(scene, dragState.id, worldPoint, dragState.endpoint);
      result.affectsGeometry = true;
      break;

    case 'barrier-rotate':
      applyBarrierRotateDrag(
        scene,
        dragState.id,
        worldPoint,
        dragState.startMidpoint,
        dragState.startLength
      );
      result.affectsGeometry = true;
      break;

    case 'panel-vertex':
      applyPanelVertexDrag(scene, dragState.id, dragState.index, targetPoint);
      break;

    case 'move-multi':
      applyMoveMultiDrag(scene, selectionItems, worldPoint, dragState.offsets, onProbeUpdate);
      result.affectsGeometry = true;
      break;

    case 'select-box':
      // Select box is handled elsewhere (updates currentCanvasPoint)
      break;
  }

  return result;
}

/**
 * Check if a drag type should trigger live noise map updates.
 */
export function shouldLiveUpdateMap(dragState: DragState): boolean {
  if (!dragState) return false;
  const geometryDragTypes = [
    'source',
    'barrier',
    'barrier-endpoint',
    'barrier-rotate',
    'building',
    'building-resize',
    'building-rotate',
    'move-multi',
  ];
  return geometryDragTypes.includes(dragState.type);
}
