/**
 * Location search (geocoding) and coordinate input wiring.
 */

import { getMapboxToken, geocodeSearch, type GeocodingResult } from "../mapbox.js";

import {
  uiState,
  mapSearchInput,
  mapSearchResults,
  mapLatInput,
  mapLngInput,
  mapGoToCoords,
  searchDebounceTimer,
  setSearchDebounceTimer,
  currentSearchResults,
  setCurrentSearchResults,
} from "./state.js";

import { updateMapInfo } from "./lifecycle.js";

// ── Coordinate inputs ───────────────────────────────────────────────────────

export function updateCoordinateInputs(): void {
  if (!uiState.map) return;

  const center = uiState.map.getCenter();

  if (mapLatInput && document.activeElement !== mapLatInput) {
    mapLatInput.value = center.lat.toFixed(6);
  }
  if (mapLngInput && document.activeElement !== mapLngInput) {
    mapLngInput.value = center.lng.toFixed(6);
  }
}

export function wireCoordinateInput(): void {
  mapGoToCoords?.addEventListener("click", () => {
    navigateToCoordinates();
  });

  mapLatInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") navigateToCoordinates();
  });

  mapLngInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") navigateToCoordinates();
  });
}

function navigateToCoordinates(): void {
  if (!uiState.map || !mapLatInput || !mapLngInput) return;

  const lat = parseFloat(mapLatInput.value);
  const lng = parseFloat(mapLngInput.value);

  if (isNaN(lat) || isNaN(lng)) {
    flashInputError(mapLatInput);
    flashInputError(mapLngInput);
    return;
  }

  if (lat < -85 || lat > 85 || lng < -180 || lng > 180) {
    flashInputError(mapLatInput);
    flashInputError(mapLngInput);
    return;
  }

  uiState.map.setCenter([lng, lat]);
  updateMapInfo();
}

// ── Location search ─────────────────────────────────────────────────────────

export function wireLocationSearch(): void {
  if (!mapSearchInput || !mapSearchResults) return;

  mapSearchInput.addEventListener("input", () => {
    const query = mapSearchInput!.value.trim();

    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    if (!query) {
      hideSearchResults();
      return;
    }

    setSearchDebounceTimer(
      setTimeout(async () => {
        const token = getMapboxToken();
        if (!token) return;

        const results = await geocodeSearch(query, token);
        setCurrentSearchResults(results);
        displaySearchResults(results);
      }, 300),
    );
  });

  document.addEventListener("click", (e) => {
    if (!mapSearchInput?.contains(e.target as Node) && !mapSearchResults?.contains(e.target as Node)) {
      hideSearchResults();
    }
  });

  mapSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideSearchResults();
      mapSearchInput!.blur();
    } else if (e.key === "Enter" && currentSearchResults.length > 0) {
      selectSearchResult(currentSearchResults[0]);
    }
  });
}

function displaySearchResults(results: GeocodingResult[]): void {
  if (!mapSearchResults) return;

  if (results.length === 0) {
    mapSearchResults.innerHTML = `<div class="map-panel-search-result">No results found</div>`;
    mapSearchResults.style.display = "block";
    return;
  }

  mapSearchResults.innerHTML = results
    .map(
      (result, index) => `
      <div class="map-panel-search-result" data-index="${index}">
        ${escapeHtml(result.place_name)}
      </div>
    `,
    )
    .join("");

  mapSearchResults.style.display = "block";

  const resultElements = mapSearchResults.querySelectorAll(".map-panel-search-result");
  resultElements.forEach((el) => {
    el.addEventListener("click", () => {
      const index = parseInt(el.getAttribute("data-index") || "0", 10);
      selectSearchResult(currentSearchResults[index]);
    });
  });
}

function hideSearchResults(): void {
  if (mapSearchResults) {
    mapSearchResults.style.display = "none";
    mapSearchResults.innerHTML = "";
  }
  setCurrentSearchResults([]);
}

function selectSearchResult(result: GeocodingResult): void {
  if (!uiState.map) return;

  const [lng, lat] = result.center;
  uiState.map.setCenter([lng, lat]);
  uiState.map.setZoom(16);

  hideSearchResults();
  if (mapSearchInput) {
    mapSearchInput.value = "";
  }
  updateMapInfo();
  updateCoordinateInputs();
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function flashInputError(input: HTMLInputElement): void {
  const originalBg = input.style.background;
  input.style.background = "rgba(220, 53, 69, 0.3)";
  setTimeout(() => {
    input.style.background = originalBg;
  }, 300);
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
