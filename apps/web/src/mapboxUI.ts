/**
 * Mapbox UI Integration for GeoNoise
 * Handles UI wiring for the Mapbox map overlay feature
 */

import {
  getMapboxToken,
  setMapboxToken,
  clearMapboxToken,
  hasMapboxToken,
  loadMapboxLibrary,
  initializeMap,
  destroyMap,
  getMapDimensionsInMeters,
  type MapboxMap,
  type MapStyle,
} from "./mapbox.js";

// UI State
interface MapboxUIState {
  isMapVisible: boolean;
  isMapInteractive: boolean;
  map: MapboxMap | null;
  currentStyle: MapStyle;
}

const uiState: MapboxUIState = {
  isMapVisible: false,
  isMapInteractive: false,
  map: null,
  currentStyle: "dark",
};

// DOM Elements
let mapToggleButton: HTMLButtonElement | null = null;
let mapboxContainer: HTMLDivElement | null = null;
let mapboxTokenModal: HTMLDivElement | null = null;
let mapboxTokenInput: HTMLInputElement | null = null;
let mapboxTokenSave: HTMLButtonElement | null = null;
let mapboxTokenClear: HTMLButtonElement | null = null;
let mapboxTokenClose: HTMLButtonElement | null = null;
let mapboxTokenError: HTMLDivElement | null = null;
let mapboxTokenSuccess: HTMLDivElement | null = null;

// Floating panel elements
let loadMapButton: HTMLButtonElement | null = null;
let hideMapButton: HTMLButtonElement | null = null;
let toggleMapInteractiveButton: HTMLButtonElement | null = null;
let mapControls: HTMLDivElement | null = null;
let mapStatusBadge: HTMLSpanElement | null = null;
let mapOpacitySlider: HTMLInputElement | null = null;
let mapOpacityValue: HTMLSpanElement | null = null;
let mapScaleInfo: HTMLDivElement | null = null;
let mapCenterInfo: HTMLDivElement | null = null;
let mapStyleStreets: HTMLButtonElement | null = null;
let mapStyleSatellite: HTMLButtonElement | null = null;
let mapStyleDark: HTMLButtonElement | null = null;

// Callbacks for canvas synchronization
type ScaleSyncCallback = (metersPerPixel: number) => void;
type MapMoveCallback = (centerLat: number, centerLng: number, zoom: number) => void;

let onScaleSync: ScaleSyncCallback | null = null;
let onMapMove: MapMoveCallback | null = null;

/**
 * Initialize Mapbox UI integration
 */
export function initMapboxUI(options?: {
  onScaleSync?: ScaleSyncCallback;
  onMapMove?: MapMoveCallback;
}): void {
  // Store callbacks
  if (options?.onScaleSync) onScaleSync = options.onScaleSync;
  if (options?.onMapMove) onMapMove = options.onMapMove;

  // Get DOM elements
  mapToggleButton = document.getElementById("mapToggleButton") as HTMLButtonElement | null;
  mapboxContainer = document.getElementById("mapboxContainer") as HTMLDivElement | null;
  mapboxTokenModal = document.getElementById("mapboxTokenModal") as HTMLDivElement | null;
  mapboxTokenInput = document.getElementById("mapboxTokenInput") as HTMLInputElement | null;
  mapboxTokenSave = document.getElementById("mapboxTokenSave") as HTMLButtonElement | null;
  mapboxTokenClear = document.getElementById("mapboxTokenClear") as HTMLButtonElement | null;
  mapboxTokenClose = document.getElementById("mapboxTokenClose") as HTMLButtonElement | null;
  mapboxTokenError = document.getElementById("mapboxTokenError") as HTMLDivElement | null;
  mapboxTokenSuccess = document.getElementById("mapboxTokenSuccess") as HTMLDivElement | null;

  // Get floating panel elements
  loadMapButton = document.getElementById("loadMapButton") as HTMLButtonElement | null;
  hideMapButton = document.getElementById("hideMapButton") as HTMLButtonElement | null;
  toggleMapInteractiveButton = document.getElementById("toggleMapInteractiveButton") as HTMLButtonElement | null;
  mapControls = document.getElementById("mapControls") as HTMLDivElement | null;
  mapStatusBadge = document.getElementById("mapStatusBadge") as HTMLSpanElement | null;
  mapOpacitySlider = document.getElementById("mapOpacitySlider") as HTMLInputElement | null;
  mapOpacityValue = document.getElementById("mapOpacityValue") as HTMLSpanElement | null;
  mapScaleInfo = document.getElementById("mapScaleInfo") as HTMLDivElement | null;
  mapCenterInfo = document.getElementById("mapCenterInfo") as HTMLDivElement | null;
  mapStyleStreets = document.getElementById("mapStyleStreets") as HTMLButtonElement | null;
  mapStyleSatellite = document.getElementById("mapStyleSatellite") as HTMLButtonElement | null;
  mapStyleDark = document.getElementById("mapStyleDark") as HTMLButtonElement | null;

  // Wire up event listeners
  wireMapToggleButton();
  wireTokenModal();
  wireFloatingPanel();

  // Update button state based on whether token exists
  updateMapButtonState();
  updateFloatingPanelState();
}

/**
 * Wire the map toggle button
 */
function wireMapToggleButton(): void {
  if (!mapToggleButton) return;

  mapToggleButton.addEventListener("click", async () => {
    if (!hasMapboxToken()) {
      // No token configured, show modal
      openTokenModal();
      return;
    }

    // Toggle map visibility
    if (uiState.isMapVisible) {
      hideMap();
    } else {
      await showMap();
    }
  });
}

/**
 * Wire the token configuration modal
 */
function wireTokenModal(): void {
  if (!mapboxTokenModal) return;

  // Close button
  mapboxTokenClose?.addEventListener("click", () => {
    closeTokenModal();
  });

  // Backdrop close
  const backdrop = mapboxTokenModal.querySelector("[data-modal-close]");
  backdrop?.addEventListener("click", () => {
    closeTokenModal();
  });

  // Save button
  mapboxTokenSave?.addEventListener("click", async () => {
    await saveToken();
  });

  // Clear button
  mapboxTokenClear?.addEventListener("click", () => {
    clearToken();
  });

  // Enter key in input
  mapboxTokenInput?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      await saveToken();
    }
  });

  // Pre-fill input if token exists
  const existingToken = getMapboxToken();
  if (existingToken && mapboxTokenInput) {
    mapboxTokenInput.value = existingToken;
  }
}

/**
 * Open the token configuration modal
 */
function openTokenModal(): void {
  if (!mapboxTokenModal) return;

  // Pre-fill existing token
  const existingToken = getMapboxToken();
  if (existingToken && mapboxTokenInput) {
    mapboxTokenInput.value = existingToken;
  }

  // Clear messages
  hideError();
  hideSuccess();

  // Show modal
  mapboxTokenModal.classList.add("is-open");
  mapboxTokenModal.setAttribute("aria-hidden", "false");

  // Focus input
  mapboxTokenInput?.focus();
}

/**
 * Close the token configuration modal
 */
function closeTokenModal(): void {
  if (!mapboxTokenModal) return;

  mapboxTokenModal.classList.remove("is-open");
  mapboxTokenModal.setAttribute("aria-hidden", "true");
}

/**
 * Save the token and optionally show the map
 */
async function saveToken(): Promise<void> {
  const token = mapboxTokenInput?.value.trim();

  if (!token) {
    showError("Please enter a valid access token");
    return;
  }

  // Basic validation - Mapbox tokens start with "pk."
  if (!token.startsWith("pk.")) {
    showError("Invalid token format. Mapbox public tokens start with 'pk.'");
    return;
  }

  // Save token
  setMapboxToken(token);

  // Try to load the library to validate token works
  try {
    await loadMapboxLibrary();
    showSuccess("Token saved successfully!");
    updateMapButtonState();

    // Close modal after a brief delay and show map
    setTimeout(async () => {
      closeTokenModal();
      await showMap();
    }, 1000);
  } catch (error) {
    showError("Failed to load Mapbox library. Check your connection.");
  }
}

/**
 * Clear the stored token
 */
function clearToken(): void {
  clearMapboxToken();

  if (mapboxTokenInput) {
    mapboxTokenInput.value = "";
  }

  // Hide map if visible
  if (uiState.isMapVisible) {
    hideMap();
  }

  updateMapButtonState();
  showSuccess("Token cleared");
}

/**
 * Show the map overlay
 */
async function showMap(): Promise<void> {
  if (!mapboxContainer) return;

  const token = getMapboxToken();
  if (!token) {
    openTokenModal();
    return;
  }

  try {
    // Show container
    mapboxContainer.style.display = "block";

    // Initialize map if not already done
    if (!uiState.map) {
      uiState.map = await initializeMap({
        accessToken: token,
        container: mapboxContainer,
        style: uiState.currentStyle,
        center: [-122.4194, 37.7749], // Default: San Francisco
        zoom: 16,
        interactive: true, // Start interactive so user can position
      });

      // Set up map event listeners for synchronization
      setupMapSyncListeners();
    }

    // Start in interactive mode so user can position the map
    uiState.isMapInteractive = true;
    mapboxContainer.style.pointerEvents = "auto";
    mapboxContainer.style.zIndex = "2";

    uiState.isMapVisible = true;
    updateMapButtonState();
    updateFloatingPanelState();

    // Trigger initial scale sync
    syncScaleWithCanvas();
  } catch (error) {
    console.error("Failed to show map:", error);
    mapboxContainer.style.display = "none";
    showError("Failed to initialize map. Check your access token.");
    openTokenModal();
  }
}

/**
 * Hide the map overlay
 */
function hideMap(): void {
  if (!mapboxContainer) return;

  mapboxContainer.style.display = "none";
  uiState.isMapVisible = false;
  updateMapButtonState();
  updateFloatingPanelState();
}

/**
 * Wire the floating control panel
 */
function wireFloatingPanel(): void {
  // Load Map button
  loadMapButton?.addEventListener("click", async () => {
    if (!hasMapboxToken()) {
      openTokenModal();
      return;
    }
    await showMap();
    updateFloatingPanelState();
  });

  // Hide Map button
  hideMapButton?.addEventListener("click", () => {
    hideMap();
  });

  // Opacity slider
  mapOpacitySlider?.addEventListener("input", () => {
    const value = parseInt(mapOpacitySlider!.value, 10);
    if (mapOpacityValue) {
      mapOpacityValue.textContent = `${value}%`;
    }
    if (mapboxContainer) {
      mapboxContainer.style.opacity = String(value / 100);
    }
  });

  // Style buttons
  mapStyleStreets?.addEventListener("click", () => {
    changeMapStyle("streets");
  });

  mapStyleSatellite?.addEventListener("click", () => {
    changeMapStyle("satellite");
  });

  mapStyleDark?.addEventListener("click", () => {
    changeMapStyle("dark");
  });

  // Toggle Map Interactivity button
  toggleMapInteractiveButton?.addEventListener("click", () => {
    toggleMapInteractivity();
  });
}

/**
 * Change the map style
 */
function changeMapStyle(style: "streets" | "satellite" | "dark"): void {
  uiState.currentStyle = style;

  // Update button states
  const buttons = [
    { btn: mapStyleStreets, style: "streets" },
    { btn: mapStyleSatellite, style: "satellite" },
    { btn: mapStyleDark, style: "dark" },
  ];

  buttons.forEach(({ btn, style: s }) => {
    if (btn) {
      if (s === style) {
        btn.style.background = "rgba(74, 144, 217, 0.5)";
        btn.style.color = "#fff";
      } else {
        btn.style.background = "rgba(255,255,255,0.1)";
        btn.style.color = "#ccc";
      }
    }
  });

  // If map is active, update the style
  if (uiState.map) {
    const styleUrls: Record<string, string> = {
      streets: "mapbox://styles/mapbox/streets-v12",
      satellite: "mapbox://styles/mapbox/satellite-streets-v12",
      dark: "mapbox://styles/mapbox/dark-v11",
    };
    uiState.map.setStyle(styleUrls[style]);
  }
}

/**
 * Toggle map interactivity on/off
 * When interactive, user can pan/zoom the map directly
 * When not interactive, canvas gets all pointer events
 */
function toggleMapInteractivity(): void {
  uiState.isMapInteractive = !uiState.isMapInteractive;

  if (mapboxContainer) {
    if (uiState.isMapInteractive) {
      // Enable map interactivity - map gets pointer events
      mapboxContainer.style.pointerEvents = "auto";
      mapboxContainer.style.zIndex = "2"; // Put map on top temporarily
    } else {
      // Disable map interactivity - canvas gets pointer events
      mapboxContainer.style.pointerEvents = "none";
      mapboxContainer.style.zIndex = "0"; // Put map behind canvas

      // Sync canvas to current map view when exiting interactive mode
      syncScaleWithCanvas();
    }
  }

  updateInteractiveButtonState();
}

/**
 * Update the interactive button state
 */
function updateInteractiveButtonState(): void {
  if (!toggleMapInteractiveButton) return;

  if (uiState.isMapInteractive) {
    toggleMapInteractiveButton.textContent = "🔒 Lock Map (Edit Mode)";
    toggleMapInteractiveButton.style.background = "rgba(40, 167, 69, 0.3)";
    toggleMapInteractiveButton.style.color = "#28a745";
  } else {
    toggleMapInteractiveButton.textContent = "🔓 Enable Map Panning";
    toggleMapInteractiveButton.style.background = "rgba(74, 144, 217, 0.3)";
    toggleMapInteractiveButton.style.color = "#4a90d9";
  }
}

/**
 * Update the floating panel state based on map visibility
 */
function updateFloatingPanelState(): void {
  if (!mapControls || !loadMapButton || !mapStatusBadge) return;

  if (uiState.isMapVisible) {
    // Show controls, hide load button
    mapControls.style.display = "flex";
    loadMapButton.style.display = "none";
    mapStatusBadge.textContent = "ON";
    mapStatusBadge.style.background = "#28a745";

    // Update scale info
    updateMapInfo();

    // Update interactive button state
    updateInteractiveButtonState();
  } else {
    // Hide controls, show load button
    mapControls.style.display = "none";
    loadMapButton.style.display = "block";
    mapStatusBadge.textContent = "OFF";
    mapStatusBadge.style.background = "#dc3545";
  }
}

/**
 * Update the map info display
 */
function updateMapInfo(): void {
  if (!uiState.map || !mapScaleInfo || !mapCenterInfo) return;

  const dimensions = getMapDimensionsInMeters(uiState.map);
  const center = uiState.map.getCenter();

  mapScaleInfo.textContent = `Scale: ${dimensions.metersPerPixel.toFixed(2)} m/px`;
  mapCenterInfo.textContent = `Center: ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
}

/**
 * Set up listeners to sync map movements with canvas
 */
function setupMapSyncListeners(): void {
  if (!uiState.map) return;

  const map = uiState.map;

  // Sync on move/zoom
  map.on("moveend", () => {
    syncScaleWithCanvas();
  });

  map.on("zoomend", () => {
    syncScaleWithCanvas();
  });

  // Also sync during move for smoother experience
  map.on("move", () => {
    if (onMapMove) {
      const center = map.getCenter();
      const zoom = map.getZoom();
      onMapMove(center.lat, center.lng, zoom);
    }
  });
}

/**
 * Sync the canvas scale with the current map view
 */
function syncScaleWithCanvas(): void {
  if (!uiState.map) return;

  const dimensions = getMapDimensionsInMeters(uiState.map);

  // Update the info display
  updateMapInfo();

  // Call the callback if set
  if (onScaleSync) {
    onScaleSync(dimensions.metersPerPixel);
  }
}

/**
 * Update the map toggle button state
 */
function updateMapButtonState(): void {
  if (!mapToggleButton) return;

  const hasToken = hasMapboxToken();

  // Update button appearance
  if (uiState.isMapVisible) {
    mapToggleButton.classList.add("is-active");
    mapToggleButton.setAttribute("aria-pressed", "true");
    mapToggleButton.title = "Hide Map Overlay";
  } else {
    mapToggleButton.classList.remove("is-active");
    mapToggleButton.setAttribute("aria-pressed", "false");
    mapToggleButton.title = hasToken ? "Show Map Overlay" : "Configure Mapbox (no token)";
  }

  // Add indicator if no token
  if (!hasToken) {
    mapToggleButton.style.opacity = "0.6";
  } else {
    mapToggleButton.style.opacity = "1";
  }
}

/**
 * Show error message in modal
 */
function showError(message: string): void {
  if (!mapboxTokenError) return;
  mapboxTokenError.textContent = message;
  mapboxTokenError.style.display = "block";
  hideSuccess();
}

/**
 * Hide error message
 */
function hideError(): void {
  if (!mapboxTokenError) return;
  mapboxTokenError.style.display = "none";
}

/**
 * Show success message in modal
 */
function showSuccess(message: string): void {
  if (!mapboxTokenSuccess) return;
  mapboxTokenSuccess.textContent = message;
  mapboxTokenSuccess.style.display = "block";
  hideError();
}

/**
 * Hide success message
 */
function hideSuccess(): void {
  if (!mapboxTokenSuccess) return;
  mapboxTokenSuccess.style.display = "none";
}

/**
 * Get the current map instance (if visible)
 */
export function getActiveMap(): MapboxMap | null {
  return uiState.isMapVisible ? uiState.map : null;
}

/**
 * Check if map is currently visible
 */
export function isMapVisible(): boolean {
  return uiState.isMapVisible;
}

/**
 * Check if map is currently in interactive mode
 */
export function isMapInteractive(): boolean {
  return uiState.isMapInteractive;
}

/**
 * Get current map dimensions in meters
 */
export function getMapDimensions(): ReturnType<typeof getMapDimensionsInMeters> | null {
  if (!uiState.map || !uiState.isMapVisible) return null;
  return getMapDimensionsInMeters(uiState.map);
}

/**
 * Set map style
 */
export function setMapStyle(style: MapStyle): void {
  uiState.currentStyle = style;
  // If map is active, this would need to update the style
  // For now, style is only applied on initialization
}

/**
 * Toggle map visibility
 */
export async function toggleMap(): Promise<void> {
  if (uiState.isMapVisible) {
    hideMap();
  } else {
    await showMap();
  }
}

/**
 * Clean up resources
 */
export function destroyMapboxUI(): void {
  destroyMap();
  uiState.map = null;
  uiState.isMapVisible = false;
}

/**
 * Sync map zoom to match canvas pixels-per-meter
 * Called from main.ts when canvas zoom changes
 */
export function syncMapToCanvasZoom(pixelsPerMeter: number, _canvasCenterX: number, _canvasCenterY: number): void {
  if (!uiState.map || !uiState.isMapVisible) return;

  // Calculate the zoom level needed to match the canvas scale
  // metersPerPixel = 1 / pixelsPerMeter
  const metersPerPixel = 1 / pixelsPerMeter;

  // Get current center latitude for accurate calculation
  const currentCenter = uiState.map.getCenter();
  const lat = currentCenter.lat;

  // Earth's circumference at equator in meters
  const EARTH_CIRCUMFERENCE = 40075016.686;
  const TILE_SIZE = 512;

  // Reverse the meters-per-pixel formula to get zoom
  // metersPerPixel = (EARTH_CIRCUMFERENCE / (TILE_SIZE * 2^zoom)) * cos(lat)
  // zoom = log2(EARTH_CIRCUMFERENCE * cos(lat) / (metersPerPixel * TILE_SIZE))
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const zoom = Math.log2((EARTH_CIRCUMFERENCE * cosLat) / (metersPerPixel * TILE_SIZE));

  // Clamp zoom to valid range
  const clampedZoom = Math.max(0, Math.min(22, zoom));

  uiState.map.setZoom(clampedZoom);

  // Update the info display
  updateMapInfo();
}

/**
 * Sync map pan to match canvas pan offset
 * Called from main.ts when canvas is panned
 * 
 * @param deltaX - Change in canvas X offset (in meters)
 * @param deltaY - Change in canvas Y offset (in meters)
 * @param pixelsPerMeter - Current canvas pixels per meter
 */
export function syncMapToCanvasPan(deltaX: number, deltaY: number, pixelsPerMeter: number): void {
  if (!uiState.map || !uiState.isMapVisible || uiState.isMapInteractive) return;

  // Convert delta from meters to pixels
  const deltaPixelsX = deltaX * pixelsPerMeter;
  const deltaPixelsY = deltaY * pixelsPerMeter;

  // panBy expects [x, y] in pixels - note Y is inverted (canvas Y goes up, screen Y goes down)
  uiState.map.panBy([-deltaPixelsX, deltaPixelsY], { duration: 0 });

  // Update the info display
  updateMapInfo();
}

/**
 * Get the current meters per pixel from the map
 */
export function getMapMetersPerPixel(): number | null {
  if (!uiState.map || !uiState.isMapVisible) return null;

  const dimensions = getMapDimensionsInMeters(uiState.map);
  return dimensions.metersPerPixel;
}

/**
 * Set map zoom level directly
 */
export function setMapZoom(zoom: number): void {
  if (!uiState.map) return;
  uiState.map.setZoom(zoom);
  updateMapInfo();
}

/**
 * Get current map zoom level
 */
export function getMapZoom(): number | null {
  if (!uiState.map) return null;
  return uiState.map.getZoom();
}
