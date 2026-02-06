/**
 * Source spectrum chart rendering
 *
 * Renders a frequency spectrum chart showing dB SPL @ 1m with spherical spreading.
 * Uses a light orange color scheme to visually distinguish from the probe's blue/teal chart.
 */

import {
  OCTAVE_BANDS,
  applyWeightingToSpectrum,
  calculateOverallLevel,
  type Spectrum9,
  type FrequencyWeighting,
} from '@geonoise/shared';
import { formatLevel } from '../../format.js';
import type { ReadCssVar, ChartPadding } from './types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default chart padding */
const DEFAULT_PADDING: ChartPadding = {
  left: 36,
  right: 48,
  top: 12,
  bottom: 24,
};

/** Marker radius in pixels */
const MARKER_RADIUS = 4;

/** Grid line count (horizontal lines) */
const GRID_LINE_COUNT = 4;

// =============================================================================
// CHART RENDERING
// =============================================================================

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
 * @param readCssVar - Function to read CSS variable values
 */
export function renderSourceChartOn(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  spectrum: Spectrum9,
  gain: number,
  weighting: FrequencyWeighting = 'Z',
  readCssVar: ReadCssVar
): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = rect.width;
  const height = rect.height;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  if (!width || !height) return;

  const padding = DEFAULT_PADDING;
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
  for (let i = 0; i <= GRID_LINE_COUNT; i++) {
    const y = padding.top + (chartHeight * i) / GRID_LINE_COUNT;
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
    ctx.arc(point.x, point.y, MARKER_RADIUS, 0, Math.PI * 2);
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
