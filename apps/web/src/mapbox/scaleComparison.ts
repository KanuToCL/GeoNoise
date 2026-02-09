/**
 * Scale comparison panel: visual bar comparison + drag behaviour.
 */

// ── Scale comparison panel update ───────────────────────────────────────────

export function updateScaleComparisonPanel(mapboxMetersPerPixel: number): void {
  const panel = document.getElementById("scaleComparisonPanel");
  const mapboxBar = document.getElementById("mapboxCompareBar");
  const mapboxText = document.getElementById("mapboxCompareText");
  const geonoiseBar = document.getElementById("geonoiseCompareBar");
  const geonoiseText = document.getElementById("geonoiseCompareText");
  const matchIndicator = document.getElementById("scaleMatchIndicator");

  if (!panel || !mapboxBar || !mapboxText || !geonoiseBar || !geonoiseText || !matchIndicator) return;

  panel.style.display = "block";

  const referencePixels = 100;
  void (mapboxMetersPerPixel * referencePixels);

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

  const geonoiseMetersPerPixel = geonoiseMeters / geonoisePixels;

  const refMeters = 50;
  const mapboxWidth = refMeters / mapboxMetersPerPixel;
  const geonoiseWidth = refMeters / geonoiseMetersPerPixel;

  mapboxBar.style.width = `${Math.min(150, mapboxWidth)}px`;
  mapboxText.textContent = `${refMeters} m (${mapboxMetersPerPixel.toFixed(2)} m/px)`;

  geonoiseBar.style.width = `${Math.min(150, geonoiseWidth)}px`;
  geonoiseText.textContent = `${refMeters} m (${geonoiseMetersPerPixel.toFixed(2)} m/px)`;

  const ratio = mapboxMetersPerPixel / geonoiseMetersPerPixel;
  const tolerance = 0.05;

  if (Math.abs(ratio - 1) <= tolerance) {
    matchIndicator.style.background = "#28a745";
    matchIndicator.textContent = `✓ SCALES MATCH (${((1 - Math.abs(ratio - 1)) * 100).toFixed(1)}% accurate)`;
  } else if (ratio > 1) {
    matchIndicator.style.background = "#dc3545";
    matchIndicator.textContent = `✗ Mapbox ${ratio.toFixed(2)}x larger - zoom in on map`;
  } else {
    matchIndicator.style.background = "#dc3545";
    matchIndicator.textContent = `✗ GeoNoise ${(1 / ratio).toFixed(2)}x larger - zoom out on map`;
  }
}

// ── Scale comparison panel drag ─────────────────────────────────────────────

export function initScaleComparisonDrag(): void {
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

    const rect = panel.getBoundingClientRect();
    initialLeft = rect.left;
    initialBottom = window.innerHeight - rect.bottom;

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
