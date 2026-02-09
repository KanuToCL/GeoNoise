/**
 * Map control panel: drag behaviour and collapse toggle.
 */

// ── Map panel drag ──────────────────────────────────────────────────────────

export function initMapPanelDrag(): void {
  const panel = document.getElementById("mapControlPanel");
  const header = panel?.querySelector(".map-panel-header") as HTMLElement | null;
  if (!panel || !header) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  // Load saved position from localStorage
  const savedPosition = localStorage.getItem("geonoise.mapPanelPosition");
  if (savedPosition) {
    try {
      const { left, top } = JSON.parse(savedPosition);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = "auto";
    } catch {
      // Ignore invalid saved position
    }
  }

  const onMouseDown = (e: MouseEvent) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = panel.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = "auto";

    header.style.cursor = "grabbing";
    e.preventDefault();
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    const newLeft = initialLeft + deltaX;
    const newTop = initialTop + deltaY;

    const maxLeft = window.innerWidth - panel.offsetWidth - 10;
    const maxTop = window.innerHeight - panel.offsetHeight - 10;

    const clampedLeft = Math.max(10, Math.min(maxLeft, newLeft));
    const clampedTop = Math.max(10, Math.min(maxTop, newTop));

    panel.style.left = `${clampedLeft}px`;
    panel.style.top = `${clampedTop}px`;
  };

  const onMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = "grab";

      const rect = panel.getBoundingClientRect();
      localStorage.setItem(
        "geonoise.mapPanelPosition",
        JSON.stringify({ left: rect.left, top: rect.top }),
      );
    }
  };

  header.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  header.addEventListener("touchstart", (e: TouchEvent) => {
    const touch = e.touches[0];
    onMouseDown({
      clientX: touch.clientX,
      clientY: touch.clientY,
      preventDefault: () => e.preventDefault(),
    } as MouseEvent);
  });

  document.addEventListener("touchmove", (e: TouchEvent) => {
    if (isDragging) {
      const touch = e.touches[0];
      onMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
    }
  });

  document.addEventListener("touchend", onMouseUp);
}

// ── Panel collapse ──────────────────────────────────────────────────────────

export function wireCollapseButton(): void {
  const collapseBtn = document.getElementById("mapPanelCollapseBtn");
  const mapPanel = document.getElementById("mapControlPanel");

  collapseBtn?.addEventListener("click", () => {
    if (mapPanel) {
      mapPanel.classList.toggle("is-collapsed");
      localStorage.setItem(
        "geonoise.mapPanelCollapsed",
        String(mapPanel.classList.contains("is-collapsed")),
      );
    }
  });

  // Restore collapse state
  if (mapPanel) {
    const wasCollapsed = localStorage.getItem("geonoise.mapPanelCollapsed") === "true";
    if (wasCollapsed) {
      mapPanel.classList.add("is-collapsed");
    }
  }
}
