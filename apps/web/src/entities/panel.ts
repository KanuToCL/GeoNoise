/**
 * Panel entity definition and factory functions
 */

import type { Panel, Point } from './types.js';
import { createId, PANEL_PREFIX } from '../utils/id.js';

// =============================================================================
// DEFAULTS
// =============================================================================

/** Default panel size in meters */
export const PANEL_DEFAULT_SIZE = 30;

/** Default panel elevation in meters */
export const PANEL_DEFAULT_ELEVATION = 1.5;

/** Default sampling resolution in meters */
export const PANEL_DEFAULT_RESOLUTION = 10;

/** Default maximum sample points */
export const PANEL_DEFAULT_POINT_CAP = 300;

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

export interface CreatePanelOptions {
  /** Panel ID - auto-generated if not provided */
  id?: string;
  /** Panel name */
  name?: string;
  /** Panel corner points (if not provided, creates a square centered at x, y) */
  points?: Point[];
  /** Center X position (used if points not provided) */
  x?: number;
  /** Center Y position (used if points not provided) */
  y?: number;
  /** Panel size (used if points not provided, default: 30) */
  size?: number;
  /** Panel elevation in meters (default: 1.5) */
  elevation?: number;
  /** Sampling resolution in meters (default: 10) */
  resolution?: number;
  /** Maximum sample points (default: 300) */
  pointCap?: number;
}

/**
 * Create a new Panel entity
 *
 * If points are not provided, creates a square panel centered at (x, y).
 *
 * @param seq - Sequence number for ID generation (required if id not provided)
 * @param options - Panel configuration options
 * @returns A new Panel object
 */
export function createPanel(seq: number, options: CreatePanelOptions): Panel {
  const id = options.id ?? createId(PANEL_PREFIX, seq);
  const size = options.size ?? PANEL_DEFAULT_SIZE;
  const half = size / 2;

  let points: Point[];
  if (options.points) {
    points = options.points;
  } else {
    const cx = options.x ?? 0;
    const cy = options.y ?? 0;
    points = [
      { x: cx - half, y: cy - half },
      { x: cx + half, y: cy - half },
      { x: cx + half, y: cy + half },
      { x: cx - half, y: cy + half },
    ];
  }

  return {
    id,
    name: options.name,
    points,
    elevation: options.elevation ?? PANEL_DEFAULT_ELEVATION,
    sampling: {
      resolution: options.resolution ?? PANEL_DEFAULT_RESOLUTION,
      pointCap: options.pointCap ?? PANEL_DEFAULT_POINT_CAP,
    },
  };
}

/**
 * Duplicate a panel with a new ID
 *
 * @param panel - The panel to duplicate
 * @param seq - Sequence number for new ID
 * @returns A new Panel object with copied properties
 */
export function duplicatePanel(panel: Panel, seq: number): Panel {
  const newId = createId(PANEL_PREFIX, seq);
  return {
    ...panel,
    id: newId,
    points: panel.points.map((pt) => ({ ...pt })),
    sampling: { ...panel.sampling },
  };
}

/**
 * Get the centroid (center point) of a panel
 *
 * @param panel - The panel to get center of
 * @returns The center point
 */
export function getPanelCenter(panel: Panel): Point {
  const n = panel.points.length;
  if (n === 0) return { x: 0, y: 0 };

  let cx = 0;
  let cy = 0;
  for (const pt of panel.points) {
    cx += pt.x;
    cy += pt.y;
  }
  return { x: cx / n, y: cy / n };
}
