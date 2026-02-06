/**
 * Context Panel Properties Renderer
 *
 * Renders interactive property controls for element selections.
 * Uses dependency injection to avoid direct access to global state.
 */

import type { Selection, SelectionItem } from '../../types/index.js';
import type { Source, Receiver, Panel, Barrier, Building } from '../../entities/index.js';
import {
  BARRIER_MIN_LENGTH,
  BUILDING_MIN_SIZE,
  getBarrierLength,
  getBarrierMidpoint,
  getBarrierRotation,
  setBarrierFromMidpointAndRotation,
} from '../../entities/index.js';
import { createFieldLabel } from './fields.js';

/** Scene data needed for property rendering */
export interface PropertiesSceneData {
  sources: Source[];
  receivers: Receiver[];
  panels: Panel[];
  barriers: Barrier[];
  buildings: Building[];
}

/** Callbacks for property changes and actions */
export interface PropertiesCallbacks {
  pushHistory: () => void;
  computeScene: () => void;
  refreshPinnedContextPanels: () => void;
  setSelection: (sel: Selection) => void;
  duplicateMultiSelection: () => void;
  deleteSelection: (sel: Selection) => void;
  getSelectedCount: (sel: Selection) => {
    source: number;
    receiver: number;
    probe: number;
    panel: number;
    barrier: number;
    building: number;
  };
  createSpectrumEditor: (
    source: Source,
    onChangeSpectrum: () => void,
    onChangeGain: () => void
  ) => HTMLElement;
}

/** Create an input row for property editing */
export function createInputRow(
  label: string,
  value: number,
  onChange: (value: number) => void,
  tooltipText?: string
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'property-row';
  const name = createFieldLabel(label, tooltipText);
  const input = document.createElement('input');
  input.type = 'number';
  input.classList.add('ui-inset');
  input.value = value.toString();
  input.addEventListener('change', () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onChange(next);
  });
  row.appendChild(name);
  row.appendChild(input);
  return row;
}

/** Render interactive property controls for a selection into a container */
export function renderPropertiesFor(
  current: Selection,
  container: HTMLElement,
  scene: PropertiesSceneData,
  callbacks: PropertiesCallbacks
): void {
  container.innerHTML = '';

  if (current.type === 'none') {
    renderEmptyState(container, scene, callbacks);
    return;
  }

  if (current.type === 'multi') {
    renderMultiSelection(current, container, callbacks);
    return;
  }

  // Single selection - render element properties
  renderSingleSelection(current, container, scene, callbacks);
}

/** Render empty state with hints */
function renderEmptyState(
  container: HTMLElement,
  scene: PropertiesSceneData,
  callbacks: PropertiesCallbacks
): void {
  const empty = document.createElement('div');
  empty.className = 'properties-empty';
  const title = document.createElement('div');
  title.textContent = 'Select an item to edit.';
  empty.appendChild(title);

  if (scene.sources.length) {
    const tip = document.createElement('button');
    tip.type = 'button';
    tip.className = 'text-button';
    tip.textContent = `Click ${scene.sources[0].id.toUpperCase()} to edit level/height.`;
    tip.addEventListener('click', () => callbacks.setSelection({ type: 'source', id: scene.sources[0].id }));
    empty.appendChild(tip);
  }
  if (scene.receivers.length) {
    const tip = document.createElement('button');
    tip.type = 'button';
    tip.className = 'text-button';
    tip.textContent = `Click ${scene.receivers[0].id.toUpperCase()} to edit height.`;
    tip.addEventListener('click', () => callbacks.setSelection({ type: 'receiver', id: scene.receivers[0].id }));
    empty.appendChild(tip);
  }
  if (scene.panels.length) {
    const tip = document.createElement('button');
    tip.type = 'button';
    tip.className = 'text-button';
    tip.textContent = `Click ${scene.panels[0].id.toUpperCase()} to edit spacing.`;
    tip.addEventListener('click', () => callbacks.setSelection({ type: 'panel', id: scene.panels[0].id }));
    empty.appendChild(tip);
  }
  if (scene.barriers.length) {
    const tip = document.createElement('button');
    tip.type = 'button';
    tip.className = 'text-button';
    tip.textContent = `Click ${scene.barriers[0].id.toUpperCase()} to edit height.`;
    tip.addEventListener('click', () => callbacks.setSelection({ type: 'barrier', id: scene.barriers[0].id }));
    empty.appendChild(tip);
  }
  if (scene.buildings.length) {
    const tip = document.createElement('button');
    tip.type = 'button';
    tip.className = 'text-button';
    tip.textContent = `Click ${scene.buildings[0].id.toUpperCase()} to edit size.`;
    tip.addEventListener('click', () => callbacks.setSelection({ type: 'building', id: scene.buildings[0].id }));
    empty.appendChild(tip);
  }

  container.appendChild(empty);
}

/** Render multi-selection summary and actions */
function renderMultiSelection(
  current: { type: 'multi'; items: SelectionItem[] },
  container: HTMLElement,
  callbacks: PropertiesCallbacks
): void {
  const counts = callbacks.getSelectedCount(current);
  const summary = document.createElement('div');
  summary.className = 'multi-selection-summary';

  const countsDiv = document.createElement('div');
  countsDiv.className = 'multi-selection-counts';
  const totalCount = current.items.length;
  countsDiv.innerHTML = `<strong>${totalCount} items selected</strong>`;

  const details: string[] = [];
  if (counts.source > 0) details.push(`${counts.source} source${counts.source > 1 ? 's' : ''}`);
  if (counts.receiver > 0) details.push(`${counts.receiver} receiver${counts.receiver > 1 ? 's' : ''}`);
  if (counts.probe > 0) details.push(`${counts.probe} probe${counts.probe > 1 ? 's' : ''}`);
  if (counts.panel > 0) details.push(`${counts.panel} panel${counts.panel > 1 ? 's' : ''}`);
  if (counts.barrier > 0) details.push(`${counts.barrier} barrier${counts.barrier > 1 ? 's' : ''}`);
  if (counts.building > 0) details.push(`${counts.building} building${counts.building > 1 ? 's' : ''}`);

  if (details.length > 0) {
    const detailsSpan = document.createElement('span');
    detailsSpan.className = 'multi-selection-count-item';
    detailsSpan.textContent = details.join(', ');
    countsDiv.appendChild(detailsSpan);
  }

  summary.appendChild(countsDiv);

  const actions = document.createElement('div');
  actions.className = 'multi-selection-actions';

  const duplicateBtn = document.createElement('button');
  duplicateBtn.type = 'button';
  duplicateBtn.className = 'ui-button multi-action-btn';
  duplicateBtn.textContent = 'Duplicate';
  duplicateBtn.addEventListener('click', () => {
    callbacks.duplicateMultiSelection();
  });
  actions.appendChild(duplicateBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'ui-button multi-action-btn danger';
  deleteBtn.textContent = 'Delete All';
  deleteBtn.addEventListener('click', () => {
    callbacks.deleteSelection(current);
  });
  actions.appendChild(deleteBtn);

  const deselectBtn = document.createElement('button');
  deselectBtn.type = 'button';
  deselectBtn.className = 'ui-button multi-action-btn secondary';
  deselectBtn.textContent = 'Deselect';
  deselectBtn.addEventListener('click', () => {
    callbacks.setSelection({ type: 'none' });
  });
  actions.appendChild(deselectBtn);

  summary.appendChild(actions);
  container.appendChild(summary);
}

/** Render single element selection properties */
function renderSingleSelection(
  current: Exclude<Selection, { type: 'none' } | { type: 'multi' }>,
  container: HTMLElement,
  scene: PropertiesSceneData,
  callbacks: PropertiesCallbacks
): void {
  if (current.type === 'source') {
    renderSourceProperties(current.id, container, scene, callbacks);
  } else if (current.type === 'receiver') {
    renderReceiverProperties(current.id, container, scene, callbacks);
  } else if (current.type === 'panel') {
    renderPanelProperties(current.id, container, scene, callbacks);
  } else if (current.type === 'barrier') {
    renderBarrierProperties(current.id, container, scene, callbacks);
  } else if (current.type === 'building') {
    renderBuildingProperties(current.id, container, scene, callbacks);
  }
}

/** Render source properties */
function renderSourceProperties(
  id: string,
  container: HTMLElement,
  scene: PropertiesSceneData,
  callbacks: PropertiesCallbacks
): void {
  const source = scene.sources.find((item) => item.id === id);
  if (!source) return;

  container.appendChild(createInputRow('Height (m)', source.z, (value) => {
    source.z = value;
    callbacks.pushHistory();
    callbacks.computeScene();
    callbacks.refreshPinnedContextPanels();
  }));

  // Spectrum editor section
  const spectrumSection = document.createElement('div');
  spectrumSection.className = 'property-section';
  const spectrumTitle = document.createElement('div');
  spectrumTitle.className = 'property-section-title';
  spectrumTitle.textContent = 'Frequency Spectrum (dB Lw)';
  spectrumSection.appendChild(spectrumTitle);

  const spectrumEditor = callbacks.createSpectrumEditor(
    source,
    () => {
      callbacks.pushHistory();
      callbacks.computeScene();
    },
    () => {
      callbacks.pushHistory();
      callbacks.computeScene();
    }
  );
  spectrumSection.appendChild(spectrumEditor);
  container.appendChild(spectrumSection);
}

/** Render receiver properties */
function renderReceiverProperties(
  id: string,
  container: HTMLElement,
  scene: PropertiesSceneData,
  callbacks: PropertiesCallbacks
): void {
  const receiver = scene.receivers.find((item) => item.id === id);
  if (!receiver) return;

  container.appendChild(createInputRow('Height (m)', receiver.z, (value) => {
    receiver.z = value;
    callbacks.pushHistory();
    callbacks.computeScene();
    callbacks.refreshPinnedContextPanels();
  }));
}

/** Render panel/grid properties */
function renderPanelProperties(
  id: string,
  container: HTMLElement,
  scene: PropertiesSceneData,
  callbacks: PropertiesCallbacks
): void {
  const panel = scene.panels.find((item) => item.id === id);
  if (!panel) return;

  container.appendChild(createInputRow('Elevation (m)', panel.elevation, (value) => {
    panel.elevation = value;
    callbacks.pushHistory();
    callbacks.computeScene();
    callbacks.refreshPinnedContextPanels();
  }));
  container.appendChild(createInputRow('Spacing (m)', panel.sampling.resolution, (value) => {
    panel.sampling.resolution = Math.max(1, value);
    callbacks.pushHistory();
    callbacks.computeScene();
    callbacks.refreshPinnedContextPanels();
  }));

  const hint = document.createElement('div');
  hint.className = 'property-hint';
  hint.textContent = 'Drag corner handles on the measure grid to reshape.';
  container.appendChild(hint);
}

/** Render barrier properties */
function renderBarrierProperties(
  id: string,
  container: HTMLElement,
  scene: PropertiesSceneData,
  callbacks: PropertiesCallbacks
): void {
  const barrier = scene.barriers.find((item) => item.id === id);
  if (!barrier) return;

  // Length control
  const currentLength = getBarrierLength(barrier);
  container.appendChild(createInputRow('Length (m)', currentLength, (value) => {
    const newLength = Math.max(BARRIER_MIN_LENGTH, value);
    const midpoint = getBarrierMidpoint(barrier);
    const rotation = getBarrierRotation(barrier);
    setBarrierFromMidpointAndRotation(barrier, midpoint, rotation, newLength);
    callbacks.pushHistory();
    callbacks.computeScene();
    callbacks.refreshPinnedContextPanels();
  }));

  // Wall height control
  container.appendChild(createInputRow('Wall height (m)', barrier.height, (value) => {
    barrier.height = Math.max(0.1, value);
    callbacks.pushHistory();
    callbacks.computeScene();
    callbacks.refreshPinnedContextPanels();
  }));

  // Rotation control (in degrees)
  const currentRotation = (getBarrierRotation(barrier) * 180) / Math.PI;
  container.appendChild(createInputRow('Rotation (deg)', currentRotation, (value) => {
    const midpoint = getBarrierMidpoint(barrier);
    const length = getBarrierLength(barrier);
    const newRotation = (value * Math.PI) / 180;
    setBarrierFromMidpointAndRotation(barrier, midpoint, newRotation, length);
    callbacks.pushHistory();
    callbacks.computeScene();
    callbacks.refreshPinnedContextPanels();
  }));

  const hint = document.createElement('div');
  hint.className = 'property-hint';
  hint.textContent = 'Drag endpoint handles to resize. Drag the lollipop to rotate.';
  container.appendChild(hint);
}

/** Render building properties */
function renderBuildingProperties(
  id: string,
  container: HTMLElement,
  scene: PropertiesSceneData,
  callbacks: PropertiesCallbacks
): void {
  const building = scene.buildings.find((item) => item.id === id);
  if (!building) return;

  container.appendChild(createInputRow('Width (m)', building.width, (value) => {
    building.width = Math.max(BUILDING_MIN_SIZE, value);
    callbacks.pushHistory();
    callbacks.computeScene();
    callbacks.refreshPinnedContextPanels();
  }));
  container.appendChild(createInputRow('Depth (m)', building.height, (value) => {
    building.height = Math.max(BUILDING_MIN_SIZE, value);
    callbacks.pushHistory();
    callbacks.computeScene();
    callbacks.refreshPinnedContextPanels();
  }));
  container.appendChild(createInputRow('Height (m)', building.z_height, (value) => {
    building.z_height = Math.max(0.1, value);
    callbacks.pushHistory();
    callbacks.computeScene();
    callbacks.refreshPinnedContextPanels();
  }));
  container.appendChild(createInputRow('Rotation (deg)', (building.rotation * 180) / Math.PI, (value) => {
    building.rotation = (value * Math.PI) / 180;
    callbacks.pushHistory();
    callbacks.computeScene();
    callbacks.refreshPinnedContextPanels();
  }));

  const hint = document.createElement('div');
  hint.className = 'property-hint';
  hint.textContent = 'Drag corner handles to resize. Drag the lollipop to rotate.';
  container.appendChild(hint);
}
