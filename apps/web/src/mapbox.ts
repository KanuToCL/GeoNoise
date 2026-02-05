/**
 * Mapbox GL JS Integration for GeoNoise
 * Handles map loading, initialization, and coordinate transformations
 */

// MapBox GL JS types - loaded via CDN
export interface MapboxMap {
  addControl: (control: unknown, position?: string) => void;
  on: (event: string, handler: (e: unknown) => void) => void;
  off: (event: string, handler: (e: unknown) => void) => void;
  setStyle: (style: string) => void;
  remove: () => void;
  resize: () => void;
  getCenter: () => { lat: number; lng: number };
  getZoom: () => number;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  panBy: (offset: [number, number], options?: { duration?: number }) => void;
  getBounds: () => {
    getNorth: () => number;
    getSouth: () => number;
    getEast: () => number;
    getWest: () => number;
  };
  getContainer: () => HTMLElement;
  project: (lngLat: [number, number]) => { x: number; y: number };
  unproject: (point: { x: number; y: number }) => { lng: number; lat: number };
}

export interface MapboxMarker {
  setLngLat: (lnglat: [number, number]) => MapboxMarker;
  addTo: (map: MapboxMap) => MapboxMarker;
  remove: () => void;
  on: (event: string, handler: () => void) => void;
  getLngLat: () => { lat: number; lng: number };
  getElement: () => HTMLElement;
}

export interface MapboxGL {
  accessToken: string;
  Map: new (options: {
    container: HTMLElement;
    style: string;
    center: [number, number];
    zoom: number;
    interactive?: boolean;
  }) => MapboxMap;
  NavigationControl: new () => unknown;
  ScaleControl: new (options?: { maxWidth?: number; unit?: 'imperial' | 'metric' | 'nautical' }) => unknown;
  Marker: new (options?: { element?: HTMLElement; draggable?: boolean }) => MapboxMarker;
}

declare global {
  interface Window {
    mapboxgl: MapboxGL;
  }
}

// Mapbox configuration
const MAPBOX_GL_VERSION = "3.2.0";
const MAPBOX_CSS_URL = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.css`;
const MAPBOX_JS_URL = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.js`;

// Default token from Ordinance project
const DEFAULT_MAPBOX_TOKEN = "pk.eyJ1Ijoic2VyZ2lvcGVuYXYiLCJhIjoiY21sMThpbml1MDU3djNlb3hqMHUxazB6NCJ9.GvhwQiTS9yF_tEc0YkDXxA";

export type MapStyle = "streets" | "satellite" | "dark" | "light";

const STYLE_URLS: Record<MapStyle, string> = {
  streets: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/light-v11",
};

export interface MapboxConfig {
  accessToken: string;
  container: HTMLElement;
  style?: MapStyle;
  center?: [number, number];
  zoom?: number;
  interactive?: boolean;
}

export interface MapboxState {
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  map: MapboxMap | null;
}

// Module state
const mapboxState: MapboxState = {
  isLoaded: false,
  isLoading: false,
  error: null,
  map: null,
};

let loadPromise: Promise<void> | null = null;

/**
 * Get the Mapbox access token from environment or localStorage
 */
export function getMapboxToken(): string | null {
  // Check localStorage first (for user-provided token)
  const storedToken = localStorage.getItem("mapbox_access_token");
  if (storedToken) {
    return storedToken;
  }

  // Check for environment variable (injected at build time or via meta tag)
  const metaToken = document.querySelector<HTMLMetaElement>(
    'meta[name="mapbox-token"]'
  )?.content;
  if (metaToken) {
    return metaToken;
  }

  // Fall back to default token
  return DEFAULT_MAPBOX_TOKEN;
}

/**
 * Set the Mapbox access token in localStorage
 */
export function setMapboxToken(token: string): void {
  localStorage.setItem("mapbox_access_token", token);
}

/**
 * Clear the stored Mapbox access token
 */
export function clearMapboxToken(): void {
  localStorage.removeItem("mapbox_access_token");
}

/**
 * Check if Mapbox token is configured
 */
export function hasMapboxToken(): boolean {
  return getMapboxToken() !== null;
}

/**
 * Load the Mapbox GL JS library from CDN
 */
export function loadMapboxLibrary(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  if (window.mapboxgl) {
    mapboxState.isLoaded = true;
    return Promise.resolve();
  }

  mapboxState.isLoading = true;

  loadPromise = new Promise((resolve, reject) => {
    // Check if script already exists
    const existingScript = document.querySelector(
      `script[src*="mapbox-gl"]`
    ) as HTMLScriptElement | null;

    if (existingScript) {
      if (window.mapboxgl) {
        mapboxState.isLoaded = true;
        mapboxState.isLoading = false;
        resolve();
      } else {
        existingScript.addEventListener("load", () => {
          mapboxState.isLoaded = true;
          mapboxState.isLoading = false;
          resolve();
        });
        existingScript.addEventListener("error", () => {
          mapboxState.isLoading = false;
          mapboxState.error = "Failed to load Mapbox GL JS";
          reject(new Error(mapboxState.error));
        });
      }
      return;
    }

    // Add CSS
    if (!document.querySelector(`link[href*="mapbox-gl"]`)) {
      const link = document.createElement("link");
      link.href = MAPBOX_CSS_URL;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }

    // Add Script
    const script = document.createElement("script");
    script.src = MAPBOX_JS_URL;
    script.async = true;

    script.onload = () => {
      mapboxState.isLoaded = true;
      mapboxState.isLoading = false;
      resolve();
    };

    script.onerror = () => {
      mapboxState.isLoading = false;
      mapboxState.error = "Failed to load Mapbox GL JS script";
      reject(new Error(mapboxState.error));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Initialize a Mapbox map instance
 */
export async function initializeMap(config: MapboxConfig): Promise<MapboxMap> {
  const { accessToken, container, style = "dark", center = [-122.4194, 37.7749], zoom = 12, interactive = true } = config;

  // Load the library first
  await loadMapboxLibrary();

  const mapboxgl = window.mapboxgl;
  if (!mapboxgl) {
    throw new Error("Mapbox GL JS not loaded");
  }

  // Set access token
  mapboxgl.accessToken = accessToken;

  // Create map instance - non-interactive by default so canvas gets pointer events
  const map = new mapboxgl.Map({
    container,
    style: STYLE_URLS[style],
    center,
    zoom,
    interactive,
  });

  // Only add navigation controls if interactive
  if (interactive) {
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
  }

  // Always add scale control for verification (bottom-left to compare with GeoNoise scale bar)
  map.addControl(new mapboxgl.ScaleControl({ maxWidth: 150, unit: 'metric' }), "bottom-left");

  // Wait for map to load
  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      resolve(); // Resolve anyway after timeout
    }, 10000);

    map.on("load", () => {
      clearTimeout(timeoutId);
      map.resize();
      resolve();
    });

    map.on("error", (e: unknown) => {
      clearTimeout(timeoutId);
      console.error("Mapbox error:", e);
      reject(new Error("Mapbox map failed to load"));
    });
  });

  mapboxState.map = map;
  return map;
}

/**
 * Get the current Mapbox state
 */
export function getMapboxState(): Readonly<MapboxState> {
  return { ...mapboxState };
}

/**
 * Clean up Mapbox resources
 */
export function destroyMap(): void {
  if (mapboxState.map) {
    mapboxState.map.remove();
    mapboxState.map = null;
  }
}

/**
 * Calculate meters per pixel at a given latitude and zoom level
 * This is critical for 1:1 scaling with GeoNoise canvas
 */
export function getMetersPerPixel(latitude: number, zoom: number): number {
  // Earth's circumference at the equator in meters
  const EARTH_CIRCUMFERENCE = 40075016.686;
  // Mapbox uses 512x512 tiles
  const TILE_SIZE = 512;

  // Meters per pixel at the equator for the given zoom level
  const metersPerPixelAtEquator = EARTH_CIRCUMFERENCE / (TILE_SIZE * Math.pow(2, zoom));

  // Adjust for latitude (Mercator projection)
  const metersPerPixel = metersPerPixelAtEquator * Math.cos((latitude * Math.PI) / 180);

  return metersPerPixel;
}

/**
 * Calculate the real-world bounds of the visible map area
 * Returns dimensions in meters
 */
export function getMapDimensionsInMeters(map: MapboxMap): {
  widthMeters: number;
  heightMeters: number;
  centerLat: number;
  centerLng: number;
  metersPerPixel: number;
} {
  const container = map.getContainer();
  const center = map.getCenter();
  const zoom = map.getZoom();

  const metersPerPixel = getMetersPerPixel(center.lat, zoom);

  const widthPixels = container.clientWidth;
  const heightPixels = container.clientHeight;

  return {
    widthMeters: widthPixels * metersPerPixel,
    heightMeters: heightPixels * metersPerPixel,
    centerLat: center.lat,
    centerLng: center.lng,
    metersPerPixel,
  };
}

/**
 * Convert map pixel coordinates to GeoNoise world coordinates (meters)
 * Origin is at center of map
 */
export function mapPixelToWorldMeters(
  map: MapboxMap,
  pixelX: number,
  pixelY: number
): { x: number; y: number } {
  const container = map.getContainer();
  const center = map.getCenter();
  const zoom = map.getZoom();

  const metersPerPixel = getMetersPerPixel(center.lat, zoom);

  // Convert from pixel coords (0,0 at top-left) to world coords (0,0 at center)
  const centerX = container.clientWidth / 2;
  const centerY = container.clientHeight / 2;

  return {
    x: (pixelX - centerX) * metersPerPixel,
    y: (centerY - pixelY) * metersPerPixel, // Flip Y axis
  };
}

/**
 * Convert GeoNoise world coordinates (meters) to map pixel coordinates
 */
export function worldMetersToMapPixel(
  map: MapboxMap,
  x: number,
  y: number
): { pixelX: number; pixelY: number } {
  const container = map.getContainer();
  const center = map.getCenter();
  const zoom = map.getZoom();

  const metersPerPixel = getMetersPerPixel(center.lat, zoom);

  const centerX = container.clientWidth / 2;
  const centerY = container.clientHeight / 2;

  return {
    pixelX: centerX + x / metersPerPixel,
    pixelY: centerY - y / metersPerPixel, // Flip Y axis
  };
}

/**
 * Convert longitude/latitude to GeoNoise world coordinates (meters)
 * Uses the map's current center as origin
 */
export function lngLatToWorldMeters(
  map: MapboxMap,
  lng: number,
  lat: number
): { x: number; y: number } {
  const projected = map.project([lng, lat]);
  return mapPixelToWorldMeters(map, projected.x, projected.y);
}

/**
 * Convert GeoNoise world coordinates (meters) to longitude/latitude
 */
export function worldMetersToLngLat(
  map: MapboxMap,
  x: number,
  y: number
): { lng: number; lat: number } {
  const pixel = worldMetersToMapPixel(map, x, y);
  return map.unproject({ x: pixel.pixelX, y: pixel.pixelY });
}

/**
 * Geocoding result from Mapbox API
 */
export interface GeocodingResult {
  place_name: string;
  center: [number, number]; // [lng, lat]
}

/**
 * Search for a location using Mapbox Geocoding API
 */
export async function geocodeSearch(query: string, accessToken: string): Promise<GeocodingResult[]> {
  if (!query.trim()) return [];

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${accessToken}&limit=5`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    return data.features.map((f: { place_name: string; center: [number, number] }) => ({
      place_name: f.place_name,
      center: f.center,
    }));
  } catch {
    return [];
  }
}
