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
  speedOfSound: number
): Complex {
  let gamma: Complex;
  if (ground === 'hard') {
    gamma = complex(1, 0);
  } else {
    // Avoid grazing-incidence singularities in locally reacting impedance.
    const clampedCos = clamp(cosTheta, 0.05, 1);
    const mix = clamp(mixedFactor, 0, 1);
    const sigma = ground === 'soft' ? sigmaSoft : sigmaSoft * (1 + 9 * (1 - mix));
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
