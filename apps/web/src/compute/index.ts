/**
 * Compute Module Barrel Exports
 *
 * Re-exports all computation functionality from a single entry point.
 */

// Types
export {
  type GridBounds,
  type GridConfig,
  type ComputeProgress,
  type MapComputeState,
  type MapRange,
  type NoiseMapData,
  type NoiseMapOptions,
  type ComputePreference,
  type GridComputeResult,
} from './types.js';

// Noise Grid
export {
  MIN_LEVEL,
  DEFAULT_MAP_RANGE,
  DEFAULT_MAP_BAND_STEP,
  DEFAULT_MAP_BAND_STEP_PERBAND,
  MAX_MAP_LEGEND_LABELS,
  RES_HIGH,
  RES_LOW,
  DRAG_POINTS,
  STATIC_POINTS,
  REFINE_POINTS,
  mergeBounds,
  computeMapRange,
  getGridCounts,
  buildNoiseMapTexture,
  buildGridConfig,
  buildBandedLegendLabels,
  snapToContourBand,
  createNoiseMapData,
} from './noiseGrid.js';

// Progress Tracking
export {
  createComputeProgress,
  createMapComputeState,
  startCompute,
  finishSubCompute,
  cancelCompute,
  isStaleToken,
  getProgressPercent,
  startMapCompute,
  finishMapCompute,
  invalidateMapCompute,
  queueMapResolution,
} from './progress.js';

// Worker Pool
export {
  type WorkerState,
  type MessageHandler,
  type ErrorHandler,
  type ManagedWorker,
  type WorkerOptions,
  type ProbeRequest,
  type ProbeResult,
  createWorker,
  createProbeWorker,
  createPendingTracker,
  calculateProbeStub,
} from './workerPool.js';
