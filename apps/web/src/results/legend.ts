/**
 * Legend Rendering Module
 *
 * Functions for rendering noise map and panel legends in the UI.
 * Extracted from main.ts for modular architecture.
 */

import { formatLevel, formatLegendLevel } from '../format.js';
import { getSampleColor, colorToCss, buildSmoothLegendStops } from '../utils/index.js';
import { buildBandedLegendLabels } from '../compute/index.js';
import type { PanelResult } from '../export.js';
import type { NoiseMapLegendElements, NoiseMapLegendConfig } from './types.js';

// Re-export formatLegendLevel for backward compatibility
// (main.ts may still reference it from here)
export { formatLegendLevel } from '../format.js';

/**
 * Render the noise map legend with gradient and labels
 *
 * @param elements - DOM elements for legend rendering
 * @param config - Legend configuration (range, step, style)
 */
export function renderNoiseMapLegend(
  elements: NoiseMapLegendElements,
  config: NoiseMapLegendConfig
): void {
  const { container, gradient, labels } = elements;
  if (!container || !gradient || !labels) return;

  const { range, bandStep, renderStyle } = config;
  const isContours = renderStyle === 'Contours';
  const stops = buildSmoothLegendStops();

  gradient.style.backgroundImage = `linear-gradient(90deg, ${stops})`;
  container.classList.toggle('is-contours', isContours);

  labels.innerHTML = '';
  const labelValues = isContours
    ? buildBandedLegendLabels(range, bandStep)
    : [range.min, range.max];

  for (let i = 0; i < labelValues.length; i += 1) {
    const value = labelValues[i];
    const label = document.createElement('span');
    const suffix = i === 0 || i === labelValues.length - 1 ? ' dB' : '';
    label.textContent = `${formatLegendLevel(value)}${suffix}`;
    labels.appendChild(label);
  }
}

/**
 * Render panel legend showing min/max color range
 *
 * @param container - Container element for the legend
 * @param result - Panel result with min/max values, or null
 * @param emptyMessage - Message to show when no result available
 */
export function renderPanelLegendFor(
  container: HTMLElement,
  result: PanelResult | undefined,
  emptyMessage = 'Measure grid results pending.'
): void {
  if (!result || !Number.isFinite(result.LAeq_min) || !Number.isFinite(result.LAeq_max)) {
    container.innerHTML = `<span class="legend-empty">${emptyMessage}</span>`;
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

/**
 * Render panel legend for current selection
 *
 * @param container - Legend container element
 * @param panelResults - All panel results
 * @param selectedPanelId - Currently selected panel ID, or null
 */
export function renderPanelLegend(
  container: HTMLElement | null,
  panelResults: PanelResult[],
  selectedPanelId: string | null
): void {
  if (!container) return;

  if (!selectedPanelId) {
    container.innerHTML = '<span class="legend-empty">Select a measure grid to view the color range.</span>';
    return;
  }

  const result = panelResults.find((panel) => panel.panelId === selectedPanelId);
  renderPanelLegendFor(container, result);
}
