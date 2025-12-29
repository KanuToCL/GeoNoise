import { describe, it, expect } from 'vitest';
import {
  complex,
  complexAbs,
  complexAdd,
  complexDiv,
  complexMul,
  complexSqrt,
} from '../src/propagation/complex.js';
import {
  agrTwoRayDb,
  delanyBazleyNormalizedImpedance,
  reflectionCoeff,
} from '../src/propagation/ground.js';

describe('Two-ray ground helpers', () => {
  it('implements basic complex arithmetic', () => {
    const a = complex(1, 2);
    const b = complex(3, -4);
    const sum = complexAdd(a, b);
    expect(sum.re).toBe(4);
    expect(sum.im).toBe(-2);

    const prod = complexMul(a, b);
    expect(prod.re).toBe(11);
    expect(prod.im).toBe(2);

    const div = complexDiv(prod, b);
    expect(div.re).toBeCloseTo(a.re, 8);
    expect(div.im).toBeCloseTo(a.im, 8);

    expect(complexAbs(a)).toBeCloseTo(Math.sqrt(5), 8);

    const sqrtI = complexSqrt(complex(0, 1));
    expect(sqrtI.re).toBeCloseTo(Math.SQRT1_2, 6);
    expect(sqrtI.im).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('delany-bazley impedance returns finite values', () => {
    const zeta = delanyBazleyNormalizedImpedance(1000, 20000);
    expect(Number.isFinite(zeta.re)).toBe(true);
    expect(Number.isFinite(zeta.im)).toBe(true);
    expect(zeta.re).toBeGreaterThan(0);
  });

  it('reflection coefficient handles hard ground', () => {
    const gamma = reflectionCoeff(1000, 0.5, 'hard', 20000, 0.5, 10, 343);
    expect(gamma.re).toBeGreaterThan(0.9);
    expect(Math.abs(gamma.im)).toBeLessThan(0.1);
  });

  it('two-ray Agr produces finite values and varies with frequency', () => {
    const params = {
      d: 10,
      hs: 1.5,
      hr: 1.5,
      ground: 'hard' as const,
      sigma: 20000,
      mix: 0.5,
      c: 343,
    };
    const low = agrTwoRayDb(125, params.d, params.hs, params.hr, params.ground, params.sigma, params.mix, params.c);
    const high = agrTwoRayDb(1000, params.d, params.hs, params.hr, params.ground, params.sigma, params.mix, params.c);
    expect(Number.isFinite(low)).toBe(true);
    expect(Number.isFinite(high)).toBe(true);
    expect(low).not.toBeCloseTo(high, 6);
  });

  it('returns 0 for degenerate distances', () => {
    const value = agrTwoRayDb(1000, 0, 1, 1, 'soft', 20000, 0.5, 343);
    expect(value).toBe(0);
  });

  it('remains finite over a sweep of geometry and frequencies', () => {
    const distances = [1, 5, 10, 50, 200];
    const heights = [0.1, 1.5, 5, 10];
    const freqs = [63, 125, 250, 1000, 4000];
    const grounds = ['hard', 'mixed', 'soft'] as const;

    for (const d of distances) {
      for (const hs of heights) {
        for (const hr of heights) {
          for (const f of freqs) {
            for (const g of grounds) {
              const value = agrTwoRayDb(f, d, hs, hr, g, 20000, 0.5, 343);
              expect(Number.isFinite(value)).toBe(true);
            }
          }
        }
      }
    }
  });
});
