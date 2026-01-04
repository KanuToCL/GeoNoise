/**
 * Coherent Probe Computation
 * 
 * Implements accurate acoustic propagation for probe analysis using:
 * - Multi-path ray tracing (direct, ground, wall reflections, diffraction)
 * - Per-frequency coherent phasor summation (captures interference)
 * - Full 9-band spectral processing
 * 
 * This replaces the simplified spherical spreading model in the probe worker
 * for higher accuracy at the cost of computation time.
 */

import {
  OCTAVE_BANDS,
  OCTAVE_BAND_COUNT,
  MIN_LEVEL,
  type Spectrum9,
  createEmptySpectrum,
  sumMultipleSpectra,
  applyGainToSpectrum,
  calculateOverallLevel,
  // Phasor operations
  type Phasor,
  type SpectralPhasor,
  sumSpectralPhasorsCoherent,
  dBToPressure,
  pressureTodB,
} from '@geonoise/shared';

import type { Point3D } from '@geonoise/core/coords';
import { distance3D } from '@geonoise/core/coords';
import { speedOfSound as calcSpeedOfSound } from '@geonoise/core';

import {
  traceAllPaths,
  maekawaDiffraction,
  atmosphericAbsorptionCoeff,
  type RayPath,
  type ReflectingSurface,
  type RayTracingConfig,
} from '../raytracing/index.js';

import { spreadingLoss } from '../propagation/index.js';
import { agrTwoRayDb } from '../propagation/ground.js';

// ============================================================================
// Types
// ============================================================================

/** Source for probe computation */
export interface ProbeComputeSource {
  id: string;
  position: Point3D;
  spectrum: Spectrum9;
  gain?: number;
}

/** Wall/obstacle for probe computation */
export interface ProbeComputeWall {
  id: string;
  type: 'barrier' | 'building';
  segments: Array<{ p1: { x: number; y: number }; p2: { x: number; y: number } }>;
  height: number;
  surfaceType?: 'hard' | 'soft' | 'mixed';
  absorption?: number;
}

/** Configuration for probe computation */
export interface ProbeComputeConfig {
  /** Include ground reflection with phase */
  groundReflection: boolean;
  /** Ground type */
  groundType: 'hard' | 'soft' | 'mixed';
  /** Ground flow resistivity (Pa·s/m²) */
  groundFlowResistivity: number;
  /** Mixed ground factor */
  groundMixedFactor: number;
  /** Include first-order wall reflections */
  wallReflections: boolean;
  /** Include barrier diffraction */
  barrierDiffraction: boolean;
  /** Use coherent (phase) summation vs energetic */
  coherentSummation: boolean;
  /** Include atmospheric absorption */
  atmosphericAbsorption: boolean;
  /** Temperature (°C) */
  temperature: number;
  /** Relative humidity (%) */
  humidity: number;
  /** Speed of sound (m/s) - computed from temperature if not specified */
  speedOfSound?: number;
}

export const DEFAULT_PROBE_CONFIG: ProbeComputeConfig = {
  groundReflection: true,
  groundType: 'mixed',
  groundFlowResistivity: 20000,
  groundMixedFactor: 0.5,
  wallReflections: true,
  barrierDiffraction: true,
  coherentSummation: true,
  atmosphericAbsorption: true,
  temperature: 20,
  humidity: 50,
};

/** Detailed probe result with interference info */
export interface ProbeComputeResult {
  /** 9-band spectrum at probe position */
  spectrum: Spectrum9;
  /** Overall A-weighted level */
  LAeq: number;
  /** Overall C-weighted level */
  LCeq: number;
  /** Overall Z-weighted level */
  LZeq: number;
  /** Number of ray paths considered */
  pathCount: number;
  /** Number of valid (unblocked) paths */
  validPathCount: number;
  /** Number of ghost sources (reflections + diffractions) */
  ghostCount: number;
  /** Per-source contributions with interference effects */
  sourceContributions: SourceProbeContribution[];
}

/** Per-source contribution at probe */
export interface SourceProbeContribution {
  sourceId: string;
  /** Spectrum after coherent summation of all paths from this source */
  spectrum: Spectrum9;
  /** Path types contributing to this source */
  pathTypes: string[];
  /** Direct path distance */
  directDistance: number;
}

// ============================================================================
// Core Computation
// ============================================================================

/**
 * Convert probe walls to reflecting surfaces for ray tracing
 */
function wallsToSurfaces(walls: ProbeComputeWall[]): ReflectingSurface[] {
  const surfaces: ReflectingSurface[] = [];
  
  for (const wall of walls) {
    for (const segment of wall.segments) {
      surfaces.push({
        segment: { p1: segment.p1, p2: segment.p2 },
        height: wall.height,
        surfaceType: wall.surfaceType ?? 'hard',
        absorption: wall.absorption ?? 0.1,
        id: wall.id,
      });
    }
  }
  
  return surfaces;
}

/**
 * Calculate spreading loss + atmospheric absorption for a path at a frequency
 */
function calculatePathAttenuation(
  distance: number,
  frequency: number,
  config: ProbeComputeConfig
): number {
  // Spherical spreading
  const Adiv = spreadingLoss(distance, 'spherical');
  
  // Atmospheric absorption
  let Aatm = 0;
  if (config.atmosphericAbsorption) {
    const alpha = atmosphericAbsorptionCoeff(frequency, config.temperature, config.humidity);
    Aatm = alpha * distance;
  }
  
  return Adiv + Aatm;
}

/**
 * Calculate level at receiver for a single ray path at a single frequency
 * 
 * @param sourceLevel - Source power level at this frequency (dB)
 * @param path - Ray path info
 * @param frequency - Frequency in Hz
 * @param config - Computation config
 * @returns Level in dB at the receiver for this path
 */
function calculatePathLevel(
  sourceLevel: number,
  path: RayPath,
  frequency: number,
  config: ProbeComputeConfig
): number {
  if (!path.valid && path.type !== 'diffracted') {
    return MIN_LEVEL;
  }
  
  // Base attenuation (spreading + atmospheric for path length)
  const attenuation = calculatePathAttenuation(path.totalDistance, frequency, config);
  let level = sourceLevel - attenuation;
  
  // Absorption from surface reflections
  if (path.absorptionFactor < 1) {
    level += 20 * Math.log10(path.absorptionFactor);
  }
  
  // Diffraction attenuation
  if (path.type === 'diffracted' && path.pathDifference > 0) {
    const c = config.speedOfSound ?? calcSpeedOfSound(config.temperature);
    const diffLoss = maekawaDiffraction(path.pathDifference, frequency, c);
    level -= diffLoss;
  }
  
  return level;
}

/**
 * Calculate phase for a ray path at a frequency
 */
function calculatePathPhase(
  path: RayPath,
  frequency: number,
  config: ProbeComputeConfig
): number {
  const c = config.speedOfSound ?? calcSpeedOfSound(config.temperature);
  
  // Phase from total path length
  const k = (2 * Math.PI * frequency) / c;
  let phase = -k * path.totalDistance;
  
  // Additional phase from reflections
  phase += path.reflectionPhaseChange;
  
  return phase;
}

/**
 * Compute spectral phasors for all paths from one source to receiver
 */
function computeSourcePhasors(
  source: ProbeComputeSource,
  _probePosition: Point3D,  // Reserved for future path-specific calculations
  paths: RayPath[],
  config: ProbeComputeConfig
): SpectralPhasor[] {
  const spectralPhasors: SpectralPhasor[] = [];
  const spectrum = applyGainToSpectrum(source.spectrum, source.gain ?? 0);
  
  for (const path of paths) {
    const phasors: Phasor[] = [];
    
    for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
      const freq = OCTAVE_BANDS[i];
      const sourceLevel = spectrum[i];
      
      const level = calculatePathLevel(sourceLevel, path, freq, config);
      const phase = calculatePathPhase(path, freq, config);
      
      phasors.push({
        pressure: dBToPressure(level),
        phase,
      });
    }
    
    spectralPhasors.push(phasors);
  }
  
  return spectralPhasors;
}

/**
 * Sum spectral phasors either coherently or energetically
 */
function sumSourceSpectralPhasors(
  spectralPhasors: SpectralPhasor[],
  coherent: boolean
): Spectrum9 {
  if (spectralPhasors.length === 0) {
    return createEmptySpectrum();
  }
  
  if (coherent) {
    return sumSpectralPhasorsCoherent(spectralPhasors);
  }
  
  // Energetic sum (incoherent)
  const result: number[] = [];
  for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
    let totalEnergy = 0;
    for (const sp of spectralPhasors) {
      const p = sp[i].pressure;
      totalEnergy += p * p;
    }
    result.push(pressureTodB(Math.sqrt(totalEnergy)));
  }
  return result as Spectrum9;
}

/**
 * Full coherent probe computation using ray tracing
 */
export function computeProbeCoherent(
  probePosition: Point3D,
  sources: ProbeComputeSource[],
  walls: ProbeComputeWall[],
  config: ProbeComputeConfig = DEFAULT_PROBE_CONFIG
): ProbeComputeResult {
  const c = config.speedOfSound ?? calcSpeedOfSound(config.temperature);
  
  // Separate barriers (can block and diffract) from buildings (reflect)
  const barriers = walls.filter(w => w.type === 'barrier');
  const buildings = walls.filter(w => w.type === 'building');
  
  const barrierSurfaces = wallsToSurfaces(barriers);
  const buildingSurfaces = wallsToSurfaces(buildings);
  
  // Ray tracing config
  const rtConfig: RayTracingConfig = {
    includeGround: config.groundReflection,
    ground: {
      type: config.groundType,
      flowResistivity: config.groundFlowResistivity,
      mixedFactor: config.groundMixedFactor,
    },
    maxReflectionOrder: config.wallReflections ? 1 : 0,
    includeDiffraction: config.barrierDiffraction,
    speedOfSound: c,
  };
  
  const sourceContributions: SourceProbeContribution[] = [];
  const allSourceSpectra: Spectrum9[] = [];
  let totalPathCount = 0;
  let totalValidPathCount = 0;
  let totalGhostCount = 0;
  
  for (const source of sources) {
    // Trace all paths from this source to probe
    const reflectingSurfaces = config.wallReflections ? buildingSurfaces : [];
    const diffractingSurfaces = config.barrierDiffraction ? barrierSurfaces : [];
    
    const paths = traceAllPaths(
      source.position,
      probePosition,
      reflectingSurfaces,
      diffractingSurfaces,
      rtConfig
    );
    
    totalPathCount += paths.length;
    const validPaths = paths.filter(p => p.valid || p.type === 'diffracted');
    totalValidPathCount += validPaths.length;
    
    // Count ghost sources (all paths except direct)
    totalGhostCount += validPaths.filter(p => p.type !== 'direct').length;
    
    // Handle ground reflection specially using the accurate two-ray model
    let groundPhasor: SpectralPhasor | null = null;
    if (config.groundReflection && source.position.z > 0 && probePosition.z > 0) {
      groundPhasor = computeGroundReflectionPhasor(source, probePosition, config);
    }
    
    // Compute phasors for all other paths
    const nonGroundPaths = paths.filter(p => p.type !== 'ground');
    const pathPhasors = computeSourcePhasors(source, probePosition, nonGroundPaths, config);
    
    // Combine ground phasor with other paths
    const allPhasors = groundPhasor ? [...pathPhasors, groundPhasor] : pathPhasors;
    
    // Sum phasors (coherent or energetic)
    const sourceSpectrum = sumSourceSpectralPhasors(allPhasors, config.coherentSummation);
    
    sourceContributions.push({
      sourceId: source.id,
      spectrum: sourceSpectrum,
      pathTypes: [...new Set(validPaths.map(p => p.type))],
      directDistance: distance3D(source.position, probePosition),
    });
    
    allSourceSpectra.push(sourceSpectrum);
  }
  
  // Sum all sources (always energetic - different sources are incoherent)
  const totalSpectrum = allSourceSpectra.length > 0
    ? sumMultipleSpectra(allSourceSpectra)
    : createEmptySpectrum();
  
  return {
    spectrum: totalSpectrum,
    LAeq: calculateOverallLevel(totalSpectrum, 'A'),
    LCeq: calculateOverallLevel(totalSpectrum, 'C'),
    LZeq: calculateOverallLevel(totalSpectrum, 'Z'),
    pathCount: totalPathCount,
    validPathCount: totalValidPathCount,
    ghostCount: totalGhostCount,
    sourceContributions,
  };
}

/**
 * Compute ground reflection using the accurate two-ray phasor model
 * from ground.ts for proper interference modeling
 */
function computeGroundReflectionPhasor(
  source: ProbeComputeSource,
  receiver: Point3D,
  config: ProbeComputeConfig
): SpectralPhasor {
  const spectrum = applyGainToSpectrum(source.spectrum, source.gain ?? 0);
  const c = config.speedOfSound ?? calcSpeedOfSound(config.temperature);
  
  const hs = source.position.z;
  const hr = receiver.z;
  const d = Math.sqrt(
    Math.pow(receiver.x - source.position.x, 2) +
    Math.pow(receiver.y - source.position.y, 2)
  );
  
  // Direct path distance (ground reflected distance r2 = sqrt(d² + (hs+hr)²)
  // is computed internally by agrTwoRayDb)
  const r1 = Math.sqrt(d * d + (hs - hr) * (hs - hr)); // Direct
  
  const phasors: Phasor[] = [];
  
  for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
    const freq = OCTAVE_BANDS[i];
    const sourceLevel = spectrum[i];
    
    // Use two-ray model to get the combined direct + ground level
    // This already accounts for phase interference
    const agrDb = agrTwoRayDb(
      freq, d, hs, hr,
      config.groundType,
      config.groundFlowResistivity,
      config.groundMixedFactor,
      c
    );
    
    // The agrDb gives the relative level change from interference
    // We need to apply it to the direct path level
    const directAtten = calculatePathAttenuation(r1, freq, config);
    const level = sourceLevel - directAtten - agrDb;
    
    // Phase is complex for two-ray - use the direct path phase as reference
    const k = (2 * Math.PI * freq) / c;
    const phase = -k * r1;
    
    phasors.push({
      pressure: dBToPressure(level),
      phase,
    });
  }
  
  return phasors;
}

/**
 * Simple probe computation (backward compatible with original probe worker)
 * Uses only direct path with spherical spreading - fast but less accurate
 */
export function computeProbeSimple(
  probePosition: Point3D,
  sources: ProbeComputeSource[]
): Spectrum9 {
  const bandEnergies: number[][] = OCTAVE_BANDS.map(() => []);
  
  for (const source of sources) {
    const dist = distance3D(source.position, probePosition);
    const divLoss = spreadingLoss(dist, 'spherical');
    const spectrum = applyGainToSpectrum(source.spectrum, source.gain ?? 0);
    
    for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
      const levelAtProbe = spectrum[i] - divLoss;
      bandEnergies[i].push(levelAtProbe);
    }
  }
  
  // Energetic sum per band
  const result: number[] = [];
  for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
    const levels = bandEnergies[i].filter(l => l > MIN_LEVEL);
    if (levels.length === 0) {
      result.push(35); // Ambient floor
    } else {
      const energy = levels.reduce((sum, l) => sum + Math.pow(10, l / 10), 0);
      result.push(10 * Math.log10(energy));
    }
  }
  
  return result as Spectrum9;
}
