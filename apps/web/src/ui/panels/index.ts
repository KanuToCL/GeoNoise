/**
 * UI Panels Module Barrel Exports
 *
 * Re-exports all panel-related UI modules from a single entry point.
 */

export {
  type LayerKey,
  LAYER_LABELS,
  wireLayerToggle,
  wireAllLayerToggles,
  wirePopover,
  isLayerVisible,
  setLayerVisibility,
  toggleLayer,
} from './layers.js';
