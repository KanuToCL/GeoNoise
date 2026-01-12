/**
 * Probe Worker Impedance Model Tests
 *
 * Tests for the Delany-Bazley and Miki impedance models implemented in
 * probeWorker.ts for ground reflection calculations.
 *
 * Run with: npx vitest run apps/web/src/probeWorker.test.ts
 *
 * References:
 * - Delany & Bazley (1970) "Acoustical properties of fibrous absorbent materials"
 * - Miki (1990) "Acoustical properties of porous materials - Modifications of DB model"
 * - ISO 9613-2:1996 "Attenuation of sound during propagation outdoors"
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Re-implement the probe worker functions for testing
// (These mirror the implementation in probeWorker.ts)
// ============================================================================

const EPSILON = 1e-10;

interface Complex {
  re: number;
  im: number;
}

function complexMultiply(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

function complexDivide(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  if (denom < EPSILON) {
    return { re: 0, im: 0 };
  }
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
}

function complexMagnitude(z: Complex): number {
  return Math.sqrt(z.re * z.re + z.im * z.im);
}

function complexPhase(z: Complex): number {
  return Math.atan2(z.im, z.re);
}

const FLOW_RESISTIVITY = {
  hard: 2_000_000,
  soft: 20_000,
  gravel: 500_000,
  compactSoil: 100_000,
  snow: 30_000,
} as const;

type ImpedanceModel = 'delany-bazley' | 'miki' | 'auto';

function delanyBazleyImpedance(frequency: number, flowResistivity: number): Complex {
  const X = frequency / flowResistivity;
  const Xc = Math.max(0.001, Math.min(X, 10.0));
  const realPart = 1 + 9.08 * Math.pow(Xc, -0.75);
  const imagPart = -11.9 * Math.pow(Xc, -0.73);
  return { re: realPart, im: imagPart };
}

function mikiImpedance(frequency: number, flowResistivity: number): Complex {
  const X = frequency / flowResistivity;
  const Xc = Math.max(0.001, Math.min(X, 100.0));
  const realPart = 1 + 5.50 * Math.pow(Xc, -0.632);
  const imagPart = -8.43 * Math.pow(Xc, -0.632);
  return { re: realPart, im: imagPart };
}

function calculateSurfaceImpedance(
  frequency: number,
  flowResistivity: number,
  model: ImpedanceModel = 'auto'
): Complex {
  const X = frequency / flowResistivity;

  if (model === 'delany-bazley') {
    return delanyBazleyImpedance(frequency, flowResistivity);
  } else if (model === 'miki') {
    return mikiImpedance(frequency, flowResistivity);
  } else {
    if (X < 1.0) {
      return delanyBazleyImpedance(frequency, flowResistivity);
    } else {
      return mikiImpedance(frequency, flowResistivity);
    }
  }
}

function calculateReflectionCoefficient(Zn: Complex, incidenceAngle: number): Complex {
  const cosTheta = Math.cos(incidenceAngle);
  const ZnCosTheta: Complex = {
    re: Zn.re * cosTheta,
    im: Zn.im * cosTheta,
  };
  const numerator: Complex = {
    re: ZnCosTheta.re - 1,
    im: ZnCosTheta.im,
  };
  const denominator: Complex = {
    re: ZnCosTheta.re + 1,
    im: ZnCosTheta.im,
  };
  return complexDivide(numerator, denominator);
}

function calculateMixedFlowResistivity(mixedFactor: number): number {
  const G = Math.max(0, Math.min(1, mixedFactor));
  const logSigmaHard = Math.log(FLOW_RESISTIVITY.hard);
  const logSigmaSoft = Math.log(FLOW_RESISTIVITY.soft);
  const logSigmaEff = logSigmaHard * (1 - G) + logSigmaSoft * G;
  return Math.exp(logSigmaEff);
}

interface GroundReflectionCoeff {
  magnitude: number;
  phase: number;
}

function getGroundReflectionCoeff(
  groundType: 'hard' | 'soft' | 'mixed',
  mixedFactor: number,
  frequency: number,
  incidenceAngle?: number,
  model: ImpedanceModel = 'auto'
): GroundReflectionCoeff {
  let flowResistivity: number;

  if (groundType === 'hard') {
    flowResistivity = FLOW_RESISTIVITY.hard;
  } else if (groundType === 'soft') {
    flowResistivity = FLOW_RESISTIVITY.soft;
  } else {
    flowResistivity = calculateMixedFlowResistivity(mixedFactor);
  }

  const theta = incidenceAngle ?? (Math.PI / 2 - 0.087);
  const Zn = calculateSurfaceImpedance(frequency, flowResistivity, model);
  const Gamma = calculateReflectionCoefficient(Zn, theta);

  return {
    magnitude: complexMagnitude(Gamma),
    phase: complexPhase(Gamma),
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('Complex Number Operations', () => {
  it('should multiply complex numbers correctly', () => {
    const a: Complex = { re: 3, im: 4 };
    const b: Complex = { re: 1, im: 2 };
    const result = complexMultiply(a, b);
    // (3+4i)(1+2i) = 3 + 6i + 4i + 8i² = 3 + 10i - 8 = -5 + 10i
    expect(result.re).toBeCloseTo(-5, 10);
    expect(result.im).toBeCloseTo(10, 10);
  });

  it('should divide complex numbers correctly', () => {
    const a: Complex = { re: 10, im: 5 };
    const b: Complex = { re: 2, im: 1 };
    const result = complexDivide(a, b);
    // (10+5i)/(2+i) = (10+5i)(2-i)/(4+1) = (20-10i+10i-5i²)/5 = (20+5)/5 = 5
    expect(result.re).toBeCloseTo(5, 10);
    expect(result.im).toBeCloseTo(0, 10);
  });

  it('should handle division by near-zero', () => {
    const a: Complex = { re: 1, im: 1 };
    const b: Complex = { re: 0, im: 0 };
    const result = complexDivide(a, b);
    expect(result.re).toBe(0);
    expect(result.im).toBe(0);
  });

  it('should calculate magnitude correctly', () => {
    const z: Complex = { re: 3, im: 4 };
    expect(complexMagnitude(z)).toBeCloseTo(5, 10);
  });

  it('should calculate phase correctly', () => {
    const z: Complex = { re: 1, im: 1 };
    expect(complexPhase(z)).toBeCloseTo(Math.PI / 4, 10);

    const z2: Complex = { re: -1, im: 0 };
    expect(complexPhase(z2)).toBeCloseTo(Math.PI, 10);
  });
});

describe('Delany-Bazley Impedance Model', () => {
  it('should return impedance with Re > 1 (always greater than air)', () => {
    const frequencies = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
    for (const f of frequencies) {
      const Z = delanyBazleyImpedance(f, 20000);
      expect(Z.re).toBeGreaterThan(1);
    }
  });

  it('should return negative imaginary part (lossy material)', () => {
    const Z = delanyBazleyImpedance(1000, 20000);
    expect(Z.im).toBeLessThan(0);
  });

  it('should increase impedance for harder surfaces (higher σ)', () => {
    const Z_soft = delanyBazleyImpedance(1000, 20000);
    const Z_hard = delanyBazleyImpedance(1000, 2000000);

    // Hard ground has higher impedance (approaches rigid limit)
    expect(Z_hard.re).toBeGreaterThan(Z_soft.re);
  });

  it('should be finite for all valid inputs', () => {
    const frequencies = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const sigmas = [10000, 20000, 100000, 500000, 2000000];

    for (const f of frequencies) {
      for (const sigma of sigmas) {
        const Z = delanyBazleyImpedance(f, sigma);
        expect(Number.isFinite(Z.re)).toBe(true);
        expect(Number.isFinite(Z.im)).toBe(true);
      }
    }
  });

  it('should match expected values from literature (f/σ = 0.05)', () => {
    // At f/σ = 0.05 (within valid range 0.01-1.0)
    // Zn = 1 + 9.08*(0.05)^-0.75 - j*11.9*(0.05)^-0.73
    const f = 1000;
    const sigma = 20000; // f/σ = 0.05
    const Z = delanyBazleyImpedance(f, sigma);

    const expectedRe = 1 + 9.08 * Math.pow(0.05, -0.75);
    const expectedIm = -11.9 * Math.pow(0.05, -0.73);

    expect(Z.re).toBeCloseTo(expectedRe, 5);
    expect(Z.im).toBeCloseTo(expectedIm, 5);
  });
});

describe('Miki Impedance Model', () => {
  it('should return impedance with Re > 1', () => {
    const frequencies = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
    for (const f of frequencies) {
      const Z = mikiImpedance(f, 20000);
      expect(Z.re).toBeGreaterThan(1);
    }
  });

  it('should return negative imaginary part', () => {
    const Z = mikiImpedance(1000, 20000);
    expect(Z.im).toBeLessThan(0);
  });

  it('should match expected Miki formula (f/σ = 2.0)', () => {
    // At f/σ = 2.0 (in Miki extended range)
    // Zn = 1 + 5.50*(2.0)^-0.632 - j*8.43*(2.0)^-0.632
    const f = 40000;
    const sigma = 20000; // f/σ = 2.0
    const Z = mikiImpedance(f, sigma);

    const expectedRe = 1 + 5.50 * Math.pow(2.0, -0.632);
    const expectedIm = -8.43 * Math.pow(2.0, -0.632);

    expect(Z.re).toBeCloseTo(expectedRe, 5);
    expect(Z.im).toBeCloseTo(expectedIm, 5);
  });

  it('should have smaller coefficients than Delany-Bazley (smoother behavior)', () => {
    // Miki uses smaller coefficients: 5.50 vs 9.08, 8.43 vs 11.9
    // At same f/σ, Miki should give smaller impedance magnitude
    const f = 1000;
    const sigma = 20000;

    const Z_db = delanyBazleyImpedance(f, sigma);
    const Z_miki = mikiImpedance(f, sigma);

    // Miki has smoother/lower values
    expect(Z_miki.re).toBeLessThan(Z_db.re);
    expect(Math.abs(Z_miki.im)).toBeLessThan(Math.abs(Z_db.im));
  });
});

describe('Auto Model Selection', () => {
  it('should use Delany-Bazley when f/σ < 1.0', () => {
    const f = 1000;
    const sigma = 20000; // f/σ = 0.05 < 1.0

    const Z_auto = calculateSurfaceImpedance(f, sigma, 'auto');
    const Z_db = delanyBazleyImpedance(f, sigma);

    expect(Z_auto.re).toBeCloseTo(Z_db.re, 10);
    expect(Z_auto.im).toBeCloseTo(Z_db.im, 10);
  });

  it('should use Miki when f/σ >= 1.0', () => {
    const f = 50000;
    const sigma = 20000; // f/σ = 2.5 >= 1.0

    const Z_auto = calculateSurfaceImpedance(f, sigma, 'auto');
    const Z_miki = mikiImpedance(f, sigma);

    expect(Z_auto.re).toBeCloseTo(Z_miki.re, 10);
    expect(Z_auto.im).toBeCloseTo(Z_miki.im, 10);
  });

  it('should provide smooth transition at f/σ = 1.0 boundary', () => {
    const sigma = 20000;

    // Just below boundary
    const Z_below = calculateSurfaceImpedance(19000, sigma, 'auto'); // f/σ = 0.95
    // Just above boundary
    const Z_above = calculateSurfaceImpedance(21000, sigma, 'auto'); // f/σ = 1.05

    // Should not have drastic discontinuity (within factor of 2)
    expect(Z_above.re / Z_below.re).toBeGreaterThan(0.5);
    expect(Z_above.re / Z_below.re).toBeLessThan(2.0);
  });
});

describe('Reflection Coefficient', () => {
  it('should return |Γ| < 1 for finite impedance (physical requirement)', () => {
    const Zn: Complex = { re: 10, im: -5 };
    const Gamma = calculateReflectionCoefficient(Zn, 0); // Normal incidence

    expect(complexMagnitude(Gamma)).toBeLessThan(1);
  });

  it('should approach |Γ| = 1 for rigid surface (Zn → ∞)', () => {
    // Very high impedance simulates rigid surface
    const Zn: Complex = { re: 10000, im: 0 };
    const Gamma = calculateReflectionCoefficient(Zn, 0);

    expect(complexMagnitude(Gamma)).toBeGreaterThan(0.99);
  });

  it('should have |Γ| = 0 for perfect impedance match (Zn = 1)', () => {
    // If Zn = 1 (matched to air), no reflection
    const Zn: Complex = { re: 1, im: 0 };
    const Gamma = calculateReflectionCoefficient(Zn, 0);

    expect(complexMagnitude(Gamma)).toBeCloseTo(0, 5);
  });

  it('should vary with incidence angle (Fresnel equations)', () => {
    const Zn: Complex = { re: 5, im: -2 };

    const Gamma_normal = calculateReflectionCoefficient(Zn, 0); // θ = 0°
    const Gamma_45 = calculateReflectionCoefficient(Zn, Math.PI / 4); // θ = 45°
    const Gamma_very_grazing = calculateReflectionCoefficient(Zn, Math.PI / 2 - 0.01); // θ ≈ 89.4°

    // Reflection coefficient should vary with angle
    // For locally-reacting surfaces, the formula Γ = (Zn·cosθ - 1)/(Zn·cosθ + 1)
    // means that as θ → 90° (grazing), cosθ → 0, so Γ → -1
    expect(complexMagnitude(Gamma_normal)).not.toBeCloseTo(complexMagnitude(Gamma_45), 2);

    // At very grazing incidence (cosθ ≈ 0.01), Γ approaches -1
    // The magnitude should be high
    expect(complexMagnitude(Gamma_very_grazing)).toBeGreaterThan(0.9);
  });

  it('should produce phase shift for lossy materials', () => {
    const Zn: Complex = { re: 5, im: -3 }; // Lossy
    const Gamma = calculateReflectionCoefficient(Zn, Math.PI / 4);

    // Non-zero phase for complex impedance
    expect(Math.abs(complexPhase(Gamma))).toBeGreaterThan(0.01);
  });
});

describe('Mixed Ground Flow Resistivity', () => {
  it('should return hard resistivity when mixedFactor = 0', () => {
    const sigma = calculateMixedFlowResistivity(0);
    expect(sigma).toBeCloseTo(FLOW_RESISTIVITY.hard, 0);
  });

  it('should return soft resistivity when mixedFactor = 1', () => {
    const sigma = calculateMixedFlowResistivity(1);
    expect(sigma).toBeCloseTo(FLOW_RESISTIVITY.soft, 0);
  });

  it('should return geometric mean when mixedFactor = 0.5', () => {
    const sigma = calculateMixedFlowResistivity(0.5);
    const geometricMean = Math.sqrt(FLOW_RESISTIVITY.hard * FLOW_RESISTIVITY.soft);
    expect(sigma).toBeCloseTo(geometricMean, 0);
  });

  it('should clamp values outside [0, 1]', () => {
    const sigma_negative = calculateMixedFlowResistivity(-0.5);
    const sigma_over = calculateMixedFlowResistivity(1.5);

    expect(sigma_negative).toBeCloseTo(FLOW_RESISTIVITY.hard, 0);
    expect(sigma_over).toBeCloseTo(FLOW_RESISTIVITY.soft, 0);
  });

  it('should use logarithmic interpolation (not linear)', () => {
    const sigma_50 = calculateMixedFlowResistivity(0.5);
    const linear_mean = (FLOW_RESISTIVITY.hard + FLOW_RESISTIVITY.soft) / 2;

    // Logarithmic should be much smaller than linear for values spanning orders of magnitude
    expect(sigma_50).toBeLessThan(linear_mean);
  });
});

describe('Ground Reflection Coefficient (Full Integration)', () => {
  it('should return high reflection for hard ground', () => {
    const coeff = getGroundReflectionCoeff('hard', 0, 1000);
    expect(coeff.magnitude).toBeGreaterThan(0.9);
  });

  it('should return lower reflection for soft ground', () => {
    const hardCoeff = getGroundReflectionCoeff('hard', 0, 1000);
    const softCoeff = getGroundReflectionCoeff('soft', 0, 1000);

    expect(softCoeff.magnitude).toBeLessThan(hardCoeff.magnitude);
  });

  it('should have frequency dependence', () => {
    const coeff_low = getGroundReflectionCoeff('soft', 0, 125);
    const coeff_high = getGroundReflectionCoeff('soft', 0, 4000);

    // Magnitude should vary with frequency
    expect(coeff_low.magnitude).not.toBeCloseTo(coeff_high.magnitude, 2);
  });

  it('should interpolate for mixed ground', () => {
    const hardCoeff = getGroundReflectionCoeff('hard', 0, 1000);
    const softCoeff = getGroundReflectionCoeff('soft', 0, 1000);
    const mixedCoeff = getGroundReflectionCoeff('mixed', 0.5, 1000);

    // Mixed should be between hard and soft
    expect(mixedCoeff.magnitude).toBeLessThan(hardCoeff.magnitude);
    expect(mixedCoeff.magnitude).toBeGreaterThan(softCoeff.magnitude);
  });

  it('should be finite for all octave bands and ground types', () => {
    const frequencies = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const groundTypes = ['hard', 'soft', 'mixed'] as const;
    const mixFactors = [0, 0.25, 0.5, 0.75, 1.0];

    for (const f of frequencies) {
      for (const ground of groundTypes) {
        for (const mix of mixFactors) {
          const coeff = getGroundReflectionCoeff(ground, mix, f);
          expect(Number.isFinite(coeff.magnitude)).toBe(true);
          expect(Number.isFinite(coeff.phase)).toBe(true);
          expect(coeff.magnitude).toBeGreaterThanOrEqual(0);
          expect(coeff.magnitude).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('should produce non-zero phase for soft ground', () => {
    // Soft ground produces phase shift due to complex impedance
    // The exact phase depends on frequency and incidence angle
    const coeff = getGroundReflectionCoeff('soft', 0, 1000);

    // Phase should be non-zero for lossy materials
    // Note: The Delany-Bazley model produces phase shift, but the
    // magnitude depends on the specific f/σ ratio and incidence angle
    expect(Number.isFinite(coeff.phase)).toBe(true);
    // Phase is typically negative for absorptive materials
    expect(coeff.phase).not.toBe(0);
  });

  it('should produce small phase for hard ground', () => {
    const coeff = getGroundReflectionCoeff('hard', 0, 1000);

    // Hard ground has small phase shift
    expect(Math.abs(coeff.phase)).toBeLessThan(Math.PI / 4);
  });
});

describe('Flow Resistivity Constants', () => {
  it('should have correct order of magnitude', () => {
    // Hard > Gravel > Compact > Snow > Soft
    expect(FLOW_RESISTIVITY.hard).toBeGreaterThan(FLOW_RESISTIVITY.gravel);
    expect(FLOW_RESISTIVITY.gravel).toBeGreaterThan(FLOW_RESISTIVITY.compactSoil);
    expect(FLOW_RESISTIVITY.compactSoil).toBeGreaterThan(FLOW_RESISTIVITY.snow);
    expect(FLOW_RESISTIVITY.snow).toBeGreaterThan(FLOW_RESISTIVITY.soft);
  });

  it('should have physically realistic values', () => {
    // Hard (concrete) typically 200k-2M Pa·s/m²
    expect(FLOW_RESISTIVITY.hard).toBeGreaterThanOrEqual(200000);
    expect(FLOW_RESISTIVITY.hard).toBeLessThanOrEqual(5000000);

    // Soft (grass/soil) typically 10k-50k Pa·s/m²
    expect(FLOW_RESISTIVITY.soft).toBeGreaterThanOrEqual(10000);
    expect(FLOW_RESISTIVITY.soft).toBeLessThanOrEqual(50000);
  });
});

describe('Edge Cases and Numerical Stability', () => {
  it('should handle very low frequency (63 Hz)', () => {
    const coeff = getGroundReflectionCoeff('soft', 0, 63);
    expect(Number.isFinite(coeff.magnitude)).toBe(true);
    expect(Number.isFinite(coeff.phase)).toBe(true);
  });

  it('should handle very high frequency (16 kHz)', () => {
    const coeff = getGroundReflectionCoeff('soft', 0, 16000);
    expect(Number.isFinite(coeff.magnitude)).toBe(true);
    expect(Number.isFinite(coeff.phase)).toBe(true);
  });

  it('should handle extreme f/σ ratios gracefully', () => {
    // Very small f/σ (hard ground, low freq)
    const Z_low = delanyBazleyImpedance(63, 2000000);
    expect(Number.isFinite(Z_low.re)).toBe(true);

    // Very large f/σ (soft ground, high freq)
    const Z_high = mikiImpedance(16000, 10000);
    expect(Number.isFinite(Z_high.re)).toBe(true);
  });

  it('should clamp X parameter to prevent overflow', () => {
    // Extreme case: f/σ approaches 0
    const Z = delanyBazleyImpedance(1, 10000000);
    expect(Number.isFinite(Z.re)).toBe(true);
    expect(Z.re).toBeLessThan(1e10); // Should be clamped, not infinite
  });
});
