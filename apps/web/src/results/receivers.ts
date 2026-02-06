/**
 * Receiver Results Module
 *
 * Functions for displaying receiver results in the UI.
 * Extracted from main.ts for modular architecture.
 */

import { OCTAVE_BAND_LABELS } from '../types/index.js';
import { formatLevel } from '../format.js';
import type { SceneResults } from '../export.js';
import type { ReceiverDisplayResult, ReceiverDisplayConfig } from './types.js';

/**
 * Get the appropriate display level for a receiver based on weighting/band selection
 *
 * Spectral Source Migration (Jan 2026):
 * - Supports displaying individual octave bands from Leq_spectrum
 * - Supports A/C/Z weighting selection for overall level
 * - Falls back to LAeq if weighted values not available
 *
 * @param receiver - Receiver result with spectrum data
 * @param config - Display configuration (weighting and band)
 * @returns Object with level (dB) and unit string for display
 */
export function getReceiverDisplayLevel(
  receiver: SceneResults['receivers'][number],
  config: ReceiverDisplayConfig
): ReceiverDisplayResult {
  const { weighting, band } = config;

  // If a specific band is selected, show that band's level (unweighted)
  if (band !== 'overall' && receiver.Leq_spectrum) {
    return {
      level: receiver.Leq_spectrum[band],
      unit: `dB @ ${OCTAVE_BAND_LABELS[band]}`,
    };
  }

  // Show weighted overall level based on selected weighting
  switch (weighting) {
    case 'C':
      return { level: receiver.LCeq ?? receiver.LAeq, unit: 'dB(C)' };
    case 'Z':
      return { level: receiver.LZeq ?? receiver.LAeq, unit: 'dB(Z)' };
    case 'A':
    default:
      return { level: receiver.LAeq, unit: 'dB(A)' };
  }
}

/**
 * Render the receiver results table with spectrum visualization
 *
 * @param table - Container element for receiver table
 * @param receivers - Receiver results to display
 * @param config - Display configuration
 */
export function renderReceiverTable(
  table: HTMLElement | null,
  receivers: SceneResults['receivers'],
  config: ReceiverDisplayConfig
): void {
  if (!table) return;

  table.innerHTML = '';

  for (const receiver of receivers) {
    const row = document.createElement('div');
    row.className = 'result-row result-row--spectrum';

    // Header with ID and weighted/band-specific level
    const { level, unit } = getReceiverDisplayLevel(receiver, config);
    const header = document.createElement('div');
    header.className = 'result-row-header';
    header.innerHTML = `<span>${receiver.id.toUpperCase()}</span><strong>${formatLevel(level)} ${unit}</strong>`;
    row.appendChild(header);

    // Add spectrum bars if available
    if (receiver.Leq_spectrum) {
      const spectrumContainer = document.createElement('div');
      spectrumContainer.className = 'result-spectrum-mini';

      const maxLevel = Math.max(...receiver.Leq_spectrum);
      const minDisplay = Math.max(0, maxLevel - 60);

      receiver.Leq_spectrum.forEach((lvl, i) => {
        const bar = document.createElement('div');
        bar.className = 'spectrum-bar-mini';
        const height = Math.max(0, ((lvl - minDisplay) / (maxLevel - minDisplay)) * 100);
        bar.style.height = `${height}%`;
        bar.title = `${OCTAVE_BAND_LABELS[i]}: ${formatLevel(lvl)} dB`;
        // Highlight the selected band
        if (config.band !== 'overall' && i === config.band) {
          bar.classList.add('is-selected');
        }
        spectrumContainer.appendChild(bar);
      });

      row.appendChild(spectrumContainer);
    }

    table.appendChild(row);
  }
}

/**
 * Render all results (receivers, sources, panels)
 *
 * This is the main entry point for updating results UI.
 * It coordinates rendering of multiple result sections.
 *
 * @param options - Rendering options and callbacks
 */
export function renderResults(options: {
  /** Scene results data */
  results: SceneResults;
  /** Display configuration */
  displayConfig: ReceiverDisplayConfig;
  /** Receiver table element */
  receiverTable: HTMLElement | null;
  /** Panel legend element */
  panelLegend: HTMLElement | null;
  /** Panel stats element */
  panelStats: HTMLElement | null;
  /** Selected panel ID (for legend/stats) */
  selectedPanelId: string | null;
  /** Number of panels in scene */
  panelCount: number;
  /** Callback to render sources */
  onRenderSources: () => void;
  /** Callback to render panel legend */
  onRenderPanelLegend: () => void;
  /** Callback to render panel stats */
  onRenderPanelStats: () => void;
  /** Callback to refresh pinned context panels */
  onRefreshPinnedPanels: () => void;
}): void {
  const {
    results,
    displayConfig,
    receiverTable,
    onRenderSources,
    onRenderPanelLegend,
    onRenderPanelStats,
    onRefreshPinnedPanels,
  } = options;

  // Render sources table
  onRenderSources();

  // Render receiver table
  renderReceiverTable(receiverTable, results.receivers, displayConfig);

  // Render panel legend and stats
  onRenderPanelLegend();
  onRenderPanelStats();

  // Refresh any pinned context panels
  onRefreshPinnedPanels();
}
