/**
 * Unit tests for @geonoise/geo geom module
 * Tests vector operations, segment functions, and polygon algorithms
 */

import { describe, it, expect } from 'vitest';
import {
  vec2FromPoints,
  vec3FromPoints,
  vec2Length,
  vec3Length,
  vec2Normalize,
  vec3Normalize,
  vec2Dot,
  vec3Dot,
  vec2Cross,
  vec3Cross,
  vec2Scale,
  vec3Scale,
  vec2Add,
  vec3Add,
  segmentLength2D,
  segmentLength3D,
  pointOnSegment2D,
  pointOnSegment3D,
  closestPointOnSegment2D,
  distanceToSegment2D,
  segmentIntersection2D,
  polygonArea,
  polygonCentroid,
  pointInPolygon,
  polygonBoundingBox,
  isClockwise,
  segmentIntersectsPolygon,
  isLOSBlocked,
  generateGrid,
  generatePolygonSamples,
  generateRectangleSamples,
  type Vec2,
  type Vec3,
  type Segment2D,
  type Segment3D,
  type LOSObstacle,
} from './index.js';

// ============================================================================
// Vector 2D Tests
// ============================================================================

describe('vec2FromPoints', () => {
  it('creates vector from two points', () => {
    const from = { x: 1, y: 2 };
    const to = { x: 4, y: 6 };
    const v = vec2FromPoints(from, to);
    expect(v).toEqual({ x: 3, y: 4 });
  });

  it('creates zero vector for same points', () => {
    const p = { x: 5, y: 5 };
    const v = vec2FromPoints(p, p);
    expect(v).toEqual({ x: 0, y: 0 });
  });
});

describe('vec2Length', () => {
  it('calculates length of unit vector', () => {
    expect(vec2Length({ x: 1, y: 0 })).toBe(1);
    expect(vec2Length({ x: 0, y: 1 })).toBe(1);
  });

  it('calculates length of 3-4-5 triangle', () => {
    expect(vec2Length({ x: 3, y: 4 })).toBe(5);
  });

  it('returns 0 for zero vector', () => {
    expect(vec2Length({ x: 0, y: 0 })).toBe(0);
  });
});

describe('vec2Normalize', () => {
  it('normalizes non-zero vector', () => {
    const v = vec2Normalize({ x: 3, y: 4 });
    expect(v.x).toBeCloseTo(0.6, 5);
    expect(v.y).toBeCloseTo(0.8, 5);
    expect(vec2Length(v)).toBeCloseTo(1, 5);
  });

  it('returns zero vector for zero input', () => {
    const v = vec2Normalize({ x: 0, y: 0 });
    expect(v).toEqual({ x: 0, y: 0 });
  });
});

describe('vec2Dot', () => {
  it('calculates dot product', () => {
    const a: Vec2 = { x: 1, y: 2 };
    const b: Vec2 = { x: 3, y: 4 };
    expect(vec2Dot(a, b)).toBe(11); // 1*3 + 2*4
  });

  it('returns 0 for perpendicular vectors', () => {
    const a: Vec2 = { x: 1, y: 0 };
    const b: Vec2 = { x: 0, y: 1 };
    expect(vec2Dot(a, b)).toBe(0);
  });

  it('is commutative', () => {
    const a: Vec2 = { x: 2, y: 3 };
    const b: Vec2 = { x: 4, y: 5 };
    expect(vec2Dot(a, b)).toBe(vec2Dot(b, a));
  });
});

describe('vec2Cross', () => {
  it('calculates cross product (scalar)', () => {
    const a: Vec2 = { x: 1, y: 0 };
    const b: Vec2 = { x: 0, y: 1 };
    expect(vec2Cross(a, b)).toBe(1);
  });

  it('returns 0 for parallel vectors', () => {
    const a: Vec2 = { x: 2, y: 4 };
    const b: Vec2 = { x: 1, y: 2 };
    expect(vec2Cross(a, b)).toBe(0);
  });

  it('is anti-commutative', () => {
    const a: Vec2 = { x: 2, y: 3 };
    const b: Vec2 = { x: 4, y: 5 };
    expect(vec2Cross(a, b)).toBe(-vec2Cross(b, a));
  });
});

describe('vec2Scale', () => {
  it('scales vector', () => {
    const v = vec2Scale({ x: 2, y: 3 }, 2);
    expect(v).toEqual({ x: 4, y: 6 });
  });

  it('returns zero vector when scaled by 0', () => {
    const v = vec2Scale({ x: 5, y: 10 }, 0);
    expect(v).toEqual({ x: 0, y: 0 });
  });
});

describe('vec2Add', () => {
  it('adds vectors', () => {
    const a: Vec2 = { x: 1, y: 2 };
    const b: Vec2 = { x: 3, y: 4 };
    expect(vec2Add(a, b)).toEqual({ x: 4, y: 6 });
  });

  it('is commutative', () => {
    const a: Vec2 = { x: 1, y: 2 };
    const b: Vec2 = { x: 3, y: 4 };
    expect(vec2Add(a, b)).toEqual(vec2Add(b, a));
  });
});

// ============================================================================
// Vector 3D Tests
// ============================================================================

describe('vec3FromPoints', () => {
  it('creates vector from two 3D points', () => {
    const from = { x: 1, y: 2, z: 3 };
    const to = { x: 4, y: 6, z: 8 };
    const v = vec3FromPoints(from, to);
    expect(v).toEqual({ x: 3, y: 4, z: 5 });
  });
});

describe('vec3Length', () => {
  it('calculates 3D length', () => {
    expect(vec3Length({ x: 1, y: 2, z: 2 })).toBe(3); // sqrt(1+4+4)
  });
});

describe('vec3Normalize', () => {
  it('normalizes 3D vector', () => {
    const v = vec3Normalize({ x: 1, y: 2, z: 2 });
    expect(vec3Length(v)).toBeCloseTo(1, 5);
  });

  it('returns zero vector for zero input', () => {
    const v = vec3Normalize({ x: 0, y: 0, z: 0 });
    expect(v).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('vec3Dot', () => {
  it('calculates 3D dot product', () => {
    const a: Vec3 = { x: 1, y: 2, z: 3 };
    const b: Vec3 = { x: 4, y: 5, z: 6 };
    expect(vec3Dot(a, b)).toBe(32); // 1*4 + 2*5 + 3*6
  });
});

describe('vec3Cross', () => {
  it('calculates cross product of unit vectors', () => {
    const x: Vec3 = { x: 1, y: 0, z: 0 };
    const y: Vec3 = { x: 0, y: 1, z: 0 };
    const cross = vec3Cross(x, y);
    expect(cross).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('returns zero for parallel vectors', () => {
    const a: Vec3 = { x: 2, y: 0, z: 0 };
    const b: Vec3 = { x: 5, y: 0, z: 0 };
    const cross = vec3Cross(a, b);
    expect(cross).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('vec3Scale', () => {
  it('scales 3D vector', () => {
    const v = vec3Scale({ x: 1, y: 2, z: 3 }, 2);
    expect(v).toEqual({ x: 2, y: 4, z: 6 });
  });
});

describe('vec3Add', () => {
  it('adds 3D vectors', () => {
    const a: Vec3 = { x: 1, y: 2, z: 3 };
    const b: Vec3 = { x: 4, y: 5, z: 6 };
    expect(vec3Add(a, b)).toEqual({ x: 5, y: 7, z: 9 });
  });
});

// ============================================================================
// Segment Tests
// ============================================================================

describe('segmentLength2D', () => {
  it('calculates segment length', () => {
    const seg: Segment2D = {
      start: { x: 0, y: 0 },
      end: { x: 3, y: 4 },
    };
    expect(segmentLength2D(seg)).toBe(5);
  });
});

describe('segmentLength3D', () => {
  it('calculates 3D segment length', () => {
    const seg: Segment3D = {
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1, y: 2, z: 2 },
    };
    expect(segmentLength3D(seg)).toBe(3);
  });
});

describe('pointOnSegment2D', () => {
  const seg: Segment2D = {
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
  };

  it('returns start at t=0', () => {
    expect(pointOnSegment2D(seg, 0)).toEqual({ x: 0, y: 0 });
  });

  it('returns end at t=1', () => {
    expect(pointOnSegment2D(seg, 1)).toEqual({ x: 10, y: 0 });
  });

  it('returns midpoint at t=0.5', () => {
    expect(pointOnSegment2D(seg, 0.5)).toEqual({ x: 5, y: 0 });
  });
});

describe('pointOnSegment3D', () => {
  const seg: Segment3D = {
    start: { x: 0, y: 0, z: 0 },
    end: { x: 10, y: 10, z: 10 },
  };

  it('returns midpoint at t=0.5', () => {
    expect(pointOnSegment3D(seg, 0.5)).toEqual({ x: 5, y: 5, z: 5 });
  });
});

describe('closestPointOnSegment2D', () => {
  const seg: Segment2D = {
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
  };

  it('returns projected point for point above segment', () => {
    const closest = closestPointOnSegment2D(seg, { x: 5, y: 5 });
    expect(closest).toEqual({ x: 5, y: 0 });
  });

  it('returns start for point before segment', () => {
    const closest = closestPointOnSegment2D(seg, { x: -5, y: 0 });
    expect(closest).toEqual({ x: 0, y: 0 });
  });

  it('returns end for point after segment', () => {
    const closest = closestPointOnSegment2D(seg, { x: 15, y: 0 });
    expect(closest).toEqual({ x: 10, y: 0 });
  });
});

describe('distanceToSegment2D', () => {
  const seg: Segment2D = {
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
  };

  it('calculates perpendicular distance', () => {
    expect(distanceToSegment2D(seg, { x: 5, y: 3 })).toBe(3);
  });

  it('returns 0 for point on segment', () => {
    expect(distanceToSegment2D(seg, { x: 5, y: 0 })).toBe(0);
  });
});

// ============================================================================
// Segment Intersection Tests
// ============================================================================

describe('segmentIntersection2D', () => {
  it('detects crossing segments', () => {
    const seg1: Segment2D = { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } };
    const seg2: Segment2D = { start: { x: 0, y: 10 }, end: { x: 10, y: 0 } };
    const result = segmentIntersection2D(seg1, seg2);
    expect(result.intersects).toBe(true);
    expect(result.point?.x).toBeCloseTo(5, 5);
    expect(result.point?.y).toBeCloseTo(5, 5);
  });

  it('returns false for parallel segments', () => {
    const seg1: Segment2D = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const seg2: Segment2D = { start: { x: 0, y: 5 }, end: { x: 10, y: 5 } };
    const result = segmentIntersection2D(seg1, seg2);
    expect(result.intersects).toBe(false);
  });

  it('returns false for non-intersecting segments', () => {
    const seg1: Segment2D = { start: { x: 0, y: 0 }, end: { x: 5, y: 0 } };
    const seg2: Segment2D = { start: { x: 6, y: 0 }, end: { x: 10, y: 0 } };
    const result = segmentIntersection2D(seg1, seg2);
    expect(result.intersects).toBe(false);
  });

  it('returns intersection parameters', () => {
    const seg1: Segment2D = { start: { x: 0, y: 5 }, end: { x: 10, y: 5 } };
    const seg2: Segment2D = { start: { x: 5, y: 0 }, end: { x: 5, y: 10 } };
    const result = segmentIntersection2D(seg1, seg2);
    expect(result.intersects).toBe(true);
    expect(result.t1).toBeCloseTo(0.5, 5);
    expect(result.t2).toBeCloseTo(0.5, 5);
  });
});

// ============================================================================
// Polygon Tests
// ============================================================================

describe('polygonArea', () => {
  it('returns 0 for less than 3 vertices', () => {
    expect(polygonArea([])).toBe(0);
    expect(polygonArea([{ x: 0, y: 0 }])).toBe(0);
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });

  it('calculates area of unit square', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(polygonArea(square)).toBe(1);
  });

  it('calculates area of rectangle', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    expect(polygonArea(rect)).toBe(12);
  });

  it('calculates area of triangle', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 3 },
    ];
    expect(polygonArea(triangle)).toBe(6);
  });

  it('handles counter-clockwise winding', () => {
    const ccw = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
    ];
    expect(polygonArea(ccw)).toBe(1);
  });
});

describe('polygonCentroid', () => {
  it('returns origin for empty array', () => {
    expect(polygonCentroid([])).toEqual({ x: 0, y: 0 });
  });

  it('returns point for single vertex', () => {
    expect(polygonCentroid([{ x: 5, y: 10 }])).toEqual({ x: 5, y: 10 });
  });

  it('returns midpoint for two vertices', () => {
    expect(polygonCentroid([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toEqual({ x: 5, y: 5 });
  });

  it('calculates centroid of square', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const centroid = polygonCentroid(square);
    expect(centroid.x).toBeCloseTo(5, 5);
    expect(centroid.y).toBeCloseTo(5, 5);
  });

  it('calculates centroid of triangle', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 3, y: 6 },
    ];
    const centroid = polygonCentroid(triangle);
    expect(centroid.x).toBeCloseTo(3, 5);
    expect(centroid.y).toBeCloseTo(2, 5);
  });
});

describe('pointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('returns false for less than 3 vertices', () => {
    expect(pointInPolygon({ x: 0, y: 0 }, [])).toBe(false);
    expect(pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }])).toBe(false);
  });

  it('returns true for point inside', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
  });

  it('returns false for point outside', () => {
    expect(pointInPolygon({ x: -5, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
  });

  it('handles concave polygon', () => {
    const concave = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 5, y: 5 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 2, y: 5 }, concave)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 8 }, concave)).toBe(false);
  });
});

describe('polygonBoundingBox', () => {
  it('returns null for empty array', () => {
    expect(polygonBoundingBox([])).toBeNull();
  });

  it('calculates bounding box', () => {
    const polygon = [
      { x: 2, y: 3 },
      { x: 8, y: 1 },
      { x: 5, y: 9 },
    ];
    const bbox = polygonBoundingBox(polygon);
    expect(bbox).toEqual({ minX: 2, minY: 1, maxX: 8, maxY: 9 });
  });
});

describe('isClockwise', () => {
  it('returns false for less than 3 vertices', () => {
    expect(isClockwise([])).toBe(false);
    expect(isClockwise([{ x: 0, y: 0 }])).toBe(false);
  });

  it('returns true for clockwise polygon', () => {
    const cw = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
    ];
    expect(isClockwise(cw)).toBe(true);
  });

  it('returns false for counter-clockwise polygon', () => {
    const ccw = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(isClockwise(ccw)).toBe(false);
  });
});

// ============================================================================
// LOS and Intersection Tests
// ============================================================================

describe('segmentIntersectsPolygon', () => {
  const square = [
    { x: 5, y: 5 },
    { x: 15, y: 5 },
    { x: 15, y: 15 },
    { x: 5, y: 15 },
  ];

  it('returns true for segment crossing polygon', () => {
    const seg: Segment2D = { start: { x: 0, y: 10 }, end: { x: 20, y: 10 } };
    expect(segmentIntersectsPolygon(seg, square)).toBe(true);
  });

  it('returns true for segment inside polygon', () => {
    const seg: Segment2D = { start: { x: 7, y: 10 }, end: { x: 13, y: 10 } };
    expect(segmentIntersectsPolygon(seg, square)).toBe(true);
  });

  it('returns false for segment outside polygon', () => {
    const seg: Segment2D = { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } };
    expect(segmentIntersectsPolygon(seg, square)).toBe(false);
  });
});

describe('isLOSBlocked', () => {
  const obstacle: LOSObstacle = {
    vertices: [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: 15, y: 15 },
      { x: 5, y: 15 },
    ],
    height: 10,
    groundElevation: 0,
  };

  it('returns true when path is blocked', () => {
    const source = { x: 0, y: 10, z: 1 };
    const receiver = { x: 20, y: 10, z: 1 };
    expect(isLOSBlocked(source, receiver, [obstacle])).toBe(true);
  });

  it('returns false when path clears obstacle', () => {
    const source = { x: 0, y: 10, z: 15 };
    const receiver = { x: 20, y: 10, z: 15 };
    expect(isLOSBlocked(source, receiver, [obstacle])).toBe(false);
  });

  it('returns false when path misses obstacle', () => {
    const source = { x: 0, y: 0, z: 1 };
    const receiver = { x: 0, y: 20, z: 1 };
    expect(isLOSBlocked(source, receiver, [obstacle])).toBe(false);
  });

  it('returns false for empty obstacles array', () => {
    const source = { x: 0, y: 10, z: 1 };
    const receiver = { x: 20, y: 10, z: 1 };
    expect(isLOSBlocked(source, receiver, [])).toBe(false);
  });
});

// ============================================================================
// Grid Generation Tests
// ============================================================================

describe('generateGrid', () => {
  it('generates grid within bounds', () => {
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const points = generateGrid(bounds, 5);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(10);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(10);
    }
  });

  it('respects resolution parameter', () => {
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const points5 = generateGrid(bounds, 5);
    const points2 = generateGrid(bounds, 2);
    expect(points2.length).toBeGreaterThan(points5.length);
  });

  it('sets elevation on points', () => {
    const bounds = { minX: 0, minY: 0, maxX: 5, maxY: 5 };
    const points = generateGrid(bounds, 5, 1.5);
    for (const p of points) {
      expect(p.z).toBe(1.5);
    }
  });
});

describe('generatePolygonSamples', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('generates samples inside polygon', () => {
    const points = generatePolygonSamples(square, 2);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(pointInPolygon({ x: p.x, y: p.y }, square)).toBe(true);
    }
  });

  it('returns empty array for empty polygon', () => {
    expect(generatePolygonSamples([], 1)).toEqual([]);
  });

  it('sets elevation on points', () => {
    const points = generatePolygonSamples(square, 5, 2.5);
    for (const p of points) {
      expect(p.z).toBe(2.5);
    }
  });
});

describe('generateRectangleSamples', () => {
  it('generates samples in unrotated rectangle', () => {
    const points = generateRectangleSamples({ x: 5, y: 5 }, 10, 10, 0, 5);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(10);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(10);
    }
  });

  it('sets elevation on points', () => {
    const points = generateRectangleSamples({ x: 5, y: 5 }, 10, 10, 0, 5, 3);
    for (const p of points) {
      expect(p.z).toBe(3);
    }
  });

  it('handles rotation', () => {
    const unrotated = generateRectangleSamples({ x: 0, y: 0 }, 10, 10, 0, 2);
    const rotated = generateRectangleSamples({ x: 0, y: 0 }, 10, 10, 45, 2);
    expect(rotated.length).toBe(unrotated.length);
    // Rotated points should be different
    const unrotatedStr = JSON.stringify(unrotated);
    const rotatedStr = JSON.stringify(rotated);
    expect(rotatedStr).not.toBe(unrotatedStr);
  });
});
