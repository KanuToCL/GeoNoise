/**
 * Results Module Barrel Exports
 *
 * Re-exports all results rendering functionality from a single entry point.
 */

// Types
export type {
  NoiseMapLegendElements,
  NoiseMapLegendConfig,
  PanelDisplayElements,
  PanelRenderContext,
  ReceiverDisplayResult,
  ReceiverDisplayConfig,
  ReceiverTableElements,
  ResultsRenderContext,
} from './types.js';

// Legend rendering
export {
  formatLegendLevel,
  renderNoiseMapLegend,
  renderPanelLegendFor,
  renderPanelLegend,
} from './legend.js';

// Panel stats and computation
export {
  panelSamplesToEnergy,
  recomputePanelStats,
  renderPanelStatsFor,
  renderPanelStats,
} from './panels.js';

// Receiver display
export {
  getReceiverDisplayLevel,
  renderReceiverTable,
  renderResults,
} from './receivers.js';
