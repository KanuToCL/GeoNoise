/**
 * Color utility functions for GeoNoise
 * Handles color ramps and conversions for visualization
 */

import { lerp } from './geometry.js';

export type RGB = { r: number; g: number; b: number };

export type ColorStop = {
  stop: number;
  color: RGB;
};

/**
 * Default sample color ramp for noise map visualization
 * Cool blue → teal → warm yellow → red-orange
 */
export const sampleRamp: ColorStop[] = [
  { stop: 0, color: { r: 32, g: 86, b: 140 } },
  { stop: 0.45, color: { r: 42, g: 157, b: 143 } },
  { stop: 0.75, color: { r: 233, g: 196, b: 106 } },
  { stop: 1, color: { r: 231, g: 111, b: 81 } },
];

/**
 * Get interpolated color from the sample ramp for a given ratio [0,1]
 */
export function getSampleColor(ratio: number): RGB {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  for (let i = 0; i < sampleRamp.length - 1; i += 1) {
    const current = sampleRamp[i];
    const next = sampleRamp[i + 1];
    if (clamped >= current.stop && clamped <= next.stop) {
      const span = next.stop - current.stop || 1;
      const t = (clamped - current.stop) / span;
      return {
        r: Math.round(lerp(current.color.r, next.color.r, t)),
        g: Math.round(lerp(current.color.g, next.color.g, t)),
        b: Math.round(lerp(current.color.b, next.color.b, t)),
      };
    }
  }
  return sampleRamp[sampleRamp.length - 1].color;
}

/**
 * Convert RGB color object to CSS rgb() string
 */
export function colorToCss(color: RGB): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

/**
 * Build CSS gradient stops string for smooth legend
 */
export function buildSmoothLegendStops(): string {
  return sampleRamp
    .map((stop) => `${colorToCss(stop.color)} ${Math.round(stop.stop * 100)}%`)
    .join(', ');
}
