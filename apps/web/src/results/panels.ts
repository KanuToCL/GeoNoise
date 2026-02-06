/**
 * Panel Results Module
 *
 * Functions for computing panel statistics and rendering panel stats in the UI.
 * Extracted from main.ts for modular architecture.
 */

import { MIN_LEVEL } from '@geonoise/shared';
import { dbToEnergy, energyToDb } from '../utils/index.js';
import { formatLevel } from '../format.js';
import type { PanelResult } from '../export.js';

/**
 * Convert panel samples to energy values for incremental computation
 *
 * @param samples - Array of panel samples with LAeq values
 * @returns Float64Array of energy values
 */
export function panelSamplesToEnergy(samples: PanelResult['samples']): Float64Array {
  const energies = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    energies[i] = dbToEnergy(samples[i].LAeq);
  }
  return energies;
}

/**
 * Recompute panel statistics from samples
 *
 * This function updates the panel result object in place with computed
 * min, max, average, and percentile values.
 *
 * @param panelResult - Panel result to update (mutated in place)
 */
export function recomputePanelStats(panelResult: PanelResult): void {
  let min = Infinity;
  let max = -Infinity;
  let energySum = 0;
  const laeqs: number[] = [];

  for (const sample of panelResult.samples) {
    const level = sample.LAeq;
    if (level <= MIN_LEVEL) continue;
    laeqs.push(level);
    if (level < min) min = level;
    if (level > max) max = level;
    energySum += dbToEnergy(level);
  }

  if (!laeqs.length || energySum <= 0) {
    panelResult.LAeq_min = MIN_LEVEL;
    panelResult.LAeq_max = MIN_LEVEL;
    panelResult.LAeq_avg = MIN_LEVEL;
    panelResult.LAeq_p25 = MIN_LEVEL;
    panelResult.LAeq_p50 = MIN_LEVEL;
    panelResult.LAeq_p75 = MIN_LEVEL;
    panelResult.LAeq_p95 = MIN_LEVEL;
    return;
  }

  const avg = energyToDb(energySum / laeqs.length);
  const sorted = [...laeqs].sort((a, b) => a - b);
  const p25Index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.25) - 1));
  const p50Index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.5) - 1));
  const p75Index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1));
  const p95Index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));

  panelResult.LAeq_min = min;
  panelResult.LAeq_max = max;
  panelResult.LAeq_avg = avg;
  panelResult.LAeq_p25 = sorted[p25Index];
  panelResult.LAeq_p50 = sorted[p50Index];
  panelResult.LAeq_p75 = sorted[p75Index];
  panelResult.LAeq_p95 = sorted[p95Index];
}

/**
 * Render panel stats for a specific panel into a container
 *
 * @param container - Target container element
 * @param result - Panel result to display
 * @param emptyMessage - Message when no result available
 */
export function renderPanelStatsFor(
  container: HTMLElement,
  result: PanelResult | undefined,
  emptyMessage = 'Measure grid results pending.'
): void {
  container.innerHTML = '';

  if (!result) {
    container.innerHTML = `<span class="legend-empty">${emptyMessage}</span>`;
    return;
  }

  const iqr = result.LAeq_p75 - result.LAeq_p25;
  const rows: Array<[string, string]> = [
    ['Min', `${formatLevel(result.LAeq_min)} dB`],
    ['Average', `${formatLevel(result.LAeq_avg)} dB`],
    ['L50', `${formatLevel(result.LAeq_p50)} dB`],
    ['Max', `${formatLevel(result.LAeq_max)} dB`],
    ['L75-L25', `${formatLevel(iqr)} dB`],
    ['Samples', `${result.sampleCount}`],
  ];

  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    container.appendChild(row);
  }
}

/**
 * Render panel stats for current selection
 *
 * @param container - Stats container element
 * @param panelResults - All panel results
 * @param panelCount - Number of panels in scene
 * @param selectedPanelId - Currently selected panel ID, or null
 */
export function renderPanelStats(
  container: HTMLElement | null,
  panelResults: PanelResult[],
  panelCount: number,
  selectedPanelId: string | null
): void {
  if (!container) return;
  container.innerHTML = '';

  if (panelCount === 0) {
    container.innerHTML = '<span class="legend-empty">Add a measure grid to see stats.</span>';
    return;
  }

  if (!selectedPanelId) {
    container.innerHTML = '<span class="legend-empty">Select a measure grid to view stats.</span>';
    return;
  }

  const result = panelResults.find((panel) => panel.panelId === selectedPanelId);
  renderPanelStatsFor(container, result);
}
