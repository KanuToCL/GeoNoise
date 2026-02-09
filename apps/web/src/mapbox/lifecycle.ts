/**
 * Map lifecycle: show, hide, style switching, zoom/pan sync, button state.
 */

import {
  getMapboxToken,
  hasMapboxToken,
  loadMapboxLibrary,
  initializeMap,
  getMapDimensionsInMeters,
} from "../mapbox.js";

import {
  uiState,
  mapboxContainer,
  mapToggleButton,
  mapControls,
  loadMapButton,
  mapStatusBadge,
  mapScaleInfo,
  mapCenterInfo,
  mapStyleStreets,
  mapStyleSatellite,
  mapStyleDark,
  mapCrossfader,
  onScaleSync,
  onMapMove,
  getPixelsPerMeter,
  onCrossfaderChange,
  mapOpacitySlider,
  mapOpacityValue,
  setMapCrossfader,
  debugEnabled,
} from "./state.js";

import { openTokenModal, showError } from "./token.js";
import { updateScaleComparisonPanel } from "./scaleComparison.js";
import { updateCoordinateInputs } from "./search.js";

// ── Map toggle (dock button) ────────────────────────────────────────────────

export function wireMapToggleButton(): void {
  if (!mapToggleButton) return;

  mapToggleButton.addEventListener("click", async () => {
    if (!hasMapboxToken()) {
      openTokenModal();
      return;
    }

    if (uiState.isMapVisible) {
      hideMap();
    } else {
      await showMap();
    }
  });
}

// ── Show / hide ─────────────────────────────────────────────────────────────

export async function showMap(): Promise<void> {
  if (!mapboxContainer) return;

  if (!hasMapboxToken()) {
    openTokenModal();
    return;
  }

  const token = getMapboxToken()!;
  mapboxContainer.style.display = "block";

  try {
    await loadMapboxLibrary();

    if (!uiState.map) {
      uiState.map = await initializeMap({
        accessToken: token,
        container: mapboxContainer,
        style: uiState.currentStyle,
        center: [-122.4194, 37.7749],
        zoom: 16,
        interactive: true,
      });

      setupMapSyncListeners();
    }

    uiState.isMapInteractive = false;
    mapboxContainer.style.pointerEvents = "none";
    mapboxContainer.style.zIndex = "0";
    mapboxContainer.style.opacity = String(mapCrossfader / 100);

    uiState.isMapVisible = true;
    updateMapButtonState();
    updateFloatingPanelState();

    // Show the map control panel — always expanded on activation
    const mapPanel = document.getElementById("mapControlPanel");
    if (mapPanel) {
      mapPanel.style.display = "flex";
      mapPanel.classList.remove("is-collapsed");
    }

    if (getPixelsPerMeter) {
      const ppm = getPixelsPerMeter();
      syncMapZoomToCanvas(ppm);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (uiState.map) {
          uiState.map.resize();
          const center = uiState.map.getCenter();
          uiState.map.setCenter([center.lng, center.lat]);
        }
      });
    });
  } catch (error) {
    console.error("Failed to show map:", error);
    mapboxContainer.style.display = "none";
    showError("Failed to initialize map. Check your access token.");
    openTokenModal();
  }
}

export function hideMap(): void {
  if (!mapboxContainer) return;

  mapboxContainer.style.display = "none";
  uiState.isMapVisible = false;
  updateMapButtonState();
  updateFloatingPanelState();

  const comparisonPanel = document.getElementById("scaleComparisonPanel");
  if (comparisonPanel) {
    comparisonPanel.style.display = "none";
  }

  const mapPanel = document.getElementById("mapControlPanel");
  if (mapPanel) {
    mapPanel.style.display = "none";
  }
}

// ── Style switching ─────────────────────────────────────────────────────────

export function changeMapStyle(style: "streets" | "satellite" | "dark"): void {
  uiState.currentStyle = style;

  const buttons = [
    { btn: mapStyleStreets, style: "streets" },
    { btn: mapStyleSatellite, style: "satellite" },
    { btn: mapStyleDark, style: "dark" },
  ];

  buttons.forEach(({ btn, style: s }) => {
    if (btn) {
      if (s === style) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
    }
  });

  if (uiState.map) {
    const styleUrls: Record<string, string> = {
      streets: "mapbox://styles/mapbox/streets-v12",
      satellite: "mapbox://styles/mapbox/satellite-streets-v12",
      dark: "mapbox://styles/mapbox/dark-v11",
    };
    uiState.map.setStyle(styleUrls[style]);
  }
}

// ── Floating panel state ────────────────────────────────────────────────────

export function wireFloatingPanelControls(): void {
  loadMapButton?.addEventListener("click", async () => {
    if (!hasMapboxToken()) {
      openTokenModal();
      return;
    }
    await showMap();
    updateFloatingPanelState();
  });

  // Crossfader slider
  mapOpacitySlider?.addEventListener("input", () => {
    const value = parseInt(mapOpacitySlider!.value, 10);
    setMapCrossfader(value);
    if (mapOpacityValue) {
      mapOpacityValue.textContent = `${value}%`;
    }
    if (mapboxContainer) {
      mapboxContainer.style.opacity = String(value / 100);
    }
    if (onCrossfaderChange) {
      onCrossfaderChange();
    }
  });

  // Style buttons
  mapStyleStreets?.addEventListener("click", () => changeMapStyle("streets"));
  mapStyleSatellite?.addEventListener("click", () => changeMapStyle("satellite"));
  mapStyleDark?.addEventListener("click", () => changeMapStyle("dark"));
}

export function updateFloatingPanelState(): void {
  if (!mapControls || !loadMapButton || !mapStatusBadge) return;

  if (uiState.isMapVisible) {
    mapControls.style.display = "flex";
    loadMapButton.style.display = "none";
    mapStatusBadge.textContent = "ON";
    mapStatusBadge.classList.add("is-on");
    updateMapInfo();
  } else {
    mapControls.style.display = "none";
    loadMapButton.style.display = "block";
    mapStatusBadge.textContent = "OFF";
    mapStatusBadge.classList.remove("is-on");
  }
}

// ── Map info display ────────────────────────────────────────────────────────

export function updateMapInfo(): void {
  if (!uiState.map) return;

  const dimensions = getMapDimensionsInMeters(uiState.map);
  const center = uiState.map.getCenter();

  if (mapScaleInfo) {
    mapScaleInfo.textContent = `Scale: ${dimensions.metersPerPixel.toFixed(2)} m/px`;
  }
  if (mapCenterInfo) {
    mapCenterInfo.textContent = `Center: ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
  }

  if (debugEnabled) {
    updateScaleComparisonPanel(dimensions.metersPerPixel);
  }
}

// ── Zoom / pan sync ─────────────────────────────────────────────────────────

export function syncMapZoomToCanvas(pixelsPerMeter: number): void {
  if (!uiState.map) return;

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

function setupMapSyncListeners(): void {
  if (!uiState.map) return;
  const map = uiState.map;

  map.on("moveend", () => {
    syncScaleWithCanvas();
    updateCoordinateInputs();
  });

  map.on("zoomend", () => {
    syncScaleWithCanvas();
  });

  map.on("move", () => {
    updateCoordinateInputs();
    if (onMapMove) {
      const center = map.getCenter();
      const zoom = map.getZoom();
      onMapMove(center.lat, center.lng, zoom);
    }
  });
}

function syncScaleWithCanvas(): void {
  if (!uiState.map) return;

  const dimensions = getMapDimensionsInMeters(uiState.map);
  updateMapInfo();

  if (onScaleSync) {
    onScaleSync(dimensions.metersPerPixel);
  }
}

// ── Button state ────────────────────────────────────────────────────────────

export function updateMapButtonState(): void {
  if (!mapToggleButton) return;

  const hasToken = hasMapboxToken();

  if (uiState.isMapVisible) {
    mapToggleButton.classList.add("is-active");
    mapToggleButton.setAttribute("aria-pressed", "true");
    mapToggleButton.title = "Hide Map Overlay";
  } else {
    mapToggleButton.classList.remove("is-active");
    mapToggleButton.setAttribute("aria-pressed", "false");
    mapToggleButton.title = hasToken ? "Show Map Overlay" : "Configure Mapbox (no token)";
  }

  if (!hasToken) {
    mapToggleButton.style.opacity = "0.6";
  } else {
    mapToggleButton.style.opacity = "1";
  }
}
