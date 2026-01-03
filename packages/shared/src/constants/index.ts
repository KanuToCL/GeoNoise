/**
 * Physical and application constants
 */

// ============================================================================
// Physical Constants
// ============================================================================

/** Speed of sound in air at 20°C (m/s) */
export const SPEED_OF_SOUND_20C = 343.0;

/** Reference pressure for sound (Pa) - threshold of hearing */
export const REFERENCE_PRESSURE = 2e-5;

/** Reference power for sound (W) */
export const REFERENCE_POWER = 1e-12;

/** Standard atmospheric pressure (kPa) */
export const STANDARD_PRESSURE = 101.325;

/** Standard temperature (°C) */
export const STANDARD_TEMPERATURE = 20.0;

/** Standard relative humidity (%) */
export const STANDARD_HUMIDITY = 50.0;

// ============================================================================
// Calculation Constants
// ============================================================================

/** Minimum distance for calculations to avoid singularities (m) */
export const MIN_DISTANCE = 0.1;

/** Maximum calculation distance (m) */
export const MAX_DISTANCE = 10000;

/** Minimum sound level to consider (dB) */
export const MIN_LEVEL = -100;

/** Maximum sound level to consider (dB) */
export const MAX_LEVEL = 200;

/** Small epsilon for floating point comparisons */
export const EPSILON = 1e-10;

/** Geometry epsilon for snapping and comparisons (m) */
export const GEOMETRY_EPSILON = 0.001;

// ============================================================================
// Frequency Bands
// ============================================================================

/** Standard octave band center frequencies (Hz) - 9 bands for spectral engine */
export const OCTAVE_BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

/** Number of octave bands */
export const OCTAVE_BAND_COUNT = 9;

/** Octave band type */
export type OctaveBand = (typeof OCTAVE_BANDS)[number];

/** Standard 1/3 octave band center frequencies (Hz) */
export const THIRD_OCTAVE_BANDS = [
  50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150,
  4000, 5000, 6300, 8000, 10000, 12500, 16000,
] as const;

/** Weighting type */
export type FrequencyWeighting = 'A' | 'C' | 'Z';

/** A-weighting corrections for octave bands (dB) - indexed by band [63, 125, ... 16000] */
export const A_WEIGHTING_OCTAVE: Record<number, number> = {
  63: -26.2,
  125: -16.1,
  250: -8.6,
  500: -3.2,
  1000: 0.0,
  2000: 1.2,
  4000: 1.0,
  8000: -1.1,
  16000: -6.6,
};

/** A-weighting as array matching OCTAVE_BANDS order */
export const A_WEIGHTING_ARRAY = [-26.2, -16.1, -8.6, -3.2, 0, 1.2, 1.0, -1.1, -6.6] as const;

/** C-weighting corrections for octave bands (dB) */
export const C_WEIGHTING_OCTAVE: Record<number, number> = {
  63: -0.8,
  125: -0.2,
  250: 0.0,
  500: 0.0,
  1000: 0.0,
  2000: -0.2,
  4000: -0.8,
  8000: -3.0,
  16000: -8.5,
};

/** C-weighting as array matching OCTAVE_BANDS order */
export const C_WEIGHTING_ARRAY = [-0.8, -0.2, 0, 0, 0, -0.2, -0.8, -3.0, -8.5] as const;

/** Z-weighting (linear/unweighted) corrections for octave bands (dB) */
export const Z_WEIGHTING_OCTAVE: Record<number, number> = {
  63: 0,
  125: 0,
  250: 0,
  500: 0,
  1000: 0,
  2000: 0,
  4000: 0,
  8000: 0,
  16000: 0,
};

/** Z-weighting as array matching OCTAVE_BANDS order */
export const Z_WEIGHTING_ARRAY = [0, 0, 0, 0, 0, 0, 0, 0, 0] as const;

/** Get weighting array by type */
export function getWeightingArray(weighting: FrequencyWeighting): readonly number[] {
  switch (weighting) {
    case 'A': return A_WEIGHTING_ARRAY;
    case 'C': return C_WEIGHTING_ARRAY;
    case 'Z': return Z_WEIGHTING_ARRAY;
  }
}

/** Get weighting record by type */
export function getWeightingRecord(weighting: FrequencyWeighting): Record<number, number> {
  switch (weighting) {
    case 'A': return A_WEIGHTING_OCTAVE;
    case 'C': return C_WEIGHTING_OCTAVE;
    case 'Z': return Z_WEIGHTING_OCTAVE;
  }
}

// ============================================================================
// Grid & Resolution Constants
// ============================================================================

/** Default grid resolution for noise maps (m) */
export const DEFAULT_GRID_RESOLUTION = 10;

/** Minimum grid resolution (m) */
export const MIN_GRID_RESOLUTION = 1;

/** Maximum grid resolution (m) */
export const MAX_GRID_RESOLUTION = 100;

/** Maximum grid points for interactive mode */
export const MAX_INTERACTIVE_GRID_POINTS = 10000;

/** Maximum grid points for final calculation */
export const MAX_FINAL_GRID_POINTS = 1000000;

// ============================================================================
// Backend Constants
// ============================================================================

/** Minimum workload size for GPU to be beneficial */
export const GPU_MIN_WORKLOAD = 1000;

/** Default batch size for GPU computations */
export const GPU_BATCH_SIZE = 65536;

/** Worker pool size for CPU backend */
export const CPU_WORKER_POOL_SIZE = 4;

// ============================================================================
// Schema Version
// ============================================================================

/** Current scene schema version */
export const SCENE_SCHEMA_VERSION = 1;

// ============================================================================
// Mode Defaults
// ============================================================================

/** Default settings for festival_fast mode */
export const FESTIVAL_FAST_DEFAULTS = {
  groundReflection: false,
  atmosphericAbsorption: 'simple',
  maxReflections: 0,
  gridResolution: 20,
} as const;

/** Default settings for standards_strict mode */
export const STANDARDS_STRICT_DEFAULTS = {
  groundReflection: true,
  atmosphericAbsorption: 'iso9613',
  maxReflections: 1,
  gridResolution: 5,
} as const;
