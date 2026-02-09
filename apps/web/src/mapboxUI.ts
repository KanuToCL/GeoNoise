/**
 * Mapbox UI Integration for GeoNoise
 *
 * Thin re-export layer — all logic lives in the `mapbox/` module directory.
 * This file exists solely to keep existing import paths (`./mapboxUI.js`)
 * working without touching every consumer.
 */

export {
  initMapboxUI,
  destroyMapboxUI,
  syncMapToCanvasZoom,
  syncMapToCanvasPan,
  isMapVisible,
  isMapInteractive,
  getMapCrossfader,
  setOnCrossfaderChange,
  getActiveMap,
  getMapDimensions,
  setMapStyle,
  toggleMap,
  getMapMetersPerPixel,
  setMapZoom,
  getMapZoom,
} from "./mapbox/index.js";
