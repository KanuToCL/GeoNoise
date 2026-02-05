/**
 * Core entity types for GeoNoise
 * Simple data types representing scene elements
 */

import type { Spectrum9 } from '@geonoise/shared';

export type Point = { x: number; y: number };

/**
 * Sound source with full spectral definition
 *
 * Spectral Source Migration (Jan 2026):
 * - Added `spectrum` for 9-band octave levels
 * - Added `gain` for master level offset
 * - `power` is now computed from spectrum (kept for backward compatibility)
 */
export type Source = {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  /** Overall power level (computed from spectrum) - kept for legacy compatibility */
  power: number;
  /** 9-band spectrum: [63, 125, 250, 500, 1k, 2k, 4k, 8k, 16k] Hz in dB Lw */
  spectrum: Spectrum9;
  /** Gain offset applied on top of spectrum (dB) */
  gain: number;
  enabled: boolean;
};

export type Receiver = {
  id: string;
  name?: string;
  x: number;
  y: number;
  z: number;
};

export type Panel = {
  id: string;
  name?: string;
  points: Point[];
  elevation: number;
  sampling: { resolution: number; pointCap: number };
};

export type Probe = {
  id: string;
  name?: string;
  x: number;
  y: number;
  z: number;
};
