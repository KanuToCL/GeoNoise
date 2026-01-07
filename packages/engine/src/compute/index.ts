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
    // `height` here is the screen’s top Z (hb) in meters, in the same coordinate system as source/receiver z.
    // We intentionally ignore obstacle.groundElevation for now (flat ground assumption).
    const height = obstacle.height;
    if (obstacle.type === 'barrier') {
      if (!obstacle.vertices || obstacle.vertices.length < 2) continue;
      for (let i = 0; i < obstacle.vertices.length - 1; i += 1) {
        const p1 = obstacle.vertices[i];
        const p2 = obstacle.vertices[i + 1];
        if (distance2D(p1, p2) < EPSILON) continue;
        barrierSegments.push({ p1, p2, height });
      }
    }
    if (obstacle.type === 'building') {
      const footprint = obstacle.footprint ?? [];
      if (footprint.length < 3) continue;
      const segments: BarrierSegment[] = [];
      for (let i = 0; i < footprint.length; i += 1) {
        const p1 = footprint[i];
        const p2 = footprint[(i + 1) % footprint.length];
        if (distance2D(p1, p2) < EPSILON) continue;
        segments.push({ p1, p2, height });
      }
      if (segments.length) {
        buildings.push({ segments, height });
      }
    }
  }
  return { barrierSegments, buildings };
}

function computeThinBarrierDelta(
  source: Point3D,
  receiver: Point3D,
  source2D: Point2D,
  receiver2D: Point2D,
  segments: BarrierSegment[],
  direct3D: number
): number | null {
  let maxDelta: number | null = null;

  for (const segment of segments) {
    const intersection = segmentIntersection(source2D, receiver2D, segment.p1, segment.p2);
    if (!intersection) continue;

    // Split SR at the intersection point in 2D, then "lift" to the barrier top height in 3D.
    // Note: This is a surrogate diffraction path; it is NOT a full ISO 9613-2 diffraction implementation.
    const distSI = distance2D(source2D, intersection);
    const distIR = distance2D(intersection, receiver2D);
    const pathA = Math.hypot(distSI, segment.height - source.z);
    const pathB = Math.hypot(distIR, segment.height - receiver.z);
    const delta = pathA + pathB - direct3D;

    if (maxDelta === null || delta > maxDelta) {
      maxDelta = delta;
    }
  }

  return maxDelta;
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

// Compute barrier path difference for a source->receiver path.
// Step A: check 2D intersection between SR and each obstacle segment.
// Step B (barriers): use a single "top edge" point at the intersection with height hb.
// Step C (buildings): use entry/exit points to traverse across the roof.
// Step D: choose the largest delta across intersecting obstacles (strongest screen effect).
// The caller uses `blocked` to swap ground effect out and apply barrier attenuation instead.
function computeBarrierPathDiff(
  source: Point3D,
  receiver: Point3D,
  geometry: BarrierGeometry
): { blocked: boolean; pathDifference: number } {
  if (!geometry.barrierSegments.length && !geometry.buildings.length) {
    return { blocked: false, pathDifference: 0 };
  }

  // Keep intersection math in 2D (plan view), but keep heights for the 3D distance terms.
  const s2 = { x: source.x, y: source.y };
  const r2 = { x: receiver.x, y: receiver.y };
  const direct2D = distance2D(s2, r2);
  const direct3D = Math.hypot(direct2D, source.z - receiver.z);

  let maxDelta: number | null = null;

  const thinDelta = computeThinBarrierDelta(source, receiver, s2, r2, geometry.barrierSegments, direct3D);
  if (thinDelta !== null) {
    maxDelta = thinDelta;
  }

  for (const building of geometry.buildings) {
    const delta = computeBuildingDelta(source, receiver, s2, r2, building, direct3D);
    if (delta === null) continue;
    if (maxDelta === null || delta > maxDelta) {
      maxDelta = delta;
    }
  }

  if (maxDelta === null) {
    return { blocked: false, pathDifference: 0 };
  }

  return { blocked: true, pathDifference: maxDelta };
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
          ? computeBarrierPathDiff(src.position, recv.position, barrierGeometry)
          : { blocked: false, pathDifference: 0 };

        // Calculate per-band propagation
        const bandedProp = calculateBandedPropagation(
          dist,
          src.position.z,
          recv.position.z,
          propConfig,
          meteo,
          barrier.pathDifference,
          barrier.blocked
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
          ? computeBarrierPathDiff(src.position, pt, barrierGeometry)
          : { blocked: false, pathDifference: 0 };

        const bandedProp = calculateBandedPropagation(
          dist, src.position.z, pt.z, propConfig, meteo,
          barrier.pathDifference, barrier.blocked
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
          ? computeBarrierPathDiff(src.position, pt, barrierGeometry)
          : { blocked: false, pathDifference: 0 };

        const bandedProp = calculateBandedPropagation(
          dist, src.position.z, pt.z, propConfig, meteo,
          barrier.pathDifference, barrier.blocked
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
