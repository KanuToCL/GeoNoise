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
 * Legacy ISO 9613-2 Eq. (10) ground attenuation (Dn omitted by design).
 * Uses simplified mean height hm = (hs + hr) / 2 (ISO Fig. 3 method omitted).
 */
export function agrIsoEq10Db(distance: number, sourceHeight: number, receiverHeight: number): number {
  // ISO Eq. (10) expects source–receiver distance; use full 3D distance (r1) here.
  const hm = 0.5 * (sourceHeight + receiverHeight);
  const d = Math.max(distance, 1.0);
  const agr = 4.8 - (2 * hm / d) * (17 + (300 / d));
  return Math.max(0, agr);
}

/**
 * Calculate ground effect (legacy ISO 9613-2 Eq. 10 baseline).
 * @param distance - Distance in meters
 * @param sourceHeight - Source height above ground in meters
 * @param receiverHeight - Receiver height above ground in meters
 * @param groundType - Type of ground surface (applied only for soft)
 * @param frequency - Frequency in Hz (legacy ignores this)
 */
export function groundEffect(
  distance: number,
  sourceHeight: number,
  receiverHeight: number,
  groundType: GroundType,
  frequency: number
): number {
  void frequency;
  if (groundType !== GroundType.Soft) return 0;
  return agrIsoEq10Db(distance, sourceHeight, receiverHeight);
}

// ============================================================================
// Barrier Attenuation
// ============================================================================

/**
 * Calculate barrier insertion loss using Maekawa-style screen attenuation.
 * @param pathDifference - Path length difference in meters (delta)
 * @param frequency - Frequency in Hz
 * @param wavelength - Wavelength in meters
 */
export function barrierAttenuation(
  pathDifference: number,
  frequency: number,
  wavelength?: number
): number {
  // ISO 9613-2 / Kurze-Anderson / Maekawa-style single-screen approximation.
  //
  // Inputs:
  //   - pathDifference (delta) in meters, computed as (A + B - d) where:
  //       A = distance3D(source, barrier-top-point)
  //       B = distance3D(barrier-top-point, receiver)
  //       d = direct distance3D(source, receiver)
  //   - frequency in Hz
  //
  // Fresnel number:
  //   N = 2 * delta / lambda
  //
  // Insertion loss approximation:
  //   Abar = 10 * log10( 3 + 20 * N )
  //
  // Clamps:
  //   - If N < -0.1, return 0 dB (prevents non-physical negative insertion loss and keeps log argument safe).
  //   - Cap at 20 dB to model a “single screen” limit (avoids unrealistic infinite attenuation).
  //
  // Note: delta is computed in the CPU engine (packages/engine/src/compute/index.ts) from 2D intersection + 3D heights.
  // Calculate wavelength if not provided
  const lambda = wavelength ?? 343 / frequency;

  // Fresnel number (dimensionless)
  const N = (2 * pathDifference) / lambda;

  if (N < -0.1) return 0;

  const attenuation = 10 * Math.log10(3 + 20 * N);

  // Cap at single-screen limit
  return Math.min(attenuation, 20);
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
  barrierBlocked = false,
  frequency = 1000
): PropagationResult {
  // Barrier parameters:
  // - barrierBlocked: set by the geometry stage when the 2D line-of-sight crosses a barrier segment.
  // - barrierPathDiff: delta (meters) for the "over-the-top" surrogate path. Only meaningful when barrierBlocked=true.
  //
  // IMPORTANT: The overall model clamps the blocked case to avoid negative insertion loss:
  //   blocked:   Atotal = Adiv + Aatm + max(Abar, Agr)
  //   unblocked: Atotal = Adiv + Aatm + Agr
  //
  // This avoids discontinuities where a very small barrier attenuation would otherwise
  // replace (and reduce) a larger ground effect on soft ground.

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

  // Spreading loss (always referenced to the direct source-receiver distance)
  const Adiv = spreadingLoss(distance, config.spreading);

  // Atmospheric absorption (applied along the direct distance; barrier insertion loss is applied separately)
  const Aatm = totalAtmosphericAbsorption(distance, frequency, config, meteo);

  // Ground effect (computed regardless of barrier state for QA continuity):
  // We still calculate Agr even when a barrier blocks the direct path so we can
  // blend or clamp with Abar and avoid negative insertion-loss discontinuities.
  let Agr = 0;
  if (config.groundReflection) {
    if (config.groundModel === 'twoRayPhasor') {
      const c = speedOfSound(meteo.temperature ?? 20);
      // IMPORTANT: agrTwoRayDb expects 2D horizontal distance, not 3D distance.
      // It internally computes r1 and r2 using: r = sqrt(d² + h²)
      // So we need to extract the horizontal component from the 3D distance.
      const heightDiff = sourceHeight - receiverHeight;
      const distance2D = Math.sqrt(Math.max(0, distance * distance - heightDiff * heightDiff));
      Agr = agrTwoRayDb(
        frequency,
        distance2D,
        sourceHeight,
        receiverHeight,
        config.groundType,
        config.groundSigmaSoft ?? 20000,
        config.groundMixedFactor ?? 0.5,
        c
      );
    } else {
      // Legacy ISO 9613-2 Eq. (10) with hm=(hs+hr)/2 and negative values clamped to 0.
      const gt =
        config.groundType === 'hard'
          ? GroundType.Hard
          : config.groundType === 'soft'
            ? GroundType.Soft
            : GroundType.Mixed;
      Agr = groundEffect(distance, sourceHeight, receiverHeight, gt, frequency);
    }
  }

  // Barrier attenuation (enabled only when the SR line crosses a barrier).
  // Uses temperature-dependent speed of sound for lambda = c / f.
  let Abar = 0;
  if (config.includeBarriers && barrierBlocked) {
    const c = speedOfSound(meteo.temperature ?? 20);
    const lambda = c / frequency;
    Abar = barrierAttenuation(barrierPathDiff, frequency, lambda);
  }

  // Final attenuation switch:
  // - Unblocked: Adiv + Aatm + Agr
  // - Blocked:   Adiv + Aatm + max(Abar, Agr)
  //
  // QA rationale (ISO/TR 17534-3: negative insertion loss):
  // If a barrier is detected but its diffraction loss is small (e.g., a low garden wall),
  // a hard swap Abar-for-Agr can *reduce* total attenuation on soft ground and make levels
  // jump upward. Using max(Abar, Agr) ensures a barrier cannot make the result louder than
  // the unblocked ground-effect case while still allowing larger Abar to dominate.
  const barrierTerm = barrierBlocked ? Math.max(Abar, Agr) : Agr;
  const totalAttenuation = Adiv + Aatm + barrierTerm;

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
  barrierPathDiff = 0,
  barrierBlocked = false
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
      barrierBlocked,
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
    barrierBlocked,
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
