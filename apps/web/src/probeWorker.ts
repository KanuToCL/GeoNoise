/**
 * Probe Worker - Coherent Ray-Tracing Spectral Analysis
 *
 * This worker calculates the 9-band frequency spectrum at a probe position
 * using coherent ray-tracing with phase summation. It traces multiple paths:
 * - Direct path (line of sight)
 * - Ground reflection (two-ray model with phase)
 * - First-order wall/building reflections (image source method)
 * - Barrier diffraction (Maekawa model)
 *
 * All paths from a single source are summed coherently (with phase) to capture
 * constructive and destructive interference patterns (e.g., comb filtering
 * from ground reflections). Paths from different sources are summed energetically
 * since independent sources are incoherent.
 *
 * ============================================================================
 * CURRENT CAPABILITIES (as of Jan 6, 2026):
 * ============================================================================
 *
 * ✅ IMPLEMENTED:
 *   - Barrier occlusion: Direct path blocked when intersecting barriers
 *   - Barrier diffraction: Maekawa model for sound bending over barriers
 *   - Ground reflection: Two-ray model with frequency-dependent phase
 *   - First-order wall reflections: Image source method for building walls
 *   - Coherent summation: Phase-accurate phasor addition within single source
 *   - Atmospheric absorption: Frequency-dependent absorption (simplified ISO 9613-1)
 *   - Multi-source support: Energetic (incoherent) sum across sources
 *
 * ❌ NOT IMPLEMENTED:
 *   - Building occlusion: Buildings do NOT block line-of-sight paths
 *   - Higher-order reflections: Only first-order (single bounce) supported
 *   - Building diffraction: No edge diffraction around buildings
 *   - Terrain effects: Flat ground assumed
 *   - Weather gradients: No refraction modeling
 *
 * ============================================================================
 * PHYSICS MODEL:
 * ============================================================================
 *
 * For each source-receiver pair, we trace:
 *   1. DIRECT PATH: Line-of-sight with barrier blocking check
 *      - If blocked by barrier → path invalid, try diffraction instead
 *      - Attenuation: spherical spreading + atmospheric absorption
 *
 *   2. GROUND REFLECTION: Two-ray interference model
 *      - Reflects off ground plane at z=0
 *      - Phase shift depends on ground impedance (hard/soft/mixed)
 *      - Creates comb filtering at certain frequencies
 *
 *   3. WALL REFLECTIONS: Image source method
 *      - Mirror source position across each building wall
 *      - Trace path from image source to receiver via wall
 *      - 10% absorption per reflection (0.9 coefficient)
 *
 *   4. BARRIER DIFFRACTION: Maekawa approximation
 *      - Only computed when direct path is blocked
 *      - Path difference → Fresnel number → insertion loss
 *      - Max 25 dB attenuation
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

interface ProbeConfig {
  groundReflection: boolean;
  groundType: 'hard' | 'soft' | 'mixed';
  groundMixedFactor: number;
  wallReflections: boolean;
  barrierDiffraction: boolean;
  coherentSummation: boolean;
  atmosphericAbsorption: boolean;
  temperature: number;
  humidity: number;
  speedOfSound: number;
}

const DEFAULT_CONFIG: ProbeConfig = {
  groundReflection: true,
  groundType: 'mixed',
  groundMixedFactor: 0.5,
  wallReflections: true,
  barrierDiffraction: true,
  coherentSummation: true,
  atmosphericAbsorption: true,
  temperature: 20,
  humidity: 50,
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
// Attenuation Calculations
// ============================================================================

function spreadingLoss(distance: number): number {
  const d = Math.max(distance, 0.1);
  return 20 * Math.log10(d) + 11;
}

function atmosphericAbsorptionCoeff(frequency: number, temp: number, humidity: number): number {
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

function maekawaDiffraction(pathDiff: number, frequency: number, c: number): number {
  const lambda = c / frequency;
  const N = (2 * pathDiff) / lambda;
  if (N < -0.1) return 0;
  const atten = 10 * Math.log10(3 + 20 * N);
  return Math.min(Math.max(atten, 0), 25);
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

function traceDiffractionPath(
  source: Point3D,
  receiver: Point3D,
  barrier: WallSegment
): RayPath | null {
  const s2d = { x: source.x, y: source.y };
  const r2d = { x: receiver.x, y: receiver.y };

  const intersection = segmentIntersection(s2d, r2d, barrier.p1, barrier.p2);
  if (!intersection) return null;

  const diffPoint: Point3D = { x: intersection.x, y: intersection.y, z: barrier.height };

  const pathA = distance3D(source, diffPoint);
  const pathB = distance3D(diffPoint, receiver);
  const totalDist = pathA + pathB;
  const directDist = distance3D(source, receiver);

  return {
    type: 'diffracted',
    totalDistance: totalDist,
    directDistance: directDist,
    pathDifference: totalDist - directDist,
    reflectionPhaseChange: -Math.PI / 4,
    absorptionFactor: 1,
    valid: true,
  };
}

function traceWallReflectionPaths(
  source: Point3D,
  receiver: Point3D,
  segments: WallSegment[],
  barriers: WallSegment[]
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
    const blockedA = isPathBlocked(s2d, reflPoint, barriers, segment.id);
    const blockedB = isPathBlocked(reflPoint, r2d, barriers, segment.id);

    if (blockedA || blockedB) continue;

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
  config: ProbeConfig
): SourcePhasorResult {
  const spectrum = applyGainToSpectrum(
    source.spectrum as number[],
    source.gain ?? 0
  );
  const pathTypes = new Set<string>();
  const c = config.speedOfSound;

  const srcPos: Point3D = source.position;

  // Trace direct path
  const directPath = traceDirectPath(srcPos, probePos, barriers);
  pathTypes.add('direct');

  // eslint-disable-next-line no-console
  console.log('[ProbeWorker] Path tracing:', {
    directValid: directPath.valid,
    directDist: directPath.totalDistance.toFixed(1),
    barriersCount: barriers.length,
    srcZ: srcPos.z,
    probeZ: probePos.z,
  });

  // Trace diffraction paths if direct is blocked
  const diffractionPaths: RayPath[] = [];
  if (!directPath.valid && config.barrierDiffraction) {
    for (const barrier of barriers) {
      const diffPath = traceDiffractionPath(srcPos, probePos, barrier);
      if (diffPath && diffPath.valid) {
        diffractionPaths.push(diffPath);
        pathTypes.add('diffracted');
      }
    }
  }

  // Trace wall reflection paths
  const wallPaths: RayPath[] = [];
  if (config.wallReflections) {
    const reflPaths = traceWallReflectionPaths(srcPos, probePos, segments, barriers);
    wallPaths.push(...reflPaths.filter(p => p.valid));
    if (wallPaths.length > 0) pathTypes.add('wall');
  }

  // Compute per-band levels with coherent summation
  const resultSpectrum: number[] = [];
  let debuggedFirstBand = false;

  for (let bandIdx = 0; bandIdx < OCTAVE_BAND_COUNT; bandIdx++) {
    const freq = OCTAVE_BANDS[bandIdx];
    const sourceLevel = spectrum[bandIdx];
    const phasors: Phasor[] = [];

    // Direct path contribution
    if (directPath.valid) {
      const atten = spreadingLoss(directPath.totalDistance);
      const atm = config.atmosphericAbsorption
        ? atmosphericAbsorptionCoeff(freq, config.temperature, config.humidity) * directPath.totalDistance
        : 0;
      const level = sourceLevel - atten - atm;
      const k = (2 * Math.PI * freq) / c;
      const phase = -k * directPath.totalDistance;
      phasors.push({ pressure: dBToPressure(level), phase });

      if (!debuggedFirstBand) {
        // eslint-disable-next-line no-console
        console.log('[ProbeWorker] Direct path calc:', {
          sourceLevel,
          atten: atten.toFixed(1),
          atm: atm.toFixed(3),
          level: level.toFixed(1),
          pressure: dBToPressure(level).toExponential(2),
        });
      }
    }

    // Ground reflection using proper two-ray model with SEPARATE phasors
    //
    // IMPORTANT: We add the ground-reflected ray as a SEPARATE phasor,
    // NOT using the combined two-ray formula. This is more accurate because:
    // 1. It properly handles the phase relationship at each frequency
    // 2. It correctly models the interference with other paths (wall reflections, etc.)
    // 3. It avoids double-counting the direct path energy
    //
    // The ground-reflected path uses the image source method:
    // - Virtual source at (srcPos.x, srcPos.y, -srcPos.z) below ground
    // - Path distance = sqrt(d² + (hs+hr)²) where d = horizontal distance
    // - Reflection coefficient depends on ground type (hard/soft/mixed)
    //
    if (config.groundReflection && srcPos.z > 0 && probePos.z > 0) {
      const d = distance2D({ x: srcPos.x, y: srcPos.y }, { x: probePos.x, y: probePos.y });
      const hs = srcPos.z;
      const hr = probePos.z;

      // Calculate path geometry
      const { r2: groundPathDistance } = calculateGroundReflectionGeometry(d, hs, hr);

      // Get frequency-dependent ground reflection coefficient
      const groundCoeff = getGroundReflectionCoeff(
        config.groundType,
        config.groundMixedFactor,
        freq
      );

      // Calculate attenuation for ground-reflected path
      const groundAtten = spreadingLoss(groundPathDistance);
      const groundAtm = config.atmosphericAbsorption
        ? atmosphericAbsorptionCoeff(freq, config.temperature, config.humidity) * groundPathDistance
        : 0;

      // Ground reflection reduces amplitude by reflection coefficient
      const reflectionLoss = -20 * Math.log10(groundCoeff.magnitude);

      // Level at receiver via ground-reflected path
      const groundLevel = sourceLevel - groundAtten - groundAtm - reflectionLoss;

      // Phase includes:
      // 1. Propagation phase: -k * distance
      // 2. Ground reflection phase shift (0 for hard, ~π for soft)
      const k = (2 * Math.PI * freq) / c;
      const groundPhase = -k * groundPathDistance + groundCoeff.phase;

      phasors.push({ pressure: dBToPressure(groundLevel), phase: groundPhase });
      pathTypes.add('ground');

      if (!debuggedFirstBand) {
        // eslint-disable-next-line no-console
        console.log('[ProbeWorker] Ground reflection calc:', {
          d: d.toFixed(1),
          groundPathDist: groundPathDistance.toFixed(1),
          groundCoeffMag: groundCoeff.magnitude.toFixed(2),
          groundCoeffPhase: (groundCoeff.phase / Math.PI).toFixed(2) + 'π',
          reflectionLoss: reflectionLoss.toFixed(1),
          groundLevel: groundLevel.toFixed(1),
        });
      }
    }

    if (!debuggedFirstBand) {
      // eslint-disable-next-line no-console
      console.log('[ProbeWorker] Phasors for band 0:', phasors.length,
        'config.groundReflection:', config.groundReflection,
        'srcPos.z:', srcPos.z, 'probePos.z:', probePos.z);
      debuggedFirstBand = true;
    }

    // Diffraction contributions
    for (const path of diffractionPaths) {
      const atten = spreadingLoss(path.totalDistance);
      const atm = config.atmosphericAbsorption
        ? atmosphericAbsorptionCoeff(freq, config.temperature, config.humidity) * path.totalDistance
        : 0;
      const diffLoss = maekawaDiffraction(path.pathDifference, freq, c);
      const level = sourceLevel - atten - atm - diffLoss;
      const k = (2 * Math.PI * freq) / c;
      const phase = -k * path.totalDistance + path.reflectionPhaseChange;
      phasors.push({ pressure: dBToPressure(level), phase });
    }

    // Wall reflection contributions
    for (const path of wallPaths) {
      const atten = spreadingLoss(path.totalDistance);
      const atm = config.atmosphericAbsorption
        ? atmosphericAbsorptionCoeff(freq, config.temperature, config.humidity) * path.totalDistance
        : 0;
      const absLoss = -20 * Math.log10(path.absorptionFactor);
      const level = sourceLevel - atten - atm - absLoss;
      const k = (2 * Math.PI * freq) / c;
      const phase = -k * path.totalDistance + path.reflectionPhaseChange;
      phasors.push({ pressure: dBToPressure(level), phase });
    }

    // Sum phasors
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

  // eslint-disable-next-line no-console
  console.log('[ProbeWorker] calculateProbe - probePos:', probePos,
    'sources:', req.sources.length,
    'first source pos:', req.sources[0]?.position);

  const segments = extractWallSegments(req.walls);
  const barriers = segments.filter(s => s.type === 'barrier');

  const sourceSpectra: number[][] = [];
  let totalGhostCount = 0;

  for (const source of req.sources) {
    // eslint-disable-next-line no-console
    console.log('[ProbeWorker] Computing source:', source.id,
      'position:', source.position,
      'spectrum[0]:', source.spectrum[0]);

    const result = computeSourceCoherent(source, probePos, segments, barriers, DEFAULT_CONFIG);

    // eslint-disable-next-line no-console
    console.log('[ProbeWorker] Source result spectrum:', result.spectrum.map(v => v.toFixed(1)).join(','));

    sourceSpectra.push(result.spectrum);

    for (const pathType of result.pathTypes) {
      if (pathType === 'wall' || pathType === 'diffracted') {
        totalGhostCount++;
      }
    }
  }

  // Sum all source spectra energetically
  const totalSpectrum = sumMultipleSpectra(sourceSpectra);

  // eslint-disable-next-line no-console
  console.log('[ProbeWorker] totalSpectrum before floor:', totalSpectrum.map(v => v.toFixed(1)).join(','));

  // Apply ambient floor
  const magnitudes = totalSpectrum.map(level => Math.max(level, 35));

  return {
    type: 'PROBE_UPDATE',
    probeId: req.probeId,
    data: {
      frequencies: [...OCTAVE_BANDS],
      magnitudes,
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

// eslint-disable-next-line no-console
console.log('[ProbeWorker] Worker initialized and ready');

workerContext.addEventListener('message', (event) => {
  // eslint-disable-next-line no-console
  console.log('[ProbeWorker] Received message:', event.data?.type, event.data?.probeId);

  const req = event.data;
  if (!req || req.type !== 'CALCULATE_PROBE') return;

  try {
    const result = calculateProbe(req);
    // eslint-disable-next-line no-console
    console.log('[ProbeWorker] Calculation complete, posting result for probe:', req.probeId);
    workerContext.postMessage(result);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[ProbeWorker] Error calculating probe:', error);
    // Return a fallback result so the UI doesn't hang
    workerContext.postMessage({
      type: 'PROBE_UPDATE',
      probeId: req.probeId,
      data: {
        frequencies: [...OCTAVE_BANDS],
        magnitudes: [35, 35, 35, 35, 35, 35, 35, 35, 35],
        interferenceDetails: { ghostCount: 0 },
      },
    });
  }
});
