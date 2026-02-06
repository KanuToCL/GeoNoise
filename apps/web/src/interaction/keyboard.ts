/**
 * Keyboard and Wheel Handlers Module
 *
 * Handles keyboard shortcuts and mouse wheel events for:
 * - Zooming with mouse wheel
 * - Undo/redo (Ctrl+Z / Ctrl+Shift+Z)
 * - Select all (Ctrl+A)
 * - Duplicate (Ctrl+D)
 * - Delete (Delete/Backspace)
 * - Tool shortcuts (V, S, R, P, B, H, G, M)
 * - Escape to clear selection/drafts
 *
 * Uses dependency injection for all state and callbacks to avoid tight coupling.
 */

import type { Point, Selection, Tool } from '../types/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Context providing access to canvas state and transforms
 */
export interface WheelContext {
  canvas: HTMLCanvasElement;
  canvasToWorld: (point: Point) => Point;
  getZoom: () => number;
  setZoom: (zoom: number) => void;
  getPanOffset: () => Point;
  setPanOffset: (offset: Point) => void;
  getPixelsPerMeter: () => number;
}

/**
 * Callbacks for wheel events
 */
export interface WheelCallbacks {
  updatePixelsPerMeter: () => void;
  updateScaleBar: () => void;
  requestRender: () => void;
  isMapVisible: () => boolean;
  isMapInteractive: () => boolean;
  syncMapToCanvasZoom: (pixelsPerMeter: number, panX: number, panY: number) => void;
  syncMapToCanvasPan: (deltaX: number, deltaY: number, pixelsPerMeter: number) => void;
}

/**
 * Context providing access to keyboard-relevant state
 */
export interface KeyboardContext {
  getAboutOpen: () => boolean;
  getSelection: () => Selection;

  // Draft state setters for Escape key
  clearMeasure: () => void;
  clearBarrierDraft: () => void;
  clearBuildingDraft: () => void;
}

/**
 * Callbacks for keyboard events
 */
export interface KeyboardCallbacks {
  closeAbout: () => void;
  undo: () => void;
  redo: () => void;
  selectAll: () => void;
  duplicateMultiSelection: () => void;
  setSelection: (selection: Selection) => void;
  deleteSelection: (selection: Selection) => void;
  setActiveTool: (tool: Tool) => void;
  requestRender: () => void;
}

// =============================================================================
// WHEEL HANDLER
// =============================================================================

/**
 * Handle mouse wheel events for zooming
 */
export function handleWheel(
  event: WheelEvent,
  ctx: WheelContext,
  callbacks: WheelCallbacks
): void {
  event.preventDefault();
  const rect = ctx.canvas.getBoundingClientRect();
  const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const before = ctx.canvasToWorld(canvasPoint);

  const direction = event.deltaY < 0 ? 1.1 : 0.9;
  const currentZoom = ctx.getZoom();
  const newZoom = Math.min(4, Math.max(0.5, currentZoom * direction));
  ctx.setZoom(newZoom);

  callbacks.updatePixelsPerMeter();

  const after = ctx.canvasToWorld(canvasPoint);
  const panDeltaX = before.x - after.x;
  const panDeltaY = before.y - after.y;
  const panOffset = ctx.getPanOffset();
  ctx.setPanOffset({
    x: panOffset.x + panDeltaX,
    y: panOffset.y + panDeltaY,
  });

  callbacks.updateScaleBar();

  // Sync map zoom AND pan when map is visible and NOT in interactive mode
  if (callbacks.isMapVisible() && !callbacks.isMapInteractive()) {
    const newPanOffset = ctx.getPanOffset();
    callbacks.syncMapToCanvasZoom(ctx.getPixelsPerMeter(), newPanOffset.x, newPanOffset.y);
    callbacks.syncMapToCanvasPan(panDeltaX, panDeltaY, ctx.getPixelsPerMeter());
  }

  callbacks.requestRender();
}

/**
 * Wire up wheel event listener
 */
export function wireWheel(
  canvas: HTMLCanvasElement,
  ctx: WheelContext,
  callbacks: WheelCallbacks
): void {
  canvas.addEventListener('wheel', (e) => handleWheel(e, ctx, callbacks), { passive: false });
}

// =============================================================================
// KEYBOARD HANDLER
// =============================================================================

/**
 * Check if an element is an editable target (input, textarea, select, contenteditable)
 */
function isEditableTarget(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Handle keyboard events
 */
export function handleKeyDown(
  event: KeyboardEvent,
  ctx: KeyboardContext,
  callbacks: KeyboardCallbacks
): void {
  // Close about modal on Escape
  if (ctx.getAboutOpen() && event.key === 'Escape') {
    callbacks.closeAbout();
    return;
  }

  // Skip if user is typing in an input field
  const activeEl = document.activeElement as HTMLElement | null;
  const target = event.target as HTMLElement | null;
  if (isEditableTarget(target) || isEditableTarget(activeEl)) {
    return;
  }

  // Undo/Redo: Ctrl+Z / Ctrl+Shift+Z
  if ((event.metaKey || event.ctrlKey) && (event.key === 'z' || event.key === 'Z')) {
    event.preventDefault();
    if (event.shiftKey) {
      callbacks.redo();
    } else {
      callbacks.undo();
    }
    return;
  }

  // Select All: Ctrl+A
  if ((event.metaKey || event.ctrlKey) && (event.key === 'a' || event.key === 'A')) {
    event.preventDefault();
    callbacks.selectAll();
    return;
  }

  // Duplicate: Ctrl+D
  if ((event.metaKey || event.ctrlKey) && (event.key === 'd' || event.key === 'D')) {
    event.preventDefault();
    if (ctx.getSelection().type !== 'none') {
      callbacks.duplicateMultiSelection();
    }
    return;
  }

  // Escape: Clear selection and drafts
  if (event.key === 'Escape') {
    callbacks.setSelection({ type: 'none' });
    ctx.clearMeasure();
    ctx.clearBarrierDraft();
    ctx.clearBuildingDraft();
    callbacks.requestRender();
    return;
  }

  // Delete: Delete selected elements
  if (event.key === 'Delete' || event.key === 'Backspace') {
    const selection = ctx.getSelection();
    if (selection.type !== 'none') {
      callbacks.deleteSelection(selection);
    }
    return;
  }

  // Tool shortcuts
  switch (event.key.toLowerCase()) {
    case 'v':
      callbacks.setActiveTool('select');
      break;
    case 's':
      callbacks.setActiveTool('add-source');
      break;
    case 'r':
      callbacks.setActiveTool('add-receiver');
      break;
    case 'p':
      callbacks.setActiveTool('add-probe');
      break;
    case 'b':
      callbacks.setActiveTool('add-barrier');
      break;
    case 'h':
      callbacks.setActiveTool('add-building');
      break;
    case 'g':
      callbacks.setActiveTool('add-panel');
      break;
    case 'm':
      callbacks.setActiveTool('measure');
      break;
  }
}

/**
 * Wire up keyboard event listener
 */
export function wireKeyboard(
  ctx: KeyboardContext,
  callbacks: KeyboardCallbacks
): void {
  window.addEventListener('keydown', (e) => handleKeyDown(e, ctx, callbacks));
}
