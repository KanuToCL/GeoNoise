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

// Propagation controls
export {
  type PropagationElements,
  type MeteoElements,
  type MeteoState,
  type PropagationCallbacks,
  type CalculationProfile,
  type ProfileSettings,
  ISO9613_PROFILE,
  ACCURATE_PROFILE,
  updatePropagationControls,
  updateProfileIndicator,
  updateProfileDropdown,
  getCurrentSettingsAsProfile,
  settingsMatchProfile,
  detectCurrentProfile,
  wirePropagationControls,
} from './propagation.js';
