import { describe, it, expect } from 'vitest';
import {
  agrIsoEq10Db,
  calculatePropagation,
  calculateSPL,
  groundEffect,
  spreadingLoss,
  spreadingLossFromReference,
} from '../src/propagation/index.js';
import { GroundType } from '@geonoise/core';
import { getDefaultEngineConfig } from '../src/api/index.js';
import { CPUEngine } from '../src/compute/index.js';
import { createEmptyScene } from '@geonoise/core';
import { createFlatSpectrum, type Spectrum9 } from '@geonoise/shared';

function createScene(sourceCount: number) {
  const scene = createEmptyScene({ latLon: { lat: 0, lon: 0 }, altitude: 0 }, 'prop');
  for (let i = 0; i < sourceCount; i += 1) {
    scene.sources.push({
      id: `s${i + 1}`,
      type: 'point',
      position: { x: 0, y: 0, z: 1 },
      soundPowerLevel: 100,
      spectrum: createFlatSpectrum(100) as Spectrum9,
      gain: 0,
      enabled: true,
    } as any);
  }
  scene.receivers.push({
    id: 'r1',
    type: 'point',
    position: { x: 10, y: 0, z: 1.5 },
    enabled: true,
  } as any);
  return scene;
}

// ============================================================================
// Test Suite: Spreading Loss (Issue #1 Fix)
// ============================================================================

describe('Spreading Loss - Issue #1 Fix', () => {
  // Mathematical constants for verification
  const EXACT_SPHERICAL = 10 * Math.log10(4 * Math.PI); // ≈ 10.99 dB
  const EXACT_CYLINDRICAL = 10 * Math.log10(2 * Math.PI); // ≈ 7.98 dB

  describe('spreadingLoss (Lw-based, ISO 9613-2)', () => {
    it('uses exact 4π constant for spherical spreading', () => {
      // At 1m: A_div = 20*log10(1) + 10*log10(4π) = 0 + 10.99 = 10.99 dB
      const loss = spreadingLoss(1, 'spherical');
      expect(loss).toBeCloseTo(EXACT_SPHERICAL, 10); // High precision match
      expect(loss).toBeCloseTo(10.99, 2); // Approximately 11 dB
    });

    it('uses exact 2π constant for cylindrical spreading', () => {
      // At 1m: A_div = 10*log10(1) + 10*log10(2π) = 0 + 7.98 = 7.98 dB
      const loss = spreadingLoss(1, 'cylindrical');
      expect(loss).toBeCloseTo(EXACT_CYLINDRICAL, 10);
      expect(loss).toBeCloseTo(7.98, 2);
    });

    it('calculates correct spherical spreading at 10m', () => {
      // At 10m: A_div = 20*log10(10) + 10*log10(4π) = 20 + 10.99 = 30.99 dB
      const loss = spreadingLoss(10, 'spherical');
      const expected = 20 * Math.log10(10) + EXACT_SPHERICAL;
      expect(loss).toBeCloseTo(expected, 10);
      expect(loss).toBeCloseTo(30.99, 1);
    });

    it('calculates correct cylindrical spreading at 10m', () => {
      // At 10m: A_div = 10*log10(10) + 10*log10(2π) = 10 + 7.98 = 17.98 dB
      const loss = spreadingLoss(10, 'cylindrical');
      const expected = 10 * Math.log10(10) + EXACT_CYLINDRICAL;
      expect(loss).toBeCloseTo(expected, 10);
      expect(loss).toBeCloseTo(17.98, 1);
    });

    it('follows inverse square law: +6 dB per distance doubling', () => {
      const at10m = spreadingLoss(10, 'spherical');
      const at20m = spreadingLoss(20, 'spherical');
      const at40m = spreadingLoss(40, 'spherical');

      // Spherical: 20*log10(2) ≈ 6.02 dB increase per doubling
      expect(at20m - at10m).toBeCloseTo(6.02, 1);
      expect(at40m - at20m).toBeCloseTo(6.02, 1);
    });

    it('follows cylindrical spreading: +3 dB per distance doubling', () => {
      const at10m = spreadingLoss(10, 'cylindrical');
      const at20m = spreadingLoss(20, 'cylindrical');
      const at40m = spreadingLoss(40, 'cylindrical');

      // Cylindrical: 10*log10(2) ≈ 3.01 dB increase per doubling
      expect(at20m - at10m).toBeCloseTo(3.01, 1);
      expect(at40m - at20m).toBeCloseTo(3.01, 1);
    });

    it('clamps very small distances to MIN_DISTANCE', () => {
      // Should not produce NaN or Infinity for tiny distances
      const tiny = spreadingLoss(0.001, 'spherical');
      const zero = spreadingLoss(0, 'spherical');
      const negative = spreadingLoss(-5, 'spherical');

      expect(Number.isFinite(tiny)).toBe(true);
      expect(Number.isFinite(zero)).toBe(true);
      expect(Number.isFinite(negative)).toBe(true);

      // All should clamp to same MIN_DISTANCE result
      expect(zero).toBe(negative);
    });
  });

  describe('spreadingLossFromReference (SPL@1m based)', () => {
    it('returns 0 dB at 1m reference distance', () => {
      // At 1m reference: no additional loss
      const loss = spreadingLossFromReference(1, 'spherical');
      expect(loss).toBeCloseTo(0, 10);
    });

    it('calculates correct spherical loss at 10m from 1m reference', () => {
      // At 10m: 20*log10(10) = 20 dB loss from 1m reference
      const loss = spreadingLossFromReference(10, 'spherical');
      expect(loss).toBeCloseTo(20, 10);
    });

    it('calculates correct cylindrical loss at 10m from 1m reference', () => {
      // At 10m: 10*log10(10) = 10 dB loss from 1m reference
      const loss = spreadingLossFromReference(10, 'cylindrical');
      expect(loss).toBeCloseTo(10, 10);
    });

    it('difference between Lw and SPL@1m formulas equals geometric constant', () => {
      // The difference should be exactly 10*log10(4π) for spherical
      const lwBased = spreadingLoss(10, 'spherical');
      const refBased = spreadingLossFromReference(10, 'spherical');

      expect(lwBased - refBased).toBeCloseTo(EXACT_SPHERICAL, 10);
    });
  });

  describe('SPL calculation with spreading loss', () => {
    it('100 dB Lw source at 10m gives ~69 dB SPL', () => {
      // SPL = Lw - A_div = 100 - 30.99 ≈ 69 dB
      const Lw = 100;
      const distance = 10;
      const Adiv = spreadingLoss(distance, 'spherical');
      const SPL = Lw - Adiv;

      expect(SPL).toBeCloseTo(69, 0); // Within 1 dB
      expect(SPL).toBeGreaterThan(68);
      expect(SPL).toBeLessThan(70);
    });

    it('100 dB Lw source at 100m gives ~49 dB SPL', () => {
      // SPL = Lw - A_div = 100 - (40 + 10.99) ≈ 49 dB
      const Lw = 100;
      const distance = 100;
      const Adiv = spreadingLoss(distance, 'spherical');
      const SPL = Lw - Adiv;

      expect(SPL).toBeCloseTo(49, 0);
      expect(SPL).toBeGreaterThan(48);
      expect(SPL).toBeLessThan(50);
    });
  });
});

// ============================================================================
// Test Suite: Propagation v1 behavior (existing tests)
// ============================================================================

describe('Propagation v1 behavior', () => {
  it('monotonic decrease with distance under default config', () => {
    const config = getDefaultEngineConfig('festival_fast');
    const distances = [5, 10, 20, 40, 80];
    const levels = distances.map((distance) => {
      const prop = calculatePropagation(
        distance,
        1,
        1.5,
        config.propagation!,
        config.meteo!,
        0,
        false,
        1000
      );
      return calculateSPL(100, prop);
    });

    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]).toBeLessThanOrEqual(levels[i - 1]);
    }
  });

  it('adds about +3.01 dB for two equal sources', async () => {
    const engine = new CPUEngine();
    const single = createScene(1);
    const double = createScene(2);

    const singleResult = await engine.computeReceivers({
      kind: 'receivers',
      scene: single,
      payload: {},
    } as any);

    const doubleResult = await engine.computeReceivers({
      kind: 'receivers',
      scene: double,
      payload: {},
    } as any);

    const singleLevel = singleResult.results[0].LAeq;
    const doubleLevel = doubleResult.results[0].LAeq;
    const diff = doubleLevel - singleLevel;

    expect(diff).toBeGreaterThan(2.9);
    expect(diff).toBeLessThan(3.2);
  });

  it('does not produce NaN or Inf outputs', async () => {
    const engine = new CPUEngine();
    const scene = createEmptyScene({ latLon: { lat: 0, lon: 0 }, altitude: 0 }, 'bounds');
    scene.sources.push({
      id: 's1',
      type: 'point',
      position: { x: 0, y: 0, z: 1 },
      soundPowerLevel: 100,
      spectrum: createFlatSpectrum(100) as Spectrum9,
      gain: 0,
      enabled: true,
    } as any);
    scene.receivers.push(
      { id: 'r1', type: 'point', position: { x: 1, y: 0, z: 1 }, enabled: true } as any,
      { id: 'r2', type: 'point', position: { x: 50, y: 0, z: 1 }, enabled: true } as any,
      { id: 'r3', type: 'point', position: { x: 200, y: 0, z: 1 }, enabled: true } as any
    );

    const response = await engine.computeReceivers({ kind: 'receivers', scene, payload: {} } as any);

    for (const result of response.results) {
      expect(Number.isFinite(result.LAeq)).toBe(true);
      if (result.contributions) {
        for (const contrib of result.contributions) {
          expect(Number.isFinite(contrib.LAeq)).toBe(true);
          expect(Number.isFinite(contrib.distance)).toBe(true);
          expect(Number.isFinite(contrib.attenuation)).toBe(true);
        }
      }
    }
  });

  it('legacy ISO Eq.10 Agr is non-negative and matches expected values', () => {
    expect(agrIsoEq10Db(0.5, 1.5, 1.5)).toBe(0);
    expect(agrIsoEq10Db(20, 1.5, 1.5)).toBeCloseTo(0, 4);
    const far = agrIsoEq10Db(200, 1.5, 1.5);
    expect(far).toBeGreaterThan(4.4);
    expect(far).toBeLessThan(4.8);
  });

  it('legacy ground effect applies only to soft ground', () => {
    const hard = groundEffect(20, 1.5, 1.5, GroundType.Hard, 1000);
    const mixed = groundEffect(20, 1.5, 1.5, GroundType.Mixed, 1000);
    const soft = groundEffect(20, 1.5, 1.5, GroundType.Soft, 1000);
    expect(hard).toBe(0);
    expect(mixed).toBe(0);
    expect(soft).toBeGreaterThanOrEqual(0);
  });
});
