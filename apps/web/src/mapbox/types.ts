/**
 * Types and interfaces for the Mapbox UI module.
 */

import type { MapboxMap, MapStyle } from "../mapbox.js";

// ── UI State ────────────────────────────────────────────────────────────────

export interface MapboxUIState {
  isMapVisible: boolean;
  isMapInteractive: boolean;
  map: MapboxMap | null;
  currentStyle: MapStyle;
  isEnabled: boolean;
}

// ── Callback signatures ─────────────────────────────────────────────────────

export type ScaleSyncCallback = (metersPerPixel: number) => void;
export type MapMoveCallback = (centerLat: number, centerLng: number, zoom: number) => void;
export type GetPixelsPerMeterCallback = () => number;

// ── Init options ────────────────────────────────────────────────────────────

export interface InitMapboxUIOptions {
  enabled?: boolean;
  debug?: boolean;
  onScaleSync?: ScaleSyncCallback;
  onMapMove?: MapMoveCallback;
  getPixelsPerMeter?: GetPixelsPerMeterCallback;
}
