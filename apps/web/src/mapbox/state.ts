/**
 * Shared mutable state for the Mapbox UI module.
 *
 * All DOM element references and module-level state live here so every
 * sub-module can import the same singletons without circular deps.
 */

import type { GeocodingResult } from "../mapbox.js";
import type {
  MapboxUIState,
  ScaleSyncCallback,
  MapMoveCallback,
  GetPixelsPerMeterCallback,
} from "./types.js";

export let debugEnabled = false;
export function setDebugEnabled(v: boolean): void {
  debugEnabled = v;
}

// ── Core state ──────────────────────────────────────────────────────────────

export const uiState: MapboxUIState = {
  isMapVisible: false,
  isMapInteractive: false,
  map: null,
  currentStyle: "streets",
  isEnabled: true,
};

// Crossfader: 0 = full colormap, 100 = full map
export let mapCrossfader = 0;
export function setMapCrossfader(v: number): void {
  mapCrossfader = v;
}

export let onCrossfaderChange: (() => void) | null = null;
export function setOnCrossfaderChangeCb(cb: (() => void) | null): void {
  onCrossfaderChange = cb;
}

// ── Callbacks ───────────────────────────────────────────────────────────────

export let onScaleSync: ScaleSyncCallback | null = null;
export let onMapMove: MapMoveCallback | null = null;
export let getPixelsPerMeter: GetPixelsPerMeterCallback | null = null;

export function setCallbacks(opts: {
  onScaleSync?: ScaleSyncCallback;
  onMapMove?: MapMoveCallback;
  getPixelsPerMeter?: GetPixelsPerMeterCallback;
}): void {
  if (opts.onScaleSync) onScaleSync = opts.onScaleSync;
  if (opts.onMapMove) onMapMove = opts.onMapMove;
  if (opts.getPixelsPerMeter) getPixelsPerMeter = opts.getPixelsPerMeter;
}

// ── DOM element refs (assigned once during init) ────────────────────────────

export let mapToggleButton: HTMLButtonElement | null = null;
export let mapboxContainer: HTMLDivElement | null = null;
export let mapboxTokenModal: HTMLDivElement | null = null;
export let mapboxTokenInput: HTMLInputElement | null = null;
export let mapboxTokenSave: HTMLButtonElement | null = null;
export let mapboxTokenClear: HTMLButtonElement | null = null;
export let mapboxTokenClose: HTMLButtonElement | null = null;
export let mapboxTokenError: HTMLDivElement | null = null;
export let mapboxTokenSuccess: HTMLDivElement | null = null;

export let loadMapButton: HTMLButtonElement | null = null;
export let mapControls: HTMLDivElement | null = null;
export let mapStatusBadge: HTMLSpanElement | null = null;
export let mapOpacitySlider: HTMLInputElement | null = null;
export let mapOpacityValue: HTMLSpanElement | null = null;
export let mapScaleInfo: HTMLDivElement | null = null;
export let mapCenterInfo: HTMLDivElement | null = null;
export let mapStyleStreets: HTMLButtonElement | null = null;
export let mapStyleSatellite: HTMLButtonElement | null = null;
export let mapStyleDark: HTMLButtonElement | null = null;

export let mapSearchInput: HTMLInputElement | null = null;
export let mapSearchResults: HTMLDivElement | null = null;
export let mapLatInput: HTMLInputElement | null = null;
export let mapLngInput: HTMLInputElement | null = null;
export let mapGoToCoords: HTMLButtonElement | null = null;

// Search state
export let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
export function setSearchDebounceTimer(t: ReturnType<typeof setTimeout> | null): void {
  searchDebounceTimer = t;
}

export let currentSearchResults: GeocodingResult[] = [];
export function setCurrentSearchResults(r: GeocodingResult[]): void {
  currentSearchResults = r;
}

/**
 * Bind all DOM element references. Called once from initMapboxUI.
 */
export function bindDOMElements(): void {
  mapToggleButton = document.getElementById("mapToggleButton") as HTMLButtonElement | null;
  mapboxContainer = document.getElementById("mapboxContainer") as HTMLDivElement | null;
  mapboxTokenModal = document.getElementById("mapboxTokenModal") as HTMLDivElement | null;
  mapboxTokenInput = document.getElementById("mapboxTokenInput") as HTMLInputElement | null;
  mapboxTokenSave = document.getElementById("mapboxTokenSave") as HTMLButtonElement | null;
  mapboxTokenClear = document.getElementById("mapboxTokenClear") as HTMLButtonElement | null;
  mapboxTokenClose = document.getElementById("mapboxTokenClose") as HTMLButtonElement | null;
  mapboxTokenError = document.getElementById("mapboxTokenError") as HTMLDivElement | null;
  mapboxTokenSuccess = document.getElementById("mapboxTokenSuccess") as HTMLDivElement | null;

  loadMapButton = document.getElementById("loadMapButton") as HTMLButtonElement | null;
  mapControls = document.getElementById("mapControls") as HTMLDivElement | null;
  mapStatusBadge = document.getElementById("mapStatusBadge") as HTMLSpanElement | null;
  mapOpacitySlider = document.getElementById("mapOpacitySlider") as HTMLInputElement | null;
  mapOpacityValue = document.getElementById("mapOpacityValue") as HTMLSpanElement | null;
  mapScaleInfo = document.getElementById("mapScaleInfo") as HTMLDivElement | null;
  mapCenterInfo = document.getElementById("mapCenterInfo") as HTMLDivElement | null;
  mapStyleStreets = document.getElementById("mapStyleStreets") as HTMLButtonElement | null;
  mapStyleSatellite = document.getElementById("mapStyleSatellite") as HTMLButtonElement | null;
  mapStyleDark = document.getElementById("mapStyleDark") as HTMLButtonElement | null;

  mapSearchInput = document.getElementById("mapSearchInput") as HTMLInputElement | null;
  mapSearchResults = document.getElementById("mapSearchResults") as HTMLDivElement | null;
  mapLatInput = document.getElementById("mapLatInput") as HTMLInputElement | null;
  mapLngInput = document.getElementById("mapLngInput") as HTMLInputElement | null;
  mapGoToCoords = document.getElementById("mapGoToCoords") as HTMLButtonElement | null;
}
