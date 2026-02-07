/**
 * I/O Types for Scene Serialization and Deserialization
 *
 * Defines the payload structure for scene files and propagation config.
 */

import type { Point, Source, Receiver, Panel, Probe, BuildingData } from '../entities/index.js';
import type { PropagationConfig } from '@geonoise/core';

// Re-export PropagationConfig for convenience
export type { PropagationConfig };

/**
 * Scene payload structure for save/load operations
 *
 * Version 1 format includes all entity types and propagation settings.
 * Legacy files may omit barriers field.
 */
export type ScenePayload = {
  /** Payload version for future compatibility */
  version: number;
  /** Scene name (user-provided) */
  name: string;
  /** Sound sources */
  sources: Source[];
  /** Receiver points */
  receivers: Receiver[];
  /** Measurement panels */
  panels: Panel[];
  /** Probe points (optional for legacy files) */
  probes?: Probe[];
  /** Buildings data */
  buildings: BuildingData[];
  /** Barriers (optional for legacy files) */
  barriers?: Array<{
    id: string;
    name?: string;
    p1: Point;
    p2: Point;
    height: number;
    transmissionLoss?: number;
  }>;
  /** Propagation settings */
  propagation?: PropagationConfig;
};

/**
 * Validation result for scene payload
 */
export type ValidationResult = {
  valid: boolean;
  errors: string[];
};
