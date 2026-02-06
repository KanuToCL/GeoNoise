/**
 * Pinned Context Panel Creator
 *
 * Creates and manages pinned inspector panels for element selections.
 * Uses dependency injection to avoid direct access to global state.
 */

import type { Selection } from '../../types/index.js';
import type { Source, Receiver, Panel, Barrier, Building } from '../../entities/index.js';
import {
  type PinnedContextPanel,
  addPinnedContextPanel,
  nextPinnedContextSeq,
  getPinnedContextPanelCount,
  getPinnedContextPanels,
} from './types.js';
import { bringPanelToFront, makePanelDraggable, clampPanelToParent, getInspectorMinTop } from '../../probe/panels.js';

/** Scene data needed for pinned panel creation */
export interface PinnedPanelSceneData {
  sources: Source[];
  receivers: Receiver[];
  panels: Panel[];
  barriers: Barrier[];
  buildings: Building[];
}

/** Callbacks for pinned panel operations */
export interface PinnedPanelCallbacks {
  selectionTypeLabel: (type: Selection['type']) => string;
  renderPropertiesFor: (sel: Selection, container: HTMLElement) => void;
  renderPanelLegendFor: (panelId: string, container: HTMLElement) => void;
  renderPanelStatsFor: (panelId: string, container: HTMLElement) => void;
}

/** Elements needed for pinned panel creation */
export interface PinnedPanelElements {
  uiLayer: HTMLElement;
  contextPanel: HTMLElement | null;
}

/**
 * Create a pinned inspector panel for a non-probe element
 */
export function createPinnedContextPanel(
  sel: Selection,
  elements: PinnedPanelElements,
  scene: PinnedPanelSceneData,
  callbacks: PinnedPanelCallbacks
): void {
  const { uiLayer, contextPanel } = elements;
  if (!uiLayer || sel.type === 'none' || sel.type === 'probe') return;

  const panelId = `pinned-context-${nextPinnedContextSeq()}`;

  // Get element name
  if (sel.type === 'multi') return; // Can't pin multi-selection
  let elementName = `${callbacks.selectionTypeLabel(sel.type)} ${sel.id.toUpperCase()}`;
  if (sel.type === 'source') {
    const source = scene.sources.find(s => s.id === sel.id);
    elementName = source?.name || elementName;
  } else if (sel.type === 'receiver') {
    const receiver = scene.receivers.find(r => r.id === sel.id);
    elementName = receiver?.name || elementName;
  } else if (sel.type === 'panel') {
    const panel = scene.panels.find(p => p.id === sel.id);
    elementName = panel?.name || `Grid ${sel.id.toUpperCase()}`;
  } else if (sel.type === 'barrier') {
    const barrier = scene.barriers.find(b => b.id === sel.id);
    elementName = barrier?.name || elementName;
  } else if (sel.type === 'building') {
    const building = scene.buildings.find(b => b.id === sel.id);
    elementName = building?.name || elementName;
  }

  // Create the panel
  const panel = document.createElement('aside');
  panel.className = 'context-panel context-panel--pinned is-open';
  panel.setAttribute('aria-hidden', 'false');
  panel.dataset.pinnedId = panelId;

  // Header
  const header = document.createElement('div');
  header.className = 'context-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'context-title-wrap';
  const title = document.createElement('div');
  title.className = 'context-title';
  title.textContent = elementName;
  title.title = 'Double-click to edit name';
  title.style.cursor = 'text';
  const badge = document.createElement('span');
  badge.className = 'probe-title-badge';
  badge.textContent = 'Pinned';
  titleWrap.appendChild(title);
  titleWrap.appendChild(badge);

  const actions = document.createElement('div');
  actions.className = 'probe-actions';
  const closeButton = document.createElement('button');
  closeButton.className = 'context-close ui-button';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close pinned inspector');
  closeButton.textContent = '×';
  actions.appendChild(closeButton);
  header.appendChild(titleWrap);
  header.appendChild(actions);

  // Body with properties
  const body = document.createElement('div');
  body.className = 'inspector-body';

  // Render properties based on element type
  const propertiesSection = document.createElement('div');
  propertiesSection.className = 'context-section';
  const propTitle = document.createElement('div');
  propTitle.className = 'context-section-title';
  propTitle.textContent = 'Properties';
  const propBody = document.createElement('div');
  propBody.className = 'properties';
  propertiesSection.appendChild(propTitle);
  propertiesSection.appendChild(propBody);

  // Render full interactive properties for the element
  callbacks.renderPropertiesFor(sel, propBody);

  body.appendChild(propertiesSection);

  // For panel/grid selections, add legend and stats sections
  let legendContainer: HTMLElement | undefined;
  let statsContainer: HTMLElement | undefined;
  if (sel.type === 'panel') {
    // Legend section
    const legendSection = document.createElement('div');
    legendSection.className = 'context-section';
    const legendTitle = document.createElement('div');
    legendTitle.className = 'context-section-title';
    legendTitle.textContent = 'Color Range';
    legendContainer = document.createElement('div');
    legendContainer.className = 'panel-legend';
    legendSection.appendChild(legendTitle);
    legendSection.appendChild(legendContainer);
    callbacks.renderPanelLegendFor(sel.id, legendContainer);
    body.appendChild(legendSection);

    // Stats section
    const statsSection = document.createElement('div');
    statsSection.className = 'context-section';
    const statsTitle = document.createElement('div');
    statsTitle.className = 'context-section-title';
    statsTitle.textContent = 'Statistics';
    statsContainer = document.createElement('div');
    statsContainer.className = 'panel-stats';
    statsSection.appendChild(statsTitle);
    statsSection.appendChild(statsContainer);
    callbacks.renderPanelStatsFor(sel.id, statsContainer);
    body.appendChild(statsSection);
  }

  panel.appendChild(header);
  panel.appendChild(body);
  uiLayer.appendChild(panel);

  // Bring new panel to front of all inspector windows
  bringPanelToFront(panel);

  // Store the pinned panel with properties container reference
  const pinnedPanel: PinnedContextPanel = {
    selection: sel,
    panel,
    propertiesContainer: propBody,
    legendContainer,
    statsContainer,
  };
  addPinnedContextPanel(pinnedPanel);

  // Position the panel with offset based on number of pinned panels
  const parent = uiLayer;
  requestAnimationFrame(() => {
    const parentRect = parent.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const anchorRect = contextPanel?.getBoundingClientRect() ?? null;
    const stackOffset = 18 * ((getPinnedContextPanelCount() - 1) % 4);
    const offset = 12 + stackOffset;
    const initialLeft = anchorRect
      ? anchorRect.left - parentRect.left + offset
      : parentRect.width - panelRect.width - offset;
    const initialTop = anchorRect
      ? anchorRect.top - parentRect.top + offset
      : parentRect.height - panelRect.height - offset;
    clampPanelToParent(panel, parent, initialLeft, initialTop, 12, getInspectorMinTop(parent, 12));
  });

  // Make panel draggable
  makePanelDraggable(panel, header, { parent, padding: 12, ignoreSelector: 'button, input' });

  // Close button handler
  closeButton.addEventListener('click', () => {
    const panels = getPinnedContextPanels();
    const idx = panels.findIndex((p) => p.panel === panel);
    if (idx >= 0) panels.splice(idx, 1);
    panel.remove();
  });

  // Double-click to edit title
  title.addEventListener('dblclick', () => {
    const currentName = title.textContent || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'context-title-input';
    input.value = currentName;
    input.placeholder = elementName;

    title.style.display = 'none';
    title.parentElement?.insertBefore(input, title);
    input.focus();
    input.select();

    const finishEditing = () => {
      const newValue = input.value.trim() || elementName;
      title.textContent = newValue;
      input.remove();
      title.style.display = '';
    };

    input.addEventListener('blur', finishEditing);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finishEditing();
      } else if (e.key === 'Escape') {
        input.remove();
        title.style.display = '';
      }
    });
  });
}

/**
 * Refresh all pinned context panels (e.g., when element data changes via drag)
 */
export function refreshPinnedContextPanels(
  callbacks: Pick<PinnedPanelCallbacks, 'renderPropertiesFor' | 'renderPanelLegendFor' | 'renderPanelStatsFor'>
): void {
  const panels = getPinnedContextPanels();
  for (const pinned of panels) {
    // Skip source panels - they have complex spectrum editors that shouldn't be recreated during drag
    if (pinned.selection.type === 'source') {
      continue;
    }
    callbacks.renderPropertiesFor(pinned.selection, pinned.propertiesContainer);
    // Also refresh legend and stats for panel type pins
    if (pinned.selection.type === 'panel') {
      if (pinned.legendContainer) {
        callbacks.renderPanelLegendFor(pinned.selection.id, pinned.legendContainer);
      }
      if (pinned.statsContainer) {
        callbacks.renderPanelStatsFor(pinned.selection.id, pinned.statsContainer);
      }
    }
  }
}
