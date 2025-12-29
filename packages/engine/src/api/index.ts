/**
 * Compute API - Backend-agnostic interface for engine calculations
 */

import type {
  BackendId,
  ComputePreference,
  ComputeTimings,
  ComputeWarning,
  ReceiverId,
  PanelId,
  SceneHash,
} from '@geonoise/shared';
import type { Scene, EngineConfig, GridConfig, PanelSampling } from '@geonoise/core';

// ============================================================================
// Request Types
// ============================================================================

/** Compute request kind */
export type ComputeKind = 'receivers' | 'panel' | 'grid';

/** Base compute request */
export interface ComputeRequestBase {
  scene: Scene;
  engineConfig?: EngineConfig;
}

/** Compute request for individual receivers */
export interface ComputeReceiversRequest extends ComputeRequestBase {
  kind: 'receivers';
  payload: {
    receiverIds?: ReceiverId[]; // If empty/undefined, compute all
  };
}

/** Compute request for a panel */
export interface ComputePanelRequest extends ComputeRequestBase {
  kind: 'panel';
  payload: {
    panelId: PanelId;
    sampling?: PanelSampling;
  };
}

/** Compute request for a grid */
export interface ComputeGridRequest extends ComputeRequestBase {
  kind: 'grid';
  payload: {
    gridConfig: GridConfig;
  };
}

/** Union of all compute requests */
export type ComputeRequest = ComputeReceiversRequest | ComputePanelRequest | ComputeGridRequest;

// ============================================================================
// Response Types
// ============================================================================

/** Single receiver result */
export interface ReceiverResult {
  receiverId: ReceiverId;
  LAeq: number;
  LCeq?: number;
  Leq_bands?: Record<string, number>;
  contributions?: SourceContribution[];
}

/** Source contribution to a receiver */
export interface SourceContribution {
  sourceId: string;
  LAeq: number;
  distance: number;
  attenuation: number;
}

/** Panel result */
export interface PanelResult {
  panelId: PanelId;
  sampleCount: number;
  LAeq_min: number;
  LAeq_max: number;
  LAeq_avg: number;
  LAeq_L90?: number;
  samples?: PanelSampleResult[];
}

/** Individual panel sample */
export interface PanelSampleResult {
  x: number;
  y: number;
  z: number;
  LAeq: number;
}

/** Grid result */
export interface GridResult {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  resolution: number;
  elevation: number;
  cols: number;
  rows: number;
  values: number[]; // Flat array of LAeq values (row-major)
  min: number;
  max: number;
}

/** Compute response for receivers */
export interface ComputeReceiversResponse {
  kind: 'receivers';
  results: ReceiverResult[];
  sceneHash: SceneHash;
  backendId: BackendId;
  timings: ComputeTimings;
  warnings: ComputeWarning[];
}

/** Compute response for panel */
export interface ComputePanelResponse {
  kind: 'panel';
  result: PanelResult;
  sceneHash: SceneHash;
  backendId: BackendId;
  timings: ComputeTimings;
  warnings: ComputeWarning[];
}

/** Compute response for grid */
export interface ComputeGridResponse {
  kind: 'grid';
  result: GridResult;
  sceneHash: SceneHash;
  backendId: BackendId;
  timings: ComputeTimings;
  warnings: ComputeWarning[];
}

/** Union of all compute responses */
export type ComputeResponse =
  | ComputeReceiversResponse
  | ComputePanelResponse
  | ComputeGridResponse;

// ============================================================================
// Engine Interface
// ============================================================================

/** Engine interface - implemented by backends */
export interface Engine {
  /** Compute sound levels at receivers */
  computeReceivers(request: ComputeReceiversRequest): Promise<ComputeReceiversResponse>;

  /** Compute sound levels across a panel */
  computePanel(request: ComputePanelRequest): Promise<ComputePanelResponse>;

  /** Compute sound levels on a grid (noise map) */
  computeGrid(request: ComputeGridRequest): Promise<ComputeGridResponse>;

  /** Get backend identifier */
  getBackendId(): BackendId;

  /** Check if backend is available */
  isAvailable(): Promise<boolean>;

  /** Get backend capabilities */
  getCapabilities(): EngineCapabilities;

  /** Dispose/cleanup resources */
  dispose(): void;
}

/** Engine capabilities */
export interface EngineCapabilities {
  maxReceivers: number;
  maxSources: number;
  maxGridPoints: number;
  supportsGPU: boolean;
  supportsBandedCalculation: boolean;
  supportsBarriers: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a compute request hash for caching
 */
export function createRequestHash(request: ComputeRequest): SceneHash {
  // Normalize the request for consistent hashing
  const normalized = {
    scene: normalizeForHash(request.scene),
    engineConfig: request.engineConfig,
    kind: request.kind,
    payload: request.payload,
  };

  return hashObject(normalized) as SceneHash;
}

/** Normalize an object for hashing */
function normalizeForHash(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalizeForHash);

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const key of keys) {
    sorted[key] = normalizeForHash((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/** Simple hash function for objects */
function hashObject(obj: unknown): string {
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Merge default engine config with user config
 */
export function mergeEngineConfig(
  defaults: EngineConfig,
  override?: Partial<EngineConfig>
): EngineConfig {
  if (!override) return defaults;

  return {
    mode: override.mode ?? defaults.mode,
    outputMetric: override.outputMetric ?? defaults.outputMetric,
    propagation: {
      ...defaults.propagation,
      ...override.propagation,
    },
    meteo: {
      ...defaults.meteo,
      ...override.meteo,
    },
  };
}

/**
 * Get default engine config for a mode
 */
export function getDefaultEngineConfig(mode: 'festival_fast' | 'standards_strict'): EngineConfig {
  if (mode === 'standards_strict') {
    return {
      mode: 'standards_strict',
      outputMetric: 'LAeq',
      propagation: {
        spreading: 'spherical',
        atmosphericAbsorption: 'iso9613',
        groundReflection: true,
        groundType: 'mixed',
        maxReflections: 1,
        maxDistance: 2000,
        includeBarriers: true,
      },
      meteo: {
        temperature: 20,
        relativeHumidity: 50,
        pressure: 101.325,
        windSpeed: 0,
        windDirection: 0,
      },
    };
  }

  // festival_fast
  return {
    mode: 'festival_fast',
    outputMetric: 'LAeq',
    propagation: {
      spreading: 'spherical',
      atmosphericAbsorption: 'simple',
      groundReflection: false,
      groundType: 'mixed',
      maxReflections: 0,
      maxDistance: 2000,
      includeBarriers: true,
    },
    meteo: {
      temperature: 20,
      relativeHumidity: 50,
      pressure: 101.325,
      windSpeed: 0,
      windDirection: 0,
    },
  };
}
