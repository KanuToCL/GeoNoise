/**
 * UI Module Barrel Exports
 *
 * Re-exports all UI modules from a single entry point.
 */

// Panels
export {
  type LayerKey,
  LAYER_LABELS,
  wireLayerToggle,
  wireAllLayerToggles,
  wirePopover,
  isLayerVisible,
  setLayerVisibility,
  toggleLayer,
} from './panels/layers.js';

// Modals
export {
  type AboutTab,
  isAboutOpen,
  openAbout,
  closeAbout,
  setAboutTab,
  wireAboutModal,
  wireCollapsibleSections,
  wireAuthorModal,
} from './modals/about.js';

// Toolbar
export {
  type ToolButton,
  type DrawingModeOption,
  TOOL_BUTTONS,
  BUILDING_DRAWING_MODES,
  BARRIER_DRAWING_MODES,
  hideDrawingModeSubmenu,
  showDrawingModeSubmenu,
  wireToolGrid,
  wireDockLabels,
  wireDockExpand,
  updateToolButtons,
} from './toolbar.js';
