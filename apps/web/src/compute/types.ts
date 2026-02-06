/**
 * Compute Types
 *
 * Type definitions for computation orchestration.
 */

/**
 * Bounds for a computation grid
 */
export type GridBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/**
 * Grid configuration for noise map computation
 */
export type GridConfig = {
  enabled: boolean;
  bounds: GridBounds;
  resolution: number;
  elevation: number;
  /** Target frequency band (undefined = weighted overall) */
  targetBand?: number;
  /** Frequency weighting for overall level */
  weighting?: 'A' | 'C' | 'Z';
};

/**
 * Compute progress state
 */
export type ComputeProgress = {
  /** Whether a computation is in progress */
  isComputing: boolean;
  /** Number of pending sub-computations */
  pendingCount: number;
  /** Total sub-computations started */
  totalCount: number;
  /** Current computation token for invalidation */
  token: number;
};

/**
 * Map computation state
 */
export type MapComputeState = {
  /** Whether map computation is in progress */
  isComputing: boolean;
  /** Current map token */
  token: number;
  /** Queued resolution for next computation */
  queuedResolution: number | null;
};

/**
 * Range for map value coloring
 */
export type MapRange = {
  min: number;
  max: number;
};

/**
 * Noise map data with texture
 */
export type NoiseMapData = {
  bounds: GridBounds;
  resolution: number;
  elevation: number;
  cols: number;
  rows: number;
  values: number[];
  min: number;
  max: number;
  texture: HTMLCanvasElement;
};

/**
 * Options for noise map computation
 */
export type NoiseMapOptions = {
  /** Resolution in pixels (converted to meters internally) */
  resolutionPx?: number;
  /** Maximum number of grid points */
  maxPoints?: number;
  /** Silent mode (no UI updates/toasts) */
  silent?: boolean;
  /** Request ID for tracking */
  requestId?: string;
};

/**
 * Compute preference (backend selection)
 */
export type ComputePreference = 'auto' | 'wasm' | 'cpu';

/**
 * Result of a grid computation
 */
export type GridComputeResult = {
  bounds: GridBounds;
  resolution: number;
  elevation: number;
  values: number[];
};
