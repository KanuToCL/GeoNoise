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
 * Geometric spreading loss constants (exact values from ISO 9613-2)
 *
 * For point sources (spherical spreading):
 *   A_div = 20·log₁₀(r) + 10·log₁₀(4π)
 *   where 10·log₁₀(4π) ≈ 10.99 dB (often rounded to 11 dB)
 *
 * For line sources (cylindrical spreading):
 *   A_div = 10·log₁₀(r) + 10·log₁₀(2π)
 *   where 10·log₁₀(2π) ≈ 7.98 dB (often rounded to 8 dB)
 *
 * Using exact constants for maximum accuracy.
 */
const SPHERICAL_CONSTANT = 10 * Math.log10(4 * Math.PI); // ≈ 10.99 dB
const CYLINDRICAL_CONSTANT = 10 * Math.log10(2 * Math.PI); // ≈ 7.98 dB

/**
 * Calculate geometric spreading loss (divergence attenuation)
 *
 * IMPORTANT: Source Level Convention
 * ----------------------------------
 * This function assumes source levels are specified as Sound Power Level (Lw)
 * in dB re 1 pW, which is the standard convention in ISO 9613-2.
 *
 * The formula converts from Lw to SPL at distance r:
 *   SPL = Lw - A_div
 *
 * For spherical spreading (point source):
 *   A_div = 20·log₁₀(r) + 10·log₁₀(4π) ≈ 20·log₁₀(r) + 11
 *
 * For cylindrical spreading (line source):
 *   A_div = 10·log₁₀(r) + 10·log₁₀(2π) ≈ 10·log₁₀(r) + 8
 *
 * If sources are specified as SPL at 1m reference instead of Lw, use
 * spreadingLossFromReference() which omits the geometric constant.
 *
 * @param distance - Distance from source to receiver in meters
 * @param type - 'spherical' for point sources (inverse square law)
 *               'cylindrical' for infinite line sources
 * @returns Attenuation in dB (always positive for r > 1)
 *
 * @see ISO 9613-2:1996 Section 6.2 - Geometrical divergence
 * @see PHYSICS_REFERENCE.md Section 1 - Propagation Model
 */
export function spreadingLoss(
  distance: number,
  type: 'spherical' | 'cylindrical' = 'spherical'
): number {
  if (distance < MIN_DISTANCE) {
    distance = MIN_DISTANCE;
  }

  if (type === 'spherical') {
    // Point source: A_div = 20·log₁₀(r) + 10·log₁₀(4π)
    return 20 * Math.log10(distance) + SPHERICAL_CONSTANT;
  } else {
    // Line source: A_div = 10·log₁₀(r) + 10·log₁₀(2π)
    return 10 * Math.log10(distance) + CYLINDRICAL_CONSTANT;
  }
}

/**
 * Calculate spreading loss for sources specified as SPL at 1m reference
 *
 * Use this function when source levels are given as SPL measured at 1m
 * from the source (common in equipment datasheets) rather than as
 * Sound Power Level (Lw).
 *
 * For spherical spreading:
 *   SPL(r) = SPL(1m) - 20·log₁₀(r)
 *   So A_div = 20·log₁₀(r) (no geometric constant)
 *
 * For cylindrical spreading:
 *   SPL(r) = SPL(1m) - 10·log₁₀(r)
 *
 * @param distance - Distance from source in meters
 * @param type - 'spherical' or 'cylindrical'
 * @returns Attenuation in dB relative to 1m reference
 */
export function spreadingLossFromReference(
  distance: number,
  type: 'spherical' | 'cylindrical' = 'spherical'
): number {
  if (distance < MIN_DISTANCE) {
    distance = MIN_DISTANCE;
  }

  if (type === 'spherical') {
    // Simple inverse square law from 1m reference
    return 20 * Math.log10(distance);
  } else {
    // Cylindrical spreading from 1m reference
    return 10 * Math.log10(distance);
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
 * ISO 9613-2 Table 3 - Source/receiver region coefficients.
 *
 * Formula: As or Ar = a'(f) + b'(f)·G + c'(f)·G·log(hs)·log(dp) + d'(f)·G·log(dp)
 * where:
 *   h = max(height, 0) in meters
 *   dp = min(30×h, distance) - characteristic distance for region
 *
 * These coefficients are from ISO 9613-2:1996 Table 3 for source/receiver regions.
 * The values produce frequency-dependent ground effect for soft ground (G=1).
 */
const ISO_TABLE_3: Record<number, { a: number; b: number; c: number; d: number }> = {
  63:   { a: -1.5, b: -3.0,  c: 1.5,   d: -1.5  },
  125:  { a: -1.5, b: -3.0,  c: 1.5,   d: -1.5  },
  250:  { a: -1.5, b: -3.0,  c: 1.5,   d: -1.5  },
  500:  { a: -1.5, b: -3.0,  c: 1.5,   d: -1.5  },
  1000: { a: -1.5, b: -3.0,  c: 1.5,   d: -1.5  },
  2000: { a: -1.5, b: 0.0,   c: 1.5,   d: 0.0   },
  4000: { a: -1.5, b: 0.0,   c: 1.5,   d: 0.0   },
  8000: { a: -1.5, b: 0.0,   c: 1.5,   d: 0.0   },
};

/**
 * ISO 9613-2 Table 4 - Middle region coefficients.
 *
 * Formula: Am = a(f)·q + b(f)·(1-Gm)·q
 * where:
 *   q = max(0, 1 - 30×(hs+hr)/d)
 *   q represents the fraction of path in "middle" region between source/receiver
 *
 * For long paths over soft ground at low frequencies, Am can be significant.
 * At high frequencies, ground absorption dominates and Am is less negative.
 */
const ISO_TABLE_4: Record<number, { a: number; b: number }> = {
  63:   { a: -3.0, b: 3.0 },
  125:  { a: -3.0, b: 3.0 },
  250:  { a: -3.0, b: 3.0 },
  500:  { a: -3.0, b: 3.0 },
  1000: { a: -3.0, b: 3.0 },
  2000: { a: -3.0, b: 3.0 },
  4000: { a: -3.0, b: 3.0 },
  8000: { a: -3.0, b: 3.0 },
};

/**
 * Map frequency to nearest standard octave band center frequency.
 */
function nearestOctaveBand(frequency: number): number {
  const bands = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
  let nearest = bands[0];
  let minDiff = Math.abs(Math.log2(frequency) - Math.log2(bands[0]));

  for (const band of bands) {
    const diff = Math.abs(Math.log2(frequency) - Math.log2(band));
    if (diff < minDiff) {
      minDiff = diff;
      nearest = band;
    }
  }
  return nearest;
}

/**
 * Calculate source or receiver region ground effect (As or Ar).
 * ISO 9613-2 Section 7.3.1 / Table 3
 *
 * @param height - Height of source or receiver (m)
 * @param distance - Horizontal distance from source to receiver (m)
 * @param G - Ground factor (0=hard, 1=soft)
 * @param frequency - Frequency in Hz
 */
function calculateRegionEffect(
  height: number,
  distance: number,
  G: number,
  frequency: number
): number {
  const band = nearestOctaveBand(frequency);
  const coeffs = ISO_TABLE_3[band] ?? ISO_TABLE_3[1000];

  // dp = min(30×h, d) - characteristic distance for this region
  const h = Math.max(height, 0.001); // Avoid log(0)
  const dp = Math.min(30 * h, distance);

  // Clamp values for log stability
  const hClamped = Math.max(h, 0.001);
  const dpClamped = Math.max(dp, 0.001);

  // As or Ar = a'(f) + b'(f)·G·log(h) + c'(f)·G·log(dp) + d'(f)·G
  // Note: For soft ground (G=1), this gives frequency-dependent attenuation
  // For hard ground (G=0), this simplifies significantly
  const A = coeffs.a
    + coeffs.b * G * Math.log10(hClamped)
    + coeffs.c * G * Math.log10(dpClamped)
    + coeffs.d * G;

  return A;
}

/**
 * Calculate middle region ground effect (Am).
 * ISO 9613-2 Section 7.3.1 / Table 4
 *
 * @param sourceHeight - Source height (m)
 * @param receiverHeight - Receiver height (m)
 * @param distance - Horizontal distance (m)
 * @param G - Ground factor for middle region (0=hard, 1=soft)
 * @param frequency - Frequency in Hz
 */
function calculateMiddleRegionEffect(
  sourceHeight: number,
  receiverHeight: number,
  distance: number,
  G: number,
  frequency: number
): number {
  const band = nearestOctaveBand(frequency);
  const coeffs = ISO_TABLE_4[band] ?? ISO_TABLE_4[1000];

  // q = max(0, 1 - 30×(hs+hr)/d)
  // q represents the fraction of the path that is in the "middle" region
  const d = Math.max(distance, 0.1);
  const q = Math.max(0, 1 - 30 * (sourceHeight + receiverHeight) / d);

  // Am = a(f)·q + b(f)·(1-Gm)·q
  const Am = coeffs.a * q + coeffs.b * (1 - G) * q;

  return Am;
}

/**
 * ISO 9613-2 ground effect with frequency-dependent coefficients.
 *
 * Agr = As + Ar + Am
 *
 * This implements the full ISO 9613-2 Tables 3-4 calculation.
 *
 * @param distance - Horizontal distance (m)
 * @param sourceHeight - Source height above ground (m)
 * @param receiverHeight - Receiver height above ground (m)
 * @param groundFactor - G factor (0=hard, 1=soft, 0.5=mixed)
 * @param frequency - Frequency in Hz
 * @returns Ground attenuation Agr in dB (negative = boost, positive = attenuation)
 */
export function agrISO9613PerBand(
  distance: number,
  sourceHeight: number,
  receiverHeight: number,
  groundFactor: number,
  frequency: number
): number {
  const G = Math.max(0, Math.min(1, groundFactor));
  const d = Math.max(distance, 0.1);

  // Source region (As)
  const As = calculateRegionEffect(sourceHeight, d, G, frequency);

  // Receiver region (Ar)
  const Ar = calculateRegionEffect(receiverHeight, d, G, frequency);

  // Middle region (Am)
  const Am = calculateMiddleRegionEffect(sourceHeight, receiverHeight, d, G, frequency);

  // Total ground effect
  const Agr = As + Ar + Am;

  // ISO 9613-2 notes that Agr should be clamped for certain conditions
  // For very short distances or tall source/receiver, clamp to reasonable range
  return Math.max(-3, Agr); // Allow up to 3 dB boost (constructive interference)
}

/**
 * Legacy ISO 9613-2 Eq. (10) ground attenuation (Dn omitted by design).
 * Uses simplified mean height hm = (hs + hr) / 2 (ISO Fig. 3 method omitted).
 *
 * @deprecated Use agrISO9613PerBand for frequency-dependent calculation
 */
export function agrIsoEq10Db(distance: number, sourceHeight: number, receiverHeight: number): number {
  // ISO Eq. (10) expects source–receiver distance; use full 3D distance (r1) here.
  const hm = 0.5 * (sourceHeight + receiverHeight);
  const d = Math.max(distance, 1.0);
  const agr = 4.8 - (2 * hm / d) * (17 + (300 / d));
  return Math.max(0, agr);
}

/**
 * Calculate ground effect using ISO 9613-2 per-band coefficients.
 *
 * Issue #20 Fix: Now uses frequency-dependent Tables 3-4 instead of
 * the simplified frequency-independent Eq. (10).
 *
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
  // Map ground type to G factor
  let G: number;
  switch (groundType) {
    case GroundType.Hard:
      G = 0;
      break;
    case GroundType.Soft:
      G = 1;
      break;
    case GroundType.Mixed:
    default:
      G = 0.5;
      break;
  }

  // Use the new per-band ISO 9613-2 calculation
  return agrISO9613PerBand(distance, sourceHeight, receiverHeight, G, frequency);
}

// ============================================================================
// Barrier Attenuation
// ============================================================================

/** Barrier type for diffraction calculation */
export type BarrierType = 'thin' | 'thick';

/**
 * Calculate barrier insertion loss using Maekawa-style screen attenuation.
 *
 * @param pathDifference - Path length difference in meters (delta)
 * @param frequency - Frequency in Hz
 * @param wavelength - Wavelength in meters (optional, computed from frequency if not provided)
 * @param barrierType - 'thin' for screens/walls, 'thick' for buildings (double-edge diffraction)
 */
export function barrierAttenuation(
  pathDifference: number,
  frequency: number,
  wavelength?: number,
  barrierType: BarrierType = 'thin'
): number {
  // ISO 9613-2 / Kurze-Anderson / Maekawa-style screen approximation.
  //
  // Inputs:
  //   - pathDifference (delta) in meters, computed as (A + B - d) where:
  //       A = distance3D(source, barrier-top-point)
  //       B = distance3D(barrier-top-point, receiver)
  //       d = direct distance3D(source, receiver)
  //   - frequency in Hz
  //   - barrierType: 'thin' or 'thick'
  //
  // Fresnel number:
  //   N = 2 * delta / lambda
  //
  // Insertion loss approximation:
  //   Thin barrier (single edge):  Abar = 10 * log10(3 + 20 * N), cap 20 dB
  //   Thick barrier (double edge): Abar = 10 * log10(3 + 40 * N), cap 25 dB
  //
  // The thick barrier formula uses coefficient 40 to account for double-edge
  // diffraction (sound must diffract over entry edge AND exit edge of building).
  //
  // Clamps:
  //   - If N < -0.1, return 0 dB (prevents non-physical negative insertion loss)
  //   - Cap at 20 dB (thin) or 25 dB (thick) to model practical limits

  const lambda = wavelength ?? 343 / frequency;
  const N = (2 * pathDifference) / lambda;

  if (N < -0.1) return 0;

  // Select coefficient and cap based on barrier type
  const coefficient = barrierType === 'thick' ? 40 : 20;
  const maxAttenuation = barrierType === 'thick' ? 25 : 20;

  const attenuation = 10 * Math.log10(3 + coefficient * N);

  return Math.min(attenuation, maxAttenuation);
}

// ============================================================================
// Combined Propagation
// ============================================================================

/**
 * Barrier geometry info for ISO 9613-2 Section 7.4 ground partitioning.
 * When provided for blocked paths, ground effect is calculated separately
 * for source-side and receiver-side regions.
 */
export interface BarrierGeometryInfo {
  /** Horizontal distance from source to barrier diffraction point (meters) */
  distSourceToBarrier: number;
  /** Horizontal distance from barrier diffraction point to receiver (meters) */
  distBarrierToReceiver: number;
  /** Height of the barrier diffraction edge (meters) */
  barrierHeight: number;
}

/**
 * Calculate ground effect for a path segment (source region or receiver region).
 *
 * ISO 9613-2 Section 7.4: For diffracted paths, ground effect should be
 * calculated separately for each segment (source→barrier and barrier→receiver).
 *
 * @param distance - Horizontal distance of segment in meters
 * @param sourceZ - Height of start point above ground in meters
 * @param receiverZ - Height of end point above ground in meters
 * @param config - Propagation configuration
 * @param meteo - Meteorological conditions
 * @param frequency - Frequency in Hz
 */
function calculateGroundEffectRegion(
  distance: number,
  sourceZ: number,
  receiverZ: number,
  config: PropagationConfig,
  meteo: Meteo,
  frequency: number
): number {
  if (!config.groundReflection) return 0;

  if (config.groundModel === 'twoRayPhasor') {
    const c = speedOfSound(meteo.temperature ?? 20);
    // For path segment, use horizontal distance directly
    return agrTwoRayDb(
      frequency,
      distance,
      sourceZ,
      receiverZ,
      config.groundType,
      config.groundSigmaSoft ?? 20000,
      config.groundMixedFactor ?? 0.5,
      c
    );
  } else {
    // Legacy ISO 9613-2 Eq. (10)
    const gt =
      config.groundType === 'hard'
        ? GroundType.Hard
        : config.groundType === 'soft'
          ? GroundType.Soft
          : GroundType.Mixed;
    return groundEffect(distance, sourceZ, receiverZ, gt, frequency);
  }
}

/**
 * Calculate total propagation loss for a single path
 *
 * @param distance - Direct source-to-receiver distance in meters
 * @param sourceHeight - Source height above ground in meters
 * @param receiverHeight - Receiver height above ground in meters
 * @param config - Propagation configuration
 * @param meteo - Meteorological conditions
 * @param barrierPathDiff - Path difference (delta) for barrier diffraction
 * @param barrierBlocked - Whether direct path is blocked by barrier
 * @param frequency - Frequency in Hz (default 1000 Hz)
 * @param actualPathLength - Actual path length sound travels (for atmospheric absorption).
 *                           For diffracted paths this is longer than direct distance.
 *                           If not provided, uses direct distance.
 * @param barrierType - Type of barrier ('thin' for walls, 'thick' for buildings).
 *                      Issue #16: thick barriers use coefficient 40 and cap 25 dB.
 * @param barrierInfo - Optional barrier geometry for ISO 9613-2 Section 7.4 ground partitioning.
 *                      Issue #3: When provided, ground effect is calculated for source and
 *                      receiver regions separately, and barrier+ground are additive.
 */
export function calculatePropagation(
  distance: number,
  sourceHeight: number,
  receiverHeight: number,
  config: PropagationConfig,
  meteo: Meteo,
  barrierPathDiff = 0,
  barrierBlocked = false,
  frequency = 1000,
  actualPathLength?: number,
  barrierType: BarrierType = 'thin',
  barrierInfo?: BarrierGeometryInfo
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

  // Issue #4 Fix: Atmospheric absorption uses the ACTUAL path length sound travels.
  // For diffracted paths, this is longer than direct distance (sound goes over/around barrier).
  // If actualPathLength is not provided, fall back to direct distance (unblocked paths).
  const pathForAbsorption = actualPathLength ?? distance;
  const Aatm = totalAtmosphericAbsorption(pathForAbsorption, frequency, config, meteo);

  // Ground effect and barrier attenuation calculation
  // Issue #3 Fix: ISO 9613-2 Section 7.4 - For diffracted paths, ground effect
  // should be partitioned into source-side and receiver-side regions, and the
  // barrier attenuation should be ADDITIVE with ground effect (not max).
  let Agr = 0;
  let Abar = 0;

  if (barrierBlocked && barrierInfo && config.groundReflection) {
    // =========================================================================
    // ISO 9613-2 Section 7.4: Partitioned ground effect for blocked paths
    // =========================================================================
    // When barrier geometry is provided, calculate ground effect separately for:
    // - Source region (source → barrier diffraction point)
    // - Receiver region (barrier diffraction point → receiver)
    //
    // Ground effect formula:
    //   A_gr = A_gr_source + A_gr_receiver
    //
    // Total attenuation (ADDITIVE, not max):
    //   A_total = A_div + A_atm + A_bar + A_gr
    // =========================================================================
    const { distSourceToBarrier, distBarrierToReceiver, barrierHeight } = barrierInfo;

    // Source-side ground effect (source to barrier top)
    const Agr_source = calculateGroundEffectRegion(
      distSourceToBarrier,
      sourceHeight,
      barrierHeight, // "receiver" for this segment is the barrier diffraction edge
      config,
      meteo,
      frequency
    );

    // Receiver-side ground effect (barrier top to receiver)
    const Agr_receiver = calculateGroundEffectRegion(
      distBarrierToReceiver,
      barrierHeight, // "source" for this segment is the barrier diffraction edge
      receiverHeight,
      config,
      meteo,
      frequency
    );

    // Total ground effect is sum of both regions
    Agr = Agr_source + Agr_receiver;

    // Barrier attenuation (uses Issue #16 thin/thick formula)
    const c = speedOfSound(meteo.temperature ?? 20);
    const lambda = c / frequency;
    Abar = barrierAttenuation(barrierPathDiff, frequency, lambda, barrierType);
  } else if (barrierBlocked && config.includeBarriers) {
    // =========================================================================
    // Legacy behavior when barrierInfo is not provided
    // =========================================================================
    // Uses max(Abar, Agr) to avoid negative insertion loss on soft ground.
    // This is the fallback for callers that don't provide barrier geometry.

    // Calculate full-path ground effect
    if (config.groundReflection) {
      if (config.groundModel === 'twoRayPhasor') {
        const c = speedOfSound(meteo.temperature ?? 20);
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
    const c = speedOfSound(meteo.temperature ?? 20);
    const lambda = c / frequency;
    Abar = barrierAttenuation(barrierPathDiff, frequency, lambda, barrierType);
  } else if (config.groundReflection) {
    // =========================================================================
    // Unblocked path: normal ground effect calculation
    // =========================================================================
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

  // =========================================================================
  // Final attenuation calculation
  // =========================================================================
  // - With barrierInfo:  A_total = A_div + A_atm + A_bar + A_gr  (ADDITIVE - ISO 9613-2 §7.4)
  // - Without barrierInfo (legacy): A_total = A_div + A_atm + max(A_bar, A_gr)
  // - Unblocked: A_total = A_div + A_atm + A_gr
  //
  // The max() fallback for legacy blocked paths prevents negative insertion loss
  // when a small barrier attenuation would otherwise replace larger ground effect.
  let totalAttenuation: number;
  if (barrierBlocked && barrierInfo) {
    // Issue #3 Fix: Additive combination per ISO 9613-2 Section 7.4
    totalAttenuation = Adiv + Aatm + Abar + Agr;
  } else if (barrierBlocked) {
    // Legacy fallback: max() to avoid negative insertion loss
    const barrierTerm = Math.max(Abar, Agr);
    totalAttenuation = Adiv + Aatm + barrierTerm;
  } else {
    // Unblocked path
    totalAttenuation = Adiv + Aatm + Agr;
  }

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
 *
 * @param distance - Direct source-to-receiver distance in meters
 * @param sourceHeight - Source height above ground in meters
 * @param receiverHeight - Receiver height above ground in meters
 * @param config - Propagation configuration
 * @param meteo - Meteorological conditions
 * @param barrierPathDiff - Path difference (delta) for barrier diffraction
 * @param barrierBlocked - Whether direct path is blocked by barrier
 * @param actualPathLength - Actual path length sound travels (for atmospheric absorption)
 * @param barrierType - Type of barrier ('thin' for walls, 'thick' for buildings)
 * @param barrierInfo - Optional barrier geometry for ISO 9613-2 Section 7.4 ground partitioning
 */
export function calculateBandedPropagation(
  distance: number,
  sourceHeight: number,
  receiverHeight: number,
  config: PropagationConfig,
  meteo: Meteo,
  barrierPathDiff = 0,
  barrierBlocked = false,
  actualPathLength?: number,
  barrierType: BarrierType = 'thin',
  barrierInfo?: BarrierGeometryInfo
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
      freq,
      actualPathLength,
      barrierType,
      barrierInfo
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
    1000,
    actualPathLength,
    barrierType,
    barrierInfo
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
