/**
 * Unit tests for @geonoise/core units module
 * Tests physical unit calculations and conversions
 */

import { describe, it, expect } from 'vitest';
import {
  speedOfSound,
  speedOfSoundAccurate,
  atmosphericAbsorptionSimple,
  atmosphericAbsorptionISO9613,
  GroundType,
  groundFactor,
  wavelength,
  period,
  frequencyFromWavelength,
  powerToLevel,
  levelToPower,
  pressureToLevel,
  levelToPressure,
  directivityFactor,
  directivityIndex,
} from './index.js';

// ============================================================================
// Speed of Sound Tests
// ============================================================================

describe('speedOfSound', () => {
  it('calculates speed at standard temperature (20°C)', () => {
    const c = speedOfSound(20);
    // c = 331.3 + 0.606 * 20 = 343.42 m/s
    expect(c).toBeCloseTo(343.42, 2);
  });

  it('calculates speed at 0°C', () => {
    const c = speedOfSound(0);
    // c = 331.3 + 0.606 * 0 = 331.3 m/s
    expect(c).toBeCloseTo(331.3, 2);
  });

  it('calculates speed at -10°C', () => {
    const c = speedOfSound(-10);
    // c = 331.3 + 0.606 * (-10) = 325.24 m/s
    expect(c).toBeCloseTo(325.24, 2);
  });

  it('calculates speed at 30°C', () => {
    const c = speedOfSound(30);
    // c = 331.3 + 0.606 * 30 = 349.48 m/s
    expect(c).toBeCloseTo(349.48, 2);
  });

  it('uses default temperature when not specified', () => {
    const c = speedOfSound();
    // Default is STANDARD_TEMPERATURE = 20°C
    expect(c).toBeCloseTo(343.42, 2);
  });
});

describe('speedOfSoundAccurate', () => {
  it('calculates speed at standard conditions', () => {
    const c = speedOfSoundAccurate(20, 50, 101.325);
    // Should be close to ~343 m/s at standard conditions
    expect(c).toBeGreaterThan(340);
    expect(c).toBeLessThan(350);
  });

  it('increases with higher temperature', () => {
    const c20 = speedOfSoundAccurate(20, 50, 101.325);
    const c30 = speedOfSoundAccurate(30, 50, 101.325);
    expect(c30).toBeGreaterThan(c20);
  });

  it('is affected by humidity', () => {
    const cDry = speedOfSoundAccurate(20, 10, 101.325);
    const cHumid = speedOfSoundAccurate(20, 90, 101.325);
    // Speed should be slightly higher in humid air
    expect(cHumid).not.toBe(cDry);
  });
});

// ============================================================================
// Atmospheric Absorption Tests
// ============================================================================

describe('atmosphericAbsorptionSimple', () => {
  it('returns low absorption at low frequencies', () => {
    const alpha = atmosphericAbsorptionSimple(63, 20, 50);
    expect(alpha).toBeLessThan(0.001);
  });

  it('returns higher absorption at high frequencies', () => {
    const alpha63 = atmosphericAbsorptionSimple(63, 20, 50);
    const alpha8000 = atmosphericAbsorptionSimple(8000, 20, 50);
    expect(alpha8000).toBeGreaterThan(alpha63 * 10);
  });

  it('applies temperature correction', () => {
    const alpha20 = atmosphericAbsorptionSimple(1000, 20, 50);
    const alpha30 = atmosphericAbsorptionSimple(1000, 30, 50);
    expect(alpha30).toBeGreaterThan(alpha20);
  });

  it('applies humidity correction', () => {
    const alpha50 = atmosphericAbsorptionSimple(1000, 20, 50);
    const alpha80 = atmosphericAbsorptionSimple(1000, 20, 80);
    // Lower humidity = higher correction factor
    expect(alpha50).toBeGreaterThan(alpha80);
  });

  it('never returns negative values', () => {
    const alpha = atmosphericAbsorptionSimple(1000, 40, 90);
    expect(alpha).toBeGreaterThanOrEqual(0);
  });
});

describe('atmosphericAbsorptionISO9613', () => {
  it('returns positive absorption coefficient', () => {
    const alpha = atmosphericAbsorptionISO9613(1000, 20, 50, 101.325);
    expect(alpha).toBeGreaterThan(0);
  });

  it('increases with frequency', () => {
    const alpha500 = atmosphericAbsorptionISO9613(500, 20, 50, 101.325);
    const alpha4000 = atmosphericAbsorptionISO9613(4000, 20, 50, 101.325);
    expect(alpha4000).toBeGreaterThan(alpha500);
  });

  it('produces values in expected range for 1kHz', () => {
    const alpha = atmosphericAbsorptionISO9613(1000, 20, 50, 101.325);
    // ISO 9613 predicts ~0.005 dB/m at 1kHz, 20°C, 50% RH
    expect(alpha).toBeGreaterThan(0.001);
    expect(alpha).toBeLessThan(0.02);
  });
});

// ============================================================================
// Ground Factor Tests
// ============================================================================

describe('groundFactor', () => {
  it('returns 0 for hard ground', () => {
    expect(groundFactor(GroundType.Hard)).toBe(0);
  });

  it('returns 0.5 for mixed ground', () => {
    expect(groundFactor(GroundType.Mixed)).toBe(0.5);
  });

  it('returns 1 for soft ground', () => {
    expect(groundFactor(GroundType.Soft)).toBe(1);
  });
});

// ============================================================================
// Wavelength and Period Tests
// ============================================================================

describe('wavelength', () => {
  it('calculates wavelength at 1kHz and 20°C', () => {
    const lambda = wavelength(1000, 20);
    // λ = c / f = 343.42 / 1000 ≈ 0.343 m
    expect(lambda).toBeCloseTo(0.343, 2);
  });

  it('calculates wavelength at 100Hz', () => {
    const lambda = wavelength(100, 20);
    // λ = 343.42 / 100 ≈ 3.43 m
    expect(lambda).toBeCloseTo(3.43, 2);
  });

  it('wavelength decreases with higher frequency', () => {
    const lambda100 = wavelength(100, 20);
    const lambda1000 = wavelength(1000, 20);
    expect(lambda1000).toBeLessThan(lambda100);
    expect(lambda100 / lambda1000).toBeCloseTo(10, 0);
  });

  it('wavelength increases with higher temperature', () => {
    const lambda20 = wavelength(1000, 20);
    const lambda30 = wavelength(1000, 30);
    expect(lambda30).toBeGreaterThan(lambda20);
  });
});

describe('period', () => {
  it('calculates period at 1kHz', () => {
    const T = period(1000);
    expect(T).toBe(0.001);
  });

  it('calculates period at 50Hz', () => {
    const T = period(50);
    expect(T).toBe(0.02);
  });

  it('period is inverse of frequency', () => {
    const freq = 440;
    const T = period(freq);
    expect(1 / T).toBe(freq);
  });
});

describe('frequencyFromWavelength', () => {
  it('calculates frequency from wavelength', () => {
    const freq = frequencyFromWavelength(0.34342, 20);
    expect(freq).toBeCloseTo(1000, 0);
  });

  it('is inverse of wavelength function', () => {
    const originalFreq = 500;
    const lambda = wavelength(originalFreq, 20);
    const recoveredFreq = frequencyFromWavelength(lambda, 20);
    expect(recoveredFreq).toBeCloseTo(originalFreq, 5);
  });
});

// ============================================================================
// Power/Level Conversion Tests
// ============================================================================

describe('powerToLevel', () => {
  it('converts 1 pW to 0 dB', () => {
    const level = powerToLevel(1e-12);
    expect(level).toBeCloseTo(0, 5);
  });

  it('converts 1 W to 120 dB', () => {
    const level = powerToLevel(1);
    expect(level).toBeCloseTo(120, 5);
  });

  it('converts 10 W to 130 dB', () => {
    const level = powerToLevel(10);
    expect(level).toBeCloseTo(130, 5);
  });

  it('converts 0.1 W to 110 dB', () => {
    const level = powerToLevel(0.1);
    expect(level).toBeCloseTo(110, 5);
  });
});

describe('levelToPower', () => {
  it('converts 0 dB to 1 pW', () => {
    const power = levelToPower(0);
    expect(power).toBeCloseTo(1e-12, 20);
  });

  it('converts 120 dB to 1 W', () => {
    const power = levelToPower(120);
    expect(power).toBeCloseTo(1, 5);
  });

  it('converts 130 dB to 10 W', () => {
    const power = levelToPower(130);
    expect(power).toBeCloseTo(10, 5);
  });

  it('is inverse of powerToLevel', () => {
    const originalPower = 0.5;
    const level = powerToLevel(originalPower);
    const recoveredPower = levelToPower(level);
    expect(recoveredPower).toBeCloseTo(originalPower, 10);
  });
});

describe('pressureToLevel', () => {
  it('converts 20 µPa to 0 dB SPL', () => {
    const level = pressureToLevel(2e-5);
    expect(level).toBeCloseTo(0, 5);
  });

  it('converts 1 Pa to 94 dB SPL', () => {
    const level = pressureToLevel(1);
    expect(level).toBeCloseTo(94, 0);
  });

  it('converts 2 Pa to 100 dB SPL', () => {
    const level = pressureToLevel(2);
    expect(level).toBeCloseTo(100, 0);
  });
});

describe('levelToPressure', () => {
  it('converts 0 dB SPL to 20 µPa', () => {
    const pressure = levelToPressure(0);
    expect(pressure).toBeCloseTo(2e-5, 10);
  });

  it('converts 94 dB SPL to ~1 Pa', () => {
    const pressure = levelToPressure(94);
    expect(pressure).toBeCloseTo(1, 1);
  });

  it('is inverse of pressureToLevel', () => {
    const originalPressure = 0.1;
    const level = pressureToLevel(originalPressure);
    const recoveredPressure = levelToPressure(level);
    expect(recoveredPressure).toBeCloseTo(originalPressure, 10);
  });
});

// ============================================================================
// Directivity Tests
// ============================================================================

describe('directivityFactor', () => {
  it('returns 1 for free field (no boundaries)', () => {
    expect(directivityFactor(false, false, false)).toBe(1);
  });

  it('returns 2 for on ground (hemisphere)', () => {
    expect(directivityFactor(true, false, false)).toBe(2);
  });

  it('returns 4 for near wall (quarter sphere)', () => {
    expect(directivityFactor(false, true, false)).toBe(4);
  });

  it('returns 8 for in corner (eighth sphere)', () => {
    expect(directivityFactor(false, false, true)).toBe(8);
  });

  it('corner takes precedence over other conditions', () => {
    expect(directivityFactor(true, true, true)).toBe(8);
  });

  it('wall takes precedence over ground', () => {
    expect(directivityFactor(true, true, false)).toBe(4);
  });
});

describe('directivityIndex', () => {
  it('returns 0 dB for Q=1', () => {
    expect(directivityIndex(1)).toBeCloseTo(0, 5);
  });

  it('returns 3 dB for Q=2', () => {
    expect(directivityIndex(2)).toBeCloseTo(3.01, 1);
  });

  it('returns 6 dB for Q=4', () => {
    expect(directivityIndex(4)).toBeCloseTo(6.02, 1);
  });

  it('returns 9 dB for Q=8', () => {
    expect(directivityIndex(8)).toBeCloseTo(9.03, 1);
  });
});
