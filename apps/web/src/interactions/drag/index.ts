/**
 * Drag Module Barrel Exports
 *
 * Re-exports all drag handling functionality from a single entry point.
 */

export {
  type SceneData,
  type DragApplyConfig,
  type DragApplyResult,
  GEOMETRY_DRAG_TYPES,
  BUILDING_MIN_SIZE,
} from './types.js';

export {
  applyDrag,
  shouldLiveUpdateMap,
  setBarrierFromMidpointAndRotation,
} from './handlers.js';
