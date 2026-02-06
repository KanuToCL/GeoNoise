/**
 * Toolbar Module
 *
 * Handles tool grid, dock expansion, and tool-related UI.
 */

import type { Tool } from '../types/index.js';
import type { BuildingDrawingMode, BarrierDrawingMode } from '../state/tools.js';

// =============================================================================
// TYPES
// =============================================================================

/** Tool button configuration */
export interface ToolButton {
  tool: Tool;
  label: string;
  shortcut: string;
}

/** Drawing mode option */
export interface DrawingModeOption {
  id: string;
  label: string;
  desc: string;
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const TOOL_BUTTONS: ToolButton[] = [
  { tool: 'select', label: 'Select', shortcut: 'V' },
  { tool: 'add-source', label: 'Add Source', shortcut: 'S' },
  { tool: 'add-receiver', label: 'Add Receiver', shortcut: 'R' },
  { tool: 'add-probe', label: 'Add Probe', shortcut: 'P' },
  { tool: 'add-barrier', label: 'Add Barrier', shortcut: 'B' },
  { tool: 'add-building', label: 'Add Building', shortcut: 'H' },
  { tool: 'add-panel', label: 'Add Grid', shortcut: 'G' },
  { tool: 'measure', label: 'Measure', shortcut: 'M' },
];

export const BUILDING_DRAWING_MODES: DrawingModeOption[] = [
  { id: 'diagonal', label: 'Diagonal Drag', desc: 'Click corner, drag to opposite' },
  { id: 'center', label: 'Center Outward', desc: 'Click center, drag to corner' },
  { id: 'polygon', label: '4-Corner Polygon', desc: 'Click 4 corners to create shape' },
];

export const BARRIER_DRAWING_MODES: DrawingModeOption[] = [
  { id: 'end-to-end', label: 'End-to-End', desc: 'Click start, click/drag to end' },
  { id: 'center', label: 'Center Outward', desc: 'Click center, drag to expand both ends' },
];

// =============================================================================
// DRAWING MODE SUBMENU
// =============================================================================

let drawingModeSubmenu: HTMLElement | null = null;

/**
 * Hide the drawing mode submenu if visible.
 */
export function hideDrawingModeSubmenu(): void {
  if (drawingModeSubmenu) {
    drawingModeSubmenu.remove();
    drawingModeSubmenu = null;
  }
}

/**
 * Show a drawing mode submenu for building or barrier tools.
 */
export function showDrawingModeSubmenu(
  tool: 'add-building' | 'add-barrier',
  button: HTMLElement,
  currentMode: BuildingDrawingMode | BarrierDrawingMode,
  onSelectMode: (mode: string) => void
): void {
  hideDrawingModeSubmenu();

  const submenu = document.createElement('div');
  submenu.className = 'drawing-mode-submenu';
  submenu.setAttribute('role', 'menu');

  const isBuilding = tool === 'add-building';
  const modes = isBuilding ? BUILDING_DRAWING_MODES : BARRIER_DRAWING_MODES;

  const title = document.createElement('div');
  title.className = 'drawing-mode-submenu-title';
  title.textContent = isBuilding ? 'Building Drawing Mode' : 'Barrier Drawing Mode';
  submenu.appendChild(title);

  for (const mode of modes) {
    const option = document.createElement('button');
    option.className = 'drawing-mode-option';
    option.setAttribute('role', 'menuitemradio');
    option.setAttribute('aria-checked', mode.id === currentMode ? 'true' : 'false');
    if (mode.id === currentMode) {
      option.classList.add('is-selected');
    }

    const radio = document.createElement('span');
    radio.className = 'drawing-mode-radio';
    radio.textContent = mode.id === currentMode ? '●' : '○';

    const labelWrap = document.createElement('span');
    labelWrap.className = 'drawing-mode-label-wrap';

    const label = document.createElement('span');
    label.className = 'drawing-mode-label';
    label.textContent = mode.label;

    const desc = document.createElement('span');
    desc.className = 'drawing-mode-desc';
    desc.textContent = mode.desc;

    labelWrap.appendChild(label);
    labelWrap.appendChild(desc);
    option.appendChild(radio);
    option.appendChild(labelWrap);

    option.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelectMode(mode.id);
      hideDrawingModeSubmenu();
    });

    submenu.appendChild(option);
  }

  // Position submenu above the button
  const buttonRect = button.getBoundingClientRect();
  submenu.style.position = 'fixed';
  submenu.style.left = `${buttonRect.left + buttonRect.width / 2}px`;
  submenu.style.bottom = `${window.innerHeight - buttonRect.top + 8}px`;

  document.body.appendChild(submenu);
  drawingModeSubmenu = submenu;

  // Close on click outside
  const closeHandler = (e: MouseEvent) => {
    if (!submenu.contains(e.target as Node)) {
      hideDrawingModeSubmenu();
      document.removeEventListener('click', closeHandler);
    }
  };

  requestAnimationFrame(() => {
    document.addEventListener('click', closeHandler);
  });
}

// =============================================================================
// TOOL GRID WIRING
// =============================================================================

/**
 * Wire the tool grid click handler.
 */
export function wireToolGrid(
  toolGrid: HTMLElement | null,
  getActiveTool: () => Tool,
  onSelectTool: (tool: Tool) => void,
  getBuildingMode: () => BuildingDrawingMode,
  getBarrierMode: () => BarrierDrawingMode,
  setBuildingMode: (mode: BuildingDrawingMode) => void,
  setBarrierMode: (mode: BarrierDrawingMode) => void
): void {
  if (!toolGrid) return;

  toolGrid.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const button = target.closest<HTMLButtonElement>('button[data-tool]');
    if (!button) return;

    const tool = button.dataset.tool as Tool;
    const supportsSubmenu = tool === 'add-building' || tool === 'add-barrier';

    // If clicking on already-active tool that supports submenu, show the submenu
    if (supportsSubmenu && getActiveTool() === tool) {
      if (tool === 'add-building') {
        showDrawingModeSubmenu(tool, button, getBuildingMode(), (mode) => {
          setBuildingMode(mode as BuildingDrawingMode);
        });
      } else {
        showDrawingModeSubmenu(tool, button, getBarrierMode(), (mode) => {
          setBarrierMode(mode as BarrierDrawingMode);
        });
      }
    } else {
      onSelectTool(tool);
    }
  });
}

// =============================================================================
// DOCK LABELS
// =============================================================================

/**
 * Wire dock hover labels.
 */
export function wireDockLabels(
  toolGrid: HTMLElement | null,
  labelStage: HTMLElement | null,
  labelText: HTMLElement | null
): void {
  if (!toolGrid || !labelStage || !labelText) return;

  const showLabel = (label: string) => {
    labelText.textContent = label;
    labelStage.classList.add('is-visible');
  };

  const hideLabel = () => {
    labelStage.classList.remove('is-visible');
  };

  const resolveButton = (target: EventTarget | null) =>
    (target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-label]') ?? null;

  toolGrid.addEventListener('mouseover', (event) => {
    const button = resolveButton(event.target);
    if (!button) return;
    const label = button.dataset.label;
    if (!label) return;
    showLabel(label);
  });

  toolGrid.addEventListener('mouseout', (event) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && toolGrid.contains(nextTarget)) return;
    hideLabel();
  });

  toolGrid.addEventListener('focusin', (event) => {
    const button = resolveButton(event.target);
    if (!button) return;
    const label = button.dataset.label;
    if (!label) return;
    showLabel(label);
  });

  toolGrid.addEventListener('focusout', (event) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && toolGrid.contains(nextTarget)) return;
    hideLabel();
  });
}

// =============================================================================
// DOCK EXPANSION
// =============================================================================

/**
 * Wire dock expand/collapse behavior.
 */
export function wireDockExpand(
  dock: HTMLElement | null,
  fab: HTMLButtonElement | null,
  expandable: HTMLElement | null,
  onToolChange?: (isExpanded: boolean) => void
): void {
  if (!dock || !fab || !expandable) return;

  let isExpanded = false;

  const expand = () => {
    isExpanded = true;
    dock.classList.add('is-expanded');
    fab.setAttribute('aria-expanded', 'true');
    onToolChange?.(true);
  };

  const collapse = () => {
    isExpanded = false;
    dock.classList.remove('is-expanded');
    fab.setAttribute('aria-expanded', 'false');
    onToolChange?.(false);
  };

  fab.addEventListener('click', () => {
    if (isExpanded) {
      collapse();
    } else {
      expand();
    }
  });

  // Collapse on escape when expanded
  document.addEventListener('keydown', (event) => {
    if (isExpanded && event.key === 'Escape') {
      collapse();
    }
  });
}

// =============================================================================
// TOOL BUTTON STATE
// =============================================================================

/**
 * Update tool button active states.
 */
export function updateToolButtons(
  toolGrid: HTMLElement | null,
  activeTool: Tool
): void {
  if (!toolGrid) return;

  const buttons = toolGrid.querySelectorAll<HTMLButtonElement>('button[data-tool]');
  buttons.forEach((button) => {
    const tool = button.dataset.tool as Tool;
    const isActive = tool === activeTool;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}
