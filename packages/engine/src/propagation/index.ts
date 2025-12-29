/**
 * Sound propagation model v1
 * Implements spreading, atmospheric absorption, ground effects
 */

import {
  MIN_DISTANCE,
  MAX_DISTANCE,
  MIN_LEVEL,
  OCTAVE_BANDS,
  A_WEIGHTING_OCTAVE,
  C_WEIGHTING_OCTAVE,
  sumDecibels,
} from '@geonoise/shared';
import {
  atmosphericAbsorptionSimple,
  atmosphericAbsorptionISO9613,
  groundFactor,
  GroundType,
  speedOfSound,
} from '@geonoise/core';
import type { PropagationConfig, Meteo } from '@geonoise/core';
import { agrTwoRayDb } from './ground.js';

// ============================================================================
// Propagation Result
// ============================================================================

/** Result of propagation calculation for a single path */
export interface PropagationResult {
  /** Total attenuation in dB */
  totalAttenuation: number;
  /** Spreading loss in dB */
  spreadingLoss: number;
  /** Atmospheric absorption in dB */
  atmosphericAbsorption: number;
  /** Ground effect in dB */
  groundEffect: number;
  /** Barrier attenuation in dB */
  barrierAttenuation: number;
  /** Distance in meters */
  distance: number;
  /** Path is blocked */
  blocked: boolean;
}

/** Per-band propagation result */
export interface BandedPropagationResult {
  bands: Map<number, PropagationResult>;
  overall: PropagationResult;
}

// ============================================================================
// Spreading Loss
// ============================================================================

/**
 * Calculate geometric spreading loss
 * @param distance - Distance in meters
 * @param type - 'spherical' (point source) or 'cylindrical' (line source)
 */
export function spreadingLoss(
  distance: number,
  type: 'spherical' | 'cylindrical' = 'spherical'
): number {
  if (distance < MIN_DISTANCE) {
    distance = MIN_DISTANCE;
  }

  if (type === 'spherical') {
    // 20 * log10(r) + 11 for point source (inverse square law)
    return 20 * Math.log10(distance) + 11;
  } else {
    // 10 * log10(r) + 8 for line source (cylindrical spreading)
    return 10 * Math.log10(distance) + 8;
  }
}

// ============================================================================
// Atmospheric Absorption
// ============================================================================

/**
 * Calculate total atmospheric absorption for a path
 * @param distance - Distance in meters
 * @param frequency - Frequency in Hz (for banded calculation)
 * @param config - Propagation config
 * @param meteo - Meteorological conditions
 */
export function totalAtmosphericAbsorption(
  distance: number,
  frequency: number,
  config: PropagationConfig,
  meteo: Meteo
): number {
  if (config.atmosphericAbsorption === 'none') {
    return 0;
  }

  const temp = meteo.temperature ?? 20;
  const humidity = meteo.relativeHumidity ?? 50;
  const pressure = meteo.pressure ?? 101.325;

  let alpha: number;
  if (config.atmosphericAbsorption === 'iso9613') {
    alpha = atmosphericAbsorptionISO9613(frequency, temp, humidity, pressure);
  } else {
    alpha = atmosphericAbsorptionSimple(frequency, temp, humidity);
  }

  return alpha * distance;
}

/**
 * Calculate A-weighted atmospheric absorption for overall level
 * Uses a representative frequency (1000 Hz by default)
 */
export function atmosphericAbsorptionOverall(
  distance: number,
  config: PropagationConfig,
  meteo: Meteo,
  representativeFrequency = 1000
): number {
  return totalAtmosphericAbsorption(distance, representativeFrequency, config, meteo);
}

// ============================================================================
// Ground Effect
// ============================================================================

/**
 * Calculate ground effect (simplified ISO 9613-2)
 * @param distance - Distance in meters
 * @param sourceHeight - Source height above ground in meters
 * @param receiverHeight - Receiver height above ground in meters
 * @param groundType - Type of ground surface
 * @param frequency - Frequency in Hz
 */
export function groundEffect(
  distance: number,
  sourceHeight: number,
  receiverHeight: number,
  groundType: GroundType,
  frequency: number
): number {
  const G = groundFactor(groundType);

  if (G === 0) {
    // Hard ground - no effect for most cases
    return 0;
  }

  // Simplified ground effect based on ISO 9613-2
  // This is a rough approximation
  const dp = distance; // Projected distance
  const hm = (sourceHeight + receiverHeight) / 2; // Mean height

  // Height correction
  if (dp <= 0 || hm <= 0) return 0;

  // Very simplified - real implementation would use full ISO 9613-2
  const q = 30 * hm / dp;
  const Agr = -10 * Math.log10(1 + Math.pow(10, -(q - 5) / 10)) * G;

  // Frequency dependency (simplified)
  if (frequency < 250) {
    return Agr * 0.5;
  } else if (frequency > 2000) {
    return Agr * 0.2;
  }

  return Agr;
}

// ============================================================================
// Barrier Attenuation
// ============================================================================

/**
 * Calculate barrier insertion loss using Maekawa's formula
 * @param pathDifference - Path length difference in meters (delta)
 * @param frequency - Frequency in Hz
 * @param wavelength - Wavelength in meters
 */
export function barrierAttenuation(
  pathDifference: number,
  frequency: number,
  wavelength?: number
): number {
  if (pathDifference <= 0) {
    return 0; // No barrier effect if path difference is negative or zero
  }

  // Calculate wavelength if not provided
  const lambda = wavelength ?? 343 / frequency;

  // Fresnel number
  const N = (2 * pathDifference) / lambda;

  // Maekawa's approximation
  if (N < 0) return 0;
  if (N === 0) return 5;

  const attenuation = 10 * Math.log10(3 + 20 * N);

  // Cap at reasonable maximum
  return Math.min(attenuation, 25);
}

// ============================================================================
// Combined Propagation
// ============================================================================

/**
 * Calculate total propagation loss for a single path
 */
export function calculatePropagation(
  distance: number,
  sourceHeight: number,
  receiverHeight: number,
  config: PropagationConfig,
  meteo: Meteo,
  barrierPathDiff = 0,
  frequency = 1000
): PropagationResult {
  // Check distance limits
  if (distance < MIN_DISTANCE) {
    distance = MIN_DISTANCE;
  }

  if (distance > (config.maxDistance ?? MAX_DISTANCE)) {
    return {
      totalAttenuation: MIN_LEVEL,
      spreadingLoss: 0,
      atmosphericAbsorption: 0,
      groundEffect: 0,
      barrierAttenuation: 0,
      distance,
      blocked: true,
    };
  }

  // Spreading loss
  const Adiv = spreadingLoss(distance, config.spreading);

  // Atmospheric absorption
  const Aatm = totalAtmosphericAbsorption(distance, frequency, config, meteo);

  // Ground effect
  let Agr = 0;
  if (config.groundReflection) {
    if (config.groundModel === 'twoRayPhasor') {
      const c = speedOfSound(meteo.temperature ?? 20);
      Agr = agrTwoRayDb(
        frequency,
        distance,
        sourceHeight,
        receiverHeight,
        config.groundType,
        config.groundSigmaSoft ?? 20000,
        config.groundMixedFactor ?? 0.5,
        c
      );
    } else {
      const gt =
        config.groundType === 'hard'
          ? GroundType.Hard
          : config.groundType === 'soft'
            ? GroundType.Soft
            : GroundType.Mixed;
      Agr = groundEffect(distance, sourceHeight, receiverHeight, gt, frequency);
    }
  }

  // Barrier attenuation
  let Abar = 0;
  if (config.includeBarriers && barrierPathDiff > 0) {
    Abar = barrierAttenuation(barrierPathDiff, frequency);
  }

  const totalAttenuation = Adiv + Aatm + Agr + Abar;

  return {
    totalAttenuation,
    spreadingLoss: Adiv,
    atmosphericAbsorption: Aatm,
    groundEffect: Agr,
    barrierAttenuation: Abar,
    distance,
    blocked: false,
  };
}

/**
 * Calculate propagation for all octave bands
 */
export function calculateBandedPropagation(
  distance: number,
  sourceHeight: number,
  receiverHeight: number,
  config: PropagationConfig,
  meteo: Meteo,
  barrierPathDiff = 0
): BandedPropagationResult {
  const bands = new Map<number, PropagationResult>();

  for (const freq of OCTAVE_BANDS) {
    const result = calculatePropagation(
      distance,
      sourceHeight,
      receiverHeight,
      config,
      meteo,
      barrierPathDiff,
      freq
    );
    bands.set(freq, result);
  }

  // Calculate overall using 1000 Hz as representative
  const overall = calculatePropagation(
    distance,
    sourceHeight,
    receiverHeight,
    config,
    meteo,
    barrierPathDiff,
    1000
  );

  return { bands, overall };
}

// ============================================================================
// Level Calculations
// ============================================================================

/**
 * Calculate sound pressure level at receiver from a source
 * @param soundPowerLevel - Source sound power level in dB
 * @param propagation - Propagation result
 */
export function calculateSPL(soundPowerLevel: number, propagation: PropagationResult): number {
  if (propagation.blocked) {
    return MIN_LEVEL;
  }
  return soundPowerLevel - propagation.totalAttenuation;
}

/**
 * Apply A-weighting to a level at a specific frequency
 */
export function applyAWeighting(level: number, frequency: number): number {
  const weight = A_WEIGHTING_OCTAVE[frequency];
  if (weight === undefined) {
    // Interpolate or use default
    return level;
  }
  return level + weight;
}

/**
 * Apply C-weighting to a level at a specific frequency
 */
export function applyCWeighting(level: number, frequency: number): number {
  const weight = C_WEIGHTING_OCTAVE[frequency];
  if (weight === undefined) {
    return level;
  }
  return level + weight;
}

/**
 * Calculate LAeq from banded levels
 */
export function calculateLAeq(bandLevels: Map<number, number>): number {
  const aWeightedLevels: number[] = [];

  for (const [freq, level] of bandLevels) {
    const weight = A_WEIGHTING_OCTAVE[freq];
    if (weight !== undefined) {
      aWeightedLevels.push(level + weight);
    }
  }

  return sumDecibels(aWeightedLevels);
}

/**
 * Calculate LCeq from banded levels
 */
export function calculateLCeq(bandLevels: Map<number, number>): number {
  const cWeightedLevels: number[] = [];

  for (const [freq, level] of bandLevels) {
    const weight = C_WEIGHTING_OCTAVE[freq];
    if (weight !== undefined) {
      cWeightedLevels.push(level + weight);
    }
  }

  return sumDecibels(cWeightedLevels);
}
