/**
 * Probe Panel Utilities
 *
 * Draggable panel management for probe inspector, pinned panels, and snapshots.
 */

import { incrementInspectorZIndex } from './types.js';

// === Panel Positioning ===

/** Get the minimum top position for inspector panels (below the topbar) */
export function getInspectorMinTop(parent: HTMLElement, padding: number): number {
  const topbar = document.querySelector('.topbar') as HTMLElement | null;
  if (topbar) {
    const topbarRect = topbar.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    // Return position below topbar with padding, relative to parent
    return topbarRect.bottom - parentRect.top + padding;
  }
  return padding;
}

/** Clamp panel position within parent bounds */
export function clampPanelToParent(
  panel: HTMLElement,
  parent: HTMLElement,
  left: number,
  top: number,
  padding: number,
  minTop?: number
): void {
  const maxLeft = parent.clientWidth - panel.offsetWidth - padding;
  const maxTop = parent.clientHeight - panel.offsetHeight - padding;
  // Use provided minTop (e.g., below topbar) or fall back to padding
  const effectiveMinTop = minTop ?? padding;
  const clampedLeft = Math.min(Math.max(left, padding), Math.max(padding, maxLeft));
  const clampedTop = Math.min(Math.max(top, effectiveMinTop), Math.max(effectiveMinTop, maxTop));
  panel.style.left = `${clampedLeft}px`;
  panel.style.top = `${clampedTop}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
}

/** Bring an inspector panel to the front by incrementing the global z-index counter. */
export function bringPanelToFront(panel: HTMLElement): void {
  const zIndex = incrementInspectorZIndex();
  panel.style.zIndex = String(zIndex);
}

// === Draggable Panel ===

export interface MakePanelDraggableOptions {
  parent?: HTMLElement | null;
  padding?: number;
  ignoreSelector?: string;
}

/** Make a panel draggable by its handle element */
export function makePanelDraggable(
  panel: HTMLElement,
  handle: HTMLElement,
  options: MakePanelDraggableOptions = {}
): void {
  const parent = options.parent ?? panel.parentElement ?? document.body;
  const padding = options.padding ?? 12;
  const ignoreSelector = options.ignoreSelector ?? 'button';
  const originalUserSelect = document.body.style.userSelect;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const handleMouseMove = (event: MouseEvent) => {
    if (!isDragging) return;
    const parentRect = parent.getBoundingClientRect();
    const nextLeft = event.clientX - parentRect.left - dragOffsetX;
    const nextTop = event.clientY - parentRect.top - dragOffsetY;
    clampPanelToParent(panel, parent, nextLeft, nextTop, padding, getInspectorMinTop(parent, padding));
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = originalUserSelect;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };

  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest(ignoreSelector)) return;
    const panelRect = panel.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    dragOffsetX = event.clientX - panelRect.left;
    dragOffsetY = event.clientY - panelRect.top;
    panel.style.position = 'absolute';
    panel.style.left = `${panelRect.left - parentRect.left}px`;
    panel.style.top = `${panelRect.top - parentRect.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    isDragging = true;
    document.body.style.userSelect = 'none';
    // Bring panel to front when starting to drag
    bringPanelToFront(panel);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  });
}
