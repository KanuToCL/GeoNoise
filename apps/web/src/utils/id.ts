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
