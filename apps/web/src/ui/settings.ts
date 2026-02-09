/**
 * Settings UI Module
 *
 * Wires up the map settings (render style, band step, auto-scale) and
 * display settings (weighting, band) controls.
 */

import type { FrequencyWeighting } from '@geonoise/shared';
import type { DisplayBand, MapRenderStyle } from '../types/index.js';
import { DEFAULT_MAP_BAND_STEP, DEFAULT_MAP_BAND_STEP_PERBAND } from '../constants.js';

// =============================================================================
// TYPES
// =============================================================================

/** DOM elements for map settings controls */
export interface MapSettingsElements {
  mapRenderStyleToggle: HTMLInputElement | null;
  mapBandStepInput: HTMLInputElement | null;
  mapBandStepRow: HTMLDivElement | null;
  mapAutoScaleToggle: HTMLInputElement | null;
}

/** DOM elements for display settings controls */
export interface DisplaySettingsElements {
  displayWeightingSelect: HTMLSelectElement | null;
  displayBandSelect: HTMLSelectElement | null;
}

/** Current map settings state */
export interface MapSettingsState {
  mapRenderStyle: MapRenderStyle;
  mapBandStep: number;
  mapAutoScale: boolean;
  displayBand: DisplayBand;
}

/** Current display settings state */
export interface DisplaySettingsState {
  displayWeighting: FrequencyWeighting;
  displayBand: DisplayBand;
}

/** Callbacks for map settings changes */
export interface MapSettingsCallbacks {
  /** Get a fresh snapshot of the current map settings state */
  getState: () => MapSettingsState;
  /** Get the current map band step value */
  getMapBandStep: () => number;
  /** Set the map render style */
  setMapRenderStyle: (style: MapRenderStyle) => void;
  /** Set the map band step */
  setMapBandStep: (step: number) => void;
  /** Set the map auto-scale state */
  setMapAutoScale: (autoScale: boolean) => void;
  /** Called after any setting change to refresh visualization */
  onRefreshVisualization: () => void;
}

/** Callbacks for display settings changes */
export interface DisplaySettingsCallbacks {
  /** Set the display weighting */
  setDisplayWeighting: (weighting: FrequencyWeighting) => void;
  /** Set the display band */
  setDisplayBand: (band: DisplayBand) => void;
  /** Set the map band step (for updating default when band changes) */
  setMapBandStep: (step: number) => void;
  /** Update map settings controls (for updating band step input) */
  updateMapSettingsControls: () => void;
  /** Re-render sources list */
  renderSources: () => void;
  /** Re-render results display */
  renderResults: () => void;
  /** Re-render properties panel */
  renderProperties: () => void;
  /** Check if noise map layer is visible */
  isNoiseMapVisible: () => boolean;
  /** Recompute the noise map */
  recomputeNoiseMap: (requestId: string) => void;
  /** Request a render */
  requestRender: () => void;
}

// =============================================================================
// UPDATE MAP SETTINGS CONTROLS
// =============================================================================

/**
 * Updates the map settings control elements to reflect current state.
 */
export function updateMapSettingsControls(
  elements: MapSettingsElements,
  state: MapSettingsState,
  getMapBandStep: () => number
): void {
  const { mapRenderStyleToggle, mapBandStepInput, mapBandStepRow, mapAutoScaleToggle } = elements;
  const { mapRenderStyle, mapAutoScale } = state;

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

// =============================================================================
// WIRE MAP SETTINGS
// =============================================================================

/**
 * Wires up the map settings controls (render style toggle, band step input, auto-scale toggle).
 */
export function wireMapSettings(
  elements: MapSettingsElements,
  callbacks: MapSettingsCallbacks
): void {
  const { mapRenderStyleToggle, mapBandStepInput, mapAutoScaleToggle } = elements;

  if (!mapRenderStyleToggle && !mapBandStepInput && !mapAutoScaleToggle) return;

  // Initialize controls to current state
  updateMapSettingsControls(elements, callbacks.getState(), callbacks.getMapBandStep);

  // Render style toggle (Smooth vs Contours)
  mapRenderStyleToggle?.addEventListener('change', () => {
    callbacks.setMapRenderStyle(mapRenderStyleToggle.checked ? 'Contours' : 'Smooth');
    updateMapSettingsControls(elements, callbacks.getState(), callbacks.getMapBandStep);
    callbacks.onRefreshVisualization();
  });

  // Band step input
  const applyBandStep = (shouldClamp: boolean) => {
    if (!mapBandStepInput) return;
    const next = Number(mapBandStepInput.value);
    if (!Number.isFinite(next)) {
      if (shouldClamp) {
        mapBandStepInput.value = callbacks.getMapBandStep().toString();
      }
      return;
    }
    const clampedStep = Math.min(20, Math.max(1, next));
    callbacks.setMapBandStep(clampedStep);
    if (shouldClamp) {
      mapBandStepInput.value = clampedStep.toString();
    }
    callbacks.onRefreshVisualization();
  };

  mapBandStepInput?.addEventListener('input', () => {
    applyBandStep(false);
  });

  mapBandStepInput?.addEventListener('change', () => {
    applyBandStep(true);
  });

  // Auto-scale toggle
  mapAutoScaleToggle?.addEventListener('change', () => {
    callbacks.setMapAutoScale(mapAutoScaleToggle.checked);
    callbacks.onRefreshVisualization();
  });
}

// =============================================================================
// WIRE DISPLAY SETTINGS
// =============================================================================

/**
 * Wires up the display settings controls (weighting select, band select).
 */
export function wireDisplaySettings(
  elements: DisplaySettingsElements,
  state: DisplaySettingsState,
  callbacks: DisplaySettingsCallbacks
): void {
  const { displayWeightingSelect, displayBandSelect } = elements;

  if (!displayWeightingSelect && !displayBandSelect) return;

  // Initialize from current state
  if (displayWeightingSelect) {
    displayWeightingSelect.value = state.displayWeighting;
  }
  if (displayBandSelect) {
    displayBandSelect.value = state.displayBand === 'overall' ? 'overall' : String(state.displayBand);
  }

  // Weighting select (A, C, Z)
  displayWeightingSelect?.addEventListener('change', () => {
    callbacks.setDisplayWeighting(displayWeightingSelect.value as FrequencyWeighting);
    callbacks.renderSources();
    callbacks.renderResults();
    callbacks.renderProperties();
    // Recompute noise map with new weighting if the map layer is visible
    if (callbacks.isNoiseMapVisible()) {
      callbacks.recomputeNoiseMap('grid:weighting-change');
    }
    callbacks.requestRender();
  });

  // Band select (overall or specific octave band)
  displayBandSelect?.addEventListener('change', () => {
    const value = displayBandSelect.value;
    const newBand: DisplayBand = value === 'overall' ? 'overall' : (Number(value) as DisplayBand);
    callbacks.setDisplayBand(newBand);
    // Update band step to use appropriate default for overall vs per-band display
    const newStep = newBand === 'overall' ? DEFAULT_MAP_BAND_STEP : DEFAULT_MAP_BAND_STEP_PERBAND;
    callbacks.setMapBandStep(newStep);
    callbacks.updateMapSettingsControls();
    callbacks.renderSources();
    callbacks.renderResults();
    callbacks.renderProperties();
    // Recompute noise map with new band selection if the map layer is visible
    if (callbacks.isNoiseMapVisible()) {
      callbacks.recomputeNoiseMap('grid:band-change');
    }
    callbacks.requestRender();
  });
}
