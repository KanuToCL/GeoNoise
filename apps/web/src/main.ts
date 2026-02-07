import {
  detectWebGPU,
  loadPreference,
  resolveBackend,
  savePreference,
  type ComputePreference,
} from './computePreference.js';
import {
  applyTheme,
  getSavedTheme,
  isNeumorphismAllowed,
  saveTheme,
  type Theme,
} from './theme.js';
import { initMapboxUI, syncMapToCanvasZoom, syncMapToCanvasPan, isMapVisible, isMapInteractive } from './mapboxUI.js';
import { engineCompute } from '@geonoise/engine-backends';
import { createEmptyScene, type EngineConfig, type PropagationConfig } from '@geonoise/core';
import {
  getDefaultEngineConfig,
  type ComputeGridResponse,
  type ComputePanelResponse,
  type ComputeReceiversResponse,
  type ProbeResult,
} from '@geonoise/engine';
import {
  Building,
  type BuildingData,
  BUILDING_MIN_SIZE,
  BUILDING_HANDLE_HIT_RADIUS,
  BUILDING_ROTATION_HANDLE_OFFSET_PX,
  type Barrier,
  BARRIER_HANDLE_HIT_RADIUS,
  BARRIER_ROTATION_HANDLE_OFFSET_PX,
  getBarrierMidpoint,
  getBarrierLength,
  getBarrierRotation,
  getBarrierRotationHandlePosition,
  setBarrierFromMidpointAndRotation,
  type Source,
  type Receiver,
  type Panel,
  type Probe,
  duplicateSource as duplicateSourceEntity,
  duplicateReceiver as duplicateReceiverEntity,
  duplicatePanel as duplicatePanelEntity,
  duplicateProbe as duplicateProbeEntity,
  duplicateBarrier as duplicateBarrierEntity,
  duplicateBuilding as duplicateBuildingEntity,
  getPanelCenter,
} from './entities/index.js';


import {
  panelId,
  MIN_LEVEL,
  createFlatSpectrum,
  calculateOverallLevel,
  type Spectrum9,
  type FrequencyWeighting,
} from '@geonoise/shared';
import { buildCsv } from './export.js';
import type { SceneResults, PanelResult } from './export.js';
import { formatLevel, formatMeters } from './format.js';
import {
  distance,
  distanceToSegment,
  isValidQuadrilateral,
  ensureCCW,
  pointInPolygon,
  getSampleColor,
  colorToCss,
  buildSmoothLegendStops,
  throttle,
  calculateSpeedOfSound,
  niceDistance,
  dbToEnergy,
  energyToDb,
  createId,
} from './utils/index.js';

// === Probe Module ===
import {
  // Types
  type ProbeSceneData,
  type ProbeConfig,
  type ProbeInspectorElements,
  type RayVizElements,
  // State
  getActiveProbeId,
  setActiveProbeId,
  getProbeResult,
  deleteProbeResult,
  getPinnedProbePanels,
  hasPinnedProbePanel,
  cloneProbeData,
  pruneProbeData,
  // Worker
  sendProbeRequest as sendProbeRequestFromModule,
  setProbeResultHandler,
  // Panels
  bringPanelToFront,
  makePanelDraggable,
  // Pinning
  renderPinnedProbePanel as renderPinnedProbePanelFromModule,
  createPinnedProbePanel as createPinnedProbePanelFromModule,
  removePinnedProbe as removePinnedProbeFromModule,
  // Snapshots
  renderProbeSnapshots as renderProbeSnapshotsFromModule,
  createProbeSnapshot as createProbeSnapshotFromModule,
  // Rays
  clearTracedPaths,
  disableRayVisualization as disableRayVisualizationFromModule,
  drawTracedRays as drawTracedRaysFromModule,
  // Inspector
  renderProbeInspector as renderProbeInspectorFromModule,
  resizeProbeChart as resizeProbeChartFromModule,
} from './probe/index.js';

// === Spectrum UI Module ===
import {
  createSpectrumEditor as createSpectrumEditorModule,
} from './ui/spectrum/index.js';

// === Propagation Controls Module ===
import {
  type PropagationElements,
  type MeteoElements,
  type PropagationCallbacks,
  updatePropagationControls as updatePropagationControlsModule,
  wirePropagationControls as wirePropagationControlsModule,
} from './ui/panels/propagation.js';

// === Context Panel Properties Module ===
import {
  type PropertiesCallbacks,
  renderPropertiesFor as renderPropertiesForModule,
} from './ui/contextPanel/properties.js';

// === Context Panel Pinned Panel Module ===
import {
  type PinnedPanelCallbacks,
  type PinnedPanelElements,
  createPinnedContextPanel as createPinnedContextPanelModule,
  refreshPinnedContextPanels as refreshPinnedContextPanelsModule,
} from './ui/contextPanel/pinnedPanel.js';

// === Sources List Module ===
import {
  type SourcesContext,
  type SourcesCallbacks,
  renderSources as renderSourcesModule,
} from './ui/sources.js';

// === Settings Module ===
import {
  type MapSettingsElements,
  type MapSettingsState,
  type MapSettingsCallbacks,
  type DisplaySettingsElements,
  type DisplaySettingsState,
  type DisplaySettingsCallbacks,
  updateMapSettingsControls as updateMapSettingsControlsModule,
  wireMapSettings as wireMapSettingsModule,
  wireDisplaySettings as wireDisplaySettingsModule,
} from './ui/settings.js';

// === Equations Module ===
import {
  type EquationElements,
  rerenderKatex,
  updateAllEquations as updateAllEquationsModule,
  wireEquationCollapsibles as wireEquationCollapsiblesModule,
} from './ui/equations.js';

// === Modals Module ===
import {
  closeAbout as closeAboutModule,
  wireAboutModal as wireAboutModalModule,
  wireAuthorModal as wireAuthorModalModule,
  wireCollapsibleSections as wireCollapsibleSectionsModule,
} from './ui/modals/about.js';

// === Toolbar Module ===
import {
  showDrawingModeSubmenu as showDrawingModeSubmenuModule,
} from './ui/toolbar.js';

// === Pointer Handlers Module ===
import {
  type PointerContext,
  type PointerCallbacks,
  handlePointerMove as handlePointerMoveModule,
  handlePointerDown as handlePointerDownModule,
  handlePointerLeave as handlePointerLeaveModule,
} from './interaction/pointer.js';

// === Keyboard/Wheel Handlers Module ===
import {
  type WheelContext,
  type WheelCallbacks,
  type KeyboardContext,
  type KeyboardCallbacks,
  handleWheel as handleWheelModule,
  handleKeyDown as handleKeyDownModule,
} from './interaction/keyboard.js';

import {
  type Point,
  type DisplayBand,
  OCTAVE_BAND_LABELS,
  type Tool,
  type SelectionItem,
  type Selection,
  type DragState,
  type DragContribution,
  type NoiseMap,
  type MapRange,
  type MapRenderStyle,
  type CanvasTheme,
  sameSelection,
} from './types/index.js';
import {
  ENABLE_RAY_VISUALIZATION,
  ENABLE_MAPBOX,
  DEFAULT_MAP_RANGE,
  DEFAULT_MAP_BAND_STEP,
  DEFAULT_MAP_BAND_STEP_PERBAND,
  RES_HIGH,
  RES_LOW,
  REFINE_POINTS,
  STATIC_POINTS,
  DRAG_POINTS,
  DRAG_FRAME_MS,
  PROBE_DEFAULT_Z,
  CANVAS_HELP_KEY,
} from './constants.js';
import {
  drawGrid as drawGridModule,
  drawNoiseMap as drawNoiseMapModule,
  drawSources as drawSourcesModule,
  drawReceivers as drawReceiversModule,
  drawReceiverBadges as drawReceiverBadgesModule,
  drawProbes as drawProbesModule,
  drawPanels as drawPanelsModule,
  drawPanelSamples as drawPanelSamplesModule,
  drawBarriers as drawBarriersModule,
  drawBarrierDraft,
  drawBarrierCenterDraft,
  drawBuildings as drawBuildingsModule,
  drawBuildingDraft,
  drawBuildingCenterDraft,
  drawBuildingPolygonDraft as drawBuildingPolygonDraftModule,
  drawMeasurement as drawMeasurementModule,
  drawSelectBox as drawSelectBoxModule,
} from './rendering/index.js';
import {
  nextSequence,
  downloadScene as downloadSceneModule,
  openSceneFile,
  calculateSequences,
  type DeserializedScene,
} from './io/index.js';
import {
  getGridCounts,
  computeMapRange,
  mergeBounds,
  buildBandedLegendLabels,
} from './compute/index.js';
import { shouldLiveUpdateMap } from './interactions/index.js';
import {
  isElementSelected,
  selectionToItems,
  itemsToSelection,
  getSelectedCount,
  selectionTypeLabel,
  toolLabel,
  isSourceEnabled,
} from './state/index.js';

const canvasEl = document.querySelector<HTMLCanvasElement>('#mapCanvas');
const debugX = document.querySelector('#debug-x') as HTMLSpanElement | null;
const debugY = document.querySelector('#debug-y') as HTMLSpanElement | null;
const debugMode = document.querySelector('#debug-mode') as HTMLSpanElement | null;
const debugLayer = document.querySelector('#debug-layer') as HTMLSpanElement | null;
const refineButton = document.querySelector('#refineButton') as HTMLButtonElement | null;
const computeButton = document.querySelector('#computeButton') as HTMLButtonElement | null;
const meshButton = document.querySelector('#meshButton') as HTMLButtonElement | null;
const saveButton = document.querySelector('#saveButton') as HTMLButtonElement | null;
const loadButton = document.querySelector('#loadButton') as HTMLButtonElement | null;
const sceneNameInput = document.querySelector('#sceneName') as HTMLInputElement | null;
const sceneDot = document.querySelector('#sceneDot') as HTMLSpanElement | null;
const sceneStatusLabel = document.querySelector('#sceneStatusLabel') as HTMLSpanElement | null;
const computeChip = document.querySelector('#computeChip') as HTMLDivElement | null;
const mapToast = document.querySelector('#mapToast') as HTMLDivElement | null;
const rulerLabel = document.querySelector('#rulerLabel') as HTMLDivElement | null;
const rulerLine = document.querySelector('#rulerLine') as HTMLDivElement | null;
const scaleText = document.querySelector('#scaleText') as HTMLDivElement | null;
const scaleLine = document.querySelector('#scaleLine') as HTMLDivElement | null;
const preferenceSelect = document.querySelector('#computePreference') as HTMLSelectElement | null;
const themeOptions = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-theme-option]'));
const toolGrid = document.querySelector('#toolGrid') as HTMLDivElement | null;
const dock = document.querySelector('#dock') as HTMLDivElement | null;
const dockFab = document.querySelector('#dockFab') as HTMLButtonElement | null;
const dockExpandable = document.querySelector('#dockExpandable') as HTMLDivElement | null;
const dockLabelStage = document.querySelector('#dockLabelStage') as HTMLDivElement | null;
const dockLabelText = document.querySelector('#dockLabelText') as HTMLSpanElement | null;
const contextTitle = document.querySelector('#contextTitle') as HTMLDivElement | null;
const selectionHint = document.querySelector('#selectionHint') as HTMLDivElement | null;
const modeLabel = document.querySelector('#modeLabel') as HTMLSpanElement | null;
const propertiesBody = document.querySelector('#propertiesBody') as HTMLDivElement | null;
const contextPanel = document.querySelector('#contextPanel') as HTMLDivElement | null;
const contextHeader = document.querySelector('#contextHeader') as HTMLDivElement | null;
const contextClose = document.querySelector('#contextClose') as HTMLButtonElement | null;
const contextPin = document.querySelector('#contextPin') as HTMLButtonElement | null;
const probePanel = document.querySelector('#probePanel') as HTMLDivElement | null;
const probeTitle = document.querySelector('#probeTitle') as HTMLSpanElement | null;
const probeClose = document.querySelector('#probeClose') as HTMLButtonElement | null;
const probeFreeze = document.querySelector('#probeFreeze') as HTMLButtonElement | null;
const probePin = document.querySelector('#probePin') as HTMLButtonElement | null;
const probeStatus = document.querySelector('#probeStatus') as HTMLSpanElement | null;
const probeChart = document.querySelector('#probeChart') as HTMLCanvasElement | null;
const rayVizCard = document.querySelector('#rayVizCard') as HTMLDivElement | null;
const rayVizToggle = document.querySelector('#rayVizToggle') as HTMLInputElement | null;
const rayVizPaths = document.querySelector('#rayVizPaths') as HTMLDivElement | null;
const rayVizPhaseInfo = document.querySelector('#rayVizPhaseInfo') as HTMLDivElement | null;
const rayVizDominant = document.querySelector('#rayVizDominant') as HTMLDivElement | null;

// Hide ray visualization if feature flag is disabled
if (!ENABLE_RAY_VISUALIZATION && rayVizCard) {
  rayVizCard.style.display = 'none';
}

const sourceTable = document.querySelector('#sourceTable') as HTMLDivElement | null;
const sourceSumMode = document.querySelector('#sourceSumMode') as HTMLDivElement | null;
const receiverTable = document.querySelector('#receiverTable') as HTMLDivElement | null;
const panelStats = document.querySelector('#panelStats') as HTMLDivElement | null;
const panelLegend = document.querySelector('#panelLegend') as HTMLDivElement | null;
const panelStatsSection = document.querySelector('#panelStatsSection') as HTMLDivElement | null;
const dbLegend = document.querySelector('#dbLegend') as HTMLDivElement | null;
const dbLegendGradient = document.querySelector('#dbLegendGradient') as HTMLDivElement | null;
const dbLegendLabels = document.querySelector('#dbLegendLabels') as HTMLDivElement | null;
const mapRenderStyleToggle = document.querySelector('#mapRenderStyle') as HTMLInputElement | null;
const mapBandStepRow = document.querySelector('#mapBandStepRow') as HTMLDivElement | null;
const mapBandStepInput = document.querySelector('#mapBandStep') as HTMLInputElement | null;
const mapAutoScaleToggle = document.querySelector('#mapAutoScale') as HTMLInputElement | null;
const layersButton = document.querySelector('#layersButton') as HTMLButtonElement | null;
const layersPopover = document.querySelector('#layersPopover') as HTMLDivElement | null;
const settingsButton = document.querySelector('#settingsButton') as HTMLButtonElement | null;
const settingsPopover = document.querySelector('#settingsPopover') as HTMLDivElement | null;
const exportCsv = document.querySelector('#exportCsv') as HTMLButtonElement | null;
const snapIndicator = document.querySelector('#snapIndicator') as HTMLDivElement | null;
const canvasHelp = document.querySelector('#canvasHelp') as HTMLDivElement | null;
const canvasHelpButton = document.querySelector('#canvasHelpButton') as HTMLButtonElement | null;
const canvasHelpTooltip = document.querySelector('#canvasHelpTooltip') as HTMLDivElement | null;
const canvasHelpDismiss = document.querySelector('#canvasHelpDismiss') as HTMLButtonElement | null;
const uiLayer = document.querySelector('.ui-layer') as HTMLDivElement | null;

const undoButton = document.querySelector('#undoButton') as HTMLButtonElement | null;
const redoButton = document.querySelector('#redoButton') as HTMLButtonElement | null;

const aboutButton = document.querySelector('#aboutButton') as HTMLButtonElement | null;
const aboutModal = document.querySelector('#aboutModal') as HTMLDivElement | null;
const aboutClose = document.querySelector('#aboutClose') as HTMLButtonElement | null;
const authorButton = document.querySelector('#authorButton') as HTMLButtonElement | null;
const authorModal = document.querySelector('#authorModal') as HTMLDivElement | null;
const authorClose = document.querySelector('#authorClose') as HTMLButtonElement | null;
const aboutTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-about-tab]'));
const aboutPanels = Array.from(document.querySelectorAll<HTMLDivElement>('[data-about-panel]'));
const actionSecondary = document.querySelector('#actionSecondary') as HTMLDivElement | null;
const actionOverflowToggle = document.querySelector('#actionOverflowToggle') as HTMLButtonElement | null;

const propagationSpreading = document.querySelector('#propagationSpreading') as HTMLSelectElement | null;
const propagationAbsorption = document.querySelector('#propagationAbsorption') as HTMLSelectElement | null;
const propagationGroundReflection = document.querySelector('#propagationGroundReflection') as HTMLInputElement | null;
const propagationGroundModel = document.querySelector('#propagationGroundModel') as HTMLSelectElement | null;
const propagationGroundType = document.querySelector('#propagationGroundType') as HTMLSelectElement | null;
const propagationGroundMixedSigmaModel = document.querySelector('#propagationGroundMixedSigmaModel') as HTMLSelectElement | null;
const propagationGroundMixedSigmaModelRow = document.querySelector('#propagationGroundMixedSigmaModelRow') as HTMLLabelElement | null;
const propagationMaxDistance = document.querySelector('#propagationMaxDistance') as HTMLInputElement | null;
const propagationGroundDetails = document.querySelector('#propagationGroundDetails') as HTMLDivElement | null;
const propagationGroundHelp = document.querySelector('#propagationGroundHelp') as HTMLDivElement | null;
const propagationGroundModelHelp = document.querySelector('#propagationGroundModelHelp') as HTMLDivElement | null;
const propagationBarrierSideDiffraction = document.querySelector('#propagationBarrierSideDiffraction') as HTMLSelectElement | null;

// Profile selector controls
const calculationProfile = document.querySelector('#calculationProfile') as HTMLSelectElement | null;
const settingsProfileIndicator = document.querySelector('#settingsProfileIndicator') as HTMLSpanElement | null;

// Probe Engine controls
const probeGroundReflection = document.querySelector('#probeGroundReflection') as HTMLInputElement | null;
const probeWallReflections = document.querySelector('#probeWallReflections') as HTMLInputElement | null;
const probeBarrierDiffraction = document.querySelector('#probeBarrierDiffraction') as HTMLInputElement | null;
const probeSommerfeldCorrection = document.querySelector('#probeSommerfeldCorrection') as HTMLInputElement | null;
const probeImpedanceModel = document.querySelector('#probeImpedanceModel') as HTMLSelectElement | null;
const probeGroundModel = document.querySelector('#probeGroundModel') as HTMLSelectElement | null;

// Equation display elements
const groundModelEquation = document.querySelector('#groundModelEquation') as HTMLDivElement | null;
const impedanceEquation = document.querySelector('#impedanceEquation') as HTMLDivElement | null;

// Environmental Conditions (meteo) controls
const meteoTemperature = document.querySelector('#meteoTemperature') as HTMLInputElement | null;
const meteoHumidity = document.querySelector('#meteoHumidity') as HTMLInputElement | null;
const meteoPressure = document.querySelector('#meteoPressure') as HTMLInputElement | null;
const derivedSpeedOfSound = document.querySelector('#derivedSpeedOfSound') as HTMLDivElement | null;

const layerSources = document.querySelector('#layerSources') as HTMLInputElement | null;
const layerReceivers = document.querySelector('#layerReceivers') as HTMLInputElement | null;
const layerPanels = document.querySelector('#layerPanels') as HTMLInputElement | null;
const layerNoiseMap = document.querySelector('#layerNoiseMap') as HTMLInputElement | null;
const layerGrid = document.querySelector('#layerGrid') as HTMLInputElement | null;
const displayWeightingSelect = document.querySelector('#displayWeighting') as HTMLSelectElement | null;
const displayBandSelect = document.querySelector('#displayBand') as HTMLSelectElement | null;

const countSources = document.querySelector('#countSources') as HTMLSpanElement | null;
const countReceivers = document.querySelector('#countReceivers') as HTMLSpanElement | null;
const countPanels = document.querySelector('#countPanels') as HTMLSpanElement | null;

if (!canvasEl) {
  throw new Error('Canvas element missing');
}

const ctxEl = canvasEl.getContext('2d');
if (!ctxEl) {
  throw new Error('Canvas context missing');
}
const canvas = canvasEl;
const ctx = ctxEl;
const probeChartCtx = probeChart?.getContext('2d') ?? null;

let resizeRaf: number | null = null;
const resizeObserver = new ResizeObserver(() => {
  if (resizeRaf !== null) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null;
    resizeCanvas();
  });
});
resizeObserver.observe(canvas.closest('.canvas-frame') ?? canvas);

const capability = detectWebGPU();
const origin = { latLon: { lat: 0, lon: 0 }, altitude: 0 };

// =============================================================================
// DEMO SCENE: SOURCE SURROUNDED BY BUILDINGS
// =============================================================================
// A clean courtyard-style scene with sources surrounded by buildings,
// creating interesting reflections, shadows, and acoustic patterns.
// =============================================================================

const scene = {
  sources: [
    // Central source surrounded by buildings - creates interesting reflections
    { id: 's1', name: 'Source S1', x: 0, y: 0, z: 1.5, power: 100, spectrum: createFlatSpectrum(100) as Spectrum9, gain: 0, enabled: true },
  ] as Source[],
  receivers: [
    // R1: Inside the courtyard near S1
    { id: 'r1', x: 25, y: 15, z: 1.5 },
    // R2: Outside the courtyard, partially shielded
    { id: 'r2', x: -50, y: -30, z: 1.5 },
  ] as Receiver[],
  panels: [
    // Large measure grid covering the courtyard and surrounding area
    {
      id: 'p1',
      points: [
        { x: -20, y: 55 },
        { x: 55, y: 55 },
        { x: 55, y: -35 },
        { x: -20, y: -35 },
      ],
      elevation: 1.5,
      sampling: { resolution: 6, pointCap: 400 },
    },
  ] as Panel[],
  probes: [
    // Probe in the courtyard to show reflections and interference
    { id: 'pr1', x: 20, y: 10, z: 1.7 },
  ] as Probe[],
  buildings: [
    // Buildings surrounding the central source in a courtyard arrangement
    // Top building
    new Building({ id: 'bd1', x: 0, y: 40, width: 25, height: 10, rotation: 0, z_height: 12 }),
    // Right building
    new Building({ id: 'bd2', x: 40, y: 10, width: 10, height: 30, rotation: 0, z_height: 10 }),
    // Bottom building
    new Building({ id: 'bd3', x: 5, y: -25, width: 20, height: 8, rotation: 0.1, z_height: 8 }),
    // Left building
    new Building({ id: 'bd4', x: -30, y: 5, width: 8, height: 25, rotation: 0, z_height: 14 }),
    // Additional building in upper right
    new Building({ id: 'bd5', x: 60, y: 30, width: 12, height: 10, rotation: -0.15, z_height: 6 }),
  ] as Building[],
  barriers: [
    // Barrier to the left of S1, between source and left building
    {
      id: 'bar1',
      p1: { x: -15, y: 15 },
      p2: { x: -15, y: -15 },
      height: 3,
    },
  ] as Barrier[],
};

const layers = {
  sources: true,
  receivers: true,
  panels: true,
  noiseMap: false,
  grid: false,
};

let pixelsPerMeter = 3;
let activeTool: Tool = 'select';
let selection: Selection = { type: 'none' };
const activeProbeId: string | null = null;
let hoverSelection: Selection | null = null;
// Pinned context panels - interactive inspector panels for non-probe elements
type PinnedContextPanel = {
  selection: Selection;
  panel: HTMLElement;
  propertiesContainer: HTMLElement;
  legendContainer?: HTMLElement; // For grid panels
  statsContainer?: HTMLElement; // For grid panels
};
const pinnedContextPanels: PinnedContextPanel[] = [];
let dragState: DragState = null;
let measureStart: Point | null = null;
let measureEnd: Point | null = null;
let measureLocked = false;
// Barrier tool workflow:
// - First click anchors p1 (start).
// - Drag or move to preview p2 (end) as a dashed line.
// - Mouse up commits if distance is non-trivial; otherwise waits for a second click.
// This mirrors "click to start, drag/click to finish" while still allowing click+click creation.
let barrierDraft: { p1: Point; p2: Point } | null = null;
let barrierDraftAnchored = false;
let barrierDragActive = false;

// Building tool workflow:
// - First click anchors corner1.
// - Drag or move to preview corner2 as a dashed rectangle with dimensions.
// - Mouse up commits if size is non-trivial.
// This allows drag-to-size building creation with real-time dimension display.
let buildingDraft: { corner1: Point; corner2: Point } | null = null;
let buildingDraftAnchored = false;
let buildingDragActive = false;

// Drawing modes for building and barrier tools
// - 'diagonal': Click corner, drag to opposite corner (default for buildings)
// - 'center': Click center, drag outward symmetrically
// - 'end-to-end': Click start, click/drag to end (default for barriers)
type BuildingDrawingMode = 'diagonal' | 'center' | 'polygon';
type BarrierDrawingMode = 'end-to-end' | 'center';
let buildingDrawingMode: BuildingDrawingMode = 'diagonal';
let barrierDrawingMode: BarrierDrawingMode = 'end-to-end';

// For center-outward mode, we store the center point
let buildingCenterDraft: { center: Point; corner: Point } | null = null;
let barrierCenterDraft: { center: Point; end: Point } | null = null;

// For polygon mode, we store clicked corners (up to 4)
let buildingPolygonDraft: Point[] = [];
let buildingPolygonPreviewPoint: Point | null = null;

const results: SceneResults = { receivers: [], panels: [] };
let noiseMap: NoiseMap | null = null;
let currentMapRange: MapRange | null = null;
let mapRenderStyle: MapRenderStyle = 'Smooth';
let mapBandStep = DEFAULT_MAP_BAND_STEP;
let mapAutoScale = true;
let receiverEnergyTotals = new Map<string, number>();
let panelEnergyTotals = new Map<string, Float64Array>();
let dragContribution: DragContribution | null = null;
let dragDirty = false;
let engineConfig: EngineConfig = getDefaultEngineConfig('festival_fast');
let aboutOpen = false;
let pendingComputes = 0;
let canvasTheme: CanvasTheme = readCanvasTheme();
let isDirty = false;
// Render loop gate to avoid redrawing a static scene.
let needsUpdate = true;
let computeToken = 0;
let activeComputeToken = 0;
let isComputing = false;
let mapComputeToken = 0;
let activeMapToken = 0;
let isMapComputing = false;
let mapToastTimer: number | null = null;
// True while we want low-res, smoothed map previews.
let interactionActive = false;
let queuedMapResolutionPx: number | null = null;

const snapMeters = 5;
let basePixelsPerMeter = 3;
let zoom = 1;
let panOffset = { x: 0, y: 0 };
let panState: { start: Point; origin: Point } | null = null;

const collapsedSources = new Set<string>();
let soloSourceId: string | null = null;

/** Current frequency weighting for display (A/C/Z) */
let displayWeighting: FrequencyWeighting = 'A';

/** Current band to display: 'overall' or band index 0-8 */
let displayBand: DisplayBand = 'overall';

type SceneSnapshot = {
  sources: Source[];
  receivers: Receiver[];
  panels: Panel[];
  probes: Probe[];
  buildings: BuildingData[];
  barriers: Barrier[];
  sourceSeq: number;
  receiverSeq: number;
  panelSeq: number;
  probeSeq: number;
  buildingSeq: number;
  barrierSeq: number;
  selection: Selection;
  activeProbeId: string | null;
  soloSourceId: string | null;
  panOffset: Point;
  zoom: number;
};

let history: SceneSnapshot[] = [];
let historyIndex = -1;

let sourceSeq = 3;
let receiverSeq = 3;
let panelSeq = 2;
let probeSeq = 1;
let buildingSeq = 2;
let barrierSeq = 1;

function getPropagationConfig(): PropagationConfig {
  if (engineConfig.propagation) return engineConfig.propagation;
  const fallback = getDefaultEngineConfig('festival_fast');
  engineConfig = { ...engineConfig, propagation: fallback.propagation };
  return engineConfig.propagation!;
}

function updatePropagationConfig(next: Partial<PropagationConfig>) {
  engineConfig = { ...engineConfig, propagation: { ...getPropagationConfig(), ...next } };
}

// Environmental conditions state (meteo)
const meteoState = {
  temperature: 20,   // °C
  humidity: 50,      // %
  pressure: 101.325, // kPa
};

/** Update the speed of sound display based on current meteo state */
function updateSpeedOfSoundDisplay() {
  if (!derivedSpeedOfSound) return;
  const speed = calculateSpeedOfSound(meteoState.temperature);
  derivedSpeedOfSound.textContent = `${speed.toFixed(1)} m/s`;
}

/** Get current meteo config for engine requests */
function getMeteoConfig() {
  return {
    temperature: meteoState.temperature,
    humidity: meteoState.humidity,
    pressure: meteoState.pressure,
  };
}

function readCssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readCanvasTheme(): CanvasTheme {
  return {
    gridLine: readCssVar('--canvas-grid'),
    measureLine: readCssVar('--canvas-measure-line'),
    measureText: readCssVar('--canvas-measure-text'),
    panelStroke: readCssVar('--canvas-panel-stroke'),
    panelFill: readCssVar('--canvas-panel-fill'),
    panelSelected: readCssVar('--canvas-panel-selected'),
    panelHandleFill: readCssVar('--canvas-panel-handle-fill'),
    panelHandleStroke: readCssVar('--canvas-panel-handle-stroke'),
    sampleStroke: readCssVar('--canvas-sample-stroke'),
    barrierStroke: readCssVar('--canvas-barrier-stroke'),
    barrierSelected: readCssVar('--canvas-barrier-selected'),
    sourceFill: readCssVar('--canvas-source-fill'),
    sourceStroke: readCssVar('--canvas-source-stroke'),
    sourceMutedFill: readCssVar('--canvas-source-muted-fill'),
    sourceMutedStroke: readCssVar('--canvas-source-muted-stroke'),
    sourceMutedText: readCssVar('--canvas-source-muted-text'),
    sourceLabel: readCssVar('--canvas-source-label'),
    sourceRing: readCssVar('--canvas-source-ring'),
    sourceTooltipBg: readCssVar('--canvas-source-tooltip-bg'),
    sourceTooltipBorder: readCssVar('--canvas-source-tooltip-border'),
    sourceTooltipText: readCssVar('--canvas-source-tooltip-text'),
    receiverFill: readCssVar('--canvas-receiver-fill'),
    receiverStroke: readCssVar('--canvas-receiver-stroke'),
    receiverLabel: readCssVar('--canvas-receiver-label'),
    receiverRing: readCssVar('--canvas-receiver-ring'),
    probeFill: readCssVar('--canvas-probe-fill'),
    probeStroke: readCssVar('--canvas-probe-stroke'),
    probeLabel: readCssVar('--canvas-probe-label'),
    probeRing: readCssVar('--canvas-probe-ring'),
    badgeBg: readCssVar('--canvas-badge-bg'),
    badgeBorder: readCssVar('--canvas-badge-border'),
    badgeText: readCssVar('--canvas-badge-text'),
    canvasBg: readCssVar('--canvas-bg'),
    selectionHalo: readCssVar('--canvas-selection-halo'),
  };
}

function refreshCanvasTheme() {
  canvasTheme = readCanvasTheme();
  renderProbeInspector();
  renderProbeSnapshots();
  requestRender();
}

function updateThemeControls(theme: Theme, allowed: boolean) {
  if (!themeOptions.length) return;
  themeOptions.forEach((button) => {
    const option = button.dataset.themeOption as Theme | undefined;
    if (!option) return;
    const isActive = option === theme;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    if (option === 'neumorphic') {
      button.classList.toggle('is-disabled', !allowed);
      button.setAttribute('aria-disabled', !allowed ? 'true' : 'false');
      if (!allowed) {
        button.setAttribute('title', 'Unavailable in high-contrast mode.');
      } else {
        button.removeAttribute('title');
      }
    }
  });
}

function applyAndPersistTheme(next: Theme) {
  const allowed = isNeumorphismAllowed();
  const resolved = next === 'neumorphic' && !allowed ? 'default' : next;
  applyTheme(resolved);
  saveTheme(resolved);
  updateThemeControls(resolved, allowed);
  refreshCanvasTheme();
}

function updateCounts() {
  if (countSources) countSources.textContent = `${scene.sources.length}`;
  if (countReceivers) countReceivers.textContent = `${scene.receivers.length}`;
  if (countPanels) countPanels.textContent = `${scene.panels.length}`;
}

function updateSceneStatus() {
  if (sceneDot) {
    sceneDot.dataset.state = isDirty ? 'dirty' : 'saved';
  }
  if (sceneStatusLabel) {
    sceneStatusLabel.textContent = isDirty ? 'Unsaved' : 'Saved';
  }
}

function markDirty() {
  if (isDirty) return;
  isDirty = true;
  updateSceneStatus();
}

function markSaved() {
  isDirty = false;
  updateSceneStatus();
}

function updateUndoRedoButtons() {
  if (undoButton) undoButton.disabled = historyIndex <= 0;
  if (redoButton) redoButton.disabled = historyIndex >= history.length - 1;
}

function snapshotScene(): SceneSnapshot {
  return {
    sources: scene.sources.map((source) => ({ ...source })),
    receivers: scene.receivers.map((receiver) => ({ ...receiver })),
    panels: scene.panels.map((panel) => ({
      ...panel,
      points: panel.points.map((pt) => ({ ...pt })),
      sampling: { ...panel.sampling },
    })),
    probes: scene.probes.map((probe) => ({ ...probe })),
    buildings: scene.buildings.map((building) => building.toData()),
    barriers: scene.barriers.map((barrier) => ({
      ...barrier,
      p1: { ...barrier.p1 },
      p2: { ...barrier.p2 },
    })),
    sourceSeq,
    receiverSeq,
    panelSeq,
    probeSeq,
    buildingSeq,
    barrierSeq,
    selection: { ...selection } as Selection,
    activeProbeId,
    soloSourceId,
    panOffset: { ...panOffset },
    zoom,
  };
}

function pushHistory(options?: { markDirty?: boolean; invalidateMap?: boolean; recalculateMap?: boolean }) {
  const snap = snapshotScene();
  history = history.slice(0, historyIndex + 1);
  history.push(snap);
  historyIndex = history.length - 1;
  updateUndoRedoButtons();
  // By default, recalculate the map if visible (keeps map on screen)
  // Use invalidateMap: true to force clear, or recalculateMap: false to skip
  if (options?.invalidateMap === true) {
    invalidateNoiseMap();
  } else if (options?.recalculateMap !== false) {
    recalculateNoiseMapIfVisible();
  }
  if (options?.markDirty !== false) {
    markDirty();
  }
}

function applySnapshot(snap: SceneSnapshot) {
  scene.sources = snap.sources.map((source) => ({ ...source }));
  scene.receivers = snap.receivers.map((receiver) => ({ ...receiver }));
  scene.panels = snap.panels.map((panel) => ({
    ...panel,
    points: panel.points.map((pt) => ({ ...pt })),
    sampling: { ...panel.sampling },
  }));
  scene.probes = snap.probes.map((probe) => ({ ...probe }));
  scene.buildings = snap.buildings.map((building) => new Building(building));
  scene.barriers = snap.barriers.map((barrier) => ({
    ...barrier,
    p1: { ...barrier.p1 },
    p2: { ...barrier.p2 },
  }));
  sourceSeq = snap.sourceSeq;
  receiverSeq = snap.receiverSeq;
  panelSeq = snap.panelSeq;
  probeSeq = snap.probeSeq;
  const probeIds = new Set(scene.probes.map((probe) => probe.id));
  pruneProbeData(probeIds);
  prunePinnedProbes();
  buildingSeq = snap.buildingSeq;
  barrierSeq = snap.barrierSeq;
  selection = snap.selection;
  setActiveProbeId(snap.activeProbeId);
  soloSourceId = snap.soloSourceId;
  panOffset = { ...snap.panOffset };
  zoom = snap.zoom;
  updatePixelsPerMeter();
  updateCounts();
  setSelection(selection);
  setActiveProbe(activeProbeId);
  updateUndoRedoButtons();
  invalidateNoiseMap();
  computeScene({ recalculateMap: false });
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  applySnapshot(history[historyIndex]);
  markDirty();
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex += 1;
  applySnapshot(history[historyIndex]);
  markDirty();
}

function updatePixelsPerMeter() {
  pixelsPerMeter = basePixelsPerMeter * zoom;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  basePixelsPerMeter = rect.width / 320;
  updatePixelsPerMeter();
  updateScaleBar();
  resizeProbeChart();
  renderProbeInspector();
  renderProbeSnapshots();
  renderPinnedProbePanels();
  requestRender();
}

function updateScaleBar() {
  if (!scaleLine || !scaleText) return;
  const linePixels = 120;
  const meters = niceDistance(linePixels / pixelsPerMeter);
  const pixels = meters * pixelsPerMeter;

  scaleLine.style.width = `${pixels}px`;
  scaleText.textContent = `${meters} m`;

  if (rulerLine) rulerLine.style.width = `${pixels}px`;
  if (rulerLabel) rulerLabel.textContent = `${meters} m`;
}

function worldToCanvas(point: Point): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.width / 2 + (point.x + panOffset.x) * pixelsPerMeter,
    y: rect.height / 2 - (point.y + panOffset.y) * pixelsPerMeter,
  };
}

function canvasToWorld(point: Point): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (point.x - rect.width / 2) / pixelsPerMeter - panOffset.x,
    y: -(point.y - rect.height / 2) / pixelsPerMeter - panOffset.y,
  };
}

function snapPoint(point: Point): { point: Point; snapped: boolean } {
  const snappedX = Math.round(point.x / snapMeters) * snapMeters;
  const snappedY = Math.round(point.y / snapMeters) * snapMeters;
  const snapped = Math.abs(point.x - snappedX) > 0.001 || Math.abs(point.y - snappedY) > 0.001;
  return { point: { x: snappedX, y: snappedY }, snapped };
}

function formatLegendLevel(value: number) {
  const text = formatLevel(value);
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}

function getActiveMapRange(): MapRange {
  if (mapAutoScale && currentMapRange) return currentMapRange;
  return DEFAULT_MAP_RANGE;
}

function getMapBandStep() {
  // Use coarser step when viewing a specific frequency band (wider level variation)
  const defaultStep = displayBand === 'overall' ? DEFAULT_MAP_BAND_STEP : DEFAULT_MAP_BAND_STEP_PERBAND;
  if (!Number.isFinite(mapBandStep)) return defaultStep;
  return Math.min(20, Math.max(1, mapBandStep));
}

function snapMapValue(value: number) {
  if (mapRenderStyle !== 'Contours') return value;
  const step = getMapBandStep();
  return Math.floor(value / step) * step;
}

function buildNoiseMapTexture(grid: ComputeGridResponse['result'], range: MapRange) {
  // Convert grid values into a per-cell RGBA texture (in grid-space).
  // The draw step scales this texture into world-space bounds using worldToCanvas().
  if (!grid.values.length) return null;
  const { cols, rows } = getGridCounts(grid.bounds, grid.resolution);
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const mapCtx = canvas.getContext('2d');
  if (!mapCtx) return null;

  const image = mapCtx.createImageData(cols, rows);
  const span = range.max - range.min;
  const alpha = 200;

  for (let y = 0; y < rows; y += 1) {
    // Canvas image space is y-down; grid space is y-up.
    const destY = rows - 1 - y;
    for (let x = 0; x < cols; x += 1) {
      // IMPORTANT: values are stored with x-major order (x outer loop, y inner loop).
      const value = grid.values[x * rows + y];
      const offset = (destY * cols + x) * 4;
      if (!Number.isFinite(value) || value <= MIN_LEVEL) {
        image.data[offset + 3] = 0;
        continue;
      }
      const mapped = snapMapValue(value);
      const ratio = span > 0 ? (mapped - range.min) / span : 0;
      const color = getSampleColor(ratio);
      image.data[offset] = color.r;
      image.data[offset + 1] = color.g;
      image.data[offset + 2] = color.b;
      image.data[offset + 3] = alpha;
    }
  }

  mapCtx.putImageData(image, 0, 0);
  return canvas;
}

function panelSamplesToEnergy(samples: PanelResult['samples']) {
  const energies = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    energies[i] = dbToEnergy(samples[i].LAeq);
  }
  return energies;
}

function recomputePanelStats(panelResult: PanelResult) {
  let min = Infinity;
  let max = -Infinity;
  let energySum = 0;
  const laeqs: number[] = [];

  for (const sample of panelResult.samples) {
    const level = sample.LAeq;
    if (level <= MIN_LEVEL) continue;
    laeqs.push(level);
    if (level < min) min = level;
    if (level > max) max = level;
    energySum += dbToEnergy(level);
  }

  if (!laeqs.length || energySum <= 0) {
    panelResult.LAeq_min = MIN_LEVEL;
    panelResult.LAeq_max = MIN_LEVEL;
    panelResult.LAeq_avg = MIN_LEVEL;
    panelResult.LAeq_p25 = MIN_LEVEL;
    panelResult.LAeq_p50 = MIN_LEVEL;
    panelResult.LAeq_p75 = MIN_LEVEL;
    panelResult.LAeq_p95 = MIN_LEVEL;
    return;
  }

  const avg = energyToDb(energySum / laeqs.length);
  const sorted = [...laeqs].sort((a, b) => a - b);
  const p25Index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.25) - 1));
  const p50Index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.5) - 1));
  const p75Index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1));
  const p95Index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));

  panelResult.LAeq_min = min;
  panelResult.LAeq_max = max;
  panelResult.LAeq_avg = avg;
  panelResult.LAeq_p25 = sorted[p25Index];
  panelResult.LAeq_p50 = sorted[p50Index];
  panelResult.LAeq_p75 = sorted[p75Index];
  panelResult.LAeq_p95 = sorted[p95Index];
}

function renderNoiseMapLegend() {
  if (!dbLegend || !dbLegendGradient || !dbLegendLabels) return;
  const range = getActiveMapRange();
  const step = getMapBandStep();
  const isContours = mapRenderStyle === 'Contours';
  const stops = buildSmoothLegendStops();

  dbLegendGradient.style.backgroundImage = `linear-gradient(90deg, ${stops})`;
  dbLegend.classList.toggle('is-contours', isContours);

  dbLegendLabels.innerHTML = '';
  const labels = isContours ? buildBandedLegendLabels(range, step) : [range.min, range.max];
  for (let i = 0; i < labels.length; i += 1) {
    const value = labels[i];
    const label = document.createElement('span');
    const suffix = i === 0 || i === labels.length - 1 ? ' dB' : '';
    label.textContent = `${formatLegendLevel(value)}${suffix}`;
    dbLegendLabels.appendChild(label);
  }
}

function renderPanelLegend() {
  if (!panelLegend) return;
  const current = selection;
  if (current.type !== 'panel') {
    panelLegend.innerHTML = '<span class="legend-empty">Select a measure grid to view the color range.</span>';
    return;
  }
  renderPanelLegendFor(current.id, panelLegend);
}

/** Render panel legend for a given panel ID into a specific container */
function renderPanelLegendFor(panelId: string, container: HTMLElement) {
  const result = results.panels.find((panel) => panel.panelId === panelId);
  if (!result || !Number.isFinite(result.LAeq_min) || !Number.isFinite(result.LAeq_max)) {
    container.innerHTML = '<span class="legend-empty">Measure grid results pending.</span>';
    return;
  }

  const gradientStops = [0, 0.25, 0.5, 0.75, 1]
    .map((stop) => `${colorToCss(getSampleColor(stop))} ${Math.round(stop * 100)}%`)
    .join(', ');

  container.innerHTML = `
    <div class="legend-bar" style="background: linear-gradient(90deg, ${gradientStops});"></div>
    <div class="legend-labels">
      <span>${formatLevel(result.LAeq_min)} dB</span>
      <span>${formatLevel(result.LAeq_max)} dB</span>
    </div>
  `;
}

function renderPanelStats() {
  if (!panelStats) return;
  panelStats.innerHTML = '';
  if (!scene.panels.length) {
    panelStats.innerHTML = '<span class="legend-empty">Add a measure grid to see stats.</span>';
    return;
  }
  const current = selection;
  if (current.type !== 'panel') {
    panelStats.innerHTML = '<span class="legend-empty">Select a measure grid to view stats.</span>';
    return;
  }
  renderPanelStatsFor(current.id, panelStats);
}

/** Render panel stats for a given panel ID into a specific container */
function renderPanelStatsFor(panelId: string, container: HTMLElement) {
  container.innerHTML = '';
  const result = results.panels.find((panel) => panel.panelId === panelId);
  if (!result) {
    container.innerHTML = '<span class="legend-empty">Measure grid results pending.</span>';
    return;
  }

  const iqr = result.LAeq_p75 - result.LAeq_p25;
  const rows: Array<[string, string]> = [
    ['Min', `${formatLevel(result.LAeq_min)} dB`],
    ['Average', `${formatLevel(result.LAeq_avg)} dB`],
    ['L50', `${formatLevel(result.LAeq_p50)} dB`],
    ['Max', `${formatLevel(result.LAeq_max)} dB`],
    ['L75-L25', `${formatLevel(iqr)} dB`],
    ['Samples', `${result.sampleCount}`],
  ];

  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    container.appendChild(row);
  }
}

const layerLabels: Record<keyof typeof layers, string> = {
  sources: 'Sources',
  receivers: 'Receivers',
  panels: 'Measure Grids',
  noiseMap: 'Noise Map',
  grid: 'Grid',
};

function getComputePreference(): ComputePreference {
  if (preferenceSelect) return preferenceSelect.value as ComputePreference;
  const stored = loadPreference();
  return stored === 'auto' ? 'cpu' : stored;
}

function buildEngineScene() {
  const engineScene = createEmptyScene(origin, 'UI Scene');

  engineScene.sources = scene.sources.map((source) => ({
    id: source.id,
    type: 'point' as const,
    name: source.name.trim() || `Source ${source.id.toUpperCase()}`,
    position: { x: source.x, y: source.y, z: source.z },
    spectrum: source.spectrum,
    gain: source.gain,
    soundPowerLevel: calculateOverallLevel(source.spectrum, 'Z'),
    enabled: isSourceEnabled(source),
  }));

  engineScene.receivers = scene.receivers.map((receiver) => ({
    id: receiver.id,
    type: 'point',
    name: `Receiver ${receiver.id.toUpperCase()}`,
    position: { x: receiver.x, y: receiver.y, z: receiver.z },
    enabled: true,
  }));

  engineScene.panels = scene.panels.map((panel) => ({
    id: panel.id,
    type: 'polygon',
    name: `Panel ${panel.id.toUpperCase()}`,
    vertices: panel.points.map((pt) => ({ x: pt.x, y: pt.y })),
    elevation: panel.elevation,
    sampling: { type: 'grid', resolution: panel.sampling.resolution, pointCount: panel.sampling.pointCap },
    enabled: true,
  }));

  // Map UI barriers + buildings to engine obstacles for propagation.
  //
  // The engine stores:
  // - barriers as ObstacleSchema(type='barrier') with a list of vertices (polyline).
  // - buildings as ObstacleSchema(type='building') with a polygon footprint.
  //
  // The CPU engine then:
  // 1) checks if each source->receiver segment intersects obstacle edges in 2D, and if so
  // 2) computes a 3D top-edge path difference delta using obstacle.height (hb) and source/receiver z (hs/hr).
  // That delta is turned into insertion loss (Abar) by the propagation model and replaces ground effect when blocked.
  const barrierObstacles = scene.barriers.map((barrier) => ({
    id: barrier.id,
    type: 'barrier' as const,
    name: `Barrier ${barrier.id.toUpperCase()}`,
    vertices: [
      { x: barrier.p1.x, y: barrier.p1.y },
      { x: barrier.p2.x, y: barrier.p2.y },
    ],
    height: barrier.height,
    groundElevation: 0,
    attenuationDb: Number.isFinite(barrier.transmissionLoss ?? Infinity) ? barrier.transmissionLoss ?? 20 : 20,
    enabled: true,
  }));

  const buildingObstacles = scene.buildings.map((building) => ({
    id: building.id,
    type: 'building' as const,
    name: `Building ${building.id.toUpperCase()}`,
    footprint: building.getVertices().map((pt) => ({ x: pt.x, y: pt.y })),
    height: building.z_height,
    groundElevation: 0,
    attenuationDb: 25,
    enabled: true,
  }));

  engineScene.obstacles = [...barrierObstacles, ...buildingObstacles];

  return engineScene;
}

function getSceneBounds() {
  // Scene bounds for "Generate Map" are based on *active* geometry primitives.
  // Notes:
  // - sources are filtered through solo/mute so the map reflects what will be computed.
  // - barriers contribute their endpoints; buildings contribute footprint vertices.
  const points: Point[] = [];
  for (const source of scene.sources) {
    if (!isSourceEnabled(source)) continue;
    points.push({ x: source.x, y: source.y });
  }
  for (const receiver of scene.receivers) {
    points.push({ x: receiver.x, y: receiver.y });
  }
  for (const barrier of scene.barriers) {
    points.push({ x: barrier.p1.x, y: barrier.p1.y });
    points.push({ x: barrier.p2.x, y: barrier.p2.y });
  }
  for (const building of scene.buildings) {
    for (const vertex of building.getVertices()) {
      points.push({ x: vertex.x, y: vertex.y });
    }
  }

  if (!points.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

function getViewportBounds() {
  // Viewport bounds (current pan/zoom) in world coordinates.
  // Used to ensure the generated heatmap spans the visible workspace instead of appearing
  // as a tiny thumbnail when only a small amount of geometry exists.
  const rect = canvas.getBoundingClientRect();
  const topLeft = canvasToWorld({ x: 0, y: 0 });
  const bottomRight = canvasToWorld({ x: rect.width, y: rect.height });
  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxX: Math.max(topLeft.x, bottomRight.x),
    maxY: Math.max(topLeft.y, bottomRight.y),
  };
}

function buildNoiseMapGridConfig(resolutionPx?: number, maxPoints?: number) {
  // Resolution strategy:
  // - target ~40 cells across the max dimension (step ~= max(width,height)/40)
  // - clamp to point cap for responsiveness
  const bounds = getSceneBounds();
  if (!bounds) return null;

  let { minX, minY, maxX, maxY } = bounds;
  if (minX === maxX) {
    minX -= 5;
    maxX += 5;
  }
  if (minY === maxY) {
    minY -= 5;
    maxY += 5;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const padRatio = 0.15;
  const paddedScene = {
    minX: minX - width * padRatio,
    minY: minY - height * padRatio,
    maxX: maxX + width * padRatio,
    maxY: maxY + height * padRatio,
  };
  // Merge the padded scene bounds with the current viewport so the heatmap fills the workspace.
  const padded = mergeBounds(paddedScene, getViewportBounds());

  const paddedWidth = padded.maxX - padded.minX;
  const paddedHeight = padded.maxY - padded.minY;
  let resolution = Math.max(paddedWidth, paddedHeight) / 40;
  // When a pixel step is supplied, convert to world meters for a predictable preview grid.
  if (Number.isFinite(resolutionPx) && Number.isFinite(pixelsPerMeter) && pixelsPerMeter > 0) {
    const stepPx = Math.max(1, resolutionPx ?? 1);
    resolution = stepPx / pixelsPerMeter;
  }
  if (!Number.isFinite(resolution) || resolution <= 0) resolution = 1;

  let cols = Math.ceil(paddedWidth / resolution) + 1;
  let rows = Math.ceil(paddedHeight / resolution) + 1;

  // Point cap strategy (see NOISE MAP RESOLUTION STRATEGY comment above):
  // - Initial/no-resolution: 2,500 points for fast startup
  // - With resolution (static/drag): STATIC_POINTS for good quality
  // - Refine button and initial load pass maxPoints=REFINE_POINTS for maximum detail
  const defaultCap = Number.isFinite(resolutionPx) ? STATIC_POINTS : 2500;
  const targetPoints = maxPoints ?? defaultCap;
  const pointCount = cols * rows;
  if (pointCount > targetPoints) {
    const scale = Math.sqrt(pointCount / targetPoints);
    resolution *= scale;
    cols = Math.ceil(paddedWidth / resolution) + 1;
    rows = Math.ceil(paddedHeight / resolution) + 1;
  }

  // Per-band noise map display options:
  // - If displayBand is 'overall', compute weighted overall level using displayWeighting
  // - If displayBand is a band index (0-8), compute single-band unweighted level
  const targetBand = displayBand === 'overall' ? undefined : displayBand;
  const weighting = displayWeighting;

  return { enabled: true, bounds: padded, resolution, elevation: 1.5, targetBand, weighting };
}

function buildPanelPayload(panel: Panel) {
  return {
    panelId: panelId(panel.id),
    sampling: { type: 'grid' as const, resolution: panel.sampling.resolution, pointCount: panel.sampling.pointCap },
  };
}

function buildSingleSourceScene(sourceId: string) {
  const engineScene = buildEngineScene();
  engineScene.sources = engineScene.sources.filter((source) => source.id === sourceId);
  return engineScene;
}

function pruneResults() {
  const receiverIds = new Set(scene.receivers.map((receiver) => receiver.id));
  results.receivers = results.receivers.filter((receiver) => receiverIds.has(receiver.id));

  const panelIds = new Set(scene.panels.map((panel) => panel.id));
  results.panels = results.panels.filter((panel) => panelIds.has(panel.panelId));
}

function updateStatus(meta: { backendId: string; timings?: { totalMs?: number }; warnings?: Array<unknown> }) {
  if (!computeChip) return;
  const timing = meta.timings?.totalMs;
  const timingLabel = typeof timing === 'number' ? `${timing.toFixed(1)} ms` : 'n/a';
  const warnings = meta.warnings?.length ?? 0;
  const warningLabel = warnings ? ` • ${warnings} warning${warnings === 1 ? '' : 's'}` : '';
  computeChip.title = `${meta.backendId} • ${timingLabel}${warningLabel}`;
}

function isStaleError(error: unknown) {
  return error instanceof Error && error.message === 'stale';
}

function showComputeError(label: string, error: unknown) {
  if (computeChip) {
    computeChip.textContent = 'Error';
    computeChip.dataset.state = 'error';
    computeChip.title = `${label} compute error`;
  }
  // eslint-disable-next-line no-console
  console.error(label, error);
}

function updatePanelResult(panelResult: PanelResult) {
  const idx = results.panels.findIndex((panel) => panel.panelId === panelResult.panelId);
  if (idx >= 0) {
    results.panels[idx] = panelResult;
  } else {
    results.panels.push(panelResult);
  }
  panelEnergyTotals.set(panelResult.panelId, panelSamplesToEnergy(panelResult.samples));
}

function finishCompute(token: number) {
  if (token !== activeComputeToken) return;
  pendingComputes = Math.max(0, pendingComputes - 1);
  if (pendingComputes === 0) {
    isComputing = false;
    updateComputeUI();
  }
}

async function computeReceivers(
  engineScene: ReturnType<typeof buildEngineScene>,
  preference: ComputePreference,
  token: number
) {
  try {
    const response = (await engineCompute(
      { kind: 'receivers', scene: engineScene, payload: {}, engineConfig },
      preference,
      'receivers'
    )) as ComputeReceiversResponse;
    if (token !== activeComputeToken) return;
    const receiverMap = new Map(scene.receivers.map((receiver) => [receiver.id, receiver]));
    results.receivers = response.results.map((result) => {
      const receiver = receiverMap.get(String(result.receiverId));
      return {
        id: receiver?.id ?? String(result.receiverId),
        x: receiver?.x ?? 0,
        y: receiver?.y ?? 0,
        z: receiver?.z ?? 0,
        LAeq: result.LAeq,
        LCeq: result.LCeq,
        LZeq: result.LZeq,
        Leq_spectrum: result.Leq_spectrum,
      };
    });
    receiverEnergyTotals = new Map(results.receivers.map((receiver) => [receiver.id, dbToEnergy(receiver.LAeq)]));
    updateStatus(response);
    renderResults();
    requestRender();
  } catch (error) {
    if (isStaleError(error)) return;
    showComputeError('Receivers', error);
  } finally {
    finishCompute(token);
  }
}

async function computePanel(
  engineScene: ReturnType<typeof buildEngineScene>,
  preference: ComputePreference,
  panel: Panel,
  token: number
) {
  try {
    const response = (await engineCompute(
      {
        kind: 'panel',
        scene: engineScene,
        engineConfig,
        payload: { panelId: panelId(panel.id) },
      },
      preference,
      `panel:${panel.id}`
    )) as ComputePanelResponse;
    if (token !== activeComputeToken) return;

    const result = response.result;
    const panelResult: PanelResult = {
      panelId: String(result.panelId),
      sampleCount: result.sampleCount,
      LAeq_min: result.LAeq_min,
      LAeq_max: result.LAeq_max,
      LAeq_avg: result.LAeq_avg,
      LAeq_p25: MIN_LEVEL,
      LAeq_p50: MIN_LEVEL,
      LAeq_p75: MIN_LEVEL,
      LAeq_p95: result.LAeq_p95,
      samples: (result.samples ?? []).map((sample) => ({
        x: sample.x,
        y: sample.y,
        z: sample.z,
        LAeq: sample.LAeq,
      })),
    };
    recomputePanelStats(panelResult);
    updatePanelResult(panelResult);
    renderResults();
    requestRender();
  } catch (error) {
    if (isStaleError(error)) return;
    showComputeError(`Panel ${panel.id}`, error);
  } finally {
    finishCompute(token);
  }
}


function invalidateNoiseMap() {
  // Any scene edit, load, undo/redo, or compute invalidates the previously generated map.
  // Keeping the map "sticky" would require a stable hash of (scene + engineConfig + bounds + resolution).
  if (isMapComputing) {
    activeMapToken = ++mapComputeToken;
    isMapComputing = false;
    updateMapUI();
  }
  noiseMap = null;
  currentMapRange = null;
  layers.noiseMap = false;
  if (layerNoiseMap) {
    layerNoiseMap.checked = false;
  }
  setMapToast(null);
  renderNoiseMapLegend();
  requestRender();
}

/**
 * Recalculate the noise map if it's currently visible.
 * Unlike invalidateNoiseMap(), this keeps the existing map displayed
 * while computing the new one in the background.
 */
function recalculateNoiseMapIfVisible() {
  if (!layers.noiseMap || !noiseMap) {
    return; // Map not visible, nothing to recalculate
  }
  // Use low resolution only during active dragging for responsiveness.
  // For static updates (after changes complete), use high resolution.
  if (interactionActive) {
    recalculateNoiseMap(RES_LOW, DRAG_POINTS);
  } else {
    recalculateNoiseMap(RES_HIGH, STATIC_POINTS);
  }
}

type NoiseMapComputeOptions = {
  resolutionPx?: number;
  maxPoints?: number;
  silent?: boolean;
  requestId?: string;
};

async function computeNoiseMapInternal(options: NoiseMapComputeOptions = {}) {
  // Generates a global noise map without blocking the UI thread.
  // The actual propagation compute is routed through the CPU worker backend (see engine-backends),
  // and we yield a frame before awaiting so the "Generating map..." toast is painted.
  const silent = options.silent ?? false;

  if (!scene.sources.some((source) => isSourceEnabled(source))) {
    if (!silent) {
      setMapToast('Enable at least one source to generate a map.', 'error', 3000);
    }
    return;
  }

  const gridConfig = buildNoiseMapGridConfig(options.resolutionPx, options.maxPoints);
  if (!gridConfig) {
    if (!silent) {
      setMapToast('Add sources, receivers, or barriers to define the map bounds.', 'error', 3000);
    }
    return;
  }

  const preference = getComputePreference();
  const engineScene = buildEngineScene();
  const token = ++mapComputeToken;
  activeMapToken = token;
  isMapComputing = true;
  if (!silent) {
    updateMapUI();
    setMapToast('Generating map...', 'busy');
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));

  try {
    const response = (await engineCompute(
      {
        kind: 'grid',
        scene: engineScene,
        engineConfig,
        payload: { gridConfig },
      },
      preference,
      options.requestId ?? 'grid:global'
    )) as ComputeGridResponse;

    if (token !== activeMapToken) return;

    const computedRange = computeMapRange(response.result.values);
    if (!computedRange) {
      currentMapRange = null;
      noiseMap = null;
      if (!silent) {
        setMapToast('Map has no audible values.', 'error', 3000);
      }
      renderNoiseMapLegend();
      requestRender();
      return;
    }

    currentMapRange = computedRange;
    const renderRange = getActiveMapRange();
    const texture = buildNoiseMapTexture(response.result, renderRange);
    if (!texture) {
      noiseMap = null;
      if (!silent) {
        setMapToast('Map has no audible values.', 'error', 3000);
      }
      renderNoiseMapLegend();
      requestRender();
      return;
    }

    const { cols, rows } = getGridCounts(response.result.bounds, response.result.resolution);
    noiseMap = { ...response.result, cols, rows, texture };
    layers.noiseMap = true;
    if (layerNoiseMap) layerNoiseMap.checked = true;
    if (debugLayer) debugLayer.textContent = layerLabels.noiseMap;

    renderNoiseMapLegend();
    // Ensure silent map updates still trigger a frame.
    needsUpdate = true;
    requestRender();
    if (!silent) {
      setMapToast(null);
    }
  } catch (error) {
    if (isStaleError(error)) return;
    if (!silent) {
      setMapToast('Map compute failed.', 'error', 3000);
    }
    // eslint-disable-next-line no-console
    console.error('Map compute failed', error);
  } finally {
    if (token === activeMapToken) {
      isMapComputing = false;
      if (!silent) {
        updateMapUI();
      }
      if (queuedMapResolutionPx !== null) {
        const nextResolution = queuedMapResolutionPx;
        queuedMapResolutionPx = null;
        recalculateNoiseMap(nextResolution);
      }
    }
  }
}

async function computeNoiseMap() {
  if (isMapComputing) {
    invalidateNoiseMap();
    setMapToast('Map canceled', 'error', 2000);
    return;
  }
  queuedMapResolutionPx = null;
  // Use fine resolution for user-initiated map generation (capped at 10000 points)
  await computeNoiseMapInternal({ resolutionPx: RES_HIGH, requestId: 'grid:generate' });
}

function recalculateNoiseMap(resolutionPx: number, maxPoints?: number) {
  if (!layers.noiseMap) return;
  if (isMapComputing) {
    queuedMapResolutionPx = resolutionPx;
    return;
  }
  // Silent recompute keeps UI responsive while updating the map texture.
  void computeNoiseMapInternal({ resolutionPx, maxPoints, silent: true, requestId: 'grid:live' });
}

function computeScene(options: { invalidateMap?: boolean; recalculateMap?: boolean } = {}) {
  // By default, recalculate the map if visible (keeps map on screen)
  // Use invalidateMap: true to force clear, or recalculateMap: false to skip
  if (options.invalidateMap === true) {
    invalidateNoiseMap();
  } else if (options.recalculateMap !== false) {
    recalculateNoiseMapIfVisible();
  }
  pruneResults();
  renderResults();
  requestRender();
  dragContribution = null;
  receiverEnergyTotals = new Map();
  panelEnergyTotals = new Map();

  const preference = getComputePreference();
  const engineScene = buildEngineScene();
  pendingComputes = 1 + scene.panels.length;
  isComputing = true;
  activeComputeToken = ++computeToken;
  updateComputeUI();

  void computeReceivers(engineScene, preference, activeComputeToken);
  for (const panel of scene.panels) {
    void computePanel(engineScene, preference, panel, activeComputeToken);
  }
  requestLiveProbeUpdates();
}

function cancelCompute() {
  activeComputeToken = ++computeToken;
  pendingComputes = 0;
  isComputing = false;
  updateComputeUI();
}

function primeDragContribution(sourceId: string) {
  const engineScene = buildSingleSourceScene(sourceId);
  const preference = getComputePreference();
  dragContribution = {
    sourceId,
    receiverEnergy: new Map(),
    panelEnergy: new Map(),
  };

  if (scene.receivers.length) {
    void primeReceiverContribution(engineScene, preference, sourceId);
  }
  for (const panel of scene.panels) {
    void primePanelContribution(engineScene, preference, sourceId, panel);
  }
}

function receiverBaselineReady(sourceId: string) {
  if (!dragContribution || dragContribution.sourceId !== sourceId) return false;
  if (scene.receivers.length === 0) return true;
  return dragContribution.receiverEnergy.size >= scene.receivers.length;
}

async function primeReceiverContribution(
  engineScene: ReturnType<typeof buildEngineScene>,
  preference: ComputePreference,
  sourceId: string
) {
  try {
    const response = (await engineCompute(
      { kind: 'receivers', scene: engineScene, payload: {}, engineConfig },
      preference,
      `drag:${sourceId}:receivers`
    )) as ComputeReceiversResponse;
    const energies = new Map<string, number>();
    for (const result of response.results) {
      energies.set(String(result.receiverId), dbToEnergy(result.LAeq));
    }
    if (dragContribution && dragContribution.sourceId === sourceId) {
      dragContribution.receiverEnergy = energies;
    }
  } catch (error) {
    if (isStaleError(error)) return;
    showComputeError('Receivers', error);
  }
}

async function primePanelContribution(
  engineScene: ReturnType<typeof buildEngineScene>,
  preference: ComputePreference,
  sourceId: string,
  panel: Panel
) {
  try {
    const response = (await engineCompute(
      { kind: 'panel', scene: engineScene, payload: buildPanelPayload(panel), engineConfig },
      preference,
      `drag:${sourceId}:panel:${panel.id}`
    )) as ComputePanelResponse;
    const energies = panelSamplesToEnergy(response.result.samples ?? []);
    if (dragContribution && dragContribution.sourceId === sourceId) {
      dragContribution.panelEnergy.set(panel.id, energies);
    }
  } catch (error) {
    if (isStaleError(error)) return;
    showComputeError(`Panel ${panel.id}`, error);
  }
}

function applyReceiverDelta(sourceId: string, newEnergies: Map<string, number>) {
  if (!dragContribution || dragContribution.sourceId !== sourceId) return false;
  if (!receiverBaselineReady(sourceId)) return false;

  for (const receiver of results.receivers) {
    const id = receiver.id;
    const totalEnergy = receiverEnergyTotals.get(id) ?? dbToEnergy(receiver.LAeq);
    const previousEnergy = dragContribution.receiverEnergy.get(id) ?? 0;
    const nextEnergy = newEnergies.get(id) ?? 0;
    const combined = totalEnergy + nextEnergy - previousEnergy;
    receiverEnergyTotals.set(id, combined);
    receiver.LAeq = energyToDb(combined);
    dragContribution.receiverEnergy.set(id, nextEnergy);
  }

  return true;
}

function applyPanelDelta(sourceId: string, panelIdValue: string, newEnergies: Float64Array) {
  if (!dragContribution || dragContribution.sourceId !== sourceId) return false;
  const previous = dragContribution.panelEnergy.get(panelIdValue);
  const panelResult = results.panels.find((panel) => panel.panelId === panelIdValue);
  if (!previous || !panelResult) return false;

  let totals = panelEnergyTotals.get(panelIdValue);
  if (!totals) {
    totals = panelSamplesToEnergy(panelResult.samples);
    panelEnergyTotals.set(panelIdValue, totals);
  }

  if (totals.length !== newEnergies.length || previous.length !== newEnergies.length || panelResult.samples.length !== newEnergies.length) {
    return false;
  }

  for (let i = 0; i < newEnergies.length; i += 1) {
    const combined = totals[i] + newEnergies[i] - previous[i];
    totals[i] = combined;
    panelResult.samples[i].LAeq = energyToDb(combined);
    previous[i] = newEnergies[i];
  }

  recomputePanelStats(panelResult);
  return true;
}

async function computeReceiversIncremental(
  engineScene: ReturnType<typeof buildEngineScene>,
  preference: ComputePreference,
  sourceId: string
) {
  if (!receiverBaselineReady(sourceId)) return;
  try {
    const response = (await engineCompute(
      { kind: 'receivers', scene: engineScene, payload: {}, engineConfig },
      preference,
      `drag:${sourceId}:receivers`
    )) as ComputeReceiversResponse;
    const energies = new Map<string, number>();
    for (const result of response.results) {
      energies.set(String(result.receiverId), dbToEnergy(result.LAeq));
    }
    if (applyReceiverDelta(sourceId, energies)) {
      updateStatus(response);
      renderResults();
      requestRender();
    }
  } catch (error) {
    if (isStaleError(error)) return;
    showComputeError('Receivers', error);
  }
}

async function computePanelIncremental(
  engineScene: ReturnType<typeof buildEngineScene>,
  preference: ComputePreference,
  sourceId: string,
  panel: Panel
) {
  if (!dragContribution || dragContribution.sourceId !== sourceId) return;
  if (!dragContribution.panelEnergy.has(panel.id)) return;
  try {
    const response = (await engineCompute(
      { kind: 'panel', scene: engineScene, payload: buildPanelPayload(panel), engineConfig },
      preference,
      `drag:${sourceId}:panel:${panel.id}`
    )) as ComputePanelResponse;
    const energies = panelSamplesToEnergy(response.result.samples ?? []);
    if (applyPanelDelta(sourceId, panel.id, energies)) {
      renderResults();
      requestRender();
    }
  } catch (error) {
    if (isStaleError(error)) return;
    showComputeError(`Panel ${panel.id}`, error);
  }
}

function computeSceneIncremental(sourceId: string) {
  if (!dragContribution || dragContribution.sourceId !== sourceId) {
    primeDragContribution(sourceId);
    // Still need to update probes even when priming drag contribution
    requestLiveProbeUpdates();
    return;
  }

  const preference = getComputePreference();
  const engineScene = buildSingleSourceScene(sourceId);

  void computeReceiversIncremental(engineScene, preference, sourceId);
  for (const panel of scene.panels) {
    void computePanelIncremental(engineScene, preference, sourceId, panel);
  }
  requestLiveProbeUpdates();
}

/**
 * Get the appropriate display level for a receiver based on user's weighting/band selection
 *
 * Spectral Source Migration (Jan 2026):
 * - Supports displaying individual octave bands from Leq_spectrum
 * - Supports A/C/Z weighting selection for overall level
 * - Falls back to LAeq if weighted values not available
 *
 * @param receiver - Receiver result with spectrum data
 * @returns Object with level (dB) and unit string for display
 */
function getReceiverDisplayLevel(receiver: SceneResults['receivers'][number]): { level: number; unit: string } {
  // If a specific band is selected, show that band's level (unweighted)
  if (displayBand !== 'overall' && receiver.Leq_spectrum) {
    return {
      level: receiver.Leq_spectrum[displayBand],
      unit: `dB @ ${OCTAVE_BAND_LABELS[displayBand]} Hz`,
    };
  }

  // Show weighted overall level based on selected weighting
  switch (displayWeighting) {
    case 'C':
      return { level: receiver.LCeq ?? receiver.LAeq, unit: 'dB(C)' };
    case 'Z':
      return { level: receiver.LZeq ?? receiver.LAeq, unit: 'dB(Z)' };
    case 'A':
    default:
      return { level: receiver.LAeq, unit: 'dB(A)' };
  }
}

function renderResults() {
  renderSources();

  if (receiverTable) {
    receiverTable.innerHTML = '';
    for (const receiver of results.receivers) {
      const row = document.createElement('div');
      row.className = 'result-row result-row--spectrum';

      // Header with ID and weighted/band-specific level
      const { level, unit } = getReceiverDisplayLevel(receiver);
      const header = document.createElement('div');
      header.className = 'result-row-header';
      header.innerHTML = `<span>${receiver.id.toUpperCase()}</span><strong>${formatLevel(level)} ${unit}</strong>`;
      row.appendChild(header);

      // Add spectrum bars if available
      if (receiver.Leq_spectrum) {
        const spectrumContainer = document.createElement('div');
        spectrumContainer.className = 'result-spectrum-mini';

        const maxLevel = Math.max(...receiver.Leq_spectrum);
        const minDisplay = Math.max(0, maxLevel - 60);

        receiver.Leq_spectrum.forEach((level, i) => {
          const bar = document.createElement('div');
          bar.className = 'spectrum-bar-mini';
          const height = Math.max(0, ((level - minDisplay) / (maxLevel - minDisplay)) * 100);
          bar.style.height = `${height}%`;
          bar.title = `${OCTAVE_BAND_LABELS[i]}: ${formatLevel(level)} dB`;
          // Highlight the selected band
          if (displayBand !== 'overall' && i === displayBand) {
            bar.classList.add('is-selected');
          }
          spectrumContainer.appendChild(bar);
        });

        row.appendChild(spectrumContainer);
      }

      receiverTable.appendChild(row);
    }
  }

  renderPanelLegend();
  renderPanelStats();
  refreshPinnedContextPanels();
}

// Probe functions moved to probe/ module - see ./probe/index.ts

function getProbeById(probeId: string) {
  return scene.probes.find((item) => item.id === probeId) ?? null;
}

// requestProbeUpdate wrapper for module
function requestProbeUpdate(probeId: string, _options?: { immediate?: boolean }) {
  if (!probeId) return;
  const probe = getProbeById(probeId);
  if (!probe) return;
  const sceneData: ProbeSceneData = {
    sources: scene.sources,
    barriers: scene.barriers,
    buildings: scene.buildings,
  };
  const config: ProbeConfig = {
    barrierSideDiffraction: getPropagationConfig().barrierSideDiffraction ?? 'auto',
    groundType: getPropagationConfig().groundType ?? 'mixed',
    groundMixedFactor: getPropagationConfig().groundMixedFactor ?? 0.5,
    groundModel: (probeGroundModel?.value as 'impedance' | 'iso9613') ?? 'impedance',
    atmosphericAbsorption: getPropagationConfig().atmosphericAbsorption ?? 'simple',
    ...getMeteoConfig(),
  };
  const includeRays = ENABLE_RAY_VISUALIZATION && (rayVizToggle?.checked ?? false);
  sendProbeRequestFromModule(probe, sceneData, config, isSourceEnabled, includeRays, () => {
    renderProbeInspector();
    renderPinnedProbePanel(probe.id);
  });
}

function requestLiveProbeUpdates(_options?: { immediate?: boolean }) {
  const activeId = getActiveProbeId();
  const liveIds = activeId ? [activeId, ...Array.from(getPinnedProbePanels().keys())] : Array.from(getPinnedProbePanels().keys());
  const uniqueIds = Array.from(new Set(liveIds));
  for (const probeId of uniqueIds) {
    requestProbeUpdate(probeId, { immediate: true });
  }
}

// renderProbeInspector wrapper for probe/ module
function renderProbeInspector() {
  const elements: ProbeInspectorElements = {
    panel: probePanel,
    title: probeTitle,
    close: probeClose,
    freeze: probeFreeze,
    pin: probePin,
    status: probeStatus,
    chart: probeChart,
    chartCtx: probeChartCtx,
  };
  const rayVizElements: RayVizElements = {
    card: rayVizCard,
    toggle: rayVizToggle,
    paths: rayVizPaths,
    phaseInfo: rayVizPhaseInfo,
    dominant: rayVizDominant,
  };
  renderProbeInspectorFromModule({
    elements,
    rayVizElements,
    getProbeById,
    displayWeighting,
    readCssVar,
    requestRender,
  });
}

// resizeProbeChart wrapper
function resizeProbeChart() {
  resizeProbeChartFromModule(probeChart, probeChartCtx);
}

// renderProbeSnapshots wrapper
function renderProbeSnapshots() {
  renderProbeSnapshotsFromModule(displayWeighting, readCssVar);
}

// getActiveProbe wrapper for probe/ module
function getActiveProbe() {
  const activeId = getActiveProbeId();
  if (!activeId) return null;
  return getProbeById(activeId);
}

// setActiveProbe wrapper
function setActiveProbe(nextId: string | null) {
  const resolved = nextId && scene.probes.some((probe) => probe.id === nextId) ? nextId : null;
  const currentId = getActiveProbeId();
  const didChange = resolved !== currentId;
  setActiveProbeId(resolved);
  renderProbeInspector();
  if (resolved && didChange) {
    requestProbeUpdate(resolved, { immediate: true });
  }
  requestRender();
}

// pinProbe wrapper
function pinProbe(probeId: string) {
  if (!probeId || hasPinnedProbePanel(probeId)) return;
  const probe = getProbeById(probeId);
  if (!probe) return;
  if (!uiLayer) return;

  createPinnedProbePanelFromModule({
    probeId,
    probe,
    uiLayer,
    probePanel,
    displayWeighting,
    readCssVar,
    onUnpin: unpinProbe,
  });
  requestProbeUpdate(probeId, { immediate: true });
  renderProbeInspector();
}

// unpinProbe wrapper
function unpinProbe(probeId: string) {
  if (!removePinnedProbeFromModule(probeId)) return;
  renderProbeInspector();
}

// togglePinProbe wrapper
function togglePinProbe(probeId: string) {
  if (hasPinnedProbePanel(probeId)) {
    unpinProbe(probeId);
    return;
  }
  pinProbe(probeId);
}

// renderPinnedProbePanel wrapper
function renderPinnedProbePanel(probeId: string) {
  renderPinnedProbePanelFromModule(probeId, displayWeighting, readCssVar);
}

// renderPinnedProbePanels wrapper
function renderPinnedProbePanels() {
  for (const id of getPinnedProbePanels().keys()) {
    renderPinnedProbePanel(id);
  }
}

// createProbeSnapshot wrapper
function createProbeSnapshotWrapper(data: ProbeResult['data'], sourceProbeName?: string, coordinates?: { x: number; y: number }) {
  if (!uiLayer) return;
  createProbeSnapshotFromModule({
    data,
    sourceProbeName,
    coordinates,
    uiLayer,
    probePanel,
    displayWeighting,
    readCssVar,
  });
}

// disableRayVisualization wrapper
function disableRayVisualization() {
  const rayVizElements: RayVizElements = {
    card: rayVizCard,
    toggle: rayVizToggle,
    paths: rayVizPaths,
    phaseInfo: rayVizPhaseInfo,
    dominant: rayVizDominant,
  };
  disableRayVisualizationFromModule(rayVizElements, requestRender);
}

// drawTracedRays wrapper
function drawTracedRays() {
  drawTracedRaysFromModule(ctx, worldToCanvas);
}

// prunePinnedProbes wrapper
function prunePinnedProbes() {
  const probeIds = new Set(scene.probes.map((probe) => probe.id));
  for (const id of Array.from(getPinnedProbePanels().keys())) {
    if (!probeIds.has(id)) {
      removePinnedProbeFromModule(id);
    }
  }
}

// clearPinnedProbes wrapper
function clearPinnedProbes() {
  for (const id of Array.from(getPinnedProbePanels().keys())) {
    removePinnedProbeFromModule(id);
  }
}

/** Create a pinned inspector panel for a non-probe element */
/** Build elements for pinned panel creation */
function buildPinnedPanelElements(): PinnedPanelElements {
  return {
    uiLayer: uiLayer!,
    contextPanel,
  };
}

/** Build callbacks for pinned panel operations */
function buildPinnedPanelCallbacks(): PinnedPanelCallbacks {
  return {
    selectionTypeLabel,
    renderPropertiesFor,
    renderPanelLegendFor,
    renderPanelStatsFor,
  };
}

/** Create a pinned inspector panel for a non-probe element */
function createPinnedContextPanel(sel: Selection) {
  if (!uiLayer) return;
  createPinnedContextPanelModule(sel, buildPinnedPanelElements(), scene, buildPinnedPanelCallbacks());
}

/** Refresh all pinned context panels (e.g., when element data changes via drag) */
function refreshPinnedContextPanels() {
  refreshPinnedContextPanelsModule({
    renderPropertiesFor,
    renderPanelLegendFor,
    renderPanelStatsFor,
  });
}

function refreshNoiseMapVisualization() {
  renderNoiseMapLegend();
  if (!noiseMap) {
    requestRender();
    return;
  }
  const range = getActiveMapRange();
  const texture = buildNoiseMapTexture(noiseMap, range);
  if (!texture) return;
  noiseMap.texture = texture;
  requestRender();
}

// === Spectrum Functions (delegating to ui/spectrum module) ===

/** Wrapper for createSpectrumEditor that passes displayWeighting and readCssVar */
function createSpectrumEditor(
  source: Source,
  onChangeSpectrum: (spectrum: Spectrum9) => void,
  onChangeGain: (gain: number) => void
): HTMLElement {
  return createSpectrumEditorModule(source, onChangeSpectrum, onChangeGain, displayWeighting, readCssVar);
}

/** Build context for renderSources module */
function buildSourcesContext(): SourcesContext {
  return {
    sources: scene.sources,
    selection,
    soloSourceId,
    collapsedSources,
    displayWeighting,
    isSourceEnabled,
  };
}

/** Build callbacks for renderSources module */
function buildSourcesCallbacks(): SourcesCallbacks {
  return {
    onMarkDirty: markDirty,
    onPushHistory: pushHistory,
    onSetSelection: setSelection,
    onRenderProperties: renderProperties,
    onComputeScene: computeScene,
    onSoloToggle: (sourceId: string) => {
      soloSourceId = soloSourceId === sourceId ? null : sourceId;
      return soloSourceId;
    },
    onRenderSources: renderSources,
  };
}

/** Render sources list - wrapper for module */
function renderSources() {
  if (!sourceTable) return;
  renderSourcesModule(
    sourceTable,
    buildSourcesContext(),
    buildSourcesCallbacks(),
    sourceSumMode
  );
}

function duplicateSource(source: Source): Source {
  return duplicateSourceEntity(source, sourceSeq++);
}

function duplicateReceiver(receiver: Receiver): Receiver {
  return duplicateReceiverEntity(receiver, receiverSeq++);
}

function duplicateProbe(probe: Probe): Probe {
  return duplicateProbeEntity(probe, probeSeq++);
}

function duplicatePanel(panel: Panel): Panel {
  return duplicatePanelEntity(panel, panelSeq++);
}

function duplicateBarrier(barrier: Barrier): Barrier {
  return duplicateBarrierEntity(barrier, barrierSeq++);
}

function duplicateBuilding(building: Building): Building {
  return duplicateBuildingEntity(building, buildingSeq++);
}

function setActiveTool(tool: Tool) {
  activeTool = tool;
  if (tool !== 'add-barrier') {
    barrierDraft = null;
    barrierDraftAnchored = false;
    barrierDragActive = false;
    barrierCenterDraft = null;
  }
  if (tool !== 'add-building') {
    buildingDraft = null;
    buildingDraftAnchored = false;
    buildingDragActive = false;
    buildingCenterDraft = null;
    buildingPolygonDraft = [];
    buildingPolygonPreviewPoint = null;
  }
  if (modeLabel) {
    modeLabel.textContent = toolLabel(tool);
  }
  if (debugMode) {
    debugMode.textContent = toolLabel(tool);
  }

  if (toolGrid) {
    const buttons = toolGrid.querySelectorAll<HTMLButtonElement>('button[data-tool]');
    buttons.forEach((button) => {
      const isActive = button.dataset.tool === tool;
      button.classList.toggle('is-active', isActive);
    });
  }
}

function setSelection(next: Selection) {
  selection = next;
  for (const building of scene.buildings) {
    building.selected = isElementSelected(selection, 'building', building.id);
  }
  const current = selection;
  if (current.type === 'probe') {
    setActiveProbe(current.id);
  }

  // Reveal the context inspector when there's a valid selection to show,
  // BUT not if the element already has a pinned panel
  if (contextPanel) {
    const hasInspectorContent = current.type !== 'none' && current.type !== 'probe';
    const isAlreadyPinned = hasInspectorContent && isElementPinned(current);
    const shouldShowPanel = hasInspectorContent && !isAlreadyPinned;
    contextPanel.classList.toggle('is-open', shouldShowPanel);
    contextPanel.setAttribute('aria-hidden', shouldShowPanel ? 'false' : 'true');
    // Bring context panel to front when opening so it appears above pinned panels
    if (shouldShowPanel) {
      bringPanelToFront(contextPanel);
    }
  }
  // Hide pin button for multi-selection (can't pin multiple elements)
  if (contextPin) {
    contextPin.style.display = current.type === 'multi' ? 'none' : '';
  }
  if (panelStatsSection) {
    panelStatsSection.classList.toggle('is-hidden', current.type !== 'panel');
  }
  updateContextTitle();
  if (selectionHint) {
    selectionHint.classList.toggle('is-hidden', current.type !== 'none');
  }
  renderProperties();
  renderSources();
  renderPanelLegend();
  renderPanelStats();
  requestRender();
}

/** Check if an element already has a pinned context panel */
function isElementPinned(sel: Selection): boolean {
  if (sel.type === 'none' || sel.type === 'probe' || sel.type === 'multi') return false;
  return pinnedContextPanels.some(
    (pinned) => pinned.selection.type !== 'none' && pinned.selection.type !== 'multi' &&
                pinned.selection.type === sel.type && pinned.selection.id === sel.id
  );
}

/** Get the display name for the currently selected element */
function getSelectedElementName(): string {
  const current = selection;
  if (current.type === 'none') return 'Select an element';
  if (current.type === 'multi') return `${current.items.length} items selected`;

  const defaultName = `${selectionTypeLabel(current.type)} ${current.id.toUpperCase()}`;

  if (current.type === 'source') {
    const source = scene.sources.find(s => s.id === current.id);
    return source?.name || defaultName;
  }
  if (current.type === 'receiver') {
    const receiver = scene.receivers.find(r => r.id === current.id);
    return receiver?.name || defaultName;
  }
  if (current.type === 'panel') {
    const panel = scene.panels.find(p => p.id === current.id);
    return panel?.name || `Grid ${current.id.toUpperCase()}`;
  }
  if (current.type === 'barrier') {
    const barrier = scene.barriers.find(b => b.id === current.id);
    return barrier?.name || defaultName;
  }
  if (current.type === 'building') {
    const building = scene.buildings.find(b => b.id === current.id);
    return building?.name || defaultName;
  }
  return defaultName;
}

/** Update the selected element's name */
function setSelectedElementName(name: string): void {
  const current = selection;
  if (current.type === 'none') return;

  if (current.type === 'source') {
    const source = scene.sources.find(s => s.id === current.id);
    if (source) source.name = name;
  } else if (current.type === 'receiver') {
    const receiver = scene.receivers.find(r => r.id === current.id);
    if (receiver) receiver.name = name;
  } else if (current.type === 'panel') {
    const panel = scene.panels.find(p => p.id === current.id);
    if (panel) panel.name = name;
  } else if (current.type === 'barrier') {
    const barrier = scene.barriers.find(b => b.id === current.id);
    if (barrier) barrier.name = name;
  } else if (current.type === 'building') {
    const building = scene.buildings.find(b => b.id === current.id);
    if (building) building.name = name;
  }

  markDirty();
  pushHistory();
  requestRender();
}

/** Update the context panel title with the selected element name */
function updateContextTitle(): void {
  if (!contextTitle) return;
  const current = selection;
  if (current.type === 'none') {
    contextTitle.textContent = 'Select an element';
    contextTitle.title = '';
    return;
  }

  if (current.type === 'multi') {
    contextTitle.textContent = `${current.items.length} items selected`;
    contextTitle.title = '';
    return;
  }

  const displayName = getSelectedElementName();
  contextTitle.textContent = displayName;
  contextTitle.title = 'Double-click to edit name';
}

function renderProperties() {
  if (!propertiesBody) return;
  propertiesBody.innerHTML = '';
  renderPropertiesFor(selection, propertiesBody);
}

/** Build properties callbacks for delegation to module */
function buildPropertiesCallbacks(): PropertiesCallbacks {
  return {
    pushHistory,
    computeScene,
    refreshPinnedContextPanels,
    setSelection,
    duplicateMultiSelection,
    deleteSelection,
    getSelectedCount,
    createSpectrumEditor,
  };
}

/** Render interactive property controls for a selection into a container */
function renderPropertiesFor(current: Selection, container: HTMLElement) {
  renderPropertiesForModule(current, container, scene, buildPropertiesCallbacks());
}

function setComputeChip(label: string, state: 'ready' | 'busy' | 'warning' | 'error') {
  if (!computeChip) return;
  computeChip.textContent = label;
  computeChip.dataset.state = state;
  computeChip.setAttribute('aria-label', label);
}

function updateComputeButtonState(computing: boolean) {
  if (!computeButton) return;
  computeButton.textContent = computing ? 'Cancel' : 'Compute';
  computeButton.classList.toggle('is-cancel', computing);
  computeButton.title = computing ? 'Cancel the current compute.' : 'Run propagation and update receiver/grid levels.';
}

function updateComputeChip(isBusy: boolean) {
  if (isBusy) {
    setComputeChip('Computing...', 'busy');
    if (computeChip) computeChip.title = '';
    return;
  }

  const preference = getComputePreference();
  const resolved = resolveBackend(preference, capability);
  if (resolved.warning) {
    setComputeChip('Using CPU (GPU soon)', 'warning');
    if (computeChip) computeChip.title = '';
    return;
  }

  setComputeChip('Ready', 'ready');
}

function updateComputeUI() {
  updateComputeButtonState(isComputing);
  updateComputeChip(isComputing);
}

function updateMapButtonState() {
  if (!meshButton) return;
  meshButton.textContent = isMapComputing ? 'Cancel Map' : 'Generate Map';
  meshButton.classList.toggle('is-cancel', isMapComputing);
}

function setMapToast(message: string | null, state: 'busy' | 'ready' | 'error' = 'busy', autoHideMs?: number) {
  if (!mapToast) return;
  if (mapToastTimer) {
    window.clearTimeout(mapToastTimer);
    mapToastTimer = null;
  }
  if (!message) {
    mapToast.classList.remove('is-visible');
    return;
  }
  mapToast.textContent = message;
  mapToast.dataset.state = state;
  mapToast.classList.add('is-visible');
  if (autoHideMs) {
    mapToastTimer = window.setTimeout(() => {
      mapToast?.classList.remove('is-visible');
    }, autoHideMs);
  }
}

function updateMapUI() {
  updateMapButtonState();
}

// === Map/Display Settings Thin Wrappers ===

function buildMapSettingsElements(): MapSettingsElements {
  return { mapRenderStyleToggle, mapBandStepInput, mapBandStepRow, mapAutoScaleToggle };
}

function buildMapSettingsState(): MapSettingsState {
  return { mapRenderStyle, mapBandStep, mapAutoScale, displayBand };
}

function buildMapSettingsCallbacks(): MapSettingsCallbacks {
  return {
    getMapBandStep,
    setMapRenderStyle: (style) => { mapRenderStyle = style; },
    setMapBandStep: (step) => { mapBandStep = step; },
    setMapAutoScale: (autoScale) => { mapAutoScale = autoScale; },
    onRefreshVisualization: refreshNoiseMapVisualization,
  };
}

function buildDisplaySettingsElements(): DisplaySettingsElements {
  return { displayWeightingSelect, displayBandSelect };
}

function buildDisplaySettingsState(): DisplaySettingsState {
  return { displayWeighting, displayBand };
}

function buildDisplaySettingsCallbacks(): DisplaySettingsCallbacks {
  return {
    setDisplayWeighting: (weighting) => { displayWeighting = weighting; },
    setDisplayBand: (band) => { displayBand = band; },
    setMapBandStep: (step) => { mapBandStep = step; },
    updateMapSettingsControls,
    renderSources,
    renderResults,
    renderProperties,
    isNoiseMapVisible: () => layers.noiseMap,
    recomputeNoiseMap: (requestId) => {
      void computeNoiseMapInternal({ resolutionPx: RES_HIGH, silent: false, requestId });
    },
    requestRender,
  };
}

function updateMapSettingsControls() {
  updateMapSettingsControlsModule(buildMapSettingsElements(), buildMapSettingsState(), getMapBandStep);
}

function wireMapSettings() {
  wireMapSettingsModule(buildMapSettingsElements(), buildMapSettingsState(), buildMapSettingsCallbacks());
}

function wireDisplaySettings() {
  wireDisplaySettingsModule(buildDisplaySettingsElements(), buildDisplaySettingsState(), buildDisplaySettingsCallbacks());
}

function wireRefineButton() {
  if (!refineButton) return;
  refineButton.addEventListener('click', () => {
    // Manual refine overrides any queued low-res update.
    queuedMapResolutionPx = null;
    setInteractionActive(false);
    ctx.imageSmoothingEnabled = false;
    // Force a high-resolution map recompute even if layers.noiseMap is currently off
    // Refine uses REFINE_POINTS (75,000) for maximum detail
    if (layers.noiseMap) {
      void computeNoiseMapInternal({ resolutionPx: RES_HIGH, maxPoints: REFINE_POINTS, silent: false, requestId: 'grid:refine' });
    } else {
      // Enable the noise map layer and compute
      layers.noiseMap = true;
      if (layerNoiseMap) layerNoiseMap.checked = true;
      void computeNoiseMapInternal({ resolutionPx: RES_HIGH, maxPoints: REFINE_POINTS, silent: false, requestId: 'grid:refine' });
    }
    needsUpdate = true;
    requestRender();
  });
}

function wireLayersPopover() {
  if (!layersButton || !layersPopover) return;
  const container = layersButton.closest('.layers-toggle') as HTMLDivElement | null;
  if (!container) return;

  // Keep the popover lightweight: no modal, just a click-away dropdown.
  // Popover is outside the topbar (to escape backdrop-filter stacking context),
  // so we toggle .is-open on the popover itself for CSS transitions.
  const close = () => {
    layersPopover.classList.remove('is-open');
    layersButton.setAttribute('aria-expanded', 'false');
    layersPopover.setAttribute('aria-hidden', 'true');
  };

  const toggle = () => {
    const isOpen = layersPopover.classList.toggle('is-open');
    layersButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    layersPopover.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  };

  layersButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggle();
  });

  document.addEventListener('click', (event) => {
    // Close if click is outside both the button container and the popover
    if (!container.contains(event.target as Node) && !layersPopover.contains(event.target as Node)) {
      close();
    }
  });

  window.addEventListener('resize', close);
}

function wireSettingsPopover() {
  if (!settingsButton || !settingsPopover) return;

  const container = settingsButton.closest('.settings-toggle') as HTMLDivElement | null;
  if (!container) return;

  // Get category buttons from main popover
  const categoryButtons = settingsPopover.querySelectorAll('.settings-category-btn') as NodeListOf<HTMLButtonElement>;

  // Get the separate slide popup and its panels
  const slidePopup = document.querySelector('#settingsSlidePopup') as HTMLDivElement | null;
  const slidePanels = slidePopup?.querySelectorAll('.settings-slide-panel') as NodeListOf<HTMLDivElement> | undefined;

  // State
  let activeCategory: 'display' | 'environmental' | 'physics' | 'layers' | null = null;

  // Move popover and slide popup to body to escape all stacking contexts
  document.body.appendChild(settingsPopover);
  if (slidePopup) {
    document.body.appendChild(slidePopup);
  }

  const updatePosition = () => {
    const buttonRect = settingsButton.getBoundingClientRect();
    settingsPopover.style.position = 'fixed';
    settingsPopover.style.bottom = `${window.innerHeight - buttonRect.top + 12}px`;
    settingsPopover.style.right = `${window.innerWidth - buttonRect.right}px`;
    settingsPopover.style.left = 'auto';
    settingsPopover.style.top = 'auto';
  };

  const updateSlidePopupPosition = () => {
    if (!slidePopup) return;
    // Position slide popup to the LEFT of the main popover
    const popoverRect = settingsPopover.getBoundingClientRect();
    slidePopup.style.position = 'fixed';
    slidePopup.style.bottom = `${window.innerHeight - popoverRect.bottom}px`;
    slidePopup.style.right = `${window.innerWidth - popoverRect.left + 12}px`;
    slidePopup.style.left = 'auto';
    slidePopup.style.top = 'auto';
  };

  // Show a specific category panel in the slide popup
  const showPanel = (category: 'display' | 'environmental' | 'physics' | 'layers') => {
    activeCategory = category;

    // Update buttons: make clicked one active
    categoryButtons.forEach((btn) => {
      const btnCategory = btn.dataset.category;
      if (btnCategory === category) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }
    });

    // Show the corresponding panel in slide popup
    slidePanels?.forEach((panel) => {
      if (panel.dataset.panel === category) {
        panel.classList.add('is-open');
      } else {
        panel.classList.remove('is-open');
      }
    });

// Open the slide popup
    if (slidePopup) {
      slidePopup.classList.add('is-open');
      slidePopup.setAttribute('aria-hidden', 'false');
      updateSlidePopupPosition();
      // Re-render KaTeX equations in the visible panel
      rerenderKatex(slidePopup);
    }
  };

  // Close the slide popup
  const hidePanel = () => {
    activeCategory = null;

    // Reset all buttons
    categoryButtons.forEach((btn) => {
      btn.classList.remove('is-active');
    });

    // Hide all panels
    slidePanels?.forEach((panel) => {
      panel.classList.remove('is-open');
    });

    // Close the slide popup
    if (slidePopup) {
      slidePopup.classList.remove('is-open');
      slidePopup.setAttribute('aria-hidden', 'true');
    }
  };

  const close = () => {
    container.classList.remove('is-open');
    settingsPopover.classList.remove('is-open');
    settingsButton.setAttribute('aria-expanded', 'false');
    settingsPopover.setAttribute('aria-hidden', 'true');
    // Also close the slide popup
    hidePanel();
  };

  const open = () => {
    container.classList.add('is-open');
    settingsPopover.classList.add('is-open');
    settingsButton.setAttribute('aria-expanded', 'true');
    settingsPopover.setAttribute('aria-hidden', 'false');
    updatePosition();
  };

  const toggle = () => {
    const isOpen = settingsPopover.classList.contains('is-open');
    if (isOpen) {
      close();
    } else {
      open();
    }
  };

  // Wire category button clicks
  categoryButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.category as 'display' | 'environmental' | 'physics' | 'layers' | undefined;
      if (!category) return;

      if (activeCategory === category) {
        // Clicking the active button closes the slide popup
        hidePanel();
      } else {
        showPanel(category);
      }
    });
  });

  settingsButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggle();
  });

  document.addEventListener('click', (event) => {
    const target = event.target as Node;
    const clickedInPopover = settingsPopover.contains(target);
    const clickedInSlidePopup = slidePopup?.contains(target) ?? false;
    const clickedInContainer = container.contains(target);

    if (!clickedInContainer && !clickedInPopover && !clickedInSlidePopup) {
      close();
    }
  });

  window.addEventListener('resize', () => {
    if (settingsPopover.classList.contains('is-open')) {
      updatePosition();
      if (slidePopup?.classList.contains('is-open')) {
        updateSlidePopupPosition();
      }
    }
  });
  window.addEventListener('scroll', () => {
    if (settingsPopover.classList.contains('is-open')) {
      updatePosition();
      if (slidePopup?.classList.contains('is-open')) {
        updateSlidePopupPosition();
      }
    }
});
}

// Wire up equation collapsible toggles
function wireEquationCollapsibles() {
  wireEquationCollapsiblesModule(buildEquationElements());
}

// === Equation Functions (delegating to ui/equations module) ===

/** Build EquationElements from global DOM references */
function buildEquationElements(): EquationElements {
  return {
    groundModelEquation,
    impedanceEquation,
    propagationGroundModel,
    propagationSpreading,
    probeImpedanceModel,
    propagationGroundMixedSigmaModel,
    propagationBarrierSideDiffraction,
    propagationAbsorption,
  };
}

/** Update all equation displays to match current dropdown values */
function updateAllEquations() {
  updateAllEquationsModule(buildEquationElements());
}

// Wire up Probe Engine controls (future: connect to probe config)
function wireProbeEngineControls() {
  // These toggles will eventually be wired to probe calculation config
  // For now, just log changes for testing
  /* eslint-disable no-console */
  probeGroundReflection?.addEventListener('change', () => {
    console.log('[Probe] Ground Reflection:', probeGroundReflection.checked);
  });

  probeWallReflections?.addEventListener('change', () => {
    console.log('[Probe] Wall Reflections:', probeWallReflections.checked);
  });

  probeBarrierDiffraction?.addEventListener('change', () => {
    console.log('[Probe] Barrier Diffraction:', probeBarrierDiffraction.checked);
  });

  probeSommerfeldCorrection?.addEventListener('change', () => {
    console.log('[Probe] Sommerfeld Correction:', probeSommerfeldCorrection.checked);
  });

  probeImpedanceModel?.addEventListener('change', () => {
    console.log('[Probe] Impedance Model:', probeImpedanceModel.value);
  });

  // Helper to update impedance model availability based on ground model
  function updateImpedanceModelAvailability() {
    if (!probeImpedanceModel || !probeGroundModel) return;
    const isImpedanceMode = probeGroundModel.value === 'impedance';
    probeImpedanceModel.disabled = !isImpedanceMode;
    // Also update visual styling of the parent label
    const parentLabel = probeImpedanceModel.closest('label');
    if (parentLabel) {
      parentLabel.style.opacity = isImpedanceMode ? '1' : '0.5';
      parentLabel.style.pointerEvents = isImpedanceMode ? 'auto' : 'none';
    }
  }

  probeGroundModel?.addEventListener('change', () => {
    console.log('[Probe] Ground Model:', probeGroundModel.value);
    updateImpedanceModelAvailability();
  });

  // Initialize impedance model availability on load
  updateImpedanceModelAvailability();
  /* eslint-enable no-console */
}

function wireThemeSwitcher() {
  const storedTheme = getSavedTheme();
  applyAndPersistTheme(storedTheme);
  if (!themeOptions.length) return;

  themeOptions.forEach((button) => {
    button.addEventListener('click', () => {
      const option = button.dataset.themeOption as Theme | undefined;
      if (!option) return;
      if (option === 'neumorphic' && !isNeumorphismAllowed()) {
        applyAndPersistTheme('default');
        return;
      }
      applyAndPersistTheme(option);
    });
  });
}

function wirePreference() {
  if (!preferenceSelect) return;
  const storedPreference = loadPreference();
  const gpuOption = preferenceSelect.querySelector('option[value="gpu"]') as HTMLOptionElement | null;
  const gpuUnavailable = !gpuOption || gpuOption.disabled;
  let initialPreference: ComputePreference = storedPreference === 'gpu' ? 'gpu' : 'cpu';
  if (storedPreference === 'auto') {
    initialPreference = 'cpu';
  }
  if (gpuUnavailable) {
    initialPreference = 'cpu';
  }
  preferenceSelect.value = initialPreference;
  if (storedPreference !== initialPreference) {
    savePreference(initialPreference);
  }
  updateComputeUI();

  preferenceSelect.addEventListener('change', () => {
    const preference = preferenceSelect.value as ComputePreference;
    savePreference(preference);
    updateComputeUI();
    computeScene();
  });
}

function wireLayerToggle(input: HTMLInputElement | null, key: keyof typeof layers) {
  if (!input) return;
  input.addEventListener('change', () => {
    layers[key] = input.checked;
    if (debugLayer && input.checked) {
      debugLayer.textContent = layerLabels[key];
    }
    requestRender();
  });
}

function downloadCsv() {
  const csv = buildCsv(results);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'geonoise-results.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Drawing mode submenu - thin wrapper around ui/toolbar module
function showDrawingModeSubmenu(tool: 'add-building' | 'add-barrier', button: HTMLElement) {
  const isBuilding = tool === 'add-building';
  const currentMode = isBuilding ? buildingDrawingMode : barrierDrawingMode;
  showDrawingModeSubmenuModule(tool, button, currentMode, (mode) => {
    if (isBuilding) {
      buildingDrawingMode = mode as BuildingDrawingMode;
    } else {
      barrierDrawingMode = mode as BarrierDrawingMode;
    }
  });
}

function wireTools() {
  if (!toolGrid) return;
  toolGrid.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const button = target.closest<HTMLButtonElement>('button[data-tool]');
    if (!button) return;
    const tool = button.dataset.tool as Tool;

    // Check if this tool supports drawing mode submenu
    const supportsSubmenu = tool === 'add-building' || tool === 'add-barrier';

    // If clicking on already-active tool that supports submenu, show the submenu
    if (supportsSubmenu && activeTool === tool) {
      showDrawingModeSubmenu(tool as 'add-building' | 'add-barrier', button);
    } else {
      // Otherwise, select the tool
      setActiveTool(tool);
    }
  });
}

function wireDockLabels() {
  if (!toolGrid || !dockLabelStage || !dockLabelText) return;

  const showLabel = (label: string) => {
    dockLabelText.textContent = label;
    dockLabelStage.classList.add('is-visible');
  };

  const hideLabel = () => {
    dockLabelStage.classList.remove('is-visible');
  };

  const resolveButton = (target: EventTarget | null) =>
    (target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-label]') ?? null;

  toolGrid.addEventListener('mouseover', (event) => {
    const button = resolveButton(event.target);
    if (!button) return;
    const label = button.dataset.label;
    if (!label) return;
    showLabel(label);
  });

  toolGrid.addEventListener('mouseout', (event) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && toolGrid.contains(nextTarget)) return;
    hideLabel();
  });

  toolGrid.addEventListener('focusin', (event) => {
    const button = resolveButton(event.target);
    if (!button) return;
    const label = button.dataset.label;
    if (!label) return;
    showLabel(label);
  });

  toolGrid.addEventListener('focusout', (event) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && toolGrid.contains(nextTarget)) return;
    hideLabel();
  });
}

let dockCollapseTimeout: ReturnType<typeof setTimeout> | null = null;
let dockInactivityTimeout: ReturnType<typeof setTimeout> | null = null;
let dockHasToolEngaged = false; // True when user clicked a non-select tool

function wireDockExpand() {
  if (!dock || !dockFab || !dockExpandable || !toolGrid) return;

  const HOVER_COLLAPSE_DELAY = 150; // Quick collapse on hover-out (no tool clicked)
  const INACTIVITY_COLLAPSE_DELAY = 4000; // 4 seconds after tool engagement

  const expandDock = () => {
    if (dockCollapseTimeout) {
      clearTimeout(dockCollapseTimeout);
      dockCollapseTimeout = null;
    }
    if (dockInactivityTimeout) {
      clearTimeout(dockInactivityTimeout);
      dockInactivityTimeout = null;
    }
    dock.classList.add('is-expanded');
    dockFab.setAttribute('aria-expanded', 'true');
  };

  const collapseDock = () => {
    dock.classList.remove('is-expanded');
    dockFab.setAttribute('aria-expanded', 'false');
    dockHasToolEngaged = false;
    // Reset to select tool when dock collapses
    setActiveTool('select');
  };

  const scheduleHoverCollapse = () => {
    // Only use quick collapse if no tool was engaged
    if (dockHasToolEngaged) return;
    if (dockCollapseTimeout) clearTimeout(dockCollapseTimeout);
    dockCollapseTimeout = setTimeout(() => {
      collapseDock();
      dockCollapseTimeout = null;
    }, HOVER_COLLAPSE_DELAY);
  };

  const resetInactivityTimer = () => {
    if (dockInactivityTimeout) clearTimeout(dockInactivityTimeout);
    dockInactivityTimeout = setTimeout(() => {
      collapseDock();
      dockInactivityTimeout = null;
    }, INACTIVITY_COLLAPSE_DELAY);
  };

  // Click on FAB expands the dock
  dockFab.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dock.classList.contains('is-expanded')) {
      collapseDock();
    } else {
      expandDock();
    }
  });

  // Listen for tool button clicks to engage "tool mode"
  toolGrid.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const button = target.closest<HTMLButtonElement>('button[data-tool]');
    if (!button) return;
    const tool = button.dataset.tool;

    // If clicking select tool, collapse immediately
    if (tool === 'select') {
      collapseDock();
      return;
    }

    // Non-select tool clicked - engage tool mode
    dockHasToolEngaged = true;
    // Clear any pending hover collapse
    if (dockCollapseTimeout) {
      clearTimeout(dockCollapseTimeout);
      dockCollapseTimeout = null;
    }
    // Start inactivity timer
    resetInactivityTimer();
  });

  // Hover behavior
  dock.addEventListener('mouseenter', () => {
    expandDock();
  });

  dock.addEventListener('mouseleave', () => {
    if (dockHasToolEngaged) {
      // Tool is engaged, don't collapse on hover-out
      // Just let the inactivity timer handle it
      return;
    }
    scheduleHoverCollapse();
  });

  // Keep dock open while interacting with it (cancel hover collapse)
  dockExpandable.addEventListener('mouseenter', () => {
    if (dockCollapseTimeout) {
      clearTimeout(dockCollapseTimeout);
      dockCollapseTimeout = null;
    }
  });

  // Keyboard accessibility
  dockFab.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (dock.classList.contains('is-expanded')) {
        collapseDock();
      } else {
        expandDock();
      }
    }
  });

  // Close when clicking outside (only if no tool engaged)
  document.addEventListener('click', (e) => {
    if (!dock.contains(e.target as Node) && dock.classList.contains('is-expanded')) {
      if (!dockHasToolEngaged) {
        collapseDock();
      }
    }
  });
}

// Reset inactivity timer when user adds something (call this from add handlers)
function resetDockInactivityTimer() {
  if (!dockHasToolEngaged) return;
  if (dockInactivityTimeout) clearTimeout(dockInactivityTimeout);
  dockInactivityTimeout = setTimeout(() => {
    const dockEl = document.querySelector('#dock');
    if (dockEl) {
      dockEl.classList.remove('is-expanded');
      const fabEl = document.querySelector('#dockFab');
      if (fabEl) fabEl.setAttribute('aria-expanded', 'false');
    }
    dockHasToolEngaged = false;
    setActiveTool('select');
    dockInactivityTimeout = null;
  }, 4000);
}

function hitTestPanelHandle(point: Point) {
  const current = selection;
  if (current.type !== 'panel') return null;
  const panel = scene.panels.find((item) => item.id === current.id);
  if (!panel) return null;
  const hitRadius = 10;
  for (let i = 0; i < panel.points.length; i += 1) {
    const screen = worldToCanvas(panel.points[i]);
    if (distance(screen, point) <= hitRadius) {
      return { panelId: panel.id, index: i };
    }
  }
  return null;
}

function hitTestBarrierHandle(point: Point): { type: 'p1' | 'p2' | 'rotate' } | null {
  const current = selection;
  if (current.type !== 'barrier') return null;
  const barrier = scene.barriers.find((item) => item.id === current.id);
  if (!barrier) return null;

  // Test endpoint handles (p1 and p2)
  const p1Screen = worldToCanvas(barrier.p1);
  if (distance(p1Screen, point) <= BARRIER_HANDLE_HIT_RADIUS) {
    return { type: 'p1' as const };
  }
  const p2Screen = worldToCanvas(barrier.p2);
  if (distance(p2Screen, point) <= BARRIER_HANDLE_HIT_RADIUS) {
    return { type: 'p2' as const };
  }

  // Test rotation handle (perpendicular from midpoint)
  const handleOffset = BARRIER_ROTATION_HANDLE_OFFSET_PX / pixelsPerMeter;
  const handleWorld = getBarrierRotationHandlePosition(barrier, handleOffset);
  const handleCanvas = worldToCanvas(handleWorld);
  if (distance(handleCanvas, point) <= BARRIER_HANDLE_HIT_RADIUS) {
    return { type: 'rotate' as const };
  }

  return null;
}

function hitTestBuildingHandle(point: Point) {
  const current = selection;
  if (current.type !== 'building') return null;
  const building = scene.buildings.find((item) => item.id === current.id);
  if (!building) return null;
  const vertices = building.getVertices();
  for (let i = 0; i < vertices.length; i += 1) {
    const screen = worldToCanvas(vertices[i]);
    if (distance(screen, point) <= BUILDING_HANDLE_HIT_RADIUS) {
      return { type: 'corner' as const, index: i };
    }
  }
  const handleOffset = BUILDING_ROTATION_HANDLE_OFFSET_PX / pixelsPerMeter;
  const handleWorld = building.getRotationHandlePosition(handleOffset);
  const handleCanvas = worldToCanvas(handleWorld);
  if (distance(handleCanvas, point) <= BUILDING_HANDLE_HIT_RADIUS) {
    return { type: 'rotate' as const };
  }
  return null;
}

function getElementsInSelectBox(startCanvas: Point, endCanvas: Point): SelectionItem[] {
  const items: SelectionItem[] = [];

  const minX = Math.min(startCanvas.x, endCanvas.x);
  const maxX = Math.max(startCanvas.x, endCanvas.x);
  const minY = Math.min(startCanvas.y, endCanvas.y);
  const maxY = Math.max(startCanvas.y, endCanvas.y);

  const isInBox = (canvasPoint: Point) =>
    canvasPoint.x >= minX && canvasPoint.x <= maxX && canvasPoint.y >= minY && canvasPoint.y <= maxY;

  for (const source of scene.sources) {
    const canvasPoint = worldToCanvas(source);
    if (isInBox(canvasPoint)) {
      items.push({ elementType: 'source', id: source.id });
    }
  }

  for (const receiver of scene.receivers) {
    const canvasPoint = worldToCanvas(receiver);
    if (isInBox(canvasPoint)) {
      items.push({ elementType: 'receiver', id: receiver.id });
    }
  }

  for (const probe of scene.probes) {
    const canvasPoint = worldToCanvas(probe);
    if (isInBox(canvasPoint)) {
      items.push({ elementType: 'probe', id: probe.id });
    }
  }

  for (const panel of scene.panels) {
    const centroid = getPanelCenter(panel);
    const canvasPoint = worldToCanvas(centroid);
    if (isInBox(canvasPoint)) {
      items.push({ elementType: 'panel', id: panel.id });
    }
  }

  for (const barrier of scene.barriers) {
    const midpoint = { x: (barrier.p1.x + barrier.p2.x) / 2, y: (barrier.p1.y + barrier.p2.y) / 2 };
    const canvasPoint = worldToCanvas(midpoint);
    if (isInBox(canvasPoint)) {
      items.push({ elementType: 'barrier', id: barrier.id });
    }
  }

  for (const building of scene.buildings) {
    const canvasPoint = worldToCanvas(building);
    if (isInBox(canvasPoint)) {
      items.push({ elementType: 'building', id: building.id });
    }
  }

  return items;
}

function hitTest(point: Point) {
  const threshold = 12;
  const hitSource = scene.sources.find((source) => {
    const screen = worldToCanvas(source);
    return distance(screen, point) <= threshold;
  });
  if (hitSource) return { type: 'source' as const, id: hitSource.id };

  const hitProbe = scene.probes.find((probe) => {
    const screen = worldToCanvas(probe);
    return distance(screen, point) <= threshold;
  });
  if (hitProbe) return { type: 'probe' as const, id: hitProbe.id };

  const hitReceiver = scene.receivers.find((receiver) => {
    const screen = worldToCanvas(receiver);
    return distance(screen, point) <= threshold;
  });
  if (hitReceiver) return { type: 'receiver' as const, id: hitReceiver.id };

  const hitBarrier = scene.barriers.find((barrier) => {
    // Barrier hit-test uses point-to-segment distance in screen space so selection is ergonomic even for thin lines.
    const p1 = worldToCanvas(barrier.p1);
    const p2 = worldToCanvas(barrier.p2);
    return distanceToSegment(point, p1, p2) <= 10;
  });
  if (hitBarrier) return { type: 'barrier' as const, id: hitBarrier.id };

  const world = canvasToWorld(point);
  const hitBuilding = scene.buildings.find((building) => pointInPolygon(world, building.getVertices()));
  if (hitBuilding) return { type: 'building' as const, id: hitBuilding.id };

  const hitPanel = scene.panels.find((panel) => pointInPolygon(world, panel.points));
  if (hitPanel) return { type: 'panel' as const, id: hitPanel.id };

  return null;
}

function deleteSelection(target: Selection) {
  if (target.type === 'multi') {
    for (const item of target.items) {
      if (item.elementType === 'source') {
        scene.sources = scene.sources.filter((s) => s.id !== item.id);
      }
      if (item.elementType === 'receiver') {
        scene.receivers = scene.receivers.filter((r) => r.id !== item.id);
      }
      if (item.elementType === 'probe') {
        scene.probes = scene.probes.filter((p) => p.id !== item.id);
        deleteProbeResult(item.id);
        unpinProbe(item.id);
        if (getActiveProbeId() === item.id) {
          setActiveProbe(null);
        }
      }
      if (item.elementType === 'panel') {
        scene.panels = scene.panels.filter((p) => p.id !== item.id);
      }
      if (item.elementType === 'barrier') {
        scene.barriers = scene.barriers.filter((b) => b.id !== item.id);
      }
      if (item.elementType === 'building') {
        scene.buildings = scene.buildings.filter((b) => b.id !== item.id);
      }
    }
    setSelection({ type: 'none' });
    updateCounts();
    pushHistory();
    computeScene();
    return;
  }
  if (target.type === 'source') {
    scene.sources = scene.sources.filter((item) => item.id !== target.id);
  }
  if (target.type === 'receiver') {
    scene.receivers = scene.receivers.filter((item) => item.id !== target.id);
  }
  if (target.type === 'probe') {
    scene.probes = scene.probes.filter((item) => item.id !== target.id);
    deleteProbeResult(target.id);
    unpinProbe(target.id);
    if (getActiveProbeId() === target.id) {
      setActiveProbe(null);
    }
  }
  if (target.type === 'panel') {
    scene.panels = scene.panels.filter((item) => item.id !== target.id);
  }
  if (target.type === 'barrier') {
    scene.barriers = scene.barriers.filter((item) => item.id !== target.id);
  }
  if (target.type === 'building') {
    scene.buildings = scene.buildings.filter((item) => item.id !== target.id);
  }
  setSelection({ type: 'none' });
  updateCounts();
  pushHistory();
  computeScene();
}

function duplicateMultiSelection(): void {
  const items = selectionToItems(selection);
  if (items.length === 0) return;

  const newItems: SelectionItem[] = [];
  const offset = 2;

  for (const item of items) {
    if (item.elementType === 'source') {
      const source = scene.sources.find((s) => s.id === item.id);
      if (source) {
        const dup = duplicateSource(source);
        dup.x += offset;
        dup.y -= offset;
        scene.sources.push(dup);
        newItems.push({ elementType: 'source', id: dup.id });
      }
    }
    if (item.elementType === 'receiver') {
      const receiver = scene.receivers.find((r) => r.id === item.id);
      if (receiver) {
        const dup = duplicateReceiver(receiver);
        dup.x += offset;
        dup.y -= offset;
        scene.receivers.push(dup);
        newItems.push({ elementType: 'receiver', id: dup.id });
      }
    }
    if (item.elementType === 'probe') {
      const probe = scene.probes.find((p) => p.id === item.id);
      if (probe) {
        const dup = duplicateProbe(probe);
        dup.x += offset;
        dup.y -= offset;
        scene.probes.push(dup);
        newItems.push({ elementType: 'probe', id: dup.id });
      }
    }
    if (item.elementType === 'panel') {
      const panel = scene.panels.find((p) => p.id === item.id);
      if (panel) {
        const dup = duplicatePanel(panel);
        dup.points = panel.points.map((pt) => ({ x: pt.x + offset, y: pt.y - offset }));
        scene.panels.push(dup);
        newItems.push({ elementType: 'panel', id: dup.id });
      }
    }
    if (item.elementType === 'barrier') {
      const barrier = scene.barriers.find((b) => b.id === item.id);
      if (barrier) {
        const dup = duplicateBarrier(barrier);
        dup.p1 = { x: barrier.p1.x + offset, y: barrier.p1.y - offset };
        dup.p2 = { x: barrier.p2.x + offset, y: barrier.p2.y - offset };
        scene.barriers.push(dup);
        newItems.push({ elementType: 'barrier', id: dup.id });
      }
    }
    if (item.elementType === 'building') {
      const building = scene.buildings.find((b) => b.id === item.id);
      if (building) {
        const dup = duplicateBuilding(building);
        dup.x += offset;
        dup.y -= offset;
        scene.buildings.push(dup);
        newItems.push({ elementType: 'building', id: dup.id });
      }
    }
  }

  setSelection(itemsToSelection(newItems));
  updateCounts();
  pushHistory();
  computeScene();
}

function selectAll(): void {
  const items: SelectionItem[] = [];

  for (const source of scene.sources) {
    items.push({ elementType: 'source', id: source.id });
  }
  for (const receiver of scene.receivers) {
    items.push({ elementType: 'receiver', id: receiver.id });
  }
  for (const probe of scene.probes) {
    items.push({ elementType: 'probe', id: probe.id });
  }
  for (const panel of scene.panels) {
    items.push({ elementType: 'panel', id: panel.id });
  }
  for (const barrier of scene.barriers) {
    items.push({ elementType: 'barrier', id: barrier.id });
  }
  for (const building of scene.buildings) {
    items.push({ elementType: 'building', id: building.id });
  }

  setSelection(itemsToSelection(items));
  requestRender();
}

function commitBarrierDraft() {
  if (!barrierDraft) return;
  // Commit the in-progress barrier draft into the scene list.
  //
  // Defaults:
  // - height: 3m, a typical small screen / fence / wall height for quick iteration.
  // - transmissionLoss: Infinity (placeholder). We currently model barriers as diffracting screens only;
  //   future work can incorporate transmissionLoss / attenuationDb as "through-barrier" energy reduction.
  const barrier: Barrier = {
    id: createId('b', barrierSeq++),
    p1: { ...barrierDraft.p1 },
    p2: { ...barrierDraft.p2 },
    height: 3,
    transmissionLoss: Number.POSITIVE_INFINITY,
  };
  scene.barriers.push(barrier);
  barrierDraft = null;
  barrierDraftAnchored = false;
  barrierDragActive = false;
  setSelection({ type: 'barrier', id: barrier.id });
  setActiveTool('select');
  updateCounts();
  pushHistory();
  computeScene();
  resetDockInactivityTimer();
}

function commitBuildingDraft() {
  if (!buildingDraft) return;

  // Calculate building dimensions from corner points
  const minX = Math.min(buildingDraft.corner1.x, buildingDraft.corner2.x);
  const maxX = Math.max(buildingDraft.corner1.x, buildingDraft.corner2.x);
  const minY = Math.min(buildingDraft.corner1.y, buildingDraft.corner2.y);
  const maxY = Math.max(buildingDraft.corner1.y, buildingDraft.corner2.y);

  const width = maxX - minX;
  const height = maxY - minY;

  // Minimum size check (at least 2m x 2m)
  if (width < 2 && height < 2) {
    // Too small, cancel draft
    buildingDraft = null;
    buildingDraftAnchored = false;
    buildingDragActive = false;
    requestRender();
    return;
  }

  // Calculate center point
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Ensure minimum dimensions
  const finalWidth = Math.max(2, width);
  const finalHeight = Math.max(2, height);

  const building = new Building({
    id: createId('bd', buildingSeq++),
    x: centerX,
    y: centerY,
    width: finalWidth,
    height: finalHeight,
    rotation: 0,
    z_height: 10, // Default height 10m
  });

  scene.buildings.push(building);
  buildingDraft = null;
  buildingDraftAnchored = false;
  buildingDragActive = false;
  setSelection({ type: 'building', id: building.id });
  setActiveTool('select');
  updateCounts();
  pushHistory();
  computeScene();
  resetDockInactivityTimer();
}

function commitBuildingCenterDraft() {
  if (!buildingCenterDraft) return;

  // Calculate building dimensions from center + corner
  // The corner represents one corner of the rectangle, so we mirror it to get the full extent
  const dx = Math.abs(buildingCenterDraft.corner.x - buildingCenterDraft.center.x);
  const dy = Math.abs(buildingCenterDraft.corner.y - buildingCenterDraft.center.y);

  const width = dx * 2;
  const height = dy * 2;

  // Minimum size check (at least 2m x 2m)
  if (width < 2 && height < 2) {
    buildingCenterDraft = null;
    buildingDragActive = false;
    requestRender();
    return;
  }

  // Ensure minimum dimensions
  const finalWidth = Math.max(2, width);
  const finalHeight = Math.max(2, height);

  const building = new Building({
    id: createId('bd', buildingSeq++),
    x: buildingCenterDraft.center.x,
    y: buildingCenterDraft.center.y,
    width: finalWidth,
    height: finalHeight,
    rotation: 0,
    z_height: 10, // Default height 10m
  });

  scene.buildings.push(building);
  buildingCenterDraft = null;
  buildingDragActive = false;
  setSelection({ type: 'building', id: building.id });
  setActiveTool('select');
  updateCounts();
  pushHistory();
  computeScene();
  resetDockInactivityTimer();
}

function commitBuildingPolygonDraft() {
  if (buildingPolygonDraft.length !== 4) return;

  // Ensure CCW winding order for correct physics normals
  const vertices = ensureCCW(buildingPolygonDraft);

  // Calculate centroid for the building's x/y position
  let cx = 0, cy = 0;
  for (const v of vertices) {
    cx += v.x;
    cy += v.y;
  }
  cx /= vertices.length;
  cy /= vertices.length;

  // Calculate bounding box for width/height (used for some legacy calculations)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }

  const building = new Building({
    id: createId('bd', buildingSeq++),
    x: cx,
    y: cy,
    width: maxX - minX,
    height: maxY - minY,
    rotation: 0,
    z_height: 10, // Default height 10m
    vertices: vertices, // Store the polygon vertices
  });

  scene.buildings.push(building);
  buildingPolygonDraft = [];
  buildingPolygonPreviewPoint = null;
  setSelection({ type: 'building', id: building.id });
  setActiveTool('select');
  updateCounts();
  pushHistory();
  computeScene();
  resetDockInactivityTimer();
}

function commitBarrierCenterDraft() {
  if (!barrierCenterDraft) return;

  // Calculate barrier endpoints from center + end
  // The end represents one endpoint, so we mirror it through center to get the full extent
  const dx = barrierCenterDraft.end.x - barrierCenterDraft.center.x;
  const dy = barrierCenterDraft.end.y - barrierCenterDraft.center.y;

  const p1: Point = {
    x: barrierCenterDraft.center.x - dx,
    y: barrierCenterDraft.center.y - dy,
  };
  const p2: Point = {
    x: barrierCenterDraft.center.x + dx,
    y: barrierCenterDraft.center.y + dy,
  };

  // Calculate length
  const length = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

  // Minimum length check (at least 1m)
  if (length < 1) {
    barrierCenterDraft = null;
    barrierDragActive = false;
    requestRender();
    return;
  }

  const barrier: Barrier = {
    id: createId('b', barrierSeq++),
    p1: p1,
    p2: p2,
    height: 3,
    transmissionLoss: Number.POSITIVE_INFINITY,
  };

  scene.barriers.push(barrier);
  barrierCenterDraft = null;
  barrierDragActive = false;
  setSelection({ type: 'barrier', id: barrier.id });
  setActiveTool('select');
  updateCounts();
  pushHistory();
  computeScene();
  resetDockInactivityTimer();
}

function addPanelAt(point: Point) {
  const size = 30;
  const half = size / 2;
  const panel: Panel = {
    id: createId('p', panelSeq++),
    points: [
      { x: point.x - half, y: point.y - half },
      { x: point.x + half, y: point.y - half },
      { x: point.x + half, y: point.y + half },
      { x: point.x - half, y: point.y + half },
    ],
    elevation: 1.5,
    sampling: { resolution: 10, pointCap: 300 },
  };
  scene.panels.push(panel);
  setSelection({ type: 'panel', id: panel.id });
  updateCounts();
  pushHistory();
  computeScene();
  resetDockInactivityTimer();
}

function addSourceAt(point: Point) {
  const defaultSpectrum = createFlatSpectrum(100) as Spectrum9;
  const source: Source = {
    id: createId('s', sourceSeq++),
    name: `Source ${sourceSeq - 1}`,
    x: point.x,
    y: point.y,
    z: 1.5,
    power: 100,
    spectrum: defaultSpectrum,
    gain: 0,
    enabled: true,
  };
  scene.sources.push(source);
  setSelection({ type: 'source', id: source.id });
  updateCounts();
  pushHistory();
  computeScene();
  resetDockInactivityTimer();
}

function addReceiverAt(point: Point) {
  const receiver: Receiver = {
    id: createId('r', receiverSeq++),
    x: point.x,
    y: point.y,
    z: 1.5,
  };
  scene.receivers.push(receiver);
  setSelection({ type: 'receiver', id: receiver.id });
  updateCounts();
  pushHistory();
  computeScene();
  resetDockInactivityTimer();
}

function addProbeAt(point: Point) {
  const probe: Probe = {
    id: createId('pr', probeSeq++),
    x: point.x,
    y: point.y,
    z: PROBE_DEFAULT_Z,
  };
  scene.probes.push(probe);
  setSelection({ type: 'probe', id: probe.id });
  pushHistory({ invalidateMap: false });
  requestRender();
  resetDockInactivityTimer();
}

function drawGrid() {
  const rect = canvas.getBoundingClientRect();
  drawGridModule(ctx, rect.width, rect.height, pixelsPerMeter, canvasTheme);
}

function drawNoiseMap() {
  if (!noiseMap) return;
  drawNoiseMapModule(ctx, noiseMap, worldToCanvas);
}

function drawSelectBox() {
  if (!dragState || dragState.type !== 'select-box') return;
  drawSelectBoxModule(ctx, dragState.startCanvasPoint, dragState.currentCanvasPoint);
}

function drawMeasurement() {
  if (!measureStart || !measureEnd) return;
  drawMeasurementModule(ctx, measureStart, measureEnd, worldToCanvas, canvasTheme, formatMeters);
}

function drawPanelSamples(panelResult: PanelResult) {
  if (!layers.panels) return;
  drawPanelSamplesModule(
    ctx,
    panelResult.samples,
    panelResult.LAeq_min,
    panelResult.LAeq_max,
    worldToCanvas,
    canvasTheme
  );
}

function drawPanels() {
  drawPanelsModule(
    ctx,
    scene.panels,
    worldToCanvas,
    canvasTheme,
    (id) => isElementSelected(selection, 'panel', id)
  );
}

function drawBuildings() {
  // Draw all buildings using the module
  drawBuildingsModule(ctx, scene.buildings, worldToCanvas, canvasTheme, pixelsPerMeter);

  // Draw building center draft preview
  if (buildingCenterDraft) {
    drawBuildingCenterDraft(ctx, buildingCenterDraft, worldToCanvas, canvasTheme);
  }

  // Draw polygon building draft preview (with validation)
  if (buildingPolygonDraft.length > 0) {
    drawBuildingPolygonDraftModule(
      ctx,
      buildingPolygonDraft,
      buildingPolygonPreviewPoint,
      worldToCanvas,
      canvasTheme,
      isValidQuadrilateral,
      canvas.width
    );
  }
}

function drawBarriers() {
  // Draw all barriers using the module
  drawBarriersModule(
    ctx,
    scene.barriers,
    worldToCanvas,
    canvasTheme,
    (id) => isElementSelected(selection, 'barrier', id),
    pixelsPerMeter,
    BARRIER_ROTATION_HANDLE_OFFSET_PX
  );

  // Draw barrier draft preview
  if (barrierDraft) {
    drawBarrierDraft(ctx, barrierDraft, worldToCanvas, canvasTheme);
  }

  // Draw barrier center draft preview
  if (barrierCenterDraft) {
    drawBarrierCenterDraft(ctx, barrierCenterDraft, worldToCanvas, canvasTheme);
  }

  // Draw building draft preview with dimensions
  if (buildingDraft) {
    drawBuildingDraft(ctx, buildingDraft, worldToCanvas, canvasTheme);
  }
}

function drawSources() {
  const hoveredSourceId = hoverSelection?.type === 'source' ? hoverSelection.id : null;
  drawSourcesModule(
    ctx,
    scene.sources,
    worldToCanvas,
    canvasTheme,
    (id) => isElementSelected(selection, 'source', id),
    soloSourceId,
    hoveredSourceId
  );
}

function drawReceivers() {
  drawReceiversModule(
    ctx,
    scene.receivers,
    worldToCanvas,
    canvasTheme,
    (id) => isElementSelected(selection, 'receiver', id)
  );
}

function drawReceiverBadges() {
  // Build result map with display levels
  const resultMap = new Map<string, { id: string; level: number; unit: string }>();
  for (const result of results.receivers) {
    const { level, unit } = getReceiverDisplayLevel(result);
    resultMap.set(result.id, { id: result.id, level, unit });
  }
  drawReceiverBadgesModule(ctx, scene.receivers, resultMap, worldToCanvas, canvasTheme, formatLevel);
}

function drawProbes() {
  drawProbesModule(
    ctx,
    scene.probes,
    worldToCanvas,
    canvasTheme,
    activeProbeId,
    (id) => isElementSelected(selection, 'probe', id)
  );
}

function requestRender() {
  needsUpdate = true;
}

function renderLoop() {
  requestAnimationFrame(renderLoop);
  if (!needsUpdate) return;
  needsUpdate = false;

  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  // Only fill background if map is not visible
  if (!isMapVisible()) {
    ctx.fillStyle = canvasTheme.canvasBg;
    ctx.fillRect(0, 0, rect.width, rect.height);
  }

  if (layers.noiseMap) {
    drawNoiseMap();
  }

  if (layers.grid) {
    drawGrid();
  }

  if (layers.panels) {
    drawPanels();
    for (const panelResult of results.panels) {
      const panel = scene.panels.find((item) => item.id === panelResult.panelId);
      if (panel) {
        drawPanelSamples(panelResult);
      }
    }
  }

  drawBuildings();
  drawBarriers();

  if (layers.sources) {
    drawSources();
  }

  if (layers.receivers) {
    drawReceivers();
    drawReceiverBadges();
  }

  drawProbes();

  // Draw traced rays when visualization is enabled
  drawTracedRays();

  if (activeTool === 'measure') {
    drawMeasurement();
  }

  if (dragState?.type === 'select-box') {
    drawSelectBox();
  }
}

function setInteractionActive(active: boolean) {
  if (interactionActive === active) return;
  interactionActive = active;
  ctx.imageSmoothingEnabled = active;
  // Switching smoothing affects map draw, so request a frame.
  requestRender();
}

function startInteractionForDrag(activeDrag: DragState | null) {
  if (!shouldLiveUpdateMap(activeDrag)) return;
  setInteractionActive(true);
}

function applyDrag(worldPoint: Point) {
  if (!dragState) return;
  const activeDrag = dragState;
  const targetPoint = 'offset' in activeDrag
    ? {
        x: worldPoint.x - activeDrag.offset.x,
        y: worldPoint.y - activeDrag.offset.y,
      }
    : worldPoint;
  if (activeDrag.type === 'source') {
    const source = scene.sources.find((item) => item.id === activeDrag.id);
    if (source) {
      const nextPosition = { x: targetPoint.x, y: targetPoint.y, z: source.z ?? 0 };
      source.x = nextPosition.x;
      source.y = nextPosition.y;
      source.z = nextPosition.z;
      disableRayVisualization();
    }
  }
  if (activeDrag.type === 'receiver') {
    const receiver = scene.receivers.find((item) => item.id === activeDrag.id);
    if (receiver) {
      receiver.x = targetPoint.x;
      receiver.y = targetPoint.y;
    }
  }
  if (activeDrag.type === 'probe') {
    const probe = scene.probes.find((item) => item.id === activeDrag.id);
    if (probe) {
      probe.x = targetPoint.x;
      probe.y = targetPoint.y;
      disableRayVisualization();
      requestProbeUpdate(probe.id);
    }
  }
  if (activeDrag.type === 'panel') {
    const panel = scene.panels.find((item) => item.id === activeDrag.id);
    if (panel) {
      const dx = targetPoint.x - panel.points[0].x;
      const dy = targetPoint.y - panel.points[0].y;
      panel.points = panel.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
    }
  }
  if (activeDrag.type === 'barrier') {
    const barrier = scene.barriers.find((item) => item.id === activeDrag.id);
    if (barrier) {
      const dx = targetPoint.x - barrier.p1.x;
      const dy = targetPoint.y - barrier.p1.y;
      barrier.p1 = { x: barrier.p1.x + dx, y: barrier.p1.y + dy };
      barrier.p2 = { x: barrier.p2.x + dx, y: barrier.p2.y + dy };
      disableRayVisualization();
    }
  }
  if (activeDrag.type === 'building') {
    const building = scene.buildings.find((item) => item.id === activeDrag.id);
    if (building) {
      const dx = targetPoint.x - building.x;
      const dy = targetPoint.y - building.y;
      building.translate(dx, dy);
      disableRayVisualization();
    }
  }
  if (activeDrag.type === 'building-resize') {
    const building = scene.buildings.find((item) => item.id === activeDrag.id);
    if (building) {
      const dx = worldPoint.x - building.x;
      const dy = worldPoint.y - building.y;
      const cos = Math.cos(building.rotation);
      const sin = Math.sin(building.rotation);
      const localX = dx * cos + dy * sin;
      const localY = -dx * sin + dy * cos;
      building.width = Math.max(BUILDING_MIN_SIZE, Math.abs(localX) * 2);
      building.height = Math.max(BUILDING_MIN_SIZE, Math.abs(localY) * 2);
    }
  }
  if (activeDrag.type === 'building-rotate') {
    const building = scene.buildings.find((item) => item.id === activeDrag.id);
    if (building) {
      const angle = Math.atan2(worldPoint.y - building.y, worldPoint.x - building.x);
      building.rotation = activeDrag.startRotation + (angle - activeDrag.startAngle);
    }
  }
  if (activeDrag.type === 'barrier-endpoint') {
    const barrier = scene.barriers.find((item) => item.id === activeDrag.id);
    if (barrier) {
      // Move just the selected endpoint
      if (activeDrag.endpoint === 'p1') {
        barrier.p1 = { x: worldPoint.x, y: worldPoint.y };
      } else {
        barrier.p2 = { x: worldPoint.x, y: worldPoint.y };
      }
    }
  }
  if (activeDrag.type === 'barrier-rotate') {
    const barrier = scene.barriers.find((item) => item.id === activeDrag.id);
    if (barrier) {
      // Calculate new angle from midpoint to mouse
      const angle = Math.atan2(
        worldPoint.y - activeDrag.startMidpoint.y,
        worldPoint.x - activeDrag.startMidpoint.x
      );
      // Rotation handle is perpendicular (90 deg offset), so adjust
      const newRotation = angle - Math.PI / 2;
      setBarrierFromMidpointAndRotation(
        barrier,
        activeDrag.startMidpoint,
        newRotation,
        activeDrag.startLength
      );
    }
  }
  if (activeDrag.type === 'panel-vertex') {
    const panel = scene.panels.find((item) => item.id === activeDrag.id);
    if (panel && panel.points[activeDrag.index]) {
      panel.points[activeDrag.index] = { x: targetPoint.x, y: targetPoint.y };
    }
  }
  if (activeDrag.type === 'move-multi') {
    // Move all elements in the current multi-selection
    if (selection.type === 'multi') {
      for (const item of selection.items) {
        const offset = activeDrag.offsets.get(item.id);
        if (!offset) continue;
        const itemTarget = { x: worldPoint.x - offset.x, y: worldPoint.y - offset.y };

        if (item.elementType === 'source') {
          const source = scene.sources.find((s) => s.id === item.id);
          if (source) {
            source.x = itemTarget.x;
            source.y = itemTarget.y;
          }
        } else if (item.elementType === 'receiver') {
          const receiver = scene.receivers.find((r) => r.id === item.id);
          if (receiver) {
            receiver.x = itemTarget.x;
            receiver.y = itemTarget.y;
          }
        } else if (item.elementType === 'probe') {
          const probe = scene.probes.find((p) => p.id === item.id);
          if (probe) {
            probe.x = itemTarget.x;
            probe.y = itemTarget.y;
            requestProbeUpdate(probe.id);
          }
        } else if (item.elementType === 'panel') {
          const panel = scene.panels.find((p) => p.id === item.id);
          if (panel && panel.points[0]) {
            const dx = itemTarget.x - panel.points[0].x;
            const dy = itemTarget.y - panel.points[0].y;
            panel.points = panel.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
          }
        } else if (item.elementType === 'barrier') {
          const barrier = scene.barriers.find((b) => b.id === item.id);
          if (barrier) {
            const dx = itemTarget.x - barrier.p1.x;
            const dy = itemTarget.y - barrier.p1.y;
            barrier.p1 = { x: barrier.p1.x + dx, y: barrier.p1.y + dy };
            barrier.p2 = { x: barrier.p2.x + dx, y: barrier.p2.y + dy };
          }
        } else if (item.elementType === 'building') {
          const building = scene.buildings.find((b) => b.id === item.id);
          if (building) {
            building.x = itemTarget.x;
            building.y = itemTarget.y;
          }
        }
      }
    }
  }

  // Limit live noise-map work to drags that affect propagation.
  const shouldUpdateMap = shouldLiveUpdateMap(activeDrag);
  const shouldCompute = activeDrag.type !== 'probe';
  if (shouldCompute) {
    if (activeDrag.type === 'source') {
      computeSceneIncremental(activeDrag.id);
    } else {
      computeScene({ invalidateMap: false });
    }
  }

  if (shouldCompute && shouldUpdateMap) {
    recalculateNoiseMap(RES_LOW, DRAG_POINTS);
  }
  requestRender();
  dragDirty = true;
}

const throttledDragMove = throttle((worldPoint: Point) => {
  applyDrag(worldPoint);
}, DRAG_FRAME_MS);

// =============================================================================
// POINTER CONTEXT AND CALLBACKS BUILDERS
// =============================================================================

function buildPointerContext(): PointerContext {
  return {
    canvas,
    canvasToWorld,
    worldToCanvas,
    snapPoint,

    getPixelsPerMeter: () => pixelsPerMeter,
    getPanOffset: () => panOffset,
    getActiveTool: () => activeTool,
    getDragState: () => dragState,
    getPanState: () => panState,
    getSelection: () => selection,
    getHoverSelection: () => hoverSelection,

    getBarrierDrawingMode: () => barrierDrawingMode,
    getBarrierDraft: () => barrierDraft,
    getBarrierCenterDraft: () => barrierCenterDraft,
    getBarrierDraftAnchored: () => barrierDraftAnchored,
    getBarrierDragActive: () => barrierDragActive,

    getBuildingDrawingMode: () => buildingDrawingMode,
    getBuildingDraft: () => buildingDraft,
    getBuildingCenterDraft: () => buildingCenterDraft,
    getBuildingDraftAnchored: () => buildingDraftAnchored,
    getBuildingDragActive: () => buildingDragActive,
    getBuildingPolygonDraft: () => buildingPolygonDraft,

    getMeasureStart: () => measureStart,
    getMeasureEnd: () => measureEnd,
    getMeasureLocked: () => measureLocked,

    setPanOffset: (offset) => { panOffset = offset; },
    setDragState: (state) => { dragState = state; },
    setPanState: (state) => { panState = state; },
    setSelection,
    setHoverSelection: (sel) => { hoverSelection = sel; },

    setBarrierDraft: (draft) => { barrierDraft = draft; },
    setBarrierCenterDraft: (draft) => { barrierCenterDraft = draft; },
    setBarrierDraftAnchored: (anchored) => { barrierDraftAnchored = anchored; },
    setBarrierDragActive: (active) => { barrierDragActive = active; },

    setBuildingDraft: (draft) => { buildingDraft = draft; },
    setBuildingCenterDraft: (draft) => { buildingCenterDraft = draft; },
    setBuildingDraftAnchored: (anchored) => { buildingDraftAnchored = anchored; },
    setBuildingDragActive: (active) => { buildingDragActive = active; },
    setBuildingPolygonPreviewPoint: (point) => { buildingPolygonPreviewPoint = point; },
    pushBuildingPolygonDraft: (point) => { buildingPolygonDraft.push(point); },
    popBuildingPolygonDraft: () => { buildingPolygonDraft.pop(); },

    setMeasureStart: (point) => { measureStart = point; },
    setMeasureEnd: (point) => { measureEnd = point; },
    setMeasureLocked: (locked) => { measureLocked = locked; },

    setDragDirty: (dirty) => { dragDirty = dirty; },
  };
}

function buildPointerCallbacks(): PointerCallbacks {
  return {
    requestRender,
    applyDrag,
    throttledDragMove,
    hitTest,
    hitTestPanelHandle,
    hitTestBarrierHandle,
    hitTestBuildingHandle,
    sameSelection,

    selectionToItems,
    itemsToSelection,
    isElementSelected,
    getElementsInSelectBox,

    addSourceAt,
    addReceiverAt,
    addProbeAt,
    addPanelAt,

    commitBarrierDraft,
    commitBarrierCenterDraft,
    commitBuildingDraft,
    commitBuildingCenterDraft,
    commitBuildingPolygonDraft,
    isValidQuadrilateral,

    getBarrierById: (id) => scene.barriers.find((b) => b.id === id) ?? null,
    getBuildingById: (id) => scene.buildings.find((b) => b.id === id) ?? null,
    getBarrierMidpoint,
    getBarrierRotation,
    getBarrierLength,

    getSourceById: (id) => scene.sources.find((s) => s.id === id) ?? null,
    getReceiverById: (id) => scene.receivers.find((r) => r.id === id) ?? null,
    getProbeById: (id) => scene.probes.find((p) => p.id === id) ?? null,
    getPanelById: (id) => scene.panels.find((p) => p.id === id) ?? null,

    startInteractionForDrag,
    setInteractionActive,
    primeDragContribution,

    isMapVisible,
    isMapInteractive,
    syncMapToCanvasPan,

    updateSnapIndicator: (snapped, screenPoint) => {
      if (snapIndicator) {
        if (snapped) {
          snapIndicator.style.display = 'block';
          snapIndicator.style.transform = `translate(${screenPoint.x}px, ${screenPoint.y}px)`;
        } else {
          snapIndicator.style.display = 'none';
        }
      }
    },
    updateDebugCoords: (worldPoint) => {
      if (debugX) debugX.textContent = formatMeters(worldPoint.x);
      if (debugY) debugY.textContent = formatMeters(worldPoint.y);
    },

      deleteSelection,
    };
  }

// =============================================================================
// WHEEL/KEYBOARD CONTEXT AND CALLBACKS BUILDERS
// =============================================================================

function buildWheelContext(): WheelContext {
  return {
    canvas,
    canvasToWorld,
    getZoom: () => zoom,
    setZoom: (z) => { zoom = z; },
    getPanOffset: () => panOffset,
    setPanOffset: (offset) => { panOffset = offset; },
    getPixelsPerMeter: () => pixelsPerMeter,
  };
}

function buildWheelCallbacks(): WheelCallbacks {
  return {
    updatePixelsPerMeter,
    updateScaleBar,
    requestRender,
    isMapVisible,
    isMapInteractive,
    syncMapToCanvasZoom,
    syncMapToCanvasPan,
  };
}

function buildKeyboardContext(): KeyboardContext {
  return {
    getAboutOpen: () => aboutOpen,
    getSelection: () => selection,
    clearMeasure: () => {
      measureStart = null;
      measureEnd = null;
      measureLocked = false;
    },
    clearBarrierDraft: () => {
      barrierDraft = null;
      barrierDraftAnchored = false;
      barrierDragActive = false;
      barrierCenterDraft = null;
    },
    clearBuildingDraft: () => {
      buildingDraft = null;
      buildingDraftAnchored = false;
      buildingDragActive = false;
      buildingCenterDraft = null;
      buildingPolygonDraft = [];
      buildingPolygonPreviewPoint = null;
    },
  };
}

function buildKeyboardCallbacks(): KeyboardCallbacks {
  return {
    closeAbout,
    undo,
    redo,
    selectAll,
    duplicateMultiSelection,
    setSelection,
    deleteSelection,
    setActiveTool,
    requestRender,
  };
}

// =============================================================================
// POINTER HANDLERS (thin wrappers delegating to module)
// =============================================================================

function handlePointerMove(event: MouseEvent) {
  handlePointerMoveModule(event, buildPointerContext(), buildPointerCallbacks());
}

function handlePointerDown(event: MouseEvent) {
  handlePointerDownModule(event, buildPointerContext(), buildPointerCallbacks());
}

function handlePointerLeave() {
  handlePointerLeaveModule(buildPointerContext(), buildPointerCallbacks());
}

function handlePointerUp() {
  // Barrier draft commit
  if (barrierDragActive) {
    if (barrierDrawingMode === 'center' && barrierCenterDraft) {
      const dx = barrierCenterDraft.end.x - barrierCenterDraft.center.x;
      const dy = barrierCenterDraft.end.y - barrierCenterDraft.center.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length > 0.5) {
        commitBarrierCenterDraft();
      } else {
        barrierCenterDraft = null;
        barrierDragActive = false;
        requestRender();
      }
      return;
    } else if (barrierDraft) {
      const draftDistance = distance(barrierDraft.p1, barrierDraft.p2);
      if (barrierDraftAnchored || draftDistance > 0.5) {
        commitBarrierDraft();
      } else {
        barrierDraftAnchored = true;
        barrierDragActive = false;
        requestRender();
      }
      return;
    }
  }

  // Building draft commit
  if (buildingDragActive) {
    if (buildingDrawingMode === 'center' && buildingCenterDraft) {
      const dx = Math.abs(buildingCenterDraft.corner.x - buildingCenterDraft.center.x);
      const dy = Math.abs(buildingCenterDraft.corner.y - buildingCenterDraft.center.y);
      if (dx > 0.5 || dy > 0.5) {
        commitBuildingCenterDraft();
      } else {
        buildingCenterDraft = null;
        buildingDragActive = false;
        requestRender();
      }
      return;
    } else if (buildingDraft) {
      const draftWidth = Math.abs(buildingDraft.corner2.x - buildingDraft.corner1.x);
      const draftHeight = Math.abs(buildingDraft.corner2.y - buildingDraft.corner1.y);
      if (buildingDraftAnchored || draftWidth > 1 || draftHeight > 1) {
        commitBuildingDraft();
      } else {
        buildingDraftAnchored = true;
        buildingDragActive = false;
        requestRender();
      }
      return;
    }
  }

  // End pan
  if (panState) {
    panState = null;
    return;
  }

  // End select-box
  if (dragState?.type === 'select-box') {
    const selected = getElementsInSelectBox(dragState.startCanvasPoint, dragState.currentCanvasPoint);
    setSelection(itemsToSelection(selected));
    dragState = null;
    requestRender();
    return;
  }

  // End element drag with post-drag cleanup
  if (dragState) {
    const finishedDrag = dragState;
    throttledDragMove.flush();
    throttledDragMove.cancel();
    const shouldRecalculateMap = shouldLiveUpdateMap(finishedDrag);
    dragState = null;
    setInteractionActive(false);
    ctx.imageSmoothingEnabled = false;
    queuedMapResolutionPx = null;
    if (dragDirty) {
      pushHistory({ invalidateMap: false });
    }
    if (finishedDrag.type !== 'probe') {
      computeScene({ invalidateMap: false });
      if (shouldRecalculateMap) {
        recalculateNoiseMap(RES_HIGH);
        needsUpdate = true;
      }
    } else {
      requestProbeUpdate(finishedDrag.id, { immediate: true });
    }
  }
}

function wirePointer() {
  canvas.addEventListener('mousemove', handlePointerMove);
  canvas.addEventListener('mousedown', handlePointerDown);
  canvas.addEventListener('mouseleave', handlePointerLeave);
  window.addEventListener('mouseup', handlePointerUp);
}

// =============================================================================
// WHEEL/KEYBOARD HANDLERS (thin wrappers delegating to module)
// =============================================================================

function handleWheel(event: WheelEvent) {
  handleWheelModule(event, buildWheelContext(), buildWheelCallbacks());
}

function wireWheel() {
  canvas.addEventListener('wheel', handleWheel, { passive: false });
}

function wireKeyboard() {
  window.addEventListener('keydown', (event) => {
    handleKeyDownModule(event, buildKeyboardContext(), buildKeyboardCallbacks());
  });
}

function wireExport() {
  if (!exportCsv) return;
  exportCsv.addEventListener('click', () => downloadCsv());
}

function wireHistory() {
  undoButton?.addEventListener('click', () => undo());
  redoButton?.addEventListener('click', () => redo());
}

function wireComputeButton() {
  if (!computeButton) return;
  computeButton.addEventListener('click', () => {
    if (isComputing) {
      cancelCompute();
      return;
    }
    computeScene();
  });
}

function wireMeshButton() {
  if (!meshButton) return;
  meshButton.addEventListener('click', () => {
    void computeNoiseMap();
  });
}

function wireSceneName() {
  if (!sceneNameInput) return;
  sceneNameInput.addEventListener('input', () => {
    markDirty();
  });
}

function wireContextPanel() {
  if (contextClose) {
    // Treat close as clearing selection (panel is tied to selection state).
    contextClose.addEventListener('click', () => {
      setSelection({ type: 'none' });
    });
  }

  // Pin button creates a pinned snapshot of the current element
  if (contextPin) {
    contextPin.addEventListener('click', () => {
      // Create a pinned panel for the current selection
      if (selection.type !== 'none' && selection.type !== 'probe') {
        createPinnedContextPanel({ ...selection });
        // Clear selection to close the main inspector (pinned panel now shows it)
        setSelection({ type: 'none' });
      }
    });
  }

  // Double-click on context title to edit element name
  if (contextTitle) {
    contextTitle.addEventListener('dblclick', () => {
      if (selection.type === 'none' || selection.type === 'multi') return;

      const currentName = getSelectedElementName();
      const defaultName = `${selectionTypeLabel(selection.type)} ${selection.id.toUpperCase()}`;

      // Create input for editing
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'context-title-input';
      input.value = currentName === defaultName ? '' : currentName;
      input.placeholder = defaultName;

      // Replace title with input
      contextTitle.style.display = 'none';
      contextTitle.parentElement?.insertBefore(input, contextTitle);
      input.focus();
      input.select();

      const finishEditing = () => {
        const newValue = input.value.trim();
        if (newValue && newValue !== currentName) {
          setSelectedElementName(newValue);
        } else if (!newValue && currentName !== defaultName) {
          // Clear custom name - revert to default
          setSelectedElementName('');
        }
        input.remove();
        contextTitle.style.display = '';
        updateContextTitle();
      };

      input.addEventListener('blur', finishEditing);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          finishEditing();
        } else if (e.key === 'Escape') {
          input.remove();
          contextTitle.style.display = '';
        }
      });
    });
  }

  if (!contextPanel || !contextHeader) return;

  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let panelWidth = 0;
  let panelHeight = 0;
  const dragPadding = 12;
  const originalUserSelect = document.body.style.userSelect;

  const handleMouseMove = (event: MouseEvent) => {
    if (!isDragging) return;
    const maxLeft = window.innerWidth - panelWidth - dragPadding;
    const maxTop = window.innerHeight - panelHeight - dragPadding;
    const nextLeft = Math.min(Math.max(event.clientX - dragOffsetX, dragPadding), Math.max(dragPadding, maxLeft));
    const nextTop = Math.min(Math.max(event.clientY - dragOffsetY, dragPadding), Math.max(dragPadding, maxTop));
    contextPanel.style.left = `${nextLeft}px`;
    contextPanel.style.top = `${nextTop}px`;
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = originalUserSelect;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };

  contextHeader.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest('.context-close')) return;
    const rect = contextPanel.getBoundingClientRect();
    panelWidth = rect.width;
    panelHeight = rect.height;
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
    contextPanel.style.left = `${rect.left}px`;
    contextPanel.style.top = `${rect.top}px`;
    contextPanel.style.right = 'auto';
    isDragging = true;
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  });
}

function wireProbePanel() {
  if (probePanel) {
    const header = probePanel.querySelector('.probe-header') as HTMLDivElement | null;
    if (header) {
      makePanelDraggable(probePanel, header, { parent: uiLayer ?? undefined, padding: 12, ignoreSelector: 'button' });
    }
  }

  // Double-click on probe title to edit probe name
  if (probeTitle) {
    probeTitle.addEventListener('dblclick', () => {
      const probe = getActiveProbe();
      if (!probe) return;

      const defaultName = `Probe ${probe.id.toUpperCase()}`;
      const currentName = probe.name || defaultName;

      // Create input for editing
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'context-title-input';
      input.value = currentName === defaultName ? '' : currentName;
      input.placeholder = defaultName;

      // Replace title with input
      probeTitle.style.display = 'none';
      probeTitle.parentElement?.insertBefore(input, probeTitle);
      input.focus();
      input.select();

      const finishEditing = () => {
        const newValue = input.value.trim();
        if (newValue && newValue !== currentName) {
          probe.name = newValue;
          probeTitle.textContent = newValue;
          markDirty();
          pushHistory();
          requestRender();
        } else if (!newValue && currentName !== defaultName) {
          // Clear custom name - revert to default
          probe.name = undefined;
          probeTitle.textContent = defaultName;
          markDirty();
          pushHistory();
          requestRender();
        }
        input.remove();
        probeTitle.style.display = '';
      };

      input.addEventListener('blur', finishEditing);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishEditing();
        if (e.key === 'Escape') {
          input.value = currentName;
          finishEditing();
        }
      });
    });

    // Add tooltip hint
    probeTitle.title = 'Double-click to edit name';
    probeTitle.style.cursor = 'text';
  }

  probeClose?.addEventListener('click', () => {
    setActiveProbe(null);
    if (selection.type === 'probe') {
      setSelection({ type: 'none' });
    }
  });

  probePin?.addEventListener('click', () => {
    const probe = getActiveProbe();
    if (!probe) return;
    togglePinProbe(probe.id);
  });

  probeFreeze?.addEventListener('click', () => {
    const probe = getActiveProbe();
    if (!probe) return;
    const data = getProbeResult(probe.id);
    if (!data) return;
    const probeName = probe.name || `Probe ${probe.id.toUpperCase()}`;
    createProbeSnapshotWrapper(cloneProbeData(data), probeName, { x: probe.x, y: probe.y });
  });

  // Ray visualization toggle
  rayVizToggle?.addEventListener('change', () => {
    if (rayVizCard) {
      rayVizCard.classList.toggle('is-active', rayVizToggle.checked);
    }
    // If toggled on, re-request probe data with path geometry
    if (rayVizToggle.checked) {
      const probe = getActiveProbe();
      if (probe) {
        requestProbeUpdate(probe.id, { immediate: true });
      }
    } else {
      // Clear paths when toggled off
      clearTracedPaths();
      if (rayVizPaths) rayVizPaths.innerHTML = '';
      if (rayVizPhaseInfo) rayVizPhaseInfo.innerHTML = '';
      if (rayVizDominant) rayVizDominant.innerHTML = '';
      requestRender();
    }
  });
}

function downloadScene() {
  downloadSceneModule(scene, sceneNameInput?.value ?? 'Untitled', getPropagationConfig());
}

function applyLoadedScene(
  loadedScene: DeserializedScene,
  name: string,
  propagation?: PropagationConfig
) {
  // Apply deserialized scene data
  scene.sources = loadedScene.sources;
  scene.receivers = loadedScene.receivers;
  scene.panels = loadedScene.panels;
  scene.probes = loadedScene.probes;
  scene.buildings = loadedScene.buildings;
  scene.barriers = loadedScene.barriers;

  // Calculate sequence numbers from io module
  const seqs = calculateSequences(loadedScene);
  sourceSeq = seqs.sourceSeq;
  receiverSeq = seqs.receiverSeq;
  panelSeq = seqs.panelSeq;
  probeSeq = seqs.probeSeq;
  buildingSeq = seqs.buildingSeq;
  barrierSeq = seqs.barrierSeq;

  // Reset UI state
  collapsedSources.clear();
  soloSourceId = null;
  selection = { type: 'none' };
  hoverSelection = null;
  dragState = null;
  dragDirty = false;
  measureStart = null;
  measureEnd = null;
  measureLocked = false;
  barrierDraft = null;
  barrierDraftAnchored = false;
  barrierDragActive = false;
  buildingDraft = null;
  buildingDraftAnchored = false;
  buildingDragActive = false;
  setActiveProbeId(null);
  // Clear probe data using module functions
  const emptySet = new Set<string>();
  pruneProbeData(emptySet);
  clearPinnedProbes();
  if (propagation) {
    updatePropagationConfig(propagation);
    updatePropagationControls();
  }
  if (sceneNameInput) {
    sceneNameInput.value = name;
  }
  updateCounts();
  setSelection({ type: 'none' });
  renderProbeInspector();
  history = [];
  historyIndex = -1;
  invalidateNoiseMap();
  pushHistory({ markDirty: false, recalculateMap: false });
  renderResults();
  computeScene({ recalculateMap: false });
  markSaved();
}

function wireSaveLoad() {
  saveButton?.addEventListener('click', () => {
    downloadScene();
    markSaved();
  });

  loadButton?.addEventListener('click', async () => {
    const result = await openSceneFile();
    if (!result.success) {
      if (result.error && result.error !== 'File selection cancelled') {
        // eslint-disable-next-line no-console
        console.error('Failed to load scene:', result.error);
      }
      return;
    }
    applyLoadedScene(result.scene, result.name, result.propagation);
  });
}

function wireCanvasHelp() {
  if (!canvasHelp || !canvasHelpButton || !canvasHelpTooltip) return;
  const dismissed = localStorage.getItem(CANVAS_HELP_KEY) === '1';
  let autoHideTimer: ReturnType<typeof setTimeout> | null = null;

  const startAutoHideTimer = () => {
    if (autoHideTimer) clearTimeout(autoHideTimer);
    autoHideTimer = setTimeout(() => {
      if (canvasHelp.classList.contains('is-open')) {
        // Add spring-out animation class
        canvasHelpTooltip.classList.add('is-hiding');
        // Wait for animation to complete, then close
        setTimeout(() => {
          canvasHelpTooltip.classList.remove('is-hiding');
          closeHelp();
        }, 500);
      }
    }, 10000); // 10 seconds
  };

  const clearAutoHideTimer = () => {
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
  };

  if (!dismissed) {
    canvasHelp.classList.add('is-open');
    canvasHelpButton.setAttribute('aria-expanded', 'true');
    startAutoHideTimer();
  }

  const closeHelp = () => {
    canvasHelp.classList.remove('is-open');
    canvasHelpButton.setAttribute('aria-expanded', 'false');
    clearAutoHideTimer();
  };

  canvasHelpButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = canvasHelp.classList.toggle('is-open');
    canvasHelpButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) {
      startAutoHideTimer();
    } else {
      clearAutoHideTimer();
    }
  });

  // Reset timer when user interacts with the tooltip
  canvasHelpTooltip.addEventListener('mouseenter', clearAutoHideTimer);
  canvasHelpTooltip.addEventListener('mouseleave', () => {
    if (canvasHelp.classList.contains('is-open')) {
      startAutoHideTimer();
    }
  });

  canvasHelpDismiss?.addEventListener('click', () => {
    localStorage.setItem(CANVAS_HELP_KEY, '1');
    closeHelp();
  });

  document.addEventListener('click', (event) => {
    if (!canvasHelp.classList.contains('is-open')) return;
    const target = event.target as HTMLElement | null;
    if (target && canvasHelp.contains(target)) return;
    closeHelp();
  });
}

function wireActionOverflow() {
  if (!actionSecondary || !actionOverflowToggle) return;

  const closeMenu = () => {
    actionSecondary.classList.remove('is-open');
    actionOverflowToggle.setAttribute('aria-expanded', 'false');
  };

  actionOverflowToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = actionSecondary.classList.toggle('is-open');
    actionOverflowToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  actionSecondary.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.tagName === 'BUTTON') {
      closeMenu();
    }
  });

  document.addEventListener('click', (event) => {
    if (!actionSecondary.classList.contains('is-open')) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (actionSecondary.contains(target) || actionOverflowToggle.contains(target)) return;
    closeMenu();
  });

  window.addEventListener('resize', () => {
    closeMenu();
  });
}

// === About/Author Modals (delegating to ui/modals module) ===

function closeAbout() {
  aboutOpen = false;
  closeAboutModule(aboutModal);
}

function wireAbout() {
  wireAboutModalModule(
    aboutModal,
    aboutButton,
    aboutClose,
    aboutTabs,
    aboutPanels,
    () => wireCollapsibleSectionsModule(),
    () => wireAuthorModal()
  );
}

function wireAuthorModal() {
  wireAuthorModalModule(authorModal, authorButton, authorClose);
}

// === Propagation Controls (delegating to ui/panels/propagation module) ===

/** Build PropagationElements from global DOM references */
function buildPropagationElements(): PropagationElements {
  return {
    spreading: propagationSpreading,
    absorption: propagationAbsorption,
    groundReflection: propagationGroundReflection,
    groundModel: propagationGroundModel,
    groundType: propagationGroundType,
    groundMixedSigmaModel: propagationGroundMixedSigmaModel,
    groundMixedSigmaModelRow: propagationGroundMixedSigmaModelRow,
    maxDistance: propagationMaxDistance,
    groundDetails: propagationGroundDetails,
    groundHelp: propagationGroundHelp,
    groundModelHelp: propagationGroundModelHelp,
    barrierSideDiffraction: propagationBarrierSideDiffraction,
    calculationProfile: calculationProfile,
    profileIndicator: settingsProfileIndicator,
  };
}

/** Build MeteoElements from global DOM references */
function buildMeteoElements(): MeteoElements {
  return {
    temperature: meteoTemperature,
    humidity: meteoHumidity,
    pressure: meteoPressure,
  };
}

/** Build PropagationCallbacks from global functions */
function buildPropagationCallbacks(): PropagationCallbacks {
  return {
    getPropagationConfig,
    updatePropagationConfig,
    getMeteoState: () => meteoState,
    setMeteoState: (next) => {
      Object.assign(meteoState, next);
    },
    markDirty,
    computeScene,
    updateSpeedOfSoundDisplay,
    updateAllEquations,
  };
}

/** Update propagation UI controls to match current config */
function updatePropagationControls() {
  updatePropagationControlsModule(buildPropagationElements(), getPropagationConfig());
}

/** Wire up all propagation control event listeners */
function wirePropagationControls() {
  wirePropagationControlsModule(
    buildPropagationElements(),
    buildMeteoElements(),
    buildPropagationCallbacks()
  );
}

function init() {
  // Recalculate sequence counters based on demo scene elements to avoid ID collisions.
  // Without this, hardcoded initial values (e.g. buildingSeq=2) would collide with
  // pre-loaded demo scene IDs (bd1-bd5), causing duplicate IDs when adding new elements.
  sourceSeq = nextSequence('s', scene.sources);
  receiverSeq = nextSequence('r', scene.receivers);
  panelSeq = nextSequence('p', scene.panels);
  probeSeq = nextSequence('pr', scene.probes);
  buildingSeq = nextSequence('bd', scene.buildings);
  barrierSeq = nextSequence('b', scene.barriers);

  updateCounts();
  wireThemeSwitcher();
  wireLayerToggle(layerSources, 'sources');
  wireLayerToggle(layerReceivers, 'receivers');
  wireLayerToggle(layerPanels, 'panels');
  wireLayerToggle(layerNoiseMap, 'noiseMap');
  wireLayerToggle(layerGrid, 'grid');
  wirePreference();
  wireTools();
  wireDockLabels();
  wireDockExpand();
  wirePointer();
  wireWheel();
  wireKeyboard();
  wireExport();
  wireAbout();
  wirePropagationControls();
  wireHistory();
  wireComputeButton();
  wireMeshButton();
  wireMapSettings();
  wireDisplaySettings();
  wireRefineButton();
  wireLayersPopover();
wireSettingsPopover();
  wireEquationCollapsibles();
  wireProbeEngineControls();
  wireSceneName();
  wireContextPanel();
  wireProbePanel();

  // Set up probe result handler to re-render when worker returns results
  setProbeResultHandler((result) => {
    renderProbeInspector();
    renderPinnedProbePanel(result.probeId);
  });

  wireSaveLoad();
  wireCanvasHelp();
  wireActionOverflow();

  // Initialize Mapbox UI integration
  initMapboxUI({
    enabled: ENABLE_MAPBOX,
    onScaleSync: (metersPerPixel) => {
      // Sync canvas pixels-per-meter with map scale for 1:1 accuracy
      const newPpm = 1 / metersPerPixel;
      if (Math.abs(newPpm - pixelsPerMeter) > 0.001) {
        pixelsPerMeter = newPpm;
        updatePixelsPerMeter();
        updateScaleBar();
        needsUpdate = true;
      }
    },
    getPixelsPerMeter: () => pixelsPerMeter,
  });

  updateUndoRedoButtons();
  updateSceneStatus();
  setActiveTool(activeTool);
  updateMapUI();
  renderNoiseMapLegend();
  resizeCanvas();
  needsUpdate = true;
  requestRender();
  renderLoop();
  pushHistory({ markDirty: false });
  markSaved();
  computeScene();
  // Pin the initial demo probe so users see the frequency response immediately
  if (scene.probes.length > 0) {
    pinProbe(scene.probes[0].id);
  }
  // Initial map uses high resolution with maximum point cap for a good first impression
  void computeNoiseMapInternal({ resolutionPx: RES_HIGH, maxPoints: REFINE_POINTS, silent: true, requestId: 'grid:init' });
  window.addEventListener('resize', resizeCanvas);
}

init();
