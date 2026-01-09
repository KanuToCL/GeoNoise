import { clamp } from '@geonoise/shared';
import type { PropagationConfig } from '@geonoise/core';
import {
  complex,
  complexAbs,
  complexAdd,
  complexDiv,
  complexExpj,
  complexMul,
  complexSqrt,
  complexScale,
  complexSub,
  type Complex,
} from './complex.js';

export type GroundType = PropagationConfig['groundType'];
export type GroundMixedSigmaModel = PropagationConfig['groundMixedSigmaModel'];

/**
 * Very high sigma value representing effectively rigid/hard ground.
 * At this value, |Γ| ≈ 1 (total reflection).
 */
const SIGMA_HARD = 1e9;

/**
 * Calculate effective flow resistivity for mixed ground.
 *
 * Issue #12 Fix: Provides two physically-based interpolation methods
 * instead of the previous arbitrary formula.
 *
 * @param groundType - 'hard' | 'mixed' | 'soft'
 * @param sigmaSoft - Flow resistivity for soft ground (Pa·s/m²)
 * @param mixedFactor - G factor (0 = hard, 1 = soft)
 * @param model - Interpolation model: 'iso9613' | 'logarithmic'
 * @returns Effective flow resistivity σ in Pa·s/m²
 */
export function getEffectiveSigma(
  groundType: GroundType,
  sigmaSoft: number,
  mixedFactor: number,
  model: GroundMixedSigmaModel = 'iso9613'
): number {
  // Pure soft ground
  if (groundType === 'soft') {
    return sigmaSoft;
  }

  // Pure hard ground
  if (groundType === 'hard') {
    return SIGMA_HARD;
  }

  // Mixed ground - interpolate based on model
  const G = clamp(mixedFactor, 0, 1);

  if (model === 'logarithmic') {
    /**
     * Logarithmic interpolation (physically accurate for impedance).
     *
     * Acoustic impedance scales logarithmically, so interpolating in
     * log-space produces more realistic intermediate values.
     *
     * log(σ) = G·log(σ_soft) + (1-G)·log(σ_hard)
     * σ = σ_soft^G × σ_hard^(1-G)
     *
     * This is the geometric mean when G = 0.5.
     */
    const logSigma = G * Math.log(sigmaSoft) + (1 - G) * Math.log(SIGMA_HARD);
    return Math.exp(logSigma);
  } else {
    /**
     * ISO 9613-2 linear G-factor interpolation.
     *
     * The ISO standard uses an area-weighted G factor where:
     * - G = 0: Hard ground (σ → ∞)
     * - G = 1: Soft ground (σ = σ_soft)
     *
     * For simplicity, we linearly interpolate 1/σ (admittance-like):
     * 1/σ_eff = G × (1/σ_soft) + (1-G) × (1/σ_hard)
     *
     * Since σ_hard → ∞, the term (1-G)/σ_hard → 0, giving:
     * σ_eff = σ_soft / G  (for G > 0)
     *
     * We clamp G to avoid division by zero.
     */
    const Gclamped = Math.max(G, 0.01); // Avoid division by zero
    return sigmaSoft / Gclamped;
  }
}

/**
 * Miki (1990) modification of Delany-Bazley for extended frequency range.
 *
 * Miki's model extends the valid range of Delany-Bazley to higher f/σ ratios
 * and provides more physically realistic behavior at the boundaries.
 *
 * Reference: Y. Miki, "Acoustical properties of porous materials - Modifications
 * of Delany-Bazley models", J. Acoust. Soc. Jpn., 11(1), 19-24, 1990.
 *
 * Valid range: 0.01 < f/σ < 10.0 (much wider than Delany-Bazley)
 */
function mikiNormalizedImpedance(fHz: number, sigma: number): Complex {
  const frequency = Math.max(20, fHz);
  const resistivity = Math.max(1, sigma);
  const ratio = frequency / resistivity;

  // Miki coefficients (modified Delany-Bazley)
  const re = 1 + 5.50 * Math.pow(ratio, -0.632);
  const im = -8.43 * Math.pow(ratio, -0.632);
  return complex(re, im);
}

/**
 * Delany-Bazley normalized surface impedance model.
 *
 * Issue #6 Fix: Added bounds checking for the f/σ ratio.
 *
 * The original Delany-Bazley (1970) empirical model is only valid for:
 *   0.01 < f/σ < 1.0
 *
 * Outside this range:
 * - For f/σ < 0.01 (very hard surface): Returns high impedance (|Γ| ≈ 1)
 * - For f/σ > 1.0 (outside valid range): Uses Miki (1990) extension
 *
 * Reference: M.E. Delany and E.N. Bazley, "Acoustical properties of fibrous
 * absorbent materials", Applied Acoustics 3, 105-116, 1970.
 *
 * @param fHz - Frequency in Hz
 * @param sigma - Flow resistivity in Pa·s/m² (rayls/m)
 * @returns Complex normalized impedance ζ = Z / (ρc)
 */
export function delanyBazleyNormalizedImpedance(fHz: number, sigma: number): Complex {
  const frequency = Math.max(20, fHz);
  const resistivity = Math.max(1, sigma);
  const ratio = frequency / resistivity;

  // Issue #6 Fix: Check validity range

  // Below valid range (very hard surface): high impedance → |Γ| ≈ 1
  // This approximates a rigid surface where almost all sound is reflected
  if (ratio < 0.01) {
    // Return very high impedance (real >> 1, imaginary ≈ 0)
    // At the limit, Γ = (ζcosθ - 1)/(ζcosθ + 1) → 1 as ζ → ∞
    return complex(100, 0);
  }

  // Above valid range: use Miki (1990) extension
  // Miki's model is valid up to f/σ ≈ 10.0 and provides smoother behavior
  if (ratio > 1.0) {
    return mikiNormalizedImpedance(fHz, sigma);
  }

  // Within valid range (0.01 ≤ f/σ ≤ 1.0): use standard Delany-Bazley
  const re = 1 + 9.08 * Math.pow(ratio, -0.75);
  const im = -11.9 * Math.pow(ratio, -0.73);
  return complex(re, im);
}

export function reflectionCoeff(
  fHz: number,
  cosTheta: number,
  ground: GroundType,
  sigmaSoft: number,
  mixedFactor: number,
  r2: number,
  speedOfSound: number,
  groundMixedSigmaModel: GroundMixedSigmaModel = 'iso9613'
): Complex {
  let gamma: Complex;
  if (ground === 'hard') {
    gamma = complex(1, 0);
  } else {
    // Avoid grazing-incidence singularities in locally reacting impedance.
    const clampedCos = clamp(cosTheta, 0.05, 1);

    // Issue #12 Fix: Use proper sigma interpolation model
    const sigma = getEffectiveSigma(ground, sigmaSoft, mixedFactor, groundMixedSigmaModel);

    const zeta = delanyBazleyNormalizedImpedance(fHz, sigma);
    const zetaCos = complexMul(zeta, complex(clampedCos, 0));
    const num = complexSub(zetaCos, complex(1, 0));
    const den = complexAdd(zetaCos, complex(1, 0));
    gamma = complexDiv(num, den);

    const beta = complexDiv(complex(1, 0), zeta);
    const k = (2 * Math.PI * fHz) / speedOfSound;
    const factor = complexSqrt(complex(0, (k * r2) / 2));
    const term = complexAdd(complex(clampedCos, 0), beta);
    const w = complexMul(factor, term);
    const magW = complexAbs(w);
    // Use asymptotic F(w) when |w| is large; keep plane-wave gamma for small |w|.
    if (magW >= 4) {
      const w2 = complexMul(w, w);
      const w4 = complexMul(w2, w2);
      const term1 = complexDiv(complex(-0.5, 0), w2);
      const term2 = complexDiv(complex(0.75, 0), w4);
      const Fw = complexAdd(term1, term2);
      const correction = complexMul(complexSub(complex(1, 0), gamma), Fw);
      gamma = complexAdd(gamma, correction);
    }
  }

  const gammaMag = complexAbs(gamma);
  const maxGammaMag = 0.98;
  if (gammaMag > maxGammaMag && gammaMag > 0) {
    gamma = complexScale(gamma, maxGammaMag / gammaMag);
  }

  return gamma;
}

export function agrTwoRayDb(
  fHz: number,
  d: number,
  hs: number,
  hr: number,
  ground: GroundType,
  sigmaSoft: number,
  mixedFactor: number,
  speedOfSound: number
): number {
  if (d <= 0) return 0;
  const sourceHeight = Math.max(0, hs);
  const receiverHeight = Math.max(0, hr);

  const r1 = Math.sqrt(d * d + (sourceHeight - receiverHeight) * (sourceHeight - receiverHeight));
  const r2 = Math.sqrt(d * d + (sourceHeight + receiverHeight) * (sourceHeight + receiverHeight));
  if (r1 <= 0 || r2 <= 0) return 0;

  const cosTheta = (sourceHeight + receiverHeight) / r2;
  const gamma = reflectionCoeff(fHz, cosTheta, ground, sigmaSoft, mixedFactor, r2, speedOfSound);

  const k = (2 * Math.PI * fHz) / speedOfSound;
  const phase = -k * (r2 - r1);
  const expj = complexExpj(phase);
  const scaledGamma = complexScale(gamma, r1 / r2);
  const ratio = complexAdd(complex(1, 0), complexMul(scaledGamma, expj));

  const mag = complexAbs(ratio);
  if (!Number.isFinite(mag)) return 0;
  const magFloor = 1e-6;
  return -20 * Math.log10(Math.max(mag, magFloor));
}
