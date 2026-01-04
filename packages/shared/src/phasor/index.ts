/**
 * Phasor arithmetic for coherent acoustic summation
 * 
 * Implements complex-valued phasor operations for modeling
 * interference between acoustic paths (direct, ground-reflected,
 * wall-reflected, diffracted).
 * 
 * Key concepts:
 * - Each path contributes a pressure phasor: p * exp(j*phi)
 * - Path length difference -> phase shift: phi = -2*pi*f*deltaR/c
 * - Coherent sum captures constructive/destructive interference
 * - Comb filtering from ground reflections is naturally modeled
 */

// ============================================================================
// Complex Number Type
// ============================================================================

/** Complex number with real and imaginary parts */
export interface Complex {
  re: number;
  im: number;
}

/** Create a complex number */
export function complex(re: number, im: number): Complex {
  return { re, im };
}

/** Complex zero */
export const COMPLEX_ZERO: Complex = { re: 0, im: 0 };

/** Complex one */
export const COMPLEX_ONE: Complex = { re: 1, im: 0 };

// ============================================================================
// Basic Complex Arithmetic
// ============================================================================

/** Add two complex numbers */
export function complexAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

/** Subtract two complex numbers */
export function complexSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

/** Multiply two complex numbers */
export function complexMul(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

/** Divide two complex numbers */
export function complexDiv(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  if (denom === 0) return COMPLEX_ZERO;
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
}

/** Scale complex number by real scalar */
export function complexScale(a: Complex, scalar: number): Complex {
  return { re: a.re * scalar, im: a.im * scalar };
}

/** Complex conjugate */
export function complexConj(a: Complex): Complex {
  return { re: a.re, im: -a.im };
}

/** Complex absolute value (magnitude) */
export function complexAbs(a: Complex): number {
  return Math.sqrt(a.re * a.re + a.im * a.im);
}

/** Complex phase (argument) in radians */
export function complexArg(a: Complex): number {
  return Math.atan2(a.im, a.re);
}

/** Complex exponential e^(j*phi) = cos(phi) + j*sin(phi) */
export function complexExpj(phi: number): Complex {
  return { re: Math.cos(phi), im: Math.sin(phi) };
}

/** Complex square root */
export function complexSqrt(a: Complex): Complex {
  const r = complexAbs(a);
  if (r === 0) return COMPLEX_ZERO;
  const t = Math.sqrt((r + a.re) / 2);
  const u = Math.sqrt((r - a.re) / 2);
  return { re: t, im: a.im < 0 ? -u : u };
}

/** Create complex from polar form (magnitude, phase) */
export function complexFromPolar(magnitude: number, phase: number): Complex {
  return {
    re: magnitude * Math.cos(phase),
    im: magnitude * Math.sin(phase),
  };
}

// ============================================================================
// Phasor (Acoustic Pressure Phasor) Type
// ============================================================================

/**
 * Acoustic pressure phasor representing a single propagation path.
 * 
 * A phasor captures both the magnitude (pressure amplitude) and phase
 * of a sinusoidal wave at a specific frequency. When multiple paths
 * arrive at a receiver, their phasors are summed to get the total
 * pressure, which may show constructive or destructive interference.
 * 
 * Fields:
 * - pressure: RMS pressure amplitude (Pa) for this path
 * - phase: Phase angle (radians) relative to source reference
 */
export interface Phasor {
  pressure: number;  // Pa (linear pressure)
  phase: number;     // radians
}

/** Reference pressure for dB conversion (threshold of hearing) */
const P_REF = 2e-5; // Pa

/** Minimum valid pressure (numerical floor) */
const P_MIN = 1e-12; // Pa

/**
 * Convert dB SPL to pressure (Pa)
 */
export function dBToPressure(dB: number): number {
  if (!Number.isFinite(dB) || dB < -200) return P_MIN;
  return P_REF * Math.pow(10, dB / 20);
}

/**
 * Convert pressure (Pa) to dB SPL
 */
export function pressureTodB(pressure: number): number {
  if (!Number.isFinite(pressure) || pressure <= 0) return -200;
  return 20 * Math.log10(pressure / P_REF);
}

/**
 * Create a phasor from dB level and path distance
 * 
 * The phase is computed as: phi = -2*pi*f*d/c
 * This represents the time delay for sound to travel distance d.
 * 
 * @param level_dB - SPL at this path's contribution
 * @param distance - Path length in meters
 * @param frequency - Frequency in Hz
 * @param speedOfSound - Speed of sound in m/s (default 343)
 * @param phaseOffset - Additional phase offset in radians (e.g., reflection phase change)
 */
export function createPhasor(
  level_dB: number,
  distance: number,
  frequency: number,
  speedOfSound = 343,
  phaseOffset = 0
): Phasor {
  const pressure = dBToPressure(level_dB);
  const k = (2 * Math.PI * frequency) / speedOfSound;
  const phase = -k * distance + phaseOffset;
  return { pressure, phase };
}

/**
 * Create a phasor from an existing level and phase
 */
export function phasorFromLevel(level_dB: number, phase: number): Phasor {
  return { pressure: dBToPressure(level_dB), phase };
}

/**
 * Convert phasor to complex number for arithmetic
 */
export function phasorToComplex(p: Phasor): Complex {
  return complexFromPolar(p.pressure, p.phase);
}

/**
 * Convert complex number back to phasor
 */
export function complexToPhasor(c: Complex): Phasor {
  return {
    pressure: complexAbs(c),
    phase: complexArg(c),
  };
}

/**
 * Sum multiple phasors coherently (complex addition)
 * 
 * This is the core of interference modeling:
 * - Convert each phasor to complex
 * - Add complex values
 * - Convert back to magnitude
 * 
 * @param phasors - Array of phasors to sum
 * @returns Total pressure level in dB
 */
export function sumPhasorsCoherent(phasors: Phasor[]): number {
  if (phasors.length === 0) return -200;
  
  let totalReal = 0;
  let totalImag = 0;
  
  for (const p of phasors) {
    if (p.pressure <= 0) continue;
    totalReal += p.pressure * Math.cos(p.phase);
    totalImag += p.pressure * Math.sin(p.phase);
  }
  
  const totalPressure = Math.sqrt(totalReal * totalReal + totalImag * totalImag);
  return pressureTodB(totalPressure);
}

/**
 * Sum phasors and return both magnitude and phase
 */
export function sumPhasorsCoherentFull(phasors: Phasor[]): Phasor {
  if (phasors.length === 0) return { pressure: 0, phase: 0 };
  
  let totalReal = 0;
  let totalImag = 0;
  
  for (const p of phasors) {
    if (p.pressure <= 0) continue;
    totalReal += p.pressure * Math.cos(p.phase);
    totalImag += p.pressure * Math.sin(p.phase);
  }
  
  return {
    pressure: Math.sqrt(totalReal * totalReal + totalImag * totalImag),
    phase: Math.atan2(totalImag, totalReal),
  };
}

/**
 * Sum phasors incoherently (energetic sum, ignoring phase)
 * 
 * This is equivalent to the traditional dB sum:
 * L_total = 10*log10(sum(10^(Li/10)))
 * 
 * @param phasors - Array of phasors to sum
 * @returns Total pressure level in dB
 */
export function sumPhasorsIncoherent(phasors: Phasor[]): number {
  if (phasors.length === 0) return -200;
  
  let totalEnergy = 0;
  for (const p of phasors) {
    totalEnergy += p.pressure * p.pressure;
  }
  
  const totalPressure = Math.sqrt(totalEnergy);
  return pressureTodB(totalPressure);
}

// ============================================================================
// Spectral Phasor Operations (9-band)
// ============================================================================

import { OCTAVE_BANDS, OCTAVE_BAND_COUNT, MIN_LEVEL } from '../constants/index.js';
import type { Spectrum9 } from '../utils/index.js';

/**
 * Spectral phasor: one phasor per frequency band
 */
export type SpectralPhasor = Phasor[];

/**
 * Create a spectral phasor from a 9-band spectrum and distance
 * 
 * @param spectrum - 9-band levels in dB
 * @param distance - Path distance in meters
 * @param speedOfSound - Speed of sound in m/s
 * @param phaseOffset - Additional phase offset (e.g., for reflections)
 */
export function createSpectralPhasor(
  spectrum: Spectrum9 | number[],
  distance: number,
  speedOfSound = 343,
  phaseOffset = 0
): SpectralPhasor {
  const phasors: Phasor[] = [];
  
  for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
    const freq = OCTAVE_BANDS[i];
    const level = spectrum[i];
    phasors.push(createPhasor(level, distance, freq, speedOfSound, phaseOffset));
  }
  
  return phasors;
}

/**
 * Sum multiple spectral phasors coherently, per band
 * 
 * @param spectralPhasors - Array of spectral phasors (each is 9 phasors)
 * @returns 9-band spectrum after coherent summation
 */
export function sumSpectralPhasorsCoherent(spectralPhasors: SpectralPhasor[]): Spectrum9 {
  const result: number[] = [];
  
  for (let bandIdx = 0; bandIdx < OCTAVE_BAND_COUNT; bandIdx++) {
    const bandPhasors = spectralPhasors
      .map(sp => sp[bandIdx])
      .filter(p => p && p.pressure > 0);
    
    if (bandPhasors.length === 0) {
      result.push(MIN_LEVEL);
    } else {
      result.push(sumPhasorsCoherent(bandPhasors));
    }
  }
  
  return result as Spectrum9;
}

/**
 * Create spectral phasor from level spectrum with explicit phase per band
 * 
 * @param spectrum - 9-band levels in dB
 * @param phases - 9-band phases in radians
 */
export function createSpectralPhasorWithPhases(
  spectrum: Spectrum9 | number[],
  phases: number[]
): SpectralPhasor {
  const phasors: Phasor[] = [];
  
  for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
    phasors.push(phasorFromLevel(spectrum[i], phases[i] ?? 0));
  }
  
  return phasors;
}

// ============================================================================
// Path Phase Utilities
// ============================================================================

/**
 * Calculate phase shift from path length difference
 * 
 * @param pathDifference - Delta R in meters (e.g., reflected - direct)
 * @param frequency - Frequency in Hz
 * @param speedOfSound - Speed of sound in m/s
 * @returns Phase shift in radians
 */
export function phaseFromPathDifference(
  pathDifference: number,
  frequency: number,
  speedOfSound = 343
): number {
  const k = (2 * Math.PI * frequency) / speedOfSound;
  return -k * pathDifference;
}

/**
 * Calculate wavelength for a frequency
 */
export function wavelength(frequency: number, speedOfSound = 343): number {
  return speedOfSound / frequency;
}

/**
 * Phase change on reflection from a surface
 * 
 * Hard surfaces: 0 (in-phase reflection)
 * Soft surfaces: approximately pi (out-of-phase, cancellation)
 * 
 * Real surfaces are frequency-dependent; this is simplified.
 */
export function reflectionPhaseChange(
  surfaceType: 'hard' | 'soft' | 'mixed',
  _frequency?: number
): number {
  // Simplified model - real impedance-based calculation is in ground.ts
  // _frequency reserved for future impedance-based model
  switch (surfaceType) {
    case 'hard':
      return 0;
    case 'soft':
      // Soft ground causes near-180° phase shift at grazing angles
      return Math.PI;
    case 'mixed':
      return Math.PI / 2; // Approximation
  }
}

/**
 * Calculate Fresnel zone radius for path clearance checks
 * 
 * The first Fresnel zone radius at a point along a path indicates
 * the region that must be clear for unobstructed propagation.
 * 
 * @param d1 - Distance from source to point (m)
 * @param d2 - Distance from point to receiver (m)
 * @param frequency - Frequency in Hz
 * @param speedOfSound - Speed of sound in m/s
 * @returns First Fresnel zone radius in meters
 */
export function fresnelRadius(
  d1: number,
  d2: number,
  frequency: number,
  speedOfSound = 343
): number {
  const lambda = speedOfSound / frequency;
  const dTotal = d1 + d2;
  if (dTotal <= 0) return 0;
  return Math.sqrt((lambda * d1 * d2) / dTotal);
}
