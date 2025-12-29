/**
 * Shared utility functions
 */

import { EPSILON, MIN_LEVEL, MAX_LEVEL } from '../constants/index.js';

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
