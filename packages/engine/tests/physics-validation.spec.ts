/**
 * Physics Validation Test Suite
 *
 * This file contains physics-critical tests that validate the acoustic
 * propagation model against known values and standards.
 *
 * Run with: npx vitest run tests/physics-validation.spec.ts
 * Generate report with: npm run test:physics-report
 */

import { describe, it, expect, afterAll } from 'vitest';
import {
  barrierAttenuation,
  calculatePropagation,
  spreadingLoss,
} from '../src/propagation/index.js';
import { getDefaultEngineConfig } from '../src/api/index.js';
import {
  sumPhasorsCoherent,
  dBToPressure,
  pressureTodB,
  phaseFromPathDifference,
  wavelength,
  fresnelRadius,
  type Phasor,
} from '@geonoise/shared';
import {
  traceAllPaths,
  traceDiffractionPath,
  DEFAULT_RAYTRACING_CONFIG,
  type ReflectingSurface,
  type RayTracingConfig,
} from '../src/raytracing/index.js';
import type { Point3D } from '@geonoise/core/coords';

// ============================================================================
// Test Result Collector for Report Generation
// ============================================================================

interface PhysicsTestResult {
  category: string;
  name: string;
  expected: string;
  actual: string;
  tolerance: string;
  passed: boolean;
  reference?: string;
}

const testResults: PhysicsTestResult[] = [];

function recordResult(result: PhysicsTestResult) {
  testResults.push(result);
}

// Generate markdown report after all tests
afterAll(() => {
  if (process.env.PHYSICS_REPORT === 'true') {
    console.log('\n');
    console.log('# Physics Validation Report');
    console.log(`Generated: ${new Date().toISOString()}`);
    console.log('');
    console.log('| Category | Test | Expected | Actual | Tolerance | Status | Reference |');
    console.log('|----------|------|----------|--------|-----------|--------|-----------|');

    for (const r of testResults) {
      const status = r.passed ? '✅' : '❌';
      console.log(`| ${r.category} | ${r.name} | ${r.expected} | ${r.actual} | ${r.tolerance} | ${status} | ${r.reference || ''} |`);
    }

    const passed = testResults.filter(r => r.passed).length;
    const total = testResults.length;
    console.log('');
    console.log(`**Summary:** ${passed}/${total} tests passed`);
  }
});

// ============================================================================
// Spreading Loss (Geometric Divergence)
// ============================================================================

describe('Spreading Loss - ISO 9613-2', () => {
  const EXACT_4PI = 10 * Math.log10(4 * Math.PI); // 10.99 dB

  it('spherical spreading at 1m = 10.99 dB', () => {
    const actual = spreadingLoss(1, 'spherical');
    const expected = EXACT_4PI;
    const passed = Math.abs(actual - expected) < 0.01;

    recordResult({
      category: 'Spreading',
      name: 'Spherical @ 1m',
      expected: `${expected.toFixed(2)} dB`,
      actual: `${actual.toFixed(2)} dB`,
      tolerance: '±0.01 dB',
      passed,
      reference: 'ISO 9613-2 Eq.6'
    });

    expect(actual).toBeCloseTo(expected, 2);
  });

  it('spherical spreading at 10m = 30.99 dB', () => {
    const actual = spreadingLoss(10, 'spherical');
    const expected = 20 * Math.log10(10) + EXACT_4PI;
    const passed = Math.abs(actual - expected) < 0.01;

    recordResult({
      category: 'Spreading',
      name: 'Spherical @ 10m',
      expected: `${expected.toFixed(2)} dB`,
      actual: `${actual.toFixed(2)} dB`,
      tolerance: '±0.01 dB',
      passed,
      reference: 'ISO 9613-2 Eq.6'
    });

    expect(actual).toBeCloseTo(expected, 2);
  });

  it('spherical spreading at 100m = 50.99 dB', () => {
    const actual = spreadingLoss(100, 'spherical');
    const expected = 20 * Math.log10(100) + EXACT_4PI;
    const passed = Math.abs(actual - expected) < 0.01;

    recordResult({
      category: 'Spreading',
      name: 'Spherical @ 100m',
      expected: `${expected.toFixed(2)} dB`,
      actual: `${actual.toFixed(2)} dB`,
      tolerance: '±0.01 dB',
      passed,
      reference: 'ISO 9613-2 Eq.6'
    });

    expect(actual).toBeCloseTo(expected, 2);
  });

  it('inverse square law: +6.02 dB per distance doubling', () => {
    const at10 = spreadingLoss(10, 'spherical');
    const at20 = spreadingLoss(20, 'spherical');
    const actual = at20 - at10;
    const expected = 20 * Math.log10(2); // 6.0206 dB
    const passed = Math.abs(actual - expected) < 0.01;

    recordResult({
      category: 'Spreading',
      name: 'Inverse Square Law',
      expected: `${expected.toFixed(2)} dB/doubling`,
      actual: `${actual.toFixed(2)} dB/doubling`,
      tolerance: '±0.01 dB',
      passed,
      reference: 'Physics'
    });

    expect(actual).toBeCloseTo(expected, 2);
  });
});

// ============================================================================
// Diffraction Ray Tracing - Issue #11
// ============================================================================

describe('Diffraction Ray Tracing - Issue #11', () => {
  const c = 343; // speed of sound m/s

  /**
   * Create a barrier surface for testing
   */
  function createBarrier(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    height: number
  ): ReflectingSurface {
    return {
      segment: { p1, p2 },
      height,
      surfaceType: 'hard',
      absorption: 0,
      id: 'test-barrier',
    };
  }

  it('default config has maxDiffractionDeltaForUnblockedPath = 5.0m', () => {
    const actual = DEFAULT_RAYTRACING_CONFIG.maxDiffractionDeltaForUnblockedPath;
    const expected = 5.0;
    const lambda63Hz = c / 63; // ~5.44m
    const passed = Math.abs(actual - expected) < 0.01;

    recordResult({
      category: 'Diffraction',
      name: 'Default threshold',
      expected: `${expected} m (~1λ @ 63Hz)`,
      actual: `${actual.toFixed(2)} m`,
      tolerance: 'exact',
      passed,
      reference: 'Issue #11'
    });

    expect(actual).toBe(expected);
  });

  it('diffraction traced when direct path blocked', () => {
    const source: Point3D = { x: 0, y: 0, z: 2 };
    const receiver: Point3D = { x: 20, y: 0, z: 1.5 };
    const barrier = createBarrier({ x: 10, y: -5 }, { x: 10, y: 5 }, 4);

    const config: RayTracingConfig = {
      ...DEFAULT_RAYTRACING_CONFIG,
      includeGround: false,
      maxDiffractionDeltaForUnblockedPath: 0, // Disable new feature
    };

    const paths = traceAllPaths(source, receiver, [], [barrier], config);
    const directPath = paths.find(p => p.type === 'direct');
    const diffPaths = paths.filter(p => p.type === 'diffracted');

    const directBlocked = directPath && !directPath.valid;
    const diffracted = diffPaths.length === 1;
    const passed = directBlocked && diffracted;

    recordResult({
      category: 'Diffraction',
      name: 'Blocked → diffract',
      expected: 'direct blocked + 1 diffraction',
      actual: `blocked=${directBlocked}, diff=${diffPaths.length}`,
      tolerance: 'exact',
      passed,
      reference: 'Issue #11'
    });

    expect(directPath!.valid).toBe(false);
    expect(diffPaths.length).toBe(1);
  });

  it('no diffraction when disabled and direct unblocked', () => {
    const source: Point3D = { x: 0, y: 0, z: 2 };
    const receiver: Point3D = { x: 20, y: 0, z: 1.5 };
    // Barrier to the side - doesn't block direct path
    const barrier = createBarrier({ x: 10, y: 5 }, { x: 10, y: 10 }, 4);

    const config: RayTracingConfig = {
      ...DEFAULT_RAYTRACING_CONFIG,
      includeGround: false,
      maxDiffractionDeltaForUnblockedPath: 0, // Disabled
    };

    const paths = traceAllPaths(source, receiver, [], [barrier], config);
    const directPath = paths.find(p => p.type === 'direct');
    const diffPaths = paths.filter(p => p.type === 'diffracted');

    const directValid = directPath?.valid;
    const noDiffraction = diffPaths.length === 0;
    const passed = directValid === true && noDiffraction;

    recordResult({
      category: 'Diffraction',
      name: 'Disabled → no diff',
      expected: 'direct valid, 0 diffraction',
      actual: `valid=${directValid}, diff=${diffPaths.length}`,
      tolerance: 'exact',
      passed,
      reference: 'Issue #11'
    });

    expect(directPath!.valid).toBe(true);
    expect(diffPaths.length).toBe(0);
  });

  it('diffraction traced for nearby barrier (δ < threshold)', () => {
    const source: Point3D = { x: 0, y: 0, z: 2 };
    const receiver: Point3D = { x: 20, y: 0, z: 1.5 };
    // Low barrier - will have small path difference
    const barrier = createBarrier({ x: 10, y: -5 }, { x: 10, y: 5 }, 2.5);

    const config: RayTracingConfig = {
      ...DEFAULT_RAYTRACING_CONFIG,
      includeGround: false,
      maxDiffractionDeltaForUnblockedPath: 5.0, // Enabled
    };

    const paths = traceAllPaths(source, receiver, [], [barrier], config);
    const diffPaths = paths.filter(p => p.type === 'diffracted');

    const hasDiffraction = diffPaths.length > 0;
    const pathDiff = diffPaths[0]?.pathDifference ?? 999;
    const withinThreshold = pathDiff < 5.0;
    const passed = hasDiffraction && withinThreshold;

    recordResult({
      category: 'Diffraction',
      name: 'Nearby → include',
      expected: 'δ < 5m, diffraction traced',
      actual: `δ=${pathDiff.toFixed(2)}m, traced=${hasDiffraction}`,
      tolerance: 'inequality',
      passed,
      reference: 'Issue #11'
    });

    expect(diffPaths.length).toBeGreaterThan(0);
    expect(pathDiff).toBeLessThan(5.0);
  });

  it('path difference geometry is correct', () => {
    const source: Point3D = { x: 0, y: 0, z: 0 };
    const receiver: Point3D = { x: 20, y: 0, z: 0 };
    const barrierHeight = 5;
    const barrier = createBarrier({ x: 10, y: -5 }, { x: 10, y: 5 }, barrierHeight);

    const diffPath = traceDiffractionPath(source, receiver, barrier, []);

    // Expected: S(0,0,0) → B(10,0,5) → R(20,0,0)
    // Path A = sqrt(10² + 5²) = sqrt(125) ≈ 11.18m
    // Path B = sqrt(10² + 5²) = sqrt(125) ≈ 11.18m
    // Total = 22.36m, Direct = 20m, δ = 2.36m
    const expectedPathA = Math.sqrt(100 + 25);
    const expectedTotal = 2 * expectedPathA;
    const expectedDiff = expectedTotal - 20;

    const actualDiff = diffPath?.pathDifference ?? 0;
    const passed = Math.abs(actualDiff - expectedDiff) < 0.1;

    recordResult({
      category: 'Diffraction',
      name: 'Path difference δ',
      expected: `${expectedDiff.toFixed(2)} m`,
      actual: `${actualDiff.toFixed(2)} m`,
      tolerance: '±0.1 m',
      passed,
      reference: 'Geometry'
    });

    expect(actualDiff).toBeCloseTo(expectedDiff, 1);
  });

  it('threshold ~1 wavelength at 63 Hz', () => {
    const lambda63Hz = c / 63;
    const threshold = DEFAULT_RAYTRACING_CONFIG.maxDiffractionDeltaForUnblockedPath;
    const ratio = threshold / lambda63Hz;
    const passed = ratio > 0.8 && ratio < 1.2; // Within 20% of 1 wavelength

    recordResult({
      category: 'Diffraction',
      name: 'Threshold ≈ λ(63Hz)',
      expected: `~1.0 wavelengths`,
      actual: `${ratio.toFixed(2)} wavelengths`,
      tolerance: '±20%',
      passed,
      reference: 'Wave physics'
    });

    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.2);
  });
});

// ============================================================================
// Atmospheric Absorption
// ============================================================================

describe('Atmospheric Absorption - ISO 9613-1', () => {
  const config = getDefaultEngineConfig('festival_fast');
  const meteo = config.meteo!;

  it('A_atm = 0 when mode is none', () => {
    const propConfig = { ...config.propagation!, atmosphericAbsorption: 'none' as const };
    const result = calculatePropagation(100, 1.5, 1.5, propConfig, meteo, 0, false, 8000);
    const actual = result.atmosphericAbsorption;
    const expected = 0;
    const passed = actual === expected;

    recordResult({
      category: 'Atmospheric',
      name: 'None mode @ 8kHz',
      expected: `${expected} dB`,
      actual: `${actual.toFixed(2)} dB`,
      tolerance: 'exact',
      passed,
      reference: 'User setting'
    });

    expect(actual).toBe(0);
  });

  it('A_atm > 0 for iso9613 mode at high frequency', () => {
    const propConfig = { ...config.propagation!, atmosphericAbsorption: 'iso9613' as const };
    const result = calculatePropagation(100, 1.5, 1.5, propConfig, meteo, 0, false, 8000);
    const actual = result.atmosphericAbsorption;
    // At 8kHz, α ≈ 0.117 dB/m → 100m ≈ 11.7 dB
    const expectedMin = 5;
    const expectedMax = 20;
    const passed = actual > expectedMin && actual < expectedMax;

    recordResult({
      category: 'Atmospheric',
      name: 'ISO 9613-1 @ 8kHz, 100m',
      expected: `${expectedMin}-${expectedMax} dB`,
      actual: `${actual.toFixed(2)} dB`,
      tolerance: 'range',
      passed,
      reference: 'ISO 9613-1'
    });

    expect(actual).toBeGreaterThan(expectedMin);
    expect(actual).toBeLessThan(expectedMax);
  });

  it('A_atm increases with frequency', () => {
    const propConfig = { ...config.propagation!, atmosphericAbsorption: 'iso9613' as const };
    const at125Hz = calculatePropagation(100, 1.5, 1.5, propConfig, meteo, 0, false, 125).atmosphericAbsorption;
    const at8kHz = calculatePropagation(100, 1.5, 1.5, propConfig, meteo, 0, false, 8000).atmosphericAbsorption;
    const passed = at8kHz > at125Hz;

    recordResult({
      category: 'Atmospheric',
      name: 'Frequency dependence',
      expected: 'A_atm(8kHz) > A_atm(125Hz)',
      actual: `${at8kHz.toFixed(2)} > ${at125Hz.toFixed(2)}`,
      tolerance: 'inequality',
      passed,
      reference: 'ISO 9613-1'
    });

    expect(at8kHz).toBeGreaterThan(at125Hz);
  });
});

// ============================================================================
// Barrier Diffraction - Maekawa Formula
// ============================================================================

describe('Barrier Diffraction - Maekawa', () => {
  it('thin barrier coefficient = 20', () => {
    // N = 2 → A_bar = 10*log10(3 + 20*2) = 16.33 dB
    const pathDiff = 1; // meters
    const frequency = 343; // λ = 1m → N = 2
    const lambda = 1;
    const actual = barrierAttenuation(pathDiff, frequency, lambda, 'thin');
    const expected = 10 * Math.log10(3 + 20 * 2);
    const passed = Math.abs(actual - expected) < 0.1;

    recordResult({
      category: 'Barrier',
      name: 'Thin barrier (N=2)',
      expected: `${expected.toFixed(2)} dB`,
      actual: `${actual.toFixed(2)} dB`,
      tolerance: '±0.1 dB',
      passed,
      reference: 'Maekawa 1968'
    });

    expect(actual).toBeCloseTo(expected, 1);
  });

  it('thick barrier coefficient = 40', () => {
    // N = 2 → A_bar = 10*log10(3 + 40*2) = 19.19 dB
    const pathDiff = 1;
    const frequency = 343;
    const lambda = 1;
    const actual = barrierAttenuation(pathDiff, frequency, lambda, 'thick');
    const expected = 10 * Math.log10(3 + 40 * 2);
    const passed = Math.abs(actual - expected) < 0.1;

    recordResult({
      category: 'Barrier',
      name: 'Thick barrier (N=2)',
      expected: `${expected.toFixed(2)} dB`,
      actual: `${actual.toFixed(2)} dB`,
      tolerance: '±0.1 dB',
      passed,
      reference: 'Issue #16'
    });

    expect(actual).toBeCloseTo(expected, 1);
  });

  it('thin barrier cap = 20 dB', () => {
    const actual = barrierAttenuation(100, 8000, undefined, 'thin');
    const expected = 20;
    const passed = actual === expected;

    recordResult({
      category: 'Barrier',
      name: 'Thin barrier cap',
      expected: `${expected} dB`,
      actual: `${actual.toFixed(2)} dB`,
      tolerance: 'exact',
      passed,
      reference: 'ISO 9613-2'
    });

    expect(actual).toBe(20);
  });

  it('thick barrier cap = 25 dB', () => {
    const actual = barrierAttenuation(100, 8000, undefined, 'thick');
    const expected = 25;
    const passed = actual === expected;

    recordResult({
      category: 'Barrier',
      name: 'Thick barrier cap',
      expected: `${expected} dB`,
      actual: `${actual.toFixed(2)} dB`,
      tolerance: 'exact',
      passed,
      reference: 'Issue #16'
    });

    expect(actual).toBe(25);
  });

  it('barrier attenuation increases with frequency', () => {
    const pathDiff = 5;
    const at125Hz = barrierAttenuation(pathDiff, 125, undefined, 'thick');
    const at8kHz = barrierAttenuation(pathDiff, 8000, undefined, 'thick');
    const passed = at8kHz > at125Hz;

    recordResult({
      category: 'Barrier',
      name: 'Frequency dependence',
      expected: 'A_bar(8kHz) > A_bar(125Hz)',
      actual: `${at8kHz.toFixed(2)} > ${at125Hz.toFixed(2)}`,
      tolerance: 'inequality',
      passed,
      reference: 'Maekawa 1968'
    });

    expect(at8kHz).toBeGreaterThan(at125Hz);
  });

  it('negative Fresnel number returns 0', () => {
    const actual = barrierAttenuation(-0.5, 1000, undefined, 'thin');
    const expected = 0;
    const passed = actual === expected;

    recordResult({
      category: 'Barrier',
      name: 'Negative N guard',
      expected: `${expected} dB`,
      actual: `${actual} dB`,
      tolerance: 'exact',
      passed,
      reference: 'Maekawa 1968'
    });

    expect(actual).toBe(0);
  });
});

// ============================================================================
// Speed of Sound
// ============================================================================

describe('Speed of Sound', () => {
  const speedFormula = (T: number) => 331.3 + 0.606 * T;

  it('c at 0°C = 331.3 m/s', () => {
    const actual = speedFormula(0);
    const expected = 331.3;
    const passed = Math.abs(actual - expected) < 0.1;

    recordResult({
      category: 'Speed of Sound',
      name: 'At 0°C',
      expected: `${expected} m/s`,
      actual: `${actual.toFixed(2)} m/s`,
      tolerance: '±0.1 m/s',
      passed,
      reference: 'ISO 9613-1'
    });

    expect(actual).toBeCloseTo(expected, 1);
  });

  it('c at 20°C ≈ 343.4 m/s', () => {
    const actual = speedFormula(20);
    const expected = 343.42;
    const passed = Math.abs(actual - expected) < 0.1;

    recordResult({
      category: 'Speed of Sound',
      name: 'At 20°C',
      expected: `${expected} m/s`,
      actual: `${actual.toFixed(2)} m/s`,
      tolerance: '±0.1 m/s',
      passed,
      reference: 'ISO 9613-1'
    });

    expect(actual).toBeCloseTo(expected, 1);
  });

  it('temperature coefficient = 0.606 m/s/°C', () => {
    const at15 = speedFormula(15);
    const at25 = speedFormula(25);
    const actual = (at25 - at15) / 10;
    const expected = 0.606;
    const passed = Math.abs(actual - expected) < 0.001;

    recordResult({
      category: 'Speed of Sound',
      name: 'Temperature coefficient',
      expected: `${expected} m/s/°C`,
      actual: `${actual.toFixed(3)} m/s/°C`,
      tolerance: '±0.001',
      passed,
      reference: 'ISO 9613-1'
    });

    expect(actual).toBeCloseTo(expected, 3);
  });
});

// ============================================================================
// Combined Propagation
// ============================================================================

describe('Combined Propagation', () => {
  const config = getDefaultEngineConfig('festival_fast');
  const propConfig = config.propagation!;
  const meteo = config.meteo!;

  it('100 dB Lw at 10m ≈ 69 dB SPL (spreading only)', () => {
    const Lw = 100;
    const result = calculatePropagation(10, 1.5, 1.5,
      { ...propConfig, atmosphericAbsorption: 'none', groundReflection: false },
      meteo, 0, false, 1000);
    const actual = Lw - result.spreadingLoss;
    const expected = 69;
    const passed = Math.abs(actual - expected) < 1;

    recordResult({
      category: 'Combined',
      name: 'SPL at 10m (spreading)',
      expected: `~${expected} dB`,
      actual: `${actual.toFixed(1)} dB`,
      tolerance: '±1 dB',
      passed,
      reference: 'ISO 9613-2'
    });

    expect(actual).toBeCloseTo(expected, 0);
  });

  it('100 dB Lw at 100m ≈ 49 dB SPL (spreading only)', () => {
    const Lw = 100;
    const result = calculatePropagation(100, 1.5, 1.5,
      { ...propConfig, atmosphericAbsorption: 'none', groundReflection: false },
      meteo, 0, false, 1000);
    const actual = Lw - result.spreadingLoss;
    const expected = 49;
    const passed = Math.abs(actual - expected) < 1;

    recordResult({
      category: 'Combined',
      name: 'SPL at 100m (spreading)',
      expected: `~${expected} dB`,
      actual: `${actual.toFixed(1)} dB`,
      tolerance: '±1 dB',
      passed,
      reference: 'ISO 9613-2'
    });

    expect(actual).toBeCloseTo(expected, 0);
  });

  it('diffracted path uses longer distance for A_atm', () => {
    const direct = calculatePropagation(100, 1.5, 1.5,
      { ...propConfig, atmosphericAbsorption: 'iso9613' },
      meteo, 0, false, 8000);
    const diffracted = calculatePropagation(100, 1.5, 1.5,
      { ...propConfig, atmosphericAbsorption: 'iso9613', includeBarriers: true },
      meteo, 50, true, 8000, 150); // 50m extra path

    const passed = diffracted.atmosphericAbsorption > direct.atmosphericAbsorption;

    recordResult({
      category: 'Combined',
      name: 'Diffracted path A_atm',
      expected: 'A_atm(150m) > A_atm(100m)',
      actual: `${diffracted.atmosphericAbsorption.toFixed(2)} > ${direct.atmosphericAbsorption.toFixed(2)}`,
      tolerance: 'inequality',
      passed,
      reference: 'Issue #4'
    });

    expect(diffracted.atmosphericAbsorption).toBeGreaterThan(direct.atmosphericAbsorption);
  });
});

// ============================================================================
// Phasor Arithmetic - Coherent Summation
// ============================================================================

describe('Phasor Arithmetic', () => {
  const c = 343; // speed of sound m/s
  const P_REF = 2e-5; // reference pressure

  it('dB to pressure: 94 dB = 1 Pa', () => {
    const actual = dBToPressure(94);
    const expected = 1.0; // Pa
    const passed = Math.abs(actual - expected) < 0.01;

    recordResult({
      category: 'Phasor',
      name: 'dB to pressure (94 dB)',
      expected: `${expected.toFixed(2)} Pa`,
      actual: `${actual.toFixed(2)} Pa`,
      tolerance: '±0.01 Pa',
      passed,
      reference: 'Acoustics'
    });

    expect(actual).toBeCloseTo(expected, 2);
  });

  it('pressure to dB: 1 Pa = 94 dB', () => {
    const actual = pressureTodB(1.0);
    const expected = 94;
    const passed = Math.abs(actual - expected) < 0.1;

    recordResult({
      category: 'Phasor',
      name: 'Pressure to dB (1 Pa)',
      expected: `${expected} dB`,
      actual: `${actual.toFixed(2)} dB`,
      tolerance: '±0.1 dB',
      passed,
      reference: 'Acoustics'
    });

    expect(actual).toBeCloseTo(expected, 1);
  });

  it('constructive interference: 0° phase = +6 dB', () => {
    // Two equal-level phasors in phase → +6 dB boost
    const p1: Phasor = { pressure: P_REF * 10, phase: 0 }; // 20 dB
    const p2: Phasor = { pressure: P_REF * 10, phase: 0 }; // 20 dB, same phase
    const actual = sumPhasorsCoherent([p1, p2]);
    const expected = 26; // 20 + 6 = 26 dB
    const passed = Math.abs(actual - expected) < 0.1;

    recordResult({
      category: 'Phasor',
      name: 'Constructive (in-phase)',
      expected: `${expected} dB`,
      actual: `${actual.toFixed(2)} dB`,
      tolerance: '±0.1 dB',
      passed,
      reference: 'Physics'
    });

    expect(actual).toBeCloseTo(expected, 1);
  });

  it('destructive interference: 180° phase = cancellation', () => {
    // Two equal-level phasors 180° out of phase → deep null
    const p1: Phasor = { pressure: P_REF * 10, phase: 0 };
    const p2: Phasor = { pressure: P_REF * 10, phase: Math.PI };
    const actual = sumPhasorsCoherent([p1, p2]);
    const passed = actual < -100; // deep null

    recordResult({
      category: 'Phasor',
      name: 'Destructive (anti-phase)',
      expected: 'deep null (< -100 dB)',
      actual: `${actual.toFixed(1)} dB`,
      tolerance: 'inequality',
      passed,
      reference: 'Physics'
    });

    expect(actual).toBeLessThan(-100);
  });

  it('90° phase shift = +3 dB', () => {
    // Two equal phasors at 90° → sqrt(2) pressure → +3 dB
    const p1: Phasor = { pressure: P_REF * 10, phase: 0 }; // 20 dB
    const p2: Phasor = { pressure: P_REF * 10, phase: Math.PI / 2 }; // 90°
    const actual = sumPhasorsCoherent([p1, p2]);
    const expected = 20 + 3; // 23 dB
    const passed = Math.abs(actual - expected) < 0.2;

    recordResult({
      category: 'Phasor',
      name: 'Quadrature (90°)',
      expected: `${expected} dB`,
      actual: `${actual.toFixed(2)} dB`,
      tolerance: '±0.2 dB',
      passed,
      reference: 'Physics'
    });

    expect(actual).toBeCloseTo(expected, 0);
  });

  it('phase from path difference: λ/2 = π radians', () => {
    const freq = 1000; // Hz
    const lambda = c / freq; // ~0.343 m
    const pathDiff = lambda / 2;
    const actual = phaseFromPathDifference(pathDiff, freq, c);
    const expected = -Math.PI; // negative because phase = -k*d
    const passed = Math.abs(actual - expected) < 0.01;

    recordResult({
      category: 'Phasor',
      name: 'Phase from λ/2 path diff',
      expected: `${expected.toFixed(4)} rad`,
      actual: `${actual.toFixed(4)} rad`,
      tolerance: '±0.01 rad',
      passed,
      reference: 'Wave physics'
    });

    expect(actual).toBeCloseTo(expected, 2);
  });

  it('wavelength: 343 Hz = 1 m wavelength', () => {
    const actual = wavelength(343, c);
    const expected = 1.0;
    const passed = Math.abs(actual - expected) < 0.01;

    recordResult({
      category: 'Phasor',
      name: 'Wavelength @ 343 Hz',
      expected: `${expected} m`,
      actual: `${actual.toFixed(4)} m`,
      tolerance: '±0.01 m',
      passed,
      reference: 'Wave physics'
    });

    expect(actual).toBeCloseTo(expected, 2);
  });

  it('Fresnel radius at midpoint', () => {
    // At midpoint of 100m path, 1000 Hz: sqrt(λ*50*50/100) = sqrt(0.343*25) ≈ 2.93m
    const d1 = 50;
    const d2 = 50;
    const freq = 1000;
    const actual = fresnelRadius(d1, d2, freq, c);
    const lambda = c / freq;
    const expected = Math.sqrt(lambda * d1 * d2 / (d1 + d2));
    const passed = Math.abs(actual - expected) < 0.01;

    recordResult({
      category: 'Phasor',
      name: 'Fresnel radius @ midpoint',
      expected: `${expected.toFixed(2)} m`,
      actual: `${actual.toFixed(2)} m`,
      tolerance: '±0.01 m',
      passed,
      reference: 'Wave physics'
    });

    expect(actual).toBeCloseTo(expected, 2);
  });
});
