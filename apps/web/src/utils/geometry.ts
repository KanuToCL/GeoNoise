/**
 * Geometry utility functions for GeoNoise
 * Pure functions for 2D geometry calculations
 */

export type Point = { x: number; y: number };

/**
 * Euclidean distance between two points
 */
export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Distance from a point to a line segment
 */
export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return distance(point, a);
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + clamped * dx, y: a.y + clamped * dy };
  return distance(point, proj);
}

/**
 * Linear interpolation between two values
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Cross product of two 2D vectors (returns scalar z-component)
 */
export function cross2D(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/**
 * Check if two line segments intersect (strictly cross, not just touch)
 */
export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = cross2D(b2.x - b1.x, b2.y - b1.y, a1.x - b1.x, a1.y - b1.y);
  const d2 = cross2D(b2.x - b1.x, b2.y - b1.y, a2.x - b1.x, a2.y - b1.y);
  const d3 = cross2D(a2.x - a1.x, a2.y - a1.y, b1.x - a1.x, b1.y - a1.y);
  const d4 = cross2D(a2.x - a1.x, a2.y - a1.y, b2.x - a1.x, b2.y - a1.y);

  // Segments intersect if they straddle each other
  return (d1 * d2 < 0) && (d3 * d4 < 0);
}

/**
 * Check if 4 points form a valid (non-self-intersecting) quadrilateral.
 * A quadrilateral is valid if the two diagonals intersect inside the polygon.
 * Invalid quadrilaterals are "bowtie" or "figure-8" shapes where edges cross.
 */
export function isValidQuadrilateral(p0: Point, p1: Point, p2: Point, p3: Point): boolean {
  // A quadrilateral is valid if its diagonals (P0-P2 and P1-P3) intersect
  return segmentsIntersect(p0, p2, p1, p3);
}

/**
 * Ensure polygon vertices are in counter-clockwise order.
 * Uses the shoelace formula to calculate signed area.
 *
 * In our Y-up coordinate system:
 * - Positive signed area from shoelace = CW
 * - Negative signed area from shoelace = CCW
 */
export function ensureCCW(vertices: Point[]): Point[] {
  if (vertices.length < 3) return vertices;

  // Shoelace formula for signed area (doubled)
  let signedArea2 = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    signedArea2 += (vertices[j].x - vertices[i].x) * (vertices[j].y + vertices[i].y);
  }

  // In Y-up coordinate system: positive signed area = CW, need to reverse
  if (signedArea2 > 0) {
    return [...vertices].reverse();
  }

  return vertices;
}

/**
 * Point-in-polygon test using ray casting algorithm
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
