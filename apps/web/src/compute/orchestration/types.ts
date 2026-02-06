/**
 * Compute Orchestration Types
 *
 * Type definitions for compute orchestration functions.
 * These types describe the interfaces for coordinating engine computations.
 */

import type { EngineConfig } from '@geonoise/core';
import type { ComputePreference } from '../../computePreference.js';
import type { Source, Receiver, Panel, Barrier } from '../../entities/index.js';
import type { Building } from '../../entities/building.js';
import type { SceneResults } from '../../export.js';

// ============================================================================
// Scene Types
// ============================================================================

/**
 * UI scene structure containing all entities
 */
export interface UIScene {
  sources: Source[];
  receivers: Receiver[];
  panels: Panel[];
  buildings: Building[];
  barriers: Barrier[];
}

/**
 * Origin point for scene coordinate system
 */
export interface SceneOrigin {
  latLon: { lat: number; lon: number };
  altitude: number;
}

/**
 * Bounds rectangle in world coordinates
 */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ============================================================================
// Drag Contribution Types (for incremental computation)
// ============================================================================

/**
 * Tracks energy contributions from a single source during dragging.
 * Used to compute incremental updates without full recomputation.
 */
export interface DragContribution {
  /** ID of the source being dragged */
  sourceId: string;
  /** Per-receiver energy contribution from this source */
  receiverEnergy: Map<string, number>;
  /** Per-panel energy contributions from this source (panel ID -> sample energies) */
  panelEnergy: Map<string, Float64Array>;
}

// ============================================================================
// Compute State Types
// ============================================================================

/**
 * State for tracking compute operations
 */
export interface ComputeState {
  /** Number of pending compute operations */
  pendingComputes: number;
  /** Whether a compute is currently in progress */
  isComputing: boolean;
  /** Current compute token for cancellation */
  computeToken: number;
  /** Active compute token */
  activeComputeToken: number;
}

/**
 * State for tracking map compute operations
 */
export interface MapComputeState {
  /** Whether a map compute is currently in progress */
  isMapComputing: boolean;
  /** Current map compute token */
  mapComputeToken: number;
  /** Active map compute token */
  activeMapToken: number;
  /** Queued resolution for next map update */
  queuedMapResolutionPx: number | null;
}

// ============================================================================
// Callback Types
// ============================================================================

/**
 * Callbacks for compute orchestration
 */
export interface ComputeCallbacks {
  /** Update compute UI state */
  updateComputeUI: () => void;
  /** Update status display */
  updateStatus: (meta: { backendId: string; timings?: { totalMs?: number }; warnings?: unknown[] }) => void;
  /** Render results */
  renderResults: () => void;
  /** Request canvas render */
  requestRender: () => void;
  /** Show compute error */
  showComputeError: (label: string, error: unknown) => void;
  /** Request live probe updates */
  requestLiveProbeUpdates: () => void;
}

/**
 * Callbacks specific to noise map operations
 */
export interface MapCallbacks {
  /** Update map UI state */
  updateMapUI: () => void;
  /** Set map toast message */
  setMapToast: (message: string | null, type?: string, duration?: number) => void;
  /** Render noise map legend */
  renderNoiseMapLegend: () => void;
  /** Request canvas render */
  requestRender: () => void;
}

// ============================================================================
// Config Types
// ============================================================================

/**
 * Configuration for building engine scenes
 */
export interface BuildEngineSceneConfig {
  /** Scene origin */
  origin: SceneOrigin;
  /** UI scene data */
  scene: UIScene;
  /** Function to check if a source is enabled */
  isSourceEnabled: (source: Source) => boolean;
}

/**
 * Context for compute operations
 */
export interface ComputeContext {
  /** UI scene data */
  scene: UIScene;
  /** Scene results */
  results: SceneResults;
  /** Engine configuration */
  engineConfig: EngineConfig;
  /** Compute preference (cpu/gpu) */
  preference: ComputePreference;
  /** Scene origin */
  origin: SceneOrigin;
  /** Function to check if a source is enabled */
  isSourceEnabled: (source: Source) => boolean;
  /** Callbacks for UI updates */
  callbacks: ComputeCallbacks;
}

/**
 * Context for incremental compute operations
 */
export interface IncrementalComputeContext extends ComputeContext {
  /** Current drag contribution state */
  dragContribution: DragContribution | null;
  /** Per-receiver energy totals */
  receiverEnergyTotals: Map<string, number>;
  /** Per-panel energy totals */
  panelEnergyTotals: Map<string, Float64Array>;
}
