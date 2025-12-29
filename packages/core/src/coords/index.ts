/**
 * Coordinate system definitions and transformations
 * 
 * Canonical internal coords: LocalMetersENU anchored at originLatLon
 * ENU = East-North-Up coordinate system
 */

import { GEOMETRY_EPSILON } from '@geonoise/shared';

// ============================================================================
// Coordinate Types
// ============================================================================

/** Latitude/Longitude coordinates (WGS84) */
export interface LatLon {
  lat: number;
  lon: number;
}

/** Local meters ENU (East-North-Up) coordinates relative to origin */
export interface LocalMetersENU {
  x: number; // East (positive = East)
  y: number; // North (positive = North)
  z: number; // Up (positive = Up)
}

/** 2D point in local meters */
export interface Point2D {
  x: number;
  y: number;
}

/** 3D point in local meters */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/** Coordinate origin definition */
export interface CoordinateOrigin {
  latLon: LatLon;
  altitude: number; // meters above sea level
}

/** Bounding box in local coordinates */
export interface BoundingBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Bounding box in geographic coordinates */
export interface GeoBoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Earth radius in meters (WGS84 equatorial) */
export const EARTH_RADIUS_EQUATORIAL = 6378137.0;

/** Earth radius in meters (WGS84 polar) */
export const EARTH_RADIUS_POLAR = 6356752.3;

/** Mean earth radius in meters */
export const EARTH_RADIUS_MEAN = 6371000.0;

/** Degrees to radians conversion factor */
export const DEG_TO_RAD = Math.PI / 180;

/** Radians to degrees conversion factor */
export const RAD_TO_DEG = 180 / Math.PI;

// ============================================================================
// Coordinate Transformation Functions
// ============================================================================

/**
 * Calculate the local earth radius at a given latitude
 */
export function earthRadiusAtLatitude(latDeg: number): number {
  const lat = latDeg * DEG_TO_RAD;
  const a = EARTH_RADIUS_EQUATORIAL;
  const b = EARTH_RADIUS_POLAR;
  
  const cosLat = Math.cos(lat);
  const sinLat = Math.sin(lat);
  
  const num = Math.pow(a * a * cosLat, 2) + Math.pow(b * b * sinLat, 2);
  const denom = Math.pow(a * cosLat, 2) + Math.pow(b * sinLat, 2);
  
  return Math.sqrt(num / denom);
}

/**
 * Calculate meters per degree of longitude at a given latitude
 */
export function metersPerDegreeLon(latDeg: number): number {
  const lat = latDeg * DEG_TO_RAD;
  return (Math.PI / 180) * EARTH_RADIUS_EQUATORIAL * Math.cos(lat);
}

/**
 * Calculate meters per degree of latitude at a given latitude
 */
export function metersPerDegreeLat(latDeg: number): number {
  const lat = latDeg * DEG_TO_RAD;
  // More accurate formula accounting for earth's ellipsoid shape
  return 111132.92 - 559.82 * Math.cos(2 * lat) + 1.175 * Math.cos(4 * lat);
}

/**
 * Create a coordinate transformer for a given origin
 */
export function createCoordinateTransformer(origin: CoordinateOrigin) {
  const mPerDegLon = metersPerDegreeLon(origin.latLon.lat);
  const mPerDegLat = metersPerDegreeLat(origin.latLon.lat);

  return {
    origin,
    mPerDegLon,
    mPerDegLat,

    /**
     * Convert lat/lon to local meters ENU
     */
    latLonToLocalMeters(latLon: LatLon, altitude = 0): LocalMetersENU {
      const dLon = latLon.lon - origin.latLon.lon;
      const dLat = latLon.lat - origin.latLon.lat;

      return {
        x: dLon * mPerDegLon,
        y: dLat * mPerDegLat,
        z: altitude - origin.altitude,
      };
    },

    /**
     * Convert local meters ENU to lat/lon
     */
    localMetersToLatLon(local: LocalMetersENU): LatLon & { altitude: number } {
      return {
        lon: origin.latLon.lon + local.x / mPerDegLon,
        lat: origin.latLon.lat + local.y / mPerDegLat,
        altitude: local.z + origin.altitude,
      };
    },

    /**
     * Convert a geographic bounding box to local coordinates
     */
    geoBoundsToLocalBounds(geo: GeoBoundingBox): BoundingBox2D {
      const sw = this.latLonToLocalMeters({ lat: geo.south, lon: geo.west });
      const ne = this.latLonToLocalMeters({ lat: geo.north, lon: geo.east });

      return {
        minX: sw.x,
        minY: sw.y,
        maxX: ne.x,
        maxY: ne.y,
      };
    },

    /**
     * Convert local bounds to geographic bounding box
     */
    localBoundsToGeoBounds(local: BoundingBox2D): GeoBoundingBox {
      const sw = this.localMetersToLatLon({ x: local.minX, y: local.minY, z: 0 });
      const ne = this.localMetersToLatLon({ x: local.maxX, y: local.maxY, z: 0 });

      return {
        south: sw.lat,
        west: sw.lon,
        north: ne.lat,
        east: ne.lon,
      };
    },
  };
}

export type CoordinateTransformer = ReturnType<typeof createCoordinateTransformer>;

// ============================================================================
// Distance & Geometry Functions
// ============================================================================

/**
 * Calculate Haversine distance between two lat/lon points (in meters)
 */
export function haversineDistance(p1: LatLon, p2: LatLon): number {
  const lat1 = p1.lat * DEG_TO_RAD;
  const lat2 = p2.lat * DEG_TO_RAD;
  const dLat = (p2.lat - p1.lat) * DEG_TO_RAD;
  const dLon = (p2.lon - p1.lon) * DEG_TO_RAD;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MEAN * c;
}

/**
 * Calculate 2D Euclidean distance
 */
export function distance2D(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate 3D Euclidean distance
 */
export function distance3D(p1: Point3D, p2: Point3D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate distance between two LocalMetersENU points
 */
export function distanceENU(p1: LocalMetersENU, p2: LocalMetersENU): number {
  return distance3D(p1, p2);
}

/**
 * Check if two points are approximately equal
 */
export function pointsEqual2D(p1: Point2D, p2: Point2D, epsilon = GEOMETRY_EPSILON): boolean {
  return Math.abs(p1.x - p2.x) < epsilon && Math.abs(p1.y - p2.y) < epsilon;
}

/**
 * Check if two 3D points are approximately equal
 */
export function pointsEqual3D(p1: Point3D, p2: Point3D, epsilon = GEOMETRY_EPSILON): boolean {
  return (
    Math.abs(p1.x - p2.x) < epsilon &&
    Math.abs(p1.y - p2.y) < epsilon &&
    Math.abs(p1.z - p2.z) < epsilon
  );
}

// ============================================================================
// Bounding Box Functions
// ============================================================================

/**
 * Create a bounding box from a set of points
 */
export function boundingBox2DFromPoints(points: Point2D[]): BoundingBox2D | null {
  if (points.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Expand a bounding box by a margin
 */
export function expandBoundingBox(box: BoundingBox2D, margin: number): BoundingBox2D {
  return {
    minX: box.minX - margin,
    minY: box.minY - margin,
    maxX: box.maxX + margin,
    maxY: box.maxY + margin,
  };
}

/**
 * Check if a point is inside a bounding box
 */
export function pointInBoundingBox(point: Point2D, box: BoundingBox2D): boolean {
  return (
    point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY
  );
}

/**
 * Check if two bounding boxes intersect
 */
export function boundingBoxesIntersect(a: BoundingBox2D, b: BoundingBox2D): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

/**
 * Calculate the area of a bounding box
 */
export function boundingBoxArea(box: BoundingBox2D): number {
  return (box.maxX - box.minX) * (box.maxY - box.minY);
}

/**
 * Get the center of a bounding box
 */
export function boundingBoxCenter(box: BoundingBox2D): Point2D {
  return {
    x: (box.minX + box.maxX) / 2,
    y: (box.minY + box.maxY) / 2,
  };
}
