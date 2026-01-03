/**
 * Shared utility functions
 */

import {
  EPSILON,
  MIN_LEVEL,
  MAX_LEVEL,
  OCTAVE_BANDS,
  OCTAVE_BAND_COUNT,
  A_WEIGHTING_ARRAY,
  C_WEIGHTING_ARRAY,
  Z_WEIGHTING_ARRAY,
  type FrequencyWeighting,
} from '../constants/index.js';

// ============================================================================
// Acoustic Math Utilities
// ============================================================================

/**
 * Add two decibel values (energetic sum)
 */
export function addDecibels(dB1: number, dB2: number): number {
  if (dB1 < MIN_LEVEL && dB2 < MIN_LEVEL) return MIN_LEVEL;
  if (dB1 < MIN_LEVEL) return dB2;
  if (dB2 < MIN_LEVEL) return dB1;

  return 10 * Math.log10(Math.pow(10, dB1 / 10) + Math.pow(10, dB2 / 10));
}

/**
 * Sum multiple decibel values (energetic sum)
 */
export function sumDecibels(levels: number[]): number {
  const validLevels = levels.filter((l) => l > MIN_LEVEL);
  if (validLevels.length === 0) return MIN_LEVEL;
  if (validLevels.length === 1) return validLevels[0];

  const energySum = validLevels.reduce((sum, dB) => sum + Math.pow(10, dB / 10), 0);
  return 10 * Math.log10(energySum);
}

/**
 * Subtract decibels (background correction)
 */
export function subtractDecibels(total: number, background: number): number {
  if (total <= background) return MIN_LEVEL;
  const diff = Math.pow(10, total / 10) - Math.pow(10, background / 10);
  if (diff <= 0) return MIN_LEVEL;
  return 10 * Math.log10(diff);
}

/**
 * Convert sound power level to sound pressure level at a distance (free field)
 */
export function swlToSpl(swl: number, distanceM: number): number {
  if (distanceM <= EPSILON) return MAX_LEVEL;
  // Lp = Lw - 20*log10(r) - 11 (for spherical spreading)
  return swl - 20 * Math.log10(distanceM) - 11;
}

/**
 * Apply A-weighting correction to a level at a given frequency
 */
export function applyAWeighting(level: number, frequencyHz: number): number {
  // Simplified A-weighting formula
  const f2 = frequencyHz * frequencyHz;
  const f4 = f2 * f2;

  const rA =
    (12194 * 12194 * f4) /
    ((f2 + 20.6 * 20.6) *
      Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) *
      (f2 + 12194 * 12194));

  const aWeight = 20 * Math.log10(rA) + 2.0;
  return level + aWeight;
}

/**
 * Apply C-weighting correction to a level at a given frequency
 */
export function applyCWeighting(level: number, frequencyHz: number): number {
  const f2 = frequencyHz * frequencyHz;

  const rC = (12194 * 12194 * f2) / ((f2 + 20.6 * 20.6) * (f2 + 12194 * 12194));

  const cWeight = 20 * Math.log10(rC) + 0.06;
  return level + cWeight;
}

// ============================================================================
// Numeric Utilities
// ============================================================================

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Check if two numbers are approximately equal
 */
export function approxEqual(a: number, b: number, epsilon = EPSILON): boolean {
  return Math.abs(a - b) < epsilon;
}

/**
 * Round to specified decimal places
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a unique ID
 */
export function generateId(prefix = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

/**
 * Generate a deterministic hash for caching
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Create a scene hash for caching compute results
 */
export function createSceneHash(
  scene: unknown,
  config: unknown,
  kind: string,
  payload: unknown
): string {
  const normalized = JSON.stringify({ scene, config, kind, payload }, Object.keys, 2);
  return hashString(normalized);
}

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Chunk an array into smaller arrays of specified size
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Create a range of numbers
 */
export function range(start: number, end: number, step = 1): number[] {
  const result: number[] = [];
  for (let i = start; i < end; i += step) {
    result.push(i);
  }
  return result;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Check if a value is a valid finite number
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Check if a string is a valid non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// ============================================================================
// Spectral Utilities
// ============================================================================

/** 9-band spectrum type (indices 0-8 correspond to 63Hz-16kHz) */
export type Spectrum9 = [number, number, number, number, number, number, number, number, number];

/**
 * Create a default flat spectrum at a given level
 */
export function createFlatSpectrum(level: number): Spectrum9 {
  return [level, level, level, level, level, level, level, level, level];
}

/**
 * Create an empty spectrum (all MIN_LEVEL)
 */
export function createEmptySpectrum(): Spectrum9 {
  return [MIN_LEVEL, MIN_LEVEL, MIN_LEVEL, MIN_LEVEL, MIN_LEVEL, MIN_LEVEL, MIN_LEVEL, MIN_LEVEL, MIN_LEVEL];
}

/**
 * Get weighting offsets array for a given weighting type
 */
function getWeightingOffsets(weighting: FrequencyWeighting): readonly number[] {
  switch (weighting) {
    case 'A': return A_WEIGHTING_ARRAY;
    case 'C': return C_WEIGHTING_ARRAY;
    case 'Z': return Z_WEIGHTING_ARRAY;
  }
}

/**
 * Calculate overall (summed) dB level from a 9-band spectrum with optional weighting
 * 
 * @param spectrum - 9-element array of dB levels [63Hz, 125Hz, ... 16kHz]
 * @param weighting - Frequency weighting to apply: 'A', 'C', or 'Z' (linear)
 * @returns Overall weighted level in dB
 * 
 * @example
 * const spectrum: Spectrum9 = [85, 88, 82, 80, 78, 75, 72, 68, 60];
 * const overallA = calculateOverallLevel(spectrum, 'A'); // dBA
 * const overallZ = calculateOverallLevel(spectrum, 'Z'); // dBZ (linear)
 */
export function calculateOverallLevel(spectrum: Spectrum9 | number[], weighting: FrequencyWeighting = 'Z'): number {
  if (spectrum.length !== OCTAVE_BAND_COUNT) {
    throw new Error(`Spectrum must have ${OCTAVE_BAND_COUNT} bands, got ${spectrum.length}`);
  }

  const offsets = getWeightingOffsets(weighting);
  let sumPower = 0;

  for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
    const level = spectrum[i];
    if (level <= MIN_LEVEL) continue;
    
    const weightedLevel = level + offsets[i];
    sumPower += Math.pow(10, weightedLevel / 10);
  }

  if (sumPower <= 0) return MIN_LEVEL;
  return 10 * Math.log10(sumPower);
}

/**
 * Apply weighting to a spectrum, returning a new weighted spectrum
 */
export function applyWeightingToSpectrum(spectrum: Spectrum9 | number[], weighting: FrequencyWeighting): Spectrum9 {
  if (spectrum.length !== OCTAVE_BAND_COUNT) {
    throw new Error(`Spectrum must have ${OCTAVE_BAND_COUNT} bands, got ${spectrum.length}`);
  }

  const offsets = getWeightingOffsets(weighting);
  const result: number[] = [];

  for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
    result.push(spectrum[i] + offsets[i]);
  }

  return result as Spectrum9;
}

/**
 * Sum two spectra energetically (per-band power sum)
 */
export function sumSpectra(spectrum1: Spectrum9 | number[], spectrum2: Spectrum9 | number[]): Spectrum9 {
  const result: number[] = [];

  for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
    result.push(addDecibels(spectrum1[i], spectrum2[i]));
  }

  return result as Spectrum9;
}

/**
 * Sum multiple spectra energetically
 */
export function sumMultipleSpectra(spectra: (Spectrum9 | number[])[]): Spectrum9 {
  if (spectra.length === 0) return createEmptySpectrum();
  if (spectra.length === 1) return [...spectra[0]] as Spectrum9;

  const result = createEmptySpectrum();

  for (let bandIdx = 0; bandIdx < OCTAVE_BAND_COUNT; bandIdx++) {
    const bandLevels = spectra.map(s => s[bandIdx]).filter(l => l > MIN_LEVEL);
    result[bandIdx] = bandLevels.length > 0 ? sumDecibels(bandLevels) : MIN_LEVEL;
  }

  return result;
}

/**
 * Apply a gain offset (master volume fader) to a spectrum
 */
export function applyGainToSpectrum(spectrum: Spectrum9 | number[], gain: number): Spectrum9 {
  const result: number[] = [];

  for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
    const level = spectrum[i];
    result.push(level <= MIN_LEVEL ? MIN_LEVEL : level + gain);
  }

  return result as Spectrum9;
}

/**
 * Subtract a scalar attenuation from all bands of a spectrum
 */
export function attenuateSpectrum(spectrum: Spectrum9 | number[], attenuation: number): Spectrum9 {
  return applyGainToSpectrum(spectrum, -attenuation);
}

/**
 * Apply per-band attenuation to a spectrum
 */
export function attenuateSpectrumBanded(
  spectrum: Spectrum9 | number[],
  attenuations: Spectrum9 | number[]
): Spectrum9 {
  const result: number[] = [];

  for (let i = 0; i < OCTAVE_BAND_COUNT; i++) {
    const level = spectrum[i];
    result.push(level <= MIN_LEVEL ? MIN_LEVEL : level - attenuations[i]);
  }

  return result as Spectrum9;
}

/**
 * Get the level at a specific band index
 */
export function getBandLevel(spectrum: Spectrum9 | number[], bandIndex: number): number {
  if (bandIndex < 0 || bandIndex >= OCTAVE_BAND_COUNT) {
    throw new Error(`Band index must be 0-${OCTAVE_BAND_COUNT - 1}, got ${bandIndex}`);
  }
  return spectrum[bandIndex];
}

/**
 * Get the level at a specific frequency
 */
export function getLevelAtFrequency(spectrum: Spectrum9 | number[], frequency: number): number {
  const bandIndex = OCTAVE_BANDS.indexOf(frequency as typeof OCTAVE_BANDS[number]);
  if (bandIndex === -1) {
    throw new Error(`Invalid octave band frequency: ${frequency}Hz. Valid bands: ${OCTAVE_BANDS.join(', ')}`);
  }
  return spectrum[bandIndex];
}

/**
 * Get band index from frequency
 */
export function getBandIndex(frequency: number): number {
  const index = OCTAVE_BANDS.indexOf(frequency as typeof OCTAVE_BANDS[number]);
  if (index === -1) {
    throw new Error(`Invalid octave band frequency: ${frequency}Hz`);
  }
  return index;
}

/**
 * Convert an overall dB level to a flat spectrum (same level in all bands)
 * This is a simple approximation - real spectra vary by frequency
 */
export function overallToFlatSpectrum(overallLevel: number): Spectrum9 {
  // For a flat spectrum, overall = band + 10*log10(N) where N is number of bands
  // So band = overall - 10*log10(9) ≈ overall - 9.54
  const bandLevel = overallLevel - 10 * Math.log10(OCTAVE_BAND_COUNT);
  return createFlatSpectrum(bandLevel);
}
