/**
 * Audio and physics utility functions for GeoNoise
 * Pure functions for acoustic calculations
 */

import { MIN_LEVEL } from '@geonoise/shared';

/**
 * Calculate speed of sound from temperature
 * Uses simplified formula: c = 331.3 + 0.606 * T
 * @param temperatureC Temperature in Celsius
 * @returns Speed of sound in m/s
 */
export function calculateSpeedOfSound(temperatureC: number): number {
  return 331.3 + 0.606 * temperatureC;
}

/**
 * Round distance to a nice value for scale display
 * @param value Distance value to round
 * @returns Nice rounded distance value
 */
export function niceDistance(value: number): number {
  const options = [5, 10, 20, 50, 100, 200, 500, 1000];
  let best = options[0];
  for (const option of options) {
    if (value >= option) best = option;
  }
  return best;
}

/**
 * Convert decibel level to energy (linear power)
 * @param level Sound level in dB
 * @returns Energy value (linear)
 */
export function dbToEnergy(level: number): number {
  if (level <= MIN_LEVEL) return 0;
  return Math.pow(10, level / 10);
}

/**
 * Convert energy (linear power) to decibel level
 * @param energy Energy value (linear)
 * @returns Sound level in dB
 */
export function energyToDb(energy: number): number {
  if (energy <= 0) return MIN_LEVEL;
  return 10 * Math.log10(energy);
}
