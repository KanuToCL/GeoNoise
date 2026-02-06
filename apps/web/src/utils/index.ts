/**
 * Utility exports for GeoNoise
 * Re-exports all utility functions from a single entry point
 */

export {
  type Point,
  distance,
  distanceToSegment,
  lerp,
  cross2D,
  segmentsIntersect,
  isValidQuadrilateral,
  ensureCCW,
  pointInPolygon,
  getPolygonCentroid,
} from './geometry.js';

export {
  type RGB,
  type ColorStop,
  sampleRamp,
  getSampleColor,
  colorToCss,
  buildSmoothLegendStops,
} from './colors.js';

export { throttle, type ThrottledFn } from './throttle.js';

export {
  calculateSpeedOfSound,
  niceDistance,
  dbToEnergy,
  energyToDb,
} from './audio.js';

export {
  createId,
  SOURCE_PREFIX,
  RECEIVER_PREFIX,
  PROBE_PREFIX,
  PANEL_PREFIX,
  BUILDING_PREFIX,
  BARRIER_PREFIX,
} from './id.js';
