/**
 * Mapbox token configuration modal logic.
 */

import {
  getMapboxToken,
  setMapboxToken,
  clearMapboxToken,
  loadMapboxLibrary,
} from "../mapbox.js";

import {
  uiState,
  mapboxTokenModal,
  mapboxTokenInput,
  mapboxTokenError,
  mapboxTokenSuccess,
  mapboxTokenSave,
  mapboxTokenClear,
  mapboxTokenClose,
} from "./state.js";

import { showMap, hideMap, updateMapButtonState } from "./lifecycle.js";

// ── Public ──────────────────────────────────────────────────────────────────

export function wireTokenModal(): void {
  if (!mapboxTokenModal) return;

  mapboxTokenClose?.addEventListener("click", () => {
    closeTokenModal();
  });

  const backdrop = mapboxTokenModal.querySelector("[data-modal-close]");
  backdrop?.addEventListener("click", () => {
    closeTokenModal();
  });

  mapboxTokenSave?.addEventListener("click", async () => {
    await saveToken();
  });

  mapboxTokenClear?.addEventListener("click", () => {
    clearToken();
  });

  mapboxTokenInput?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      await saveToken();
    }
  });

  const existingToken = getMapboxToken();
  if (existingToken && mapboxTokenInput) {
    mapboxTokenInput.value = existingToken;
  }
}

export function openTokenModal(): void {
  if (!mapboxTokenModal) return;

  const existingToken = getMapboxToken();
  if (existingToken && mapboxTokenInput) {
    mapboxTokenInput.value = existingToken;
  }

  hideError();
  hideSuccess();

  mapboxTokenModal.classList.add("is-open");
  mapboxTokenModal.setAttribute("aria-hidden", "false");
  mapboxTokenInput?.focus();
}

export function closeTokenModal(): void {
  if (!mapboxTokenModal) return;
  mapboxTokenModal.classList.remove("is-open");
  mapboxTokenModal.setAttribute("aria-hidden", "true");
}

// ── Internal helpers ────────────────────────────────────────────────────────

async function saveToken(): Promise<void> {
  const token = mapboxTokenInput?.value.trim();

  if (!token) {
    showError("Please enter a valid access token");
    return;
  }

  if (!token.startsWith("pk.")) {
    showError("Invalid token format. Mapbox public tokens start with 'pk.'");
    return;
  }

  setMapboxToken(token);

  try {
    await loadMapboxLibrary();
    showSuccess("Token saved successfully!");
    updateMapButtonState();

    setTimeout(async () => {
      closeTokenModal();
      await showMap();
    }, 1000);
  } catch {
    showError("Failed to load Mapbox library. Check your connection.");
  }
}

function clearToken(): void {
  clearMapboxToken();

  if (mapboxTokenInput) {
    mapboxTokenInput.value = "";
  }

  if (uiState.isMapVisible) {
    hideMap();
  }

  updateMapButtonState();
  showSuccess("Token cleared");
}

export function showError(message: string): void {
  if (!mapboxTokenError) return;
  mapboxTokenError.textContent = message;
  mapboxTokenError.style.display = "block";
  hideSuccess();
}

export function hideError(): void {
  if (!mapboxTokenError) return;
  mapboxTokenError.style.display = "none";
}

export function showSuccess(message: string): void {
  if (!mapboxTokenSuccess) return;
  mapboxTokenSuccess.textContent = message;
  mapboxTokenSuccess.style.display = "block";
  hideError();
}

export function hideSuccess(): void {
  if (!mapboxTokenSuccess) return;
  mapboxTokenSuccess.style.display = "none";
}
