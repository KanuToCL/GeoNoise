/**
 * Probe Worker - Coherent Ray-Tracing Spectral Analysis
 *
 * This worker calculates the 9-band frequency spectrum at a probe position
 * using coherent ray-tracing with phase summation. It traces multiple paths:
 * - Direct path (line of sight)
 * - Ground reflection (two-ray model with phase)
 * - First-order wall/building reflections (image source method)
 * - Barrier diffraction (Maekawa model)
 * - Building diffraction (double-edge over roof + around corners)
 *
 * All paths from a single source are summed coherently (with phase) to capture
 * constructive and destructive interference patterns (e.g., comb filtering
 * from ground reflections). Paths from different sources are summed energetically
 * since independent sources are incoherent.
 *
 * ============================================================================
 * CURRENT CAPABILITIES (as of Jan 7, 2026):
 * ============================================================================
 *
 * ✅ IMPLEMENTED:
 *   - Barrier occlusion: Direct path blocked when intersecting barriers
 *   - Barrier diffraction: Maekawa model for sound bending over barriers
 *   - Building occlusion: Buildings block line-of-sight paths (polygon-based)
 *   - Building diffraction: Double-edge over roof + around corners (per-band)
 *   - Ground reflection: Two-ray model with frequency-dependent phase
 *   - First-order wall reflections: Image source method for building walls
 *   - Coherent summation: Phase-accurate phasor addition within single source
 *   - Atmospheric absorption: Frequency-dependent absorption (simplified ISO 9613-1)
 *   - Multi-source support: Energetic (incoherent) sum across sources
 *
 * ❌ NOT IMPLEMENTED:
 *   - Higher-order reflections: Only first-order (single bounce) supported
 *   - Wall reflections for diffracted paths: Diffracted paths don't spawn reflections
 *   - Terrain effects: Flat ground assumed
 *   - Weather gradients: No refraction modeling
 *
 * ============================================================================
 * PHYSICS MODEL:
 * ============================================================================
 *
 * For each source-receiver pair, we trace:
 *   1. DIRECT PATH: Line-of-sight with barrier AND building blocking check
 *      - If blocked by barrier → try barrier diffraction
 *      - If blocked by building → try building diffraction (roof + corners)
 *      - Attenuation: spherical spreading + atmospheric absorption
 *
 *   2. GROUND REFLECTION: Two-ray interference model
 *      - Reflects off ground plane at z=0
 *      - Phase shift depends on ground impedance (hard/soft/mixed)
 *      - Creates comb filtering at certain frequencies
 *      - Also blocked by buildings in the path
 *
 *   3. WALL REFLECTIONS: Image source method
 *      - Mirror source position across each building wall
 *      - Trace path from image source to receiver via wall
 *      - 10% absorption per reflection (0.9 coefficient)
 *      - Paths blocked by OTHER buildings are invalid
 *
 *   4. BARRIER DIFFRACTION: Maekawa approximation (thin screen)
 *      - Only computed when direct path is blocked by barrier
 *      - Path difference → Fresnel number → insertion loss
 *      - Coefficient: 20 (single-edge)
 *      - Max 25 dB attenuation
 *
 *   5. BUILDING DIFFRACTION: Double-edge Maekawa (thick obstacle)
 *      - Computed when direct path is blocked by building
 *      - Over-roof path: S → Edge1 → Edge2 → R (double diffraction)
 *      - Around-corner paths: S → Corner → R (single diffraction)
 *      - Coefficient: 40 for roof (double-edge), 20 for corners (single-edge)
 *      - Per-band frequency dependence: low freq diffracts easily
 *      - All valid paths summed coherently with phase
 *
 * All paths are converted to phasors (pressure + phase) and summed coherently:
 *   p_total = |Σ p_i * e^(j*φ_i)|
 *
 * This captures constructive/destructive interference patterns.
 *
 * Different sources are summed energetically (incoherent) since they are
 * physically independent:
 *   L_total = 10*log10(Σ 10^(L_i/10))
 *
 * Enhanced from simple spherical spreading (Jan 2026) to full coherent model.
 * Added building occlusion and diffraction (Jan 7, 2026).
 */

import type { ProbeRequest, ProbeResult } from '@geonoise/engine';

// ============================================================================
// Constants
// ============================================================================

const OCTAVE_BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
const OCTAVE_BAND_COUNT = 9;
const MIN_LEVEL = -100;
const SPEED_OF_SOUND = 343;
const P_REF = 2e-5; // Pa - reference pressure
const EPSILON = 1e-10;

// ============================================================================
// Types
// ============================================================================

interface Point2D { x: number; y: number }
interface Point3D { x: number; y: number; z: number }

interface Segment2D {
  p1: Point2D;
  p2: Point2D;
}

interface WallSegment extends Segment2D {
  height: number;
  type: 'barrier' | 'building';
  id: string;
}

interface Phasor {
  pressure: number;  // Pa (linear)
  phase: number;     // radians
}

interface RayPath {
  type: 'direct' | 'ground' | 'wall' | 'diffracted';
  totalDistance: number;
  directDistance: number;
  pathDifference: number;
  reflectionPhaseChange: number;
  absorptionFactor: number;
  valid: boolean;
}

type Spectrum9 = [number, number, number, number, number, number, number, number, number];

// ============================================================================
// Configuration
// ============================================================================

type BarrierSideDiffractionMode = 'off' | 'auto' | 'on';
type AtmosphericAbsorptionModel = 'none' | 'simple' | 'iso9613';

interface ProbeConfig {
  groundReflection: boolean;
  groundType: 'hard' | 'soft' | 'mixed';
  groundMixedFactor: number;
  wallReflections: boolean;
  barrierDiffraction: boolean;
  barrierSideDiffraction: BarrierSideDiffractionMode;
  coherentSummation: boolean;
  atmosphericAbsorption: AtmosphericAbsorptionModel;
  temperature: number;
  humidity: number;
  pressure: number;
  speedOfSound: number;
}

const DEFAULT_CONFIG: ProbeConfig = {
  groundReflection: true,
  groundType: 'mixed',
  groundMixedFactor: 0.5,
  wallReflections: true,
  barrierDiffraction: true,
  barrierSideDiffraction: 'auto',
  coherentSummation: true,
  atmosphericAbsorption: 'simple',
  temperature: 20,
  humidity: 50,
  pressure: 101.325,
  speedOfSound: SPEED_OF_SOUND,
};

// ============================================================================
// Pressure/dB Conversion
// ============================================================================

function dBToPressure(dB: number): number {
  if (!Number.isFinite(dB) || dB < -200) return 1e-12;
  return P_REF * Math.pow(10, dB / 20);
}

function pressureTodB(pressure: number): number {
  if (!Number.isFinite(pressure) || pressure <= 0) return -200;
  return 20 * Math.log10(pressure / P_REF);
}

// ============================================================================
// Geometry Utilities
// ============================================================================

function distance2D(a: Point2D, b: Point2D): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function distance3D(a: Point3D, b: Point3D): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2);
}

function cross2D(a: Point2D, b: Point2D): number {
  return a.x * b.y - a.y * b.x;
}

function segmentIntersection(
  p1: Point2D, p2: Point2D,
  q1: Point2D, q2: Point2D
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

function mirrorPoint2D(point: Point2D, segment: Segment2D): Point2D {
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

function isPathBlocked(
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
// Building Occlusion (Polygon-Based)
// ============================================================================
//
// IMPLEMENTATION NOTES (Jan 7, 2026):
//
// Buildings block sound paths using polygon-based intersection detection.
// Unlike barriers (thin screens), buildings are THICK obstacles that require:
//
// 1. Polygon intersection test (not just line-segment intersection)
// 2. 3D height awareness (paths that clear the roof are not blocked)
// 3. Separate entry/exit points for diffraction calculations
//
// The approach:
//   - For each source→receiver path, check if it crosses any building footprint
//   - If it crosses AND the path height < building height, the path is BLOCKED
//   - When blocked, compute diffraction paths (over roof + around corners)
//   - All diffraction paths are summed coherently with proper phase
//
// This is more expensive than barrier checking but provides physically accurate
// results for building occlusion.
// ============================================================================

/**
 * Building footprint data structure for occlusion and diffraction calculations.
 *
 * Contains the 2D polygon representing the building footprint, plus height
 * information for 3D occlusion checks.
 */
interface BuildingFootprint {
  id: string;
  vertices: Point2D[];
  height: number;
  groundElevation: number;
}

/**
 * Result of building occlusion check with intersection details.
 *
 * When a path is blocked, we store the entry/exit points on the building
 * footprint for use in diffraction calculations (the diffraction points
 * are placed at roof height above these 2D intersection points).
 */
interface BuildingOcclusionResult {
  blocked: boolean;
  building: BuildingFootprint | null;
  entryPoint: Point2D | null;
  exitPoint: Point2D | null;
}

/**
 * Building diffraction path geometry.
 *
 * Represents a path that diffracts around or over a building:
 * - 'roof': Over-the-top path with TWO diffraction points (double-edge)
 * - 'corner-left'/'corner-right': Around-corner with ONE diffraction point (single-edge)
 *
 * The `diffractionPoints` count determines which Maekawa coefficient to use:
 * - 2 points (roof): coefficient 40, max 25 dB loss
 * - 1 point (corner): coefficient 20, max 20 dB loss
 */
interface BuildingDiffractionPath {
  type: 'roof' | 'corner-left' | 'corner-right';
  waypoints: Point3D[];
  totalDistance: number;
  pathDifference: number;
  valid: boolean;
  diffractionPoints: number;  // 1 for corner, 2 for roof
}

/**
 * Point-in-polygon test using ray casting algorithm.
 *
 * Casts a ray from the point to infinity (positive X direction)
 * and counts how many polygon edges it crosses. Odd count = inside.
 *
 * This is the standard ray casting algorithm with O(n) complexity
 * where n = number of polygon vertices.
 *
 * @param point - The 2D point to test
 * @param vertices - The polygon vertices (closed loop implied)
 * @returns true if point is inside the polygon
 */
function pointInPolygon(point: Point2D, vertices: Point2D[]): boolean {
  let inside = false;
  const n = vertices.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;

    // Check if ray from point crosses this edge
    const intersects = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a line segment intersects with a polygon (crosses any edge or endpoints inside).
 */
function segmentIntersectsPolygon(
  from: Point2D,
  to: Point2D,
  vertices: Point2D[]
): { intersects: boolean; entryPoint: Point2D | null; exitPoint: Point2D | null } {
  const intersectionPoints: { point: Point2D; t: number }[] = [];
  const n = vertices.length;

  // Check intersection with each polygon edge
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const intersection = segmentIntersection(from, to, vertices[i], vertices[j]);
    if (intersection) {
      // Calculate parameter t along the from→to segment
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > EPSILON) {
        const t = ((intersection.x - from.x) * dx + (intersection.y - from.y) * dy) / (len * len);
        if (t > EPSILON && t < 1 - EPSILON) {
          intersectionPoints.push({ point: intersection, t });
        }
      }
    }
  }

  // Check if either endpoint is inside polygon
  const fromInside = pointInPolygon(from, vertices);
  const toInside = pointInPolygon(to, vertices);

  if (fromInside || toInside || intersectionPoints.length > 0) {
    // Sort intersections by parameter t
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

/**
 * Calculate the height of a path at a given point along its length.
 * Assumes linear interpolation between source and receiver heights.
 */
function pathHeightAtPoint(
  from: Point3D,
  to: Point3D,
  point: Point2D
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.sqrt(dx * dx + dy * dy);

  if (d < EPSILON) return Math.min(from.z, to.z);

  // Calculate parameter t along the path
  const t = ((point.x - from.x) * dx + (point.y - from.y) * dy) / (d * d);
  const tClamped = Math.max(0, Math.min(1, t));

  return from.z + tClamped * (to.z - from.z);
}

/**
 * Extract building footprints from wall segments.
 */
function extractBuildingFootprints(walls: ProbeRequest['walls']): BuildingFootprint[] {
  const buildings: BuildingFootprint[] = [];

  for (const wall of walls) {
    if (wall.type === 'building' && wall.vertices.length >= 3) {
      buildings.push({
        id: wall.id,
        vertices: wall.vertices,
        height: wall.height,
        groundElevation: 0,
      });
    }
  }

  return buildings;
}

/**
 * Check if a 3D path is blocked by any building, with height consideration.
 *
 * A path is blocked if:
 * 1. The 2D projection crosses the building footprint
 * 2. The path height at the intersection points is below the building top
 *
 * Returns ALL blocking buildings, not just the first one.
 */
function findAllBlockingBuildings(
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

      // Check height at entry and exit points
      const heightAtEntry = pathHeightAtPoint(from, to, result.entryPoint);
      const heightAtExit = pathHeightAtPoint(from, to, result.exitPoint);

      // Path is blocked if it's below building top at any intersection point
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
 * Legacy function - returns first blocking building only.
 * Kept for backwards compatibility with existing code.
 */
function findBlockingBuilding(
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
 *
 * A corner is "visible" if:
 * 1. The line from the point to the corner doesn't cross the building interior
 * 2. The corner is on the "correct side" to form a valid diffraction path
 */
function findVisibleCorners(
  point: Point2D,
  building: BuildingFootprint
): Point2D[] {
  const visibleCorners: Point2D[] = [];

  for (const corner of building.vertices) {
    // Check if line from point to corner intersects building (excluding the corner itself)
    let blocked = false;
    const n = building.vertices.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const v1 = building.vertices[i];
      const v2 = building.vertices[j];

      // Skip edges that contain this corner
      if ((Math.abs(v1.x - corner.x) < EPSILON && Math.abs(v1.y - corner.y) < EPSILON) ||
          (Math.abs(v2.x - corner.x) < EPSILON && Math.abs(v2.y - corner.y) < EPSILON)) {
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

/**
 * Compute diffraction paths around/over a building.
 *
 * Returns all valid diffraction paths:
 * 1. Over-roof path (double-edge diffraction)
 * 2. Around-corner paths (single-edge diffraction for each visible corner pair)
 */
function traceBuildingDiffractionPaths(
  source: Point3D,
  receiver: Point3D,
  building: BuildingFootprint,
  entryPoint: Point2D,
  exitPoint: Point2D
): BuildingDiffractionPath[] {
  const paths: BuildingDiffractionPath[] = [];
  const buildingTop = building.groundElevation + building.height;
  const directDist = distance3D(source, receiver);

  // 1. Over-roof diffraction (double-edge)
  // Path: Source → entry edge (at roof height) → exit edge (at roof height) → Receiver
  const roofEntry: Point3D = { x: entryPoint.x, y: entryPoint.y, z: buildingTop };
  const roofExit: Point3D = { x: exitPoint.x, y: exitPoint.y, z: buildingTop };

  const roofDist = distance3D(source, roofEntry) +
                   distance3D(roofEntry, roofExit) +
                   distance3D(roofExit, receiver);

  paths.push({
    type: 'roof',
    waypoints: [source, roofEntry, roofExit, receiver],
    totalDistance: roofDist,
    pathDifference: roofDist - directDist,
    valid: true,
    diffractionPoints: 2,
  });

  // 2. Around-corner diffraction (horizontal)
  // Find corners visible from both source and receiver
  const s2d = { x: source.x, y: source.y };
  const r2d = { x: receiver.x, y: receiver.y };

  const visibleFromSource = findVisibleCorners(s2d, building);
  const visibleFromReceiver = findVisibleCorners(r2d, building);

  // Find corners visible from both sides
  for (const corner of visibleFromSource) {
    const isVisibleFromReceiver = visibleFromReceiver.some(
      c => Math.abs(c.x - corner.x) < EPSILON && Math.abs(c.y - corner.y) < EPSILON
    );

    if (isVisibleFromReceiver) {
      // Check that the corner path doesn't go through the building
      const cornerResult1 = segmentIntersectsPolygon(s2d, corner, building.vertices);
      const cornerResult2 = segmentIntersectsPolygon(corner, r2d, building.vertices);

      // Path is valid if neither leg crosses the building interior
      // (touching the corner is okay)
      // Note: entryPoint can be null even when intersects is true in edge cases
      const leg1Valid = !cornerResult1.intersects ||
        (cornerResult1.entryPoint !== null && distance2D(cornerResult1.entryPoint, corner) < EPSILON);
      const leg2Valid = !cornerResult2.intersects ||
        (cornerResult2.entryPoint !== null && distance2D(cornerResult2.entryPoint, corner) < EPSILON);

      if (leg1Valid && leg2Valid) {
        // Corner diffraction happens at ground level or source/receiver height
        const cornerZ = Math.min(source.z, receiver.z, buildingTop);
        const corner3D: Point3D = { x: corner.x, y: corner.y, z: cornerZ };

        const cornerDist = distance3D(source, corner3D) + distance3D(corner3D, receiver);

        // Determine left or right based on cross product
        const toCorner = { x: corner.x - s2d.x, y: corner.y - s2d.y };
        const toReceiver = { x: r2d.x - s2d.x, y: r2d.y - s2d.y };
        const crossProd = cross2D(toReceiver, toCorner);

        paths.push({
          type: crossProd > 0 ? 'corner-left' : 'corner-right',
          waypoints: [source, corner3D, receiver],
          totalDistance: cornerDist,
          pathDifference: cornerDist - directDist,
          valid: true,
          diffractionPoints: 1,
        });
      }
    }
  }

  return paths;
}

/**
 * Double-edge diffraction attenuation (for building roofs).
 *
 * Uses modified Maekawa formula with coefficient 40 instead of 20
 * to account for diffraction at both entry and exit edges.
 *
 * Physics:
 * - N = 2δf/c (Fresnel number, frequency-dependent)
 * - A_bar = 10·log₁₀(3 + 40·N) for double-edge
 * - Low frequencies diffract easily (small N, small loss)
 * - High frequencies are heavily attenuated (large N, large loss)
 */
function doubleEdgeDiffraction(
  pathDiff: number,
  frequency: number,
  c: number
): number {
  const lambda = c / frequency;
  const N = (2 * pathDiff) / lambda;
  if (N < -0.1) return 0;
  const atten = 10 * Math.log10(3 + 40 * N);  // Coefficient 40 for double-edge
  return Math.min(Math.max(atten, 0), 25);    // Cap at 25 dB
}

/**
 * Single-edge diffraction attenuation (for building corners).
 *
 * Standard Maekawa formula with coefficient 20.
 */
function singleEdgeDiffraction(
  pathDiff: number,
  frequency: number,
  c: number
): number {
  const lambda = c / frequency;
  const N = (2 * pathDiff) / lambda;
  if (N < -0.1) return 0;
  const atten = 10 * Math.log10(3 + 20 * N);  // Coefficient 20 for single-edge
  return Math.min(Math.max(atten, 0), 20);    // Cap at 20 dB
}

// ============================================================================
// Attenuation Calculations
// ============================================================================

function spreadingLoss(distance: number): number {
  const d = Math.max(distance, 0.1);
  return 20 * Math.log10(d) + 11;
}

function atmosphericAbsorptionCoeff(
  frequency: number,
  temp: number,
  humidity: number,
  pressure: number,
  model: AtmosphericAbsorptionModel
): number {
  if (model === 'none') return 0;

  if (model === 'iso9613') {
    // Full ISO 9613-1 implementation
    return atmosphericAbsorptionISO9613(frequency, temp, humidity, pressure);
  }

  // 'simple' model: Lookup table with linear corrections
  // Simplified atmospheric absorption based on ISO 9613-1
  // Returns absorption coefficient in dB per meter
  //
  // This uses a polynomial approximation that's accurate for typical outdoor conditions
  // (temperature 10-30°C, humidity 30-90%, frequencies 63-8000 Hz)

  // Temperature correction factor (absorption increases with temperature)
  const tempFactor = 1 + 0.01 * (temp - 20);

  // Humidity correction (lower humidity = higher absorption at high frequencies)
  const humidityFactor = 1 + 0.005 * (50 - humidity);

  // Frequency-dependent base absorption coefficients (dB/m at 20°C, 50% RH)
  // Values derived from ISO 9613-1 tables for standard atmospheric conditions
  let baseAlpha: number;

  if (frequency <= 63) {
    baseAlpha = 0.0001;
  } else if (frequency <= 125) {
    baseAlpha = 0.0003;
  } else if (frequency <= 250) {
    baseAlpha = 0.001;
  } else if (frequency <= 500) {
    baseAlpha = 0.002;
  } else if (frequency <= 1000) {
    baseAlpha = 0.004;
  } else if (frequency <= 2000) {
    baseAlpha = 0.008;
  } else if (frequency <= 4000) {
    baseAlpha = 0.02;
  } else if (frequency <= 8000) {
    baseAlpha = 0.06;
  } else {
    // 16000 Hz and above
    baseAlpha = 0.2;
  }

  return Math.max(baseAlpha * tempFactor * humidityFactor, 0);
}

/**
 * ISO 9613-1 atmospheric absorption coefficient.
 *
 * Calculates the atmospheric absorption coefficient in dB/m based on:
 * - Frequency (Hz)
 * - Temperature (°C)
 * - Relative humidity (%)
 * - Atmospheric pressure (kPa)
 *
 * This is the full physical model accounting for:
 * - Molecular relaxation of oxygen (O₂)
 * - Molecular relaxation of nitrogen (N₂)
 * - Classical absorption
 */
function atmosphericAbsorptionISO9613(
  frequencyHz: number,
  temperatureC: number,
  relativeHumidity: number,
  pressureKPa: number
): number {
  const T = temperatureC + 273.15; // Kelvin
  const T0 = 293.15; // Reference temperature (20°C)
  const T01 = 273.16; // Triple point of water
  const ps0 = 101.325; // Reference pressure (kPa)

  const ps = pressureKPa;
  const f = frequencyHz;

  // Molar concentration of water vapor
  const C = -6.8346 * Math.pow(T01 / T, 1.261) + 4.6151;
  const psat = ps0 * Math.pow(10, C);
  const h = relativeHumidity * psat / ps;

  // Oxygen relaxation frequency
  const frO = (ps / ps0) * (24 + 4.04e4 * h * ((0.02 + h) / (0.391 + h)));

  // Nitrogen relaxation frequency
  const frN = (ps / ps0) * Math.pow(T / T0, -0.5) * (9 + 280 * h * Math.exp(-4.17 * (Math.pow(T / T0, -1 / 3) - 1)));

  // Absorption coefficient (dB/m)
  const alpha =
    8.686 *
    f *
    f *
    ((1.84e-11 * Math.pow(ps / ps0, -1) * Math.pow(T / T0, 0.5)) +
      Math.pow(T / T0, -2.5) *
        (0.01275 * Math.exp(-2239.1 / T) * (frO / (frO * frO + f * f)) +
          0.1068 * Math.exp(-3352 / T) * (frN / (frN * frN + f * f))));

  return alpha;
}

function maekawaDiffraction(pathDiff: number, frequency: number, c: number): number {
  const lambda = c / frequency;
  const N = (2 * pathDiff) / lambda;
  if (N < -0.1) return 0;
  const atten = 10 * Math.log10(3 + 20 * N);
  return Math.min(Math.max(atten, 0), 25);
}

// ============================================================================
// Barrier Side Diffraction
// ============================================================================
//
// When barriers have finite length, sound can diffract around the ends
// (horizontal diffraction) as well as over the top (vertical diffraction).
//
// Physics:
// - ISO 9613-2 assumes barriers are effectively infinite in length
// - In reality, short barriers provide less attenuation due to side paths
// - The minimum-loss path (loudest) dominates the result
//
// The side diffraction uses the same Maekawa formula but with the
// path difference computed in the horizontal plane.
// ============================================================================

/**
 * Result of barrier diffraction calculation with all path options.
 */
interface BarrierDiffractionResult {
  /** Over-top diffraction path */
  topPath: RayPath | null;
  /** Around-left-edge diffraction path */
  leftPath: RayPath | null;
  /** Around-right-edge diffraction path */
  rightPath: RayPath | null;
}

/**
 * Compute the total length of a barrier from its vertices.
 */
function computeBarrierLength(barrier: WallSegment): number {
  return distance2D(barrier.p1, barrier.p2);
}

/**
 * Determine if side diffraction should be computed for this barrier.
 *
 * @param barrier - The barrier segment
 * @param mode - 'off' | 'auto' | 'on'
 * @param lengthThreshold - Length threshold for 'auto' mode (default 50m)
 */
function shouldUseSideDiffraction(
  barrier: WallSegment,
  mode: BarrierSideDiffractionMode,
  lengthThreshold = 50
): boolean {
  if (mode === 'off') return false;
  if (mode === 'on') return true;

  // 'auto' mode: enable for barriers shorter than threshold
  const barrierLength = computeBarrierLength(barrier);
  return barrierLength < lengthThreshold;
}

/**
 * Compute the path difference for diffraction around a barrier edge (horizontal).
 *
 * The path goes: Source → Edge → Receiver
 * Path difference: |S→Edge| + |Edge→R| - |S→R|
 *
 * @param source - Source position (3D, but we use 2D for horizontal diffraction)
 * @param receiver - Receiver position (3D)
 * @param edgePoint - The barrier edge point (2D, at ground level)
 * @param edgeHeight - Height of the barrier edge
 */
function computeSidePathDifference(
  source: Point3D,
  receiver: Point3D,
  edgePoint: Point2D,
  edgeHeight: number
): { pathDiff: number; totalDistance: number; edge3D: Point3D } {
  // Edge point is at the barrier height
  const edge3D: Point3D = {
    x: edgePoint.x,
    y: edgePoint.y,
    z: Math.min(edgeHeight, Math.max(source.z, receiver.z)),
  };

  const pathA = distance3D(source, edge3D);
  const pathB = distance3D(edge3D, receiver);
  const totalDistance = pathA + pathB;
  const directDistance = distance3D(source, receiver);

  return {
    pathDiff: totalDistance - directDistance,
    totalDistance,
    edge3D,
  };
}

/**
 * Trace all diffraction paths around/over a barrier.
 *
 * Returns paths for:
 * 1. Over-top diffraction (standard Maekawa)
 * 2. Around-left-edge diffraction (if side diffraction enabled)
 * 3. Around-right-edge diffraction (if side diffraction enabled)
 *
 * The caller should sum these paths coherently and/or take the minimum loss.
 */
function traceBarrierDiffractionPaths(
  source: Point3D,
  receiver: Point3D,
  barrier: WallSegment,
  config: ProbeConfig
): BarrierDiffractionResult {
  const result: BarrierDiffractionResult = {
    topPath: null,
    leftPath: null,
    rightPath: null,
  };

  const s2d = { x: source.x, y: source.y };
  const r2d = { x: receiver.x, y: receiver.y };
  const directDist = distance3D(source, receiver);

  // 1. Over-top diffraction (always computed)
  const intersection = segmentIntersection(s2d, r2d, barrier.p1, barrier.p2);
  if (intersection) {
    const diffPoint: Point3D = { x: intersection.x, y: intersection.y, z: barrier.height };
    const pathA = distance3D(source, diffPoint);
    const pathB = distance3D(diffPoint, receiver);
    const totalDist = pathA + pathB;

    result.topPath = {
      type: 'diffracted',
      totalDistance: totalDist,
      directDistance: directDist,
      pathDifference: totalDist - directDist,
      reflectionPhaseChange: -Math.PI / 4,
      absorptionFactor: 1,
      valid: true,
    };
  }

  // 2. Side diffraction (if enabled)
  const useSideDiffraction = shouldUseSideDiffraction(barrier, config.barrierSideDiffraction);

  if (useSideDiffraction) {
    // Left edge (p1)
    const leftResult = computeSidePathDifference(source, receiver, barrier.p1, barrier.height);
    result.leftPath = {
      type: 'diffracted',
      totalDistance: leftResult.totalDistance,
      directDistance: directDist,
      pathDifference: leftResult.pathDiff,
      reflectionPhaseChange: -Math.PI / 4,
      absorptionFactor: 1,
      valid: leftResult.pathDiff >= 0, // Valid if path is longer than direct
    };

    // Right edge (p2)
    const rightResult = computeSidePathDifference(source, receiver, barrier.p2, barrier.height);
    result.rightPath = {
      type: 'diffracted',
      totalDistance: rightResult.totalDistance,
      directDistance: directDist,
      pathDifference: rightResult.pathDiff,
      reflectionPhaseChange: -Math.PI / 4,
      absorptionFactor: 1,
      valid: rightResult.pathDiff >= 0,
    };
  }

  return result;
}

// ============================================================================
// Ground Reflection Coefficients
// ============================================================================

/**
 * Get ground reflection coefficient (complex) based on ground type.
 *
 * The reflection coefficient Γ determines how much energy is reflected
 * and what phase shift occurs at the ground surface.
 *
 * Physics:
 * - Hard ground (concrete, asphalt): High reflection, minimal phase shift
 * - Soft ground (grass, soil): Lower reflection, ~180° phase shift
 * - Mixed: Interpolation between hard and soft
 *
 * Based on empirical measurements and Delany-Bazley model simplifications.
 */
interface GroundReflectionCoeff {
  magnitude: number;  // |Γ| - amplitude reflection coefficient (0 to 1)
  phase: number;      // arg(Γ) - phase shift in radians
}

function getGroundReflectionCoeff(
  groundType: 'hard' | 'soft' | 'mixed',
  mixedFactor: number,
  frequency: number
): GroundReflectionCoeff {
  // Frequency-dependent absorption (higher frequencies absorbed more by soft ground)
  const freqFactor = Math.min(frequency / 1000, 2); // Normalized, caps at 2kHz behavior

  if (groundType === 'hard') {
    // Hard ground: ~95% reflection, minimal phase shift
    // Slight frequency dependence (higher freq slightly more absorbed)
    return {
      magnitude: 0.95 - 0.02 * freqFactor,
      phase: 0,
    };
  } else if (groundType === 'soft') {
    // Soft ground: ~60-80% reflection depending on frequency
    // Phase shift approaches π (180°) - inverts the wave
    // Lower frequencies penetrate more, higher frequencies reflect more
    return {
      magnitude: 0.6 + 0.1 * (1 - freqFactor / 2),
      phase: Math.PI * (0.8 + 0.15 * freqFactor / 2), // ~0.8π to ~0.95π
    };
  } else {
    // Mixed ground: interpolate based on mixedFactor (0 = hard, 1 = soft)
    const hard = getGroundReflectionCoeff('hard', 0, frequency);
    const soft = getGroundReflectionCoeff('soft', 0, frequency);
    return {
      magnitude: hard.magnitude * (1 - mixedFactor) + soft.magnitude * mixedFactor,
      phase: hard.phase * (1 - mixedFactor) + soft.phase * mixedFactor,
    };
  }
}

/**
 * Calculate the ground-reflected path geometry using the image source method.
 *
 * The ground reflection is modeled by placing a virtual "image source" below
 * the ground plane (mirror of the real source across z=0). The reflected path
 * goes from source → ground reflection point → receiver, which equals the
 * straight-line distance from image source to receiver.
 *
 * @param d - Horizontal distance between source and receiver (2D)
 * @param hs - Source height above ground
 * @param hr - Receiver height above ground
 * @returns Object with direct distance r1 and reflected distance r2
 */
function calculateGroundReflectionGeometry(
  d: number,
  hs: number,
  hr: number
): { r1: number; r2: number; reflectionPointX: number } {
  // r1 = direct path distance
  const r1 = Math.sqrt(d * d + (hs - hr) ** 2);

  // r2 = reflected path distance (via image source at -hs)
  // This equals: source→ground + ground→receiver = sqrt(d² + (hs+hr)²)
  const r2 = Math.sqrt(d * d + (hs + hr) ** 2);

  // Reflection point location along the ground (for visualization)
  // Using similar triangles: x/hs = (d-x)/hr → x = d*hs/(hs+hr)
  const reflectionPointX = (d * hs) / (hs + hr);

  return { r1, r2, reflectionPointX };
}

// ============================================================================
// Wall Segment Extraction
// ============================================================================

function extractWallSegments(walls: ProbeRequest['walls']): WallSegment[] {
  const segments: WallSegment[] = [];

  for (const wall of walls) {
    const verts = wall.vertices;
    if (wall.type === 'barrier') {
      for (let i = 0; i < verts.length - 1; i++) {
        segments.push({
          p1: verts[i],
          p2: verts[i + 1],
          height: wall.height,
          type: 'barrier',
          id: wall.id,
        });
      }
    } else {
      for (let i = 0; i < verts.length; i++) {
        segments.push({
          p1: verts[i],
          p2: verts[(i + 1) % verts.length],
          height: wall.height,
          type: 'building',
          id: wall.id,
        });
      }
    }
  }

  return segments;
}

// ============================================================================
// Path Tracing
// ============================================================================

function traceDirectPath(
  source: Point3D,
  receiver: Point3D,
  barriers: WallSegment[]
): RayPath {
  const s2d = { x: source.x, y: source.y };
  const r2d = { x: receiver.x, y: receiver.y };
  const dist = distance3D(source, receiver);
  const blocked = isPathBlocked(s2d, r2d, barriers);

  return {
    type: 'direct',
    totalDistance: dist,
    directDistance: dist,
    pathDifference: 0,
    reflectionPhaseChange: 0,
    absorptionFactor: 1,
    valid: !blocked,
  };
}

function traceWallReflectionPaths(
  source: Point3D,
  receiver: Point3D,
  segments: WallSegment[],
  barriers: WallSegment[],
  buildings: BuildingFootprint[]
): RayPath[] {
  const paths: RayPath[] = [];
  const buildingSegments = segments.filter(s => s.type === 'building');

  for (const segment of buildingSegments) {
    const imagePos2D = mirrorPoint2D({ x: source.x, y: source.y }, segment);
    const r2d = { x: receiver.x, y: receiver.y };

    const reflPoint = segmentIntersection(r2d, imagePos2D, segment.p1, segment.p2);
    if (!reflPoint) continue;

    const segLen = distance2D(segment.p1, segment.p2);
    const d1 = distance2D(reflPoint, segment.p1);
    const d2 = distance2D(reflPoint, segment.p2);
    if (d1 > segLen + EPSILON || d2 > segLen + EPSILON) continue;

    const reflPoint3D: Point3D = {
      x: reflPoint.x,
      y: reflPoint.y,
      z: Math.min(segment.height, Math.max(source.z, receiver.z)),
    };

    const s2d = { x: source.x, y: source.y };

    // Check barrier blocking (existing)
    const blockedByBarrierA = isPathBlocked(s2d, reflPoint, barriers, segment.id);
    const blockedByBarrierB = isPathBlocked(reflPoint, r2d, barriers, segment.id);

    if (blockedByBarrierA || blockedByBarrierB) continue;

    // Check building blocking for BOTH legs of the reflection path
    // Exclude the building that owns this wall segment from the check
    const otherBuildings = buildings.filter(b => b.id !== segment.id);

    // Leg 1: Source → Reflection point
    const leg1Block = findBlockingBuilding(source, reflPoint3D, otherBuildings);

    // Leg 2: Reflection point → Receiver
    const leg2Block = findBlockingBuilding(reflPoint3D, receiver, otherBuildings);

    // Also check if the reflection path is blocked by the SAME building
    // (i.e., the path from source to reflection point or reflection point to receiver
    // goes through the building's interior)
    const sameBuilding = buildings.find(b => b.id === segment.id);
    let blockedBySameBuilding = false;
    if (sameBuilding) {
      // Check if source→reflPoint goes through the building
      const srcToRefl = findBlockingBuilding(source, reflPoint3D, [sameBuilding]);
      // Check if reflPoint→receiver goes through the building
      const reflToRecv = findBlockingBuilding(reflPoint3D, receiver, [sameBuilding]);
      blockedBySameBuilding = srcToRefl.blocked || reflToRecv.blocked;
    }

    if (leg1Block.blocked || leg2Block.blocked || blockedBySameBuilding) continue;

    const pathA = distance3D(source, reflPoint3D);
    const pathB = distance3D(reflPoint3D, receiver);
    const totalDist = pathA + pathB;
    const directDist = distance3D(source, receiver);

    paths.push({
      type: 'wall',
      totalDistance: totalDist,
      directDistance: directDist,
      pathDifference: totalDist - directDist,
      reflectionPhaseChange: 0,
      absorptionFactor: 0.9,
      valid: reflPoint3D.z <= segment.height,
    });
  }

  return paths;
}

// ============================================================================
// Coherent Spectral Computation
// ============================================================================

function applyGainToSpectrum(spectrum: number[], gain: number): number[] {
  return spectrum.map(level => level <= MIN_LEVEL ? MIN_LEVEL : level + gain);
}

interface SourcePhasorResult {
  spectrum: Spectrum9;
  pathTypes: Set<string>;
}

function computeSourceCoherent(
  source: ProbeRequest['sources'][0],
  probePos: Point3D,
  segments: WallSegment[],
  barriers: WallSegment[],
  buildings: BuildingFootprint[],
  config: ProbeConfig
): SourcePhasorResult {
  const spectrum = applyGainToSpectrum(
    source.spectrum as number[],
    source.gain ?? 0
  );
  const pathTypes = new Set<string>();
  const c = config.speedOfSound;

  const srcPos: Point3D = source.position;

  // Trace direct path (barrier blocking)
  const directPath = traceDirectPath(srcPos, probePos, barriers);

  // Check building occlusion (polygon-based)
  const buildingOcclusion = findBlockingBuilding(srcPos, probePos, buildings);
  const directBlockedByBuilding = buildingOcclusion.blocked;

  pathTypes.add('direct');

  // Trace barrier diffraction paths if direct is blocked by barrier
  // Now uses the new multi-path approach (top + sides if enabled)
  const barrierDiffractionPaths: RayPath[] = [];
  if (!directPath.valid && config.barrierDiffraction) {
    for (const barrier of barriers) {
      // Check if this barrier blocks the direct path
      const s2d = { x: srcPos.x, y: srcPos.y };
      const r2d = { x: probePos.x, y: probePos.y };
      const intersection = segmentIntersection(s2d, r2d, barrier.p1, barrier.p2);

      if (intersection) {
        // Use the new multi-path diffraction function
        const diffResult = traceBarrierDiffractionPaths(srcPos, probePos, barrier, config);

        // Add all valid paths
        if (diffResult.topPath && diffResult.topPath.valid) {
          barrierDiffractionPaths.push(diffResult.topPath);
          pathTypes.add('diffracted');
        }
        if (diffResult.leftPath && diffResult.leftPath.valid) {
          barrierDiffractionPaths.push(diffResult.leftPath);
          pathTypes.add('diffracted');
        }
        if (diffResult.rightPath && diffResult.rightPath.valid) {
          barrierDiffractionPaths.push(diffResult.rightPath);
          pathTypes.add('diffracted');
        }
      }
    }
  }

  // ============================================================================
  // Building Diffraction Path Tracing
  // ============================================================================
  //
  // When the direct path is blocked by buildings, we trace diffraction paths
  // for EACH blocking building. This is more accurate than the receiver engine
  // which only computes a single path per building.
  //
  // The probe traces:
  //   1. Over-roof paths (double-edge diffraction, coefficient 40)
  //   2. Around-corner paths (single-edge diffraction, coefficient 20)
  //
  // All valid paths are summed coherently with phase, which can result in
  // higher levels than the receiver engine's simplified approach (typically
  // 5-10 dB higher due to multiple contributing paths).
  //
  // This matches physical reality better - a sound level meter at this
  // location would measure contributions from all diffraction paths.
  //
  // See: docs/PHYSICS_REFERENCE.md Section 12 "Probe vs Receiver Engine Accuracy"
  // ============================================================================

  const buildingDiffPaths: BuildingDiffractionPath[] = [];
  const allBlockingBuildings = findAllBlockingBuildings(srcPos, probePos, buildings);

  if (allBlockingBuildings.length > 0) {
    // For each blocking building, trace all diffraction paths (roof + corners)
    for (const occlusion of allBlockingBuildings) {
      if (!occlusion.building || !occlusion.entryPoint || !occlusion.exitPoint) continue;

      const diffPaths = traceBuildingDiffractionPaths(
        srcPos,
        probePos,
        occlusion.building,
        occlusion.entryPoint,
        occlusion.exitPoint
      );

      // Add all valid diffraction paths
      // Note: We don't validate each leg against other buildings to match
      // the receiver engine's simplified approach for consistency.
      for (const diffPath of diffPaths) {
        if (diffPath.valid) {
          buildingDiffPaths.push(diffPath);
        }
      }
    }

    if (buildingDiffPaths.length > 0) {
      pathTypes.add('building-diffraction');
    }
  } else if (directBlockedByBuilding) {
    // Direct is blocked but no buildings found by findAllBlockingBuildings - shouldn't happen
    console.warn(`[ProbeWorker] Direct blocked by building but findAllBlockingBuildings returned empty!`);
  }

  // Check ground reflection path for building blocking
  let groundBlockedByBuilding = false;
  if (config.groundReflection && srcPos.z > 0 && probePos.z > 0) {
    const d = distance2D({ x: srcPos.x, y: srcPos.y }, { x: probePos.x, y: probePos.y });
    const hs = srcPos.z;
    const hr = probePos.z;
    const { reflectionPointX } = calculateGroundReflectionGeometry(d, hs, hr);

    // Calculate ground reflection point in 2D
    const dx = probePos.x - srcPos.x;
    const dy = probePos.y - srcPos.y;
    const dHoriz = Math.sqrt(dx * dx + dy * dy);
    const groundPoint: Point3D = dHoriz > EPSILON ? {
      x: srcPos.x + (dx / dHoriz) * reflectionPointX,
      y: srcPos.y + (dy / dHoriz) * reflectionPointX,
      z: 0,
    } : { x: srcPos.x, y: srcPos.y, z: 0 };

    // Check if either leg of ground path is blocked by building
    const leg1Block = findBlockingBuilding(srcPos, groundPoint, buildings);
    const leg2Block = findBlockingBuilding(groundPoint, probePos, buildings);
    groundBlockedByBuilding = leg1Block.blocked || leg2Block.blocked;
  }

  // Trace wall reflection paths (check for blocking by OTHER buildings)
  const wallPaths: RayPath[] = [];
  if (config.wallReflections) {
    const reflPaths = traceWallReflectionPaths(srcPos, probePos, segments, barriers, buildings);
    for (const path of reflPaths) {
      if (!path.valid) continue;
      wallPaths.push(path);
    }
    if (wallPaths.length > 0) pathTypes.add('wall');
  }

  // Compute per-band levels with coherent summation
  const resultSpectrum: number[] = [];

  for (let bandIdx = 0; bandIdx < OCTAVE_BAND_COUNT; bandIdx++) {
    const freq = OCTAVE_BANDS[bandIdx];
    const sourceLevel = spectrum[bandIdx];
    const phasors: Phasor[] = [];
    const k = (2 * Math.PI * freq) / c;

    // Direct path contribution (only if not blocked by barriers AND buildings)
    if (directPath.valid && !directBlockedByBuilding) {
      const atten = spreadingLoss(directPath.totalDistance);
      const atm = config.atmosphericAbsorption !== 'none'
        ? atmosphericAbsorptionCoeff(freq, config.temperature, config.humidity, config.pressure, config.atmosphericAbsorption) * directPath.totalDistance
        : 0;
      const level = sourceLevel - atten - atm;
      const phase = -k * directPath.totalDistance;
      phasors.push({ pressure: dBToPressure(level), phase });
    }

    // Building diffraction contributions (per-band frequency dependence)
    // This is where the frequency dependency is applied!
    for (const diffPath of buildingDiffPaths) {
      const atten = spreadingLoss(diffPath.totalDistance);
      const atm = config.atmosphericAbsorption !== 'none'
        ? atmosphericAbsorptionCoeff(freq, config.temperature, config.humidity, config.pressure, config.atmosphericAbsorption) * diffPath.totalDistance
        : 0;

      // Per-band diffraction loss based on path type
      let diffLoss: number;
      if (diffPath.diffractionPoints === 2) {
        // Roof diffraction: double-edge Maekawa (coefficient 40)
        diffLoss = doubleEdgeDiffraction(diffPath.pathDifference, freq, c);
      } else {
        // Corner diffraction: single-edge Maekawa (coefficient 20)
        diffLoss = singleEdgeDiffraction(diffPath.pathDifference, freq, c);
      }

      const level = sourceLevel - atten - atm - diffLoss;
      const phase = -k * diffPath.totalDistance + (-Math.PI / 4) * diffPath.diffractionPoints;

      phasors.push({ pressure: dBToPressure(level), phase });
    }

    // Ground reflection using proper two-ray model with SEPARATE phasors
    // Only if not blocked by buildings
    if (config.groundReflection && srcPos.z > 0 && probePos.z > 0 && !groundBlockedByBuilding) {
      const d = distance2D({ x: srcPos.x, y: srcPos.y }, { x: probePos.x, y: probePos.y });
      const hs = srcPos.z;
      const hr = probePos.z;

      // Calculate path geometry - get BOTH r1 and r2 for proper two-ray model
      const { r1: directDistance, r2: groundPathDistance } = calculateGroundReflectionGeometry(d, hs, hr);

      // Get frequency-dependent ground reflection coefficient
      const groundCoeff = getGroundReflectionCoeff(
        config.groundType,
        config.groundMixedFactor,
        freq
      );

      // Calculate attenuation for ground-reflected path
      const groundAtten = spreadingLoss(groundPathDistance);
      const groundAtm = config.atmosphericAbsorption !== 'none'
        ? atmosphericAbsorptionCoeff(freq, config.temperature, config.humidity, config.pressure, config.atmosphericAbsorption) * groundPathDistance
        : 0;

      // Ground reflection reduces amplitude by:
      // 1. Reflection coefficient magnitude |Γ|
      // 2. Geometric ratio r1/r2 (reflected path is longer, so amplitude is lower)
      // This matches the textbook two-ray model: p_reflected = p_direct * |Γ| * (r1/r2)
      const geometricRatio = directDistance / groundPathDistance;
      const reflectionLoss = -20 * Math.log10(groundCoeff.magnitude * geometricRatio);

      // Level at receiver via ground-reflected path
      const groundLevel = sourceLevel - groundAtten - groundAtm - reflectionLoss;

      // Phase for proper two-ray interference:
      // The key insight is that the PHASE DIFFERENCE between direct and reflected
      // paths determines interference. Since direct path has phase = -k * r1,
      // the ground path should have phase = -k * r2 + reflection_phase_shift.
      // When summed coherently, the effective phase difference is k * (r2 - r1).
      const groundPhase = -k * groundPathDistance + groundCoeff.phase;

      phasors.push({ pressure: dBToPressure(groundLevel), phase: groundPhase });
      pathTypes.add('ground');
    }

    // Barrier diffraction contributions
    for (const path of barrierDiffractionPaths) {
      const atten = spreadingLoss(path.totalDistance);
      const atm = config.atmosphericAbsorption !== 'none'
        ? atmosphericAbsorptionCoeff(freq, config.temperature, config.humidity, config.pressure, config.atmosphericAbsorption) * path.totalDistance
        : 0;
      const diffLoss = maekawaDiffraction(path.pathDifference, freq, c);
      const level = sourceLevel - atten - atm - diffLoss;
      const phase = -k * path.totalDistance + path.reflectionPhaseChange;
      phasors.push({ pressure: dBToPressure(level), phase });
    }

    // Wall reflection contributions
    for (const path of wallPaths) {
      const atten = spreadingLoss(path.totalDistance);
      const atm = config.atmosphericAbsorption !== 'none'
        ? atmosphericAbsorptionCoeff(freq, config.temperature, config.humidity, config.pressure, config.atmosphericAbsorption) * path.totalDistance
        : 0;
      const absLoss = -20 * Math.log10(path.absorptionFactor);
      const level = sourceLevel - atten - atm - absLoss;
      const phase = -k * path.totalDistance + path.reflectionPhaseChange;
      phasors.push({ pressure: dBToPressure(level), phase });
    }

    // Sum phasors coherently
    if (phasors.length === 0) {
      resultSpectrum.push(MIN_LEVEL);
    } else if (config.coherentSummation) {
      let totalReal = 0;
      let totalImag = 0;
      for (const p of phasors) {
        if (p.pressure <= 0) continue;
        totalReal += p.pressure * Math.cos(p.phase);
        totalImag += p.pressure * Math.sin(p.phase);
      }
      const totalPressure = Math.sqrt(totalReal * totalReal + totalImag * totalImag);
      resultSpectrum.push(pressureTodB(totalPressure));
    } else {
      let totalEnergy = 0;
      for (const p of phasors) {
        totalEnergy += p.pressure * p.pressure;
      }
      resultSpectrum.push(pressureTodB(Math.sqrt(totalEnergy)));
    }
  }

  return {
    spectrum: resultSpectrum as Spectrum9,
    pathTypes,
  };
}

// ============================================================================
// Energy Summation for Multiple Sources
// ============================================================================

function sumMultipleSpectra(spectra: number[][]): number[] {
  if (spectra.length === 0) return new Array(OCTAVE_BAND_COUNT).fill(MIN_LEVEL);
  if (spectra.length === 1) return [...spectra[0]];

  const result: number[] = [];
  for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
    const levels = spectra.map(s => s[i]).filter(l => l > MIN_LEVEL);
    if (levels.length === 0) {
      result.push(MIN_LEVEL);
    } else {
      const energy = levels.reduce((sum, l) => sum + Math.pow(10, l / 10), 0);
      result.push(10 * Math.log10(energy));
    }
  }
  return result;
}

// ============================================================================
// Main Probe Calculation
// ============================================================================

function calculateProbe(req: ProbeRequest): ProbeResult {
  const probePos: Point3D = {
    x: req.position.x,
    y: req.position.y,
    z: req.position.z ?? 1.5,
  };

  const segments = extractWallSegments(req.walls);
  const barriers = segments.filter(s => s.type === 'barrier');
  const buildings = extractBuildingFootprints(req.walls);

  // Merge request config with defaults
  const config: ProbeConfig = {
    ...DEFAULT_CONFIG,
    barrierSideDiffraction: req.config?.barrierSideDiffraction ?? DEFAULT_CONFIG.barrierSideDiffraction,
    groundType: req.config?.groundType ?? DEFAULT_CONFIG.groundType,
    groundMixedFactor: req.config?.groundMixedFactor ?? DEFAULT_CONFIG.groundMixedFactor,
    atmosphericAbsorption: req.config?.atmosphericAbsorption ?? DEFAULT_CONFIG.atmosphericAbsorption,
    temperature: req.config?.temperature ?? DEFAULT_CONFIG.temperature,
    humidity: req.config?.humidity ?? DEFAULT_CONFIG.humidity,
    pressure: req.config?.pressure ?? DEFAULT_CONFIG.pressure,
  };

  const sourceSpectra: number[][] = [];
  let totalGhostCount = 0;

  for (const source of req.sources) {
    const result = computeSourceCoherent(source, probePos, segments, barriers, buildings, config);

    sourceSpectra.push(result.spectrum);

    for (const pathType of result.pathTypes) {
      if (pathType === 'wall' || pathType === 'diffracted' || pathType === 'building-diffraction') {
        totalGhostCount++;
      }
    }
  }

  // Sum all source spectra energetically
  const totalSpectrum = sumMultipleSpectra(sourceSpectra);

  // Return actual calculated spectrum - display floor is applied in the UI
  // after frequency weighting to avoid A-curve artifacts on silence.
  // The engine uses MIN_LEVEL (-100 dB) for bands with no energy.

  return {
    type: 'PROBE_UPDATE',
    probeId: req.probeId,
    data: {
      frequencies: [...OCTAVE_BANDS],
      magnitudes: totalSpectrum,
      interferenceDetails: {
        ghostCount: totalGhostCount,
      },
    },
  };
}

// ============================================================================
// Worker Message Handler
// ============================================================================

type ProbeWorkerScope = {
  postMessage: (message: ProbeResult) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<ProbeRequest>) => void) => void;
};

const workerContext = self as unknown as ProbeWorkerScope;

workerContext.addEventListener('message', (event) => {
  const req = event.data;
  if (!req || req.type !== 'CALCULATE_PROBE') return;

  try {
    const result = calculateProbe(req);
    workerContext.postMessage(result);
  } catch (err) {
    // Log error for debugging (will appear in browser console)
    console.error('[ProbeWorker] Calculation error:', err);

    // Return empty spectrum (MIN_LEVEL) so silent areas show correctly
    // instead of misleading fallback values
    workerContext.postMessage({
      type: 'PROBE_UPDATE',
      probeId: req.probeId,
      data: {
        frequencies: [...OCTAVE_BANDS],
        magnitudes: [MIN_LEVEL, MIN_LEVEL, MIN_LEVEL, MIN_LEVEL, MIN_LEVEL, MIN_LEVEL, MIN_LEVEL, MIN_LEVEL, MIN_LEVEL],
        interferenceDetails: { ghostCount: 0 },
      },
    });
  }
});
