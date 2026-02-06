/**
 * Probe entity definition and factory functions
 */

import type { Probe } from './types.js';
import { createId, PROBE_PREFIX } from '../utils/id.js';
import { PROBE_DEFAULT_Z } from '../constants.js';

// =============================================================================
// RE-EXPORT DEFAULT
// =============================================================================

// Re-export PROBE_DEFAULT_Z from constants for convenience
export { PROBE_DEFAULT_Z } from '../constants.js';

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

export interface CreateProbeOptions {
  /** Probe ID - auto-generated if not provided */
  id?: string;
  /** Probe name */
  name?: string;
  /** X position in meters */
  x: number;
  /** Y position in meters */
  y: number;
  /** Height in meters (default: 1.7 from PROBE_DEFAULT_Z) */
  z?: number;
}

/**
 * Create a new Probe entity
 *
 * @param seq - Sequence number for ID generation (required if id not provided)
 * @param options - Probe configuration options
 * @returns A new Probe object
 */
export function createProbe(seq: number, options: CreateProbeOptions): Probe {
  const id = options.id ?? createId(PROBE_PREFIX, seq);

  return {
    id,
    name: options.name,
    x: options.x,
    y: options.y,
    z: options.z ?? PROBE_DEFAULT_Z,
  };
}

/**
 * Duplicate a probe with a new ID
 *
 * @param probe - The probe to duplicate
 * @param seq - Sequence number for new ID
 * @returns A new Probe object with copied properties
 */
export function duplicateProbe(probe: Probe, seq: number): Probe {
  const newId = createId(PROBE_PREFIX, seq);
  return { ...probe, id: newId };
}
