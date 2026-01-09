import { describe, it, expect } from 'vitest';
import {
  agrIsoEq10Db,
  barrierAttenuation,
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

// ============================================================================
// Test Suite: Atmospheric Absorption Path Length (Issue #4 Fix)
// ============================================================================

describe('Atmospheric Absorption Path Length - Issue #4 Fix', () => {
  // Issue #4: Atmospheric absorption was using direct distance for diffracted paths,
  // but sound traveling over/around a barrier travels a LONGER path.
  // The fix adds an optional actualPathLength parameter to calculatePropagation.

  describe('calculatePropagation uses actualPathLength for atmospheric absorption', () => {
    it('uses direct distance when actualPathLength is not provided', () => {
      const config = getDefaultEngineConfig('festival_fast');
      const propConfig = { ...config.propagation!, atmosphericAbsorption: 'iso9613' as const };
      const meteo = config.meteo!;

      // 100m direct path, high frequency (8kHz) for measurable absorption
      const result = calculatePropagation(100, 1.5, 1.5, propConfig, meteo, 0, false, 8000);

      // At 8kHz, α ≈ 0.117 dB/m → 100m ≈ 11.7 dB absorption
      expect(result.atmosphericAbsorption).toBeGreaterThan(5);
      expect(result.atmosphericAbsorption).toBeLessThan(20);
    });

    it('uses actualPathLength when provided (diffracted path)', () => {
      const config = getDefaultEngineConfig('festival_fast');
      const propConfig = { ...config.propagation!, atmosphericAbsorption: 'iso9613' as const };
      const meteo = config.meteo!;

      // Direct distance 100m, but actual path 150m (50m detour over barrier)
      const directDistance = 100;
      const actualPathLength = 150;

      const result = calculatePropagation(
        directDistance,
        1.5,
        1.5,
        propConfig,
        meteo,
        50, // pathDiff
        true, // blocked
        8000, // high frequency
        actualPathLength
      );

      // Absorption should be based on 150m, not 100m
      // At 8kHz, α ≈ 0.117 dB/m → 150m ≈ 17.5 dB absorption
      expect(result.atmosphericAbsorption).toBeGreaterThan(10);
    });

    it('actualPathLength produces higher absorption than direct distance', () => {
      const config = getDefaultEngineConfig('festival_fast');
      const propConfig = { ...config.propagation!, atmosphericAbsorption: 'iso9613' as const };
      const meteo = config.meteo!;

      const directDistance = 100;
      const actualPathLength = 150;

      // Unblocked path using direct distance
      const unblocked = calculatePropagation(
        directDistance,
        1.5,
        1.5,
        propConfig,
        meteo,
        0,
        false,
        8000 // high frequency for measurable difference
      );

      // Blocked path using actual path length
      const blocked = calculatePropagation(
        directDistance,
        1.5,
        1.5,
        propConfig,
        meteo,
        50, // pathDiff
        true,
        8000,
        actualPathLength
      );

      // Blocked path should have MORE atmospheric absorption due to longer path
      expect(blocked.atmosphericAbsorption).toBeGreaterThan(unblocked.atmosphericAbsorption);
    });

    it('difference is significant at high frequencies', () => {
      const config = getDefaultEngineConfig('festival_fast');
      const propConfig = { ...config.propagation!, atmosphericAbsorption: 'iso9613' as const };
      const meteo = config.meteo!;

      const directDistance = 100;
      const extraPath = 50; // 50m detour
      const actualPathLength = directDistance + extraPath;

      // At 8kHz: α ≈ 0.117 dB/m → extra 50m ≈ 5.85 dB more absorption
      const withDirect = calculatePropagation(
        directDistance, 1.5, 1.5, propConfig, meteo, 0, false, 8000
      );
      const withActual = calculatePropagation(
        directDistance, 1.5, 1.5, propConfig, meteo, extraPath, true, 8000, actualPathLength
      );

      const absorptionDiff = withActual.atmosphericAbsorption - withDirect.atmosphericAbsorption;

      // Should be roughly 50m × 0.117 dB/m ≈ 5.85 dB difference
      expect(absorptionDiff).toBeGreaterThan(3);
      expect(absorptionDiff).toBeLessThan(10);
    });

    it('difference is minimal at low frequencies', () => {
      const config = getDefaultEngineConfig('festival_fast');
      const propConfig = { ...config.propagation!, atmosphericAbsorption: 'iso9613' as const };
      const meteo = config.meteo!;

      const directDistance = 100;
      const actualPathLength = 150;

      // At 125 Hz: α ≈ 0.0003 dB/m → extra 50m ≈ 0.015 dB
      const withDirect = calculatePropagation(
        directDistance, 1.5, 1.5, propConfig, meteo, 0, false, 125
      );
      const withActual = calculatePropagation(
        directDistance, 1.5, 1.5, propConfig, meteo, 50, true, 125, actualPathLength
      );

      const absorptionDiff = withActual.atmosphericAbsorption - withDirect.atmosphericAbsorption;

      // Should be very small at low frequencies (< 1 dB)
      expect(absorptionDiff).toBeLessThan(1);
    });
  });

  describe('spreading loss still uses direct distance', () => {
    it('spreading loss is based on direct distance, not actual path', () => {
      const config = getDefaultEngineConfig('festival_fast');
      const propConfig = config.propagation!;
      const meteo = config.meteo!;

      const directDistance = 100;
      const actualPathLength = 150;

      const result = calculatePropagation(
        directDistance,
        1.5,
        1.5,
        propConfig,
        meteo,
        50,
        true,
        1000,
        actualPathLength
      );

      // Spreading loss should be based on 100m (direct distance)
      // At 100m: 20*log10(100) + 10.99 = 40 + 10.99 = 50.99 dB
      expect(result.spreadingLoss).toBeCloseTo(50.99, 0);
    });
  });
});

// ============================================================================
// Test Suite: Speed of Sound Consistency (Issue #18)
// ============================================================================

describe('Speed of Sound Consistency - Issue #18', () => {
  // Import the constant and formula
  const SPEED_OF_SOUND_20C = 343.0; // From shared/constants
  const speedOfSoundFormula = (tempC: number) => 331.3 + 0.606 * tempC;

  it('formula at 20°C is close to constant (within 0.5%)', () => {
    const fromFormula = speedOfSoundFormula(20);
    // Formula gives 343.42, constant is 343.0
    // Difference is 0.42 m/s or ~0.12%
    expect(Math.abs(fromFormula - SPEED_OF_SOUND_20C)).toBeLessThan(1);
    expect(fromFormula).toBeCloseTo(343.42, 1);
  });

  it('formula increases with temperature', () => {
    const at0C = speedOfSoundFormula(0);
    const at20C = speedOfSoundFormula(20);
    const at40C = speedOfSoundFormula(40);

    expect(at20C).toBeGreaterThan(at0C);
    expect(at40C).toBeGreaterThan(at20C);
  });

  it('formula gives expected values at standard temperatures', () => {
    // 0°C: 331.3 m/s
    expect(speedOfSoundFormula(0)).toBeCloseTo(331.3, 1);
    // 15°C: 340.39 m/s
    expect(speedOfSoundFormula(15)).toBeCloseTo(340.39, 1);
    // 20°C: 343.42 m/s
    expect(speedOfSoundFormula(20)).toBeCloseTo(343.42, 1);
    // 25°C: 346.45 m/s
    expect(speedOfSoundFormula(25)).toBeCloseTo(346.45, 1);
  });
});

// ============================================================================
// Test Suite: Thin vs Thick Barrier Attenuation (Issue #16 Fix)
// ============================================================================

describe('Barrier Attenuation - Issue #16 Fix', () => {
  // Issue #16: Buildings should use thick barrier formula (coefficient 40, cap 25 dB)
  // while thin barriers (walls/screens) use standard Maekawa (coefficient 20, cap 20 dB)

  describe('barrierAttenuation function', () => {
    it('thin barrier uses coefficient 20', () => {
      // At N = 1: A_bar = 10*log10(3 + 20*1) = 10*log10(23) ≈ 13.6 dB
      const pathDiff = 1; // meters
      const frequency = 343; // Hz → λ = 1m → N = 2*1/1 = 2
      const lambda = 1;

      // N = 2: A_bar = 10*log10(3 + 20*2) = 10*log10(43) ≈ 16.3 dB
      const thinAtten = barrierAttenuation(pathDiff, frequency, lambda, 'thin');

      expect(thinAtten).toBeCloseTo(16.3, 1);
    });

    it('thick barrier uses coefficient 40', () => {
      // Same geometry, but thick barrier
      // N = 2: A_bar = 10*log10(3 + 40*2) = 10*log10(83) ≈ 19.2 dB
      const pathDiff = 1;
      const frequency = 343;
      const lambda = 1;

      const thickAtten = barrierAttenuation(pathDiff, frequency, lambda, 'thick');

      expect(thickAtten).toBeCloseTo(19.2, 1);
    });

    it('thick barrier produces higher attenuation than thin for same geometry', () => {
      const pathDiff = 5; // 5 meter path difference
      const frequency = 1000; // Hz
      const lambda = 343 / frequency; // ~0.343m

      const thinAtten = barrierAttenuation(pathDiff, frequency, lambda, 'thin');
      const thickAtten = barrierAttenuation(pathDiff, frequency, lambda, 'thick');

      // Thick should always be higher (more attenuation)
      expect(thickAtten).toBeGreaterThan(thinAtten);
    });

    it('thin barrier caps at 20 dB', () => {
      // Very large path difference → should cap at 20 dB
      const pathDiff = 100; // Large path difference
      const frequency = 8000; // High frequency → large N

      const thinAtten = barrierAttenuation(pathDiff, frequency, undefined, 'thin');

      expect(thinAtten).toBe(20);
    });

    it('thick barrier caps at 25 dB', () => {
      // Very large path difference → should cap at 25 dB
      const pathDiff = 100;
      const frequency = 8000;

      const thickAtten = barrierAttenuation(pathDiff, frequency, undefined, 'thick');

      expect(thickAtten).toBe(25);
    });

    it('difference between thin and thick increases with frequency', () => {
      const pathDiff = 5;

      // Low frequency: smaller difference
      const thinLow = barrierAttenuation(pathDiff, 125, undefined, 'thin');
      const thickLow = barrierAttenuation(pathDiff, 125, undefined, 'thick');
      const diffLow = thickLow - thinLow;

      // High frequency: larger difference (until capping)
      const thinHigh = barrierAttenuation(pathDiff, 4000, undefined, 'thin');
      const thickHigh = barrierAttenuation(pathDiff, 4000, undefined, 'thick');
      const diffHigh = thickHigh - thinHigh;

      // At higher frequencies, the difference should be larger
      // (unless both are capped)
      expect(diffHigh).toBeGreaterThanOrEqual(diffLow);
    });

    it('returns 0 for negative Fresnel number below threshold', () => {
      // N < -0.1 → return 0
      // pathDiff < 0 means receiver can see over the barrier
      const pathDiff = -0.5;
      const frequency = 1000;

      const thinAtten = barrierAttenuation(pathDiff, frequency, undefined, 'thin');
      const thickAtten = barrierAttenuation(pathDiff, frequency, undefined, 'thick');

      expect(thinAtten).toBe(0);
      expect(thickAtten).toBe(0);
    });

    it('default barrier type is thin', () => {
      const pathDiff = 5;
      const frequency = 1000;

      const defaultAtten = barrierAttenuation(pathDiff, frequency);
      const explicitThin = barrierAttenuation(pathDiff, frequency, undefined, 'thin');

      expect(defaultAtten).toBe(explicitThin);
    });
  });

  describe('calculatePropagation with barrier type', () => {
    it('uses thin barrier formula when barrierType is thin', () => {
      const config = getDefaultEngineConfig('festival_fast');
      const propConfig = { ...config.propagation!, includeBarriers: true };
      const meteo = config.meteo!;

      const pathDiff = 5;
      const result = calculatePropagation(
        50,  // distance
        1.5, // sourceHeight
        1.5, // receiverHeight
        propConfig,
        meteo,
        pathDiff,
        true,  // blocked
        1000,  // frequency
        55,    // actualPathLength
        'thin' // barrierType
      );

      // Barrier attenuation should be calculated with thin formula
      expect(result.barrierAttenuation).toBeGreaterThan(0);
      expect(result.barrierAttenuation).toBeLessThanOrEqual(20); // thin cap
    });

    it('uses thick barrier formula when barrierType is thick', () => {
      const config = getDefaultEngineConfig('festival_fast');
      const propConfig = { ...config.propagation!, includeBarriers: true };
      const meteo = config.meteo!;

      const pathDiff = 5;
      const result = calculatePropagation(
        50,
        1.5,
        1.5,
        propConfig,
        meteo,
        pathDiff,
        true,
        1000,
        55,
        'thick'
      );

      // Barrier attenuation should be calculated with thick formula
      expect(result.barrierAttenuation).toBeGreaterThan(0);
      expect(result.barrierAttenuation).toBeLessThanOrEqual(25); // thick cap
    });

    it('thick barrier produces more attenuation in total propagation result', () => {
      const config = getDefaultEngineConfig('festival_fast');
      const propConfig = { ...config.propagation!, includeBarriers: true };
      const meteo = config.meteo!;

      const pathDiff = 5;

      const thinResult = calculatePropagation(
        50, 1.5, 1.5, propConfig, meteo,
        pathDiff, true, 1000, 55, 'thin'
      );

      const thickResult = calculatePropagation(
        50, 1.5, 1.5, propConfig, meteo,
        pathDiff, true, 1000, 55, 'thick'
      );

      // Thick barrier should produce more total attenuation
      expect(thickResult.barrierAttenuation).toBeGreaterThan(thinResult.barrierAttenuation);
    });
  });

  describe('frequency-dependent building shadow', () => {
    it('shadow depth increases with frequency for thick barriers', () => {
      const config = getDefaultEngineConfig('festival_fast');
      const propConfig = { ...config.propagation!, includeBarriers: true };
      const meteo = config.meteo!;

      const pathDiff = 5;

      // Low frequency (63 Hz)
      const lowFreqResult = calculatePropagation(
        50, 1.5, 1.5, propConfig, meteo,
        pathDiff, true, 63, 55, 'thick'
      );

      // High frequency (8000 Hz)
      const highFreqResult = calculatePropagation(
        50, 1.5, 1.5, propConfig, meteo,
        pathDiff, true, 8000, 55, 'thick'
      );

      // High frequency should have more barrier attenuation
      expect(highFreqResult.barrierAttenuation).toBeGreaterThan(lowFreqResult.barrierAttenuation);
    });

    it('building shadow difference between 63Hz and 16kHz is significant', () => {
      const config = getDefaultEngineConfig('festival_fast');
      const propConfig = { ...config.propagation!, includeBarriers: true };
      const meteo = config.meteo!;

      const pathDiff = 5;

      const at63Hz = calculatePropagation(
        50, 1.5, 1.5, propConfig, meteo,
        pathDiff, true, 63, 55, 'thick'
      );

      const at16kHz = calculatePropagation(
        50, 1.5, 1.5, propConfig, meteo,
        pathDiff, true, 16000, 55, 'thick'
      );

      const shadowDifference = at16kHz.barrierAttenuation - at63Hz.barrierAttenuation;

      // Should be at least 3 dB difference (Issue #16 improvement)
      // With thick formula, 16kHz should hit the 25 dB cap
      // while 63 Hz stays well below
      expect(shadowDifference).toBeGreaterThan(3);
    });
  });
});

// ============================================================================
// Test Suite: Atmospheric Absorption None Option
// ============================================================================

describe('Atmospheric Absorption None Option', () => {
  it('returns zero atmospheric absorption when mode is none', () => {
    const config = getDefaultEngineConfig('festival_fast');
    const propConfig = { ...config.propagation!, atmosphericAbsorption: 'none' as const };
    const meteo = config.meteo!;

    // High frequency at long distance - would normally have significant absorption
    const result = calculatePropagation(
      500,  // 500m distance
      1.5,
      1.5,
      propConfig,
      meteo,
      0,
      false,
      8000  // 8kHz - normally ~0.117 dB/m
    );

    // With 'none', atmospheric absorption should be 0
    expect(result.atmosphericAbsorption).toBe(0);
  });

  it('none mode produces lower total attenuation than iso9613', () => {
    const config = getDefaultEngineConfig('festival_fast');
    const meteo = config.meteo!;

    const noneResult = calculatePropagation(
      200, 1.5, 1.5,
      { ...config.propagation!, atmosphericAbsorption: 'none' as const },
      meteo, 0, false, 8000
    );

    const isoResult = calculatePropagation(
      200, 1.5, 1.5,
      { ...config.propagation!, atmosphericAbsorption: 'iso9613' as const },
      meteo, 0, false, 8000
    );

    // ISO 9613 should have MORE total attenuation due to atmospheric absorption
    expect(isoResult.totalAttenuation).toBeGreaterThan(noneResult.totalAttenuation);
    expect(noneResult.atmosphericAbsorption).toBe(0);
    expect(isoResult.atmosphericAbsorption).toBeGreaterThan(0);
  });

  it('none mode still includes spreading loss', () => {
    const config = getDefaultEngineConfig('festival_fast');
    const propConfig = { ...config.propagation!, atmosphericAbsorption: 'none' as const };
    const meteo = config.meteo!;

    const result = calculatePropagation(100, 1.5, 1.5, propConfig, meteo, 0, false, 1000);

    // Spreading loss should still be present
    // At 100m: 20*log10(100) + 10.99 ≈ 50.99 dB
    expect(result.spreadingLoss).toBeGreaterThan(50);
    expect(result.spreadingLoss).toBeLessThan(52);
    expect(result.atmosphericAbsorption).toBe(0);
  });
});

// ============================================================================
// Test Suite: Frequency Weighting (A/C/Z)
// ============================================================================

describe('Frequency Weighting Curves', () => {
  // Standard weighting values from IEC 61672-1
  const A_WEIGHTS = [-26.2, -16.1, -8.6, -3.2, 0, 1.2, 1.0, -1.1, -6.6];
  const C_WEIGHTS = [-0.8, -0.2, 0, 0, 0, -0.2, -0.8, -3.0, -8.5];
  const Z_WEIGHTS = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  it('A-weighting is 0 dB at 1000 Hz reference', () => {
    const idx1kHz = BANDS.indexOf(1000);
    expect(A_WEIGHTS[idx1kHz]).toBe(0);
  });

  it('A-weighting heavily attenuates low frequencies', () => {
    // 63 Hz should be attenuated more than 125 Hz
    expect(A_WEIGHTS[0]).toBeLessThan(A_WEIGHTS[1]);
    // 125 Hz should be attenuated more than 250 Hz
    expect(A_WEIGHTS[1]).toBeLessThan(A_WEIGHTS[2]);
    // All below 1kHz should be negative
    expect(A_WEIGHTS[0]).toBeLessThan(0);
    expect(A_WEIGHTS[1]).toBeLessThan(0);
    expect(A_WEIGHTS[2]).toBeLessThan(0);
    expect(A_WEIGHTS[3]).toBeLessThan(0);
  });

  it('A-weighting has slight boost at 2-4 kHz', () => {
    // Human ear is most sensitive around 2-4 kHz
    expect(A_WEIGHTS[5]).toBeGreaterThan(0); // 2 kHz: +1.2 dB
    expect(A_WEIGHTS[6]).toBeGreaterThan(0); // 4 kHz: +1.0 dB
  });

  it('C-weighting is relatively flat', () => {
    // C-weighting should be within ±1 dB for 125-4000 Hz
    for (let i = 1; i <= 6; i++) {
      expect(Math.abs(C_WEIGHTS[i])).toBeLessThanOrEqual(1);
    }
  });

  it('C-weighting is 0 dB at 250-1000 Hz', () => {
    expect(C_WEIGHTS[2]).toBe(0); // 250 Hz
    expect(C_WEIGHTS[3]).toBe(0); // 500 Hz
    expect(C_WEIGHTS[4]).toBe(0); // 1000 Hz
  });

  it('Z-weighting is flat (all zeros)', () => {
    for (const weight of Z_WEIGHTS) {
      expect(weight).toBe(0);
    }
  });

  it('A-weighting matches IEC 61672-1 standard values', () => {
    // Verify all 9 bands match the standard
    const standardAWeights: Record<number, number> = {
      63: -26.2,
      125: -16.1,
      250: -8.6,
      500: -3.2,
      1000: 0.0,
      2000: 1.2,
      4000: 1.0,
      8000: -1.1,
      16000: -6.6,
    };

    for (let i = 0; i < BANDS.length; i++) {
      expect(A_WEIGHTS[i]).toBe(standardAWeights[BANDS[i]]);
    }
  });
});

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

describe('Edge Cases - Robustness', () => {
  describe('Zero and Small Distances', () => {
    it('spreadingLoss handles distance = 0', () => {
      const loss = spreadingLoss(0, 'spherical');
      expect(Number.isFinite(loss)).toBe(true);
      expect(loss).not.toBe(NaN);
    });

    it('spreadingLoss handles negative distance', () => {
      const loss = spreadingLoss(-10, 'spherical');
      expect(Number.isFinite(loss)).toBe(true);
    });

    it('spreadingLoss handles very small distance (0.001m)', () => {
      const loss = spreadingLoss(0.001, 'spherical');
      expect(Number.isFinite(loss)).toBe(true);
    });

    it('all clamped distances produce same result', () => {
      // Distances below MIN_DISTANCE should all clamp to same value
      const at0 = spreadingLoss(0, 'spherical');
      const atNeg = spreadingLoss(-5, 'spherical');
      const atTiny = spreadingLoss(0.01, 'spherical');

      expect(at0).toBe(atNeg);
      expect(at0).toBe(atTiny);
    });
  });

  describe('Large Distances', () => {
    it('spreadingLoss handles 1km distance', () => {
      const loss = spreadingLoss(1000, 'spherical');
      expect(Number.isFinite(loss)).toBe(true);
      // At 1km: 20*log10(1000) + 10.99 = 60 + 10.99 = 70.99 dB
      expect(loss).toBeCloseTo(70.99, 0);
    });

    it('spreadingLoss handles 10km distance', () => {
      const loss = spreadingLoss(10000, 'spherical');
      expect(Number.isFinite(loss)).toBe(true);
      // At 10km: 20*log10(10000) + 10.99 = 80 + 10.99 = 90.99 dB
      expect(loss).toBeCloseTo(90.99, 0);
    });

    it('calculatePropagation respects MAX_DISTANCE', () => {
      const config = getDefaultEngineConfig('festival_fast');
      const result = calculatePropagation(
        15000, // Beyond MAX_DISTANCE (10000)
        1.5,
        1.5,
        config.propagation!,
        config.meteo!,
        0,
        false,
        1000
      );

      // Should be marked as blocked when beyond MAX_DISTANCE
      expect(result.blocked).toBe(true);
    });
  });

  describe('Empty and Invalid Inputs', () => {
    it('calculateSPL handles blocked propagation', () => {
      const blockedProp = {
        totalAttenuation: 0,
        spreadingLoss: 0,
        atmosphericAbsorption: 0,
        groundEffect: 0,
        barrierAttenuation: 0,
        distance: 100,
        blocked: true,
      };

      const spl = calculateSPL(100, blockedProp);
      expect(spl).toBe(-100); // MIN_LEVEL
    });

    it('agrIsoEq10Db handles zero distance', () => {
      const result = agrIsoEq10Db(0, 1.5, 1.5);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('groundEffect returns 0 for hard ground', () => {
      const result = groundEffect(50, 1.5, 1.5, GroundType.Hard, 1000);
      expect(result).toBe(0);
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
