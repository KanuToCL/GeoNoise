/**
 * Drag Handler Types
 *
 * Type definitions for drag operations and handlers.
 */

import type { Point } from '../../types/ui.js';
import type { DragState } from '../../types/ui.js';
import type { Source, Receiver, Panel, Probe, Barrier } from '../../entities/index.js';
import type { Building } from '../../entities/building.js';

// =============================================================================
// SCENE TYPE
// =============================================================================

/** Scene data structure for drag operations */
export interface SceneData {
  sources: Source[];
  receivers: Receiver[];
  panels: Panel[];
  probes: Probe[];
  barriers: Barrier[];
  buildings: Building[];
}

// =============================================================================
// DRAG HANDLER TYPES
// =============================================================================

/** Configuration for applying a drag operation */
export interface DragApplyConfig {
  scene: SceneData;
  dragState: DragState;
  worldPoint: Point;
  /** Callback when ray visualization should be disabled */
  onDisableRayVis?: () => void;
  /** Callback when a probe needs updating */
  onProbeUpdate?: (probeId: string) => void;
}

/** Result from applying a drag operation */
export interface DragApplyResult {
  /** Whether geometry that affects propagation was modified */
  affectsGeometry: boolean;
  /** Whether a source was moved (for incremental compute) */
  sourceId?: string;
}

/** Drag types that affect geometry/propagation */
export const GEOMETRY_DRAG_TYPES = [
  'source',
  'barrier',
  'barrier-endpoint',
  'barrier-rotate',
  'building',
  'building-resize',
  'building-rotate',
  'move-multi',
] as const;

/** Minimum building size in meters */
export const BUILDING_MIN_SIZE = 0.5;

