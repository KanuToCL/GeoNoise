/**
 * Interactions Module Barrel Exports
 *
 * Re-exports all interaction handling modules from a single entry point.
 */

// Hit testing
export {
  type PanelHandleHit,
  type BarrierHandleHit,
  type BuildingHandleHit,
  hitTest,
  hitTestPanelHandle,
  hitTestBarrierHandle,
  hitTestBuildingHandle,
  getPolygonCentroid,
  getElementsInSelectBox,
  isElementSelected,
  selectionToItems,
  itemsToSelection,
  getSelectedCount,
} from './hitTest.js';

// Keyboard shortcuts
export {
  type KeyboardShortcut,
  type ToolShortcut,
  type KeyboardHandlers,
  TOOL_SHORTCUTS,
  COMMAND_SHORTCUTS,
  isEditableTarget,
  shouldSuppressShortcut,
  matchesShortcut,
  getToolForKey,
  createKeyboardHandler,
} from './keyboard.js';

// Drag handling
export {
  type SceneData,
  type DragApplyConfig,
  type DragApplyResult,
  GEOMETRY_DRAG_TYPES,
  BUILDING_MIN_SIZE,
  applyDrag,
  shouldLiveUpdateMap,
  setBarrierFromMidpointAndRotation,
} from './drag/index.js';
