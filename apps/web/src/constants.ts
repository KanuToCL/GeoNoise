/**
 * Application constants for GeoNoise
 * Centralized configuration values and magic numbers
 */

import type { MapRange } from './types/index.js';

// =============================================================================
// FEATURE FLAGS
// =============================================================================

/**
 * Enable ray visualization in probe inspector.
 * Set to false to hide the feature from production until the bug is fixed
 * where only one first-order wall reflection is shown instead of all.
 *
 * See: docs/ROADMAP.md - "Ray Visualization Only Shows One First-Order Wall Reflection"
 */
export const ENABLE_RAY_VISUALIZATION = false;

/**
 * Enable Mapbox map overlay feature.
 * Set to false to hide all map-related UI and functionality from users.
 * This allows merging the feature branch while keeping the map disabled.
 */
export const ENABLE_MAPBOX = true;

/**
 * Enable map debug info overlays (scale info, center coordinates,
 * scale comparison panel). Disable for production.
 */
export const ENABLE_MAP_DEBUG = false;

// =============================================================================
// NOISE MAP CONFIGURATION
// =============================================================================

/** Default min/max dB range for noise map color mapping */
export const DEFAULT_MAP_RANGE: MapRange = { min: 30, max: 85 };

/** Finer default step for overall level display */
export const DEFAULT_MAP_BAND_STEP = 3;

/** Coarser step for per-frequency band display */
export const DEFAULT_MAP_BAND_STEP_PERBAND = 10;

/** Maximum number of labels in the legend */
export const MAX_MAP_LEGEND_LABELS = 7;

// =============================================================================
// NOISE MAP RESOLUTION STRATEGY
// =============================================================================
// The noise map uses adaptive resolution based on interaction state:
//
// | Scenario           | Point Cap | Pixel Step | Purpose                      |
// |--------------------|-----------|------------|------------------------------|
// | Initial load       | 75,000    | RES_HIGH=2 | Good first impression        |
// | During drag        | 35,000    | RES_LOW=8  | Smooth interaction (coarse)  |
// | Static after drag  | 50,000    | RES_HIGH=2 | Good quality                 |
// | Refine button      | 75,000    | RES_HIGH=2 | Maximum detail               |
//
// Lower pixel step = finer grid (more points, slower)
// Higher pixel step = coarser grid (fewer points, faster)
// =============================================================================

/** Fine quality: 2px per grid cell */
export const RES_HIGH = 2;

/** Coarse preview: 8px per grid cell (fast drag updates) */
export const RES_LOW = 8;

/** Maximum detail for refine button and initial load */
export const REFINE_POINTS = 75000;

/** Good quality for static after drag */
export const STATIC_POINTS = 50000;

/** Coarse preview during drag (smooth interaction) */
export const DRAG_POINTS = 25000;

// =============================================================================
// TIMING & PERFORMANCE
// =============================================================================

/** Cap drag updates to ~33 FPS */
export const DRAG_FRAME_MS = 30;

/** Cap probe updates to ~10 FPS while dragging */
export const PROBE_UPDATE_MS = 100;

// =============================================================================
// PROBE DEFAULTS
// =============================================================================

/** Default height (z) for probes in meters */
export const PROBE_DEFAULT_Z = 1.7;

// =============================================================================
// UI CONFIGURATION
// =============================================================================

/** Maximum z-index for inspector panels (dock is at 99999) */
export const INSPECTOR_MAX_ZINDEX = 9000;

/** LocalStorage key for canvas help dismissal */
export const CANVAS_HELP_KEY = 'geonoise.canvasHelpDismissed';
