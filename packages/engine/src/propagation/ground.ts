import { clamp } from '@geonoise/shared';
import type { PropagationConfig } from '@geonoise/core';
import {
  complex,
  complexAbs,
  complexAdd,
  complexDiv,
  complexExpj,
  complexMul,
  complexScale,
  complexSub,
  type Complex,
} from './complex.js';

export type GroundType = PropagationConfig['groundType'];

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
  mixedFactor: number
): Complex {
  if (ground === 'hard') return complex(1, 0);

  const clampedCos = clamp(cosTheta, 0, 1);
  const sigma = ground === 'soft' ? sigmaSoft : sigmaSoft * 2;
  const zeta = delanyBazleyNormalizedImpedance(fHz, sigma);
  const zetaCos = complexMul(zeta, complex(clampedCos, 0));
  const num = complexSub(zetaCos, complex(1, 0));
  const den = complexAdd(zetaCos, complex(1, 0));
  const gammaSoft = complexDiv(num, den);

  if (ground === 'soft') return gammaSoft;

  const mix = clamp(mixedFactor, 0, 1);
  return complexAdd(
    complexScale(complex(1, 0), 1 - mix),
    complexScale(gammaSoft, mix)
  );
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
  const gamma = reflectionCoeff(fHz, cosTheta, ground, sigmaSoft, mixedFactor);

  const k = (2 * Math.PI * fHz) / speedOfSound;
  const phase = -k * (r2 - r1);
  const expj = complexExpj(phase);
  const scaledGamma = complexScale(gamma, r1 / r2);
  const ratio = complexAdd(complex(1, 0), complexMul(scaledGamma, expj));

  const mag = complexAbs(ratio);
  if (!Number.isFinite(mag) || mag <= 0) return 0;

  return -20 * Math.log10(mag);
}
