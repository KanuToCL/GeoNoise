/**
 * Unit tests for @geonoise/core coords module
 * Tests coordinate transformations and geometry functions
 */

import { describe, it, expect } from 'vitest';
import {
  EARTH_RADIUS_EQUATORIAL,
  EARTH_RADIUS_POLAR,
  EARTH_RADIUS_MEAN,
  DEG_TO_RAD,
  RAD_TO_DEG,
  earthRadiusAtLatitude,
  metersPerDegreeLon,
  metersPerDegreeLat,
  createCoordinateTransformer,
  haversineDistance,
  distance2D,
  distance3D,
  distanceENU,
  pointsEqual2D,
  pointsEqual3D,
  boundingBox2DFromPoints,
  expandBoundingBox,
  pointInBoundingBox,
  boundingBoxesIntersect,
  boundingBoxArea,
  boundingBoxCenter,
  type LatLon,
  type Point2D,
  type Point3D,
  type BoundingBox2D,
  type CoordinateOrigin,
} from './index.js';

// ============================================================================
// Constants Tests
// ============================================================================

describe('Coordinate constants', () => {
  it('has correct Earth equatorial radius', () => {
    expect(EARTH_RADIUS_EQUATORIAL).toBe(6378137.0);
  });

  it('has correct Earth polar radius', () => {
    expect(EARTH_RADIUS_POLAR).toBe(6356752.3);
  });

  it('has correct Earth mean radius', () => {
    expect(EARTH_RADIUS_MEAN).toBe(6371000.0);
  });

  it('has correct DEG_TO_RAD conversion', () => {
    expect(DEG_TO_RAD).toBeCloseTo(Math.PI / 180, 10);
  });

  it('has correct RAD_TO_DEG conversion', () => {
    expect(RAD_TO_DEG).toBeCloseTo(180 / Math.PI, 10);
  });

  it('DEG_TO_RAD and RAD_TO_DEG are inverses', () => {
    expect(DEG_TO_RAD * RAD_TO_DEG).toBeCloseTo(1, 10);
  });
});

// ============================================================================
// Earth Radius Tests
// ============================================================================

describe('earthRadiusAtLatitude', () => {
  it('returns equatorial radius at equator', () => {
    const r = earthRadiusAtLatitude(0);
    expect(r).toBeCloseTo(EARTH_RADIUS_EQUATORIAL, 0);
  });

  it('returns polar radius at poles', () => {
    const r90 = earthRadiusAtLatitude(90);
    const rMinus90 = earthRadiusAtLatitude(-90);
    expect(r90).toBeCloseTo(EARTH_RADIUS_POLAR, 0);
    expect(rMinus90).toBeCloseTo(EARTH_RADIUS_POLAR, 0);
  });

  it('returns intermediate value at mid-latitudes', () => {
    const r45 = earthRadiusAtLatitude(45);
    expect(r45).toBeGreaterThan(EARTH_RADIUS_POLAR);
    expect(r45).toBeLessThan(EARTH_RADIUS_EQUATORIAL);
  });
});

// ============================================================================
// Meters per Degree Tests
// ============================================================================

describe('metersPerDegreeLon', () => {
  it('returns ~111km at equator', () => {
    const mpdLon = metersPerDegreeLon(0);
    expect(mpdLon).toBeCloseTo(111320, -2); // Within 100m
  });

  it('returns 0 at poles', () => {
    const mpdLon90 = metersPerDegreeLon(90);
    const mpdLonMinus90 = metersPerDegreeLon(-90);
    expect(mpdLon90).toBeCloseTo(0, 0);
    expect(mpdLonMinus90).toBeCloseTo(0, 0);
  });

  it('decreases with latitude', () => {
    const mpdLon0 = metersPerDegreeLon(0);
    const mpdLon45 = metersPerDegreeLon(45);
    const mpdLon60 = metersPerDegreeLon(60);
    expect(mpdLon45).toBeLessThan(mpdLon0);
    expect(mpdLon60).toBeLessThan(mpdLon45);
  });
});

describe('metersPerDegreeLat', () => {
  it('returns ~111km at equator', () => {
    const mpdLat = metersPerDegreeLat(0);
    expect(mpdLat).toBeCloseTo(110574, -2); // Within 100m
  });

  it('is relatively constant with latitude', () => {
    const mpdLat0 = metersPerDegreeLat(0);
    const mpdLat45 = metersPerDegreeLat(45);
    const mpdLat60 = metersPerDegreeLat(60);
    // Should all be within ~1% of each other
    expect(Math.abs(mpdLat45 - mpdLat0) / mpdLat0).toBeLessThan(0.01);
    expect(Math.abs(mpdLat60 - mpdLat0) / mpdLat0).toBeLessThan(0.01);
  });
});

// ============================================================================
// Coordinate Transformer Tests
// ============================================================================

describe('createCoordinateTransformer', () => {
  const origin: CoordinateOrigin = {
    latLon: { lat: 40.7128, lon: -74.006 }, // New York City
    altitude: 10,
  };

  it('creates a transformer with the correct origin', () => {
    const transformer = createCoordinateTransformer(origin);
    expect(transformer.origin).toEqual(origin);
  });

  it('converts origin to (0, 0, 0) in local coords', () => {
    const transformer = createCoordinateTransformer(origin);
    const local = transformer.latLonToLocalMeters(origin.latLon, origin.altitude);
    expect(local.x).toBeCloseTo(0, 5);
    expect(local.y).toBeCloseTo(0, 5);
    expect(local.z).toBeCloseTo(0, 5);
  });

  it('converts point east of origin to positive x', () => {
    const transformer = createCoordinateTransformer(origin);
    const eastPoint: LatLon = { lat: 40.7128, lon: -74.005 }; // 0.001° east
    const local = transformer.latLonToLocalMeters(eastPoint);
    expect(local.x).toBeGreaterThan(0);
    expect(local.y).toBeCloseTo(0, 0);
  });

  it('converts point north of origin to positive y', () => {
    const transformer = createCoordinateTransformer(origin);
    const northPoint: LatLon = { lat: 40.7138, lon: -74.006 }; // 0.001° north
    const local = transformer.latLonToLocalMeters(northPoint);
    expect(local.x).toBeCloseTo(0, 0);
    expect(local.y).toBeGreaterThan(0);
  });

  it('handles altitude correctly', () => {
    const transformer = createCoordinateTransformer(origin);
    const local = transformer.latLonToLocalMeters(origin.latLon, 20);
    expect(local.z).toBeCloseTo(10, 5); // 20 - 10 = 10
  });

  it('round-trips latLon to local and back', () => {
    const transformer = createCoordinateTransformer(origin);
    const testPoint: LatLon = { lat: 40.72, lon: -74.0 };
    const local = transformer.latLonToLocalMeters(testPoint, 15);
    const recovered = transformer.localMetersToLatLon(local);
    expect(recovered.lat).toBeCloseTo(testPoint.lat, 5);
    expect(recovered.lon).toBeCloseTo(testPoint.lon, 5);
    expect(recovered.altitude).toBeCloseTo(15, 5);
  });

  it('converts geographic bounds to local bounds', () => {
    const transformer = createCoordinateTransformer(origin);
    const geoBounds = {
      south: 40.71,
      west: -74.01,
      north: 40.72,
      east: -74.0,
    };
    const localBounds = transformer.geoBoundsToLocalBounds(geoBounds);
    expect(localBounds.minX).toBeLessThan(localBounds.maxX);
    expect(localBounds.minY).toBeLessThan(localBounds.maxY);
  });

  it('converts local bounds to geographic bounds', () => {
    const transformer = createCoordinateTransformer(origin);
    const localBounds: BoundingBox2D = {
      minX: -100,
      minY: -100,
      maxX: 100,
      maxY: 100,
    };
    const geoBounds = transformer.localBoundsToGeoBounds(localBounds);
    expect(geoBounds.south).toBeLessThan(geoBounds.north);
    expect(geoBounds.west).toBeLessThan(geoBounds.east);
  });
});

// ============================================================================
// Distance Functions Tests
// ============================================================================

describe('haversineDistance', () => {
  it('returns 0 for same point', () => {
    const p: LatLon = { lat: 40.7128, lon: -74.006 };
    expect(haversineDistance(p, p)).toBe(0);
  });

  it('calculates distance between NYC and LA (~3940 km)', () => {
    const nyc: LatLon = { lat: 40.7128, lon: -74.006 };
    const la: LatLon = { lat: 34.0522, lon: -118.2437 };
    const dist = haversineDistance(nyc, la);
    expect(dist / 1000).toBeCloseTo(3940, -1); // Within 10 km
  });

  it('calculates distance between London and Paris (~340 km)', () => {
    const london: LatLon = { lat: 51.5074, lon: -0.1278 };
    const paris: LatLon = { lat: 48.8566, lon: 2.3522 };
    const dist = haversineDistance(london, paris);
    expect(dist / 1000).toBeCloseTo(340, -1); // Within 10 km
  });

  it('is symmetric', () => {
    const p1: LatLon = { lat: 40.7128, lon: -74.006 };
    const p2: LatLon = { lat: 34.0522, lon: -118.2437 };
    expect(haversineDistance(p1, p2)).toBeCloseTo(haversineDistance(p2, p1), 5);
  });
});

describe('distance2D', () => {
  it('returns 0 for same point', () => {
    const p: Point2D = { x: 10, y: 20 };
    expect(distance2D(p, p)).toBe(0);
  });

  it('calculates horizontal distance', () => {
    const p1: Point2D = { x: 0, y: 0 };
    const p2: Point2D = { x: 10, y: 0 };
    expect(distance2D(p1, p2)).toBe(10);
  });

  it('calculates vertical distance', () => {
    const p1: Point2D = { x: 0, y: 0 };
    const p2: Point2D = { x: 0, y: 10 };
    expect(distance2D(p1, p2)).toBe(10);
  });

  it('calculates diagonal distance (3-4-5 triangle)', () => {
    const p1: Point2D = { x: 0, y: 0 };
    const p2: Point2D = { x: 3, y: 4 };
    expect(distance2D(p1, p2)).toBe(5);
  });
});

describe('distance3D', () => {
  it('returns 0 for same point', () => {
    const p: Point3D = { x: 10, y: 20, z: 30 };
    expect(distance3D(p, p)).toBe(0);
  });

  it('calculates 3D diagonal distance', () => {
    const p1: Point3D = { x: 0, y: 0, z: 0 };
    const p2: Point3D = { x: 1, y: 2, z: 2 };
    // sqrt(1 + 4 + 4) = 3
    expect(distance3D(p1, p2)).toBe(3);
  });

  it('is symmetric', () => {
    const p1: Point3D = { x: 1, y: 2, z: 3 };
    const p2: Point3D = { x: 4, y: 5, z: 6 };
    expect(distance3D(p1, p2)).toBe(distance3D(p2, p1));
  });
});

describe('distanceENU', () => {
  it('is an alias for distance3D', () => {
    const p1 = { x: 1, y: 2, z: 3 };
    const p2 = { x: 4, y: 5, z: 6 };
    expect(distanceENU(p1, p2)).toBe(distance3D(p1, p2));
  });
});

// ============================================================================
// Point Equality Tests
// ============================================================================

describe('pointsEqual2D', () => {
  it('returns true for identical points', () => {
    const p: Point2D = { x: 10, y: 20 };
    expect(pointsEqual2D(p, p)).toBe(true);
  });

  it('returns true for points within epsilon', () => {
    const p1: Point2D = { x: 10, y: 20 };
    const p2: Point2D = { x: 10.0000001, y: 20.0000001 };
    expect(pointsEqual2D(p1, p2)).toBe(true);
  });

  it('returns false for points outside epsilon', () => {
    const p1: Point2D = { x: 10, y: 20 };
    const p2: Point2D = { x: 11, y: 20 };
    expect(pointsEqual2D(p1, p2)).toBe(false);
  });

  it('respects custom epsilon', () => {
    const p1: Point2D = { x: 10, y: 20 };
    const p2: Point2D = { x: 10.5, y: 20.5 };
    expect(pointsEqual2D(p1, p2, 1)).toBe(true);
    expect(pointsEqual2D(p1, p2, 0.1)).toBe(false);
  });
});

describe('pointsEqual3D', () => {
  it('returns true for identical points', () => {
    const p: Point3D = { x: 10, y: 20, z: 30 };
    expect(pointsEqual3D(p, p)).toBe(true);
  });

  it('returns true for points within epsilon', () => {
    const p1: Point3D = { x: 10, y: 20, z: 30 };
    const p2: Point3D = { x: 10.0000001, y: 20.0000001, z: 30.0000001 };
    expect(pointsEqual3D(p1, p2)).toBe(true);
  });

  it('returns false if any coordinate differs', () => {
    const p1: Point3D = { x: 10, y: 20, z: 30 };
    const p2: Point3D = { x: 10, y: 20, z: 31 };
    expect(pointsEqual3D(p1, p2)).toBe(false);
  });
});

// ============================================================================
// Bounding Box Tests
// ============================================================================

describe('boundingBox2DFromPoints', () => {
  it('returns null for empty array', () => {
    expect(boundingBox2DFromPoints([])).toBeNull();
  });

  it('creates bounding box from single point', () => {
    const points: Point2D[] = [{ x: 10, y: 20 }];
    const bbox = boundingBox2DFromPoints(points);
    expect(bbox).toEqual({ minX: 10, minY: 20, maxX: 10, maxY: 20 });
  });

  it('creates bounding box from multiple points', () => {
    const points: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 15 },
    ];
    const bbox = boundingBox2DFromPoints(points);
    expect(bbox).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 15 });
  });

  it('handles negative coordinates', () => {
    const points: Point2D[] = [
      { x: -10, y: -20 },
      { x: 10, y: 20 },
    ];
    const bbox = boundingBox2DFromPoints(points);
    expect(bbox).toEqual({ minX: -10, minY: -20, maxX: 10, maxY: 20 });
  });
});

describe('expandBoundingBox', () => {
  it('expands bounding box by margin', () => {
    const bbox: BoundingBox2D = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const expanded = expandBoundingBox(bbox, 5);
    expect(expanded).toEqual({ minX: -5, minY: -5, maxX: 15, maxY: 15 });
  });

  it('handles negative margin (shrinking)', () => {
    const bbox: BoundingBox2D = { minX: 0, minY: 0, maxX: 20, maxY: 20 };
    const shrunk = expandBoundingBox(bbox, -5);
    expect(shrunk).toEqual({ minX: 5, minY: 5, maxX: 15, maxY: 15 });
  });
});

describe('pointInBoundingBox', () => {
  const bbox: BoundingBox2D = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  it('returns true for point inside', () => {
    expect(pointInBoundingBox({ x: 5, y: 5 }, bbox)).toBe(true);
  });

  it('returns true for point on edge', () => {
    expect(pointInBoundingBox({ x: 0, y: 5 }, bbox)).toBe(true);
    expect(pointInBoundingBox({ x: 10, y: 10 }, bbox)).toBe(true);
  });

  it('returns false for point outside', () => {
    expect(pointInBoundingBox({ x: -1, y: 5 }, bbox)).toBe(false);
    expect(pointInBoundingBox({ x: 5, y: 11 }, bbox)).toBe(false);
  });
});

describe('boundingBoxesIntersect', () => {
  it('returns true for overlapping boxes', () => {
    const a: BoundingBox2D = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b: BoundingBox2D = { minX: 5, minY: 5, maxX: 15, maxY: 15 };
    expect(boundingBoxesIntersect(a, b)).toBe(true);
  });

  it('returns true for touching boxes', () => {
    const a: BoundingBox2D = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b: BoundingBox2D = { minX: 10, minY: 0, maxX: 20, maxY: 10 };
    expect(boundingBoxesIntersect(a, b)).toBe(true);
  });

  it('returns true for contained box', () => {
    const a: BoundingBox2D = { minX: 0, minY: 0, maxX: 20, maxY: 20 };
    const b: BoundingBox2D = { minX: 5, minY: 5, maxX: 15, maxY: 15 };
    expect(boundingBoxesIntersect(a, b)).toBe(true);
  });

  it('returns false for separate boxes', () => {
    const a: BoundingBox2D = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b: BoundingBox2D = { minX: 20, minY: 20, maxX: 30, maxY: 30 };
    expect(boundingBoxesIntersect(a, b)).toBe(false);
  });

  it('returns false for horizontally separated boxes', () => {
    const a: BoundingBox2D = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b: BoundingBox2D = { minX: 11, minY: 0, maxX: 20, maxY: 10 };
    expect(boundingBoxesIntersect(a, b)).toBe(false);
  });
});

describe('boundingBoxArea', () => {
  it('calculates area correctly', () => {
    const bbox: BoundingBox2D = { minX: 0, minY: 0, maxX: 10, maxY: 5 };
    expect(boundingBoxArea(bbox)).toBe(50);
  });

  it('returns 0 for degenerate box', () => {
    const bbox: BoundingBox2D = { minX: 5, minY: 5, maxX: 5, maxY: 5 };
    expect(boundingBoxArea(bbox)).toBe(0);
  });
});

describe('boundingBoxCenter', () => {
  it('calculates center correctly', () => {
    const bbox: BoundingBox2D = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(boundingBoxCenter(bbox)).toEqual({ x: 5, y: 5 });
  });

  it('handles negative coordinates', () => {
    const bbox: BoundingBox2D = { minX: -10, minY: -10, maxX: 10, maxY: 10 };
    expect(boundingBoxCenter(bbox)).toEqual({ x: 0, y: 0 });
  });
});
