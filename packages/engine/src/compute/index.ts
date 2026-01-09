/**
 * CPU compute implementation - Reference implementation
 *
 * SPECTRAL ENGINE: This module now works with 9-band spectra.
 * - Source power is defined per-band (Spectrum9)
 * - Propagation is computed per-band
 * - Results include full spectrum and weighted totals (LAeq, LCeq, LZeq)
 */

import {
  sumDecibels,
  receiverId,
  MIN_LEVEL,
  EPSILON,
  OCTAVE_BANDS,
  OCTAVE_BAND_COUNT,
  type Spectrum9,
  createEmptySpectrum,
  sumMultipleSpectra,
  applyGainToSpectrum,
  calculateOverallLevel,
} from '@geonoise/shared';
import type { Point2D, Point3D } from '@geonoise/core/coords';
import { distance2D, distance3D } from '@geonoise/core/coords';
import { generateRectangleSamples, generatePolygonSamples, generateGrid } from '@geonoise/geo';
import type {
  Engine, EngineCapabilities, ComputeReceiversRequest, ComputeReceiversResponse,
  ComputePanelRequest, ComputePanelResponse, ComputeGridRequest, ComputeGridResponse,
  ReceiverResult, PanelResult, GridResult, SourceContribution,
} from '../api/index.js';
import { getDefaultEngineConfig, createRequestHash } from '../api/index.js';
import { calculateBandedPropagation } from '../propagation/index.js';
import type { Scene } from '@geonoise/core';

// ============================================================================
// Simple Barrier Occlusion (Line Screens)
// ============================================================================
//
// This file is the "geometry bridge" between the 2D editor and the 3D acoustics model.
//
// UI model: The web UI draws barriers as 2D line segments in (x,y) on the map grid.
// Physics model: The propagation math must be 3D to account for:
//   - source height hs (z of the source),
//   - receiver height hr (z of the receiver),
//   - barrier height hb (vertical screen height).
//
// The approach implemented here follows the ticket’s Step A + Step B requirements:
//
// Step A (2D intersection / occlusion test):
//   For each Source S and Receiver R we check if the 2D segment SR intersects a barrier segment P1P2.
//   If there is no intersection, the path is treated as unoccluded (ground effects may apply).
//
// Step B (3D "top edge" path for thin barriers):
//   For each intersecting line barrier, we compute the intersection point I in the XY plane.
//   We then place an imaginary diffraction point B at the barrier’s top edge directly above I:
//     B = (Ix, Iy, hb)
//
//   Distances (all meters):
//     A = distance3D(S, B) = sqrt( dist2D(S,I)^2 + (hb - hs)^2 )
//     B = distance3D(B, R) = sqrt( dist2D(I,R)^2 + (hb - hr)^2 )
//     d = distance3D(S, R) = sqrt( dist2D(S,R)^2 + (hs - hr)^2 )
//
//   Path difference:
//     delta = A + B - d
//
// Step C (3D roof path for buildings, thick barrier):
//   For each intersecting building footprint, collect all edge intersections along SR, sort by
//   distance from S, and choose entry/exit points I_in / I_out. Then:
//     A = sqrt( dist2D(S,I_in)^2 + (hb - hs)^2 )
//     B = dist2D(I_in, I_out)
//     C = sqrt( dist2D(I_out,R)^2 + (hb - hr)^2 )
//     delta = A + B + C - d
//
// We take the *largest* delta across all intersecting obstacles. This is a pragmatic choice:
// the Maekawa-style insertion loss increases monotonically with delta (for N > ~0), so the
// strongest obstruction dominates when multiple obstacles cross the SR line.
//
// IMPORTANT integration detail:
//   This module does not convert delta -> attenuation in dB. It only computes:
//     - `blocked` (bool): did SR cross any barrier segment?
//     - `pathDifference` (delta, meters): for the Maekawa-style screen formula.
//   The propagation model (packages/engine/src/propagation/index.ts) decides:
//     - when blocked: use Adiv + Aatm + Abar (and intentionally omit Agr)
//     - when unblocked: use Adiv + Aatm + Agr
//
// Known limitations (by design for v0.2.x):
//   - No diffraction around barrier ends (only an "over the top" surrogate path).
//   - Barrier thickness ignored for line barriers (infinitely thin vertical screen).
//   - Building diffraction uses entry/exit edges for a simple roof traversal.
//   - Collinear/grazing cases are treated as "no intersection" for numerical stability.
//   - Barrier groundElevation is ignored; hb is treated as absolute Z in the local frame.
//   - No transmission loss through the barrier (future: use obstacle.attenuationDb / TL).

type BarrierSegment = {
  // 2D barrier segment in the XY plane (plan view); height is used for the 3D top-edge path.
  p1: Point2D;
  p2: Point2D;
  height: number;
  length: number; // Total barrier length for side diffraction auto-mode
};

type BuildingObstacle = {
  segments: BarrierSegment[];
  height: number;
};

type BarrierGeometry = {
  barrierSegments: BarrierSegment[];
  buildings: BuildingObstacle[];
};

// 2D cross product helper (scalar z-component) for segment intersection math.
function cross2D(a: Point2D, b: Point2D): number {
  return a.x * b.y - a.y * b.x;
}

// Segment intersection in 2D (plan view):
// - Treat the source->receiver line as segment p1->p2.
// - Treat each barrier edge as segment q1->q2.
// - Return the intersection point when the segments cross; otherwise null.
// This is Step A of the occlusion pipeline: detect if the barrier blocks the line of sight.
//
// Implementation notes:
// - Uses the parametric form p(t)=p1+t*r, q(u)=q1+u*s with t,u in [0,1].
// - rxs == 0 => parallel (including collinear) -> treated as no intersection for simplicity.
// - EPSILON is used to include near-endpoint hits without flapping due to floating-point noise.
function segmentIntersection(p1: Point2D, p2: Point2D, q1: Point2D, q2: Point2D): Point2D | null {
  const r = { x: p2.x - p1.x, y: p2.y - p1.y };
  const s = { x: q2.x - q1.x, y: q2.y - q1.y };
  const rxs = cross2D(r, s);
  const qmp = { x: q1.x - p1.x, y: q1.y - p1.y };

  if (Math.abs(rxs) < EPSILON) {
    return null;
  }

  const t = cross2D(qmp, s) / rxs;
  const u = cross2D(qmp, r) / rxs;

  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) {
    return null;
  }

  return { x: p1.x + t * r.x, y: p1.y + t * r.y };
}

function collectIntersections(
  source: Point2D,
  receiver: Point2D,
  segments: BarrierSegment[]
): Point2D[] {
  const hits: { point: Point2D; distance: number }[] = [];
  for (const segment of segments) {
    const intersection = segmentIntersection(source, receiver, segment.p1, segment.p2);
    if (!intersection) continue;
    hits.push({ point: intersection, distance: distance2D(source, intersection) });
  }

  hits.sort((a, b) => a.distance - b.distance);

  const unique: Point2D[] = [];
  for (const hit of hits) {
    const last = unique[unique.length - 1];
    if (!last || distance2D(last, hit.point) > EPSILON) {
      unique.push(hit.point);
    }
  }

  return unique;
}

// Build obstacle geometry from scene obstacles:
// - Barriers are stored as polylines; each pair of consecutive vertices is a segment.
// - Buildings keep their footprint edges grouped to compute entry/exit intersections.
function buildBarrierGeometry(scene: Scene): BarrierGeometry {
  const barrierSegments: BarrierSegment[] = [];
  const buildings: BuildingObstacle[] = [];
  for (const obstacle of scene.obstacles ?? []) {
    if (obstacle.enabled === false) continue;
    // `height` here is the screen's top Z (hb) in meters, in the same coordinate system as source/receiver z.
    // We intentionally ignore obstacle.groundElevation for now (flat ground assumption).
    const height = obstacle.height;
    if (obstacle.type === 'barrier') {
      if (!obstacle.vertices || obstacle.vertices.length < 2) continue;

      // Calculate total barrier length for side diffraction auto-mode decision
      let totalLength = 0;
      for (let i = 0; i < obstacle.vertices.length - 1; i += 1) {
        totalLength += distance2D(obstacle.vertices[i], obstacle.vertices[i + 1]);
      }

      for (let i = 0; i < obstacle.vertices.length - 1; i += 1) {
        const p1 = obstacle.vertices[i];
        const p2 = obstacle.vertices[i + 1];
        if (distance2D(p1, p2) < EPSILON) continue;
        barrierSegments.push({ p1, p2, height, length: totalLength });
      }
    }
    if (obstacle.type === 'building') {
      const footprint = obstacle.footprint ?? [];
      if (footprint.length < 3) continue;
      const segments: BarrierSegment[] = [];
      // Buildings don't use side diffraction (enclosed polygons)
      for (let i = 0; i < footprint.length; i += 1) {
        const p1 = footprint[i];
        const p2 = footprint[(i + 1) % footprint.length];
        if (distance2D(p1, p2) < EPSILON) continue;
        segments.push({ p1, p2, height, length: Infinity });
      }
      if (segments.length) {
        buildings.push({ segments, height });
      }
    }
  }
  return { barrierSegments, buildings };
}

/**
 * Compute the path difference for side (horizontal) diffraction around a barrier endpoint.
 * Path: Source → Edge → Receiver
 * Delta: |S→Edge| + |Edge→R| - |S→R|
 */
function computeSidePathDelta(
  source: Point3D,
  receiver: Point3D,
  edgePoint: Point2D,
  edgeHeight: number,
  direct3D: number
): number {
  // Edge point at barrier height (or at the midpoint between source/receiver heights)
  const edgeZ = Math.min(edgeHeight, Math.max(source.z, receiver.z));

  const pathA = Math.hypot(
    distance2D({ x: source.x, y: source.y }, edgePoint),
    edgeZ - source.z
  );
  const pathB = Math.hypot(
    distance2D(edgePoint, { x: receiver.x, y: receiver.y }),
    edgeZ - receiver.z
  );

  return pathA + pathB - direct3D;
}

/**
 * Determine if side diffraction should be computed for a barrier.
 * - 'off': Never compute side diffraction (ISO 9613-2 infinite barrier assumption)
 * - 'auto': Compute for barriers shorter than threshold (default 50m)
 * - 'on': Always compute side diffraction
 */
function shouldUseSideDiffraction(
  barrierLength: number,
  mode: 'off' | 'auto' | 'on',
  lengthThreshold = 50
): boolean {
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  return barrierLength < lengthThreshold; // 'auto' mode
}

function computeThinBarrierDelta(
  source: Point3D,
  receiver: Point3D,
  source2D: Point2D,
  receiver2D: Point2D,
  segments: BarrierSegment[],
  direct3D: number,
  sideDiffractionMode: 'off' | 'auto' | 'on' = 'auto'
): number | null {
  let minDelta: number | null = null;

  for (const segment of segments) {
    const intersection = segmentIntersection(source2D, receiver2D, segment.p1, segment.p2);
    if (!intersection) continue;

    // === OVER-TOP DIFFRACTION (always computed) ===
    // Split SR at the intersection point in 2D, then "lift" to the barrier top height in 3D.
    const distSI = distance2D(source2D, intersection);
    const distIR = distance2D(intersection, receiver2D);
    const pathA = Math.hypot(distSI, segment.height - source.z);
    const pathB = Math.hypot(distIR, segment.height - receiver.z);
    const topDelta = pathA + pathB - direct3D;

    let bestDelta = topDelta;

    // === SIDE DIFFRACTION (if enabled) ===
    // Compute paths around the left and right edges of the barrier
    if (shouldUseSideDiffraction(segment.length, sideDiffractionMode)) {
      // Left edge (p1)
      const leftDelta = computeSidePathDelta(source, receiver, segment.p1, segment.height, direct3D);
      // Right edge (p2)
      const rightDelta = computeSidePathDelta(source, receiver, segment.p2, segment.height, direct3D);

      // Take the minimum delta (least obstructed path) among top and sides
      // Only consider paths with positive delta (sound must bend around/over barrier)
      if (leftDelta > 0 && leftDelta < bestDelta) {
        bestDelta = leftDelta;
      }
      if (rightDelta > 0 && rightDelta < bestDelta) {
        bestDelta = rightDelta;
      }
    }

    // For multiple barriers, we accumulate the minimum effective delta
    // (the receiver "hears through" the least-blocked path)
    if (minDelta === null || bestDelta < minDelta) {
      minDelta = bestDelta;
    }
  }

  return minDelta;
}

function computeBuildingDelta(
  source: Point3D,
  receiver: Point3D,
  source2D: Point2D,
  receiver2D: Point2D,
  building: BuildingObstacle,
  direct3D: number
): number | null {
  const intersections = collectIntersections(source2D, receiver2D, building.segments);
  if (intersections.length < 2) {
    return computeThinBarrierDelta(source, receiver, source2D, receiver2D, building.segments, direct3D);
  }

  const entry = intersections[0];
  const exit = intersections[intersections.length - 1];
  const distSourceToIn = distance2D(source2D, entry);
  const distAcrossRoof = distance2D(entry, exit);
  const distOutToRecv = distance2D(exit, receiver2D);
  const pathUp = Math.hypot(distSourceToIn, building.height - source.z);
  const pathRoof = distAcrossRoof;
  const pathDown = Math.hypot(distOutToRecv, building.height - receiver.z);

  return pathUp + pathRoof + pathDown - direct3D;
}

/** Barrier type for diffraction calculation */
type BarrierType = 'thin' | 'thick';

/**
 * Barrier geometry info for ISO 9613-2 Section 7.4 ground partitioning.
 * When provided for blocked paths, ground effect is calculated separately
 * for source-side and receiver-side regions.
 */
type BarrierGeometryInfo = {
  /** Horizontal distance from source to barrier diffraction point (meters) */
  distSourceToBarrier: number;
  /** Horizontal distance from barrier diffraction point to receiver (meters) */
  distBarrierToReceiver: number;
  /** Height of the barrier diffraction edge (meters) */
  barrierHeight: number;
};

/** Result of barrier path difference calculation */
type BarrierPathResult = {
  /** Whether the direct path is blocked by a barrier */
  blocked: boolean;
  /** Path difference (delta) in meters for Maekawa formula */
  pathDifference: number;
  /** Actual path length sound travels (for atmospheric absorption) */
  actualPathLength: number;
  /** Type of barrier causing the block ('thin' for walls, 'thick' for buildings) */
  barrierType: BarrierType;
  /**
   * Barrier geometry for ISO 9613-2 Section 7.4 ground partitioning (Issue #3).
   * When provided, ground effect is calculated for source and receiver regions
   * separately, and barrier+ground are additive instead of using max().
   */
  barrierInfo?: BarrierGeometryInfo;
};

// Compute barrier path difference for a source->receiver path.
// Step A: check 2D intersection between SR and each obstacle segment.
// Step B (barriers): use a single "top edge" point at the intersection with height hb.
// Step C (buildings): use entry/exit points to traverse across the roof.
// Step D: choose the largest delta across intersecting obstacles (strongest screen effect).
// The caller uses `blocked` to swap ground effect out and apply barrier attenuation instead.
//
// Issue #3 Fix: Now also returns barrierInfo for ISO 9613-2 Section 7.4 ground partitioning.
// When provided, ground effect is calculated for source and receiver regions separately.
//
// Issue #4 Fix: Now also returns actualPathLength for atmospheric absorption calculation.
// For diffracted paths, actualPathLength = direct3D + pathDifference (the over-barrier path).
//
// Issue #16 Fix: Now also returns barrierType to select thin vs thick diffraction formula.
function computeBarrierPathDiff(
  source: Point3D,
  receiver: Point3D,
  geometry: BarrierGeometry,
  sideDiffractionMode: 'off' | 'auto' | 'on' = 'auto'
): BarrierPathResult {
  // Keep intersection math in 2D (plan view), but keep heights for the 3D distance terms.
  const s2 = { x: source.x, y: source.y };
  const r2 = { x: receiver.x, y: receiver.y };
  const direct2D = distance2D(s2, r2);
  const direct3D = Math.hypot(direct2D, source.z - receiver.z);

  if (!geometry.barrierSegments.length && !geometry.buildings.length) {
    return { blocked: false, pathDifference: 0, actualPathLength: direct3D, barrierType: 'thin' };
  }

  let maxDelta: number | null = null;
  let maxBarrierType: BarrierType = 'thin';
  let maxBarrierInfo: BarrierGeometryInfo | undefined = undefined;

  // Check thin barriers first
  for (const segment of geometry.barrierSegments) {
    const intersection = segmentIntersection(s2, r2, segment.p1, segment.p2);
    if (!intersection) continue;

    // Compute over-top diffraction delta
    const distSI = distance2D(s2, intersection);
    const distIR = distance2D(intersection, r2);
    const pathA = Math.hypot(distSI, segment.height - source.z);
    const pathB = Math.hypot(distIR, segment.height - receiver.z);
    const topDelta = pathA + pathB - direct3D;

    let bestDelta = topDelta;

    // Side diffraction (if enabled) - find minimum path
    if (shouldUseSideDiffraction(segment.length, sideDiffractionMode)) {
      const leftDelta = computeSidePathDelta(source, receiver, segment.p1, segment.height, direct3D);
      const rightDelta = computeSidePathDelta(source, receiver, segment.p2, segment.height, direct3D);

      if (leftDelta > 0 && leftDelta < bestDelta) {
        bestDelta = leftDelta;
      }
      if (rightDelta > 0 && rightDelta < bestDelta) {
        bestDelta = rightDelta;
      }
    }

    // Update max if this barrier has larger delta
    if (maxDelta === null || bestDelta > maxDelta) {
      maxDelta = bestDelta;
      maxBarrierType = 'thin';

      // Issue #3: Capture barrier geometry for ground partitioning
      // For thin barriers, use horizontal distances from source/receiver to intersection
      maxBarrierInfo = {
        distSourceToBarrier: distSI,
        distBarrierToReceiver: distIR,
        barrierHeight: segment.height,
      };
    }
  }

  // Check buildings (thick barriers)
  for (const building of geometry.buildings) {
    const intersections = collectIntersections(s2, r2, building.segments);

    let delta: number | null = null;
    let buildingBarrierInfo: BarrierGeometryInfo | undefined = undefined;

    if (intersections.length >= 2) {
      // Thick barrier: entry and exit points
      const entry = intersections[0];
      const exit = intersections[intersections.length - 1];
      const distSourceToIn = distance2D(s2, entry);
      const distAcrossRoof = distance2D(entry, exit);
      const distOutToRecv = distance2D(exit, r2);
      const pathUp = Math.hypot(distSourceToIn, building.height - source.z);
      const pathRoof = distAcrossRoof;
      const pathDown = Math.hypot(distOutToRecv, building.height - receiver.z);

      delta = pathUp + pathRoof + pathDown - direct3D;

      // Issue #3: For thick barriers, use entry and exit points for ground partitioning
      // Source region: source to entry point (where sound goes "up")
      // Receiver region: exit point to receiver (where sound comes "down")
      buildingBarrierInfo = {
        distSourceToBarrier: distSourceToIn,
        distBarrierToReceiver: distOutToRecv,
        barrierHeight: building.height,
      };
    } else if (intersections.length === 1) {
      // Single intersection: treat as thin barrier
      const intersection = intersections[0];
      const distSI = distance2D(s2, intersection);
      const distIR = distance2D(intersection, r2);
      const pathA = Math.hypot(distSI, building.height - source.z);
      const pathB = Math.hypot(distIR, building.height - receiver.z);
      delta = pathA + pathB - direct3D;

      buildingBarrierInfo = {
        distSourceToBarrier: distSI,
        distBarrierToReceiver: distIR,
        barrierHeight: building.height,
      };
    }

    if (delta !== null && (maxDelta === null || delta > maxDelta)) {
      maxDelta = delta;
      maxBarrierType = 'thick';
      maxBarrierInfo = buildingBarrierInfo;
    }
  }

  if (maxDelta === null) {
    return { blocked: false, pathDifference: 0, actualPathLength: direct3D, barrierType: 'thin' };
  }

  // Actual path length = direct distance + path difference (the detour over/around the barrier)
  const actualPathLength = direct3D + maxDelta;

  return {
    blocked: true,
    pathDifference: maxDelta,
    actualPathLength,
    barrierType: maxBarrierType,
    barrierInfo: maxBarrierInfo,
  };
}

/** CPU Engine implementation */
export class CPUEngine implements Engine {
  getBackendId() { return 'cpu-main' as const; }
  async isAvailable() { return true; }
  getCapabilities(): EngineCapabilities {
    return { maxReceivers: 10000, maxSources: 1000, maxGridPoints: 100000, supportsGPU: false, supportsBandedCalculation: true, supportsBarriers: true };
  }
  dispose() {}

  async computeReceivers(request: ComputeReceiversRequest): Promise<ComputeReceiversResponse> {
    const start = performance.now();
    const { scene } = request;
    const config = request.engineConfig ?? getDefaultEngineConfig('festival_fast');
    const meteo = config.meteo ?? { temperature: 20, relativeHumidity: 50, pressure: 101.325, windSpeed: 0, windDirection: 0 };
    const propConfig = config.propagation ?? getDefaultEngineConfig('festival_fast').propagation!;
    // Precompute barrier geometry once per request (cheap) so the inner SR loop only does intersection + delta math.
    const barrierGeometry = propConfig.includeBarriers ? buildBarrierGeometry(scene) : null;

    const enabledSources = scene.sources.filter(s => s.enabled);
    let receivers = scene.receivers.filter(r => r.enabled);
    if (request.payload.receiverIds?.length) {
      const idSet = new Set(request.payload.receiverIds);
      receivers = receivers.filter(r => idSet.has(receiverId(r.id)));
    }

    const results: ReceiverResult[] = receivers.map(recv => {
      const contributions: SourceContribution[] = [];
      const sourceSpectra: Spectrum9[] = [];

      for (const src of enabledSources) {
        const dist = distance3D(src.position, recv.position);
        // Get source spectrum with gain applied
        const sourceSpectrum = applyGainToSpectrum(src.spectrum, src.gain ?? 0);

        // Barrier geometry stage: 2D intersection test + 3D path-difference delta.
        // `blocked` toggles which attenuation terms are applied in calculatePropagation().
        const barrier = barrierGeometry
          ? computeBarrierPathDiff(src.position, recv.position, barrierGeometry, propConfig.barrierSideDiffraction ?? 'auto')
          : { blocked: false, pathDifference: 0, actualPathLength: dist, barrierType: 'thin' as const };

        // Calculate per-band propagation
        const bandedProp = calculateBandedPropagation(
          dist,
          src.position.z,
          recv.position.z,
          propConfig,
          meteo,
          barrier.pathDifference,
          barrier.blocked,
          barrier.actualPathLength,
          barrier.barrierType ?? 'thin',
          barrier.barrierInfo
        );

        // Apply per-band attenuation to source spectrum
        const receiverSpectrum = createEmptySpectrum();
        const attenuationSpectrum = createEmptySpectrum();

        for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
          const freq = OCTAVE_BANDS[i];
          const bandProp = bandedProp.bands.get(freq);
          if (bandProp && !bandProp.blocked) {
            const attenuation = bandProp.totalAttenuation;
            receiverSpectrum[i] = sourceSpectrum[i] - attenuation;
            attenuationSpectrum[i] = attenuation;
          } else {
            receiverSpectrum[i] = MIN_LEVEL;
            attenuationSpectrum[i] = bandedProp.overall.totalAttenuation;
          }
        }

        const LAeqContrib = calculateOverallLevel(receiverSpectrum, 'A');

        if (LAeqContrib > MIN_LEVEL) {
          sourceSpectra.push(receiverSpectrum);
          contributions.push({
            sourceId: src.id,
            LAeq: LAeqContrib,
            Leq_spectrum: receiverSpectrum,
            distance: dist,
            attenuation: bandedProp.overall.totalAttenuation,
            attenuation_spectrum: attenuationSpectrum,
          });
        }
      }

      // Sum all source spectra at receiver
      const totalSpectrum = sourceSpectra.length > 0
        ? sumMultipleSpectra(sourceSpectra)
        : createEmptySpectrum();

      const LAeq = calculateOverallLevel(totalSpectrum, 'A');
      const LCeq = calculateOverallLevel(totalSpectrum, 'C');
      const LZeq = calculateOverallLevel(totalSpectrum, 'Z');

      return {
        receiverId: receiverId(recv.id),
        LAeq,
        LCeq,
        LZeq,
        Leq_spectrum: totalSpectrum,
        contributions,
      };
    });

    return {
      kind: 'receivers', results, sceneHash: createRequestHash(request),
      backendId: 'cpu-main', timings: { totalMs: performance.now() - start, pathCount: enabledSources.length * receivers.length },
      warnings: []
    };
  }

  async computePanel(request: ComputePanelRequest): Promise<ComputePanelResponse> {
    const start = performance.now();
    const { scene } = request;
    const config = request.engineConfig ?? getDefaultEngineConfig('festival_fast');
    const meteo = config.meteo ?? { temperature: 20, relativeHumidity: 50, pressure: 101.325, windSpeed: 0, windDirection: 0 };
    const propConfig = config.propagation ?? getDefaultEngineConfig('festival_fast').propagation!;
    // Same barrier preprocessing as computeReceivers(): reuse across all sample points in this panel compute.
    const barrierGeometry = propConfig.includeBarriers ? buildBarrierGeometry(scene) : null;

    const panel = scene.panels.find(p => p.id === request.payload.panelId);
    if (!panel || !panel.enabled) {
      return {
        kind: 'panel',
        result: {
          panelId: request.payload.panelId as any,
          sampleCount: 0,
          LAeq_min: MIN_LEVEL,
          LAeq_max: MIN_LEVEL,
          LAeq_avg: MIN_LEVEL,
          LAeq_p95: MIN_LEVEL,
        },
        sceneHash: createRequestHash(request),
        backendId: 'cpu-main',
        timings: { totalMs: performance.now() - start },
        warnings: [{ code: 'PANEL_NOT_FOUND', message: 'Panel not found or disabled', severity: 'warning' }],
      };
    }

    const sampling = request.payload.sampling ?? panel.sampling ?? { type: 'grid', resolution: 5 };
    const elevation = panel.elevation ?? 1.5;

    let samples: Point3D[];
    if (panel.type === 'rectangular') {
      samples = generateRectangleSamples({ x: panel.center.x, y: panel.center.y }, panel.width, panel.height, panel.rotation ?? 0, sampling.resolution, elevation);
    } else {
      samples = generatePolygonSamples(panel.vertices, sampling.resolution, elevation);
    }
    if (sampling.pointCount && samples.length > sampling.pointCount) {
      const stride = Math.ceil(samples.length / sampling.pointCount);
      samples = samples.filter((_, idx) => idx % stride === 0);
    }

    const enabledSources = scene.sources.filter(s => s.enabled);

    const sampleResults = samples.map(pt => {
      const sourceSpectra: Spectrum9[] = [];

      for (const src of enabledSources) {
        const dist = distance3D(src.position, pt);
        const sourceSpectrum = applyGainToSpectrum(src.spectrum, src.gain ?? 0);

        // Barrier logic is applied per source->sample path.
        const barrier = barrierGeometry
          ? computeBarrierPathDiff(src.position, pt, barrierGeometry, propConfig.barrierSideDiffraction ?? 'auto')
          : { blocked: false, pathDifference: 0, actualPathLength: dist, barrierType: 'thin' as const };

        const bandedProp = calculateBandedPropagation(
          dist, src.position.z, pt.z, propConfig, meteo,
          barrier.pathDifference, barrier.blocked, barrier.actualPathLength,
          barrier.barrierType ?? 'thin', barrier.barrierInfo
        );

        // Apply per-band attenuation
        const receiverSpectrum = createEmptySpectrum();
        for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
          const freq = OCTAVE_BANDS[i];
          const bandProp = bandedProp.bands.get(freq);
          if (bandProp && !bandProp.blocked) {
            receiverSpectrum[i] = sourceSpectrum[i] - bandProp.totalAttenuation;
          } else {
            receiverSpectrum[i] = MIN_LEVEL;
          }
        }

        const LAeqContrib = calculateOverallLevel(receiverSpectrum, 'A');
        if (LAeqContrib > MIN_LEVEL) {
          sourceSpectra.push(receiverSpectrum);
        }
      }

      const totalSpectrum = sourceSpectra.length > 0
        ? sumMultipleSpectra(sourceSpectra)
        : createEmptySpectrum();
      const LAeq = calculateOverallLevel(totalSpectrum, 'A');

      return { x: pt.x, y: pt.y, z: pt.z, LAeq, Leq_spectrum: totalSpectrum };
    });

    const laeqs = sampleResults.map(s => s.LAeq).filter(l => l > MIN_LEVEL);
    const sorted = [...laeqs].sort((a, b) => a - b);
    const p95Index = sorted.length
      ? Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1))
      : 0;
    const result: PanelResult = {
      panelId: request.payload.panelId as any, sampleCount: samples.length,
      LAeq_min: laeqs.length ? Math.min(...laeqs) : MIN_LEVEL,
      LAeq_max: laeqs.length ? Math.max(...laeqs) : MIN_LEVEL,
      LAeq_avg: laeqs.length ? sumDecibels(laeqs) - 10 * Math.log10(laeqs.length) : MIN_LEVEL,
      LAeq_p95: laeqs.length ? sorted[p95Index] : MIN_LEVEL,
      samples: sampleResults
    };

    return { kind: 'panel', result, sceneHash: createRequestHash(request), backendId: 'cpu-main', timings: { totalMs: performance.now() - start, pathCount: enabledSources.length * samples.length }, warnings: [] };
  }

  async computeGrid(request: ComputeGridRequest): Promise<ComputeGridResponse> {
    const start = performance.now();
    const { scene } = request;
    const config = request.engineConfig ?? getDefaultEngineConfig('festival_fast');
    const meteo = config.meteo ?? { temperature: 20, relativeHumidity: 50, pressure: 101.325, windSpeed: 0, windDirection: 0 };
    const propConfig = config.propagation ?? getDefaultEngineConfig('festival_fast').propagation!;
    // Same barrier preprocessing as computeReceivers()/computePanel().
    const barrierGeometry = propConfig.includeBarriers ? buildBarrierGeometry(scene) : null;
    const gridConfig = request.payload.gridConfig;

    // Per-band noise map display options
    const targetBand = gridConfig.targetBand; // undefined = compute overall weighted level
    const weighting = gridConfig.weighting ?? 'A'; // Used when targetBand is undefined

    if (!gridConfig.bounds) {
      return { kind: 'grid', result: { bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, resolution: gridConfig.resolution, elevation: gridConfig.elevation ?? 1.5, cols: 0, rows: 0, values: [], min: MIN_LEVEL, max: MIN_LEVEL }, sceneHash: createRequestHash(request), backendId: 'cpu-main', timings: { totalMs: performance.now() - start }, warnings: [{ code: 'NO_BOUNDS', message: 'Grid bounds not specified', severity: 'warning' }] };
    }

    const points = generateGrid(gridConfig.bounds, gridConfig.resolution, gridConfig.elevation ?? 1.5);
    const enabledSources = scene.sources.filter(s => s.enabled);

    const values = points.map(pt => {
      const sourceSpectra: Spectrum9[] = [];

      for (const src of enabledSources) {
        const dist = distance3D(src.position, pt);
        const sourceSpectrum = applyGainToSpectrum(src.spectrum, src.gain ?? 0);

        // Barrier logic is applied per source->grid-point path.
        const barrier = barrierGeometry
          ? computeBarrierPathDiff(src.position, pt, barrierGeometry, propConfig.barrierSideDiffraction ?? 'auto')
          : { blocked: false, pathDifference: 0, actualPathLength: dist, barrierType: 'thin' as const };

        const bandedProp = calculateBandedPropagation(
          dist, src.position.z, pt.z, propConfig, meteo,
          barrier.pathDifference, barrier.blocked, barrier.actualPathLength,
          barrier.barrierType ?? 'thin', barrier.barrierInfo
        );

        // Apply per-band attenuation
        const receiverSpectrum = createEmptySpectrum();
        for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
          const freq = OCTAVE_BANDS[i];
          const bandProp = bandedProp.bands.get(freq);
          if (bandProp && !bandProp.blocked) {
            receiverSpectrum[i] = sourceSpectrum[i] - bandProp.totalAttenuation;
          } else {
            receiverSpectrum[i] = MIN_LEVEL;
          }
        }

        const LAeqContrib = calculateOverallLevel(receiverSpectrum, 'A');
        if (LAeqContrib > MIN_LEVEL) {
          sourceSpectra.push(receiverSpectrum);
        }
      }

      const totalSpectrum = sourceSpectra.length > 0
        ? sumMultipleSpectra(sourceSpectra)
        : createEmptySpectrum();

      // Return single band level if targetBand is specified, otherwise weighted overall
      if (targetBand !== undefined) {
        // Return unweighted single-band level
        return totalSpectrum[targetBand];
      } else {
        // Return weighted overall level (A, C, or Z weighting)
        return calculateOverallLevel(totalSpectrum, weighting);
      }
    });

    const validValues = values.filter(v => v > MIN_LEVEL);
    const cols = Math.ceil((gridConfig.bounds.maxX - gridConfig.bounds.minX) / gridConfig.resolution) + 1;
    const rows = Math.ceil((gridConfig.bounds.maxY - gridConfig.bounds.minY) / gridConfig.resolution) + 1;

    const result: GridResult = {
      bounds: gridConfig.bounds, resolution: gridConfig.resolution, elevation: gridConfig.elevation ?? 1.5,
      cols, rows, values, min: validValues.length ? Math.min(...validValues) : MIN_LEVEL, max: validValues.length ? Math.max(...validValues) : MIN_LEVEL
    };

    return { kind: 'grid', result, sceneHash: createRequestHash(request), backendId: 'cpu-main', timings: { totalMs: performance.now() - start, pathCount: enabledSources.length * points.length }, warnings: [] };
  }
}
