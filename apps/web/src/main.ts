import {
  detectWebGPU,
  loadPreference,
  resolveBackend,
  savePreference,
  type ComputePreference,
} from './computePreference.js';

type Point = { x: number; y: number };

type Scene = {
  sources: Array<Point & { id: string; power: number }>;
  receivers: Array<Point & { id: string }>;
  panels: Array<{ id: string; points: Point[] }>;
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

const scene: Scene = {
  sources: [
    { id: 's1', x: -40, y: 10, power: 100 },
    { id: 's2', x: 60, y: -20, power: 94 },
  ],
  receivers: [
    { id: 'r1', x: 10, y: 30 },
    { id: 'r2', x: -20, y: -40 },
  ],
  panels: [
    {
      id: 'p1',
      points: [
        { x: 30, y: 20 },
        { x: 80, y: 10 },
        { x: 70, y: -30 },
        { x: 25, y: -10 },
      ],
    },
  ],
};

let pixelsPerMeter = 3;
const capability = detectWebGPU();

const layers = {
  sources: true,
  receivers: true,
  panels: true,
  grid: false,
};

function niceDistance(value: number): number {
  const options = [5, 10, 20, 50, 100, 200, 500, 1000];
  let best = options[0];
  for (const option of options) {
    if (value >= option) best = option;
  }
  return best;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  pixelsPerMeter = rect.width / 300;
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

function toCanvas(point: Point): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.width / 2 + point.x * pixelsPerMeter,
    y: rect.height / 2 - point.y * pixelsPerMeter,
  };
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

function drawSources() {
  ctx.fillStyle = '#e76f51';
  ctx.strokeStyle = '#aa4e37';
  ctx.lineWidth = 2;

  for (const source of scene.sources) {
    const p = toCanvas(source);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

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
    const p = toCanvas(receiver);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 10);
    ctx.lineTo(p.x + 10, p.y + 10);
    ctx.lineTo(p.x - 10, p.y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1f1c18';
    ctx.font = '12px "Space Grotesk", sans-serif';
    ctx.fillText(receiver.id.toUpperCase(), p.x + 14, p.y + 4);
    ctx.fillStyle = '#2a9d8f';
  }
}

function drawPanels() {
  ctx.strokeStyle = '#264653';
  ctx.fillStyle = 'rgba(38, 70, 83, 0.12)';
  ctx.lineWidth = 2;

  for (const panel of scene.panels) {
    if (panel.points.length < 3) continue;
    const first = toCanvas(panel.points[0]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const pt of panel.points.slice(1)) {
      const p = toCanvas(pt);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
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
  }

  if (layers.sources) {
    drawSources();
  }

  if (layers.receivers) {
    drawReceivers();
  }
}

function updateCounts() {
  if (countSources) countSources.textContent = `${scene.sources.length}`;
  if (countReceivers) countReceivers.textContent = `${scene.receivers.length}`;
  if (countPanels) countPanels.textContent = `${scene.panels.length}`;
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

function wirePointer() {
  canvas.addEventListener('mousemove', (event) => {
    if (!coordLabel) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) / pixelsPerMeter;
    const y = -(event.clientY - rect.top - rect.height / 2) / pixelsPerMeter;
    coordLabel.textContent = `x: ${x.toFixed(1)} m, y: ${y.toFixed(1)} m`;
  });
}

function init() {
  updateCounts();
  wireLayerToggle(layerSources, 'sources');
  wireLayerToggle(layerReceivers, 'receivers');
  wireLayerToggle(layerPanels, 'panels');
  wireLayerToggle(layerGrid, 'grid');
  wirePointer();
  if (statusPill) statusPill.textContent = 'Ready';
  wirePreference();

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

init();

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
