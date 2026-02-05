/**
 * Type exports for GeoNoise web app
 * Re-exports all UI and theme types from a single entry point
 */

export {
  type Point,
  type DisplayBand,
  OCTAVE_BAND_LABELS,
  type Tool,
  type SelectableElementType,
  type SelectionItem,
  type Selection,
  type DragState,
  type DragContribution,
  type NoiseMap,
  type MapRange,
  type MapRenderStyle,
  sameSelection,
} from './ui.js';

export { type CanvasTheme } from './theme.js';
