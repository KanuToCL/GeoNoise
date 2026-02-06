/**
 * Rendering Module Barrel Exports
 *
 * Re-exports all rendering functionality from a single entry point.
 */

// Types
export {
  type RenderContext,
  type LayerVisibility,
  type HandleOptions,
  type LineOptions,
  type SelectionState,
  type LabelOptions,
  type BadgeOptions,
  type DimensionBox,
} from './types.js';

// Primitives
export {
  drawLine,
  drawHandle,
  drawCircle,
  drawSelectionHalo,
  drawPolygon,
  drawPolyline,
  drawLabel,
  drawBadge,
  drawDimensionBox,
  drawDashedRect,
  drawTriangle,
} from './primitives.js';

// Grid
export { GRID_STEP_METERS, drawGrid } from './grid.js';

// Noise Map
export {
  type NoiseMapRenderData,
  drawNoiseMap,
  isNoiseMapValid,
} from './noiseMap.js';

// Sources
export {
  SOURCE_RADIUS,
  SOURCE_HALO_RADIUS,
  SOURCE_RING_RADIUS,
  type SourceRenderOptions,
  drawSource,
  drawSources,
} from './sources.js';

// Receivers
export {
  RECEIVER_SIZE,
  RECEIVER_HALO_RADIUS,
  RECEIVER_RING_RADIUS,
  type ReceiverResultData,
  drawReceiver,
  drawReceivers,
  drawReceiverBadges,
} from './receivers.js';

// Barriers
export {
  type BarrierDraftData,
  type BarrierCenterDraftData,
  drawBarrier,
  drawBarriers,
  drawBarrierDraft,
  drawBarrierCenterDraft,
} from './barriers.js';

// Buildings
export {
  type BuildingDraftData,
  type BuildingCenterDraftData,
  drawBuilding,
  drawBuildings,
  drawBuildingDraft,
  drawBuildingCenterDraft,
  drawBuildingPolygonDraft,
} from './buildings.js';

// Probes
export { drawProbe, drawProbes } from './probes.js';

// Panels
export {
  type PanelSamplePoint,
  type SampleColor,
  colorToCss,
  panelSampleRatio,
  getSampleColor,
  drawPanel,
  drawPanels,
  drawPanelSamples,
} from './panels.js';

// Measurement
export {
  distance,
  drawMeasurement,
  drawSelectBox,
} from './measure.js';
