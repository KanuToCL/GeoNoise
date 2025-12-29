import {
  detectWebGPU,
  loadPreference,
  resolveBackend,
  savePreference,
  type ComputePreference,
} from './computePreference.js';
import { engineCompute } from '@geonoise/engine-backends';
import { createEmptyScene, type EngineConfig, type PropagationConfig } from '@geonoise/core';
import { getDefaultEngineConfig, type ComputePanelResponse, type ComputeReceiversResponse } from '@geonoise/engine';
import { panelId, MIN_LEVEL } from '@geonoise/shared';
import { buildCsv } from './export.js';
import type { SceneResults, PanelResult } from './export.js';
import { formatLevel, formatMeters } from './format.js';

type Point = { x: number; y: number };

type Source = {
  id: string;
  x: number;
  y: number;
  z: number;
  power: number;
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


type Tool = 'select' | 'add-source' | 'add-receiver' | 'add-panel' | 'measure' | 'delete';

type Selection =
  | { type: 'none' }
  | { type: 'source'; id: string }
  | { type: 'receiver'; id: string }
  | { type: 'panel'; id: string };

type DragState =
  | null
  | {
      type: 'source' | 'receiver' | 'panel';
      id: string;
      offset: Point;
    }
  | {
      type: 'panel-vertex';
      id: string;
      index: number;
      offset: Point;
    };

type DragContribution = {
  sourceId: string;
  receiverEnergy: Map<string, number>;
  panelEnergy: Map<string, Float64Array>;
};

const canvasEl = document.querySelector<HTMLCanvasElement>('#mapCanvas');
const coordLabel = document.querySelector('#coordLabel') as HTMLDivElement | null;
const layerLabel = document.querySelector('#layerLabel') as HTMLDivElement | null;
const statusPill = document.querySelector('#statusPill') as HTMLDivElement | null;
const computeStatus = document.querySelector('#computeStatus') as HTMLDivElement | null;
const rulerLabel = document.querySelector('#rulerLabel') as HTMLDivElement | null;
const rulerLine = document.querySelector('#rulerLine') as HTMLDivElement | null;
const scaleText = document.querySelector('#scaleText') as HTMLDivElement | null;
const scaleLine = document.querySelector('#scaleLine') as HTMLDivElement | null;
const preferenceSelect = document.querySelector('#computePreference') as HTMLSelectElement | null;
const toolGrid = document.querySelector('#toolGrid') as HTMLDivElement | null;
const selectionLabel = document.querySelector('#selectionLabel') as HTMLSpanElement | null;
const modeLabel = document.querySelector('#modeLabel') as HTMLSpanElement | null;
const propertiesBody = document.querySelector('#propertiesBody') as HTMLDivElement | null;
const sourceTable = document.querySelector('#sourceTable') as HTMLDivElement | null;
const receiverTable = document.querySelector('#receiverTable') as HTMLDivElement | null;
const panelStats = document.querySelector('#panelStats') as HTMLDivElement | null;
const panelLegend = document.querySelector('#panelLegend') as HTMLDivElement | null;
const exportCsv = document.querySelector('#exportCsv') as HTMLButtonElement | null;

const aboutButton = document.querySelector('#aboutButton') as HTMLButtonElement | null;
const aboutModal = document.querySelector('#aboutModal') as HTMLDivElement | null;
const aboutClose = document.querySelector('#aboutClose') as HTMLButtonElement | null;

const propagationSpreading = document.querySelector('#propagationSpreading') as HTMLSelectElement | null;
const propagationAbsorption = document.querySelector('#propagationAbsorption') as HTMLSelectElement | null;
const propagationGroundReflection = document.querySelector('#propagationGroundReflection') as HTMLInputElement | null;
const propagationGroundType = document.querySelector('#propagationGroundType') as HTMLSelectElement | null;
const propagationMaxDistance = document.querySelector('#propagationMaxDistance') as HTMLInputElement | null;

const layerSources = document.querySelector('#layerSources') as HTMLInputElement | null;
const layerReceivers = document.querySelector('#layerReceivers') as HTMLInputElement | null;
const layerPanels = document.querySelector('#layerPanels') as HTMLInputElement | null;
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
    { id: 's1', x: -40, y: 10, z: 1.5, power: 100 },
    { id: 's2', x: 60, y: -20, z: 1.5, power: 94 },
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
};

const layers = {
  sources: true,
  receivers: true,
  panels: true,
  grid: false,
};

let pixelsPerMeter = 3;
let activeTool: Tool = 'select';
let selection: Selection = { type: 'none' };
let dragState: DragState = null;
let measureStart: Point | null = null;
let measureEnd: Point | null = null;
let measureLocked = false;
let lastComputeAt = 0;
let results: SceneResults = { receivers: [], panels: [] };
let receiverEnergyTotals = new Map<string, number>();
let panelEnergyTotals = new Map<string, Float64Array>();
let dragContribution: DragContribution | null = null;
let engineConfig: EngineConfig = getDefaultEngineConfig('festival_fast');
let aboutOpen = false;

let sourceSeq = 3;
let receiverSeq = 3;
let panelSeq = 2;

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

function updateCounts() {
  if (countSources) countSources.textContent = `${scene.sources.length}`;
  if (countReceivers) countReceivers.textContent = `${scene.receivers.length}`;
  if (countPanels) countPanels.textContent = `${scene.panels.length}`;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  pixelsPerMeter = rect.width / 320;
  updateScaleBar();
  drawScene();
}

function updateScaleBar() {
  if (!scaleLine || !scaleText || !rulerLabel || !rulerLine) return;
  const linePixels = 120;
  const meters = niceDistance(linePixels / pixelsPerMeter);
  const pixels = meters * pixelsPerMeter;

  scaleLine.style.width = `${pixels}px`;
  scaleText.textContent = `${meters} m`;

  rulerLine.style.width = `${pixels}px`;
  rulerLabel.textContent = `${meters} m`;
}

function worldToCanvas(point: Point): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.width / 2 + point.x * pixelsPerMeter,
    y: rect.height / 2 - point.y * pixelsPerMeter,
  };
}

function canvasToWorld(point: Point): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (point.x - rect.width / 2) / pixelsPerMeter,
    y: -(point.y - rect.height / 2) / pixelsPerMeter,
  };
}

function distance(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
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
  return 'None';
}

function toolLabel(tool: Tool) {
  switch (tool) {
    case 'add-panel':
      return 'Add Measure Grid';
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

const layerLabels: Record<keyof typeof layers, string> = {
  sources: 'Sources',
  receivers: 'Receivers',
  panels: 'Measure Grids',
  grid: 'Grid',
};

function getComputePreference(): ComputePreference {
  if (preferenceSelect) return preferenceSelect.value as ComputePreference;
  return loadPreference();
}

function buildEngineScene() {
  const engineScene = createEmptyScene(origin, 'UI Scene');

  engineScene.sources = scene.sources.map((source) => ({
    id: source.id,
    type: 'point',
    name: `Source ${source.id.toUpperCase()}`,
    position: { x: source.x, y: source.y, z: source.z },
    soundPowerLevel: source.power,
    enabled: true,
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

  return engineScene;
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
  if (!statusPill) return;
  const timing = meta.timings?.totalMs;
  const timingLabel = typeof timing === 'number' ? `${timing.toFixed(1)} ms` : 'n/a';
  const warnings = meta.warnings?.length ?? 0;
  const warningLabel = warnings ? ` • ${warnings} warning${warnings === 1 ? '' : 's'}` : '';
  statusPill.textContent = `${meta.backendId} • ${timingLabel}${warningLabel}`;
}

function isStaleError(error: unknown) {
  return error instanceof Error && error.message === 'stale';
}

function showComputeError(label: string, error: unknown) {
  if (statusPill) statusPill.textContent = `${label} compute error`;
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

async function computeReceivers(engineScene: ReturnType<typeof buildEngineScene>, preference: ComputePreference) {
  try {
    const response = (await engineCompute(
      { kind: 'receivers', scene: engineScene, payload: {}, engineConfig },
      preference,
      'receivers'
    )) as ComputeReceiversResponse;
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
    drawScene();
  } catch (error) {
    if (isStaleError(error)) return;
    showComputeError('Receivers', error);
  }
}

async function computePanel(
  engineScene: ReturnType<typeof buildEngineScene>,
  preference: ComputePreference,
  panel: Panel
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
    drawScene();
  } catch (error) {
    if (isStaleError(error)) return;
    showComputeError(`Panel ${panel.id}`, error);
  }
}

function computeScene() {
  pruneResults();
  renderResults();
  drawScene();
  dragContribution = null;
  receiverEnergyTotals = new Map();
  panelEnergyTotals = new Map();

  if (statusPill) statusPill.textContent = 'Computing...';
  const preference = getComputePreference();
  const engineScene = buildEngineScene();

  void computeReceivers(engineScene, preference);
  for (const panel of scene.panels) {
    void computePanel(engineScene, preference, panel);
  }
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
      drawScene();
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
      drawScene();
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

function createInlineField(label: string, value: number, onChange: (value: number) => void) {
  const field = document.createElement('label');
  field.className = 'source-field';
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
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
    const header = document.createElement('div');
    header.className = 'source-row-header';
    header.innerHTML = `<strong>${source.id.toUpperCase()}</strong>`;
    row.appendChild(header);

    const fields = document.createElement('div');
    fields.className = 'source-fields';
    fields.appendChild(createInlineField('Power (dB)', source.power, (value) => {
      source.power = value;
      renderProperties();
      computeScene();
    }));
    fields.appendChild(createInlineField('Height (m)', source.z, (value) => {
      source.z = value;
      renderProperties();
      computeScene();
    }));
    row.appendChild(fields);

    row.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).tagName === 'INPUT') return;
      setSelection({ type: 'source', id: source.id });
    });

    sourceTable.appendChild(row);
  }
}

function createId(prefix: string, seq: number) {
  return `${prefix}${seq}`;
}

function setActiveTool(tool: Tool) {
  activeTool = tool;
  if (modeLabel) {
    modeLabel.textContent = toolLabel(tool);
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
  const current = selection;
  if (selectionLabel) {
    selectionLabel.textContent = current.type === 'none' ? 'None' : `${selectionTypeLabel(current.type)} ${current.id}`;
  }
  renderProperties();
  renderPanelLegend();
  renderPanelStats();
  drawScene();
}

function renderProperties() {
  if (!propertiesBody) return;
  propertiesBody.innerHTML = '';
  const current = selection;

  if (current.type === 'none') {
    propertiesBody.textContent = 'Select an item to edit its properties.';
    return;
  }

  const header = document.createElement('div');
  header.textContent = `Editing ${selectionTypeLabel(current.type)} ${current.id}`;
  propertiesBody.appendChild(header);

  if (current.type === 'source') {
    const source = scene.sources.find((item) => item.id === current.id);
    if (!source) return;
    propertiesBody.appendChild(createInputRow('Height (m)', source.z, (value) => {
      source.z = value;
      computeScene();
    }));
    propertiesBody.appendChild(createInputRow('Power (dB)', source.power, (value) => {
      source.power = value;
      computeScene();
    }));
  }

  if (current.type === 'receiver') {
    const receiver = scene.receivers.find((item) => item.id === current.id);
    if (!receiver) return;
    propertiesBody.appendChild(createInputRow('Height (m)', receiver.z, (value) => {
      receiver.z = value;
      computeScene();
    }));
  }

  if (current.type === 'panel') {
    const panel = scene.panels.find((item) => item.id === current.id);
    if (!panel) return;
    propertiesBody.appendChild(createInputRow('Elevation (m)', panel.elevation, (value) => {
      panel.elevation = value;
      computeScene();
    }));
    propertiesBody.appendChild(createInputRow('Sampling (m)', panel.sampling.resolution, (value) => {
      panel.sampling.resolution = Math.max(1, value);
      computeScene();
    }));
    const hint = document.createElement('div');
    hint.className = 'property-hint';
    hint.textContent = 'Drag corner handles on the measure grid to reshape.';
    propertiesBody.appendChild(hint);
  }
}

function createInputRow(label: string, value: number, onChange: (value: number) => void) {
  const row = document.createElement('div');
  row.className = 'property-row';
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value.toString();
  input.addEventListener('change', () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onChange(next);
  });
  row.appendChild(name);
  row.appendChild(input);
  return row;
}

function updateComputeStatus(preference: ComputePreference) {
  if (!computeStatus) return;
  const resolved = resolveBackend(preference, capability);
  const label = `Using ${resolved.effective.toUpperCase()}`;
  if (resolved.warning) {
    computeStatus.textContent = `${label} - ${resolved.warning}`;
    computeStatus.dataset.warning = 'true';
  } else {
    computeStatus.textContent = label;
    delete computeStatus.dataset.warning;
  }
}

function wirePreference() {
  if (!preferenceSelect) return;
  const initialPreference = loadPreference();
  preferenceSelect.value = initialPreference;
  updateComputeStatus(initialPreference);

  preferenceSelect.addEventListener('change', () => {
    const preference = preferenceSelect.value as ComputePreference;
    savePreference(preference);
    updateComputeStatus(preference);
    computeScene();
  });
}

function wireLayerToggle(input: HTMLInputElement | null, key: keyof typeof layers) {
  if (!input) return;
  input.addEventListener('change', () => {
    layers[key] = input.checked;
    if (layerLabel && input.checked) {
      layerLabel.textContent = layerLabels[key];
    }
    drawScene();
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

  const world = canvasToWorld(point);
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
  setSelection({ type: 'none' });
  updateCounts();
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
  computeScene();
}

function addSourceAt(point: Point) {
  const source: Source = {
    id: createId('s', sourceSeq++),
    x: point.x,
    y: point.y,
    z: 1.5,
    power: 100,
  };
  scene.sources.push(source);
  setSelection({ type: 'source', id: source.id });
  updateCounts();
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
  computeScene();
}

function drawGrid() {
  const rect = canvas.getBoundingClientRect();
  const stepMeters = 20;
  const stepPixels = stepMeters * pixelsPerMeter;

  ctx.strokeStyle = 'rgba(38, 70, 83, 0.12)';
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

function drawMeasurement() {
  if (!measureStart || !measureEnd) return;
  const start = worldToCanvas(measureStart);
  const end = worldToCanvas(measureEnd);
  const dist = distance(measureStart, measureEnd);

  ctx.strokeStyle = '#264653';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const label = `${formatMeters(dist)} m`;
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  ctx.fillStyle = '#264653';
  ctx.font = '12px "Space Grotesk", sans-serif';
  ctx.fillText(label, mid.x + 6, mid.y - 6);
}

function drawPanelSamples(panelResult: PanelResult) {
  if (!layers.panels) return;
  const min = panelResult.LAeq_min;
  const max = panelResult.LAeq_max;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(31, 28, 24, 0.2)';
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
  ctx.strokeStyle = '#264653';
  ctx.fillStyle = 'rgba(38, 70, 83, 0.12)';
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
      ctx.strokeStyle = '#e76f51';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = '#264653';
      ctx.lineWidth = 2;

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#264653';
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

function drawSources() {
  ctx.fillStyle = '#e76f51';
  ctx.strokeStyle = '#aa4e37';
  ctx.lineWidth = 2;

  for (const source of scene.sources) {
    const p = worldToCanvas(source);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (selection.type === 'source' && selection.id === source.id) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#aa4e37';
      ctx.lineWidth = 2;
    }

    ctx.fillStyle = '#1f1c18';
    ctx.font = '12px "Space Grotesk", sans-serif';
    ctx.fillText(source.id.toUpperCase(), p.x + 14, p.y - 6);
    ctx.fillStyle = '#e76f51';
  }
}

function drawReceivers() {
  ctx.fillStyle = '#2a9d8f';
  ctx.strokeStyle = '#1f6f65';
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
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#1f6f65';
      ctx.lineWidth = 2;
    }

    ctx.fillStyle = '#1f1c18';
    ctx.font = '12px "Space Grotesk", sans-serif';
    ctx.fillText(receiver.id.toUpperCase(), p.x + 14, p.y + 4);
    ctx.fillStyle = '#2a9d8f';
  }
}

function drawReceiverBadges() {
  const map = new Map(results.receivers.map((item) => [item.id, item]));
  for (const receiver of scene.receivers) {
    const result = map.get(receiver.id);
    if (!result) continue;
    const p = worldToCanvas(receiver);
    const label = `${formatLevel(result.LAeq)} dB`;
    ctx.font = '12px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.strokeStyle = 'rgba(31, 28, 24, 0.25)';
    ctx.lineWidth = 1;
    const width = ctx.measureText(label).width + 14;
    ctx.fillRect(p.x + 12, p.y + 14, width, 20);
    ctx.strokeRect(p.x + 12, p.y + 14, width, 20);
    ctx.fillStyle = '#1f1c18';
    ctx.fillText(label, p.x + 18, p.y + 28);
  }
}

function drawScene() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = '#fdfaf5';
  ctx.fillRect(0, 0, rect.width, rect.height);

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

function handlePointerMove(event: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const worldPoint = canvasToWorld(canvasPoint);

  if (coordLabel) {
    coordLabel.textContent = `x: ${formatMeters(worldPoint.x)} m, y: ${formatMeters(worldPoint.y)} m`;
  }

  if (dragState) {
    const activeDrag = dragState;
    const targetPoint = {
      x: worldPoint.x - activeDrag.offset.x,
      y: worldPoint.y - activeDrag.offset.y,
    };
    if (activeDrag.type === 'source') {
      const source = scene.sources.find((item) => item.id === activeDrag.id);
      if (source) {
        source.x = targetPoint.x;
        source.y = targetPoint.y;
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
    if (activeDrag.type === 'panel-vertex') {
      const panel = scene.panels.find((item) => item.id === activeDrag.id);
      if (panel && panel.points[activeDrag.index]) {
        panel.points[activeDrag.index] = { x: targetPoint.x, y: targetPoint.y };
      }
    }

    const now = performance.now();
    if (now - lastComputeAt > 120) {
      lastComputeAt = now;
      if (activeDrag.type === 'source') {
        computeSceneIncremental(activeDrag.id);
      } else {
        computeScene();
      }
    } else {
      drawScene();
    }
  }

  if (activeTool === 'measure' && measureStart && !measureLocked) {
    measureEnd = worldPoint;
    drawScene();
  }
}

function handlePointerDown(event: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const worldPoint = canvasToWorld(canvasPoint);

  if (activeTool === 'add-source') {
    addSourceAt(worldPoint);
    return;
  }

  if (activeTool === 'add-receiver') {
    addReceiverAt(worldPoint);
    return;
  }

  if (activeTool === 'add-panel') {
    addPanelAt(worldPoint);
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
    drawScene();
    return;
  }

  if (activeTool === 'select') {
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
    if (hit.type === 'source') {
      const source = scene.sources.find((item) => item.id === hit.id);
      if (source) {
        dragState = { type: 'source', id: source.id, offset: { x: worldHit.x - source.x, y: worldHit.y - source.y } };
        primeDragContribution(source.id);
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
  } else {
    setSelection({ type: 'none' });
  }
}

function handlePointerUp() {
  if (dragState) {
    dragState = null;
    computeScene();
  }
}

function wirePointer() {
  canvas.addEventListener('mousemove', handlePointerMove);
  canvas.addEventListener('mousedown', handlePointerDown);
  window.addEventListener('mouseup', handlePointerUp);
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

    if (event.key === 'Escape') {
      setSelection({ type: 'none' });
      measureStart = null;
      measureEnd = null;
      measureLocked = false;
      drawScene();
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selection.type !== 'none') {
        deleteSelection(selection);
      }
    }
  });
}

function wireExport() {
  if (!exportCsv) return;
  exportCsv.addEventListener('click', () => downloadCsv());
}

function openAbout() {
  if (!aboutModal) return;
  aboutOpen = true;
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
  aboutModal.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-modal-close]')) {
      closeAbout();
    }
  });
}

function updatePropagationControls() {
  const current = getPropagationConfig();
  if (propagationSpreading) propagationSpreading.value = current.spreading;
  if (propagationAbsorption) propagationAbsorption.value = current.atmosphericAbsorption;
  if (propagationGroundReflection) propagationGroundReflection.checked = current.groundReflection;
  if (propagationGroundType) {
    propagationGroundType.value = current.groundType;
    propagationGroundType.disabled = !current.groundReflection;
  }
  if (propagationMaxDistance) propagationMaxDistance.value = current.maxDistance.toString();
}

function wirePropagationControls() {
  if (!propagationSpreading && !propagationAbsorption && !propagationGroundReflection && !propagationGroundType && !propagationMaxDistance) {
    return;
  }

  updatePropagationControls();

  propagationSpreading?.addEventListener('change', () => {
    updatePropagationConfig({ spreading: propagationSpreading.value as PropagationConfig['spreading'] });
    computeScene();
  });

  propagationAbsorption?.addEventListener('change', () => {
    updatePropagationConfig({ atmosphericAbsorption: propagationAbsorption.value as PropagationConfig['atmosphericAbsorption'] });
    computeScene();
  });

  propagationGroundReflection?.addEventListener('change', () => {
    updatePropagationConfig({ groundReflection: propagationGroundReflection.checked });
    updatePropagationControls();
    computeScene();
  });

  propagationGroundType?.addEventListener('change', () => {
    updatePropagationConfig({ groundType: propagationGroundType.value as PropagationConfig['groundType'] });
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
    computeScene();
  });
}

function init() {
  updateCounts();
  wireLayerToggle(layerSources, 'sources');
  wireLayerToggle(layerReceivers, 'receivers');
  wireLayerToggle(layerPanels, 'panels');
  wireLayerToggle(layerGrid, 'grid');
  wirePreference();
  wireTools();
  wirePointer();
  wireKeyboard();
  wireExport();
  wireAbout();
  wirePropagationControls();

  resizeCanvas();
  computeScene();
  window.addEventListener('resize', resizeCanvas);
}

init();
