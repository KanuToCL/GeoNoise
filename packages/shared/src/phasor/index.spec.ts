/**
 * Unit tests for Phasor library
 * Tests complex arithmetic and coherent summation for acoustic interference
 */

import { describe, it, expect } from 'vitest';
import {
  complex,
  complexAdd,
  complexSub,
  complexMul,
  complexAbs,
  complexExpj,
  phasorFromLevel,
  sumPhasorsCoherent,
  dBToPressure,
  pressureTodB,
  phaseFromPathDifference,
} from './index.js';

// Reference pressure (standard hearing threshold)
const P_REF = 2e-5; // Pa

describe('Complex arithmetic', () => {
  it('creates complex numbers', () => {
    const c = complex(3, 4);
    expect(c.re).toBe(3);
    expect(c.im).toBe(4);
  });

  it('adds complex numbers', () => {
    const a = complex(1, 2);
    const b = complex(3, 4);
    const sum = complexAdd(a, b);
    expect(sum.re).toBe(4);
    expect(sum.im).toBe(6);
  });

  it('subtracts complex numbers', () => {
    const a = complex(5, 7);
    const b = complex(2, 3);
    const diff = complexSub(a, b);
    expect(diff.re).toBe(3);
    expect(diff.im).toBe(4);
  });

  it('multiplies complex numbers', () => {
    // (3+4i)(1+2i) = 3 + 6i + 4i + 8i² = 3 + 10i - 8 = -5 + 10i
    const a = complex(3, 4);
    const b = complex(1, 2);
    const prod = complexMul(a, b);
    expect(prod.re).toBe(-5);
    expect(prod.im).toBe(10);
  });

  it('computes magnitude (abs)', () => {
    const c = complex(3, 4);
    expect(complexAbs(c)).toBe(5);
  });

  it('computes e^(iθ) for phase = 0', () => {
    const e = complexExpj(0);
    expect(e.re).toBeCloseTo(1);
    expect(e.im).toBeCloseTo(0);
  });

  it('computes e^(iπ) = -1', () => {
    const e = complexExpj(Math.PI);
    expect(e.re).toBeCloseTo(-1);
    expect(e.im).toBeCloseTo(0, 10);
  });

  it('computes e^(iπ/2) = i', () => {
    const e = complexExpj(Math.PI / 2);
    expect(e.re).toBeCloseTo(0);
    expect(e.im).toBeCloseTo(1);
  });
});

describe('Pressure/dB conversion', () => {
  it('converts 0 dB to reference pressure', () => {
    const p = dBToPressure(0);
    expect(p).toBeCloseTo(P_REF);
  });

  it('converts 94 dB to ~1 Pa (reference level)', () => {
    const p = dBToPressure(94);
    expect(p).toBeCloseTo(1, 1);
  });

  it('converts reference pressure to 0 dB', () => {
    const db = pressureTodB(P_REF);
    expect(db).toBeCloseTo(0);
  });

  it('converts 1 Pa to ~94 dB', () => {
    const db = pressureTodB(1);
    expect(db).toBeCloseTo(94, 0);
  });

  it('roundtrips through conversion', () => {
    const originalDb = 75;
    const p = dBToPressure(originalDb);
    const backToDb = pressureTodB(p);
    expect(backToDb).toBeCloseTo(originalDb);
  });
});

describe('Phasor creation and summation', () => {
  it('creates phasor from dB and phase', () => {
    const phasor = phasorFromLevel(60, 0);
    expect(phasor.pressure).toBeCloseTo(dBToPressure(60));
    expect(phasor.phase).toBe(0);
  });

  it('sums two in-phase phasors coherently (doubles pressure, +6dB)', () => {
    // Two identical sources in phase: double pressure = +6 dB
    const phasor1 = phasorFromLevel(60, 0);
    const phasor2 = phasorFromLevel(60, 0);
    const sum = sumPhasorsCoherent([phasor1, phasor2]);
    
    // Coherent sum of two equal pressures in phase = 2p, which is +6dB
    const expectedDb = 60 + 20 * Math.log10(2); // +6.02 dB
    expect(sum).toBeCloseTo(expectedDb, 1);
  });

  it('sums two out-of-phase phasors coherently (cancellation)', () => {
    // Two identical sources 180° out of phase: complete cancellation
    const phasor1 = phasorFromLevel(60, 0);
    const phasor2 = phasorFromLevel(60, Math.PI);
    const sum = sumPhasorsCoherent([phasor1, phasor2]);
    
    // Should be very low (complete cancellation in theory)
    expect(sum).toBeLessThan(-60);
  });

  it('sums two phasors at 90° phase difference', () => {
    // Two identical sources at 90°: sqrt(2) increase = +3dB
    const phasor1 = phasorFromLevel(60, 0);
    const phasor2 = phasorFromLevel(60, Math.PI / 2);
    const sum = sumPhasorsCoherent([phasor1, phasor2]);
    
    // Coherent sum at 90°: |p1 + ip2| = sqrt(p1² + p2²) = sqrt(2)*p
    // This gives +3dB = 10*log10(2)
    const expectedDb = 60 + 10 * Math.log10(2); // +3.01 dB
    expect(sum).toBeCloseTo(expectedDb, 1);
  });
});

describe('Phase from path difference', () => {
  it('calculates zero phase for zero path difference', () => {
    const phase = phaseFromPathDifference(0, 1000, 343);
    expect(phase).toBeCloseTo(0);
  });

  it('calculates π phase for half-wavelength path difference', () => {
    const f = 1000; // Hz
    const c = 343; // m/s
    const lambda = c / f; // wavelength
    const delta = lambda / 2; // half wavelength
    
    const phase = phaseFromPathDifference(delta, f, c);
    expect(phase).toBeCloseTo(-Math.PI, 5);
  });

  it('calculates 2π phase for full wavelength path difference', () => {
    const f = 1000;
    const c = 343;
    const lambda = c / f;
    
    const phase = phaseFromPathDifference(lambda, f, c);
    expect(phase).toBeCloseTo(-2 * Math.PI, 5);
  });
});

describe('Acoustic interference scenarios', () => {
  describe('Two-source interference pattern', () => {
    const sourceLevel = 70; // dB
    const f = 1000; // Hz
    const c = 343; // m/s
    const lambda = c / f; // ~0.343m

    it('constructive interference at path difference = 0', () => {
      const phasor1 = phasorFromLevel(sourceLevel, 0);
      const phasor2 = phasorFromLevel(sourceLevel, phaseFromPathDifference(0, f, c));
      const sum = sumPhasorsCoherent([phasor1, phasor2]);
      
      // Constructive: +6 dB
      expect(sum).toBeCloseTo(sourceLevel + 6, 1);
    });

    it('destructive interference at path difference = λ/2', () => {
      const phasor1 = phasorFromLevel(sourceLevel, 0);
      const phasor2 = phasorFromLevel(sourceLevel, phaseFromPathDifference(lambda / 2, f, c));
      const sum = sumPhasorsCoherent([phasor1, phasor2]);
      
      // Destructive: deep null
      expect(sum).toBeLessThan(sourceLevel - 20);
    });

    it('constructive again at path difference = λ', () => {
      const phasor1 = phasorFromLevel(sourceLevel, 0);
      const phasor2 = phasorFromLevel(sourceLevel, phaseFromPathDifference(lambda, f, c));
      const sum = sumPhasorsCoherent([phasor1, phasor2]);
      
      // Back to constructive: +6 dB
      expect(sum).toBeCloseTo(sourceLevel + 6, 1);
    });
  });

  describe('Ground reflection comb filter', () => {
    it('exhibits frequency-dependent interference pattern', () => {
      // Simulate ground reflection: direct path at 10m, reflected at 10.34m
      // Path difference = 0.34m = λ at 1000 Hz
      const directDistance = 10;
      const reflectedDistance = 10.34;
      const pathDiff = reflectedDistance - directDistance;
      const c = 343;
      
      // Test at different frequencies
      const results: { freq: number; level: number }[] = [];
      for (const freq of [250, 500, 1000, 2000]) {
        const phase = phaseFromPathDifference(pathDiff, freq, c);
        
        // Direct at 60dB, reflected at 57dB (some absorption)
        const direct = phasorFromLevel(60, 0);
        // π phase shift from ground reflection
        const reflected = phasorFromLevel(57, phase + Math.PI);
        const sum = sumPhasorsCoherent([direct, reflected]);
        
        results.push({ freq, level: sum });
      }
      
      // Comb filter should show variation across frequencies
      const levels = results.map(r => r.level);
      const range = Math.max(...levels) - Math.min(...levels);
      
      // Expect at least 6dB variation due to interference
      expect(range).toBeGreaterThan(6);
    });
  });

  describe('Multi-source summation', () => {
    it('sums three coherent sources with various phases', () => {
      const level = 60;
      const phasors = [
        phasorFromLevel(level, 0),
        phasorFromLevel(level, Math.PI / 4),
        phasorFromLevel(level, Math.PI / 2),
      ];
      
      const sum = sumPhasorsCoherent(phasors);
      
      // Should be higher than single source but less than 3x (phase spread)
      expect(sum).toBeGreaterThan(level + 3);
      expect(sum).toBeLessThan(level + 10);
    });

    it('handles many weak sources', () => {
      // 10 weak sources of 50 dB each, all in phase
      const phasors = Array(10).fill(null).map(() => phasorFromLevel(50, 0));
      const sum = sumPhasorsCoherent(phasors);
      
      // 10 equal sources in phase = 10x pressure = +20 dB
      expect(sum).toBeCloseTo(50 + 20, 1);
    });
  });
});
