/**
 * Interaction Module Barrel Exports
 *
 * Unified module for all user interaction handling:
 * - events/   — raw DOM event handlers (pointer, keyboard, wheel)
 * - shortcuts — shortcut definitions and matching logic
 * - hitTest   — entity hit detection
 * - drag/     — drag-and-drop handlers
 * - tools/    — tool-specific interaction state (measure, etc.)
 */

// Event handlers (raw DOM wiring)
export {
  type WheelContext,
  type WheelCallbacks,
  type KeyboardContext,
  type KeyboardCallbacks,
  handleWheel,
  wireWheel,
  handleKeyDown,
  wireKeyboard,
} from './events/keyboard.js';

export {
  type BarrierDrawingMode,
  type BuildingDrawingMode,
  type PanState,
  type BarrierDraft,
  type BarrierCenterDraft,
  type BuildingDraft,
  type BuildingCenterDraft,
  type PointerContext,
  type PointerCallbacks,
  handlePointerMove,
  handlePointerDown,
  handlePointerLeave,
} from './events/pointer.js';

// Shortcut definitions and matching
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
} from './shortcuts.js';

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

// Tool-specific interactions
export {
  getMeasureStart,
  getMeasureEnd,
  isMeasureLocked,
  setMeasureStart,
  setMeasureEnd,
  setMeasureLocked,
  startMeasurement,
  updateMeasurement,
  lockMeasurement,
  clearMeasurement,
  hasMeasurement,
  getMeasurePoints,
} from './tools/index.js';
