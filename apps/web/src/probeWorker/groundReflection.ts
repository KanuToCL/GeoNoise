/**
 * Ground Reflection Module for Probe Worker
 */

import type { Complex, ImpedanceModel, GroundReflectionCoeff, GroundEffectModel } from './types.js';

const EPSILON = 1e-10;

export const FLOW_RESISTIVITY = {
  hard: 2_000_000,
  soft: 20_000,
  gravel: 500_000,
  compactSoil: 100_000,
  snow: 30_000,
} as const;

/**
 * ISO 9613-2 Table 2: Ground absorption coefficients by frequency.
 * These represent the fraction of sound energy absorbed (not reflected).
 *
 * | Freq (Hz) | Hard  | Soft  |
 * |-----------|-------|-------|
 * | 63        | 0.01  | 0.10  |
 * | 125       | 0.01  | 0.15  |
 * | 250       | 0.01  | 0.20  |
 * | 500       | 0.01  | 0.30  |
 * | 1000      | 0.02  | 0.40  |
 * | 2000      | 0.02  | 0.50  |
 * | 4000      | 0.02  | 0.55  |
 * | 8000      | 0.03  | 0.60  |
 */
const ISO9613_GROUND_ABSORPTION: Record<number, { hard: number; soft: number }> = {
  63: { hard: 0.01, soft: 0.10 },
  125: { hard: 0.01, soft: 0.15 },
  250: { hard: 0.01, soft: 0.20 },
  500: { hard: 0.01, soft: 0.30 },
  1000: { hard: 0.02, soft: 0.40 },
  2000: { hard: 0.02, soft: 0.50 },
  4000: { hard: 0.02, soft: 0.55 },
  8000: { hard: 0.03, soft: 0.60 },
};

const OCTAVE_BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];

/**
 * Get ISO 9613-2 ground absorption coefficient for a given frequency and ground type.
 * Returns the reflection coefficient magnitude (1 - absorption).
 */
function getISO9613Absorption(
  frequency: number,
  groundType: 'hard' | 'soft' | 'mixed',
  mixedFactor: number
): number {
  // Find closest octave band
  let closestBand = OCTAVE_BANDS[0];
  let closestDist = Math.abs(Math.log2(frequency / closestBand));
  for (const band of OCTAVE_BANDS) {
    const dist = Math.abs(Math.log2(frequency / band));
    if (dist < closestDist) {
      closestDist = dist;
      closestBand = band;
    }
  }

  const coeffs = ISO9613_GROUND_ABSORPTION[closestBand];
  if (!coeffs) {
    // Fallback for 16000 Hz - extrapolate from 8000 Hz
    return groundType === 'hard' ? 0.03 : 0.65;
  }

  if (groundType === 'hard') {
    return coeffs.hard;
  } else if (groundType === 'soft') {
    return coeffs.soft;
  } else {
    // Mixed: linear interpolation based on G factor
    const G = Math.max(0, Math.min(1, mixedFactor));
    return coeffs.hard * (1 - G) + coeffs.soft * G;
  }
}

export function complexDivide(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  if (denom < EPSILON) return { re: 0, im: 0 };
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
}

export function complexMagnitude(z: Complex): number {
  return Math.sqrt(z.re * z.re + z.im * z.im);
}

export function complexPhase(z: Complex): number {
  return Math.atan2(z.im, z.re);
}

export function delanyBazleyImpedance(frequency: number, flowResistivity: number): Complex {
  const X = frequency / flowResistivity;
  const Xc = Math.max(0.001, Math.min(X, 10.0));
  return { re: 1 + 9.08 * Math.pow(Xc, -0.75), im: -11.9 * Math.pow(Xc, -0.73) };
}

export function mikiImpedance(frequency: number, flowResistivity: number): Complex {
  const X = frequency / flowResistivity;
  const Xc = Math.max(0.001, Math.min(X, 100.0));
  return { re: 1 + 5.5 * Math.pow(Xc, -0.632), im: -8.43 * Math.pow(Xc, -0.632) };
}

export function calculateSurfaceImpedance(frequency: number, flowResistivity: number, model: ImpedanceModel = 'auto'): Complex {
  const X = frequency / flowResistivity;
  if (model === 'delany-bazley') return delanyBazleyImpedance(frequency, flowResistivity);
  if (model === 'miki') return mikiImpedance(frequency, flowResistivity);
  return X < 1.0 ? delanyBazleyImpedance(frequency, flowResistivity) : mikiImpedance(frequency, flowResistivity);
}

export function calculateReflectionCoefficient(Zn: Complex, incidenceAngle: number): Complex {
  const cosTheta = Math.cos(incidenceAngle);
  const ZnCosTheta: Complex = { re: Zn.re * cosTheta, im: Zn.im * cosTheta };
  const numerator: Complex = { re: ZnCosTheta.re - 1, im: ZnCosTheta.im };
  const denominator: Complex = { re: ZnCosTheta.re + 1, im: ZnCosTheta.im };
  return complexDivide(numerator, denominator);
}

export function calculateMixedFlowResistivity(mixedFactor: number): number {
  const G = Math.max(0, Math.min(1, mixedFactor));
  const logSigmaHard = Math.log(FLOW_RESISTIVITY.hard);
  const logSigmaSoft = Math.log(FLOW_RESISTIVITY.soft);
  return Math.exp(logSigmaHard * (1 - G) + logSigmaSoft * G);
}

export function getGroundReflectionCoeff(
  groundType: 'hard' | 'soft' | 'mixed',
  mixedFactor: number,
  frequency: number,
  incidenceAngle?: number,
  impedanceModel: ImpedanceModel = 'auto',
  groundEffectModel: GroundEffectModel = 'impedance'
): GroundReflectionCoeff {
  // ISO 9613-2 simplified model: uses Table 2 absorption coefficients
  if (groundEffectModel === 'iso9613') {
    const absorption = getISO9613Absorption(frequency, groundType, mixedFactor);
    // Reflection magnitude = 1 - absorption (energy-based)
    // Phase shift: π for hard ground (total reflection), less for soft
    const magnitude = 1 - absorption;
    // Simplified phase model: hard ground has near-π phase shift,
    // soft ground has reduced phase shift due to absorption
    const phase = Math.PI * magnitude;
    return { magnitude, phase };
  }

  // Full impedance model: Delany-Bazley/Miki with complex reflection coefficient
  let flowResistivity: number;
  if (groundType === 'hard') flowResistivity = FLOW_RESISTIVITY.hard;
  else if (groundType === 'soft') flowResistivity = FLOW_RESISTIVITY.soft;
  else flowResistivity = calculateMixedFlowResistivity(mixedFactor);

  const theta = incidenceAngle ?? Math.PI / 2 - 0.087;
  const Zn = calculateSurfaceImpedance(frequency, flowResistivity, impedanceModel);
  const Gamma = calculateReflectionCoefficient(Zn, theta);

  return { magnitude: complexMagnitude(Gamma), phase: complexPhase(Gamma) };
}
