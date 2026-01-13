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
  type ProbeRequest,
  type ProbeResult,
} from '@geonoise/engine';

// KaTeX auto-render function (loaded from CDN)
declare function renderMathInElement(
  element: HTMLElement,
  options?: {
    delimiters?: Array<{ left: string; right: string; display: boolean }>;
    throwOnError?: boolean;
  }
): void;

import {
  panelId,
  MIN_LEVEL,
  createFlatSpectrum,
  calculateOverallLevel,
  applyWeightingToSpectrum,
  OCTAVE_BANDS,
  type Spectrum9,
  type FrequencyWeighting,
} from '@geonoise/shared';
import { buildCsv } from './export.js';
import type { SceneResults, PanelResult } from './export.js';
import { formatLevel, formatMeters } from './format.js';

// ============================================================================
// Feature Flags
// ============================================================================

/**
 * Enable ray visualization in probe inspector.
 * Set to false to hide the feature from production until the bug is fixed
 * where only one first-order wall reflection is shown instead of all.
 *
 * See: docs/ROADMAP.md - "Ray Visualization Only Shows One First-Order Wall Reflection"
 */
const ENABLE_RAY_VISUALIZATION = false;

type Point = { x: number; y: number };

/** Labels for octave band display */
const OCTAVE_BAND_LABELS = ['63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'] as const;

/** Display mode: which frequency band or overall to show */
/** Display mode: which frequency band to show (overall or specific octave band index 0-8) */
type DisplayBand = 'overall' | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Sound source with full spectral definition
 *
 * Spectral Source Migration (Jan 2026):
 * - Added `spectrum` for 9-band octave levels
 * - Added `gain` for master level offset
 * - `power` is now computed from spectrum (kept for backward compatibility)
 */
type Source = {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  /** Overall power level (computed from spectrum) - kept for legacy compatibility */
  power: number;
  /** 9-band spectrum: [63, 125, 250, 500, 1k, 2k, 4k, 8k, 16k] Hz in dB Lw */
  spectrum: Spectrum9;
  /** Gain offset applied on top of spectrum (dB) */
  gain: number;
  enabled: boolean;
};

type Receiver = {
  id: string;
  name?: string;
  x: number;
  y: number;
  z: number;
};

type Panel = {
  id: string;
  name?: string;
  points: Point[];
  elevation: number;
  sampling: { resolution: number; pointCap: number };
};

type Probe = {
  id: string;
  name?: string;
  x: number;
  y: number;
  z: number;
};

type Barrier = {
  // UI barrier primitive (matches the feature ticket's intent):
  // - p1/p2 are endpoints in the 2D editor plane (x,y) in local meters (ENU).
  // - height is the vertical screen height (meters). In physics, this becomes the Z of the barrier top edge.
  // - transmissionLoss is reserved for future "through-wall" modeling (currently unused by the engine).
  //
  // Important: The UI is 2D, but the engine computes 3D acoustics:
  //   - source z = hs
  //   - receiver z = hr
  //   - barrier height = hb
  // The CPU engine checks 2D intersection (SR crosses barrier segment) and then uses hb/hs/hr to compute
  // the 3D "over the top" path difference delta that drives the barrier insertion loss term.
  id: string;
  name?: string;
  p1: Point;
  p2: Point;
  height: number;
  transmissionLoss?: number;
};

// Barrier manipulation constants
const BARRIER_HANDLE_RADIUS = 5;
const BARRIER_HANDLE_HIT_RADIUS = 12;
const BARRIER_ROTATION_HANDLE_OFFSET_PX = 20;
const BARRIER_ROTATION_HANDLE_RADIUS = 5;
const BARRIER_MIN_LENGTH = 1;

// Helper functions for barrier geometry
function getBarrierMidpoint(barrier: Barrier): Point {
  return {
    x: (barrier.p1.x + barrier.p2.x) / 2,
    y: (barrier.p1.y + barrier.p2.y) / 2,
  };
}

function getBarrierLength(barrier: Barrier): number {
  const dx = barrier.p2.x - barrier.p1.x;
  const dy = barrier.p2.y - barrier.p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getBarrierRotation(barrier: Barrier): number {
  return Math.atan2(barrier.p2.y - barrier.p1.y, barrier.p2.x - barrier.p1.x);
}

function getBarrierRotationHandlePosition(barrier: Barrier, handleOffset: number): Point {
  const mid = getBarrierMidpoint(barrier);
  const rotation = getBarrierRotation(barrier);
  // Handle is perpendicular to the barrier, offset from midpoint
  const perpAngle = rotation + Math.PI / 2;
  return {
    x: mid.x + Math.cos(perpAngle) * handleOffset,
    y: mid.y + Math.sin(perpAngle) * handleOffset,
  };
}

function setBarrierFromMidpointAndRotation(
  barrier: Barrier,
  midpoint: Point,
  rotation: number,
  length: number
): void {
  const halfLength = length / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  barrier.p1 = {
    x: midpoint.x - cos * halfLength,
    y: midpoint.y - sin * halfLength,
  };
  barrier.p2 = {
    x: midpoint.x + cos * halfLength,
    y: midpoint.y + sin * halfLength,
  };
}

type BuildingData = {
  id: string;
  name?: string;
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
  name?: string;
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
    this.name = data.name;
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
      name: this.name,
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

type Tool =
  | 'select'
  | 'add-source'
  | 'add-receiver'
  | 'add-probe'
  | 'add-panel'
  | 'add-barrier'
  | 'add-building'
  | 'measure'
  | 'delete';

type SelectableElementType = 'source' | 'receiver' | 'probe' | 'panel' | 'barrier' | 'building';

interface SelectionItem {
  elementType: SelectableElementType;
  id: string;
}

type Selection =
  | { type: 'none' }
  | { type: 'source'; id: string }
  | { type: 'probe'; id: string }
  | { type: 'receiver'; id: string }
  | { type: 'panel'; id: string }
  | { type: 'barrier'; id: string }
  | { type: 'building'; id: string }
  | { type: 'multi'; items: SelectionItem[] };

type DragState =
  | null
  | {
      type: 'source' | 'receiver' | 'probe' | 'panel' | 'barrier' | 'building';
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
    }
  | {
      type: 'barrier-endpoint';
      id: string;
      endpoint: 'p1' | 'p2';
    }
  | {
      type: 'barrier-rotate';
      id: string;
      startAngle: number;
      startRotation: number;
      startLength: number;
      startMidpoint: Point;
    }
  | {
      type: 'select-box';
      startCanvasPoint: Point;
      currentCanvasPoint: Point;
    }
  | {
      type: 'move-multi';
      offsets: Map<string, Point>;
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
  probeFill: string;
  probeStroke: string;
  probeLabel: string;
  probeRing: string;
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

const DEFAULT_MAP_RANGE: MapRange = { min: 30, max: 85 };
const DEFAULT_MAP_BAND_STEP = 3; // Finer default for overall level display
const DEFAULT_MAP_BAND_STEP_PERBAND = 10; // Coarser for per-frequency band display
const MAX_MAP_LEGEND_LABELS = 7;

// =============================================================================
// NOISE MAP RESOLUTION STRATEGY
// =============================================================================
// The noise map uses adaptive resolution based on interaction state:
//
// | Scenario           | Point Cap | Pixel Step | Purpose                      |
// |--------------------|-----------|------------|------------------------------|
// | Initial load       | 75,000    | RES_HIGH=2 | Good first impression        |
// | During drag        | 35,000    | RES_LOW=8  | Smooth interaction (coarse)  |
// | Static after drag  | 50,000    | RES_HIGH=2 | Good quality                 |
// | Refine button      | 75,000    | RES_HIGH=2 | Maximum detail               |
//
// Lower pixel step = finer grid (more points, slower)
// Higher pixel step = coarser grid (fewer points, faster)
// =============================================================================
const RES_HIGH = 2;   // Fine quality: 2px per grid cell
const RES_LOW = 8;    // Coarse preview: 8px per grid cell (fast drag updates)
const REFINE_POINTS = 75000;  // Maximum detail for refine button and initial load
const STATIC_POINTS = 50000;  // Good quality for static after drag
const DRAG_POINTS = 35000;    // Coarse preview during drag (smooth interaction)
// Cap drag updates to ~33 FPS.
const DRAG_FRAME_MS = 30;
// Cap probe updates to ~10 FPS while dragging.
const PROBE_UPDATE_MS = 100;
const PROBE_DEFAULT_Z = 1.7;

let pixelsPerMeter = 3;
let activeTool: Tool = 'select';
let selection: Selection = { type: 'none' };
let activeProbeId: string | null = null;
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
let pinnedContextSeq = 1;
/** Global z-index counter for inspector panels - ensures new panels appear above existing ones.
 *  Capped well below dock z-index (99999) to ensure dock is always on top. */
let inspectorZIndex = 100;
const INSPECTOR_MAX_ZINDEX = 9000; // Dock is at 99999, keep panels well below
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
const results: SceneResults = { receivers: [], panels: [] };
const probeResults = new Map<string, ProbeResult['data']>();
let probeWorker: Worker | null = null;
const probePending = new Set<string>();
type ProbeSnapshot = {
  id: string;
  data: ProbeResult['data'];
  panel: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};
type PinnedProbePanel = {
  id: string;
  panel: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  status: HTMLSpanElement;
};
const probeSnapshots: ProbeSnapshot[] = [];
// Live monitors that persist beyond selection (updated alongside the active probe).
const pinnedProbePanels = new Map<string, PinnedProbePanel>();
let probeSnapshotSeq = 1;
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

const CANVAS_HELP_KEY = 'geonoise.canvasHelpDismissed';

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

/** Calculate speed of sound from temperature (simplified formula: c = 331.3 + 0.606 * T) */
function calculateSpeedOfSound(temperatureC: number): number {
  return 331.3 + 0.606 * temperatureC;
}

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

function sameSelection(a: Selection | null, b: Selection | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'none' || b.type === 'none') return a.type === b.type;
  if (a.type === 'multi' || b.type === 'multi') {
    if (a.type !== 'multi' || b.type !== 'multi') return false;
    if (a.items.length !== b.items.length) return false;
    return a.items.every((item, i) =>
      item.elementType === b.items[i].elementType && item.id === b.items[i].id
    );
  }
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
  for (const id of probeResults.keys()) {
    if (!probeIds.has(id)) probeResults.delete(id);
  }
  for (const id of probePending) {
    if (!probeIds.has(id)) probePending.delete(id);
  }
  prunePinnedProbes();
  buildingSeq = snap.buildingSeq;
  barrierSeq = snap.barrierSeq;
  selection = snap.selection;
  activeProbeId = snap.activeProbeId;
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

function selectionTypeLabel(type: Selection['type']) {
  if (type === 'panel') return 'Measure grid';
  if (type === 'source') return 'Source';
  if (type === 'probe') return 'Probe';
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
    case 'add-probe':
      return 'Add Probe';
    case 'measure':
      return 'Measure';
    case 'delete':
      return 'Delete';
    default:
      return 'Select';
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

function mergeBounds(a: { minX: number; minY: number; maxX: number; maxY: number }, b: { minX: number; minY: number; maxX: number; maxY: number }) {
  // Union of two AABBs.
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
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
      unit: `dB @ ${OCTAVE_BAND_LABELS[displayBand]}`,
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

function setActiveProbe(nextId: string | null) {
  const resolved = nextId && scene.probes.some((probe) => probe.id === nextId) ? nextId : null;
  const didChange = resolved !== activeProbeId;
  activeProbeId = resolved;
  renderProbeInspector();
  if (activeProbeId && didChange) {
    requestProbeUpdate(activeProbeId, { immediate: true });
  }
  requestRender();
}

function getActiveProbe() {
  if (!activeProbeId) return null;
  return scene.probes.find((probe) => probe.id === activeProbeId) ?? null;
}

function initProbeWorker() {
  if (probeWorker) return;
  try {
    probeWorker = new Worker(new URL('./probeWorker.js', import.meta.url), { type: 'module' });
    probeWorker.addEventListener('message', (event: MessageEvent<ProbeResult>) => {
      handleProbeResult(event.data);
    });
    probeWorker.addEventListener('error', () => {
      // Worker error - will fall back to stub calculation
    });
  } catch {
    probeWorker = null;
  }
}

function buildProbeRequest(probe: Probe): ProbeRequest {
  const sources = scene.sources
    .filter((source) => isSourceEnabled(source))
    .map((source) => ({
      id: source.id,
      position: { x: source.x, y: source.y, z: source.z },
      spectrum: source.spectrum,
      gain: source.gain,
    }));
  const walls = [
    ...scene.barriers.map((barrier) => ({
      id: barrier.id,
      type: 'barrier' as const,
      vertices: [{ ...barrier.p1 }, { ...barrier.p2 }],
      height: barrier.height,
    })),
    ...scene.buildings.map((building) => ({
      id: building.id,
      type: 'building' as const,
      vertices: building.getVertices().map((point) => ({ ...point })),
      height: building.z_height,
    })),
  ];

  return {
    type: 'CALCULATE_PROBE',
    probeId: probe.id,
    position: { x: probe.x, y: probe.y, z: probe.z ?? PROBE_DEFAULT_Z },
    sources,
    walls,
    config: {
      barrierSideDiffraction: getPropagationConfig().barrierSideDiffraction ?? 'auto',
      groundType: getPropagationConfig().groundType ?? 'mixed',
      groundMixedFactor: getPropagationConfig().groundMixedFactor ?? 0.5,
      atmosphericAbsorption: getPropagationConfig().atmosphericAbsorption ?? 'simple',
      ...getMeteoConfig(),
    },
    includePathGeometry: ENABLE_RAY_VISUALIZATION && (rayVizToggle?.checked ?? false),
  };
}

function calculateProbeStub(req: ProbeRequest): ProbeResult {
  const freqs = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
  let minDist = Number.POSITIVE_INFINITY;
  for (const source of req.sources) {
    const dx = req.position.x - source.position.x;
    const dy = req.position.y - source.position.y;
    const dz = (req.position.z ?? 0) - (source.position.z ?? 0);
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < minDist) minDist = dist;
  }
  const hasSources = req.sources.length > 0;
  const dist = hasSources ? Math.max(minDist, 1) : 100;
  const base = hasSources ? 100 - 20 * Math.log10(dist) : 35;

  const magnitudes = freqs.map((freq) => {
    const tilt = -2.5 * Math.log2(freq / 1000);
    const jitter = (Math.random() - 0.5) * 2;
    return base + tilt + jitter;
  });

  return {
    type: 'PROBE_UPDATE',
    probeId: req.probeId,
    data: {
      frequencies: freqs,
      magnitudes,
    },
  };
}

function sendProbeRequest(probe: Probe) {
  const request = buildProbeRequest(probe);
  probePending.add(probe.id);
  renderProbeInspector();
  renderPinnedProbePanel(probe.id);
  if (!probeWorker) {
    window.setTimeout(() => {
      handleProbeResult(calculateProbeStub(request));
    }, 0);
    return;
  }
  probeWorker.postMessage(request);
}

function getProbeById(probeId: string) {
  return scene.probes.find((item) => item.id === probeId) ?? null;
}

const throttledProbeUpdate = throttle((probeIds: string[]) => {
  for (const probeId of probeIds) {
    const probe = getProbeById(probeId);
    if (!probe) continue;
    sendProbeRequest(probe);
  }
}, PROBE_UPDATE_MS);

function requestProbeUpdates(probeIds: string[], options?: { immediate?: boolean }) {
  const uniqueIds = Array.from(new Set(probeIds)).filter((id) => id);
  if (!uniqueIds.length) return;
  if (!probeWorker) initProbeWorker();
  if (options?.immediate) {
    for (const probeId of uniqueIds) {
      const probe = getProbeById(probeId);
      if (probe) {
        sendProbeRequest(probe);
      }
    }
    return;
  }
  throttledProbeUpdate(uniqueIds);
}

function requestProbeUpdate(probeId: string, options?: { immediate?: boolean }) {
  if (!probeId) return;
  requestProbeUpdates([probeId], options);
}

function getLiveProbeIds() {
  const ids = new Set<string>();
  if (activeProbeId) {
    ids.add(activeProbeId);
  }
  for (const id of pinnedProbePanels.keys()) {
    ids.add(id);
  }
  return Array.from(ids);
}

function requestLiveProbeUpdates(options?: { immediate?: boolean }) {
  // Keep pinned monitors and the active inspector in sync with the engine.
  const liveIds = getLiveProbeIds();
  // Force immediate updates to ensure probe responds to scene changes
  requestProbeUpdates(liveIds, { immediate: true, ...options });
}

function handleProbeResult(result: ProbeResult) {
  if (!result || result.type !== 'PROBE_UPDATE') return;
  probeResults.set(result.probeId, result.data);
  probePending.delete(result.probeId);
  if (activeProbeId === result.probeId) {
    renderProbeInspector();
  }
  renderPinnedProbePanel(result.probeId);
}

function resizeProbeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function renderProbeChartOn(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, data: ProbeResult['data'] | null) {
  resizeProbeCanvas(canvas, ctx);
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (!width || !height) return;

  const ctxChart = ctx;
  const padding = { left: 36, right: 60, top: 12, bottom: 24 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  ctxChart.clearRect(0, 0, width, height);
  ctxChart.fillStyle = readCssVar('--probe-bg');
  ctxChart.fillRect(0, 0, width, height);

  if (!data || data.frequencies.length === 0) {
    ctxChart.fillStyle = readCssVar('--probe-text');
    ctxChart.font = '11px "Work Sans", sans-serif';
    ctxChart.fillText('Drag the probe to sample.', padding.left, padding.top + 12);
    return;
  }

  // Apply frequency weighting based on displayWeighting setting
  const weightedMagnitudes = applyWeightingToSpectrum(data.magnitudes as Spectrum9, displayWeighting);
  const overallLevel = calculateOverallLevel(data.magnitudes as Spectrum9, displayWeighting);
  const weightingUnit = displayWeighting === 'Z' ? 'dB' : `dB(${displayWeighting})`;

  // Check if there's essentially no energy (all bands below threshold)
  // This avoids showing A-weighting-shaped noise floor when there's no signal.
  // Use MIN_LEVEL as the threshold since that's what the engine returns for silence.
  const NOISE_FLOOR_THRESHOLD = -99; // dB - only filter out MIN_LEVEL (-100)
  const hasSignal = weightedMagnitudes.some(m => m > NOISE_FLOOR_THRESHOLD);

  if (!hasSignal) {
    ctxChart.fillStyle = readCssVar('--probe-text');
    ctxChart.font = '11px "Work Sans", sans-serif';
    ctxChart.fillText('No significant signal at probe location.', padding.left, padding.top + 12);
    return;
  }

  const minFreq = Math.min(...data.frequencies);
  const maxFreq = Math.max(...data.frequencies);
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  const minMag = Math.min(...weightedMagnitudes);
  const maxMag = Math.max(...weightedMagnitudes);
  const magMin = Math.floor((minMag - 2) / 5) * 5;
  const magMax = Math.ceil((maxMag + 2) / 5) * 5;

  ctxChart.strokeStyle = readCssVar('--probe-grid');
  ctxChart.lineWidth = 1;
  ctxChart.setLineDash([4, 4]);
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (chartHeight * i) / 4;
    ctxChart.beginPath();
    ctxChart.moveTo(padding.left, y);
    ctxChart.lineTo(width - padding.right, y);
    ctxChart.stroke();
  }
  ctxChart.setLineDash([]);

  const points = data.frequencies.map((freq, idx) => {
    const x = padding.left + ((Math.log10(freq) - logMin) / (logMax - logMin)) * chartWidth;
    const value = weightedMagnitudes[idx];
    const ratio = (value - magMin) / (magMax - magMin || 1);
    const y = padding.top + (1 - ratio) * chartHeight;
    return { x, y, value, freq };
  });

  ctxChart.beginPath();
  points.forEach((pt, index) => {
    if (index === 0) {
      ctxChart.moveTo(pt.x, pt.y);
    } else {
      ctxChart.lineTo(pt.x, pt.y);
    }
  });
  ctxChart.strokeStyle = readCssVar('--probe-line');
  ctxChart.lineWidth = 2;
  ctxChart.stroke();

  ctxChart.fillStyle = readCssVar('--probe-fill');
  ctxChart.lineTo(points[points.length - 1].x, height - padding.bottom);
  ctxChart.lineTo(points[0].x, height - padding.bottom);
  ctxChart.closePath();
  ctxChart.fill();

  ctxChart.fillStyle = readCssVar('--probe-line');
  for (const point of points) {
    ctxChart.beginPath();
    ctxChart.arc(point.x, point.y, 3, 0, Math.PI * 2);
    ctxChart.fill();
  }

  ctxChart.fillStyle = readCssVar('--probe-text');
  ctxChart.font = '10px "Work Sans", sans-serif';
  ctxChart.fillText(`${magMax} dB`, 6, padding.top + 4);
  ctxChart.fillText(`${magMin} dB`, 6, height - padding.bottom + 4);

  // Display overall weighted level on the right side
  ctxChart.font = 'bold 12px "Work Sans", sans-serif';
  ctxChart.textAlign = 'right';
  ctxChart.fillText(`${formatLevel(overallLevel)}`, width - 4, padding.top + 12);
  ctxChart.font = '9px "Work Sans", sans-serif';
  ctxChart.fillText(weightingUnit, width - 4, padding.top + 24);
  ctxChart.textAlign = 'left';

  const labelIndices = [0, Math.floor(points.length / 2), points.length - 1];
  for (const idx of labelIndices) {
    const point = points[idx];
    const label = `${Math.round(point.freq)} Hz`;
    ctxChart.fillText(label, point.x - 10, height - 6);
  }
}

function resizeProbeChart() {
  if (!probeChart || !probeChartCtx) return;
  resizeProbeCanvas(probeChart, probeChartCtx);
}

function renderProbeChart(data: ProbeResult['data'] | null) {
  if (!probeChart || !probeChartCtx) return;
  renderProbeChartOn(probeChart, probeChartCtx, data);
}

function renderProbeSnapshots() {
  if (!probeSnapshots.length) return;
  for (const snapshot of probeSnapshots) {
    renderProbeChartOn(snapshot.canvas, snapshot.ctx, snapshot.data);
  }
}

function getProbeStatusLabel(probeId: string) {
  if (probePending.has(probeId)) return 'Updating';
  if (probeResults.has(probeId)) return 'Live';
  return 'Idle';
}

function renderPinnedProbePanel(probeId: string) {
  const pinned = pinnedProbePanels.get(probeId);
  if (!pinned) return;
  pinned.status.textContent = getProbeStatusLabel(probeId);
  renderProbeChartOn(pinned.canvas, pinned.ctx, probeResults.get(probeId) ?? null);
}

function renderPinnedProbePanels() {
  for (const id of pinnedProbePanels.keys()) {
    renderPinnedProbePanel(id);
  }
}

function renderProbeInspector() {
  if (!probePanel) return;
  const probe = getActiveProbe();
  const isPinned = probe ? pinnedProbePanels.has(probe.id) : false;
  // Hide the inspector if its probe is now showing as a pinned monitor.
  const isOpen = !!probe && !isPinned;
  probePanel.classList.toggle('is-open', isOpen);
  probePanel.classList.toggle('probe-panel--active', isOpen);
  probePanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  // Bring probe panel to front when opening so it appears above pinned panels
  if (isOpen) {
    bringPanelToFront(probePanel);
  }
  if (probePin) {
    const pinActive = !!probe && pinnedProbePanels.has(probe.id);
    probePin.disabled = !probe;
    probePin.classList.toggle('is-active', pinActive);
    probePin.setAttribute('aria-pressed', pinActive ? 'true' : 'false');
    probePin.title = probe ? (pinActive ? 'Unpin monitoring window' : 'Pin monitoring window') : 'Pin monitoring window';
  }
  if (!probe || isPinned) {
    if (probeFreeze) {
      probeFreeze.disabled = true;
      probeFreeze.title = 'Freeze probe snapshot';
    }
    return;
  }
  if (probeTitle) {
    const defaultName = `Probe ${probe.id.toUpperCase()}`;
    probeTitle.textContent = probe.name || defaultName;
  }
  if (probeStatus) {
    probeStatus.textContent = getProbeStatusLabel(probe.id);
  }
  if (probeFreeze) {
    const hasData = probeResults.has(probe.id);
    probeFreeze.disabled = !hasData;
    probeFreeze.title = hasData ? 'Freeze probe snapshot' : 'Probe data not ready yet';
  }
  renderProbeChart(probeResults.get(probe.id) ?? null);
  renderRayVisualization(probeResults.get(probe.id) ?? null);
}

// ============================================================================
// Ray Visualization
// ============================================================================

/** Current traced paths for canvas rendering */
let currentTracedPaths: import('@geonoise/engine').TracedPath[] | null = null;

/** Render the ray visualization panel content */
function renderRayVisualization(data: ProbeResult['data'] | null) {
  if (!rayVizPaths || !rayVizPhaseInfo || !rayVizDominant) return;

  // Update card active state based on toggle
  if (rayVizCard) {
    rayVizCard.classList.toggle('is-active', rayVizToggle?.checked ?? false);
  }

  if (!data || !rayVizToggle?.checked) {
    rayVizPaths.innerHTML = '';
    rayVizPhaseInfo.innerHTML = '';
    rayVizDominant.innerHTML = '';
    currentTracedPaths = null;
    requestRender();
    return;
  }

  const paths = data.tracedPaths ?? [];
  const phaseRels = data.phaseRelationships ?? [];

  // Store for canvas rendering
  currentTracedPaths = paths.length > 0 ? paths : null;

  if (paths.length === 0) {
    rayVizPaths.innerHTML = '<div class="ray-viz-empty">No traced paths available</div>';
    rayVizPhaseInfo.innerHTML = '';
    rayVizDominant.innerHTML = '';
    requestRender();
    return;
  }

  // Find max level for normalization
  const maxLevel = Math.max(...paths.map(p => p.level_dB));
  const minLevel = maxLevel - 40; // 40 dB range

  // Path type icons and labels
  const pathIcons: Record<string, string> = {
    direct: '━━━',
    ground: '┅┅┅',
    wall: '•••',
    diffraction: '━•━',
  };

  const pathLabels: Record<string, string> = {
    direct: 'Direct',
    ground: 'Ground Bounce',
    wall: 'Wall Reflection',
    diffraction: 'Diffraction',
  };

  // Render path rows
  rayVizPaths.innerHTML = paths.map(path => {
    const barPercent = Math.max(0, Math.min(100, ((path.level_dB - minLevel) / 40) * 100));
    return `
      <div class="ray-viz-path-row">
        <span class="ray-viz-path-icon">${pathIcons[path.type] ?? '---'}</span>
        <span class="ray-viz-path-type">${pathLabels[path.type] ?? path.type}</span>
        <span class="ray-viz-path-level">${path.level_dB.toFixed(1)} dB</span>
        <div class="ray-viz-path-bar">
          <div class="ray-viz-path-bar-fill" style="width: ${barPercent}%"></div>
        </div>
      </div>
    `;
  }).join('');

  // Render phase relationships
  if (phaseRels.length > 0) {
    rayVizPhaseInfo.innerHTML = phaseRels.slice(0, 4).map(rel => {
      const indicator = rel.isConstructive ? '🔵' : '🔴';
      const indicatorClass = rel.isConstructive ? 'constructive' : 'destructive';
      const label = rel.isConstructive ? 'Constructive' : 'Destructive';
      return `
        <div class="ray-viz-phase-row">
          <span class="ray-viz-phase-indicator ${indicatorClass}">${indicator}</span>
          <span class="ray-viz-phase-text">${label}: ${pathLabels[rel.path1Type] ?? rel.path1Type} + ${pathLabels[rel.path2Type] ?? rel.path2Type}</span>
          <span class="ray-viz-phase-delta">(Δφ=${rel.phaseDelta_deg.toFixed(0)}°)</span>
        </div>
      `;
    }).join('');
  } else {
    rayVizPhaseInfo.innerHTML = '';
  }

  // Render dominant path
  if (paths.length > 0) {
    const dominant = paths.reduce((a, b) => a.level_dB > b.level_dB ? a : b);
    rayVizDominant.innerHTML = `Dominant: ${pathLabels[dominant.type] ?? dominant.type} (${dominant.level_dB.toFixed(1)} dB)`;
  } else {
    rayVizDominant.innerHTML = '';
  }

  requestRender();
}

/** Disable ray visualization toggle (called on scene changes) */
function disableRayVisualization() {
  if (rayVizToggle && rayVizToggle.checked) {
    rayVizToggle.checked = false;
    if (rayVizCard) {
      rayVizCard.classList.remove('is-active');
    }
    currentTracedPaths = null;
    if (rayVizPaths) rayVizPaths.innerHTML = '';
    if (rayVizPhaseInfo) rayVizPhaseInfo.innerHTML = '';
    if (rayVizDominant) rayVizDominant.innerHTML = '';
    requestRender();
  }
}

/** Draw traced rays on the map canvas */
function drawTracedRays() {
  if (!currentTracedPaths || currentTracedPaths.length === 0) return;

  // Find max level for opacity calculation
  const maxLevel = Math.max(...currentTracedPaths.map(p => p.level_dB));

  for (const path of currentTracedPaths) {
    if (path.points.length < 2) continue;

    // Calculate opacity based on relative level (brighter = louder)
    const relativeLevel = path.level_dB - maxLevel;
    const opacity = Math.max(0.3, 1 + relativeLevel / 40);

    // Set line style based on path type
    ctx.save();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (path.type) {
      case 'direct':
        ctx.strokeStyle = `rgba(45, 140, 255, ${opacity})`;
        ctx.setLineDash([]);
        break;
      case 'ground':
        ctx.strokeStyle = `rgba(76, 175, 80, ${opacity})`;
        ctx.setLineDash([6, 4]);
        break;
      case 'wall':
        ctx.strokeStyle = `rgba(255, 152, 0, ${opacity})`;
        ctx.setLineDash([2, 3]);
        break;
      case 'diffraction':
        ctx.strokeStyle = `rgba(156, 39, 176, ${opacity})`;
        ctx.setLineDash([8, 3, 2, 3]);
        break;
      default:
        ctx.strokeStyle = `rgba(100, 100, 100, ${opacity})`;
        ctx.setLineDash([]);
    }

    // Draw the path
    ctx.beginPath();
    const firstPoint = worldToCanvas(path.points[0]);
    ctx.moveTo(firstPoint.x, firstPoint.y);

    for (let i = 1; i < path.points.length; i++) {
      const point = worldToCanvas(path.points[i]);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();

    // Draw reflection/diffraction point marker if present
    const markerPoint = path.reflectionPoint ?? path.diffractionEdge;
    if (markerPoint) {
      const mp = worldToCanvas(markerPoint);
      ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function cloneProbeData(data: ProbeResult['data']): ProbeResult['data'] {
  return {
    frequencies: [...data.frequencies],
    magnitudes: [...data.magnitudes],
    interferenceDetails: data.interferenceDetails ? { ...data.interferenceDetails } : undefined,
    };
}

/** Get the minimum top position for inspector panels (below the topbar) */
function getInspectorMinTop(parent: HTMLElement, padding: number): number {
  const topbar = document.querySelector('.topbar') as HTMLElement | null;
  if (topbar) {
    const topbarRect = topbar.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    // Return position below topbar with padding, relative to parent
    return topbarRect.bottom - parentRect.top + padding;
  }
  return padding;
}

function clampPanelToParent(panel: HTMLElement, parent: HTMLElement, left: number, top: number, padding: number, minTop?: number) {
  const maxLeft = parent.clientWidth - panel.offsetWidth - padding;
  const maxTop = parent.clientHeight - panel.offsetHeight - padding;
  // Use provided minTop (e.g., below topbar) or fall back to padding
  const effectiveMinTop = minTop ?? padding;
  const clampedLeft = Math.min(Math.max(left, padding), Math.max(padding, maxLeft));
  const clampedTop = Math.min(Math.max(top, effectiveMinTop), Math.max(effectiveMinTop, maxTop));
  panel.style.left = `${clampedLeft}px`;
  panel.style.top = `${clampedTop}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
}

/** Bring an inspector panel to the front by incrementing the global z-index counter.
 *  Z-index is capped at INSPECTOR_MAX_ZINDEX to ensure dock always stays on top. */
function bringPanelToFront(panel: HTMLElement) {
  inspectorZIndex++;
  // Cap at max to keep dock always on top
  if (inspectorZIndex > INSPECTOR_MAX_ZINDEX) {
    inspectorZIndex = INSPECTOR_MAX_ZINDEX;
  }
  panel.style.zIndex = String(inspectorZIndex);
}

function makePanelDraggable(
  panel: HTMLElement,
  handle: HTMLElement,
  options: { parent?: HTMLElement | null; padding?: number; ignoreSelector?: string } = {}
) {
  const parent = options.parent ?? panel.parentElement ?? document.body;
  const padding = options.padding ?? 12;
  const ignoreSelector = options.ignoreSelector ?? 'button';
  const originalUserSelect = document.body.style.userSelect;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const handleMouseMove = (event: MouseEvent) => {
    if (!isDragging) return;
    const parentRect = parent.getBoundingClientRect();
    const nextLeft = event.clientX - parentRect.left - dragOffsetX;
    const nextTop = event.clientY - parentRect.top - dragOffsetY;
    clampPanelToParent(panel, parent, nextLeft, nextTop, padding, getInspectorMinTop(parent, padding));
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = originalUserSelect;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };

  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest(ignoreSelector)) return;
    const panelRect = panel.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    dragOffsetX = event.clientX - panelRect.left;
    dragOffsetY = event.clientY - panelRect.top;
    panel.style.position = 'absolute';
    panel.style.left = `${panelRect.left - parentRect.left}px`;
    panel.style.top = `${panelRect.top - parentRect.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    isDragging = true;
    document.body.style.userSelect = 'none';
    // Bring panel to front when starting to drag
    bringPanelToFront(panel);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  });
}

function removePinnedProbe(probeId: string) {
  const pinned = pinnedProbePanels.get(probeId);
  if (!pinned) return false;
  pinnedProbePanels.delete(probeId);
  pinned.panel.remove();
  return true;
}

function clearPinnedProbes() {
  for (const id of Array.from(pinnedProbePanels.keys())) {
    removePinnedProbe(id);
  }
}

function prunePinnedProbes() {
  const probeIds = new Set(scene.probes.map((probe) => probe.id));
  for (const id of Array.from(pinnedProbePanels.keys())) {
    if (!probeIds.has(id)) {
      removePinnedProbe(id);
    }
  }
}

function createPinnedProbePanel(probeId: string) {
  if (!uiLayer) return;
  // Pinned panels are live monitors that stay on-screen until explicitly closed.
  const panel = document.createElement('aside');
  panel.className = 'probe-panel probe-panel--pinned is-open';
  panel.setAttribute('aria-hidden', 'false');
  panel.dataset.probeId = probeId;

  // Get the probe to check for custom name
  const probe = scene.probes.find(p => p.id === probeId);
  const defaultName = `Probe ${probeId.toUpperCase()}`;
  const displayName = probe?.name || defaultName;

  const header = document.createElement('div');
  header.className = 'probe-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'probe-title-wrap';
  const title = document.createElement('div');
  title.className = 'probe-title';
  title.textContent = displayName;
  const badge = document.createElement('span');
  badge.className = 'probe-title-badge';
  badge.textContent = 'Pinned';
  titleWrap.appendChild(title);
  titleWrap.appendChild(badge);

  const actions = document.createElement('div');
  actions.className = 'probe-actions';
  const closeButton = document.createElement('button');
  closeButton.className = 'probe-close ui-button';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Unpin probe monitor');
  closeButton.title = 'Unpin probe monitor';
  closeButton.textContent = 'x';
  actions.appendChild(closeButton);

  header.appendChild(titleWrap);
  header.appendChild(actions);

  const meta = document.createElement('div');
  meta.className = 'probe-meta';
  const metaLeft = document.createElement('span');
  metaLeft.textContent = 'Frequency Response';
  const metaRight = document.createElement('span');
  metaRight.textContent = getProbeStatusLabel(probeId);
  meta.appendChild(metaLeft);
  meta.appendChild(metaRight);

  const chart = document.createElement('div');
  chart.className = 'probe-chart';
  const canvas = document.createElement('canvas');
  chart.appendChild(canvas);

  const footer = document.createElement('div');
  footer.className = 'probe-footer';
  const footerLeft = document.createElement('span');
  footerLeft.textContent = 'Frequency (Hz)';
  const footerRight = document.createElement('span');
  footerRight.textContent = 'Amplitude (dB)';
  footer.appendChild(footerLeft);
  footer.appendChild(footerRight);

  panel.appendChild(header);
  panel.appendChild(meta);
  panel.appendChild(chart);
  panel.appendChild(footer);
  uiLayer.appendChild(panel);

  // Bring new panel to front of all inspector windows
  bringPanelToFront(panel);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    panel.remove();
    return;
  }

  const pinned: PinnedProbePanel = { id: probeId, panel, canvas, ctx, status: metaRight };
  pinnedProbePanels.set(probeId, pinned);

  const parent = uiLayer;
  requestAnimationFrame(() => {
    const parentRect = parent.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const anchorRect = probePanel?.getBoundingClientRect() ?? null;
    const stackOffset = 18 * ((pinnedProbePanels.size - 1) % 4);
    const offset = 12 + stackOffset;
    const initialLeft = anchorRect
      ? anchorRect.left - parentRect.left + offset
      : parentRect.width - panelRect.width - offset;
    const initialTop = anchorRect
      ? anchorRect.top - parentRect.top + offset
      : parentRect.height - panelRect.height - offset;
    clampPanelToParent(panel, parent, initialLeft, initialTop, 12, getInspectorMinTop(parent, 12));
    renderProbeChartOn(canvas, ctx, probeResults.get(probeId) ?? null);
  });

  makePanelDraggable(panel, header, { parent, padding: 12, ignoreSelector: 'button' });
  closeButton.addEventListener('click', () => {
    unpinProbe(probeId);
  });
}

function pinProbe(probeId: string) {
  if (!probeId || pinnedProbePanels.has(probeId)) return;
  if (!getProbeById(probeId)) return;
  createPinnedProbePanel(probeId);
  requestProbeUpdate(probeId, { immediate: true });
  renderProbeInspector();
}

function unpinProbe(probeId: string) {
  if (!removePinnedProbe(probeId)) return;
  renderProbeInspector();
}

function togglePinProbe(probeId: string) {
  if (pinnedProbePanels.has(probeId)) {
    unpinProbe(probeId);
    return;
  }
  pinProbe(probeId);
}

function createProbeSnapshot(data: ProbeResult['data'], sourceProbeName?: string, coordinates?: { x: number; y: number }) {
  if (!uiLayer) return;
  const snapshotIndex = probeSnapshotSeq++;
  const snapshotId = `snapshot-${snapshotIndex}`;
  const panel = document.createElement('aside');
  panel.className = 'probe-panel probe-panel--snapshot is-open';
  panel.setAttribute('aria-hidden', 'false');
  panel.dataset.snapshotId = snapshotId;

  const header = document.createElement('div');
  header.className = 'probe-header';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'probe-title-wrap';
  const title = document.createElement('div');
  title.className = 'probe-title';
  // Show source probe name if provided
  const displayTitle = sourceProbeName ? `${sourceProbeName}` : `Snapshot ${snapshotIndex}`;
  title.textContent = displayTitle;
  title.title = 'Double-click to edit name';
  title.style.cursor = 'text';
  const badge = document.createElement('span');
  badge.className = 'probe-title-badge';
  badge.textContent = 'Frozen';
  titleWrap.appendChild(title);
  titleWrap.appendChild(badge);

  const actions = document.createElement('div');
  actions.className = 'probe-actions';
  const closeButton = document.createElement('button');
  closeButton.className = 'probe-close ui-button';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close snapshot');
  closeButton.textContent = 'x';
  actions.appendChild(closeButton);
  header.appendChild(titleWrap);
  header.appendChild(actions);

  const meta = document.createElement('div');
  meta.className = 'probe-meta';
  const metaLeft = document.createElement('span');
  metaLeft.textContent = 'Frequency Response';
  const metaRight = document.createElement('span');
  metaRight.textContent = 'Frozen';
  meta.appendChild(metaLeft);
  meta.appendChild(metaRight);

  // Add coordinates info if provided
  let coordsInfo: HTMLDivElement | null = null;
  if (coordinates) {
    coordsInfo = document.createElement('div');
    coordsInfo.className = 'probe-coords';
    coordsInfo.textContent = `Position: X: ${coordinates.x.toFixed(1)}m, Y: ${coordinates.y.toFixed(1)}m`;
  }

  const chart = document.createElement('div');
  chart.className = 'probe-chart';
  const canvas = document.createElement('canvas');
  chart.appendChild(canvas);

  const footer = document.createElement('div');
  footer.className = 'probe-footer';
  const footerLeft = document.createElement('span');
  footerLeft.textContent = 'Frequency (Hz)';
  const footerRight = document.createElement('span');
  footerRight.textContent = 'Amplitude (dB)';
  footer.appendChild(footerLeft);
  footer.appendChild(footerRight);

  panel.appendChild(header);
  panel.appendChild(meta);
  if (coordsInfo) panel.appendChild(coordsInfo);
  panel.appendChild(chart);
  panel.appendChild(footer);
  uiLayer.appendChild(panel);

  // Bring new panel to front of all inspector windows
  bringPanelToFront(panel);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    panel.remove();
    return;
  }

  const snapshot: ProbeSnapshot = { id: snapshotId, data, panel, canvas, ctx };
  probeSnapshots.push(snapshot);

  const parent = uiLayer;
  requestAnimationFrame(() => {
    const parentRect = parent.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const anchorRect = probePanel?.getBoundingClientRect() ?? null;
    const stackOffset = 18 * ((probeSnapshots.length - 1) % 4);
    const offset = 24 + stackOffset;
    const initialLeft = (anchorRect ? anchorRect.left - parentRect.left + offset : parentRect.width - panelRect.width - offset);
    const initialTop = (anchorRect ? anchorRect.top - parentRect.top + offset : parentRect.height - panelRect.height - offset);
      clampPanelToParent(panel, parent, initialLeft, initialTop, 12, getInspectorMinTop(parent, 12));
    renderProbeChartOn(canvas, ctx, data);
  });

  // Add double-click to edit title
  title.addEventListener('dblclick', () => {
    const currentName = title.textContent || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'context-title-input';
    input.value = currentName;
    input.placeholder = `Snapshot ${snapshotIndex}`;

    title.style.display = 'none';
    title.parentElement?.insertBefore(input, title);
    input.focus();
    input.select();

    const finishEditing = () => {
      const newValue = input.value.trim() || `Snapshot ${snapshotIndex}`;
      title.textContent = newValue;
      input.remove();
      title.style.display = '';
    };

    input.addEventListener('blur', finishEditing);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finishEditing();
      } else if (e.key === 'Escape') {
        input.remove();
        title.style.display = '';
      }
    });
  });

  makePanelDraggable(panel, header, { parent, padding: 12, ignoreSelector: 'button' });
  closeButton.addEventListener('click', () => {
    const idx = probeSnapshots.findIndex((item) => item.id === snapshotId);
    if (idx >= 0) probeSnapshots.splice(idx, 1);
    panel.remove();
  });
}

/** Create a pinned inspector panel for a non-probe element */
function createPinnedContextPanel(sel: Selection) {
  if (!uiLayer || sel.type === 'none' || sel.type === 'probe') return;

  const panelId = `pinned-context-${pinnedContextSeq++}`;

  // Get element name
  if (sel.type === 'multi') return; // Can't pin multi-selection
  let elementName = `${selectionTypeLabel(sel.type)} ${sel.id.toUpperCase()}`;
  if (sel.type === 'source') {
    const source = scene.sources.find(s => s.id === sel.id);
    elementName = source?.name || elementName;
  } else if (sel.type === 'receiver') {
    const receiver = scene.receivers.find(r => r.id === sel.id);
    elementName = receiver?.name || elementName;
  } else if (sel.type === 'panel') {
    const panel = scene.panels.find(p => p.id === sel.id);
    elementName = panel?.name || `Grid ${sel.id.toUpperCase()}`;
  } else if (sel.type === 'barrier') {
    const barrier = scene.barriers.find(b => b.id === sel.id);
    elementName = barrier?.name || elementName;
  } else if (sel.type === 'building') {
    const building = scene.buildings.find(b => b.id === sel.id);
    elementName = building?.name || elementName;
  }

  // Create the panel
  const panel = document.createElement('aside');
  panel.className = 'context-panel context-panel--pinned is-open';
  panel.setAttribute('aria-hidden', 'false');
  panel.dataset.pinnedId = panelId;

  // Header
  const header = document.createElement('div');
  header.className = 'context-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'context-title-wrap';
  const title = document.createElement('div');
  title.className = 'context-title';
  title.textContent = elementName;
  title.title = 'Double-click to edit name';
  title.style.cursor = 'text';
  const badge = document.createElement('span');
  badge.className = 'probe-title-badge';
  badge.textContent = 'Pinned';
  titleWrap.appendChild(title);
  titleWrap.appendChild(badge);

  const actions = document.createElement('div');
  actions.className = 'probe-actions';
  const closeButton = document.createElement('button');
  closeButton.className = 'context-close ui-button';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close pinned inspector');
  closeButton.textContent = '×';
  actions.appendChild(closeButton);
  header.appendChild(titleWrap);
  header.appendChild(actions);

  // Body with properties
  const body = document.createElement('div');
  body.className = 'inspector-body';

  // Render properties based on element type
  const propertiesSection = document.createElement('div');
  propertiesSection.className = 'context-section';
  const propTitle = document.createElement('div');
  propTitle.className = 'context-section-title';
  propTitle.textContent = 'Properties';
  const propBody = document.createElement('div');
  propBody.className = 'properties';
  propertiesSection.appendChild(propTitle);
  propertiesSection.appendChild(propBody);

  // Render full interactive properties for the element
  renderPropertiesFor(sel, propBody);

  body.appendChild(propertiesSection);

  // For panel/grid selections, add legend and stats sections
  let legendContainer: HTMLElement | undefined;
  let statsContainer: HTMLElement | undefined;
  if (sel.type === 'panel') {
    // Legend section
    const legendSection = document.createElement('div');
    legendSection.className = 'context-section';
    const legendTitle = document.createElement('div');
    legendTitle.className = 'context-section-title';
    legendTitle.textContent = 'Color Range';
    legendContainer = document.createElement('div');
    legendContainer.className = 'panel-legend';
    legendSection.appendChild(legendTitle);
    legendSection.appendChild(legendContainer);
    renderPanelLegendFor(sel.id, legendContainer);
    body.appendChild(legendSection);

    // Stats section
    const statsSection = document.createElement('div');
    statsSection.className = 'context-section';
    const statsTitle = document.createElement('div');
    statsTitle.className = 'context-section-title';
    statsTitle.textContent = 'Statistics';
    statsContainer = document.createElement('div');
    statsContainer.className = 'panel-stats';
    statsSection.appendChild(statsTitle);
    statsSection.appendChild(statsContainer);
    renderPanelStatsFor(sel.id, statsContainer);
    body.appendChild(statsSection);
  }

  panel.appendChild(header);
  panel.appendChild(body);
  uiLayer.appendChild(panel);

  // Bring new panel to front of all inspector windows
  bringPanelToFront(panel);

  // Store the pinned panel with properties container reference
  const pinnedPanel: PinnedContextPanel = {
    selection: sel,
    panel,
    propertiesContainer: propBody,
    legendContainer,
    statsContainer,
  };
  pinnedContextPanels.push(pinnedPanel);

  // Position the panel with offset based on number of pinned panels
  const parent = uiLayer;
  requestAnimationFrame(() => {
    const parentRect = parent.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const anchorRect = contextPanel?.getBoundingClientRect() ?? null;
    const stackOffset = 18 * ((pinnedContextPanels.length - 1) % 4);
    const offset = 12 + stackOffset;
    const initialLeft = anchorRect
      ? anchorRect.left - parentRect.left + offset
      : parentRect.width - panelRect.width - offset;
    const initialTop = anchorRect
      ? anchorRect.top - parentRect.top + offset
      : parentRect.height - panelRect.height - offset;
      clampPanelToParent(panel, parent, initialLeft, initialTop, 12, getInspectorMinTop(parent, 12));
  });

  // Make panel draggable
  makePanelDraggable(panel, header, { parent, padding: 12, ignoreSelector: 'button, input' });

  // Close button handler
  closeButton.addEventListener('click', () => {
    const idx = pinnedContextPanels.findIndex((p) => p.panel === panel);
    if (idx >= 0) pinnedContextPanels.splice(idx, 1);
    panel.remove();
  });

  // Double-click to edit title
  title.addEventListener('dblclick', () => {
    const currentName = title.textContent || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'context-title-input';
    input.value = currentName;
    input.placeholder = elementName;

    title.style.display = 'none';
    title.parentElement?.insertBefore(input, title);
    input.focus();
    input.select();

    const finishEditing = () => {
      const newValue = input.value.trim() || elementName;
      title.textContent = newValue;
      input.remove();
      title.style.display = '';
    };

    input.addEventListener('blur', finishEditing);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finishEditing();
      } else if (e.key === 'Escape') {
        input.remove();
        title.style.display = '';
      }
    });
  });
}

/** Refresh all pinned context panels (e.g., when element data changes via drag) */
function refreshPinnedContextPanels() {
  for (const pinned of pinnedContextPanels) {
    // Skip source panels - they have complex spectrum editors that shouldn't be recreated during drag
    // The spectrum editor maintains its own state and doesn't need position-based updates
    if (pinned.selection.type === 'source') {
      continue;
    }
    renderPropertiesFor(pinned.selection, pinned.propertiesContainer);
    // Also refresh legend and stats for panel type pins
    if (pinned.selection.type === 'panel') {
      if (pinned.legendContainer) {
        renderPanelLegendFor(pinned.selection.id, pinned.legendContainer);
      }
      if (pinned.statsContainer) {
        renderPanelStatsFor(pinned.selection.id, pinned.statsContainer);
      }
    }
  }
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

/**
 * Render a source spectrum chart on canvas showing dB SPL @ 1m with spherical spreading.
 *
 * This chart visualizes the source's frequency spectrum converted from sound power level (Lw)
 * to sound pressure level (SPL) at 1 meter distance, assuming spherical spreading in free field.
 * Uses a light orange color scheme to visually distinguish from the probe's blue/teal chart.
 *
 * Physics: SPL @ 1m = Lw - 11 dB (spherical spreading formula: Lp = Lw - 20*log10(r) - 11)
 *
 * Features:
 * - Logarithmic frequency axis (63 Hz to 16 kHz octave bands)
 * - Auto-scaling Y-axis based on spectrum range
 * - Dashed horizontal grid lines for readability
 * - Light orange area fill under the spectrum curve
 * - Circle markers at each octave band frequency
 * - Overall weighted level display (A/C/Z weighting)
 *
 * @param canvas - The canvas element to render on
 * @param ctx - The 2D rendering context
 * @param spectrum - 9-band octave spectrum in dB Lw (sound power level)
 * @param gain - Master gain offset in dB to apply to spectrum
 * @param weighting - Frequency weighting to apply ('A', 'C', or 'Z')
 */
function renderSourceChartOn(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  spectrum: Spectrum9,
  gain: number,
  weighting: FrequencyWeighting = 'Z'
) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = rect.width;
  const height = rect.height;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  if (!width || !height) return;

  const padding = { left: 36, right: 48, top: 12, bottom: 24 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = readCssVar('--source-chart-bg');
  ctx.fillRect(0, 0, width, height);

  // Apply gain and convert Lw to SPL @ 1m (spherical spreading: SPL = Lw - 11)
  const gainedSpectrum = spectrum.map(lw => lw + gain);
  const splAt1m = gainedSpectrum.map(lw => lw - 11); // Spherical spreading @ 1m
  const weightedSpl = applyWeightingToSpectrum(splAt1m as Spectrum9, weighting);
  const overallSpl = calculateOverallLevel(splAt1m as Spectrum9, weighting);
  const weightingUnit = weighting === 'Z' ? 'dB' : `dB(${weighting})`;

  // Calculate axis ranges
  const minFreq = OCTAVE_BANDS[0];
  const maxFreq = OCTAVE_BANDS[OCTAVE_BANDS.length - 1];
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  const minMag = Math.min(...weightedSpl);
  const maxMag = Math.max(...weightedSpl);
  const magMin = Math.floor((minMag - 5) / 10) * 10;
  const magMax = Math.ceil((maxMag + 5) / 10) * 10;

  // Draw horizontal grid lines (dashed)
  ctx.strokeStyle = readCssVar('--source-chart-grid');
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Calculate points with logarithmic frequency axis
  const points = OCTAVE_BANDS.map((freq, idx) => {
    const x = padding.left + ((Math.log10(freq) - logMin) / (logMax - logMin)) * chartWidth;
    const value = weightedSpl[idx];
    const ratio = (value - magMin) / (magMax - magMin || 1);
    const y = padding.top + (1 - ratio) * chartHeight;
    return { x, y, value, freq };
  });

  // Draw line connecting points
  ctx.beginPath();
  points.forEach((pt, index) => {
    if (index === 0) {
      ctx.moveTo(pt.x, pt.y);
    } else {
      ctx.lineTo(pt.x, pt.y);
    }
  });
  ctx.strokeStyle = readCssVar('--source-chart-line');
  ctx.lineWidth = 2;
  ctx.stroke();

  // Fill area under curve (light orange area)
  ctx.fillStyle = readCssVar('--source-chart-fill');
  ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
  ctx.lineTo(points[0].x, height - padding.bottom);
  ctx.closePath();
  ctx.fill();

  // Draw circle markers at each point
  ctx.fillStyle = readCssVar('--source-chart-marker');
  for (const point of points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Y-axis labels (dB)
  ctx.fillStyle = readCssVar('--source-chart-text');
  ctx.font = '10px "Work Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${magMax}`, 4, padding.top + 4);
  ctx.fillText(`${magMin}`, 4, height - padding.bottom + 4);

  // Display overall level on the right side
  ctx.font = 'bold 12px "Work Sans", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${formatLevel(overallSpl)}`, width - 4, padding.top + 12);
  ctx.font = '9px "Work Sans", sans-serif';
  ctx.fillText(`${weightingUnit} Pa @1m`, width - 4, padding.top + 24);
  ctx.textAlign = 'left';

  // X-axis frequency labels (first, middle, last)
  const labelIndices = [0, 4, 8]; // 63Hz, 1kHz, 16kHz
  for (const idx of labelIndices) {
    const point = points[idx];
    const freq = OCTAVE_BANDS[idx];
    const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
    ctx.fillText(label, point.x - 8, height - 6);
  }
}

/**
 * Create a spectrum editor component for editing 9-band source levels.
 *
 * This component provides an intuitive UI for adjusting the frequency spectrum of a sound source.
 * It replaces the previous hard-to-use text input grid with interactive vertical sliders and
 * a real-time visual frequency chart.
 *
 * UI Components:
 * - Section title ("Frequency Spectrum (dB Lw)")
 * - Overall level display showing both dBZ (linear) and dBA (A-weighted) totals
 * - Gain control input for master level adjustment
 * - Canvas-based frequency chart showing SPL @ 1m with orange area fill
 * - 9 vertical sliders (one per octave band: 63Hz to 16kHz)
 * - Quick preset buttons (Flat, Pink, Traffic, Music)
 *
 * Interaction:
 * - Sliders update values live during drag (input event)
 * - Changes are committed on slider release (change event)
 * - Chart updates in real-time as spectrum changes
 * - Presets normalize to maintain current overall power level
 *
 * @param source - The source object containing spectrum and gain data
 * @param onChangeSpectrum - Callback fired when spectrum values change
 * @param onChangeGain - Callback fired when gain value changes
 * @returns The spectrum editor DOM element
 */
function createSpectrumEditor(
  source: Source,
  onChangeSpectrum: (spectrum: Spectrum9) => void,
  onChangeGain: (gain: number) => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'spectrum-editor';

  // Header with section title
  const sectionTitle = document.createElement('div');
  sectionTitle.className = 'spectrum-section-title';
  sectionTitle.textContent = 'Frequency Spectrum (dB Lw)';
  container.appendChild(sectionTitle);

  // Overall level display
  const overallRow = document.createElement('div');
  overallRow.className = 'spectrum-overall-row';
  const overallLabel = document.createElement('span');
  overallLabel.className = 'spectrum-overall-label';
  const updateOverallLabel = () => {
    const overallZ = calculateOverallLevel(source.spectrum, 'Z');
    const overallA = calculateOverallLevel(source.spectrum, 'A');
    overallLabel.innerHTML = `Overall: <strong>${formatLevel(overallZ)}</strong> dBZ / <strong>${formatLevel(overallA)}</strong> dBA`;
  };
  updateOverallLabel();
  overallRow.appendChild(overallLabel);
  container.appendChild(overallRow);

  // Gain control row
  const gainRow = document.createElement('div');
  gainRow.className = 'spectrum-gain-row';
  const gainLabel = document.createElement('span');
  gainLabel.className = 'spectrum-gain-label';
  gainLabel.textContent = 'Gain:';
  const gainInput = document.createElement('input');
  gainInput.type = 'number';
  gainInput.className = 'ui-inset spectrum-gain-input';
  gainInput.step = '1';
  gainInput.value = source.gain.toString();
  gainInput.title = 'Master gain offset (dB)';
  const gainUnit = document.createElement('span');
  gainUnit.className = 'spectrum-gain-unit';
  gainUnit.textContent = 'dB';
  gainRow.appendChild(gainLabel);
  gainRow.appendChild(gainInput);
  gainRow.appendChild(gainUnit);
  container.appendChild(gainRow);

  // Source spectrum chart (dB SPL @ 1m with spherical spreading)
  const chartContainer = document.createElement('div');
  chartContainer.className = 'source-chart-container';
  const chartLabel = document.createElement('div');
  chartLabel.className = 'source-chart-label';
  chartLabel.textContent = 'SPL @ 1m (spherical)';
  chartContainer.appendChild(chartLabel);

  const chart = document.createElement('canvas');
  chart.className = 'source-chart';
  chartContainer.appendChild(chart);
  container.appendChild(chartContainer);

  const chartCtx = chart.getContext('2d');

  const renderChart = () => {
    if (chartCtx) {
      renderSourceChartOn(chart, chartCtx, source.spectrum, source.gain, displayWeighting);
    }
  };

  // Render chart after DOM insertion (use setTimeout to ensure layout is calculated)
  setTimeout(() => {
    renderChart();
  }, 0);

  // Interactive band sliders with value display
  const slidersContainer = document.createElement('div');
  slidersContainer.className = 'spectrum-sliders-container';

  const sliders: HTMLInputElement[] = [];
  const valueDisplays: HTMLSpanElement[] = [];

  // Store fill elements for updating
  const fillElements: HTMLDivElement[] = [];

  // Helper to calculate fill height percentage
  const calcFillPercent = (value: number): number => {
    const min = 40;
    const max = 130;
    return ((value - min) / (max - min)) * 100;
  };

  for (let i = 0; i < OCTAVE_BANDS.length; i++) {
    const bandIndex = i;
    const freq = OCTAVE_BANDS[i];
    const freqLabel = freq >= 1000 ? `${freq / 1000}k` : String(freq);

    const sliderColumn = document.createElement('div');
    sliderColumn.className = 'spectrum-slider-column';

    // Value display above slider
    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'spectrum-slider-value';
    valueDisplay.textContent = Math.round(source.spectrum[i]).toString();
    valueDisplays.push(valueDisplay);

    // Track wrapper (sunken gutter)
    const trackWrapper = document.createElement('div');
    trackWrapper.className = 'spectrum-slider-track';

    // Fill element (solid color level indicator)
    const fillEl = document.createElement('div');
    fillEl.className = 'spectrum-slider-fill';
    fillEl.style.height = `${calcFillPercent(source.spectrum[i])}%`;
    fillElements.push(fillEl);

    // Vertical slider (range input using writing-mode)
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'spectrum-slider';
    slider.min = '40';
    slider.max = '130';
    slider.step = '1';
    slider.value = source.spectrum[i].toString();
    slider.title = `${freqLabel} Hz: ${Math.round(source.spectrum[i])} dB Lw`;
    sliders.push(slider);

    // Frequency label below slider
    const freqLabelEl = document.createElement('span');
    freqLabelEl.className = 'spectrum-slider-freq';
    freqLabelEl.textContent = freqLabel;

    // Handle slider input (live updates)
    slider.addEventListener('input', () => {
      const next = Number(slider.value);
      valueDisplay.textContent = Math.round(next).toString();
      slider.title = `${freqLabel} Hz: ${Math.round(next)} dB Lw`;
      // Update fill height
      fillEl.style.height = `${calcFillPercent(next)}%`;
    });

    // Handle slider change (commit value)
    slider.addEventListener('change', () => {
      const next = Number(slider.value);
      if (Number.isFinite(next)) {
        source.spectrum[bandIndex] = next;
        source.power = calculateOverallLevel(source.spectrum, 'Z');
        updateOverallLabel();
        renderChart();
        onChangeSpectrum([...source.spectrum] as Spectrum9);
      }
    });

    // Assemble track: fill + slider inside track wrapper
    trackWrapper.appendChild(fillEl);
    trackWrapper.appendChild(slider);

    sliderColumn.appendChild(valueDisplay);
    sliderColumn.appendChild(trackWrapper);
    sliderColumn.appendChild(freqLabelEl);
    slidersContainer.appendChild(sliderColumn);
  }

  container.appendChild(slidersContainer);

  // Helper to update all sliders from spectrum
  const updateSliders = () => {
    for (let i = 0; i < 9; i++) {
      sliders[i].value = source.spectrum[i].toString();
      valueDisplays[i].textContent = Math.round(source.spectrum[i]).toString();
      fillElements[i].style.height = `${calcFillPercent(source.spectrum[i])}%`;
      const freq = OCTAVE_BANDS[i];
      const freqLabel = freq >= 1000 ? `${freq / 1000}k` : String(freq);
      sliders[i].title = `${freqLabel} Hz: ${Math.round(source.spectrum[i])} dB Lw`;
    }
    renderChart();
  };

  // Gain input handler
  gainInput.addEventListener('change', () => {
    const next = Number(gainInput.value);
    if (Number.isFinite(next)) {
      source.gain = next;
      renderChart();
      onChangeGain(next);
    }
  });

  // Quick presets
  const presets = document.createElement('div');
  presets.className = 'spectrum-presets';

  const applyPreset = (shape: number[]) => {
    const targetPower = source.power;
    const tempSpectrum = shape.map(offset => 100 + offset);
    const tempOverall = calculateOverallLevel(tempSpectrum as Spectrum9, 'Z');
    const adjustment = targetPower - tempOverall;

    for (let i = 0; i < 9; i++) {
      source.spectrum[i] = Math.round(100 + shape[i] + adjustment);
    }
    source.power = calculateOverallLevel(source.spectrum, 'Z');
    updateOverallLabel();
    updateSliders();
    onChangeSpectrum([...source.spectrum] as Spectrum9);
  };

  const flatButton = document.createElement('button');
  flatButton.type = 'button';
  flatButton.className = 'spectrum-preset-button ui-button ghost';
  flatButton.textContent = 'Flat';
  flatButton.title = 'Set all bands to same level';
  flatButton.addEventListener('click', () => {
    const level = Math.round(source.power);
    const bandLevel = level - 10 * Math.log10(9);
    applyPreset([0, 0, 0, 0, 0, 0, 0, 0, 0].map(() => bandLevel - 100));
  });

  const pinkButton = document.createElement('button');
  pinkButton.type = 'button';
  pinkButton.className = 'spectrum-preset-button ui-button ghost';
  pinkButton.textContent = 'Pink';
  pinkButton.title = 'Pink noise (-3 dB/octave)';
  pinkButton.addEventListener('click', () => {
    const refIndex = 4;
    const pinkShape = Array.from({ length: 9 }, (_, i) => -3 * (i - refIndex));
    applyPreset(pinkShape);
  });

  const trafficButton = document.createElement('button');
  trafficButton.type = 'button';
  trafficButton.className = 'spectrum-preset-button ui-button ghost';
  trafficButton.textContent = 'Traffic';
  trafficButton.title = 'Typical road traffic spectrum';
  trafficButton.addEventListener('click', () => {
    applyPreset([8, 5, 2, 0, -2, -5, -8, -12, -18]);
  });

  const musicButton = document.createElement('button');
  musicButton.type = 'button';
  musicButton.className = 'spectrum-preset-button ui-button ghost';
  musicButton.textContent = 'Music';
  musicButton.title = 'Typical music/PA spectrum';
  musicButton.addEventListener('click', () => {
    applyPreset([6, 4, 2, 0, -1, -2, -4, -8, -14]);
  });

  presets.appendChild(flatButton);
  presets.appendChild(pinkButton);
  presets.appendChild(trafficButton);
  presets.appendChild(musicButton);
  container.appendChild(presets);

  return container;
}

/**
 * Create a compact spectrum bar visualization
 */
function createSpectrumBar(spectrum: Spectrum9, weighting: FrequencyWeighting = 'Z'): HTMLElement {
  const container = document.createElement('div');
  container.className = 'spectrum-bar';

  const weighted = applyWeightingToSpectrum(spectrum, weighting);
  const maxLevel = Math.max(...weighted);
  const minLevel = Math.min(...weighted.filter(l => l > MIN_LEVEL));
  const range = Math.max(maxLevel - minLevel, 30);

  for (let i = 0; i < 9; i++) {
    const bar = document.createElement('div');
    bar.className = 'spectrum-bar-item';
    const level = weighted[i];
    const height = level > MIN_LEVEL ? Math.max(5, ((level - minLevel) / range) * 100) : 5;
    bar.style.height = `${height}%`;
    bar.title = `${OCTAVE_BANDS[i]} Hz: ${formatLevel(level)} dB${weighting}`;
    container.appendChild(bar);
  }

  return container;
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

    // Overall power display (computed from spectrum)
    const overallZ = calculateOverallLevel(source.spectrum, 'Z');
    const overallA = calculateOverallLevel(source.spectrum, 'A');
    const powerDisplay = document.createElement('div');
    powerDisplay.className = 'source-power-display';
    powerDisplay.innerHTML = `<span class="source-power-label">Power:</span> <strong>${formatLevel(overallZ)}</strong> dBZ / <strong>${formatLevel(overallA)}</strong> dBA`;
    fields.appendChild(powerDisplay);

    // Compact spectrum visualization
    const spectrumBar = createSpectrumBar(source.spectrum, displayWeighting);
    fields.appendChild(spectrumBar);

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
    spectrum: [...source.spectrum] as Spectrum9,
  };
}

function duplicateReceiver(receiver: Receiver): Receiver {
  const newId = createId('r', receiverSeq++);
  return { ...receiver, id: newId };
}

function duplicateProbe(probe: Probe): Probe {
  const newId = createId('pr', probeSeq++);
  return { ...probe, id: newId };
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

/** Render interactive property controls for a selection into a container */
function renderPropertiesFor(current: Selection, container: HTMLElement) {
  container.innerHTML = '';

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

    container.appendChild(empty);
    return;
  }

  if (current.type === 'multi') {
    const counts = getSelectedCount(current);
    const summary = document.createElement('div');
    summary.className = 'multi-selection-summary';

    const countsDiv = document.createElement('div');
    countsDiv.className = 'multi-selection-counts';
    const totalCount = current.items.length;
    countsDiv.innerHTML = `<strong>${totalCount} items selected</strong>`;

    const details: string[] = [];
    if (counts.source > 0) details.push(`${counts.source} source${counts.source > 1 ? 's' : ''}`);
    if (counts.receiver > 0) details.push(`${counts.receiver} receiver${counts.receiver > 1 ? 's' : ''}`);
    if (counts.probe > 0) details.push(`${counts.probe} probe${counts.probe > 1 ? 's' : ''}`);
    if (counts.panel > 0) details.push(`${counts.panel} panel${counts.panel > 1 ? 's' : ''}`);
    if (counts.barrier > 0) details.push(`${counts.barrier} barrier${counts.barrier > 1 ? 's' : ''}`);
    if (counts.building > 0) details.push(`${counts.building} building${counts.building > 1 ? 's' : ''}`);

    if (details.length > 0) {
      const detailsSpan = document.createElement('span');
      detailsSpan.className = 'multi-selection-count-item';
      detailsSpan.textContent = details.join(', ');
      countsDiv.appendChild(detailsSpan);
    }

    summary.appendChild(countsDiv);

    const actions = document.createElement('div');
    actions.className = 'multi-selection-actions';

    const duplicateBtn = document.createElement('button');
    duplicateBtn.type = 'button';
    duplicateBtn.className = 'ui-button multi-action-btn';
    duplicateBtn.textContent = 'Duplicate';
    duplicateBtn.addEventListener('click', () => {
      duplicateMultiSelection();
    });
    actions.appendChild(duplicateBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'ui-button multi-action-btn danger';
    deleteBtn.textContent = 'Delete All';
    deleteBtn.addEventListener('click', () => {
      deleteSelection(current);
    });
    actions.appendChild(deleteBtn);

    const deselectBtn = document.createElement('button');
    deselectBtn.type = 'button';
    deselectBtn.className = 'ui-button multi-action-btn secondary';
    deselectBtn.textContent = 'Deselect';
    deselectBtn.addEventListener('click', () => {
      setSelection({ type: 'none' });
    });
    actions.appendChild(deselectBtn);

    summary.appendChild(actions);
    container.appendChild(summary);
    return;
  }

  if (current.type === 'source') {
    const source = scene.sources.find((item) => item.id === current.id);
    if (!source) return;
    container.appendChild(createInputRow('Height (m)', source.z, (value) => {
      source.z = value;
      pushHistory();
      computeScene();
      refreshPinnedContextPanels();
    }));

    // Spectrum editor section
    const spectrumSection = document.createElement('div');
    spectrumSection.className = 'property-section';
    const spectrumTitle = document.createElement('div');
    spectrumTitle.className = 'property-section-title';
    spectrumTitle.textContent = 'Frequency Spectrum (dB Lw)';
    spectrumSection.appendChild(spectrumTitle);

    const spectrumEditor = createSpectrumEditor(
      source,
      () => {
        pushHistory();
        computeScene();
      },
      () => {
        pushHistory();
        computeScene();
      }
    );
    spectrumSection.appendChild(spectrumEditor);
    container.appendChild(spectrumSection);
  }

  if (current.type === 'receiver') {
    const receiver = scene.receivers.find((item) => item.id === current.id);
    if (!receiver) return;
    container.appendChild(createInputRow('Height (m)', receiver.z, (value) => {
      receiver.z = value;
      pushHistory();
      computeScene();
      refreshPinnedContextPanels();
    }));
  }

  if (current.type === 'panel') {
    const panel = scene.panels.find((item) => item.id === current.id);
    if (!panel) return;
    container.appendChild(createInputRow('Elevation (m)', panel.elevation, (value) => {
      panel.elevation = value;
      pushHistory();
      computeScene();
      refreshPinnedContextPanels();
    }));
    container.appendChild(createInputRow('Spacing (m)', panel.sampling.resolution, (value) => {
      panel.sampling.resolution = Math.max(1, value);
      pushHistory();
      computeScene();
      refreshPinnedContextPanels();
    }));
    const hint = document.createElement('div');
    hint.className = 'property-hint';
    hint.textContent = 'Drag corner handles on the measure grid to reshape.';
    container.appendChild(hint);
  }

  if (current.type === 'barrier') {
    const barrier = scene.barriers.find((item) => item.id === current.id);
    if (!barrier) return;

    // Length control
    const currentLength = getBarrierLength(barrier);
    container.appendChild(createInputRow('Length (m)', currentLength, (value) => {
      const newLength = Math.max(BARRIER_MIN_LENGTH, value);
      const midpoint = getBarrierMidpoint(barrier);
      const rotation = getBarrierRotation(barrier);
      setBarrierFromMidpointAndRotation(barrier, midpoint, rotation, newLength);
      pushHistory();
      computeScene();
      refreshPinnedContextPanels();
    }));

    // Wall height control
    container.appendChild(createInputRow('Wall height (m)', barrier.height, (value) => {
      barrier.height = Math.max(0.1, value);
      pushHistory();
      computeScene();
      refreshPinnedContextPanels();
    }));

    // Rotation control (in degrees)
    const currentRotation = (getBarrierRotation(barrier) * 180) / Math.PI;
    container.appendChild(createInputRow('Rotation (deg)', currentRotation, (value) => {
      const midpoint = getBarrierMidpoint(barrier);
      const length = getBarrierLength(barrier);
      const newRotation = (value * Math.PI) / 180;
      setBarrierFromMidpointAndRotation(barrier, midpoint, newRotation, length);
      pushHistory();
      computeScene();
      refreshPinnedContextPanels();
    }));

    const hint = document.createElement('div');
    hint.className = 'property-hint';
    hint.textContent = 'Drag endpoint handles to resize. Drag the lollipop to rotate.';
    container.appendChild(hint);
  }

  if (current.type === 'building') {
    const building = scene.buildings.find((item) => item.id === current.id);
    if (!building) return;
    container.appendChild(createInputRow('Width (m)', building.width, (value) => {
      building.width = Math.max(BUILDING_MIN_SIZE, value);
      pushHistory();
      computeScene();
      refreshPinnedContextPanels();
    }));
    container.appendChild(createInputRow('Depth (m)', building.height, (value) => {
      building.height = Math.max(BUILDING_MIN_SIZE, value);
      pushHistory();
      computeScene();
      refreshPinnedContextPanels();
    }));
    container.appendChild(createInputRow('Height (m)', building.z_height, (value) => {
      building.z_height = Math.max(0.1, value);
      pushHistory();
      computeScene();
      refreshPinnedContextPanels();
    }));
    container.appendChild(createInputRow('Rotation (deg)', (building.rotation * 180) / Math.PI, (value) => {
      building.rotation = (value * Math.PI) / 180;
      pushHistory();
      computeScene();
      refreshPinnedContextPanels();
    }));
    const hint = document.createElement('div');
    hint.className = 'property-hint';
    hint.textContent = 'Drag corner handles to resize. Drag the lollipop to rotate.';
    container.appendChild(hint);
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

function wireDisplaySettings() {
  if (!displayWeightingSelect && !displayBandSelect) return;

  // Initialize from current state
  if (displayWeightingSelect) {
    displayWeightingSelect.value = displayWeighting;
  }
  if (displayBandSelect) {
    displayBandSelect.value = displayBand === 'overall' ? 'overall' : String(displayBand);
  }

  displayWeightingSelect?.addEventListener('change', () => {
    displayWeighting = displayWeightingSelect.value as FrequencyWeighting;
    renderSources();
    renderResults();
    renderProperties();
    // Recompute noise map with new weighting if the map layer is visible
    if (layers.noiseMap) {
      void computeNoiseMapInternal({ resolutionPx: RES_HIGH, silent: false, requestId: 'grid:weighting-change' });
    }
    requestRender();
  });

  displayBandSelect?.addEventListener('change', () => {
    const value = displayBandSelect.value;
    displayBand = value === 'overall' ? 'overall' : (Number(value) as DisplayBand);
    // Update band step to use appropriate default for overall vs per-band display
    mapBandStep = displayBand === 'overall' ? DEFAULT_MAP_BAND_STEP : DEFAULT_MAP_BAND_STEP_PERBAND;
    updateMapSettingsControls();
    renderSources();
    renderResults();
    renderProperties();
    // Recompute noise map with new band selection if the map layer is visible
    if (layers.noiseMap) {
      void computeNoiseMapInternal({ resolutionPx: RES_HIGH, silent: false, requestId: 'grid:band-change' });
    }
    requestRender();
  });
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
  const collapsibles = document.querySelectorAll('.equation-collapsible') as NodeListOf<HTMLDivElement>;

  collapsibles.forEach((collapsible) => {
    const header = collapsible.querySelector('.equation-header') as HTMLDivElement | null;
    const content = collapsible.querySelector('.equation-content') as HTMLDivElement | null;

if (!header || !content) return;

    const toggle = () => {
      const isExpanded = collapsible.classList.contains('is-expanded');
      if (isExpanded) {
        collapsible.classList.remove('is-expanded');
        content.hidden = true;
      } else {
        collapsible.classList.add('is-expanded');
        content.hidden = false;
        // Re-render KaTeX in the expanded content
        rerenderKatex(content);
      }
    };

    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });

// Update ground model equation when dropdown changes
  propagationGroundModel?.addEventListener('change', updateGroundModelEquation);
  updateGroundModelEquation();

  // Update spreading equation when dropdown changes
  propagationSpreading?.addEventListener('change', updateSpreadingEquation);
  updateSpreadingEquation();

  // Update impedance equation when dropdown changes
  probeImpedanceModel?.addEventListener('change', updateImpedanceEquation);
  updateImpedanceEquation();

  // Update mixed interpolation equation when dropdown changes
  propagationGroundMixedSigmaModel?.addEventListener('change', updateMixedInterpEquation);
  updateMixedInterpEquation();

// Update side diffraction equation when dropdown changes
  propagationBarrierSideDiffraction?.addEventListener('change', updateSideDiffractionEquation);
  updateSideDiffractionEquation();

  // Update atmospheric absorption equation when dropdown changes
  propagationAbsorption?.addEventListener('change', updateAtmAbsorptionEquation);
  updateAtmAbsorptionEquation();
}

function updateGroundModelEquation() {
  if (!groundModelEquation) return;
  const model = propagationGroundModel?.value ?? 'twoRayPhasor';

  if (model === 'legacy') {
    groundModelEquation.textContent = '$A_{gr} = A_s + A_r + A_m$';
  } else {
    groundModelEquation.textContent = '$A_{gr} = -20\\log_{10}|1 + \\Gamma \\cdot (r_1/r_2) \\cdot e^{jk(r_2-r_1)}|$';
  }
  rerenderKatex(groundModelEquation);
}

function updateSpreadingEquation() {
  const collapsible = document.querySelector('[data-equation="spreading"]') as HTMLDivElement | null;
  if (!collapsible) return;

  const mainEq = collapsible.querySelector('.equation-main') as HTMLDivElement | null;
  if (!mainEq) return;

  const spreading = propagationSpreading?.value ?? 'spherical';

  if (spreading === 'cylindrical') {
    mainEq.textContent = '$A_{div} = 10\\log_{10}(d) + 10\\log_{10}(2\\pi)$';
  } else {
    mainEq.textContent = '$A_{div} = 20\\log_{10}(d) + 10\\log_{10}(4\\pi)$';
  }
  rerenderKatex(mainEq);
}

function updateImpedanceEquation() {
  if (!impedanceEquation) return;
  const model = probeImpedanceModel?.value ?? 'delanyBazleyMiki';

  if (model === 'delanyBazley') {
    impedanceEquation.textContent = '$Z_n = 1 + 9.08(f/\\sigma)^{-0.75} - j \\cdot 11.9(f/\\sigma)^{-0.73}$';
  } else {
    impedanceEquation.textContent = '$Z_n = 1 + 9.08(f/\\sigma)^{-0.75} - j \\cdot 11.9(f/\\sigma)^{-0.73}$';
  }
  rerenderKatex(impedanceEquation);
}

function updateMixedInterpEquation() {
  const mixedInterpEquation = document.querySelector('#mixedInterpEquation') as HTMLDivElement | null;
  if (!mixedInterpEquation) return;
  const model = propagationGroundMixedSigmaModel?.value ?? 'iso9613';

  if (model === 'logarithmic') {
    mixedInterpEquation.textContent = '$\\sigma_{eff} = \\sigma_{soft}^G \\times \\sigma_{hard}^{1-G}$';
  } else {
    mixedInterpEquation.textContent = '$\\sigma_{eff} = \\sigma_{soft} / G$';
  }
  rerenderKatex(mixedInterpEquation);
}

function updateSideDiffractionEquation() {
  const sideDiffractionEquation = document.querySelector('#sideDiffractionEquation') as HTMLDivElement | null;
  if (!sideDiffractionEquation) return;
  const mode = propagationBarrierSideDiffraction?.value ?? 'auto';

  if (mode === 'off') {
    sideDiffractionEquation.textContent = '$\\delta = A + B - d_{direct}$';
  } else {
    sideDiffractionEquation.textContent = '$\\delta = \\min(\\delta_{top}, \\delta_{left}, \\delta_{right})$';
  }
  rerenderKatex(sideDiffractionEquation);
}

function updateAtmAbsorptionEquation() {
  const atmAbsorptionEquation = document.querySelector('#atmAbsorptionEquation') as HTMLDivElement | null;
  if (!atmAbsorptionEquation) return;
  const model = propagationAbsorption?.value ?? 'iso9613';

if (model === 'none') {
    atmAbsorptionEquation.textContent = '$A_{atm} = 0$';
  } else if (model === 'simple') {
    atmAbsorptionEquation.textContent = '$A_{atm} = \\alpha(f) \\cdot d / 1000$';
  } else {
    atmAbsorptionEquation.textContent = '$A_{atm} = \\alpha(f, T, RH, p) \\cdot d / 1000$';
  }
  rerenderKatex(atmAbsorptionEquation);
}

/**
 * Re-render KaTeX for a specific element after content change.
 * Uses the global renderMathInElement from KaTeX auto-render.
 */
function rerenderKatex(element: HTMLElement) {
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(element, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    });
  }
}

/**
 * Update all equation displays to match current dropdown values.
 * Call this after programmatically changing dropdown values.
 */
function updateAllEquations() {
  updateGroundModelEquation();
  updateSpreadingEquation();
  updateImpedanceEquation();
  updateMixedInterpEquation();
  updateSideDiffractionEquation();
  updateAtmAbsorptionEquation();
}

// Wire up Probe Engine controls (future: connect to probe config)
function wireProbeEngineControls() {
  // These toggles will eventually be wired to probe calculation config
  // For now, just log changes for testing
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

// Multi-selection helper functions
function isElementSelected(sel: Selection, elementType: string, id: string): boolean {
  if (sel.type === 'multi') {
    return sel.items.some((item) => item.elementType === elementType && item.id === id);
  }
  return sel.type === elementType && 'id' in sel && sel.id === id;
}

function selectionToItems(sel: Selection): SelectionItem[] {
  if (sel.type === 'none') return [];
  if (sel.type === 'multi') return [...sel.items];
  return [{ elementType: sel.type as SelectableElementType, id: sel.id }];
}

function itemsToSelection(items: SelectionItem[]): Selection {
  if (items.length === 0) return { type: 'none' };
  if (items.length === 1) {
    const item = items[0];
    return { type: item.elementType, id: item.id } as Selection;
  }
  return { type: 'multi', items };
}

function getSelectedCount(sel: Selection): Record<SelectableElementType, number> {
  const counts: Record<SelectableElementType, number> = {
    source: 0,
    receiver: 0,
    probe: 0,
    panel: 0,
    barrier: 0,
    building: 0,
  };
  const items = selectionToItems(sel);
  for (const item of items) {
    counts[item.elementType]++;
  }
  return counts;
}

function getPolygonCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let cx = 0,
    cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / points.length, y: cy / points.length };
}

function getPanelCentroid(panel: Panel): Point {
  return getPolygonCentroid(panel.points);
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
    const centroid = getPanelCentroid(panel);
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
        probeResults.delete(item.id);
        probePending.delete(item.id);
        unpinProbe(item.id);
        if (activeProbeId === item.id) {
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
    probeResults.delete(target.id);
    probePending.delete(target.id);
    unpinProbe(target.id);
    if (activeProbeId === target.id) {
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

function drawSelectBox() {
  if (!dragState || dragState.type !== 'select-box') return;
  const { startCanvasPoint, currentCanvasPoint } = dragState;

  const x = Math.min(startCanvasPoint.x, currentCanvasPoint.x);
  const y = Math.min(startCanvasPoint.y, currentCanvasPoint.y);
  const w = Math.abs(currentCanvasPoint.x - startCanvasPoint.x);
  const h = Math.abs(currentCanvasPoint.y - startCanvasPoint.y);

  ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
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

    if (isElementSelected(selection, 'panel', panel.id)) {
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

  const drawHandle = (point: Point, radius: number, fill: string, stroke: string) => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const barrier of scene.barriers) {
    const start = worldToCanvas(barrier.p1);
    const end = worldToCanvas(barrier.p2);
    const isSelected = isElementSelected(selection, 'barrier', barrier.id);

    if (isSelected) {
      drawLine(start, end, canvasTheme.selectionHalo, 12);
      drawLine(start, end, canvasTheme.barrierSelected, 6);

      // Draw endpoint handles (p1 and p2)
      drawHandle(start, BARRIER_HANDLE_RADIUS, '#ffffff', canvasTheme.barrierSelected);
      drawHandle(end, BARRIER_HANDLE_RADIUS, '#ffffff', canvasTheme.barrierSelected);

      // Draw rotation handle (perpendicular from midpoint)
      const handleOffset = BARRIER_ROTATION_HANDLE_OFFSET_PX / pixelsPerMeter;
      const midWorld = getBarrierMidpoint(barrier);
      const midCanvas = worldToCanvas(midWorld);
      const handleWorld = getBarrierRotationHandlePosition(barrier, handleOffset);
      const handleCanvas = worldToCanvas(handleWorld);

      // Draw line from midpoint to rotation handle
      ctx.strokeStyle = canvasTheme.barrierSelected;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(midCanvas.x, midCanvas.y);
      ctx.lineTo(handleCanvas.x, handleCanvas.y);
      ctx.stroke();

      // Draw rotation handle circle
      drawHandle(handleCanvas, BARRIER_ROTATION_HANDLE_RADIUS, '#ffffff', canvasTheme.barrierSelected);
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

    if (isElementSelected(selection, 'source', source.id)) {
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
    const displayName = source.name || source.id.toUpperCase();
    ctx.fillText(displayName, p.x + 14, p.y - 6);

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

    if (isElementSelected(selection, 'receiver', receiver.id)) {
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
    const displayName = receiver.name || receiver.id.toUpperCase();
    ctx.fillText(displayName, p.x + 14, p.y + 4);
    ctx.fillStyle = canvasTheme.receiverFill;
  }
}

function drawReceiverBadges() {
  const map = new Map(results.receivers.map((item) => [item.id, item]));
  for (const receiver of scene.receivers) {
    const result = map.get(receiver.id);
    if (!result) continue;
    const p = worldToCanvas(receiver);
    const { level, unit } = getReceiverDisplayLevel(result);
    const label = `${formatLevel(level)} ${unit}`;
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

function drawProbes() {
  for (const probe of scene.probes) {
    const p = worldToCanvas(probe);
    const isActive = probe.id === activeProbeId;
    const isSelected = isElementSelected(selection, 'probe', probe.id);

    ctx.save();
    if (isActive || isSelected) {
      ctx.fillStyle = canvasTheme.selectionHalo;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = canvasTheme.probeRing;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.translate(p.x, p.y);
    ctx.strokeStyle = canvasTheme.probeStroke;
    ctx.fillStyle = canvasTheme.probeFill;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    // Mic head
    ctx.beginPath();
    ctx.arc(0, -6, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Mic body
    ctx.beginPath();
    ctx.moveTo(-4, -6);
    ctx.lineTo(-4, 2);
    ctx.lineTo(4, 2);
    ctx.lineTo(4, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Stem
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(0, 8);
    ctx.stroke();

    // Base
    ctx.beginPath();
    ctx.moveTo(-6, 8);
    ctx.lineTo(6, 8);
    ctx.stroke();

    ctx.restore();

    ctx.fillStyle = canvasTheme.probeLabel;
    ctx.font = '12px "Work Sans", sans-serif';
    const probeLabel = probe.name || probe.id.toUpperCase();
    ctx.fillText(probeLabel, p.x + 14, p.y + 6);
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

function shouldLiveUpdateMap(activeDrag: DragState | null) {
  if (!activeDrag) return false;
  // Any drag that modifies geometry should trigger map recalculation
  const geometryDragTypes = [
    'source',
    'barrier',
    'barrier-endpoint',
    'barrier-rotate',
    'building',
    'building-resize',
    'building-rotate',
    'move-multi',
  ];
  return geometryDragTypes.includes(activeDrag.type);
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
      building.x = targetPoint.x;
      building.y = targetPoint.y;
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
    if (dragState.type === 'select-box') {
      dragState.currentCanvasPoint = canvasPoint;
      requestRender();
    } else {
      throttledDragMove(worldPoint);
    }
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

  if (activeTool === 'add-probe') {
    addProbeAt(snappedPoint);
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
    // Check for barrier handle hits (endpoints and rotation)
    const barrierHandle = hitTestBarrierHandle(canvasPoint);
    if (barrierHandle) {
      const current = selection;
      if (current.type === 'barrier') {
        const barrier = scene.barriers.find((item) => item.id === current.id);
        if (barrier) {
          dragDirty = false;
          if (barrierHandle.type === 'rotate') {
            const midpoint = getBarrierMidpoint(barrier);
            const startAngle = Math.atan2(worldPoint.y - midpoint.y, worldPoint.x - midpoint.x);
            dragState = {
              type: 'barrier-rotate',
              id: barrier.id,
              startAngle,
              startRotation: getBarrierRotation(barrier),
              startLength: getBarrierLength(barrier),
              startMidpoint: midpoint,
            };
          } else {
            // p1 or p2 endpoint
            dragState = {
              type: 'barrier-endpoint',
              id: barrier.id,
              endpoint: barrierHandle.type,
            };
          }
          startInteractionForDrag(dragState);
          return;
        }
      }
    }
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
    const worldHit = canvasToWorld(canvasPoint);

    // Shift+click adds/removes elements from selection
    if (event.shiftKey && activeTool === 'select') {
      const currentItems = selectionToItems(selection);
      const hitType = hit.type as SelectableElementType;
      const existingIndex = currentItems.findIndex(
        (item) => item.elementType === hitType && item.id === hit.id
      );

      if (existingIndex >= 0) {
        // Remove from selection if already selected
        currentItems.splice(existingIndex, 1);
      } else {
        // Add to selection
        currentItems.push({ elementType: hitType, id: hit.id });
      }

      setSelection(itemsToSelection(currentItems));
      requestRender();
      return;
    }

    // Check if clicking on an element that's part of multi-selection
    // If so, start multi-move instead of resetting to single selection
    // TODO: Fix multi-move - currently resets to single selection when clicking to drag
    const isInMultiSelection = selection.type === 'multi' && isElementSelected(selection, hit.type, hit.id);
    if (selection.type === 'multi' && isInMultiSelection) {
      // Start move-multi drag - calculate offsets for all selected items
      const offsets = new Map<string, Point>();
      for (const item of selection.items) {
        if (item.elementType === 'source') {
          const source = scene.sources.find((s) => s.id === item.id);
          if (source) offsets.set(item.id, { x: worldHit.x - source.x, y: worldHit.y - source.y });
        } else if (item.elementType === 'receiver') {
          const receiver = scene.receivers.find((r) => r.id === item.id);
          if (receiver) offsets.set(item.id, { x: worldHit.x - receiver.x, y: worldHit.y - receiver.y });
        } else if (item.elementType === 'probe') {
          const probe = scene.probes.find((p) => p.id === item.id);
          if (probe) offsets.set(item.id, { x: worldHit.x - probe.x, y: worldHit.y - probe.y });
        } else if (item.elementType === 'panel') {
          const panel = scene.panels.find((p) => p.id === item.id);
          if (panel && panel.points[0]) offsets.set(item.id, { x: worldHit.x - panel.points[0].x, y: worldHit.y - panel.points[0].y });
        } else if (item.elementType === 'barrier') {
          const barrier = scene.barriers.find((b) => b.id === item.id);
          if (barrier) offsets.set(item.id, { x: worldHit.x - barrier.p1.x, y: worldHit.y - barrier.p1.y });
        } else if (item.elementType === 'building') {
          const building = scene.buildings.find((b) => b.id === item.id);
          if (building) offsets.set(item.id, { x: worldHit.x - building.x, y: worldHit.y - building.y });
        }
      }
      dragState = { type: 'move-multi', offsets };
      dragDirty = false;
      startInteractionForDrag(dragState);
      return;
    }

    setSelection(hit);
    dragDirty = false;

    if (hit.type === 'source') {
      const source = scene.sources.find((item) => item.id === hit.id);
      if (source) {
        dragState = { type: 'source', id: source.id, offset: { x: worldHit.x - source.x, y: worldHit.y - source.y } };
        primeDragContribution(source.id);
      }
    }
    if (hit.type === 'probe') {
      const probe = scene.probes.find((item) => item.id === hit.id);
      if (probe) {
        dragState = { type: 'probe', id: probe.id, offset: { x: worldHit.x - probe.x, y: worldHit.y - probe.y } };
      }
    }
    if (hit.type === 'receiver') {
      const receiver = scene.receivers.find((item) => item.id === hit.id);
      if (receiver) {
        dragState = { type: 'receiver', id: receiver.id, offset: { x: worldHit.x - receiver.x, y: worldHit.y - receiver.y } };
      }
    }
    if (hit.type === 'panel') {
      const panel = scene.panels.find((item) => item.id === hit.id);
      if (panel) {
        const first = panel.points[0];
        dragState = { type: 'panel', id: panel.id, offset: { x: worldHit.x - first.x, y: worldHit.y - first.y } };
      }
    }
    if (hit.type === 'barrier') {
      const barrier = scene.barriers.find((item) => item.id === hit.id);
      if (barrier) {
        dragState = { type: 'barrier', id: barrier.id, offset: { x: worldHit.x - barrier.p1.x, y: worldHit.y - barrier.p1.y } };
      }
    }
    if (hit.type === 'building') {
      const building = scene.buildings.find((item) => item.id === hit.id);
      if (building) {
        dragState = { type: 'building', id: building.id, offset: { x: worldHit.x - building.x, y: worldHit.y - building.y } };
      }
    }
  } else {
    if (activeTool === 'select') {
      if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd + click drag starts select box
        dragState = {
          type: 'select-box',
          startCanvasPoint: canvasPoint,
          currentCanvasPoint: canvasPoint,
        };
        requestRender();
      } else {
        setSelection({ type: 'none' });
        panState = { start: canvasPoint, origin: { ...panOffset } };
      }
    } else {
      setSelection({ type: 'none' });
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
  if (dragState?.type === 'select-box') {
    const selected = getElementsInSelectBox(dragState.startCanvasPoint, dragState.currentCanvasPoint);
    setSelection(itemsToSelection(selected));
    dragState = null;
    requestRender();
    return;
  }
  if (dragState) {
    const finishedDrag = dragState;
    throttledDragMove.flush();
    throttledDragMove.cancel();
    const shouldRecalculateMap = shouldLiveUpdateMap(finishedDrag);
    dragState = null;
    setInteractionActive(false);
    // Ensure a crisp final map after drag updates and clear queued low-res work.
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

    if ((event.metaKey || event.ctrlKey) && (event.key === 'a' || event.key === 'A')) {
      event.preventDefault();
      selectAll();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && (event.key === 'd' || event.key === 'D')) {
      event.preventDefault();
      if (selection.type !== 'none') {
        duplicateMultiSelection();
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
    if (event.key === 'p' || event.key === 'P') {
      setActiveTool('add-probe');
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
    const data = probeResults.get(probe.id);
    if (!data) return;
    const probeName = probe.name || `Probe ${probe.id.toUpperCase()}`;
    createProbeSnapshot(cloneProbeData(data), probeName, { x: probe.x, y: probe.y });
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
      currentTracedPaths = null;
      if (rayVizPaths) rayVizPaths.innerHTML = '';
      if (rayVizPhaseInfo) rayVizPhaseInfo.innerHTML = '';
      if (rayVizDominant) rayVizDominant.innerHTML = '';
      requestRender();
    }
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
    probes: scene.probes.map((probe) => ({ ...probe })),
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
  scene.probes = (payload.probes ?? []).map((probe) => ({
    ...probe,
    z: probe.z ?? PROBE_DEFAULT_Z,
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
  probeSeq = nextSequence('pr', scene.probes);
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
  activeProbeId = null;
  probeResults.clear();
  probePending.clear();
  clearPinnedProbes();
  if (payload.propagation) {
    updatePropagationConfig(payload.propagation);
    updatePropagationControls();
  }
  if (sceneNameInput) {
    sceneNameInput.value = payload.name || 'Untitled';
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
  // Re-render KaTeX equations now that modal is visible
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(aboutModal, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    });
  }
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

  // Wire collapsible physics sections
  wireCollapsibleSections();

  // Wire author modal
  wireAuthorModal();
}

function openAuthor() {
  if (!authorModal) return;
  authorModal.classList.add('is-open');
  authorModal.setAttribute('aria-hidden', 'false');
}

function closeAuthor() {
  if (!authorModal) return;
  authorModal.classList.remove('is-open');
  authorModal.setAttribute('aria-hidden', 'true');
}

function wireAuthorModal() {
  if (!authorModal) return;
  authorButton?.addEventListener('click', () => openAuthor());
  authorClose?.addEventListener('click', () => closeAuthor());
  authorModal.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-modal-close]')) {
      closeAuthor();
    }
  });
}

/**
 * Sets up collapsible accordion sections in the About modal.
 * Each section can be expanded/collapsed by clicking its header.
 */
function wireCollapsibleSections() {
  const collapsibleSections = document.querySelectorAll<HTMLElement>('[data-collapsible]');
  const expandAllBtn = document.getElementById('expandAllBtn') as HTMLButtonElement | null;

  if (!collapsibleSections.length) return;

  // Toggle individual section
  collapsibleSections.forEach((section) => {
    const header = section.querySelector('.collapsible-header');
    if (!header) return;

    header.addEventListener('click', () => {
      toggleCollapsibleSection(section);
    });

    // Keyboard support
    header.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        toggleCollapsibleSection(section);
      }
    });
  });

  // Expand all / collapse all button
  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', () => {
      const allOpen = Array.from(collapsibleSections).every((s) => s.classList.contains('is-open'));

      if (allOpen) {
        // Collapse all
        collapsibleSections.forEach((section) => {
          section.classList.remove('is-open');
          updateCollapsibleAria(section, false);
        });
        expandAllBtn.textContent = 'expand all';
      } else {
        // Expand all
        collapsibleSections.forEach((section) => {
          section.classList.add('is-open');
          updateCollapsibleAria(section, true);
        });
        expandAllBtn.textContent = 'collapse all';
      }
    });
  }
}

function toggleCollapsibleSection(section: HTMLElement) {
  const isOpen = section.classList.contains('is-open');
  section.classList.toggle('is-open', !isOpen);
  updateCollapsibleAria(section, !isOpen);

  // Update expand all button text if needed
  const expandAllBtn = document.getElementById('expandAllBtn') as HTMLButtonElement | null;
  if (expandAllBtn) {
    const collapsibleSections = document.querySelectorAll<HTMLElement>('[data-collapsible]');
    const allOpen = Array.from(collapsibleSections).every((s) => s.classList.contains('is-open'));
    expandAllBtn.textContent = allOpen ? 'collapse all' : 'expand all';
  }
}

function updateCollapsibleAria(section: HTMLElement, isOpen: boolean) {
  const header = section.querySelector('.collapsible-header');
  if (header) {
    header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
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
  // Mixed Ground Model dropdown: only visible when ground reflection is enabled AND ground type is "mixed"
  const mixedModelVisible = groundEnabled && current.groundType === 'mixed';
  if (propagationGroundMixedSigmaModel) {
    propagationGroundMixedSigmaModel.value = current.groundMixedSigmaModel ?? 'iso9613';
    propagationGroundMixedSigmaModel.disabled = !mixedModelVisible;
  }
  if (propagationGroundMixedSigmaModelRow) {
    propagationGroundMixedSigmaModelRow.classList.toggle('is-hidden', !mixedModelVisible);
  }
  if (propagationMaxDistance) propagationMaxDistance.value = current.maxDistance.toString();
  if (propagationBarrierSideDiffraction) {
    propagationBarrierSideDiffraction.value = current.barrierSideDiffraction ?? 'auto';
  }
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

  propagationBarrierSideDiffraction?.addEventListener('change', () => {
    updatePropagationConfig({ barrierSideDiffraction: propagationBarrierSideDiffraction.value as PropagationConfig['barrierSideDiffraction'] });
    markDirty();
    computeScene();
  });

  // ================================================================
  // Calculation Profile Selector Logic
  // ================================================================

  type CalculationProfile = 'iso9613' | 'accurate' | 'custom';

  // Profile definitions
  interface ProfileSettings {
    spreadingLoss: string;
    groundType: string;
    groundReflection: boolean;
    groundModel: string;
    groundMixedSigmaModel: string;
    barrierSideDiffraction: string;
    atmosphericAbsorption: string;
  }

  const ISO9613_PROFILE: ProfileSettings = {
    spreadingLoss: 'spherical',
    groundType: 'mixed',
    groundReflection: true,
    groundModel: 'legacy',            // ISO 9613-2 tables
    groundMixedSigmaModel: 'iso9613', // Linear interpolation
    barrierSideDiffraction: 'off',    // ISO assumes infinite barriers (over-top only)
    atmosphericAbsorption: 'iso9613'
  };

  const ACCURATE_PROFILE: ProfileSettings = {
    spreadingLoss: 'spherical',
    groundType: 'mixed',
    groundReflection: true,
    groundModel: 'twoRayPhasor',      // Full wave interference
    groundMixedSigmaModel: 'logarithmic', // More physically accurate
    barrierSideDiffraction: 'auto',   // Side diffraction for finite barriers
    atmosphericAbsorption: 'iso9613'
  };

  let currentProfile: CalculationProfile = 'accurate';

  function updateProfileIndicator(profile: CalculationProfile) {
    if (!settingsProfileIndicator) return;

    switch (profile) {
      case 'iso9613':
        settingsProfileIndicator.textContent = 'iso 9613-2:1996';
        settingsProfileIndicator.classList.remove('is-custom');
        break;
      case 'accurate':
        settingsProfileIndicator.textContent = 'physically accurate';
        settingsProfileIndicator.classList.remove('is-custom');
        break;
      case 'custom':
        settingsProfileIndicator.textContent = 'custom';
        settingsProfileIndicator.classList.add('is-custom');
        break;
    }
  }

  function updateProfileDropdown(profile: CalculationProfile) {
    if (!calculationProfile) return;

    // Update dropdown value
    calculationProfile.value = profile;

    // Enable/disable Custom option based on current profile
    const customOption = calculationProfile.querySelector('option[value="custom"]') as HTMLOptionElement | null;
    if (customOption) {
      customOption.disabled = profile !== 'custom';
    }
  }

  function applyProfile(profile: ProfileSettings) {
    // Update DOM elements
    if (propagationSpreading) propagationSpreading.value = profile.spreadingLoss;
    if (propagationGroundType) propagationGroundType.value = profile.groundType;
    if (propagationGroundReflection) propagationGroundReflection.checked = profile.groundReflection;
    if (propagationGroundModel) propagationGroundModel.value = profile.groundModel;
    if (propagationGroundMixedSigmaModel) propagationGroundMixedSigmaModel.value = profile.groundMixedSigmaModel;
    if (propagationBarrierSideDiffraction) propagationBarrierSideDiffraction.value = profile.barrierSideDiffraction;
    if (propagationAbsorption) propagationAbsorption.value = profile.atmosphericAbsorption;

    // Update propagation config
    updatePropagationConfig({
      spreading: profile.spreadingLoss as PropagationConfig['spreading'],
      groundType: profile.groundType as PropagationConfig['groundType'],
      groundReflection: profile.groundReflection,
      groundModel: profile.groundModel as PropagationConfig['groundModel'],
      groundMixedSigmaModel: profile.groundMixedSigmaModel as PropagationConfig['groundMixedSigmaModel'],
      barrierSideDiffraction: profile.barrierSideDiffraction as PropagationConfig['barrierSideDiffraction'],
      atmosphericAbsorption: profile.atmosphericAbsorption as PropagationConfig['atmosphericAbsorption']
    });

    // Update all controls UI
    updatePropagationControls();

    // Update all equation displays to match new dropdown values
    updateAllEquations();

    // Recalculate scene with new settings
    markDirty();
    computeScene();
  }

  function getCurrentSettingsAsProfile(): ProfileSettings {
    return {
      spreadingLoss: propagationSpreading?.value ?? 'spherical',
      groundType: propagationGroundType?.value ?? 'mixed',
      groundReflection: propagationGroundReflection?.checked ?? true,
      groundModel: propagationGroundModel?.value ?? 'twoRayPhasor',
      groundMixedSigmaModel: propagationGroundMixedSigmaModel?.value ?? 'logarithmic',
      barrierSideDiffraction: propagationBarrierSideDiffraction?.value ?? 'auto',
      atmosphericAbsorption: propagationAbsorption?.value ?? 'iso9613'
    };
  }

  function settingsMatchProfile(current: ProfileSettings, target: ProfileSettings): boolean {
    return (
      current.spreadingLoss === target.spreadingLoss &&
      current.groundType === target.groundType &&
      current.groundReflection === target.groundReflection &&
      current.groundModel === target.groundModel &&
      current.groundMixedSigmaModel === target.groundMixedSigmaModel &&
      current.barrierSideDiffraction === target.barrierSideDiffraction &&
      current.atmosphericAbsorption === target.atmosphericAbsorption
    );
  }

  function detectCurrentProfile(): CalculationProfile {
    const current = getCurrentSettingsAsProfile();

    if (settingsMatchProfile(current, ISO9613_PROFILE)) return 'iso9613';
    if (settingsMatchProfile(current, ACCURATE_PROFILE)) return 'accurate';
    return 'custom';
  }

  function updateProfileFromSettings() {
    currentProfile = detectCurrentProfile();
    updateProfileDropdown(currentProfile);
    updateProfileIndicator(currentProfile);
  }

  // Wire up profile dropdown change
  calculationProfile?.addEventListener('change', () => {
    const selectedProfile = calculationProfile.value as CalculationProfile;

    if (selectedProfile === 'iso9613') {
      currentProfile = 'iso9613';
      applyProfile(ISO9613_PROFILE);
    } else if (selectedProfile === 'accurate') {
      currentProfile = 'accurate';
      applyProfile(ACCURATE_PROFILE);
    }
    // Custom is not selectable manually - it's auto-detected

    updateProfileDropdown(currentProfile);
    updateProfileIndicator(currentProfile);
    markDirty();
    computeScene();
  });

  // Hook into all physics setting changes to detect when profile should switch to Custom
  const profileAffectingControls = [
    propagationSpreading,
    propagationGroundType,
    propagationGroundReflection,
    propagationGroundModel,
    propagationGroundMixedSigmaModel,
    propagationBarrierSideDiffraction,
    propagationAbsorption
  ];

  for (const control of profileAffectingControls) {
    if (control) {
      control.addEventListener('change', () => {
        // Use setTimeout to ensure the change is processed first
        setTimeout(() => updateProfileFromSettings(), 0);
      });
    }
  }

  // Initialize profile state on load
  updateProfileFromSettings();

  // Environmental conditions (meteo) controls
  meteoTemperature?.addEventListener('change', () => {
    const next = Number(meteoTemperature.value);
    if (!Number.isFinite(next)) {
      meteoTemperature.value = String(meteoState.temperature);
      return;
    }
    meteoState.temperature = Math.max(-10, Math.min(40, next));
    meteoTemperature.value = String(meteoState.temperature);
    updateSpeedOfSoundDisplay();
    markDirty();
    computeScene();
  });

  meteoHumidity?.addEventListener('change', () => {
    const next = Number(meteoHumidity.value);
    if (!Number.isFinite(next)) {
      meteoHumidity.value = String(meteoState.humidity);
      return;
    }
    meteoState.humidity = Math.max(10, Math.min(100, next));
    meteoHumidity.value = String(meteoState.humidity);
    markDirty();
    computeScene();
  });

  meteoPressure?.addEventListener('change', () => {
    const next = Number(meteoPressure.value);
    if (!Number.isFinite(next)) {
      meteoPressure.value = String(meteoState.pressure);
      return;
    }
    meteoState.pressure = Math.max(95, Math.min(108, next));
    meteoPressure.value = String(meteoState.pressure.toFixed(3));
    markDirty();
    computeScene();
  });

  // Initialize speed of sound display
  updateSpeedOfSoundDisplay();
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
  // Pin the initial demo probe so users see the frequency response immediately
  if (scene.probes.length > 0) {
    pinProbe(scene.probes[0].id);
  }
  // Initial map uses high resolution with maximum point cap for a good first impression
  void computeNoiseMapInternal({ resolutionPx: RES_HIGH, maxPoints: REFINE_POINTS, silent: true, requestId: 'grid:init' });
  window.addEventListener('resize', resizeCanvas);
}

init();
