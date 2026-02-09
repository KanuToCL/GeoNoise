/**
 * Keyboard Shortcuts Module
 *
 * Defines and wires up keyboard shortcuts for the application.
 * Separates shortcut definitions from the handler implementations.
 */

import type { Tool } from '../types/index.js';

// =============================================================================
// TYPES
// =============================================================================

/** Keyboard shortcut definition */
export interface KeyboardShortcut {
  /** The key to match (case-insensitive) */
  key: string;
  /** Require Ctrl/Cmd modifier */
  ctrl?: boolean;
  /** Require Shift modifier */
  shift?: boolean;
  /** Require Alt modifier */
  alt?: boolean;
  /** Description for help display */
  description: string;
}

/** Tool shortcut mapping */
export interface ToolShortcut {
  key: string;
  tool: Tool;
  description: string;
}

// =============================================================================
// SHORTCUT DEFINITIONS
// =============================================================================

/** Tool shortcuts - single key press switches to tool */
export const TOOL_SHORTCUTS: ToolShortcut[] = [
  { key: 'v', tool: 'select', description: 'Select tool' },
  { key: 's', tool: 'add-source', description: 'Add source' },
  { key: 'r', tool: 'add-receiver', description: 'Add receiver' },
  { key: 'p', tool: 'add-probe', description: 'Add probe' },
  { key: 'b', tool: 'add-barrier', description: 'Add barrier' },
  { key: 'h', tool: 'add-building', description: 'Add building' },
  { key: 'g', tool: 'add-panel', description: 'Add measurement grid' },
  { key: 'm', tool: 'measure', description: 'Measure distance' },
];

/** Command shortcuts - modifier + key triggers action */
export const COMMAND_SHORTCUTS: KeyboardShortcut[] = [
  { key: 'z', ctrl: true, description: 'Undo' },
  { key: 'z', ctrl: true, shift: true, description: 'Redo' },
  { key: 'a', ctrl: true, description: 'Select all' },
  { key: 'd', ctrl: true, description: 'Duplicate selection' },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if the event target is an editable element.
 * If so, keyboard shortcuts should be ignored.
 */
export function isEditableTarget(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
  );
}

/**
 * Check if keyboard shortcuts should be suppressed for this event.
 */
export function shouldSuppressShortcut(event: KeyboardEvent): boolean {
  const activeEl = document.activeElement as HTMLElement | null;
  const target = event.target as HTMLElement | null;
  return isEditableTarget(target) || isEditableTarget(activeEl);
}

/**
 * Check if an event matches a shortcut definition.
 */
export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: KeyboardShortcut
): boolean {
  const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
  const ctrlMatch = shortcut.ctrl ? event.metaKey || event.ctrlKey : true;
  const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
  const altMatch = shortcut.alt ? event.altKey : !event.altKey;
  return keyMatch && ctrlMatch && shiftMatch && altMatch;
}

/**
 * Get the tool shortcut for a given key (if any).
 */
export function getToolForKey(key: string): Tool | null {
  const shortcut = TOOL_SHORTCUTS.find(
    (s) => s.key.toLowerCase() === key.toLowerCase()
  );
  return shortcut?.tool ?? null;
}

// =============================================================================
// SHORTCUT HANDLER TYPE
// =============================================================================

/**
 * Callbacks for keyboard actions.
 * These are passed to wireKeyboard so the actual implementations
 * remain in main.ts until fully extracted.
 */
export interface KeyboardHandlers {
  onUndo: () => void;
  onRedo: () => void;
  onSelectAll: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onEscape: () => void;
  onSetTool: (tool: Tool) => void;
  onCloseModal?: () => void;
  isModalOpen?: () => boolean;
}

/**
 * Create the keyboard event handler.
 * Returns a function that can be attached to window.addEventListener('keydown', ...).
 */
export function createKeyboardHandler(handlers: KeyboardHandlers) {
  return (event: KeyboardEvent) => {
    // Handle modal escape
    if (handlers.isModalOpen?.() && event.key === 'Escape') {
      handlers.onCloseModal?.();
      return;
    }

    // Skip shortcuts when in editable elements
    if (shouldSuppressShortcut(event)) {
      return;
    }

    // Undo/Redo
    if ((event.metaKey || event.ctrlKey) && (event.key === 'z' || event.key === 'Z')) {
      event.preventDefault();
      if (event.shiftKey) {
        handlers.onRedo();
      } else {
        handlers.onUndo();
      }
      return;
    }

    // Select All
    if ((event.metaKey || event.ctrlKey) && (event.key === 'a' || event.key === 'A')) {
      event.preventDefault();
      handlers.onSelectAll();
      return;
    }

    // Duplicate
    if ((event.metaKey || event.ctrlKey) && (event.key === 'd' || event.key === 'D')) {
      event.preventDefault();
      handlers.onDuplicate();
      return;
    }

    // Escape - cancel operations
    if (event.key === 'Escape') {
      handlers.onEscape();
      return;
    }

    // Delete/Backspace - delete selection
    if (event.key === 'Delete' || event.key === 'Backspace') {
      handlers.onDelete();
      return;
    }

    // Tool shortcuts
    const tool = getToolForKey(event.key);
    if (tool) {
      handlers.onSetTool(tool);
    }
  };
}
