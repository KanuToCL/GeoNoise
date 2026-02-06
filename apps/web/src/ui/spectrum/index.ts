/**
 * Spectrum Module Barrel Exports
 *
 * Re-exports all spectrum editor components from a single entry point.
 */

// Types
export type {
  OnChangeSpectrum,
  OnChangeGain,
  SpectrumEditorConfig,
  ChartRenderConfig,
  ChartPadding,
  ReadCssVar,
} from './types.js';

// Chart rendering
export { renderSourceChartOn } from './chart.js';

// Editor component
export {
  createFieldLabel,
  createInlineField,
  createSpectrumEditor,
} from './editor.js';

// Bar visualization
export { createSpectrumBar } from './bar.js';
