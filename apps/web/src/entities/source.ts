/**
 * Source entity definition and factory functions
 */

import { createFlatSpectrum, type Spectrum9 } from '@geonoise/shared';
import type { Source } from './types.js';
import { createId, SOURCE_PREFIX } from '../utils/id.js';

// =============================================================================
// DEFAULTS
// =============================================================================

/** Default height for sources in meters */
export const SOURCE_DEFAULT_Z = 1.5;

/** Default power level for sources in dB */
export const SOURCE_DEFAULT_POWER = 100;

/** Default gain for sources in dB */
export const SOURCE_DEFAULT_GAIN = 0;

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

export interface CreateSourceOptions {
  /** Source ID - auto-generated if not provided */
  id?: string;
  /** Source name */
  name?: string;
  /** X position in meters */
  x: number;
  /** Y position in meters */
  y: number;
  /** Height in meters (default: 1.5) */
  z?: number;
  /** Power level in dB (default: 100) */
  power?: number;
  /** 9-band spectrum (default: flat at 100 dB) */
  spectrum?: Spectrum9;
  /** Gain offset in dB (default: 0) */
  gain?: number;
  /** Whether source is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Create a new Source entity
 *
 * @param seq - Sequence number for ID generation (required if id not provided)
 * @param options - Source configuration options
 * @returns A new Source object
 */
export function createSource(seq: number, options: CreateSourceOptions): Source {
  const id = options.id ?? createId(SOURCE_PREFIX, seq);
  const defaultSpectrum = createFlatSpectrum(SOURCE_DEFAULT_POWER) as Spectrum9;

  return {
    id,
    name: options.name ?? `Source ${seq}`,
    x: options.x,
    y: options.y,
    z: options.z ?? SOURCE_DEFAULT_Z,
    power: options.power ?? SOURCE_DEFAULT_POWER,
    spectrum: options.spectrum ?? defaultSpectrum,
    gain: options.gain ?? SOURCE_DEFAULT_GAIN,
    enabled: options.enabled ?? true,
  };
}

/**
 * Duplicate a source with a new ID
 *
 * @param source - The source to duplicate
 * @param seq - Sequence number for new ID
 * @returns A new Source object with copied properties
 */
export function duplicateSource(source: Source, seq: number): Source {
  const newId = createId(SOURCE_PREFIX, seq);
  return {
    ...source,
    id: newId,
    name: `${source.name || source.id.toUpperCase()} Copy`,
    spectrum: [...source.spectrum] as Spectrum9,
  };
}
