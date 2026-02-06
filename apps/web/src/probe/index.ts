/**
 * Probe Module
 *
 * Barrel exports for the acoustic probe subsystem.
 *
 * This module handles:
 * - Probe worker communication for acoustic calculations
 * - Frequency response chart rendering
 * - Probe inspector panel
 * - Pinned probe monitors (live)
 * - Frozen probe snapshots
 * - Ray visualization for path analysis
 */

// === Types ===
export type { PinnedProbePanel, ProbeSnapshot, ProbeStateSnapshot } from './types.js';
export {
  // State accessors
  getActiveProbeId,
  setActiveProbeId,
  getProbeResults,
  getProbeResult,
  setProbeResult,
  deleteProbeResult,
  isProbePending,
  addProbePending,
  deleteProbePending,
  getProbePendingIds,
  getPinnedProbePanels,
  getPinnedProbePanel,
  setPinnedProbePanel,
  deletePinnedProbePanel,
  hasPinnedProbePanel,
  getProbeSnapshots,
  addProbeSnapshot,
  removeProbeSnapshot,
  nextSnapshotSeq,
  getInspectorZIndex,
  incrementInspectorZIndex,
  INSPECTOR_MAX_ZINDEX,
  // Snapshot operations
  snapshotProbeState,
  restoreProbeState,
  pruneProbeData,
  cloneProbeData,
} from './types.js';

// === Worker ===
export type { ProbeSceneData, ProbeConfig } from './worker.js';
export {
  initProbeWorker,
  setProbeResultHandler,
  buildProbeRequest,
  calculateProbeStub,
  sendProbeRequest,
  createThrottledProbeUpdate,
  requestProbeUpdates,
} from './worker.js';

// === Chart ===
export type { ChartTheme, ReadCssVar } from './chart.js';
export { resizeProbeCanvas, renderProbeChartOn } from './chart.js';

// === Panels ===
export {
  getInspectorMinTop,
  clampPanelToParent,
  bringPanelToFront,
  makePanelDraggable,
} from './panels.js';

// === Inspector ===
export type { ProbeInspectorElements, RenderProbeInspectorOptions } from './inspector.js';
export {
  setActiveProbe,
  getActiveProbe,
  renderProbeInspector,
  resizeProbeChart,
  renderProbeChart,
  getLiveProbeIds,
} from './inspector.js';

// === Pinning ===
export type { CreatePinnedProbePanelOptions } from './pinning.js';
export {
  getProbeStatusLabel,
  renderPinnedProbePanel,
  renderPinnedProbePanels,
  createPinnedProbePanel,
  removePinnedProbe,
  clearPinnedProbes,
  prunePinnedProbes,
} from './pinning.js';

// === Snapshots ===
export type { CreateProbeSnapshotOptions } from './snapshots.js';
export { renderProbeSnapshots, createProbeSnapshot } from './snapshots.js';

// === Ray Visualization ===
export type { RayVizElements, RayVizData, WorldToCanvas } from './rays.js';
export {
  getCurrentTracedPaths,
  setCurrentTracedPaths,
  clearTracedPaths,
  getPathIcon,
  getPathLabel,
  renderRayVisualizationPanel,
  disableRayVisualization,
  drawTracedRays,
} from './rays.js';
