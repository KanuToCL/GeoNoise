/**
 * Geometry Utilities for Probe Worker
 *
 * 2D and 3D geometry functions for ray tracing calculations.
 * Includes point/segment operations, polygon tests, and visibility checks.
 */

import type {
  Point2D,
  Point3D,
  Segment2D,
  WallSegment,
  BuildingFootprint,
  BuildingOcclusionResult,
} from './types';

// ============================================================================
// Constants
// ============================================================================

export const EPSILON = 1e-10;

// ============================================================================
// Distance Functions
// ============================================================================

export function distance2D(a: Point2D, b: Point2D): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function distance3D(a: Point3D, b: Point3D): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2);
}

// ============================================================================
// Vector Operations
// ============================================================================

export function cross2D(a: Point2D, b: Point2D): number {
  return a.x * b.y - a.y * b.x;
}

// ============================================================================
// Segment Intersection
// ============================================================================

/**
 * Compute intersection point of two 2D line segments.
 * Returns null if segments don't intersect.
 */
export function segmentIntersection(
  p1: Point2D,
  p2: Point2D,
  q1: Point2D,
  q2: Point2D
): Point2D | null {
  const r = { x: p2.x - p1.x, y: p2.y - p1.y };
  const s = { x: q2.x - q1.x, y: q2.y - q1.y };
  const rxs = cross2D(r, s);
  const qmp = { x: q1.x - p1.x, y: q1.y - p1.y };

  if (Math.abs(rxs) < EPSILON) return null;

  const t = cross2D(qmp, s) / rxs;
  const u = cross2D(qmp, r) / rxs;

  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) {
    return null;
  }

  return { x: p1.x + t * r.x, y: p1.y + t * r.y };
}

// ============================================================================
// Mirror / Reflection
// ============================================================================

/**
 * Mirror a 2D point across a line segment.
 * Used for image source method in wall reflections.
 */
export function mirrorPoint2D(point: Point2D, segment: Segment2D): Point2D {
  const { p1, p2 } = segment;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < EPSILON) return point;

  const t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lenSq;
  const projX = p1.x + t * dx;
  const projY = p1.y + t * dy;

  return { x: 2 * projX - point.x, y: 2 * projY - point.y };
}

// ============================================================================
// Barrier Blocking
// ============================================================================

/**
 * Check if a 2D path is blocked by any barrier segment.
 */
export function isPathBlocked(
  from: Point2D,
  to: Point2D,
  barriers: WallSegment[],
  excludeId?: string
): boolean {
  for (const barrier of barriers) {
    if (barrier.type !== 'barrier') continue;
    if (barrier.id === excludeId) continue;
    const intersection = segmentIntersection(from, to, barrier.p1, barrier.p2);
    if (intersection) {
      const distToFrom = distance2D(intersection, from);
      const distToTo = distance2D(intersection, to);
      if (distToFrom > EPSILON && distToTo > EPSILON) {
        return true;
      }
    }
  }
  return false;
}

// ============================================================================
// Polygon Operations
// ============================================================================

/**
 * Point-in-polygon test using ray casting algorithm.
 *
 * Casts a ray from the point to infinity (positive X direction)
 * and counts how many polygon edges it crosses. Odd count = inside.
 */
export function pointInPolygon(point: Point2D, vertices: Point2D[]): boolean {
  let inside = false;
  const n = vertices.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x,
      yi = vertices[i].y;
    const xj = vertices[j].x,
      yj = vertices[j].y;

    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a line segment intersects with a polygon.
 * Returns entry and exit points if it does.
 */
export function segmentIntersectsPolygon(
  from: Point2D,
  to: Point2D,
  vertices: Point2D[]
): { intersects: boolean; entryPoint: Point2D | null; exitPoint: Point2D | null } {
  const intersectionPoints: { point: Point2D; t: number }[] = [];
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const intersection = segmentIntersection(from, to, vertices[i], vertices[j]);
    if (intersection) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > EPSILON) {
        const t =
          ((intersection.x - from.x) * dx + (intersection.y - from.y) * dy) /
          (len * len);
        if (t > EPSILON && t < 1 - EPSILON) {
          intersectionPoints.push({ point: intersection, t });
        }
      }
    }
  }

  const fromInside = pointInPolygon(from, vertices);
  const toInside = pointInPolygon(to, vertices);

  if (fromInside || toInside || intersectionPoints.length > 0) {
    intersectionPoints.sort((a, b) => a.t - b.t);

    let entryPoint: Point2D | null = null;
    let exitPoint: Point2D | null = null;

    if (fromInside) {
      entryPoint = from;
      exitPoint = intersectionPoints.length > 0 ? intersectionPoints[0].point : to;
    } else if (intersectionPoints.length >= 2) {
      entryPoint = intersectionPoints[0].point;
      exitPoint = intersectionPoints[intersectionPoints.length - 1].point;
    } else if (intersectionPoints.length === 1) {
      entryPoint = intersectionPoints[0].point;
      exitPoint = toInside ? to : intersectionPoints[0].point;
    }

    return { intersects: true, entryPoint, exitPoint };
  }

  return { intersects: false, entryPoint: null, exitPoint: null };
}

// ============================================================================
// Path Height Calculation
// ============================================================================

/**
 * Calculate the height of a 3D path at a given 2D point along its length.
 * Assumes linear interpolation between source and receiver heights.
 */
export function pathHeightAtPoint(
  from: Point3D,
  to: Point3D,
  point: Point2D
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.sqrt(dx * dx + dy * dy);

  if (d < EPSILON) return Math.min(from.z, to.z);

  const t = ((point.x - from.x) * dx + (point.y - from.y) * dy) / (d * d);
  const tClamped = Math.max(0, Math.min(1, t));

  return from.z + tClamped * (to.z - from.z);
}

// ============================================================================
// Building Occlusion
// ============================================================================

/**
 * Find ALL buildings that block a 3D path.
 * A path is blocked if the 2D projection crosses the building footprint
 * AND the path height at intersection is below the building top.
 */
export function findAllBlockingBuildings(
  from: Point3D,
  to: Point3D,
  buildings: BuildingFootprint[]
): BuildingOcclusionResult[] {
  const results: BuildingOcclusionResult[] = [];

  for (const building of buildings) {
    const result = segmentIntersectsPolygon(
      { x: from.x, y: from.y },
      { x: to.x, y: to.y },
      building.vertices
    );

    if (result.intersects && result.entryPoint && result.exitPoint) {
      const buildingTop = building.groundElevation + building.height;

      const heightAtEntry = pathHeightAtPoint(from, to, result.entryPoint);
      const heightAtExit = pathHeightAtPoint(from, to, result.exitPoint);

      if (heightAtEntry < buildingTop || heightAtExit < buildingTop) {
        results.push({
          blocked: true,
          building,
          entryPoint: result.entryPoint,
          exitPoint: result.exitPoint,
        });
      }
    }
  }

  return results;
}

/**
 * Find first blocking building (legacy function for backwards compatibility).
 */
export function findBlockingBuilding(
  from: Point3D,
  to: Point3D,
  buildings: BuildingFootprint[]
): BuildingOcclusionResult {
  const allBlocking = findAllBlockingBuildings(from, to, buildings);
  if (allBlocking.length > 0) {
    return allBlocking[0];
  }
  return { blocked: false, building: null, entryPoint: null, exitPoint: null };
}

/**
 * Find building corners visible from a point (for around-corner diffraction).
 */
export function findVisibleCorners(
  point: Point2D,
  building: BuildingFootprint
): Point2D[] {
  const visibleCorners: Point2D[] = [];

  for (const corner of building.vertices) {
    let blocked = false;
    const n = building.vertices.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const v1 = building.vertices[i];
      const v2 = building.vertices[j];

      if (
        (Math.abs(v1.x - corner.x) < EPSILON &&
          Math.abs(v1.y - corner.y) < EPSILON) ||
        (Math.abs(v2.x - corner.x) < EPSILON &&
          Math.abs(v2.y - corner.y) < EPSILON)
      ) {
        continue;
      }

      const intersection = segmentIntersection(point, corner, v1, v2);
      if (intersection) {
        const distToPoint = distance2D(intersection, point);
        const distToCorner = distance2D(intersection, corner);
        if (distToPoint > EPSILON && distToCorner > EPSILON) {
          blocked = true;
          break;
        }
      }
    }

    if (!blocked) {
      visibleCorners.push(corner);
    }
  }

  return visibleCorners;
}

// ============================================================================
// Ground Reflection Geometry
// ============================================================================

/**
 * Calculate the ground-reflected path geometry using the image source method.
 *
 * @param d - Horizontal distance between source and receiver (2D)
 * @param hs - Source height above ground
 * @param hr - Receiver height above ground
 * @returns Object with direct distance r1, reflected distance r2, and reflection point
 */
export function calculateGroundReflectionGeometry(
  d: number,
  hs: number,
  hr: number
): { r1: number; r2: number; reflectionPointX: number } {
  const r1 = Math.sqrt(d * d + (hs - hr) ** 2);
  const r2 = Math.sqrt(d * d + (hs + hr) ** 2);
  const reflectionPointX = (d * hs) / (hs + hr);

  return { r1, r2, reflectionPointX };
}
