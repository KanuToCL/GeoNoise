import {
  detectWebGPU,
  loadPreference,
  resolveBackend,
  savePreference,
  type ComputePreference,
} from './computePreference.js';
import { buildCsv } from './export.js';
import type { SceneResults, ReceiverResult, PanelResult, PanelSample } from './export.js';
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
    };

const canvas = document.querySelector('#mapCanvas') as HTMLCanvasElement | null;
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
const receiverTable = document.querySelector('#receiverTable') as HTMLDivElement | null;
const panelStats = document.querySelector('#panelStats') as HTMLDivElement | null;
const exportCsv = document.querySelector('#exportCsv') as HTMLButtonElement | null;

const layerSources = document.querySelector('#layerSources') as HTMLInputElement | null;
const layerReceivers = document.querySelector('#layerReceivers') as HTMLInputElement | null;
const layerPanels = document.querySelector('#layerPanels') as HTMLInputElement | null;
const layerGrid = document.querySelector('#layerGrid') as HTMLInputElement | null;

const countSources = document.querySelector('#countSources') as HTMLSpanElement | null;
const countReceivers = document.querySelector('#countReceivers') as HTMLSpanElement | null;
const countPanels = document.querySelector('#countPanels') as HTMLSpanElement | null;

if (!canvas) {
  throw new Error('Canvas element missing');
}

const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('Canvas context missing');
}

const capability = detectWebGPU();

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
let lastComputeAt = 0;
let results: SceneResults = { receivers: [], panels: [] };

let sourceSeq = 3;
let receiverSeq = 3;
let panelSeq = 2;

const MIN_LEVEL = -120;

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

function sumDecibels(levels: number[]) {
  if (!levels.length) return MIN_LEVEL;
  const sum = levels.reduce((acc, level) => acc + Math.pow(10, level / 10), 0);
  return 10 * Math.log10(sum);
}

function computeSPL(source: Source, point: { x: number; y: number; z: number }) {
  const dx = source.x - point.x;
  const dy = source.y - point.y;
  const dz = source.z - point.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const safeDistance = Math.max(dist, 1);
  const attenuation = 20 * Math.log10(safeDistance) + 11;
  const level = source.power - attenuation;
  return Math.max(level, MIN_LEVEL);
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return MIN_LEVEL;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return sorted[idx];
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

function polygonBounds(points: Point[]) {
  const xs = points.map((pt) => pt.x);
  const ys = points.map((pt) => pt.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function samplePolygon(points: Point[], resolution: number, cap: number, elevation: number): PanelSample[] {
  if (points.length < 3) return [];
  const bounds = polygonBounds(points);
  const samples: PanelSample[] = [];

  for (let x = bounds.minX; x <= bounds.maxX; x += resolution) {
    for (let y = bounds.minY; y <= bounds.maxY; y += resolution) {
      if (pointInPolygon({ x, y }, points)) {
        samples.push({ x, y, z: elevation, LAeq: MIN_LEVEL });
      }
    }
  }

  if (cap > 0 && samples.length > cap) {
    const stride = Math.ceil(samples.length / cap);
    return samples.filter((_, idx) => idx % stride === 0);
  }

  return samples;
}

function computeScene(): SceneResults {
  const receiverResults: ReceiverResult[] = scene.receivers.map((receiver) => {
    const levels = scene.sources.map((source) => computeSPL(source, receiver));
    return {
      id: receiver.id,
      x: receiver.x,
      y: receiver.y,
      z: receiver.z,
      LAeq: sumDecibels(levels),
    };
  });

  const panelResults: PanelResult[] = scene.panels.map((panel) => {
    const samples = samplePolygon(panel.points, panel.sampling.resolution, panel.sampling.pointCap, panel.elevation);
    const levels = samples.map((sample) => {
      const level = sumDecibels(scene.sources.map((source) => computeSPL(source, sample)));
      sample.LAeq = level;
      return level;
    });

    const validLevels = levels.filter((level) => Number.isFinite(level));
    const min = validLevels.length ? Math.min(...validLevels) : MIN_LEVEL;
    const max = validLevels.length ? Math.max(...validLevels) : MIN_LEVEL;
    const avg = validLevels.length
      ? sumDecibels(validLevels) - 10 * Math.log10(validLevels.length)
      : MIN_LEVEL;
    const p95 = validLevels.length ? percentile(validLevels, 0.95) : MIN_LEVEL;

    return {
      panelId: panel.id,
      sampleCount: samples.length,
      LAeq_min: min,
      LAeq_max: max,
      LAeq_avg: avg,
      LAeq_p95: p95,
      samples,
    };
  });

  results = { receivers: receiverResults, panels: panelResults };
  renderResults();
  drawScene();

  if (statusPill) {
    statusPill.textContent = `Computed ${receiverResults.length} receivers`;
  }

  return results;
}

function renderResults() {
  if (receiverTable) {
    receiverTable.innerHTML = '';
    for (const receiver of results.receivers) {
      const row = document.createElement('div');
      row.className = 'result-row';
      row.innerHTML = `<span>${receiver.id.toUpperCase()}</span><strong>${formatLevel(receiver.LAeq)} dB</strong>`;
      receiverTable.appendChild(row);
    }
  }

  if (panelStats) {
    panelStats.innerHTML = '';
    if (!results.panels.length) {
      panelStats.textContent = 'No panels.';
    } else {
      for (const panel of results.panels) {
        const stat = document.createElement('div');
        stat.innerHTML = `<strong>${panel.panelId.toUpperCase()}</strong> min ${formatLevel(panel.LAeq_min)} / max ${formatLevel(panel.LAeq_max)} / avg ${formatLevel(panel.LAeq_avg)} / p95 ${formatLevel(panel.LAeq_p95)} (${panel.sampleCount} pts)`;
        panelStats.appendChild(stat);
      }
    }
  }
}

function createId(prefix: string, seq: number) {
  return `${prefix}${seq}`;
}

function setActiveTool(tool: Tool) {
  activeTool = tool;
  if (modeLabel) {
    const label = tool.replace('-', ' ');
    modeLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);
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
  if (selectionLabel) {
    selectionLabel.textContent = selection.type === 'none' ? 'None' : `${selection.type} ${selection.id}`;
  }
  renderProperties();
  drawScene();
}

function renderProperties() {
  if (!propertiesBody) return;
  propertiesBody.innerHTML = '';

  if (selection.type === 'none') {
    propertiesBody.textContent = 'Select an item to edit its properties.';
    return;
  }

  const header = document.createElement('div');
  header.textContent = `Editing ${selection.type} ${selection.id}`;
  propertiesBody.appendChild(header);

  if (selection.type === 'source') {
    const source = scene.sources.find((item) => item.id === selection.id);
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

  if (selection.type === 'receiver') {
    const receiver = scene.receivers.find((item) => item.id === selection.id);
    if (!receiver) return;
    propertiesBody.appendChild(createInputRow('Height (m)', receiver.z, (value) => {
      receiver.z = value;
      computeScene();
    }));
  }

  if (selection.type === 'panel') {
    const panel = scene.panels.find((item) => item.id === selection.id);
    if (!panel) return;
    propertiesBody.appendChild(createInputRow('Elevation (m)', panel.elevation, (value) => {
      panel.elevation = value;
      computeScene();
    }));
    propertiesBody.appendChild(createInputRow('Sampling (m)', panel.sampling.resolution, (value) => {
      panel.sampling.resolution = Math.max(1, value);
      computeScene();
    }));
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
  });
}

function wireLayerToggle(input: HTMLInputElement | null, key: keyof typeof layers) {
  if (!input) return;
  input.addEventListener('change', () => {
    layers[key] = input.checked;
    if (layerLabel && input.checked) {
      layerLabel.textContent = key.charAt(0).toUpperCase() + key.slice(1);
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

function drawPanelSamples(panel: Panel, panelResult: PanelResult) {
  if (!layers.panels) return;
  const min = panelResult.LAeq_min;
  const max = panelResult.LAeq_max;
  for (const sample of panelResult.samples) {
    const ratio = max - min > 0 ? (sample.LAeq - min) / (max - min) : 0;
    const color = {
      r: Math.round(42 + ratio * (231 - 42)),
      g: Math.round(157 + ratio * (111 - 157)),
      b: Math.round(143 + ratio * (81 - 143)),
    };
    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.7)`;
    const pos = worldToCanvas(sample);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
    ctx.fill();
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
        drawPanelSamples(panel, panelResult);
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
    const targetPoint = {
      x: worldPoint.x - dragState.offset.x,
      y: worldPoint.y - dragState.offset.y,
    };
    if (dragState.type === 'source') {
      const source = scene.sources.find((item) => item.id === dragState.id);
      if (source) {
        source.x = targetPoint.x;
        source.y = targetPoint.y;
      }
    }
    if (dragState.type === 'receiver') {
      const receiver = scene.receivers.find((item) => item.id === dragState.id);
      if (receiver) {
        receiver.x = targetPoint.x;
        receiver.y = targetPoint.y;
      }
    }
    if (dragState.type === 'panel') {
      const panel = scene.panels.find((item) => item.id === dragState.id);
      if (panel) {
        const dx = targetPoint.x - panel.points[0].x;
        const dy = targetPoint.y - panel.points[0].y;
        panel.points = panel.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
      }
    }

    const now = performance.now();
    if (now - lastComputeAt > 120) {
      lastComputeAt = now;
      computeScene();
    } else {
      drawScene();
    }
  }

  if (activeTool === 'measure' && measureStart) {
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
    if (!measureStart) {
      measureStart = worldPoint;
      measureEnd = worldPoint;
    } else {
      measureEnd = worldPoint;
    }
    drawScene();
    return;
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
    if (event.key === 'Escape') {
      setSelection({ type: 'none' });
      measureStart = null;
      measureEnd = null;
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

  resizeCanvas();
  computeScene();
  window.addEventListener('resize', resizeCanvas);
}

init();
