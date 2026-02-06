/**
 * Barrier entity for GeoNoise
 * Represents acoustic barriers that affect sound propagation through diffraction
 */

export type Point = { x: number; y: number };

/**
 * UI barrier primitive
 * - p1/p2 are endpoints in the 2D editor plane (x,y) in local meters (ENU).
 * - height is the vertical screen height (meters). In physics, this becomes the Z of the barrier top edge.
 * - transmissionLoss is reserved for future "through-wall" modeling (currently unused by the engine).
 *
 * Important: The UI is 2D, but the engine computes 3D acoustics:
 *   - source z = hs
 *   - receiver z = hr
 *   - barrier height = hb
 * The CPU engine checks 2D intersection (SR crosses barrier segment) and then uses hb/hs/hr to compute
 * the 3D "over the top" path difference delta that drives the barrier insertion loss term.
 */
export type Barrier = {
  id: string;
  name?: string;
  p1: Point;
  p2: Point;
  height: number;
  transmissionLoss?: number;
};

// Barrier manipulation constants
export const BARRIER_HANDLE_RADIUS = 5;
export const BARRIER_HANDLE_HIT_RADIUS = 12;
export const BARRIER_ROTATION_HANDLE_OFFSET_PX = 20;
export const BARRIER_ROTATION_HANDLE_RADIUS = 5;
export const BARRIER_MIN_LENGTH = 1;

// Helper functions for barrier geometry

export function getBarrierMidpoint(barrier: Barrier): Point {
  return {
    x: (barrier.p1.x + barrier.p2.x) / 2,
    y: (barrier.p1.y + barrier.p2.y) / 2,
  };
}

export function getBarrierLength(barrier: Barrier): number {
  const dx = barrier.p2.x - barrier.p1.x;
  const dy = barrier.p2.y - barrier.p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getBarrierRotation(barrier: Barrier): number {
  return Math.atan2(barrier.p2.y - barrier.p1.y, barrier.p2.x - barrier.p1.x);
}

export function getBarrierRotationHandlePosition(barrier: Barrier, handleOffset: number): Point {
  const mid = getBarrierMidpoint(barrier);
  const rotation = getBarrierRotation(barrier);
  // Handle is perpendicular to the barrier, offset from midpoint
  const perpAngle = rotation + Math.PI / 2;
  return {
    x: mid.x + Math.cos(perpAngle) * handleOffset,
    y: mid.y + Math.sin(perpAngle) * handleOffset,
  };
}

export function setBarrierFromMidpointAndRotation(
  barrier: Barrier,
  midpoint: Point,
  rotation: number,
  length: number
): void {
  const halfLength = length / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  barrier.p1 = {
    x: midpoint.x - cos * halfLength,
    y: midpoint.y - sin * halfLength,
  };
  barrier.p2 = {
    x: midpoint.x + cos * halfLength,
    y: midpoint.y + sin * halfLength,
  };
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

import { createId, BARRIER_PREFIX } from '../utils/id.js';

/** Default barrier height in meters */
export const BARRIER_DEFAULT_HEIGHT = 3;

export interface CreateBarrierOptions {
  /** Barrier ID - auto-generated if not provided */
  id?: string;
  /** Barrier name */
  name?: string;
  /** First endpoint */
  p1: Point;
  /** Second endpoint */
  p2: Point;
  /** Barrier height in meters (default: 3) */
  height?: number;
  /** Transmission loss in dB (optional, for future use) */
  transmissionLoss?: number;
}

/**
 * Create a new Barrier entity
 *
 * @param seq - Sequence number for ID generation (required if id not provided)
 * @param options - Barrier configuration options
 * @returns A new Barrier object
 */
export function createBarrier(seq: number, options: CreateBarrierOptions): Barrier {
  const id = options.id ?? createId(BARRIER_PREFIX, seq);

  return {
    id,
    name: options.name,
    p1: { ...options.p1 },
    p2: { ...options.p2 },
    height: options.height ?? BARRIER_DEFAULT_HEIGHT,
    transmissionLoss: options.transmissionLoss,
  };
}

/**
 * Duplicate a barrier with a new ID
 *
 * @param barrier - The barrier to duplicate
 * @param seq - Sequence number for new ID
 * @returns A new Barrier object with copied properties
 */
export function duplicateBarrier(barrier: Barrier, seq: number): Barrier {
  const newId = createId(BARRIER_PREFIX, seq);
  return {
    ...barrier,
    id: newId,
    p1: { ...barrier.p1 },
    p2: { ...barrier.p2 },
  };
}
