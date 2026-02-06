/**
 * Receiver entity definition and factory functions
 */

import type { Receiver } from './types.js';
import { createId, RECEIVER_PREFIX } from '../utils/id.js';

// =============================================================================
// DEFAULTS
// =============================================================================

/** Default height for receivers in meters */
export const RECEIVER_DEFAULT_Z = 1.5;

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

export interface CreateReceiverOptions {
  /** Receiver ID - auto-generated if not provided */
  id?: string;
  /** Receiver name */
  name?: string;
  /** X position in meters */
  x: number;
  /** Y position in meters */
  y: number;
  /** Height in meters (default: 1.5) */
  z?: number;
}

/**
 * Create a new Receiver entity
 *
 * @param seq - Sequence number for ID generation (required if id not provided)
 * @param options - Receiver configuration options
 * @returns A new Receiver object
 */
export function createReceiver(seq: number, options: CreateReceiverOptions): Receiver {
  const id = options.id ?? createId(RECEIVER_PREFIX, seq);

  return {
    id,
    name: options.name,
    x: options.x,
    y: options.y,
    z: options.z ?? RECEIVER_DEFAULT_Z,
  };
}

/**
 * Duplicate a receiver with a new ID
 *
 * @param receiver - The receiver to duplicate
 * @param seq - Sequence number for new ID
 * @returns A new Receiver object with copied properties
 */
export function duplicateReceiver(receiver: Receiver, seq: number): Receiver {
  const newId = createId(RECEIVER_PREFIX, seq);
  return { ...receiver, id: newId };
}
