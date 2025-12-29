/**
 * Geometry operations for occlusion and propagation
 */

import { Point2D, Point3D, BoundingBox2D } from '@geonoise/core';
import { GEOMETRY_EPSILON } from '@geonoise/shared';

// ============================================================================
// Vector Operations
// ============================================================================

/** 2D Vector */
export interface Vec2 {
  x: number;
  y: number;
}

/** 3D Vector */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Create a 2D vector from two points */
export function vec2FromPoints(from: Point2D, to: Point2D): Vec2 {
  return { x: to.x - from.x, y: to.y - from.y };
}

/** Create a 3D vector from two points */
export function vec3FromPoints(from: Point3D, to: Point3D): Vec3 {
  return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
}

/** Calculate 2D vector length */
export function vec2Length(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/** Calculate 3D vector length */
export function vec3Length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/** Normalize a 2D vector */
export function vec2Normalize(v: Vec2): Vec2 {
  const len = vec2Length(v);
  if (len < GEOMETRY_EPSILON) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

/** Normalize a 3D vector */
export function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len < GEOMETRY_EPSILON) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** 2D dot product */
export function vec2Dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** 3D dot product */
export function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** 2D cross product (returns scalar) */
export function vec2Cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

/** 3D cross product */
export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Scale a 2D vector */
export function vec2Scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

/** Scale a 3D vector */
export function vec3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/** Add two 2D vectors */
export function vec2Add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** Add two 3D vectors */
export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

// ============================================================================
// Line Segment Operations
// ============================================================================

/** Line segment in 2D */
export interface Segment2D {
  start: Point2D;
  end: Point2D;
}

/** Line segment in 3D */
export interface Segment3D {
  start: Point3D;
  end: Point3D;
}

/** Calculate segment length */
export function segmentLength2D(seg: Segment2D): number {
  return vec2Length(vec2FromPoints(seg.start, seg.end));
}

/** Calculate segment length in 3D */
export function segmentLength3D(seg: Segment3D): number {
  return vec3Length(vec3FromPoints(seg.start, seg.end));
}

/** Get a point along a segment at parameter t (0-1) */
export function pointOnSegment2D(seg: Segment2D, t: number): Point2D {
  return {
    x: seg.start.x + t * (seg.end.x - seg.start.x),
    y: seg.start.y + t * (seg.end.y - seg.start.y),
  };
}

/** Get a point along a 3D segment at parameter t (0-1) */
export function pointOnSegment3D(seg: Segment3D, t: number): Point3D {
  return {
    x: seg.start.x + t * (seg.end.x - seg.start.x),
    y: seg.start.y + t * (seg.end.y - seg.start.y),
    z: seg.start.z + t * (seg.end.z - seg.start.z),
  };
}

/** Calculate closest point on segment to a point */
export function closestPointOnSegment2D(seg: Segment2D, point: Point2D): Point2D {
  const v = vec2FromPoints(seg.start, seg.end);
  const w = vec2FromPoints(seg.start, point);
  
  const c1 = vec2Dot(w, v);
  if (c1 <= 0) return seg.start;
  
  const c2 = vec2Dot(v, v);
  if (c2 <= c1) return seg.end;
  
  const t = c1 / c2;
  return pointOnSegment2D(seg, t);
}

/** Calculate distance from point to segment */
export function distanceToSegment2D(seg: Segment2D, point: Point2D): number {
  const closest = closestPointOnSegment2D(seg, point);
  return vec2Length(vec2FromPoints(closest, point));
}

// ============================================================================
// Line-Line Intersection
// ============================================================================

/** Intersection result */
export interface IntersectionResult2D {
  intersects: boolean;
  point?: Point2D;
  t1?: number; // Parameter along first segment
  t2?: number; // Parameter along second segment
}

/**
 * Check if two 2D line segments intersect
 * Returns intersection point and parameters if they do
 */
export function segmentIntersection2D(seg1: Segment2D, seg2: Segment2D): IntersectionResult2D {
  const p = seg1.start;
  const r = vec2FromPoints(seg1.start, seg1.end);
  const q = seg2.start;
  const s = vec2FromPoints(seg2.start, seg2.end);
  
  const rxs = vec2Cross(r, s);
  const qmp = vec2FromPoints(p, q);
  const qmpxr = vec2Cross(qmp, r);
  
  // Parallel lines
  if (Math.abs(rxs) < GEOMETRY_EPSILON) {
    return { intersects: false };
  }
  
  const t = vec2Cross(qmp, s) / rxs;
  const u = qmpxr / rxs;
  
  // Check if intersection is within both segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      intersects: true,
      point: pointOnSegment2D(seg1, t),
      t1: t,
      t2: u,
    };
  }
  
  return { intersects: false };
}

// ============================================================================
// Polygon Operations
// ============================================================================

/** Calculate polygon area using shoelace formula */
export function polygonArea(vertices: Point2D[]): number {
  if (vertices.length < 3) return 0;
  
  let area = 0;
  const n = vertices.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  
  return Math.abs(area) / 2;
}

/** Calculate polygon centroid */
export function polygonCentroid(vertices: Point2D[]): Point2D {
  if (vertices.length === 0) return { x: 0, y: 0 };
  if (vertices.length === 1) return vertices[0];
  if (vertices.length === 2) {
    return {
      x: (vertices[0].x + vertices[1].x) / 2,
      y: (vertices[0].y + vertices[1].y) / 2,
    };
  }
  
  let cx = 0;
  let cy = 0;
  let area = 0;
  const n = vertices.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
    cx += (vertices[i].x + vertices[j].x) * cross;
    cy += (vertices[i].y + vertices[j].y) * cross;
    area += cross;
  }
  
  area /= 2;
  const factor = 1 / (6 * area);
  
  return { x: cx * factor, y: cy * factor };
}

/** Check if a point is inside a polygon using ray casting */
export function pointInPolygon(point: Point2D, vertices: Point2D[]): boolean {
  if (vertices.length < 3) return false;
  
  let inside = false;
  const n = vertices.length;
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;
    
    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  
  return inside;
}

/** Get bounding box of a polygon */
export function polygonBoundingBox(vertices: Point2D[]): BoundingBox2D | null {
  if (vertices.length === 0) return null;
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  
  return { minX, minY, maxX, maxY };
}

/** Check if polygon is clockwise */
export function isClockwise(vertices: Point2D[]): boolean {
  if (vertices.length < 3) return false;
  
  let sum = 0;
  const n = vertices.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += (vertices[j].x - vertices[i].x) * (vertices[j].y + vertices[i].y);
  }
  
  return sum > 0;
}

// ============================================================================
// Line of Sight (LOS) Operations
// ============================================================================

/** Obstacle for LOS calculations */
export interface LOSObstacle {
  vertices: Point2D[];
  height: number;
  groundElevation: number;
}

/**
 * Check if a line segment intersects a polygon (2D projection)
 */
export function segmentIntersectsPolygon(seg: Segment2D, vertices: Point2D[]): boolean {
  const n = vertices.length;
  
  // Check if segment intersects any edge
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const edge: Segment2D = { start: vertices[i], end: vertices[j] };
    const result = segmentIntersection2D(seg, edge);
    if (result.intersects) return true;
  }
  
  // Check if either endpoint is inside the polygon
  if (pointInPolygon(seg.start, vertices)) return true;
  if (pointInPolygon(seg.end, vertices)) return true;
  
  return false;
}

/**
 * Simple LOS check between two 3D points through obstacles
 * Returns true if path is blocked
 */
export function isLOSBlocked(
  source: Point3D,
  receiver: Point3D,
  obstacles: LOSObstacle[]
): boolean {
  // Project to 2D for initial check
  const seg2D: Segment2D = {
    start: { x: source.x, y: source.y },
    end: { x: receiver.x, y: receiver.y },
  };
  
  for (const obstacle of obstacles) {
    if (segmentIntersectsPolygon(seg2D, obstacle.vertices)) {
      // Check if the path clears the obstacle height
      // This is a simplified check - real implementation would
      // compute the exact intersection point and height
      const obstacleTop = obstacle.groundElevation + obstacle.height;
      const minPathHeight = Math.min(source.z, receiver.z);
      
      if (minPathHeight < obstacleTop) {
        return true;
      }
    }
  }
  
  return false;
}

// ============================================================================
// Grid Generation
// ============================================================================

/**
 * Generate a grid of points within a bounding box
 */
export function generateGrid(
  bounds: BoundingBox2D,
  resolution: number,
  elevation = 0
): Point3D[] {
  const points: Point3D[] = [];
  
  for (let x = bounds.minX; x <= bounds.maxX; x += resolution) {
    for (let y = bounds.minY; y <= bounds.maxY; y += resolution) {
      points.push({ x, y, z: elevation });
    }
  }
  
  return points;
}

/**
 * Generate sample points within a polygon
 */
export function generatePolygonSamples(
  vertices: Point2D[],
  resolution: number,
  elevation = 0
): Point3D[] {
  const bbox = polygonBoundingBox(vertices);
  if (!bbox) return [];
  
  const points: Point3D[] = [];
  
  for (let x = bbox.minX; x <= bbox.maxX; x += resolution) {
    for (let y = bbox.minY; y <= bbox.maxY; y += resolution) {
      if (pointInPolygon({ x, y }, vertices)) {
        points.push({ x, y, z: elevation });
      }
    }
  }
  
  return points;
}

/**
 * Generate sample points within a rectangle
 */
export function generateRectangleSamples(
  center: Point2D,
  width: number,
  height: number,
  rotation: number,
  resolution: number,
  elevation = 0
): Point3D[] {
  const points: Point3D[] = [];
  const cos = Math.cos((rotation * Math.PI) / 180);
  const sin = Math.sin((rotation * Math.PI) / 180);
  
  const halfW = width / 2;
  const halfH = height / 2;
  
  for (let lx = -halfW; lx <= halfW; lx += resolution) {
    for (let ly = -halfH; ly <= halfH; ly += resolution) {
      // Rotate and translate
      const x = center.x + lx * cos - ly * sin;
      const y = center.y + lx * sin + ly * cos;
      points.push({ x, y, z: elevation });
    }
  }
  
  return points;
}
