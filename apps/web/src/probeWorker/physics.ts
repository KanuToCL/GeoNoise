/**
 * Acoustic Physics for Probe Worker
 *
 * Sound propagation physics including spreading loss, atmospheric absorption,
 * and diffraction calculations based on ISO 9613 standards.
 */

import type { AtmosphericAbsorptionModel } from './types';

// ============================================================================
// Constants
// ============================================================================

export const OCTAVE_BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const OCTAVE_BAND_COUNT = 9;
export const MIN_LEVEL = -100;
export const SPEED_OF_SOUND = 343;
export const P_REF = 2e-5; // Pa - reference pressure

// ============================================================================
// Pressure/dB Conversion
// ============================================================================

export function dBToPressure(dB: number): number {
  if (!Number.isFinite(dB) || dB < -200) return 1e-12;
  return P_REF * Math.pow(10, dB / 20);
}

export function pressureTodB(pressure: number): number {
  if (!Number.isFinite(pressure) || pressure <= 0) return -200;
  return 20 * Math.log10(pressure / P_REF);
}

// ============================================================================
// Spreading Loss
// ============================================================================

export function spreadingLoss(distance: number): number {
  const d = Math.max(distance, 0.1);
  return 20 * Math.log10(d) + 11;
}

// ============================================================================
// Atmospheric Absorption
// ============================================================================

export function atmosphericAbsorptionCoeff(
  frequency: number,
  temp: number,
  humidity: number,
  _pressure: number,
  model: AtmosphericAbsorptionModel
): number {
  if (model === 'none') return 0;

  if (model === 'iso9613') {
    return atmosphericAbsorptionISO9613(frequency, temp, humidity, _pressure);
  }

  const tempFactor = 1 + 0.01 * (temp - 20);
  const humidityFactor = 1 + 0.005 * (50 - humidity);

  let baseAlpha: number;

  if (frequency <= 63) baseAlpha = 0.0001;
  else if (frequency <= 125) baseAlpha = 0.0003;
  else if (frequency <= 250) baseAlpha = 0.001;
  else if (frequency <= 500) baseAlpha = 0.002;
  else if (frequency <= 1000) baseAlpha = 0.004;
  else if (frequency <= 2000) baseAlpha = 0.008;
  else if (frequency <= 4000) baseAlpha = 0.02;
  else if (frequency <= 8000) baseAlpha = 0.06;
  else baseAlpha = 0.2;

  return Math.max(baseAlpha * tempFactor * humidityFactor, 0);
}

export function atmosphericAbsorptionISO9613(
  frequencyHz: number,
  temperatureC: number,
  relativeHumidity: number,
  pressureKPa: number
): number {
  const T = temperatureC + 273.15;
  const T0 = 293.15;
  const T01 = 273.16;
  const ps0 = 101.325;
  const ps = pressureKPa;
  const f = frequencyHz;

  const C = -6.8346 * Math.pow(T01 / T, 1.261) + 4.6151;
  const psat = ps0 * Math.pow(10, C);
  const h = (relativeHumidity * psat) / ps;

  const frO = (ps / ps0) * (24 + 4.04e4 * h * ((0.02 + h) / (0.391 + h)));
  const frN = (ps / ps0) * Math.pow(T / T0, -0.5) * (9 + 280 * h * Math.exp(-4.17 * (Math.pow(T / T0, -1 / 3) - 1)));

  const alpha = 8.686 * f * f * (1.84e-11 * Math.pow(ps / ps0, -1) * Math.pow(T / T0, 0.5) +
    Math.pow(T / T0, -2.5) * (0.01275 * Math.exp(-2239.1 / T) * (frO / (frO * frO + f * f)) +
      0.1068 * Math.exp(-3352 / T) * (frN / (frN * frN + f * f))));

  return alpha;
}

// ============================================================================
// Diffraction Models
// ============================================================================

export function maekawaDiffraction(pathDiff: number, frequency: number, c: number): number {
  const lambda = c / frequency;
  const N = (2 * pathDiff) / lambda;
  if (N < -0.1) return 0;
  const atten = 10 * Math.log10(3 + 20 * N);
  return Math.min(Math.max(atten, 0), 25);
}

export function singleEdgeDiffraction(pathDiff: number, frequency: number, c: number): number {
  const lambda = c / frequency;
  const N = (2 * pathDiff) / lambda;
  if (N < -0.1) return 0;
  const atten = 10 * Math.log10(3 + 20 * N);
  return Math.min(Math.max(atten, 0), 20);
}

export function doubleEdgeDiffraction(pathDiff: number, frequency: number, c: number): number {
  const lambda = c / frequency;
  const N = (2 * pathDiff) / lambda;
  if (N < -0.1) return 0;
  const atten = 10 * Math.log10(3 + 40 * N);
  return Math.min(Math.max(atten, 0), 25);
}

// ============================================================================
// Spectrum Operations
// ============================================================================

export function applyGainToSpectrum(spectrum: number[], gain: number): number[] {
  return spectrum.map((level) => level <= MIN_LEVEL ? MIN_LEVEL : level + gain);
}

export function sumMultipleSpectra(spectra: number[][]): number[] {
  if (spectra.length === 0) return new Array(OCTAVE_BAND_COUNT).fill(MIN_LEVEL);
  if (spectra.length === 1) return [...spectra[0]];

  const result: number[] = [];
  for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
    const levels = spectra.map((s) => s[i]).filter((l) => l > MIN_LEVEL);
    if (levels.length === 0) {
      result.push(MIN_LEVEL);
    } else {
      const energy = levels.reduce((sum, l) => sum + Math.pow(10, l / 10), 0);
      result.push(10 * Math.log10(energy));
    }
  }
  return result;
}
