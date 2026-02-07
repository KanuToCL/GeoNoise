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

// Import from modules
import {
  type Point2D,
  type Point3D,
  type WallSegment,
  type Phasor,
  type Spectrum9,
  type ProbeConfig,
  type BuildingFootprint,
  type BuildingDiffractionPath,
} from './probeWorker/types.js';

import {
  distance2D,
  segmentIntersection,
  findBlockingBuilding,
  findAllBlockingBuildings,
  calculateGroundReflectionGeometry,
  EPSILON,
} from './probeWorker/geometry.js';

import {
  OCTAVE_BANDS,
  OCTAVE_BAND_COUNT,
  MIN_LEVEL,
  SPEED_OF_SOUND,
  dBToPressure,
  pressureTodB,
  spreadingLoss,
  atmosphericAbsorptionCoeff,
  maekawaDiffraction,
  singleEdgeDiffraction,
  doubleEdgeDiffraction,
  applyGainToSpectrum,
  sumMultipleSpectra,
} from './probeWorker/physics.js';

import { getGroundReflectionCoeff } from './probeWorker/groundReflection.js';

import {
  extractWallSegments,
  extractBuildingFootprints,
  traceDirectPath,
  traceWallReflectionPaths,
  traceBarrierDiffractionPaths,
  traceBuildingDiffractionPaths,
  type WallReflectionPath,
} from './probeWorker/pathTracing.js';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG: ProbeConfig = {
  groundReflection: true,
  groundType: 'mixed',
  groundMixedFactor: 0.5,
  groundModel: 'impedance',
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
// Coherent Spectral Computation Types
// ============================================================================

interface SourcePhasorResult {
  spectrum: Spectrum9;
  pathTypes: Set<string>;
  collectedPaths?: CollectedPath[];
}

interface CollectedPath {
  type: 'direct' | 'ground' | 'wall' | 'diffraction';
  points: Point2D[];
  level_dB: number;
  phase_rad: number;
  sourceId: string;
  reflectionPoint?: Point2D;
  diffractionEdge?: Point2D;
}

// ============================================================================
// Core Computation: Single Source Coherent Summation
// ============================================================================

function computeSourceCoherent(
  source: ProbeRequest['sources'][0],
  probePos: Point3D,
  segments: WallSegment[],
  barriers: WallSegment[],
  buildings: BuildingFootprint[],
  config: ProbeConfig,
  collectPaths: boolean = false
): SourcePhasorResult {
  const spectrum = applyGainToSpectrum(
    source.spectrum as number[],
    source.gain ?? 0
  );
  const pathTypes = new Set<string>();
  const collectedPaths: CollectedPath[] = [];
  const c = config.speedOfSound;

  const srcPos: Point3D = source.position;
  const src2D: Point2D = { x: srcPos.x, y: srcPos.y };
  const probe2D: Point2D = { x: probePos.x, y: probePos.y };

  // Trace direct path (barrier blocking)
  const directPath = traceDirectPath(srcPos, probePos, barriers);

  // Check building occlusion (polygon-based)
  const buildingOcclusion = findBlockingBuilding(srcPos, probePos, buildings);
  const directBlockedByBuilding = buildingOcclusion.blocked;

  pathTypes.add('direct');

  // Trace barrier diffraction paths if direct is blocked by barrier
  const barrierDiffractionPaths: { totalDistance: number; pathDifference: number; reflectionPhaseChange: number; valid: boolean }[] = [];
  if (!directPath.valid && config.barrierDiffraction) {
    for (const barrier of barriers) {
      const s2d = { x: srcPos.x, y: srcPos.y };
      const r2d = { x: probePos.x, y: probePos.y };
      const intersection = segmentIntersection(s2d, r2d, barrier.p1, barrier.p2);

      if (intersection) {
        const diffResult = traceBarrierDiffractionPaths(srcPos, probePos, barrier, config);

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

  // Building Diffraction Path Tracing
  const buildingDiffPaths: BuildingDiffractionPath[] = [];
  const allBlockingBuildings = findAllBlockingBuildings(srcPos, probePos, buildings);

  if (allBlockingBuildings.length > 0) {
    for (const occlusion of allBlockingBuildings) {
      if (!occlusion.building || !occlusion.entryPoint || !occlusion.exitPoint) continue;

      const diffPaths = traceBuildingDiffractionPaths(
        srcPos,
        probePos,
        occlusion.building,
        occlusion.entryPoint,
        occlusion.exitPoint
      );

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
    console.warn(`[ProbeWorker] Direct blocked by building but findAllBlockingBuildings returned empty!`);
  }

  // Check ground reflection path for building blocking
  let groundBlockedByBuilding = false;
  if (config.groundReflection && srcPos.z > 0 && probePos.z > 0) {
    const d = distance2D({ x: srcPos.x, y: srcPos.y }, { x: probePos.x, y: probePos.y });
    const hs = srcPos.z;
    const hr = probePos.z;
    const { reflectionPointX } = calculateGroundReflectionGeometry(d, hs, hr);

    const dx = probePos.x - srcPos.x;
    const dy = probePos.y - srcPos.y;
    const dHoriz = Math.sqrt(dx * dx + dy * dy);
    const groundPoint: Point3D = dHoriz > EPSILON ? {
      x: srcPos.x + (dx / dHoriz) * reflectionPointX,
      y: srcPos.y + (dy / dHoriz) * reflectionPointX,
      z: 0,
    } : { x: srcPos.x, y: srcPos.y, z: 0 };

    const leg1Block = findBlockingBuilding(srcPos, groundPoint, buildings);
    const leg2Block = findBlockingBuilding(groundPoint, probePos, buildings);
    groundBlockedByBuilding = leg1Block.blocked || leg2Block.blocked;
  }

  // Trace wall reflection paths
  const wallPaths: WallReflectionPath[] = [];
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

    // Direct path contribution
    if (directPath.valid && !directBlockedByBuilding) {
      const atten = spreadingLoss(directPath.totalDistance);
      const atm = config.atmosphericAbsorption !== 'none'
        ? atmosphericAbsorptionCoeff(freq, config.temperature, config.humidity, config.pressure, config.atmosphericAbsorption) * directPath.totalDistance
        : 0;
      const level = sourceLevel - atten - atm;
      const phase = -k * directPath.totalDistance;
      phasors.push({ pressure: dBToPressure(level), phase });

      if (collectPaths && bandIdx === 0) {
        collectedPaths.push({
          type: 'direct',
          points: [src2D, probe2D],
          level_dB: level,
          phase_rad: phase,
          sourceId: source.id,
        });
      }
    }

    // Building diffraction contributions (per-band frequency dependence)
    for (const diffPath of buildingDiffPaths) {
      const atten = spreadingLoss(diffPath.totalDistance);
      const atm = config.atmosphericAbsorption !== 'none'
        ? atmosphericAbsorptionCoeff(freq, config.temperature, config.humidity, config.pressure, config.atmosphericAbsorption) * diffPath.totalDistance
        : 0;

      let diffLoss: number;
      if (diffPath.diffractionPoints === 2) {
        diffLoss = doubleEdgeDiffraction(diffPath.pathDifference, freq, c);
      } else {
        diffLoss = singleEdgeDiffraction(diffPath.pathDifference, freq, c);
      }

      const level = sourceLevel - atten - atm - diffLoss;
      const phase = -k * diffPath.totalDistance + (-Math.PI / 4) * diffPath.diffractionPoints;

      phasors.push({ pressure: dBToPressure(level), phase });
    }

    // Ground reflection using proper two-ray model
    if (config.groundReflection && srcPos.z > 0 && probePos.z > 0 && !groundBlockedByBuilding) {
      const d = distance2D({ x: srcPos.x, y: srcPos.y }, { x: probePos.x, y: probePos.y });
      const hs = srcPos.z;
      const hr = probePos.z;

      const { r1: directDistance, r2: groundPathDistance, reflectionPointX } = calculateGroundReflectionGeometry(d, hs, hr);

      const groundCoeff = getGroundReflectionCoeff(
        config.groundType,
        config.groundMixedFactor,
        freq,
        undefined, // incidenceAngle - use default
        'auto',    // impedanceModel
        config.groundModel
      );

      const groundAtten = spreadingLoss(groundPathDistance);
      const groundAtm = config.atmosphericAbsorption !== 'none'
        ? atmosphericAbsorptionCoeff(freq, config.temperature, config.humidity, config.pressure, config.atmosphericAbsorption) * groundPathDistance
        : 0;

      const geometricRatio = directDistance / groundPathDistance;
      const reflectionLoss = -20 * Math.log10(groundCoeff.magnitude * geometricRatio);

      const groundLevel = sourceLevel - groundAtten - groundAtm - reflectionLoss;
      const groundPhase = -k * groundPathDistance + groundCoeff.phase;

      phasors.push({ pressure: dBToPressure(groundLevel), phase: groundPhase });
      pathTypes.add('ground');

      if (collectPaths && bandIdx === 0) {
        const dx = probePos.x - srcPos.x;
        const dy = probePos.y - srcPos.y;
        const dHoriz = Math.sqrt(dx * dx + dy * dy);
        const reflPoint: Point2D = dHoriz > EPSILON ? {
          x: srcPos.x + (dx / dHoriz) * reflectionPointX,
          y: srcPos.y + (dy / dHoriz) * reflectionPointX,
        } : src2D;

        collectedPaths.push({
          type: 'ground',
          points: [src2D, reflPoint, probe2D],
          level_dB: groundLevel,
          phase_rad: groundPhase,
          sourceId: source.id,
          reflectionPoint: reflPoint,
        });
      }
    }

    // Barrier diffraction contributions
    for (let i = 0; i < barrierDiffractionPaths.length; i++) {
      const path = barrierDiffractionPaths[i];
      const atten = spreadingLoss(path.totalDistance);
      const atm = config.atmosphericAbsorption !== 'none'
        ? atmosphericAbsorptionCoeff(freq, config.temperature, config.humidity, config.pressure, config.atmosphericAbsorption) * path.totalDistance
        : 0;
      const diffLoss = maekawaDiffraction(path.pathDifference, freq, c);
      const level = sourceLevel - atten - atm - diffLoss;
      const phase = -k * path.totalDistance + path.reflectionPhaseChange;
      phasors.push({ pressure: dBToPressure(level), phase });

      if (collectPaths && bandIdx === 0) {
        const diffPoint: Point2D = {
          x: (srcPos.x + probePos.x) / 2,
          y: (srcPos.y + probePos.y) / 2,
        };
        collectedPaths.push({
          type: 'diffraction',
          points: [src2D, diffPoint, probe2D],
          level_dB: level,
          phase_rad: phase,
          sourceId: source.id,
          diffractionEdge: diffPoint,
        });
      }
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

      if (collectPaths && bandIdx === 0) {
        collectedPaths.push({
          type: 'wall',
          points: [src2D, path.reflectionPoint2D, probe2D],
          level_dB: level,
          phase_rad: phase,
          sourceId: source.id,
          reflectionPoint: path.reflectionPoint2D,
        });
      }
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
    collectedPaths: collectPaths ? collectedPaths : undefined,
  };
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

  const config: ProbeConfig = {
    ...DEFAULT_CONFIG,
    barrierSideDiffraction: req.config?.barrierSideDiffraction ?? DEFAULT_CONFIG.barrierSideDiffraction,
    groundType: req.config?.groundType ?? DEFAULT_CONFIG.groundType,
    groundMixedFactor: req.config?.groundMixedFactor ?? DEFAULT_CONFIG.groundMixedFactor,
    groundModel: req.config?.groundModel ?? DEFAULT_CONFIG.groundModel,
    atmosphericAbsorption: req.config?.atmosphericAbsorption ?? DEFAULT_CONFIG.atmosphericAbsorption,
    temperature: req.config?.temperature ?? DEFAULT_CONFIG.temperature,
    humidity: req.config?.humidity ?? DEFAULT_CONFIG.humidity,
    pressure: req.config?.pressure ?? DEFAULT_CONFIG.pressure,
  };

  const sourceSpectra: number[][] = [];
  let totalGhostCount = 0;
  const allCollectedPaths: CollectedPath[] = [];
  const collectPaths = req.includePathGeometry ?? false;

  for (const source of req.sources) {
    const result = computeSourceCoherent(source, probePos, segments, barriers, buildings, config, collectPaths);

    sourceSpectra.push(result.spectrum);

    if (result.collectedPaths) {
      allCollectedPaths.push(...result.collectedPaths);
    }

    for (const pathType of result.pathTypes) {
      if (pathType === 'wall' || pathType === 'diffracted' || pathType === 'building-diffraction') {
        totalGhostCount++;
      }
    }
  }

  const totalSpectrum = sumMultipleSpectra(sourceSpectra);

  let tracedPaths: import('@geonoise/engine').TracedPath[] | undefined;
  let phaseRelationships: import('@geonoise/engine').PhaseRelationship[] | undefined;

  if (collectPaths && allCollectedPaths.length > 0) {
    tracedPaths = allCollectedPaths.map(p => ({
      type: p.type,
      points: p.points,
      level_dB: p.level_dB,
      phase_rad: p.phase_rad,
      sourceId: p.sourceId,
      reflectionPoint: p.reflectionPoint,
      diffractionEdge: p.diffractionEdge,
    }));

    phaseRelationships = [];
    const pathsBySource = new Map<string, CollectedPath[]>();
    for (const p of allCollectedPaths) {
      const arr = pathsBySource.get(p.sourceId) || [];
      arr.push(p);
      pathsBySource.set(p.sourceId, arr);
    }

    for (const [, paths] of pathsBySource) {
      for (let i = 0; i < paths.length; i++) {
        for (let j = i + 1; j < paths.length; j++) {
          const p1 = paths[i];
          const p2 = paths[j];
          const phaseDelta_rad = Math.abs(p1.phase_rad - p2.phase_rad);
          const normalized = phaseDelta_rad % (2 * Math.PI);
          const phaseDelta_deg = (normalized > Math.PI ? 2 * Math.PI - normalized : normalized) * (180 / Math.PI);
          phaseRelationships.push({
            path1Type: p1.type,
            path2Type: p2.type,
            phaseDelta_deg,
            isConstructive: phaseDelta_deg < 90,
          });
        }
      }
    }
  }

  return {
    type: 'PROBE_UPDATE',
    probeId: req.probeId,
    data: {
      frequencies: [...OCTAVE_BANDS],
      magnitudes: totalSpectrum,
      interferenceDetails: {
        ghostCount: totalGhostCount,
      },
      tracedPaths,
      phaseRelationships,
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
    console.error('[ProbeWorker] Calculation error:', err);

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
