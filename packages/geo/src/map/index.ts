/**
 * Map adapter interfaces and implementations
 * Abstracts map providers (Google Maps, offline grid, etc.)
 */

import {
  LatLon,
  LocalMetersENU,
  CoordinateOrigin,
  GeoBoundingBox,
  BoundingBox2D,
  createCoordinateTransformer,
  type CoordinateTransformer,
} from '@geonoise/core';

// ============================================================================
// Map Adapter Interface
// ============================================================================

/** Map state */
export interface MapState {
  center: LatLon;
  zoom: number;
  bounds: GeoBoundingBox;
  tilt?: number;
  heading?: number;
}

/** Map click event */
export interface MapClickEvent {
  latLon: LatLon;
  local: LocalMetersENU;
  pixel: { x: number; y: number };
}

/** Map adapter interface */
export interface MapAdapter {
  /** Get current map state */
  getState(): MapState;

  /** Set map center */
  setCenter(latLon: LatLon): void;

  /** Set zoom level */
  setZoom(zoom: number): void;

  /** Fit bounds */
  fitBounds(bounds: GeoBoundingBox, padding?: number): void;

  /** Convert lat/lon to pixel coordinates */
  latLonToPixel(latLon: LatLon): { x: number; y: number } | null;

  /** Convert pixel to lat/lon */
  pixelToLatLon(pixel: { x: number; y: number }): LatLon | null;

  /** Get the coordinate transformer */
  getTransformer(): CoordinateTransformer;

  /** Add click listener */
  onMapClick(callback: (event: MapClickEvent) => void): () => void;

  /** Check if map is ready */
  isReady(): boolean;

  /** Destroy/cleanup */
  destroy(): void;
}

// ============================================================================
// Map Scale Utilities
// ============================================================================

/**
 * Calculate the ground resolution at a given latitude and zoom level
 * (meters per pixel for web mercator tiles)
 */
export function groundResolution(latDeg: number, zoom: number): number {
  const EARTH_CIRCUMFERENCE = 40075016.686; // meters at equator
  const tileSize = 256;
  const mapSize = tileSize * Math.pow(2, zoom);
  return (EARTH_CIRCUMFERENCE * Math.cos((latDeg * Math.PI) / 180)) / mapSize;
}

/**
 * Calculate appropriate zoom level for a desired meters-per-pixel
 */
export function zoomForResolution(latDeg: number, metersPerPixel: number): number {
  const EARTH_CIRCUMFERENCE = 40075016.686;
  const tileSize = 256;
  const circumAtLat = EARTH_CIRCUMFERENCE * Math.cos((latDeg * Math.PI) / 180);
  const zoom = Math.log2(circumAtLat / (metersPerPixel * tileSize));
  return Math.max(0, Math.min(22, zoom));
}

/**
 * Get scale bar info for current zoom/latitude
 */
export function getScaleBarInfo(
  latDeg: number,
  zoom: number
): { distance: number; label: string; pixels: number } {
  const mpp = groundResolution(latDeg, zoom);

  // Choose a nice round distance
  const targetPixels = 100;
  const targetMeters = mpp * targetPixels;

  // Round to nice value
  const niceDistances = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  let distance = niceDistances[0];
  for (const d of niceDistances) {
    if (d <= targetMeters * 1.5) {
      distance = d;
    }
  }

  const pixels = distance / mpp;
  const label = distance >= 1000 ? `${distance / 1000} km` : `${distance} m`;

  return { distance, label, pixels };
}

// ============================================================================
// Offline Grid Map (Fallback)
// ============================================================================

/**
 * A simple offline grid map adapter
 * Used when no external map provider is available
 */
export class OfflineGridMap implements MapAdapter {
  private origin: CoordinateOrigin;
  private transformer: CoordinateTransformer;
  private state: MapState;
  private canvas: { width: number; height: number };
  private clickCallbacks: Set<(event: MapClickEvent) => void> = new Set();
  private metersPerPixel: number;

  constructor(
    origin: CoordinateOrigin,
    canvasSize: { width: number; height: number },
    metersPerPixel = 1
  ) {
    this.origin = origin;
    this.transformer = createCoordinateTransformer(origin);
    this.canvas = canvasSize;
    this.metersPerPixel = metersPerPixel;

    // Calculate bounds
    const halfWidthM = (canvasSize.width * metersPerPixel) / 2;
    const halfHeightM = (canvasSize.height * metersPerPixel) / 2;

    const sw = this.transformer.localMetersToLatLon({ x: -halfWidthM, y: -halfHeightM, z: 0 });
    const ne = this.transformer.localMetersToLatLon({ x: halfWidthM, y: halfHeightM, z: 0 });

    this.state = {
      center: origin.latLon,
      zoom: zoomForResolution(origin.latLon.lat, metersPerPixel),
      bounds: {
        south: sw.lat,
        west: sw.lon,
        north: ne.lat,
        east: ne.lon,
      },
    };
  }

  getState(): MapState {
    return { ...this.state };
  }

  setCenter(latLon: LatLon): void {
    this.state.center = latLon;
    this.updateBounds();
  }

  setZoom(zoom: number): void {
    this.state.zoom = zoom;
    this.metersPerPixel = groundResolution(this.state.center.lat, zoom);
    this.updateBounds();
  }

  private updateBounds(): void {
    const halfWidthM = (this.canvas.width * this.metersPerPixel) / 2;
    const halfHeightM = (this.canvas.height * this.metersPerPixel) / 2;

    // Recalculate transformer for new center
    this.origin = { latLon: this.state.center, altitude: this.origin.altitude };
    this.transformer = createCoordinateTransformer(this.origin);

    const sw = this.transformer.localMetersToLatLon({ x: -halfWidthM, y: -halfHeightM, z: 0 });
    const ne = this.transformer.localMetersToLatLon({ x: halfWidthM, y: halfHeightM, z: 0 });

    this.state.bounds = {
      south: sw.lat,
      west: sw.lon,
      north: ne.lat,
      east: ne.lon,
    };
  }

  fitBounds(bounds: GeoBoundingBox, padding = 0): void {
    // Calculate center
    const centerLat = (bounds.south + bounds.north) / 2;
    const centerLon = (bounds.west + bounds.east) / 2;

    // Calculate required zoom
    const latSpan = bounds.north - bounds.south;
    const lonSpan = bounds.east - bounds.west;

    // Convert to meters approximately
    const latMeters = latSpan * 111000;
    const lonMeters = lonSpan * 111000 * Math.cos((centerLat * Math.PI) / 180);

    const maxSpan = Math.max(latMeters, lonMeters);
    const targetPixels = Math.min(this.canvas.width, this.canvas.height) - padding * 2;
    const requiredMpp = maxSpan / targetPixels;

    this.state.center = { lat: centerLat, lon: centerLon };
    this.metersPerPixel = requiredMpp;
    this.state.zoom = zoomForResolution(centerLat, requiredMpp);
    this.updateBounds();
  }

  latLonToPixel(latLon: LatLon): { x: number; y: number } | null {
    const local = this.transformer.latLonToLocalMeters(latLon);
    return {
      x: this.canvas.width / 2 + local.x / this.metersPerPixel,
      y: this.canvas.height / 2 - local.y / this.metersPerPixel, // Y is inverted
    };
  }

  pixelToLatLon(pixel: { x: number; y: number }): LatLon | null {
    const localX = (pixel.x - this.canvas.width / 2) * this.metersPerPixel;
    const localY = (this.canvas.height / 2 - pixel.y) * this.metersPerPixel; // Y is inverted
    const result = this.transformer.localMetersToLatLon({ x: localX, y: localY, z: 0 });
    return { lat: result.lat, lon: result.lon };
  }

  getTransformer(): CoordinateTransformer {
    return this.transformer;
  }

  onMapClick(callback: (event: MapClickEvent) => void): () => void {
    this.clickCallbacks.add(callback);
    return () => this.clickCallbacks.delete(callback);
  }

  /** Simulate a click (call from external input handler) */
  simulateClick(pixel: { x: number; y: number }): void {
    const latLon = this.pixelToLatLon(pixel);
    if (!latLon) return;

    const local = this.transformer.latLonToLocalMeters(latLon);
    const event: MapClickEvent = { latLon, local, pixel };

    for (const callback of this.clickCallbacks) {
      callback(event);
    }
  }

  isReady(): boolean {
    return true;
  }

  destroy(): void {
    this.clickCallbacks.clear();
  }

  /** Get current meters per pixel */
  getMetersPerPixel(): number {
    return this.metersPerPixel;
  }

  /** Set canvas size */
  setCanvasSize(width: number, height: number): void {
    this.canvas = { width, height };
    this.updateBounds();
  }
}

// ============================================================================
// Google Maps Adapter (Interface only - implementation in apps/web)
// ============================================================================

/** Google Maps adapter options */
export interface GoogleMapsAdapterOptions {
  apiKey: string;
  mapId?: string;
  container: HTMLElement;
  origin: CoordinateOrigin;
  zoom?: number;
}

/**
 * Factory function type for creating Google Maps adapter
 * Implementation lives in apps/web to avoid bundling Google Maps SDK here
 */
export type CreateGoogleMapsAdapter = (
  options: GoogleMapsAdapterOptions
) => Promise<MapAdapter>;

// ============================================================================
// Map Bounds Utilities
// ============================================================================

/**
 * Convert geographic bounds to local bounds
 */
export function geoBoundsToLocal(
  bounds: GeoBoundingBox,
  transformer: CoordinateTransformer
): BoundingBox2D {
  return transformer.geoBoundsToLocalBounds(bounds);
}

/**
 * Convert local bounds to geographic bounds
 */
export function localBoundsToGeo(
  bounds: BoundingBox2D,
  transformer: CoordinateTransformer
): GeoBoundingBox {
  return transformer.localBoundsToGeoBounds(bounds);
}

/**
 * Expand geographic bounds by a distance in meters
 */
export function expandGeoBounds(
  bounds: GeoBoundingBox,
  marginMeters: number,
  transformer: CoordinateTransformer
): GeoBoundingBox {
  const local = transformer.geoBoundsToLocalBounds(bounds);
  const expanded: BoundingBox2D = {
    minX: local.minX - marginMeters,
    minY: local.minY - marginMeters,
    maxX: local.maxX + marginMeters,
    maxY: local.maxY + marginMeters,
  };
  return transformer.localBoundsToGeoBounds(expanded);
}
