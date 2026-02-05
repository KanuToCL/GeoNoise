/**
 * Audio and physics utility functions for GeoNoise
 * Pure functions for acoustic calculations
 */

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
