/**
 * Mapbox UI module — barrel export & top-level orchestrator.
 *
 * This file re-exports the public API and provides `initMapboxUI` which
 * is the single entry point called from main.ts.
 */

import { destroyMap, getMapDimensionsInMeters, type MapStyle } from "../mapbox.js";

import type { InitMapboxUIOptions } from "./types.js";
import {
  uiState,
  mapCrossfader,
  setOnCrossfaderChangeCb,
  setCallbacks,
  setDebugEnabled,
  bindDOMElements,
} from "./state.js";

import { wireTokenModal } from "./token.js";
import {
  wireMapToggleButton,
  updateMapButtonState,
  updateFloatingPanelState,
  wireFloatingPanelControls,
  showMap,
  hideMap,
  updateMapInfo,
} from "./lifecycle.js";
import { wireLocationSearch, wireCoordinateInput } from "./search.js";
import { initScaleComparisonDrag } from "./scaleComparison.js";
import { initMapPanelDrag, wireCollapseButton } from "./panel.js";

// ── Public API ──────────────────────────────────────────────────────────────

export function initMapboxUI(options?: InitMapboxUIOptions): void {
  uiState.isEnabled = options?.enabled ?? true;

  if (!uiState.isEnabled) {
    const mapToggle = document.getElementById("mapToggleButton");
    const mapControlPanel = document.getElementById("mapControlPanel");
    const scaleComparisonPanel = document.getElementById("scaleComparisonPanel");

    if (mapToggle) mapToggle.style.display = "none";
    if (mapControlPanel) mapControlPanel.style.display = "none";
    if (scaleComparisonPanel) scaleComparisonPanel.style.display = "none";
    return;
  }

  if (options) setCallbacks(options);

  // Store debug flag
  const debug = options?.debug ?? false;
  setDebugEnabled(debug);

  // Hide debug elements when debug flag is off
  if (!debug) {
    const mapInfoSection = document.getElementById("mapScaleInfo")?.parentElement;
    const scaleComparisonPanel = document.getElementById("scaleComparisonPanel");
    if (mapInfoSection) mapInfoSection.style.display = "none";
    if (scaleComparisonPanel) scaleComparisonPanel.style.display = "none";
  }

  // Show map toggle button and separator in dock
  const mapToggle = document.getElementById("mapToggleButton");
  const mapToolsSeparator = document.getElementById("mapToolsSeparator");
  if (mapToggle) mapToggle.style.display = "";
  if (mapToolsSeparator) mapToolsSeparator.style.display = "";

  // Map control panel stays hidden until map is activated from dock
  // showMap() will set display to "flex"; hideMap() will set it to "none"

  // Bind DOM refs & wire event listeners
  bindDOMElements();
  wireMapToggleButton();
  wireTokenModal();
  wireFloatingPanelControls();
  wireCollapseButton();
  wireLocationSearch();
  wireCoordinateInput();
  if (debug) initScaleComparisonDrag();
  initMapPanelDrag();

  updateMapButtonState();
  updateFloatingPanelState();
}

export function destroyMapboxUI(): void {
  destroyMap();
  uiState.map = null;
  uiState.isMapVisible = false;
}

export function syncMapToCanvasZoom(
  pixelsPerMeter: number,
  _canvasCenterX: number,
  _canvasCenterY: number,
): void {
  if (!uiState.map || !uiState.isMapVisible) return;

  const metersPerPixel = 1 / pixelsPerMeter;
  const currentCenter = uiState.map.getCenter();
  const lat = currentCenter.lat;

  const EARTH_CIRCUMFERENCE = 40075016.686;
  const TILE_SIZE = 512;

  const cosLat = Math.cos((lat * Math.PI) / 180);
  const zoom = Math.log2((EARTH_CIRCUMFERENCE * cosLat) / (metersPerPixel * TILE_SIZE));
  const clampedZoom = Math.max(0, Math.min(22, zoom));

  uiState.map.setZoom(clampedZoom);
  updateMapInfo();
}

export function syncMapToCanvasPan(
  deltaX: number,
  deltaY: number,
  pixelsPerMeter: number,
): void {
  if (!uiState.map || !uiState.isMapVisible || uiState.isMapInteractive) return;

  const deltaPixelsX = deltaX * pixelsPerMeter;
  const deltaPixelsY = deltaY * pixelsPerMeter;

  uiState.map.panBy([-deltaPixelsX, deltaPixelsY], { duration: 0 });
  updateMapInfo();
}

export function isMapVisible(): boolean {
  return uiState.isMapVisible;
}

export function isMapInteractive(): boolean {
  return uiState.isMapInteractive;
}

export function getMapCrossfader(): number {
  return mapCrossfader;
}

export function setOnCrossfaderChange(callback: () => void): void {
  setOnCrossfaderChangeCb(callback);
}

export function getActiveMap(): import("../mapbox.js").MapboxMap | null {
  return uiState.isMapVisible ? uiState.map : null;
}

export function getMapDimensions(): ReturnType<typeof getMapDimensionsInMeters> | null {
  if (!uiState.map || !uiState.isMapVisible) return null;
  return getMapDimensionsInMeters(uiState.map);
}

export function setMapStyle(style: MapStyle): void {
  uiState.currentStyle = style;
}

export async function toggleMap(): Promise<void> {
  if (uiState.isMapVisible) {
    hideMap();
  } else {
    await showMap();
  }
}

export function getMapMetersPerPixel(): number | null {
  if (!uiState.map || !uiState.isMapVisible) return null;
  const dimensions = getMapDimensionsInMeters(uiState.map);
  return dimensions.metersPerPixel;
}

export function setMapZoom(zoom: number): void {
  if (!uiState.map) return;
  uiState.map.setZoom(zoom);
  updateMapInfo();
}

export function getMapZoom(): number | null {
  if (!uiState.map) return null;
  return uiState.map.getZoom();
}
