/**
 * Compute Orchestration Module Barrel Exports
 *
 * Re-exports all compute orchestration functionality from a single entry point.
 */

// Types
export type {
  UIScene,
  SceneOrigin,
  Bounds,
  DragContribution,
  ComputeState,
  MapComputeState,
  ComputeCallbacks,
  MapCallbacks,
  BuildEngineSceneConfig,
  ComputeContext,
  IncrementalComputeContext,
} from './types.js';

// Scene building
export {
  buildEngineScene,
  buildSingleSourceScene,
  getSceneBounds,
  buildPanelPayload,
  isStaleError,
} from './scene.js';

// Receiver computation
export type { ComputeReceiversResult } from './receivers.js';
export {
  computeReceivers,
  computeReceiverEnergies,
  applyReceiverDelta,
} from './receivers.js';

// Panel computation
export type { ComputePanelResult } from './panels.js';
export {
  computePanel,
  computePanelEnergies,
  applyPanelDelta,
  updatePanelResult,
} from './panels.js';

// Incremental computation
export {
  createDragContribution,
  receiverBaselineReady,
  panelBaselineReady,
  primeReceiverContribution,
  primePanelContribution,
  computeReceiversIncremental,
  computePanelIncremental,
} from './incremental.js';
