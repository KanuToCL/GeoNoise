/**
 * Shared type definitions
 */

// ============================================================================
// Compute Preferences & Backend Types
// ============================================================================

/** Compute preference for engine calculations */
export type ComputePreference = 'auto' | 'cpu' | 'gpu';

/** Backend identifiers */
export type BackendId = 'cpu-worker' | 'webgpu' | 'cpu-main';

/** Backend capability status */
export interface BackendCapability {
  available: boolean;
  reason?: string;
  maxWorkload?: number;
}

/** Backend diagnostics */
export interface BackendDiagnostics {
  id: BackendId;
  capability: BackendCapability;
  lastUsed?: number;
  averageTimeMs?: number;
}

// ============================================================================
// Output & Mode Types
// ============================================================================

/** Output metrics supported by the engine */
export type OutputMetric = 'LAeq' | 'LCeq' | 'Leq_bands';

/** Source types */
export type SourceType = 'point' | 'line' | 'area';

/** Receiver types */
export type ReceiverType = 'point' | 'panel';

/** Calculation modes */
export type CalculationMode = 'festival_fast' | 'standards_strict';

/** Time model */
export type TimeModel = 'steady_state' | 'time_varying';

// ============================================================================
// Unit Types (Branded for type safety)
// ============================================================================

/** Decibel value (sound pressure level) */
export type DecibelSPL = number & { readonly __brand: 'DecibelSPL' };

/** Decibel value (sound power level) */
export type DecibelSWL = number & { readonly __brand: 'DecibelSWL' };

/** Distance in meters */
export type Meters = number & { readonly __brand: 'Meters' };

/** Frequency in Hz */
export type Hertz = number & { readonly __brand: 'Hertz' };

/** Temperature in Celsius */
export type Celsius = number & { readonly __brand: 'Celsius' };

/** Relative humidity as percentage (0-100) */
export type RelativeHumidity = number & { readonly __brand: 'RelativeHumidity' };

/** Atmospheric pressure in kPa */
export type KiloPascal = number & { readonly __brand: 'KiloPascal' };

// ============================================================================
// ID Types
// ============================================================================

/** Unique identifier for sources */
export type SourceId = string & { readonly __brand: 'SourceId' };

/** Unique identifier for receivers */
export type ReceiverId = string & { readonly __brand: 'ReceiverId' };

/** Unique identifier for panels */
export type PanelId = string & { readonly __brand: 'PanelId' };

/** Unique identifier for obstacles */
export type ObstacleId = string & { readonly __brand: 'ObstacleId' };

/** Scene hash for caching */
export type SceneHash = string & { readonly __brand: 'SceneHash' };

// ============================================================================
// Result Types
// ============================================================================

/** Warning severity levels */
export type WarningSeverity = 'info' | 'warning' | 'error';

/** Computation warning */
export interface ComputeWarning {
  code: string;
  message: string;
  severity: WarningSeverity;
  context?: Record<string, unknown>;
}

/** Timing information for performance diagnostics */
export interface ComputeTimings {
  totalMs: number;
  setupMs?: number;
  computeMs?: number;
  transferMs?: number;
  pathCount?: number;
}

// ============================================================================
// Helper type guards and creators
// ============================================================================

/** Create a branded DecibelSPL value */
export function dBSPL(value: number): DecibelSPL {
  return value as DecibelSPL;
}

/** Create a branded DecibelSWL value */
export function dBSWL(value: number): DecibelSWL {
  return value as DecibelSWL;
}

/** Create a branded Meters value */
export function meters(value: number): Meters {
  return value as Meters;
}

/** Create a branded Hertz value */
export function hz(value: number): Hertz {
  return value as Hertz;
}

/** Create a SourceId */
export function sourceId(value: string): SourceId {
  return value as SourceId;
}

/** Create a ReceiverId */
export function receiverId(value: string): ReceiverId {
  return value as ReceiverId;
}

/** Create a PanelId */
export function panelId(value: string): PanelId {
  return value as PanelId;
}

/** Create an ObstacleId */
export function obstacleId(value: string): ObstacleId {
  return value as ObstacleId;
}
