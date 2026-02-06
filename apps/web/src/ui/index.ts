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

// Spectrum
export {
  type OnChangeSpectrum,
  type OnChangeGain,
  type SpectrumEditorConfig,
  type ChartRenderConfig,
  type ChartPadding,
  type ReadCssVar,
  renderSourceChartOn,
  createFieldLabel,
  createInlineField,
  createSpectrumEditor,
  createSpectrumBar,
} from './spectrum/index.js';

// Context Panel
export {
  type PinnedContextPanel,
  getPinnedContextPanels,
  addPinnedContextPanel,
  removePinnedContextPanel,
  clearPinnedContextPanels,
  nextPinnedContextSeq,
  getPinnedContextPanelCount,
  createInputRow,
  createTextInputRow,
  createSelectRow,
  createCheckboxRow,
} from './contextPanel/index.js';

// Equations
export {
  type EquationElements,
  rerenderKatex,
  updateGroundModelEquation,
  updateSpreadingEquation,
  updateImpedanceEquation,
  updateMixedInterpEquation,
  updateSideDiffractionEquation,
  updateAtmAbsorptionEquation,
  wireEquationCollapsibles,
  updateAllEquations,
} from './equations.js';
