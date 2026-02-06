/**
 * Ground Reflection Module for Probe Worker
 */

import type { Complex, ImpedanceModel, GroundReflectionCoeff } from './types.js';

const EPSILON = 1e-10;

export const FLOW_RESISTIVITY = {
  hard: 2_000_000,
  soft: 20_000,
  gravel: 500_000,
  compactSoil: 100_000,
  snow: 30_000,
} as const;

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
  model: ImpedanceModel = 'auto'
): GroundReflectionCoeff {
  let flowResistivity: number;
  if (groundType === 'hard') flowResistivity = FLOW_RESISTIVITY.hard;
  else if (groundType === 'soft') flowResistivity = FLOW_RESISTIVITY.soft;
  else flowResistivity = calculateMixedFlowResistivity(mixedFactor);

  const theta = incidenceAngle ?? Math.PI / 2 - 0.087;
  const Zn = calculateSurfaceImpedance(frequency, flowResistivity, model);
  const Gamma = calculateReflectionCoefficient(Zn, theta);

  return { magnitude: complexMagnitude(Gamma), phase: complexPhase(Gamma) };
}
