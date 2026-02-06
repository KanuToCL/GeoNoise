/**
 * Probe Chart Rendering
 *
 * Renders frequency response charts for probe data.
 */

import type { ProbeResult } from '@geonoise/engine';
import type { Spectrum9, FrequencyWeighting } from '@geonoise/shared';
import { applyWeightingToSpectrum, calculateOverallLevel } from '@geonoise/shared';
import { formatLevel } from '../format.js';

// === Chart Configuration ===

export interface ChartTheme {
  background: string;
  text: string;
  grid: string;
  line: string;
  fill: string;
}

export type ReadCssVar = (name: string) => string;

// === Canvas Utilities ===

export function resizeProbeCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): void {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// === Main Chart Renderer ===

export function renderProbeChartOn(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  data: ProbeResult['data'] | null,
  displayWeighting: FrequencyWeighting,
  readCssVar: ReadCssVar
): void {
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

  // Validate magnitudes array has expected 9 bands
  if (!data.magnitudes || data.magnitudes.length !== 9) {
    ctxChart.fillStyle = readCssVar('--probe-text');
    ctxChart.font = '11px "Work Sans", sans-serif';
    ctxChart.fillText('Waiting for probe data...', padding.left, padding.top + 12);
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
