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

// Delany–Bazley coefficients (not Miki-modified).
export function delanyBazleyNormalizedImpedance(fHz: number, sigma: number): Complex {
  const frequency = Math.max(20, fHz);
  const resistivity = Math.max(1, sigma);
  const ratio = frequency / resistivity;

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
