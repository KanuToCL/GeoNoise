/**
 * ID Generation Utilities
 *
 * Functions for creating unique entity IDs.
 */

/**
 * Create a unique ID from a prefix and sequence number.
 * @param prefix - The ID prefix (e.g., 's' for source, 'r' for receiver)
 * @param seq - The sequence number
 * @returns A unique ID string
 */
export function createId(prefix: string, seq: number): string {
  return `${prefix}${seq}`;
}

// =============================================================================
// ID PREFIXES BY ENTITY TYPE
// =============================================================================

/** ID prefix for sources: s1, s2, s3... */
export const SOURCE_PREFIX = 's';

/** ID prefix for receivers: r1, r2, r3... */
export const RECEIVER_PREFIX = 'r';

/** ID prefix for probes: pr1, pr2, pr3... */
export const PROBE_PREFIX = 'pr';

/** ID prefix for panels: p1, p2, p3... */
export const PANEL_PREFIX = 'p';

/** ID prefix for buildings: bd1, bd2, bd3... */
export const BUILDING_PREFIX = 'bd';

/** ID prefix for barriers: bar1, bar2, bar3... */
export const BARRIER_PREFIX = 'bar';
