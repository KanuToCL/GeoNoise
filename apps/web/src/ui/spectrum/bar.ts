/**
 * Compact spectrum bar visualization
 *
 * Creates a small bar chart visualization of a 9-band spectrum.
 * Used for displaying source spectrum in compact spaces like table rows.
 */

import {
  OCTAVE_BANDS,
  MIN_LEVEL,
  applyWeightingToSpectrum,
  type Spectrum9,
  type FrequencyWeighting,
} from '@geonoise/shared';
import { formatLevel } from '../../format.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Minimum bar height percentage */
const MIN_BAR_HEIGHT = 5;

/** Minimum level range in dB */
const MIN_LEVEL_RANGE = 30;

// =============================================================================
// SPECTRUM BAR
// =============================================================================

/**
 * Create a compact spectrum bar visualization
 *
 * Displays a 9-band spectrum as vertical bars, with heights proportional
 * to the weighted level values. Useful for showing spectrum shape at a glance.
 *
 * @param spectrum - 9-band octave spectrum in dB Lw
 * @param weighting - Frequency weighting to apply ('A', 'C', or 'Z')
 * @returns The spectrum bar container element
 */
export function createSpectrumBar(
  spectrum: Spectrum9,
  weighting: FrequencyWeighting = 'Z'
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'spectrum-bar';

  const weighted = applyWeightingToSpectrum(spectrum, weighting);
  const maxLevel = Math.max(...weighted);
  const minLevel = Math.min(...weighted.filter(l => l > MIN_LEVEL));
  const range = Math.max(maxLevel - minLevel, MIN_LEVEL_RANGE);

  for (let i = 0; i < 9; i++) {
    const bar = document.createElement('div');
    bar.className = 'spectrum-bar-item';
    const level = weighted[i];
    const height = level > MIN_LEVEL ? Math.max(MIN_BAR_HEIGHT, ((level - minLevel) / range) * 100) : MIN_BAR_HEIGHT;
    bar.style.height = `${height}%`;
    bar.title = `${OCTAVE_BANDS[i]} Hz: ${formatLevel(level)} dB${weighting}`;
    container.appendChild(bar);
  }

  return container;
}
