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
import { engineCompute } from '@geonoise/engine-backends';
import { createEmptyScene, type EngineConfig, type PropagationConfig } from '@geonoise/core';
import {
  getDefaultEngineConfig,
  type ComputeGridResponse,
  type ComputePanelResponse,
  type ComputeReceiversResponse,
} from '@geonoise/engine';
import { panelId, MIN_LEVEL } from '@geonoise/shared';
import { buildCsv } from './export.js';
import type { SceneResults, PanelResult } from './export.js';
import { formatLevel, formatMeters } from './format.js';

type Point = { x: number; y: number };

type Source = {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  power: number;
  enabled: boolean;
};

type Receiver = {
  id: string;
  x: number;
  y: number;
  z: number;
};

type Panel = {
  id: string;
  points: Point[];
  elevation: number;
  sampling: { resolution: number; pointCap: number };
};

type Barrier = {
  // UI barrier primitive (matches the feature ticket’s intent):
  // - p1/p2 are endpoints in the 2D editor plane (x,y) in local meters (ENU).
  // - height is the vertical screen height (meters). In physics, this becomes the Z of the barrier top edge.
  // - transmissionLoss is reserved for future “through-wall” modeling (currently unused by the engine).
  //
  // Important: The UI is 2D, but the engine computes 3D acoustics:
  //   - source z = hs
  //   - receiver z = hr
  //   - barrier height = hb
  // The CPU engine checks 2D intersection (SR crosses barrier segment) and then uses hb/hs/hr to compute
  // the 3D "over the top" path difference delta that drives the barrier insertion loss term.
  id: string;
  p1: Point;
  p2: Point;
  height: number;
  transmissionLoss?: number;
};

type BuildingData = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_height: number;
  color: string;
};

const DEFAULT_BUILDING_COLOR = '#9aa3ad';
const BUILDING_MIN_SIZE = 2;
const BUILDING_HANDLE_RADIUS = 4;
const BUILDING_HANDLE_HIT_RADIUS = 10;
const BUILDING_ROTATION_HANDLE_OFFSET_PX = 20;
const BUILDING_ROTATION_HANDLE_RADIUS = 5;

class Building {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_height: number;
  color: string;
  selected: boolean;

  constructor(data: Partial<BuildingData> & { id: string }) {
    this.id = data.id;
    this.x = data.x ?? 0;
    this.y = data.y ?? 0;
    this.width = data.width ?? 10;
    this.height = data.height ?? 10;
    this.rotation = data.rotation ?? 0;
    this.z_height = data.z_height ?? 10;
    this.color = data.color ?? DEFAULT_BUILDING_COLOR;
    this.selected = false;
  }

  toData(): BuildingData {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
      z_height: this.z_height,
      color: this.color,
    };
  }

  getVertices(): Point[] {
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    const corners = [
      { x: -halfWidth, y: halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: -halfWidth, y: -halfHeight },
    ];
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return corners.map((corner) => ({
      x: this.x + corner.x * cos - corner.y * sin,
      y: this.y + corner.x * sin + corner.y * cos,
    }));
  }

  getRotationHandlePosition(handleOffset: number) {
    const localX = 0;
    const localY = this.height / 2 + handleOffset;
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return {
      x: this.x + localX * cos - localY * sin,
      y: this.y + localX * sin + localY * cos,
    };
  }

  renderControls(
    ctx: CanvasRenderingContext2D,
    toCanvas: (point: Point) => Point,
    options: {
      stroke: string;
      lineWidth: number;
      dash: number[];
      handleFill: string;
      handleStroke: string;
      handleRadius: number;
      rotationHandleOffset: number;
      rotationHandleRadius: number;
      rotationHandleStroke: string;
    }
  ) {
    if (!this.selected) return;
    const vertices = this.getVertices();
    const first = toCanvas(vertices[0]);
    ctx.save();
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.lineWidth;
    ctx.setLineDash(options.dash);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const corner of vertices.slice(1)) {
      const point = toCanvas(corner);
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = options.handleFill;
    ctx.strokeStyle = options.handleStroke;
    ctx.lineWidth = 1.5;
    for (const corner of vertices) {
      const point = toCanvas(corner);
      ctx.beginPath();
      ctx.arc(point.x, point.y, options.handleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const handleOffset = options.rotationHandleOffset;
    const handleWorld = this.getRotationHandlePosition(handleOffset);
    const topCenterWorld = this.getRotationHandlePosition(0);
    const handleCanvas = toCanvas(handleWorld);
    const topCenterCanvas = toCanvas(topCenterWorld);
    ctx.strokeStyle = options.rotationHandleStroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(topCenterCanvas.x, topCenterCanvas.y);
    ctx.lineTo(handleCanvas.x, handleCanvas.y);
    ctx.stroke();

    ctx.fillStyle = options.handleFill;
    ctx.strokeStyle = options.handleStroke;
    ctx.beginPath();
    ctx.arc(handleCanvas.x, handleCanvas.y, options.rotationHandleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// Whole-scene noise map ("Mesh All") visualization:
// - A grid is computed in the engine (as a temporary receiver lattice).
// - Values are mapped to a color ramp and drawn as a scaled texture in world coordinates.
type NoiseMap = {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  resolution: number;
  elevation: number;
  cols: number;
  rows: number;
  values: number[];
  min: number;
  max: number;
  texture: HTMLCanvasElement;
};

type MapRange = { min: number; max: number };
type MapRenderStyle = 'Smooth' | 'Contours';

type Tool = 'select' | 'add-source' | 'add-receiver' | 'add-panel' | 'add-barrier' | 'add-building' | 'measure' | 'delete';

type Selection =
  | { type: 'none' }
  | { type: 'source'; id: string }
  | { type: 'receiver'; id: string }
  | { type: 'panel'; id: string }
  | { type: 'barrier'; id: string }
  | { type: 'building'; id: string };

type DragState =
  | null
  | {
      type: 'source' | 'receiver' | 'panel' | 'barrier' | 'building';
      id: string;
      offset: Point;
    }
  | {
      type: 'panel-vertex';
      id: string;
      index: number;
      offset: Point;
    }
  | {
      type: 'building-resize';
      id: string;
    }
  | {
      type: 'building-rotate';
      id: string;
      startAngle: number;
      startRotation: number;
    };

type DragContribution = {
  sourceId: string;
  receiverEnergy: Map<string, number>;
  panelEnergy: Map<string, Float64Array>;
};

type CanvasTheme = {
  gridLine: string;
  measureLine: string;
  measureText: string;
  panelStroke: string;
  panelFill: string;
  panelSelected: string;
  panelHandleFill: string;
  panelHandleStroke: string;
  sampleStroke: string;
  barrierStroke: string;
  barrierSelected: string;
  sourceFill: string;
  sourceStroke: string;
  sourceMutedFill: string;
  sourceMutedStroke: string;
  sourceMutedText: string;
  sourceLabel: string;
  sourceRing: string;
  sourceTooltipBg: string;
  sourceTooltipBorder: string;
  sourceTooltipText: string;
  receiverFill: string;
  receiverStroke: string;
  receiverLabel: string;
  receiverRing: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  canvasBg: string;
  selectionHalo: string;
};

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
const toolInstruction = document.querySelector('#toolInstruction') as HTMLDivElement | null;
const selectionLabel = document.querySelector('#selectionLabel') as HTMLSpanElement | null;
const selectionHint = document.querySelector('#selectionHint') as HTMLDivElement | null;
const modeLabel = document.querySelector('#modeLabel') as HTMLSpanElement | null;
const propertiesBody = document.querySelector('#propertiesBody') as HTMLDivElement | null;
const contextPanel = document.querySelector('#contextPanel') as HTMLDivElement | null;
const contextHeader = document.querySelector('#contextHeader') as HTMLDivElement | null;
const contextClose = document.querySelector('#contextClose') as HTMLButtonElement | null;
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

const undoButton = document.querySelector('#undoButton') as HTMLButtonElement | null;
const redoButton = document.querySelector('#redoButton') as HTMLButtonElement | null;

const aboutButton = document.querySelector('#aboutButton') as HTMLButtonElement | null;
const aboutModal = document.querySelector('#aboutModal') as HTMLDivElement | null;
const aboutClose = document.querySelector('#aboutClose') as HTMLButtonElement | null;
const aboutTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-about-tab]'));
const aboutPanels = Array.from(document.querySelectorAll<HTMLDivElement>('[data-about-panel]'));
const actionSecondary = document.querySelector('#actionSecondary') as HTMLDivElement | null;
const actionOverflowToggle = document.querySelector('#actionOverflowToggle') as HTMLButtonElement | null;

const propagationSpreading = document.querySelector('#propagationSpreading') as HTMLSelectElement | null;
const propagationAbsorption = document.querySelector('#propagationAbsorption') as HTMLSelectElement | null;
const propagationGroundReflection = document.querySelector('#propagationGroundReflection') as HTMLInputElement | null;
const propagationGroundModel = document.querySelector('#propagationGroundModel') as HTMLSelectElement | null;
const propagationGroundType = document.querySelector('#propagationGroundType') as HTMLSelectElement | null;
const propagationMaxDistance = document.querySelector('#propagationMaxDistance') as HTMLInputElement | null;
const propagationGroundDetails = document.querySelector('#propagationGroundDetails') as HTMLDivElement | null;
const propagationGroundHelp = document.querySelector('#propagationGroundHelp') as HTMLDivElement | null;
const propagationGroundModelHelp = document.querySelector('#propagationGroundModelHelp') as HTMLDivElement | null;

const layerSources = document.querySelector('#layerSources') as HTMLInputElement | null;
const layerReceivers = document.querySelector('#layerReceivers') as HTMLInputElement | null;
const layerPanels = document.querySelector('#layerPanels') as HTMLInputElement | null;
const layerNoiseMap = document.querySelector('#layerNoiseMap') as HTMLInputElement | null;
const layerGrid = document.querySelector('#layerGrid') as HTMLInputElement | null;

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

const scene = {
  sources: [
    { id: 's1', name: 'Source S1', x: -40, y: 10, z: 1.5, power: 100, enabled: true },
    { id: 's2', name: 'Source S2', x: 60, y: -20, z: 1.5, power: 94, enabled: true },
  ] as Source[],
  receivers: [
    { id: 'r1', x: 10, y: 30, z: 1.5 },
    { id: 'r2', x: -20, y: -40, z: 1.5 },
  ] as Receiver[],
  panels: [
    {
      id: 'p1',
      points: [
        { x: 30, y: 20 },
        { x: 80, y: 10 },
        { x: 70, y: -30 },
        { x: 25, y: -10 },
      ],
      elevation: 1.5,
      sampling: { resolution: 10, pointCap: 300 },
    },
  ] as Panel[],
  buildings: [
    new Building({ id: 'bd1', x: 0, y: 0, width: 18, height: 12, rotation: 0.2, z_height: 12 }),
  ] as Building[],
  barriers: [] as Barrier[],
};

const layers = {
  sources: true,
  receivers: true,
  panels: true,
  noiseMap: false,
  grid: false,
};

const DEFAULT_MAP_RANGE: MapRange = { min: 30, max: 85 };
const DEFAULT_MAP_BAND_STEP = 5;
const MAX_MAP_LEGEND_LABELS = 7;
// Noise map render steps (px) for preview vs. final quality.
const RES_HIGH = 2;
const RES_LOW = 4;
// Cap drag updates to ~33 FPS.
const DRAG_FRAME_MS = 30;

let pixelsPerMeter = 3;
let activeTool: Tool = 'select';
let selection: Selection = { type: 'none' };
let hoverSelection: Selection | null = null;
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
let results: SceneResults = { receivers: [], panels: [] };
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

const CANVAS_HELP_KEY = 'geonoise.canvasHelpDismissed';

type SceneSnapshot = {
  sources: Source[];
  receivers: Receiver[];
  panels: Panel[];
  buildings: BuildingData[];
  barriers: Barrier[];
  sourceSeq: number;
  receiverSeq: number;
  panelSeq: number;
  buildingSeq: number;
  barrierSeq: number;
  selection: Selection;
  soloSourceId: string | null;
  panOffset: Point;
  zoom: number;
};

let history: SceneSnapshot[] = [];
let historyIndex = -1;

let sourceSeq = 3;
let receiverSeq = 3;
let panelSeq = 2;
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

function niceDistance(value: number): number {
  const options = [5, 10, 20, 50, 100, 200, 500, 1000];
  let best = options[0];
  for (const option of options) {
    if (value >= option) best = option;
  }
  return best;
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
    badgeBg: readCssVar('--canvas-badge-bg'),
    badgeBorder: readCssVar('--canvas-badge-border'),
    badgeText: readCssVar('--canvas-badge-text'),
    canvasBg: readCssVar('--canvas-bg'),
    selectionHalo: readCssVar('--canvas-selection-halo'),
  };
}

function refreshCanvasTheme() {
  canvasTheme = readCanvasTheme();
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

function sameSelection(a: Selection | null, b: Selection | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'none' || b.type === 'none') return a.type === b.type;
  return a.id === b.id;
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
    buildings: scene.buildings.map((building) => building.toData()),
    barriers: scene.barriers.map((barrier) => ({
      ...barrier,
      p1: { ...barrier.p1 },
      p2: { ...barrier.p2 },
    })),
    sourceSeq,
    receiverSeq,
    panelSeq,
    buildingSeq,
    barrierSeq,
    selection: { ...selection } as Selection,
    soloSourceId,
    panOffset: { ...panOffset },
    zoom,
  };
}

function pushHistory(options?: { markDirty?: boolean; invalidateMap?: boolean }) {
  const snap = snapshotScene();
  history = history.slice(0, historyIndex + 1);
  history.push(snap);
  historyIndex = history.length - 1;
  updateUndoRedoButtons();
  if (options?.invalidateMap !== false) {
    invalidateNoiseMap();
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
  scene.buildings = snap.buildings.map((building) => new Building(building));
  scene.barriers = snap.barriers.map((barrier) => ({
    ...barrier,
    p1: { ...barrier.p1 },
    p2: { ...barrier.p2 },
  }));
  sourceSeq = snap.sourceSeq;
  receiverSeq = snap.receiverSeq;
  panelSeq = snap.panelSeq;
  buildingSeq = snap.buildingSeq;
  barrierSeq = snap.barrierSeq;
  selection = snap.selection;
  soloSourceId = snap.soloSourceId;
  panOffset = { ...snap.panOffset };
  zoom = snap.zoom;
  updatePixelsPerMeter();
  updateCounts();
  setSelection(selection);
  updateUndoRedoButtons();
  invalidateNoiseMap();
  computeScene();
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

function distance(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function distanceToSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return distance(point, a);
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + clamped * dx, y: a.y + clamped * dy };
  return distance(point, proj);
}

type ThrottledFn<T extends (...args: any[]) => void> = ((...args: Parameters<T>) => void) & {
  flush: () => void;
  cancel: () => void;
};

function throttle<T extends (...args: any[]) => void>(fn: T, waitMs: number): ThrottledFn<T> {
  let lastCall = 0;
  let timeoutId: number | null = null;
  let pendingArgs: Parameters<T> | null = null;

  const invoke = (args: Parameters<T>) => {
    lastCall = performance.now();
    pendingArgs = null;
    fn(...args);
  };

  // Leading call, then coalesce trailing updates.
  const throttled = ((...args: Parameters<T>) => {
    const now = performance.now();
    const remaining = waitMs - (now - lastCall);
    if (remaining <= 0 || remaining > waitMs) {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      invoke(args);
      return;
    }

    pendingArgs = args;
    if (timeoutId === null) {
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        if (pendingArgs) {
          invoke(pendingArgs);
        }
      }, remaining);
    }
  }) as ThrottledFn<T>;

  throttled.flush = () => {
    if (!pendingArgs) return;
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    invoke(pendingArgs);
  };

  throttled.cancel = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    pendingArgs = null;
  };

  return throttled;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

const sampleRamp = [
  { stop: 0, color: { r: 32, g: 86, b: 140 } },
  { stop: 0.45, color: { r: 42, g: 157, b: 143 } },
  { stop: 0.75, color: { r: 233, g: 196, b: 106 } },
  { stop: 1, color: { r: 231, g: 111, b: 81 } },
];

function getSampleColor(ratio: number) {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  for (let i = 0; i < sampleRamp.length - 1; i += 1) {
    const current = sampleRamp[i];
    const next = sampleRamp[i + 1];
    if (clamped >= current.stop && clamped <= next.stop) {
      const span = next.stop - current.stop || 1;
      const t = (clamped - current.stop) / span;
      return {
        r: Math.round(lerp(current.color.r, next.color.r, t)),
        g: Math.round(lerp(current.color.g, next.color.g, t)),
        b: Math.round(lerp(current.color.b, next.color.b, t)),
      };
    }
  }
  return sampleRamp[sampleRamp.length - 1].color;
}

function colorToCss(color: { r: number; g: number; b: number }) {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function formatLegendLevel(value: number) {
  const text = formatLevel(value);
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}

function computeMapRange(values: number[]): MapRange | null {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value) || value <= MIN_LEVEL) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

function getActiveMapRange(): MapRange {
  if (mapAutoScale && currentMapRange) return currentMapRange;
  return DEFAULT_MAP_RANGE;
}

function getMapBandStep() {
  if (!Number.isFinite(mapBandStep)) return DEFAULT_MAP_BAND_STEP;
  return Math.min(20, Math.max(1, mapBandStep));
}

function snapMapValue(value: number) {
  if (mapRenderStyle !== 'Contours') return value;
  const step = getMapBandStep();
  return Math.floor(value / step) * step;
}

function buildSmoothLegendStops() {
  return sampleRamp
    .map((stop) => `${colorToCss(stop.color)} ${Math.round(stop.stop * 100)}%`)
    .join(', ');
}

function buildBandedLegendLabels(range: MapRange, step: number) {
  const clampedStep = Math.min(20, Math.max(1, step));
  const start = Math.floor(range.min / clampedStep) * clampedStep;
  const end = Math.ceil(range.max / clampedStep) * clampedStep;
  const labels: number[] = [];

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return [range.min, range.max];
  }

  for (let value = start; value <= end + 1e-6; value += clampedStep) {
    labels.push(value);
  }

  if (labels.length <= MAX_MAP_LEGEND_LABELS) {
    return labels;
  }

  const inner = labels.slice(1, -1);
  const stride = Math.ceil(inner.length / (MAX_MAP_LEGEND_LABELS - 2));
  const sampled = inner.filter((_, index) => index % stride === 0);
  return [labels[0], ...sampled, labels[labels.length - 1]];
}

function getGridCounts(bounds: ComputeGridResponse['result']['bounds'], resolution: number) {
  // Derive cols/rows deterministically from bounds+resolution.
  // We avoid trusting backend-provided cols/rows because (for the current CPU engine)
  // the values array is produced by nested loops (x outer, y inner) and must match
  // the exact count implied by bounds/resolution.
  const cols = Math.max(1, Math.floor((bounds.maxX - bounds.minX) / resolution + 1e-6) + 1);
  const rows = Math.max(1, Math.floor((bounds.maxY - bounds.minY) / resolution + 1e-6) + 1);
  return { cols, rows };
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

function panelSampleRatio(sample: { LAeq: number }, min: number, max: number) {
  const span = max - min;
  if (span <= 0) return 0;
  return (sample.LAeq - min) / span;
}

function dbToEnergy(level: number) {
  if (level <= MIN_LEVEL) return 0;
  return Math.pow(10, level / 10);
}

function energyToDb(energy: number) {
  if (energy <= 0) return MIN_LEVEL;
  return 10 * Math.log10(energy);
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
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
    panelResult.LAeq_p50 = MIN_LEVEL;
    panelResult.LAeq_p95 = MIN_LEVEL;
    return;
  }

  const avg = energyToDb(energySum / laeqs.length);
  const sorted = [...laeqs].sort((a, b) => a - b);
  const p50Index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.5) - 1));
  const p95Index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));

  panelResult.LAeq_min = min;
  panelResult.LAeq_max = max;
  panelResult.LAeq_avg = avg;
  panelResult.LAeq_p50 = sorted[p50Index];
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

  const result = results.panels.find((panel) => panel.panelId === current.id);
  if (!result || !Number.isFinite(result.LAeq_min) || !Number.isFinite(result.LAeq_max)) {
    panelLegend.innerHTML = '<span class="legend-empty">Measure grid results pending.</span>';
    return;
  }

  const gradientStops = [0, 0.25, 0.5, 0.75, 1]
    .map((stop) => `${colorToCss(getSampleColor(stop))} ${Math.round(stop * 100)}%`)
    .join(', ');

  panelLegend.innerHTML = `
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

  const result = results.panels.find((panel) => panel.panelId === current.id);
  if (!result) {
    panelStats.innerHTML = '<span class="legend-empty">Measure grid results pending.</span>';
    return;
  }

  const rows: Array<[string, string]> = [
    ['Average', `${formatLevel(result.LAeq_avg)} dB`],
    ['L50', `${formatLevel(result.LAeq_p50)} dB`],
    ['L95', `${formatLevel(result.LAeq_p95)} dB`],
    ['Min', `${formatLevel(result.LAeq_min)} dB`],
    ['Max', `${formatLevel(result.LAeq_max)} dB`],
    ['Samples', `${result.sampleCount}`],
  ];

  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    panelStats.appendChild(row);
  }
}

function selectionTypeLabel(type: Selection['type']) {
  if (type === 'panel') return 'Measure grid';
  if (type === 'source') return 'Source';
  if (type === 'receiver') return 'Receiver';
  if (type === 'barrier') return 'Barrier';
  if (type === 'building') return 'Building';
  return 'None';
}

function toolLabel(tool: Tool) {
  switch (tool) {
    case 'add-panel':
      return 'Add Measure Grid';
    case 'add-barrier':
      return 'Add Barrier';
    case 'add-building':
      return 'Add Building';
    case 'add-source':
      return 'Add Source';
    case 'add-receiver':
      return 'Add Receiver';
    case 'measure':
      return 'Measure';
    case 'delete':
      return 'Delete';
    default:
      return 'Select';
  }
}

function toolInstructionFor(tool: Tool) {
  switch (tool) {
    case 'add-source':
      return 'Click to place a source. Drag to reposition.';
    case 'add-receiver':
      return 'Click to place a receiver. Drag to reposition.';
    case 'add-barrier':
      return 'Click to set the start, then drag or click to place the end.';
    case 'add-panel':
      return 'Click to place a measure grid.';
    case 'add-building':
      return 'Click to place a building. Drag corners to resize and the lollipop to rotate.';
    case 'measure':
      return 'Click two points to measure distance.';
    case 'delete':
      return 'Click an item to remove it. Undo restores it.';
    default:
      return 'Click to select. Drag to move. Shift+drag to duplicate.';
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

function isSourceEnabled(source: Source) {
  if (!source.enabled) return false;
  if (soloSourceId) return source.id === soloSourceId;
  return true;
}

function buildEngineScene() {
  const engineScene = createEmptyScene(origin, 'UI Scene');

  engineScene.sources = scene.sources.map((source) => ({
    id: source.id,
    type: 'point',
    name: source.name.trim() || `Source ${source.id.toUpperCase()}`,
    position: { x: source.x, y: source.y, z: source.z },
    soundPowerLevel: source.power,
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

function mergeBounds(a: { minX: number; minY: number; maxX: number; maxY: number }, b: { minX: number; minY: number; maxX: number; maxY: number }) {
  // Union of two AABBs.
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function buildNoiseMapGridConfig(resolutionPx?: number) {
  // Resolution strategy:
  // - target ~50 cells across the max dimension (step ~= max(width,height)/50)
  // - clamp to ~2,500 points total for responsiveness
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
  let resolution = Math.max(paddedWidth, paddedHeight) / 50;
  // When a pixel step is supplied, convert to world meters for a predictable preview grid.
  if (Number.isFinite(resolutionPx) && Number.isFinite(pixelsPerMeter) && pixelsPerMeter > 0) {
    const stepPx = Math.max(1, resolutionPx);
    resolution = stepPx / pixelsPerMeter;
  }
  if (!Number.isFinite(resolution) || resolution <= 0) resolution = 1;

  let cols = Math.ceil(paddedWidth / resolution) + 1;
  let rows = Math.ceil(paddedHeight / resolution) + 1;
  if (!Number.isFinite(resolutionPx)) {
    const targetPoints = 2500;
    const pointCount = cols * rows;
    if (pointCount > targetPoints) {
      const scale = Math.sqrt(pointCount / targetPoints);
      resolution *= scale;
      cols = Math.ceil(paddedWidth / resolution) + 1;
      rows = Math.ceil(paddedHeight / resolution) + 1;
    }
  }

  return { bounds: padded, resolution, elevation: 1.5 };
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
        payload: buildPanelPayload(panel),
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
      LAeq_p50: MIN_LEVEL,
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

type NoiseMapComputeOptions = {
  resolutionPx?: number;
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

  const gridConfig = buildNoiseMapGridConfig(options.resolutionPx);
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
  await computeNoiseMapInternal();
}

function recalculateNoiseMap(resolutionPx: number) {
  if (!layers.noiseMap) return;
  if (isMapComputing) {
    queuedMapResolutionPx = resolutionPx;
    return;
  }
  // Silent recompute keeps UI responsive while updating the map texture.
  void computeNoiseMapInternal({ resolutionPx, silent: true, requestId: 'grid:live' });
}

function computeScene(options: { invalidateMap?: boolean } = {}) {
  if (options.invalidateMap !== false) {
    invalidateNoiseMap();
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
    return;
  }

  const preference = getComputePreference();
  const engineScene = buildSingleSourceScene(sourceId);

  void computeReceiversIncremental(engineScene, preference, sourceId);
  for (const panel of scene.panels) {
    void computePanelIncremental(engineScene, preference, sourceId, panel);
  }
}

function renderResults() {
  renderSources();

  if (receiverTable) {
    receiverTable.innerHTML = '';
    for (const receiver of results.receivers) {
      const row = document.createElement('div');
      row.className = 'result-row';
      row.innerHTML = `<span>${receiver.id.toUpperCase()}</span><strong>${formatLevel(receiver.LAeq)} dB</strong>`;
      receiverTable.appendChild(row);
    }
  }

  renderPanelLegend();
  renderPanelStats();
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

function createFieldLabel(label: string, tooltipText?: string) {
  const wrapper = document.createElement('span');
  wrapper.className = 'field-label';
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.appendChild(text);

  if (tooltipText) {
    const tooltip = document.createElement('span');
    tooltip.className = 'tooltip';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'tooltip-trigger ui-button';
    trigger.textContent = 'i';
    trigger.setAttribute('aria-label', `${label} info`);
    const content = document.createElement('span');
    content.className = 'tooltip-content';
    const note = document.createElement('span');
    note.className = 'tooltip-note';
    note.textContent = tooltipText;
    content.appendChild(note);
    tooltip.appendChild(trigger);
    tooltip.appendChild(content);
    wrapper.appendChild(tooltip);
  }

  return wrapper;
}

function createInlineField(label: string, value: number, onChange: (value: number) => void, tooltipText?: string) {
  const field = document.createElement('label');
  field.className = 'source-field';
  const name = createFieldLabel(label, tooltipText);
  const input = document.createElement('input');
  input.type = 'number';
  input.classList.add('ui-inset');
  input.step = '0.1';
  input.value = value.toString();
  input.addEventListener('change', () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onChange(next);
  });
  field.appendChild(name);
  field.appendChild(input);
  return field;
}

function renderSources() {
  if (!sourceTable) return;
  sourceTable.innerHTML = '';
  if (!scene.sources.length) {
    sourceTable.innerHTML = '<span class="legend-empty">No sources yet.</span>';
    return;
  }

  for (const source of scene.sources) {
    const row = document.createElement('div');
    row.className = 'source-row';
    row.classList.toggle('is-muted', !isSourceEnabled(source));
    row.classList.toggle('is-selected', selection.type === 'source' && selection.id === source.id);
    const header = document.createElement('div');
    header.className = 'source-row-header';
    const nameInput = document.createElement('input');
    nameInput.className = 'source-name ui-inset';
    nameInput.type = 'text';
    nameInput.value = source.name;
    nameInput.placeholder = 'Name';
    nameInput.addEventListener('input', () => {
      source.name = nameInput.value;
      markDirty();
    });
    nameInput.addEventListener('change', () => {
      pushHistory();
    });
    const idTag = document.createElement('span');
    idTag.className = 'source-id';
    idTag.textContent = source.id.toUpperCase();

    const controls = document.createElement('div');
    controls.className = 'source-controls';
    const soloButton = document.createElement('button');
    soloButton.type = 'button';
    soloButton.className = 'source-chip ui-button';
    soloButton.textContent = 'S';
    soloButton.classList.toggle('is-active', soloSourceId === source.id);
    soloButton.setAttribute('aria-pressed', soloSourceId === source.id ? 'true' : 'false');
    soloButton.setAttribute('aria-label', soloSourceId === source.id ? 'Unsolo source' : 'Solo source');
    soloButton.title = soloSourceId === source.id ? 'Unsolo source' : 'Solo source';
    soloButton.addEventListener('click', (event) => {
      event.stopPropagation();
      soloSourceId = soloSourceId === source.id ? null : source.id;
      pushHistory();
      renderSources();
      renderProperties();
      computeScene();
    });
    const muteButton = document.createElement('button');
    muteButton.type = 'button';
    muteButton.className = 'source-chip ui-button';
    muteButton.textContent = 'M';
    muteButton.classList.toggle('is-active', !source.enabled);
    muteButton.setAttribute('aria-pressed', !source.enabled ? 'true' : 'false');
    muteButton.setAttribute('aria-label', source.enabled ? 'Mute source' : 'Unmute source');
    muteButton.title = source.enabled ? 'Mute source' : 'Unmute source';
    muteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      source.enabled = !source.enabled;
      pushHistory();
      renderSources();
      renderProperties();
      computeScene();
    });
    controls.appendChild(soloButton);
    controls.appendChild(muteButton);
    const collapseButton = document.createElement('button');
    collapseButton.type = 'button';
    collapseButton.className = 'source-collapse';
    const isCollapsed = collapsedSources.has(source.id);
    collapseButton.textContent = isCollapsed ? '>' : 'v';
    collapseButton.setAttribute('aria-label', isCollapsed ? 'Expand source' : 'Collapse source');
    collapseButton.title = isCollapsed ? 'Expand' : 'Collapse';
    collapseButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (collapsedSources.has(source.id)) {
        collapsedSources.delete(source.id);
      } else {
        collapsedSources.add(source.id);
      }
      renderSources();
    });

    const titleBlock = document.createElement('div');
    titleBlock.className = 'source-title';
    titleBlock.appendChild(nameInput);
    titleBlock.appendChild(idTag);

    const headerActions = document.createElement('div');
    headerActions.className = 'source-actions';
    headerActions.appendChild(controls);
    headerActions.appendChild(collapseButton);

    header.appendChild(titleBlock);
    header.appendChild(headerActions);
    row.appendChild(header);

    const fields = document.createElement('div');
    fields.className = 'source-fields';
    fields.appendChild(createInlineField('Sound Power ($L_W$)', source.power, (value) => {
      source.power = value;
      pushHistory();
      renderProperties();
      computeScene();
    }, 'Total acoustic energy'));
    fields.appendChild(createInlineField('Height (m)', source.z, (value) => {
      source.z = value;
      pushHistory();
      renderProperties();
      computeScene();
    }));
    if (!collapsedSources.has(source.id)) {
      row.appendChild(fields);
    }

    row.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'BUTTON') return;
      setSelection({ type: 'source', id: source.id });
    });

    sourceTable.appendChild(row);
  }

  if (sourceSumMode) {
    sourceSumMode.textContent = soloSourceId
      ? `Summation: Energetic (dB) - Solo ${soloSourceId.toUpperCase()}`
      : 'Summation: Energetic (dB)';
  }
}

function createId(prefix: string, seq: number) {
  return `${prefix}${seq}`;
}

function duplicateSource(source: Source): Source {
  const newId = createId('s', sourceSeq++);
  return {
    ...source,
    id: newId,
    name: `${source.name || source.id.toUpperCase()} Copy`,
  };
}

function duplicateReceiver(receiver: Receiver): Receiver {
  const newId = createId('r', receiverSeq++);
  return { ...receiver, id: newId };
}

function duplicatePanel(panel: Panel): Panel {
  const newId = createId('p', panelSeq++);
  return {
    ...panel,
    id: newId,
    points: panel.points.map((pt) => ({ ...pt })),
    sampling: { ...panel.sampling },
  };
}

function duplicateBarrier(barrier: Barrier): Barrier {
  const newId = createId('b', barrierSeq++);
  return {
    ...barrier,
    id: newId,
    p1: { ...barrier.p1 },
    p2: { ...barrier.p2 },
  };
}

function duplicateBuilding(building: Building): Building {
  const newId = createId('bd', buildingSeq++);
  return new Building({ ...building.toData(), id: newId });
}

function setActiveTool(tool: Tool) {
  activeTool = tool;
  if (tool !== 'add-barrier') {
    barrierDraft = null;
    barrierDraftAnchored = false;
    barrierDragActive = false;
  }
  if (modeLabel) {
    modeLabel.textContent = toolLabel(tool);
  }
  if (debugMode) {
    debugMode.textContent = toolLabel(tool);
  }
  if (toolInstruction) {
    toolInstruction.textContent = toolInstructionFor(tool);
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
    building.selected = selection.type === 'building' && selection.id === building.id;
  }
  const current = selection;
  // Reveal the context inspector only when there's an active selection.
  if (contextPanel) {
    const isOpen = current.type !== 'none';
    contextPanel.classList.toggle('is-open', isOpen);
    contextPanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  }
  if (panelStatsSection) {
    panelStatsSection.classList.toggle('is-hidden', current.type !== 'panel');
  }
  if (selectionLabel) {
    selectionLabel.textContent = current.type === 'none'
      ? 'None'
      : `${selectionTypeLabel(current.type)} ${current.id.toUpperCase()}`;
  }
  if (selectionHint) {
    selectionHint.classList.toggle('is-hidden', current.type !== 'none');
  }
  renderProperties();
  renderSources();
  renderPanelLegend();
  renderPanelStats();
  requestRender();
}

function renderProperties() {
  if (!propertiesBody) return;
  propertiesBody.innerHTML = '';
  const current = selection;

  if (current.type === 'none') {
    const empty = document.createElement('div');
    empty.className = 'properties-empty';
    const title = document.createElement('div');
    title.textContent = 'Select an item to edit.';
    empty.appendChild(title);

    if (scene.sources.length) {
      const tip = document.createElement('button');
      tip.type = 'button';
      tip.className = 'text-button';
      tip.textContent = `Click ${scene.sources[0].id.toUpperCase()} to edit level/height.`;
      tip.addEventListener('click', () => setSelection({ type: 'source', id: scene.sources[0].id }));
      empty.appendChild(tip);
    }
    if (scene.receivers.length) {
      const tip = document.createElement('button');
      tip.type = 'button';
      tip.className = 'text-button';
      tip.textContent = `Click ${scene.receivers[0].id.toUpperCase()} to edit height.`;
      tip.addEventListener('click', () => setSelection({ type: 'receiver', id: scene.receivers[0].id }));
      empty.appendChild(tip);
    }
    if (scene.panels.length) {
      const tip = document.createElement('button');
      tip.type = 'button';
      tip.className = 'text-button';
      tip.textContent = `Click ${scene.panels[0].id.toUpperCase()} to edit spacing.`;
      tip.addEventListener('click', () => setSelection({ type: 'panel', id: scene.panels[0].id }));
      empty.appendChild(tip);
    }
    if (scene.barriers.length) {
      const tip = document.createElement('button');
      tip.type = 'button';
      tip.className = 'text-button';
      tip.textContent = `Click ${scene.barriers[0].id.toUpperCase()} to edit height.`;
      tip.addEventListener('click', () => setSelection({ type: 'barrier', id: scene.barriers[0].id }));
      empty.appendChild(tip);
    }
    if (scene.buildings.length) {
      const tip = document.createElement('button');
      tip.type = 'button';
      tip.className = 'text-button';
      tip.textContent = `Click ${scene.buildings[0].id.toUpperCase()} to edit size.`;
      tip.addEventListener('click', () => setSelection({ type: 'building', id: scene.buildings[0].id }));
      empty.appendChild(tip);
    }

    propertiesBody.appendChild(empty);
    return;
  }

  const header = document.createElement('div');
  header.className = 'property-header';
  header.innerHTML = `<strong>${selectionTypeLabel(current.type)}</strong><span>${current.id.toUpperCase()}</span>`;
  propertiesBody.appendChild(header);

  if (current.type === 'source') {
    const source = scene.sources.find((item) => item.id === current.id);
    if (!source) return;
    propertiesBody.appendChild(createTextRow('Name', source.name, (value) => {
      source.name = value;
    }));
    propertiesBody.appendChild(createInputRow('Sound Power ($L_W$)', source.power, (value) => {
      source.power = value;
      pushHistory();
      computeScene();
    }, 'Total acoustic energy'));
    propertiesBody.appendChild(createInputRow('Height (m)', source.z, (value) => {
      source.z = value;
      pushHistory();
      computeScene();
    }));
  }

  if (current.type === 'receiver') {
    const receiver = scene.receivers.find((item) => item.id === current.id);
    if (!receiver) return;
    propertiesBody.appendChild(createInputRow('Height (m)', receiver.z, (value) => {
      receiver.z = value;
      pushHistory();
      computeScene();
    }));
  }

  if (current.type === 'panel') {
    const panel = scene.panels.find((item) => item.id === current.id);
    if (!panel) return;
    propertiesBody.appendChild(createInputRow('Elevation (m)', panel.elevation, (value) => {
      panel.elevation = value;
      pushHistory();
      computeScene();
    }));
    propertiesBody.appendChild(createInputRow('Spacing (m)', panel.sampling.resolution, (value) => {
      panel.sampling.resolution = Math.max(1, value);
      pushHistory();
      computeScene();
    }));
    const hint = document.createElement('div');
    hint.className = 'property-hint';
    hint.textContent = 'Drag corner handles on the measure grid to reshape.';
    propertiesBody.appendChild(hint);
  }

  if (current.type === 'barrier') {
    const barrier = scene.barriers.find((item) => item.id === current.id);
    if (!barrier) return;
    propertiesBody.appendChild(createInputRow('Wall height (m)', barrier.height, (value) => {
      barrier.height = Math.max(0.1, value);
      pushHistory();
      computeScene();
    }));
  }

  if (current.type === 'building') {
    const building = scene.buildings.find((item) => item.id === current.id);
    if (!building) return;
    propertiesBody.appendChild(createInputRow('Width (m)', building.width, (value) => {
      building.width = Math.max(BUILDING_MIN_SIZE, value);
      pushHistory();
      computeScene();
    }));
    propertiesBody.appendChild(createInputRow('Depth (m)', building.height, (value) => {
      building.height = Math.max(BUILDING_MIN_SIZE, value);
      pushHistory();
      computeScene();
    }));
    propertiesBody.appendChild(createInputRow('Height (m)', building.z_height, (value) => {
      building.z_height = Math.max(0.1, value);
      pushHistory();
      computeScene();
    }));
    propertiesBody.appendChild(createInputRow('Rotation (deg)', (building.rotation * 180) / Math.PI, (value) => {
      building.rotation = (value * Math.PI) / 180;
      pushHistory();
      computeScene();
    }));
    const hint = document.createElement('div');
    hint.className = 'property-hint';
    hint.textContent = 'Drag corner handles to resize. Drag the lollipop to rotate.';
    propertiesBody.appendChild(hint);
  }
}

function createInputRow(label: string, value: number, onChange: (value: number) => void, tooltipText?: string) {
  const row = document.createElement('div');
  row.className = 'property-row';
  const name = createFieldLabel(label, tooltipText);
  const input = document.createElement('input');
  input.type = 'number';
  input.classList.add('ui-inset');
  input.value = value.toString();
  input.addEventListener('change', () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onChange(next);
  });
  row.appendChild(name);
  row.appendChild(input);
  return row;
}

function createTextRow(label: string, value: string, onChange: (value: string) => void) {
  const row = document.createElement('div');
  row.className = 'property-row';
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'text';
  input.classList.add('ui-inset');
  input.value = value;
  input.addEventListener('input', () => {
    onChange(input.value);
    markDirty();
  });
  input.addEventListener('change', () => pushHistory());
  row.appendChild(name);
  row.appendChild(input);
  return row;
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

function updateMapSettingsControls() {
  if (mapRenderStyleToggle) {
    mapRenderStyleToggle.checked = mapRenderStyle === 'Contours';
  }
  if (mapBandStepInput) {
    mapBandStepInput.value = getMapBandStep().toString();
    mapBandStepInput.disabled = mapRenderStyle !== 'Contours';
  }
  if (mapBandStepRow) {
    mapBandStepRow.classList.toggle('is-hidden', mapRenderStyle !== 'Contours');
  }
  if (mapAutoScaleToggle) {
    mapAutoScaleToggle.checked = mapAutoScale;
  }
}

function wireMapSettings() {
  if (!mapRenderStyleToggle && !mapBandStepInput && !mapAutoScaleToggle) return;

  updateMapSettingsControls();

  mapRenderStyleToggle?.addEventListener('change', () => {
    mapRenderStyle = mapRenderStyleToggle.checked ? 'Contours' : 'Smooth';
    updateMapSettingsControls();
    refreshNoiseMapVisualization();
  });

  const applyBandStep = (shouldClamp: boolean) => {
    if (!mapBandStepInput) return;
    const next = Number(mapBandStepInput.value);
    if (!Number.isFinite(next)) {
      if (shouldClamp) {
        mapBandStepInput.value = getMapBandStep().toString();
      }
      return;
    }
    mapBandStep = Math.min(20, Math.max(1, next));
    if (shouldClamp) {
      mapBandStepInput.value = mapBandStep.toString();
    }
    refreshNoiseMapVisualization();
  };

  mapBandStepInput?.addEventListener('input', () => {
    applyBandStep(false);
  });

  mapBandStepInput?.addEventListener('change', () => {
    applyBandStep(true);
  });

  mapAutoScaleToggle?.addEventListener('change', () => {
    mapAutoScale = mapAutoScaleToggle.checked;
    refreshNoiseMapVisualization();
  });
}

function wireRefineButton() {
  if (!refineButton) return;
  refineButton.addEventListener('click', () => {
    // Manual refine overrides any queued low-res update.
    queuedMapResolutionPx = null;
    setInteractionActive(false);
    ctx.imageSmoothingEnabled = false;
    recalculateNoiseMap(RES_HIGH);
    needsUpdate = true;
    requestRender();
  });
}

function wireLayersPopover() {
  if (!layersButton || !layersPopover) return;
  const container = layersButton.closest('.layers-toggle') as HTMLDivElement | null;
  if (!container) return;

  // Keep the popover lightweight: no modal, just a click-away dropdown.
  const close = () => {
    container.classList.remove('is-open');
    layersButton.setAttribute('aria-expanded', 'false');
    layersPopover.setAttribute('aria-hidden', 'true');
  };

  const toggle = () => {
    const isOpen = container.classList.toggle('is-open');
    layersButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    layersPopover.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  };

  layersButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggle();
  });

  document.addEventListener('click', (event) => {
    if (!container.contains(event.target as Node)) {
      close();
    }
  });

  window.addEventListener('resize', close);
}

function wireSettingsPopover() {
  if (!settingsButton || !settingsPopover) return;
  const container = settingsButton.closest('.settings-toggle') as HTMLDivElement | null;
  if (!container) return;

  const close = () => {
    container.classList.remove('is-open');
    settingsButton.setAttribute('aria-expanded', 'false');
    settingsPopover.setAttribute('aria-hidden', 'true');
  };

  const toggle = () => {
    const isOpen = container.classList.toggle('is-open');
    settingsButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    settingsPopover.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  };

  settingsButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggle();
  });

  document.addEventListener('click', (event) => {
    if (!container.contains(event.target as Node)) {
      close();
    }
  });

  window.addEventListener('resize', close);
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

function wireTools() {
  if (!toolGrid) return;
  toolGrid.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const button = target.closest<HTMLButtonElement>('button[data-tool]');
    if (!button) return;
    const tool = button.dataset.tool as Tool;
    setActiveTool(tool);
  });
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

function hitTest(point: Point) {
  const threshold = 12;
  const hitSource = scene.sources.find((source) => {
    const screen = worldToCanvas(source);
    return distance(screen, point) <= threshold;
  });
  if (hitSource) return { type: 'source' as const, id: hitSource.id };

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
  if (target.type === 'source') {
    scene.sources = scene.sources.filter((item) => item.id !== target.id);
  }
  if (target.type === 'receiver') {
    scene.receivers = scene.receivers.filter((item) => item.id !== target.id);
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

function commitBarrierDraft() {
  if (!barrierDraft) return;
  // Commit the in-progress barrier draft into the scene list.
  //
  // Defaults:
  // - height: 3m, a typical small screen / fence / wall height for quick iteration.
  // - transmissionLoss: Infinity (placeholder). We currently model barriers as diffracting screens only;
  //   future work can incorporate transmissionLoss / attenuationDb as “through-barrier” energy reduction.
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
  updateCounts();
  pushHistory();
  computeScene();
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
}

function addBuildingAt(point: Point) {
  const building = new Building({
    id: createId('bd', buildingSeq++),
    x: point.x,
    y: point.y,
    width: 12,
    height: 10,
    rotation: 0,
    z_height: 10,
  });
  scene.buildings.push(building);
  setSelection({ type: 'building', id: building.id });
  updateCounts();
  pushHistory();
  computeScene();
}

function addSourceAt(point: Point) {
  const source: Source = {
    id: createId('s', sourceSeq++),
    name: `Source ${sourceSeq - 1}`,
    x: point.x,
    y: point.y,
    z: 1.5,
    power: 100,
    enabled: true,
  };
  scene.sources.push(source);
  setSelection({ type: 'source', id: source.id });
  updateCounts();
  pushHistory();
  computeScene();
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
}

function drawGrid() {
  const rect = canvas.getBoundingClientRect();
  const stepMeters = 20;
  const stepPixels = stepMeters * pixelsPerMeter;

  ctx.strokeStyle = canvasTheme.gridLine;
  ctx.lineWidth = 1;

  for (let x = rect.width / 2 % stepPixels; x <= rect.width; x += stepPixels) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, rect.height);
    ctx.stroke();
  }

  for (let y = rect.height / 2 % stepPixels; y <= rect.height; y += stepPixels) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(rect.width, y);
    ctx.stroke();
  }
}

function drawNoiseMap() {
  // Draw the precomputed heatmap texture scaled to its world-space bounds.
  // This is the critical step: the map is not drawn at native pixel size; it is stretched
  // to cover (minX,minY)-(maxX,maxY) in world coordinates.
  if (!noiseMap) return;
  const topLeft = worldToCanvas({ x: noiseMap.bounds.minX, y: noiseMap.bounds.maxY });
  const bottomRight = worldToCanvas({ x: noiseMap.bounds.maxX, y: noiseMap.bounds.minY });
  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;
  if (width <= 0 || height <= 0) return;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(noiseMap.texture, topLeft.x, topLeft.y, width, height);
  ctx.restore();
}

function drawMeasurement() {
  if (!measureStart || !measureEnd) return;
  const start = worldToCanvas(measureStart);
  const end = worldToCanvas(measureEnd);
  const dist = distance(measureStart, measureEnd);

  ctx.strokeStyle = canvasTheme.measureLine;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const label = `${formatMeters(dist)} m`;
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  ctx.fillStyle = canvasTheme.measureText;
  ctx.font = '12px "Work Sans", sans-serif';
  ctx.fillText(label, mid.x + 6, mid.y - 6);
}

function drawPanelSamples(panelResult: PanelResult) {
  if (!layers.panels) return;
  const min = panelResult.LAeq_min;
  const max = panelResult.LAeq_max;
  ctx.lineWidth = 1;
  ctx.strokeStyle = canvasTheme.sampleStroke;
  for (const sample of panelResult.samples) {
    const ratio = panelSampleRatio(sample, min, max);
    const color = getSampleColor(ratio);
    ctx.fillStyle = colorToCss(color);
    const pos = worldToCanvas(sample);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawPanels() {
  ctx.strokeStyle = canvasTheme.panelStroke;
  ctx.fillStyle = canvasTheme.panelFill;
  ctx.lineWidth = 2;

  for (const panel of scene.panels) {
    if (panel.points.length < 3) continue;
    const first = worldToCanvas(panel.points[0]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const pt of panel.points.slice(1)) {
      const p = worldToCanvas(pt);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (selection.type === 'panel' && selection.id === panel.id) {
      ctx.strokeStyle = canvasTheme.selectionHalo;
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.strokeStyle = canvasTheme.panelSelected;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = canvasTheme.panelStroke;
      ctx.lineWidth = 2;

      ctx.fillStyle = canvasTheme.panelHandleFill;
      ctx.strokeStyle = canvasTheme.panelHandleStroke;
      ctx.lineWidth = 2;
      for (const point of panel.points) {
        const handle = worldToCanvas(point);
        ctx.beginPath();
        ctx.arc(handle.x, handle.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
}

function drawBuildings() {
  ctx.lineWidth = 2;
  for (const building of scene.buildings) {
    const vertices = building.getVertices();
    if (vertices.length < 3) continue;
    const first = worldToCanvas(vertices[0]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const vertex of vertices.slice(1)) {
      const point = worldToCanvas(vertex);
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.fillStyle = building.color;
    ctx.strokeStyle = canvasTheme.panelStroke;
    ctx.fill();
    ctx.stroke();

    const handleOffset = BUILDING_ROTATION_HANDLE_OFFSET_PX / pixelsPerMeter;
    building.renderControls(ctx, worldToCanvas, {
      stroke: canvasTheme.panelSelected,
      lineWidth: 2,
      dash: [6, 6],
      handleFill: '#ffffff',
      handleStroke: canvasTheme.panelStroke,
      handleRadius: BUILDING_HANDLE_RADIUS,
      rotationHandleOffset: handleOffset,
      rotationHandleRadius: BUILDING_ROTATION_HANDLE_RADIUS,
      rotationHandleStroke: canvasTheme.panelStroke,
    });
  }
}

function drawBarriers() {
  // Render barriers as thick screen lines; selection adds a halo for visibility.
  // - Solid stroke: committed barriers in the scene.
  // - Dashed stroke: in-progress barrierDraft while the user is placing endpoints.
  const drawLine = (start: Point, end: Point, stroke: string, width: number, dash?: number[]) => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.setLineDash(dash ?? []);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    if (dash) {
      ctx.setLineDash([]);
    }
  };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const barrier of scene.barriers) {
    const start = worldToCanvas(barrier.p1);
    const end = worldToCanvas(barrier.p2);
    if (selection.type === 'barrier' && selection.id === barrier.id) {
      drawLine(start, end, canvasTheme.selectionHalo, 12);
      drawLine(start, end, canvasTheme.barrierSelected, 6);
    } else {
      drawLine(start, end, canvasTheme.barrierStroke, 6);
    }
  }

  if (barrierDraft) {
    const start = worldToCanvas(barrierDraft.p1);
    const end = worldToCanvas(barrierDraft.p2);
    drawLine(start, end, canvasTheme.barrierStroke, 4, [6, 6]);
  }
}

function drawSources() {
  const activeFill = canvasTheme.sourceFill;
  const activeStroke = canvasTheme.sourceStroke;
  const mutedFill = canvasTheme.sourceMutedFill;
  const mutedStroke = canvasTheme.sourceMutedStroke;
  const mutedText = canvasTheme.sourceMutedText;
  const labelText = canvasTheme.sourceLabel;

  for (const source of scene.sources) {
    const isMuted = !source.enabled;
    const isSuppressed = !!soloSourceId && soloSourceId !== source.id;
    const isDimmed = isMuted || isSuppressed;
    const fill = isDimmed ? mutedFill : activeFill;
    const stroke = isDimmed ? mutedStroke : activeStroke;
    const p = worldToCanvas(source);
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (selection.type === 'source' && selection.id === source.id) {
      ctx.fillStyle = canvasTheme.selectionHalo;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = canvasTheme.sourceRing;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
    }

    ctx.fillStyle = isDimmed ? mutedText : labelText;
    ctx.font = '12px "Work Sans", sans-serif';
    ctx.fillText(source.id.toUpperCase(), p.x + 14, p.y - 6);

    const isHovered = hoverSelection?.type === 'source' && hoverSelection.id === source.id;
    if (isHovered && isMuted) {
      const label = 'Muted';
      ctx.font = '11px "Work Sans", sans-serif';
      const paddingX = 6;
      const boxWidth = ctx.measureText(label).width + paddingX * 2;
      const boxHeight = 18;
      const boxX = p.x + 14;
      const boxY = p.y + 8;
      ctx.fillStyle = canvasTheme.sourceTooltipBg;
      ctx.strokeStyle = canvasTheme.sourceTooltipBorder;
      ctx.lineWidth = 1;
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
      ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
      ctx.fillStyle = canvasTheme.sourceTooltipText;
      ctx.fillText(label, boxX + paddingX, boxY + 12);
    }
  }
}

function drawReceivers() {
  ctx.fillStyle = canvasTheme.receiverFill;
  ctx.strokeStyle = canvasTheme.receiverStroke;
  ctx.lineWidth = 2;

  for (const receiver of scene.receivers) {
    const p = worldToCanvas(receiver);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 10);
    ctx.lineTo(p.x + 10, p.y + 10);
    ctx.lineTo(p.x - 10, p.y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (selection.type === 'receiver' && selection.id === receiver.id) {
      ctx.fillStyle = canvasTheme.selectionHalo;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = canvasTheme.receiverRing;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = canvasTheme.receiverStroke;
      ctx.lineWidth = 2;
    }

    ctx.fillStyle = canvasTheme.receiverLabel;
    ctx.font = '12px "Work Sans", sans-serif';
    ctx.fillText(receiver.id.toUpperCase(), p.x + 14, p.y + 4);
    ctx.fillStyle = canvasTheme.receiverFill;
  }
}

function drawReceiverBadges() {
  const map = new Map(results.receivers.map((item) => [item.id, item]));
  for (const receiver of scene.receivers) {
    const result = map.get(receiver.id);
    if (!result) continue;
    const p = worldToCanvas(receiver);
    const label = `${formatLevel(result.LAeq)} dB`;
    ctx.font = '12px "Work Sans", sans-serif';
    ctx.fillStyle = canvasTheme.badgeBg;
    ctx.strokeStyle = canvasTheme.badgeBorder;
    ctx.lineWidth = 1;
    const width = ctx.measureText(label).width + 14;
    ctx.fillRect(p.x + 12, p.y + 14, width, 20);
    ctx.strokeRect(p.x + 12, p.y + 14, width, 20);
    ctx.fillStyle = canvasTheme.badgeText;
    ctx.fillText(label, p.x + 18, p.y + 28);
  }
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
  ctx.fillStyle = canvasTheme.canvasBg;
  ctx.fillRect(0, 0, rect.width, rect.height);

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

  if (activeTool === 'measure') {
    drawMeasurement();
  }
}

function setInteractionActive(active: boolean) {
  if (interactionActive === active) return;
  interactionActive = active;
  ctx.imageSmoothingEnabled = active;
  // Switching smoothing affects map draw, so request a frame.
  requestRender();
}

function shouldLiveUpdateMap(activeDrag: DragState | null) {
  return activeDrag?.type === 'source' || activeDrag?.type === 'barrier';
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
    }
  }
  if (activeDrag.type === 'receiver') {
    const receiver = scene.receivers.find((item) => item.id === activeDrag.id);
    if (receiver) {
      receiver.x = targetPoint.x;
      receiver.y = targetPoint.y;
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
    }
  }
  if (activeDrag.type === 'building') {
    const building = scene.buildings.find((item) => item.id === activeDrag.id);
    if (building) {
      building.x = targetPoint.x;
      building.y = targetPoint.y;
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
  if (activeDrag.type === 'panel-vertex') {
    const panel = scene.panels.find((item) => item.id === activeDrag.id);
    if (panel && panel.points[activeDrag.index]) {
      panel.points[activeDrag.index] = { x: targetPoint.x, y: targetPoint.y };
    }
  }

  // Limit live noise-map work to drags that affect propagation.
  const shouldUpdateMap = shouldLiveUpdateMap(activeDrag);
  if (activeDrag.type === 'source') {
    computeSceneIncremental(activeDrag.id);
  } else {
    computeScene({ invalidateMap: false });
  }

  if (shouldUpdateMap) {
    recalculateNoiseMap(RES_LOW);
  }
  requestRender();
  dragDirty = true;
}

const throttledDragMove = throttle((worldPoint: any) => {
  applyDrag(worldPoint);
}, DRAG_FRAME_MS);

function handlePointerMove(event: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const worldPoint = canvasToWorld(canvasPoint);

  if (panState) {
    const dx = canvasPoint.x - panState.start.x;
    const dy = canvasPoint.y - panState.start.y;
    panOffset = {
      x: panState.origin.x + dx / pixelsPerMeter,
      y: panState.origin.y - dy / pixelsPerMeter,
    };
    requestRender();
  }

  const { point: snappedPoint, snapped } = snapPoint(worldPoint);
  if (snapIndicator) {
    if (snapped) {
      const screen = worldToCanvas(snappedPoint);
      snapIndicator.style.display = 'block';
      snapIndicator.style.transform = `translate(${screen.x}px, ${screen.y}px)`;
    } else {
      snapIndicator.style.display = 'none';
    }
  }

  if (debugX) debugX.textContent = formatMeters(worldPoint.x);
  if (debugY) debugY.textContent = formatMeters(worldPoint.y);

  if (panState) {
    return;
  }

  if (activeTool === 'add-barrier' && barrierDragActive && barrierDraft) {
    barrierDraft.p2 = snappedPoint;
    requestRender();
    return;
  }

  if (!dragState && (activeTool === 'select' || activeTool === 'delete')) {
    const nextHover = hitTest(canvasPoint);
    if (!sameSelection(hoverSelection, nextHover)) {
      hoverSelection = nextHover;
      requestRender();
    }
  } else if (!dragState && hoverSelection) {
    hoverSelection = null;
    requestRender();
  }

  if (dragState) {
    throttledDragMove(worldPoint);
  }

  if (activeTool === 'measure' && measureStart && !measureLocked) {
    measureEnd = worldPoint;
    requestRender();
  }
}

function handlePointerDown(event: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const worldPoint = canvasToWorld(canvasPoint);
  const { point: snappedPoint } = snapPoint(worldPoint);
  hoverSelection = null;

  if (activeTool === 'add-source') {
    addSourceAt(snappedPoint);
    return;
  }

  if (activeTool === 'add-receiver') {
    addReceiverAt(snappedPoint);
    return;
  }

  if (activeTool === 'add-barrier') {
    if (!barrierDraft) {
      barrierDraft = { p1: snappedPoint, p2: snappedPoint };
      barrierDraftAnchored = false;
    } else {
      barrierDraft.p2 = snappedPoint;
    }
    barrierDragActive = true;
    requestRender();
    return;
  }

  if (activeTool === 'add-panel') {
    addPanelAt(snappedPoint);
    return;
  }

  if (activeTool === 'add-building') {
    addBuildingAt(snappedPoint);
    return;
  }

  if (activeTool === 'measure') {
    if (!measureStart || measureLocked) {
      measureStart = worldPoint;
      measureEnd = worldPoint;
      measureLocked = false;
    } else {
      measureEnd = worldPoint;
      measureLocked = true;
    }
    requestRender();
    return;
  }

  if (activeTool === 'select') {
    const buildingHandle = hitTestBuildingHandle(canvasPoint);
    if (buildingHandle) {
      const current = selection;
      if (current.type === 'building') {
        const building = scene.buildings.find((item) => item.id === current.id);
        if (building) {
          dragDirty = false;
          if (buildingHandle.type === 'rotate') {
            const startAngle = Math.atan2(worldPoint.y - building.y, worldPoint.x - building.x);
            dragState = {
              type: 'building-rotate',
              id: building.id,
              startAngle,
              startRotation: building.rotation,
            };
          } else {
            dragState = { type: 'building-resize', id: building.id };
          }
          startInteractionForDrag(dragState);
          return;
        }
      }
    }
    const handleHit = hitTestPanelHandle(canvasPoint);
    if (handleHit) {
      setSelection({ type: 'panel', id: handleHit.panelId });
      const panel = scene.panels.find((item) => item.id === handleHit.panelId);
      if (panel) {
        const vertex = panel.points[handleHit.index];
        dragState = {
          type: 'panel-vertex',
          id: panel.id,
          index: handleHit.index,
          offset: { x: worldPoint.x - vertex.x, y: worldPoint.y - vertex.y },
        };
        startInteractionForDrag(dragState);
      }
      return;
    }
  }

  const hit = hitTest(canvasPoint);
  if (activeTool === 'delete') {
    if (hit) deleteSelection(hit);
    return;
  }

  if (hit) {
    setSelection(hit);
    const worldHit = canvasToWorld(canvasPoint);
    dragDirty = false;

    if (hit.type === 'source') {
      const source = scene.sources.find((item) => item.id === hit.id);
      if (source) {
        if (event.shiftKey) {
          const duplicate = duplicateSource(source);
          duplicate.x = source.x + 2;
          duplicate.y = source.y - 2;
          scene.sources.push(duplicate);
          updateCounts();
          setSelection({ type: 'source', id: duplicate.id });
          dragDirty = true;
          dragState = {
            type: 'source',
            id: duplicate.id,
            offset: { x: worldHit.x - duplicate.x, y: worldHit.y - duplicate.y },
          };
          primeDragContribution(duplicate.id);
          startInteractionForDrag(dragState);
          return;
        }
        dragState = { type: 'source', id: source.id, offset: { x: worldHit.x - source.x, y: worldHit.y - source.y } };
        primeDragContribution(source.id);
      }
    }
    if (hit.type === 'receiver') {
      const receiver = scene.receivers.find((item) => item.id === hit.id);
      if (receiver) {
        if (event.shiftKey) {
          const duplicate = duplicateReceiver(receiver);
          duplicate.x = receiver.x + 2;
          duplicate.y = receiver.y - 2;
          scene.receivers.push(duplicate);
          updateCounts();
          setSelection({ type: 'receiver', id: duplicate.id });
          dragDirty = true;
          dragState = {
            type: 'receiver',
            id: duplicate.id,
            offset: { x: worldHit.x - duplicate.x, y: worldHit.y - duplicate.y },
          };
          startInteractionForDrag(dragState);
          return;
        }
        dragState = { type: 'receiver', id: receiver.id, offset: { x: worldHit.x - receiver.x, y: worldHit.y - receiver.y } };
      }
    }
    if (hit.type === 'panel') {
      const panel = scene.panels.find((item) => item.id === hit.id);
      if (panel) {
        if (event.shiftKey) {
          const duplicate = duplicatePanel(panel);
          duplicate.points = panel.points.map((pt) => ({ x: pt.x + 2, y: pt.y - 2 }));
          scene.panels.push(duplicate);
          updateCounts();
          setSelection({ type: 'panel', id: duplicate.id });
          dragDirty = true;
          const first = duplicate.points[0];
        dragState = { type: 'panel', id: duplicate.id, offset: { x: worldHit.x - first.x, y: worldHit.y - first.y } };
        startInteractionForDrag(dragState);
        return;
      }
      const first = panel.points[0];
      dragState = { type: 'panel', id: panel.id, offset: { x: worldHit.x - first.x, y: worldHit.y - first.y } };
      }
    }
    if (hit.type === 'barrier') {
      const barrier = scene.barriers.find((item) => item.id === hit.id);
      if (barrier) {
        if (event.shiftKey) {
          const duplicate = duplicateBarrier(barrier);
          duplicate.p1 = { x: barrier.p1.x + 2, y: barrier.p1.y - 2 };
          duplicate.p2 = { x: barrier.p2.x + 2, y: barrier.p2.y - 2 };
          scene.barriers.push(duplicate);
          updateCounts();
          setSelection({ type: 'barrier', id: duplicate.id });
          dragDirty = true;
          dragState = {
            type: 'barrier',
            id: duplicate.id,
            offset: { x: worldHit.x - duplicate.p1.x, y: worldHit.y - duplicate.p1.y },
          };
          startInteractionForDrag(dragState);
          return;
        }
        dragState = { type: 'barrier', id: barrier.id, offset: { x: worldHit.x - barrier.p1.x, y: worldHit.y - barrier.p1.y } };
      }
    }
    if (hit.type === 'building') {
      const building = scene.buildings.find((item) => item.id === hit.id);
      if (building) {
        if (event.shiftKey) {
          const duplicate = duplicateBuilding(building);
          duplicate.x = building.x + 2;
          duplicate.y = building.y - 2;
          scene.buildings.push(duplicate);
          updateCounts();
          setSelection({ type: 'building', id: duplicate.id });
          dragDirty = true;
          dragState = {
            type: 'building',
            id: duplicate.id,
            offset: { x: worldHit.x - duplicate.x, y: worldHit.y - duplicate.y },
          };
          startInteractionForDrag(dragState);
          return;
        }
        dragState = { type: 'building', id: building.id, offset: { x: worldHit.x - building.x, y: worldHit.y - building.y } };
      }
    }
  } else {
    setSelection({ type: 'none' });
    if (activeTool === 'select') {
      panState = { start: canvasPoint, origin: { ...panOffset } };
    }
  }

  if (dragState) {
    startInteractionForDrag(dragState);
  }
}

function handlePointerLeave() {
  if (hoverSelection) {
    hoverSelection = null;
    requestRender();
  }
  if (snapIndicator) {
    snapIndicator.style.display = 'none';
  }
}

function handlePointerUp() {
  if (barrierDragActive && barrierDraft) {
    // If user dragged a visible length, commit immediately; otherwise wait for a second click.
    const draftDistance = distance(barrierDraft.p1, barrierDraft.p2);
    if (barrierDraftAnchored || draftDistance > 0.5) {
      commitBarrierDraft();
    } else {
      // First click without a meaningful drag:
      // keep the draft around so the next click can set p2 (classic click-then-click placement).
      barrierDraftAnchored = true;
      barrierDragActive = false;
      requestRender();
    }
    return;
  }
  if (panState) {
    panState = null;
    return;
  }
  if (dragState) {
    throttledDragMove.flush();
    throttledDragMove.cancel();
    const shouldRecalculateMap = shouldLiveUpdateMap(dragState);
    dragState = null;
    setInteractionActive(false);
    // Ensure a crisp final map after drag updates and clear queued low-res work.
    ctx.imageSmoothingEnabled = false;
    queuedMapResolutionPx = null;
    if (dragDirty) {
      pushHistory({ invalidateMap: false });
    }
    computeScene({ invalidateMap: false });
    if (shouldRecalculateMap) {
      recalculateNoiseMap(RES_HIGH);
      needsUpdate = true;
    }
  }
}

function wirePointer() {
  canvas.addEventListener('mousemove', handlePointerMove);
  canvas.addEventListener('mousedown', handlePointerDown);
  canvas.addEventListener('mouseleave', handlePointerLeave);
  window.addEventListener('mouseup', handlePointerUp);
}

function handleWheel(event: WheelEvent) {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const before = canvasToWorld(canvasPoint);
  const direction = event.deltaY < 0 ? 1.1 : 0.9;
  zoom = Math.min(4, Math.max(0.5, zoom * direction));
  updatePixelsPerMeter();
  const after = canvasToWorld(canvasPoint);
  panOffset = {
    x: panOffset.x + (before.x - after.x),
    y: panOffset.y + (before.y - after.y),
  };
  updateScaleBar();
  requestRender();
}

function wireWheel() {
  canvas.addEventListener('wheel', handleWheel, { passive: false });
}

function wireKeyboard() {
  window.addEventListener('keydown', (event) => {
    if (aboutOpen && event.key === 'Escape') {
      closeAbout();
      return;
    }

    const activeEl = document.activeElement as HTMLElement | null;
    const target = event.target as HTMLElement | null;
    const isEditableTarget = (el: HTMLElement | null) => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };
    if (isEditableTarget(target) || isEditableTarget(activeEl)) {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && (event.key === 'z' || event.key === 'Z')) {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }

    if (event.key === 'Escape') {
      setSelection({ type: 'none' });
      measureStart = null;
      measureEnd = null;
      measureLocked = false;
      barrierDraft = null;
      barrierDraftAnchored = false;
      barrierDragActive = false;
      requestRender();
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selection.type !== 'none') {
        deleteSelection(selection);
      }
    }

    if (event.key === 'v' || event.key === 'V') {
      setActiveTool('select');
    }
    if (event.key === 's' || event.key === 'S') {
      setActiveTool('add-source');
    }
    if (event.key === 'r' || event.key === 'R') {
      setActiveTool('add-receiver');
    }
    if (event.key === 'b' || event.key === 'B') {
      setActiveTool('add-barrier');
    }
    if (event.key === 'h' || event.key === 'H') {
      setActiveTool('add-building');
    }
    if (event.key === 'g' || event.key === 'G') {
      setActiveTool('add-panel');
    }
    if (event.key === 'm' || event.key === 'M') {
      setActiveTool('measure');
    }
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

function buildScenePayload() {
  return {
    version: 1,
    name: sceneNameInput?.value ?? 'Untitled',
    sources: scene.sources.map((source) => ({ ...source })),
    receivers: scene.receivers.map((receiver) => ({ ...receiver })),
    panels: scene.panels.map((panel) => ({
      ...panel,
      points: panel.points.map((point) => ({ ...point })),
      sampling: { ...panel.sampling },
    })),
    buildings: scene.buildings.map((building) => building.toData()),
    // UI save format extension (v1 payload still; this is not the core Scene schema yet):
    // - barriers are persisted so users can save/load screen geometry.
    // - older files without `barriers` remain loadable (see applyLoadedScene()).
    barriers: scene.barriers.map((barrier) => ({
      ...barrier,
      p1: { ...barrier.p1 },
      p2: { ...barrier.p2 },
      transmissionLoss: Number.isFinite(barrier.transmissionLoss ?? Infinity) ? barrier.transmissionLoss : undefined,
    })),
    propagation: getPropagationConfig(),
  };
}

function downloadScene() {
  const payload = buildScenePayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const name = payload.name?.trim() || 'geonoise-scene';
  link.href = url;
  link.download = `${name.replace(/\s+/g, '-').toLowerCase()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function nextSequence(prefix: string, ids: Array<{ id: string }>) {
  let max = 0;
  for (const item of ids) {
    if (!item.id.startsWith(prefix)) continue;
    const value = Number.parseInt(item.id.slice(prefix.length), 10);
    if (!Number.isNaN(value)) {
      max = Math.max(max, value);
    }
  }
  return Math.max(max + 1, ids.length + 1);
}

function applyLoadedScene(payload: ReturnType<typeof buildScenePayload>) {
  scene.sources = payload.sources.map((source) => ({ ...source }));
  scene.receivers = payload.receivers.map((receiver) => ({ ...receiver }));
  scene.panels = payload.panels.map((panel) => ({
    ...panel,
    points: panel.points.map((point) => ({ ...point })),
    sampling: { ...panel.sampling },
  }));
  scene.buildings = (payload.buildings ?? []).map((building) => new Building(building));
  // Backwards-compatible load: scenes saved before barriers existed simply omit this field.
  scene.barriers = (payload.barriers ?? []).map((barrier) => ({
    ...barrier,
    p1: { ...barrier.p1 },
    p2: { ...barrier.p2 },
  }));
  sourceSeq = nextSequence('s', scene.sources);
  receiverSeq = nextSequence('r', scene.receivers);
  panelSeq = nextSequence('p', scene.panels);
  buildingSeq = nextSequence('bd', scene.buildings);
  barrierSeq = nextSequence('b', scene.barriers);
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
  if (payload.propagation) {
    updatePropagationConfig(payload.propagation);
    updatePropagationControls();
  }
  if (sceneNameInput) {
    sceneNameInput.value = payload.name || 'Untitled';
  }
  updateCounts();
  setSelection({ type: 'none' });
  history = [];
  historyIndex = -1;
  invalidateNoiseMap();
  pushHistory({ markDirty: false });
  renderResults();
  computeScene();
  markSaved();
}

function wireSaveLoad() {
  saveButton?.addEventListener('click', () => {
    downloadScene();
    markSaved();
  });

  loadButton?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as ReturnType<typeof buildScenePayload>;
        if (!parsed || !Array.isArray(parsed.sources) || !Array.isArray(parsed.receivers) || !Array.isArray(parsed.panels)) {
          // eslint-disable-next-line no-console
          console.error('Invalid scene file');
          return;
        }
        applyLoadedScene(parsed);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load scene', error);
      }
    });
    input.click();
  });
}

function wireCanvasHelp() {
  if (!canvasHelp || !canvasHelpButton || !canvasHelpTooltip) return;
  const dismissed = localStorage.getItem(CANVAS_HELP_KEY) === '1';
  if (!dismissed) {
    canvasHelp.classList.add('is-open');
    canvasHelpButton.setAttribute('aria-expanded', 'true');
  }

  const closeHelp = () => {
    canvasHelp.classList.remove('is-open');
    canvasHelpButton.setAttribute('aria-expanded', 'false');
  };

  canvasHelpButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = canvasHelp.classList.toggle('is-open');
    canvasHelpButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
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

function setAboutTab(tabId: string) {
  if (!aboutTabs.length || !aboutPanels.length) return;
  aboutTabs.forEach((tab) => {
    const isActive = tab.dataset.aboutTab === tabId;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    tab.tabIndex = isActive ? 0 : -1;
  });
  aboutPanels.forEach((panel) => {
    const isActive = panel.dataset.aboutPanel === tabId;
    panel.classList.toggle('is-active', isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });
}

function openAbout() {
  if (!aboutModal) return;
  aboutOpen = true;
  setAboutTab('current');
  aboutModal.classList.add('is-open');
  aboutModal.setAttribute('aria-hidden', 'false');
  aboutClose?.focus();
}

function closeAbout() {
  if (!aboutModal) return;
  aboutOpen = false;
  aboutModal.classList.remove('is-open');
  aboutModal.setAttribute('aria-hidden', 'true');
}

function wireAbout() {
  if (!aboutModal) return;
  aboutButton?.addEventListener('click', () => openAbout());
  aboutClose?.addEventListener('click', () => closeAbout());
  if (aboutTabs.length && aboutPanels.length) {
    aboutTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.aboutTab ?? 'current';
        setAboutTab(tabId);
      });
    });
  }
  aboutModal.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-modal-close]')) {
      closeAbout();
    }
  });
}

function updatePropagationControls() {
  const current = getPropagationConfig();
  const groundEnabled = current.groundReflection;
  if (propagationSpreading) propagationSpreading.value = current.spreading;
  if (propagationAbsorption) propagationAbsorption.value = current.atmosphericAbsorption;
  if (propagationGroundReflection) propagationGroundReflection.checked = groundEnabled;
  if (propagationGroundModel) {
    propagationGroundModel.value = current.groundModel;
    propagationGroundModel.disabled = !groundEnabled;
  }
  if (propagationGroundType) {
    propagationGroundType.value = current.groundType;
    propagationGroundType.disabled = !groundEnabled;
  }
  if (propagationMaxDistance) propagationMaxDistance.value = current.maxDistance.toString();
  if (propagationGroundDetails) {
    propagationGroundDetails.classList.toggle('is-hidden', !groundEnabled);
  }
  if (propagationGroundHelp) {
    propagationGroundHelp.classList.toggle('is-hidden', !groundEnabled);
  }
  if (propagationGroundModelHelp) {
    if (!groundEnabled) {
      propagationGroundModelHelp.textContent = '';
    } else if (current.groundModel === 'legacy') {
      propagationGroundModelHelp.textContent = 'Best for quick A-weighted maps; does not model interference ripples.';
    } else {
      propagationGroundModelHelp.textContent = 'Models interference between direct + reflected sound; results vary by frequency and geometry.';
    }
  }
}

function wirePropagationControls() {
  if (!propagationSpreading && !propagationAbsorption && !propagationGroundReflection && !propagationGroundType && !propagationMaxDistance) {
    return;
  }

  updatePropagationControls();

  propagationSpreading?.addEventListener('change', () => {
    updatePropagationConfig({ spreading: propagationSpreading.value as PropagationConfig['spreading'] });
    markDirty();
    computeScene();
  });

  propagationAbsorption?.addEventListener('change', () => {
    updatePropagationConfig({ atmosphericAbsorption: propagationAbsorption.value as PropagationConfig['atmosphericAbsorption'] });
    markDirty();
    computeScene();
  });

  propagationGroundReflection?.addEventListener('change', () => {
    updatePropagationConfig({ groundReflection: propagationGroundReflection.checked });
    updatePropagationControls();
    markDirty();
    computeScene();
  });

  propagationGroundModel?.addEventListener('change', () => {
    updatePropagationConfig({ groundModel: propagationGroundModel.value as PropagationConfig['groundModel'] });
    updatePropagationControls();
    markDirty();
    computeScene();
  });

  propagationGroundType?.addEventListener('change', () => {
    updatePropagationConfig({ groundType: propagationGroundType.value as PropagationConfig['groundType'] });
    markDirty();
    computeScene();
  });

  propagationMaxDistance?.addEventListener('change', () => {
    const next = Number(propagationMaxDistance.value);
    if (!Number.isFinite(next) || next <= 0) {
      updatePropagationControls();
      return;
    }
    updatePropagationConfig({ maxDistance: Math.max(1, Math.round(next)) });
    updatePropagationControls();
    markDirty();
    computeScene();
  });
}

function init() {
  updateCounts();
  wireThemeSwitcher();
  wireLayerToggle(layerSources, 'sources');
  wireLayerToggle(layerReceivers, 'receivers');
  wireLayerToggle(layerPanels, 'panels');
  wireLayerToggle(layerNoiseMap, 'noiseMap');
  wireLayerToggle(layerGrid, 'grid');
  wirePreference();
  wireTools();
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
  wireRefineButton();
  wireLayersPopover();
  wireSettingsPopover();
  wireSceneName();
  wireContextPanel();
  wireSaveLoad();
  wireCanvasHelp();
  wireActionOverflow();

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
  window.addEventListener('resize', resizeCanvas);
}

init();
