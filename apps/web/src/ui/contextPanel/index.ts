/**
 * Context Panel Module
 *
 * Barrel exports for the context/properties panel system.
 *
 * This module handles:
 * - Pinned context panels for element properties
 * - Form field creation (inputs, selects, checkboxes)
 * - Property editing UI components
 */

// === Types ===
export type { PinnedContextPanel } from './types.js';
export {
  getPinnedContextPanels,
  addPinnedContextPanel,
  removePinnedContextPanel,
  clearPinnedContextPanels,
  nextPinnedContextSeq,
  getPinnedContextPanelCount,
} from './types.js';

// === Field Utilities ===
export {
  createFieldLabel,
  createInlineField,
  createInputRow,
  createTextInputRow,
  createSelectRow,
  createCheckboxRow,
} from './fields.js';

// === Properties Renderer ===
export {
  type PropertiesSceneData,
  type PropertiesCallbacks,
  createInputRow as createPropertyInputRow,
  renderPropertiesFor,
} from './properties.js';

// === Pinned Panel Creator ===
export {
  type PinnedPanelSceneData,
  type PinnedPanelCallbacks,
  type PinnedPanelElements,
  createPinnedContextPanel,
  refreshPinnedContextPanels,
} from './pinnedPanel.js';
