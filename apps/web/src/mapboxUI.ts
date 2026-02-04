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
  geocodeSearch,
  type MapboxMap,
  type MapStyle,
  type GeocodingResult,
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

// Search and coordinate input elements
let mapSearchInput: HTMLInputElement | null = null;
let mapSearchResults: HTMLDivElement | null = null;
let mapLatInput: HTMLInputElement | null = null;
let mapLngInput: HTMLInputElement | null = null;
let mapGoToCoords: HTMLButtonElement | null = null;

// Search state
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentSearchResults: GeocodingResult[] = [];

// Callbacks for canvas synchronization
type ScaleSyncCallback = (metersPerPixel: number) => void;
type MapMoveCallback = (centerLat: number, centerLng: number, zoom: number) => void;
type GetPixelsPerMeterCallback = () => number;

let onScaleSync: ScaleSyncCallback | null = null;
let onMapMove: MapMoveCallback | null = null;
let getPixelsPerMeter: GetPixelsPerMeterCallback | null = null;

/**
 * Initialize Mapbox UI integration
 */
export function initMapboxUI(options?: {
  onScaleSync?: ScaleSyncCallback;
  onMapMove?: MapMoveCallback;
  getPixelsPerMeter?: GetPixelsPerMeterCallback;
}): void {
  // Store callbacks
  if (options?.onScaleSync) onScaleSync = options.onScaleSync;
  if (options?.onMapMove) onMapMove = options.onMapMove;
  if (options?.getPixelsPerMeter) getPixelsPerMeter = options.getPixelsPerMeter;

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

  // Search and coordinate input elements
  mapSearchInput = document.getElementById("mapSearchInput") as HTMLInputElement | null;
  mapSearchResults = document.getElementById("mapSearchResults") as HTMLDivElement | null;
  mapLatInput = document.getElementById("mapLatInput") as HTMLInputElement | null;
  mapLngInput = document.getElementById("mapLngInput") as HTMLInputElement | null;
  mapGoToCoords = document.getElementById("mapGoToCoords") as HTMLButtonElement | null;

  // Wire up event listeners
  wireMapToggleButton();
  wireTokenModal();
  wireFloatingPanel();
  wireLocationSearch();
  wireCoordinateInput();
  initScaleComparisonDrag();

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
        interactive: true, // Keep interactive for internal use, we control via pointer-events
      });

      // Set up map event listeners for synchronization
      setupMapSyncListeners();
    }

    // Start in LOCKED mode (edit mode) - canvas gets pointer events
    // Map is automatically synced to canvas scale
    uiState.isMapInteractive = false;
    mapboxContainer.style.pointerEvents = "none";
    mapboxContainer.style.zIndex = "0";

    uiState.isMapVisible = true;
    updateMapButtonState();
    updateFloatingPanelState();
    updateInteractiveButtonState();

    // Auto-sync map zoom to match canvas scale for 1:1 accuracy
    if (getPixelsPerMeter) {
      const ppm = getPixelsPerMeter();
      syncMapZoomToCanvas(ppm);
    }
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

  // Hide scale comparison panel
  const comparisonPanel = document.getElementById("scaleComparisonPanel");
  if (comparisonPanel) {
    comparisonPanel.style.display = "none";
  }
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

      // Sync MAP zoom to match CANVAS scale when locking
      if (uiState.map && getPixelsPerMeter) {
        const ppm = getPixelsPerMeter();
        syncMapZoomToCanvas(ppm);
      }
    }
  }

  updateInteractiveButtonState();
}

/**
 * Sync the map zoom level to match the canvas pixels-per-meter
 * This ensures 1:1 scale accuracy when locking the map
 */
function syncMapZoomToCanvas(pixelsPerMeter: number): void {
  if (!uiState.map) return;

  // Calculate the zoom level needed to match the canvas scale
  const metersPerPixel = 1 / pixelsPerMeter;

  // Get current center latitude for accurate calculation
  const currentCenter = uiState.map.getCenter();
  const lat = currentCenter.lat;

  // Earth's circumference at equator in meters
  const EARTH_CIRCUMFERENCE = 40075016.686;
  const TILE_SIZE = 512;

  // Reverse the meters-per-pixel formula to get zoom
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const zoom = Math.log2((EARTH_CIRCUMFERENCE * cosLat) / (metersPerPixel * TILE_SIZE));

  // Clamp zoom to valid range
  const clampedZoom = Math.max(0, Math.min(22, zoom));

  uiState.map.setZoom(clampedZoom);

  // Update the info display
  updateMapInfo();
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

  // Update scale comparison panel
  updateScaleComparisonPanel(dimensions.metersPerPixel);
}

/**
 * Update the scale comparison panel with current Mapbox scale
 */
function updateScaleComparisonPanel(mapboxMetersPerPixel: number): void {
  const panel = document.getElementById("scaleComparisonPanel");
  const mapboxBar = document.getElementById("mapboxCompareBar");
  const mapboxText = document.getElementById("mapboxCompareText");
  const geonoiseBar = document.getElementById("geonoiseCompareBar");
  const geonoiseText = document.getElementById("geonoiseCompareText");
  const matchIndicator = document.getElementById("scaleMatchIndicator");

  if (!panel || !mapboxBar || !mapboxText || !geonoiseBar || !geonoiseText || !matchIndicator) return;

  // Show the panel
  panel.style.display = "block";

  // Calculate nice round distance for 100 pixels
  const referencePixels = 100;
  void (mapboxMetersPerPixel * referencePixels); // Mapbox meters available for future use

  // Get GeoNoise scale from the scale bar element
  const scaleTextEl = document.getElementById("scaleText");
  const scaleLineEl = document.getElementById("scaleLine");
  let geonoiseMeters = 100;
  let geonoisePixels = 100;

  if (scaleTextEl && scaleLineEl) {
    const textMatch = scaleTextEl.textContent?.match(/(\d+)/);
    if (textMatch) {
      geonoiseMeters = parseInt(textMatch[1], 10);
    }
    const widthMatch = scaleLineEl.style.width?.match(/(\d+)/);
    if (widthMatch) {
      geonoisePixels = parseInt(widthMatch[1], 10);
    }
  }

  // Calculate meters per pixel for GeoNoise
  const geonoiseMetersPerPixel = geonoiseMeters / geonoisePixels;

  // Use a fixed 100m reference for both bars
  const refMeters = 50; // Reference distance in meters
  const mapboxWidth = refMeters / mapboxMetersPerPixel;
  const geonoiseWidth = refMeters / geonoiseMetersPerPixel;

  // Update the comparison bars
  mapboxBar.style.width = `${Math.min(150, mapboxWidth)}px`;
  mapboxText.textContent = `${refMeters} m (${mapboxMetersPerPixel.toFixed(2)} m/px)`;

  geonoiseBar.style.width = `${Math.min(150, geonoiseWidth)}px`;
  geonoiseText.textContent = `${refMeters} m (${geonoiseMetersPerPixel.toFixed(2)} m/px)`;

  // Check if scales match (within 5% tolerance)
  const ratio = mapboxMetersPerPixel / geonoiseMetersPerPixel;
  const tolerance = 0.05;

  if (Math.abs(ratio - 1) <= tolerance) {
    matchIndicator.style.background = "#28a745";
    matchIndicator.textContent = `✓ SCALES MATCH (${((1 - Math.abs(ratio - 1)) * 100).toFixed(1)}% accurate)`;
  } else if (ratio > 1) {
    matchIndicator.style.background = "#dc3545";
    matchIndicator.textContent = `✗ Mapbox ${(ratio).toFixed(2)}x larger - zoom in on map`;
  } else {
    matchIndicator.style.background = "#dc3545";
    matchIndicator.textContent = `✗ GeoNoise ${(1/ratio).toFixed(2)}x larger - zoom out on map`;
  }
}

/**
 * Initialize drag functionality for the scale comparison panel
 */
function initScaleComparisonDrag(): void {
  const panel = document.getElementById("scaleComparisonPanel");
  if (!panel) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialBottom = 0;

  const onMouseDown = (e: MouseEvent) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    // Get current position
    const rect = panel.getBoundingClientRect();
    initialLeft = rect.left;
    initialBottom = window.innerHeight - rect.bottom;

    // Switch to left/top positioning for dragging
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.bottom = "auto";

    panel.style.cursor = "grabbing";
    e.preventDefault();
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    const newLeft = initialLeft + deltaX;
    const newTop = (window.innerHeight - initialBottom - panel.offsetHeight) + deltaY;

    // Keep panel within viewport bounds
    const maxLeft = window.innerWidth - panel.offsetWidth - 10;
    const maxTop = window.innerHeight - panel.offsetHeight - 10;

    panel.style.left = `${Math.max(10, Math.min(maxLeft, newLeft))}px`;
    panel.style.top = `${Math.max(10, Math.min(maxTop, newTop))}px`;
  };

  const onMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      panel.style.cursor = "move";
    }
  };

  panel.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  // Touch support for mobile
  panel.addEventListener("touchstart", (e: TouchEvent) => {
    const touch = e.touches[0];
    onMouseDown({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault() } as MouseEvent);
  });

  document.addEventListener("touchmove", (e: TouchEvent) => {
    const touch = e.touches[0];
    onMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
  });

  document.addEventListener("touchend", onMouseUp);
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
    updateCoordinateInputs();
  });

  map.on("zoomend", () => {
    syncScaleWithCanvas();
  });

  // Also sync during move for smoother experience
  map.on("move", () => {
    updateCoordinateInputs();
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

/**
 * Update coordinate input fields with current map center
 */
function updateCoordinateInputs(): void {
  if (!uiState.map) return;

  const center = uiState.map.getCenter();

  if (mapLatInput && document.activeElement !== mapLatInput) {
    mapLatInput.value = center.lat.toFixed(6);
  }
  if (mapLngInput && document.activeElement !== mapLngInput) {
    mapLngInput.value = center.lng.toFixed(6);
  }
}

/**
 * Wire location search input with debounced geocoding
 */
function wireLocationSearch(): void {
  if (!mapSearchInput || !mapSearchResults) return;

  // Debounced search on input
  mapSearchInput.addEventListener("input", () => {
    const query = mapSearchInput!.value.trim();

    // Clear existing timer
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    // Hide results if query is empty
    if (!query) {
      hideSearchResults();
      return;
    }

    // Debounce search
    searchDebounceTimer = setTimeout(async () => {
      const token = getMapboxToken();
      if (!token) return;

      const results = await geocodeSearch(query, token);
      currentSearchResults = results;
      displaySearchResults(results);
    }, 300);
  });

  // Hide results when clicking outside
  document.addEventListener("click", (e) => {
    if (!mapSearchInput?.contains(e.target as Node) && !mapSearchResults?.contains(e.target as Node)) {
      hideSearchResults();
    }
  });

  // Handle keyboard navigation
  mapSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideSearchResults();
      mapSearchInput!.blur();
    } else if (e.key === "Enter" && currentSearchResults.length > 0) {
      selectSearchResult(currentSearchResults[0]);
    }
  });
}

/**
 * Display search results dropdown
 */
function displaySearchResults(results: GeocodingResult[]): void {
  if (!mapSearchResults) return;

  if (results.length === 0) {
    mapSearchResults.innerHTML = `<div style="padding: 10px; font-size: 11px; color: #888;">No results found</div>`;
    mapSearchResults.style.display = "block";
    return;
  }

  mapSearchResults.innerHTML = results
    .map(
      (result, index) => `
      <div class="map-search-result" data-index="${index}" style="
        padding: 10px 12px;
        font-size: 11px;
        color: #ddd;
        cursor: pointer;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        transition: background 0.15s;
      " onmouseover="this.style.background='rgba(74,144,217,0.2)'" onmouseout="this.style.background='transparent'">
        ${escapeHtml(result.place_name)}
      </div>
    `
    )
    .join("");

  mapSearchResults.style.display = "block";

  // Add click handlers to results
  const resultElements = mapSearchResults.querySelectorAll(".map-search-result");
  resultElements.forEach((el) => {
    el.addEventListener("click", () => {
      const index = parseInt(el.getAttribute("data-index") || "0", 10);
      selectSearchResult(currentSearchResults[index]);
    });
  });
}

/**
 * Hide search results dropdown
 */
function hideSearchResults(): void {
  if (mapSearchResults) {
    mapSearchResults.style.display = "none";
    mapSearchResults.innerHTML = "";
  }
  currentSearchResults = [];
}

/**
 * Select a search result and navigate to it
 */
function selectSearchResult(result: GeocodingResult): void {
  if (!uiState.map) return;

  const [lng, lat] = result.center;
  uiState.map.setCenter([lng, lat]);
  uiState.map.setZoom(16); // Good default zoom for buildings/streets

  // Update UI
  hideSearchResults();
  if (mapSearchInput) {
    mapSearchInput.value = "";
  }
  updateMapInfo();
  updateCoordinateInputs();
}

/**
 * Wire coordinate input fields
 */
function wireCoordinateInput(): void {
  // Go button click
  mapGoToCoords?.addEventListener("click", () => {
    navigateToCoordinates();
  });

  // Enter key in inputs
  mapLatInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      navigateToCoordinates();
    }
  });

  mapLngInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      navigateToCoordinates();
    }
  });
}

/**
 * Navigate to coordinates entered in input fields
 */
function navigateToCoordinates(): void {
  if (!uiState.map || !mapLatInput || !mapLngInput) return;

  const lat = parseFloat(mapLatInput.value);
  const lng = parseFloat(mapLngInput.value);

  // Validate coordinates
  if (isNaN(lat) || isNaN(lng)) {
    // Flash the inputs red briefly
    flashInputError(mapLatInput);
    flashInputError(mapLngInput);
    return;
  }

  // Validate ranges
  if (lat < -85 || lat > 85 || lng < -180 || lng > 180) {
    flashInputError(mapLatInput);
    flashInputError(mapLngInput);
    return;
  }

  uiState.map.setCenter([lng, lat]);
  updateMapInfo();
}

/**
 * Flash an input field red to indicate error
 */
function flashInputError(input: HTMLInputElement): void {
  const originalBg = input.style.background;
  input.style.background = "rgba(220, 53, 69, 0.3)";
  setTimeout(() => {
    input.style.background = originalBg;
  }, 300);
}

/**
 * Escape HTML to prevent XSS in search results
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
