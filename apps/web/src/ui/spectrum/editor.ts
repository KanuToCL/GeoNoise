/**
 * Spectrum editor component for editing 9-band source levels
 *
 * Provides an intuitive UI for adjusting the frequency spectrum of a sound source.
 * Features interactive vertical sliders, real-time visual frequency chart, and preset buttons.
 */

import {
  OCTAVE_BANDS,
  calculateOverallLevel,
  type Spectrum9,
  type FrequencyWeighting,
} from '@geonoise/shared';
import { formatLevel } from '../../format.js';
import type { Source } from '../../entities/types.js';
import type { OnChangeSpectrum, OnChangeGain, ReadCssVar } from './types.js';
import { renderSourceChartOn } from './chart.js';

// =============================================================================
// SLIDER CONFIGURATION
// =============================================================================

/** Minimum slider value (dB) */
const SLIDER_MIN = 40;

/** Maximum slider value (dB) */
const SLIDER_MAX = 130;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a field label with optional tooltip
 *
 * @param label - The label text
 * @param tooltipText - Optional tooltip content
 * @returns The label wrapper element
 */
export function createFieldLabel(label: string, tooltipText?: string): HTMLElement {
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

/**
 * Create an inline number input field with label
 *
 * @param label - The field label
 * @param value - Initial value
 * @param onChange - Callback when value changes
 * @param tooltipText - Optional tooltip
 * @returns The field element
 */
export function createInlineField(
  label: string,
  value: number,
  onChange: (value: number) => void,
  tooltipText?: string
): HTMLElement {
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

// =============================================================================
// SPECTRUM EDITOR
// =============================================================================

/**
 * Calculate fill height percentage for slider visual
 */
function calcFillPercent(value: number): number {
  return ((value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;
}

/**
 * Format frequency label (e.g., 1000 -> "1k")
 */
function formatFreqLabel(freq: number): string {
  return freq >= 1000 ? `${freq / 1000}k` : String(freq);
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
 * @param displayWeighting - Current display weighting for chart
 * @param readCssVar - Function to read CSS variables
 * @returns The spectrum editor DOM element
 */
export function createSpectrumEditor(
  source: Source,
  onChangeSpectrum: OnChangeSpectrum,
  onChangeGain: OnChangeGain,
  displayWeighting: FrequencyWeighting,
  readCssVar: ReadCssVar
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
      renderSourceChartOn(chart, chartCtx, source.spectrum, source.gain, displayWeighting, readCssVar);
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

  for (let i = 0; i < OCTAVE_BANDS.length; i++) {
    const bandIndex = i;
    const freq = OCTAVE_BANDS[i];
    const freqLabel = formatFreqLabel(freq);

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
    slider.min = String(SLIDER_MIN);
    slider.max = String(SLIDER_MAX);
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
      const freqLabel = formatFreqLabel(freq);
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
