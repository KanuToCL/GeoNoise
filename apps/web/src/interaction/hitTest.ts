/**
 * Hit Testing Module
 *
 * Functions for detecting what the user clicked on.
 * All hit tests work in canvas (screen) coordinates.
 */

import type { Point, Selection, SelectionItem, SelectableElementType } from '../types/index.js';
import {
  BARRIER_HANDLE_HIT_RADIUS,
  BARRIER_ROTATION_HANDLE_OFFSET_PX,
  BUILDING_HANDLE_HIT_RADIUS,
  BUILDING_ROTATION_HANDLE_OFFSET_PX,
} from '../entities/index.js';
import { getBarrierRotationHandlePosition } from '../entities/index.js';
import { distance, distanceToSegment, pointInPolygon } from '../utils/index.js';
import { scene } from '../state/scene.js';
import { getSelection } from '../state/selection.js';
import { worldToCanvas, canvasToWorld, getPixelsPerMeter } from '../state/viewport.js';

// =============================================================================
// ENTITY HIT TESTING
// =============================================================================

/** Hit threshold in pixels for point entities */
const POINT_HIT_THRESHOLD = 12;

/** Hit threshold in pixels for line entities */
const LINE_HIT_THRESHOLD = 10;

/** Hit threshold in pixels for handles */
const HANDLE_HIT_THRESHOLD = 10;

/**
 * Main hit test - checks if a canvas point hits any entity.
 * Returns the hit entity type and ID, or null if nothing hit.
 *
 * Priority order: sources, probes, receivers, barriers, buildings, panels
 */
export function hitTest(point: Point): Selection | null {
  // Sources (highest priority - small targets)
  const hitSource = scene.sources.find((source) => {
    const screen = worldToCanvas(source);
    return distance(screen, point) <= POINT_HIT_THRESHOLD;
  });
  if (hitSource) return { type: 'source', id: hitSource.id };

  // Probes
  const hitProbe = scene.probes.find((probe) => {
    const screen = worldToCanvas(probe);
    return distance(screen, point) <= POINT_HIT_THRESHOLD;
  });
  if (hitProbe) return { type: 'probe', id: hitProbe.id };

  // Receivers
  const hitReceiver = scene.receivers.find((receiver) => {
    const screen = worldToCanvas(receiver);
    return distance(screen, point) <= POINT_HIT_THRESHOLD;
  });
  if (hitReceiver) return { type: 'receiver', id: hitReceiver.id };

  // Barriers (line entities - use point-to-segment distance)
  const hitBarrier = scene.barriers.find((barrier) => {
    const p1 = worldToCanvas(barrier.p1);
    const p2 = worldToCanvas(barrier.p2);
    return distanceToSegment(point, p1, p2) <= LINE_HIT_THRESHOLD;
  });
  if (hitBarrier) return { type: 'barrier', id: hitBarrier.id };

  // Buildings (polygon entities)
  const world = canvasToWorld(point);
  const hitBuilding = scene.buildings.find((building) =>
    pointInPolygon(world, building.getVertices())
  );
  if (hitBuilding) return { type: 'building', id: hitBuilding.id };

  // Panels (polygon entities - lowest priority)
  const hitPanel = scene.panels.find((panel) => pointInPolygon(world, panel.points));
  if (hitPanel) return { type: 'panel', id: hitPanel.id };

  return null;
}

// =============================================================================
// HANDLE HIT TESTING
// =============================================================================

export type PanelHandleHit = { panelId: string; index: number };
export type BarrierHandleHit = { type: 'p1' | 'p2' | 'rotate' };
export type BuildingHandleHit = { type: 'corner'; index: number } | { type: 'rotate' };

/**
 * Test if a point hits a panel vertex handle.
 * Only tests handles for the currently selected panel.
 */
export function hitTestPanelHandle(point: Point): PanelHandleHit | null {
  const current = getSelection();
  if (current.type !== 'panel') return null;

  const panel = scene.panels.find((item) => item.id === current.id);
  if (!panel) return null;

  for (let i = 0; i < panel.points.length; i++) {
    const screen = worldToCanvas(panel.points[i]);
    if (distance(screen, point) <= HANDLE_HIT_THRESHOLD) {
      return { panelId: panel.id, index: i };
    }
  }

  return null;
}

/**
 * Test if a point hits a barrier handle (endpoints or rotation).
 * Only tests handles for the currently selected barrier.
 */
export function hitTestBarrierHandle(point: Point): BarrierHandleHit | null {
  const current = getSelection();
  if (current.type !== 'barrier') return null;

  const barrier = scene.barriers.find((item) => item.id === current.id);
  if (!barrier) return null;

  // Test endpoint handles (p1 and p2)
  const p1Screen = worldToCanvas(barrier.p1);
  if (distance(p1Screen, point) <= BARRIER_HANDLE_HIT_RADIUS) {
    return { type: 'p1' };
  }

  const p2Screen = worldToCanvas(barrier.p2);
  if (distance(p2Screen, point) <= BARRIER_HANDLE_HIT_RADIUS) {
    return { type: 'p2' };
  }

  // Test rotation handle (perpendicular from midpoint)
  const handleOffset = BARRIER_ROTATION_HANDLE_OFFSET_PX / getPixelsPerMeter();
  const handleWorld = getBarrierRotationHandlePosition(barrier, handleOffset);
  const handleCanvas = worldToCanvas(handleWorld);
  if (distance(handleCanvas, point) <= BARRIER_HANDLE_HIT_RADIUS) {
    return { type: 'rotate' };
  }

  return null;
}

/**
 * Test if a point hits a building handle (corner or rotation).
 * Only tests handles for the currently selected building.
 */
export function hitTestBuildingHandle(point: Point): BuildingHandleHit | null {
  const current = getSelection();
  if (current.type !== 'building') return null;

  const building = scene.buildings.find((item) => item.id === current.id);
  if (!building) return null;

  // Test corner handles
  const vertices = building.getVertices();
  for (let i = 0; i < vertices.length; i++) {
    const screen = worldToCanvas(vertices[i]);
    if (distance(screen, point) <= BUILDING_HANDLE_HIT_RADIUS) {
      return { type: 'corner', index: i };
    }
  }

  // Test rotation handle
  const handleOffset = BUILDING_ROTATION_HANDLE_OFFSET_PX / getPixelsPerMeter();
  const handleWorld = building.getRotationHandlePosition(handleOffset);
  const handleCanvas = worldToCanvas(handleWorld);
  if (distance(handleCanvas, point) <= BUILDING_HANDLE_HIT_RADIUS) {
    return { type: 'rotate' };
  }

  return null;
}

// =============================================================================
// BOX SELECTION
// =============================================================================

/**
 * Get polygon centroid (average of all points).
 */
export function getPolygonCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / points.length, y: cy / points.length };
}

/**
 * Get all elements within a selection box (in canvas coordinates).
 * Uses centroids for polygon entities.
 */
export function getElementsInSelectBox(
  startCanvas: Point,
  endCanvas: Point
): SelectionItem[] {
  const items: SelectionItem[] = [];

  const minX = Math.min(startCanvas.x, endCanvas.x);
  const maxX = Math.max(startCanvas.x, endCanvas.x);
  const minY = Math.min(startCanvas.y, endCanvas.y);
  const maxY = Math.max(startCanvas.y, endCanvas.y);

  const isInBox = (canvasPoint: Point) =>
    canvasPoint.x >= minX &&
    canvasPoint.x <= maxX &&
    canvasPoint.y >= minY &&
    canvasPoint.y <= maxY;

  // Sources
  for (const source of scene.sources) {
    const canvasPoint = worldToCanvas(source);
    if (isInBox(canvasPoint)) {
      items.push({ elementType: 'source', id: source.id });
    }
  }

  // Receivers
  for (const receiver of scene.receivers) {
    const canvasPoint = worldToCanvas(receiver);
    if (isInBox(canvasPoint)) {
      items.push({ elementType: 'receiver', id: receiver.id });
    }
  }

  // Probes
  for (const probe of scene.probes) {
    const canvasPoint = worldToCanvas(probe);
    if (isInBox(canvasPoint)) {
      items.push({ elementType: 'probe', id: probe.id });
    }
  }

  // Panels (use centroid)
  for (const panel of scene.panels) {
    const centroid = getPolygonCentroid(panel.points);
    const canvasPoint = worldToCanvas(centroid);
    if (isInBox(canvasPoint)) {
      items.push({ elementType: 'panel', id: panel.id });
    }
  }

  // Barriers (use midpoint)
  for (const barrier of scene.barriers) {
    const midpoint = {
      x: (barrier.p1.x + barrier.p2.x) / 2,
      y: (barrier.p1.y + barrier.p2.y) / 2,
    };
    const canvasPoint = worldToCanvas(midpoint);
    if (isInBox(canvasPoint)) {
      items.push({ elementType: 'barrier', id: barrier.id });
    }
  }

  // Buildings (use center)
  for (const building of scene.buildings) {
    const canvasPoint = worldToCanvas(building);
    if (isInBox(canvasPoint)) {
      items.push({ elementType: 'building', id: building.id });
    }
  }

  return items;
}

// =============================================================================
// SELECTION HELPERS
// =============================================================================

/**
 * Check if an element is part of the current selection.
 */
export function isElementSelected(
  sel: Selection,
  elementType: string,
  id: string
): boolean {
  if (sel.type === 'multi') {
    return sel.items.some(
      (item) => item.elementType === elementType && item.id === id
    );
  }
  return sel.type === elementType && 'id' in sel && sel.id === id;
}

/**
 * Convert a selection to an array of selection items.
 */
export function selectionToItems(sel: Selection): SelectionItem[] {
  if (sel.type === 'none') return [];
  if (sel.type === 'multi') return [...sel.items];
  return [{ elementType: sel.type as SelectableElementType, id: sel.id }];
}

/**
 * Convert an array of selection items to a selection.
 */
export function itemsToSelection(items: SelectionItem[]): Selection {
  if (items.length === 0) return { type: 'none' };
  if (items.length === 1) {
    const item = items[0];
    return { type: item.elementType, id: item.id } as Selection;
  }
  return { type: 'multi', items };
}

/**
 * Get count of selected items by type.
 */
export function getSelectedCount(
  sel: Selection
): Record<SelectableElementType, number> {
  const counts: Record<SelectableElementType, number> = {
    source: 0,
    receiver: 0,
    probe: 0,
    panel: 0,
    barrier: 0,
    building: 0,
  };
  const items = selectionToItems(sel);
  for (const item of items) {
    counts[item.elementType]++;
  }
  return counts;
}
