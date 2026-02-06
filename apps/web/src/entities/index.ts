/**
 * Entity exports for GeoNoise
 * Re-exports all entity types and classes from a single entry point
 */

export { Building, type BuildingData, DEFAULT_BUILDING_COLOR, BUILDING_MIN_SIZE, BUILDING_HANDLE_RADIUS, BUILDING_HANDLE_HIT_RADIUS, BUILDING_ROTATION_HANDLE_OFFSET_PX, BUILDING_ROTATION_HANDLE_RADIUS, duplicateBuilding } from './building.js';

export { type Barrier, BARRIER_HANDLE_RADIUS, BARRIER_HANDLE_HIT_RADIUS, BARRIER_ROTATION_HANDLE_OFFSET_PX, BARRIER_ROTATION_HANDLE_RADIUS, BARRIER_MIN_LENGTH, getBarrierMidpoint, getBarrierLength, getBarrierRotation, getBarrierRotationHandlePosition, setBarrierFromMidpointAndRotation, createBarrier, duplicateBarrier, type CreateBarrierOptions, BARRIER_DEFAULT_HEIGHT } from './barrier.js';

export { type Point, type Source, type Receiver, type Panel, type Probe } from './types.js';

// Source factory and utilities
export {
  createSource,
  duplicateSource,
  type CreateSourceOptions,
  SOURCE_DEFAULT_Z,
  SOURCE_DEFAULT_POWER,
  SOURCE_DEFAULT_GAIN,
} from './source.js';

// Receiver factory and utilities
export {
  createReceiver,
  duplicateReceiver,
  type CreateReceiverOptions,
  RECEIVER_DEFAULT_Z,
} from './receiver.js';

// Panel factory and utilities
export {
  createPanel,
  duplicatePanel,
  getPanelCenter,
  type CreatePanelOptions,
  PANEL_DEFAULT_SIZE,
  PANEL_DEFAULT_ELEVATION,
  PANEL_DEFAULT_RESOLUTION,
  PANEL_DEFAULT_POINT_CAP,
} from './panel.js';

// Probe factory and utilities
export {
  createProbe,
  duplicateProbe,
  type CreateProbeOptions,
  PROBE_DEFAULT_Z,
} from './probe.js';
