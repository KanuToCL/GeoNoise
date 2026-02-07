/**
 * Sources List UI
 *
 * Renders and manages the sources list panel in the dock.
 * Displays source rows with name, power levels, spectrum bars, and controls.
 */

import type { Source } from '../entities/index.js';
import type { FrequencyWeighting } from '@geonoise/shared';
import { calculateOverallLevel } from '@geonoise/shared';
import { formatLevel } from '../format.js';
import { createSpectrumBar } from './spectrum/index.js';
import { createInlineField } from './contextPanel/fields.js';

// =============================================================================
// TYPES
// =============================================================================

/** Selection state for determining if a source is selected */
export interface SourceSelection {
  type: 'source' | string;
  id: string;
}

/** Context data needed to render sources */
export interface SourcesContext {
  /** List of sources to render */
  sources: Source[];
  /** Current selection state */
  selection: SourceSelection | { type: string };
  /** ID of soloed source, if any */
  soloSourceId: string | null;
  /** Set of collapsed source IDs */
  collapsedSources: Set<string>;
  /** Current display weighting */
  displayWeighting: FrequencyWeighting;
  /** Function to check if source is enabled (considers solo) */
  isSourceEnabled: (source: Source) => boolean;
}

/** Callbacks for source interactions */
export interface SourcesCallbacks {
  /** Called when source data changes (name, enabled, etc.) */
  onMarkDirty: () => void;
  /** Called to push history after a change */
  onPushHistory: () => void;
  /** Called when a source is selected */
  onSetSelection: (selection: { type: 'source'; id: string }) => void;
  /** Called to re-render the properties panel */
  onRenderProperties: () => void;
  /** Called to trigger scene recomputation */
  onComputeScene: () => void;
  /** Called when solo state changes - returns new soloSourceId */
  onSoloToggle: (sourceId: string) => string | null;
  /** Called to re-render sources (for collapse toggle) */
  onRenderSources: () => void;
}

// =============================================================================
// RENDER SOURCES
// =============================================================================

/**
 * Render the sources list into the provided container
 *
 * @param container - The DOM element to render sources into
 * @param context - Source data and state
 * @param callbacks - Interaction callbacks
 * @param sumModeEl - Optional element to display summation mode text
 */
export function renderSources(
  container: HTMLElement,
  context: SourcesContext,
  callbacks: SourcesCallbacks,
  sumModeEl?: HTMLElement | null
): void {
  container.innerHTML = '';

  if (!context.sources.length) {
    container.innerHTML = '<span class="legend-empty">No sources yet.</span>';
    return;
  }

  for (const source of context.sources) {
    const row = document.createElement('div');
    row.className = 'source-row';
    row.classList.toggle('is-muted', !context.isSourceEnabled(source));
    row.classList.toggle(
      'is-selected',
      context.selection.type === 'source' &&
        (context.selection as SourceSelection).id === source.id
    );

    const header = document.createElement('div');
    header.className = 'source-row-header';

    // Name input
    const nameInput = document.createElement('input');
    nameInput.className = 'source-name ui-inset';
    nameInput.type = 'text';
    nameInput.value = source.name;
    nameInput.placeholder = 'Name';
    nameInput.addEventListener('input', () => {
      source.name = nameInput.value;
      callbacks.onMarkDirty();
    });
    nameInput.addEventListener('change', () => {
      callbacks.onPushHistory();
    });

    // ID tag
    const idTag = document.createElement('span');
    idTag.className = 'source-id';
    idTag.textContent = source.id.toUpperCase();

    // Controls (solo/mute buttons)
    const controls = document.createElement('div');
    controls.className = 'source-controls';

    // Solo button
    const soloButton = document.createElement('button');
    soloButton.type = 'button';
    soloButton.className = 'source-chip ui-button';
    soloButton.textContent = 'S';
    soloButton.classList.toggle('is-active', context.soloSourceId === source.id);
    soloButton.setAttribute(
      'aria-pressed',
      context.soloSourceId === source.id ? 'true' : 'false'
    );
    soloButton.setAttribute(
      'aria-label',
      context.soloSourceId === source.id ? 'Unsolo source' : 'Solo source'
    );
    soloButton.title =
      context.soloSourceId === source.id ? 'Unsolo source' : 'Solo source';
    soloButton.addEventListener('click', (event) => {
      event.stopPropagation();
      callbacks.onSoloToggle(source.id);
      callbacks.onPushHistory();
      callbacks.onRenderSources();
      callbacks.onRenderProperties();
      callbacks.onComputeScene();
    });

    // Mute button
    const muteButton = document.createElement('button');
    muteButton.type = 'button';
    muteButton.className = 'source-chip ui-button';
    muteButton.textContent = 'M';
    muteButton.classList.toggle('is-active', !source.enabled);
    muteButton.setAttribute('aria-pressed', !source.enabled ? 'true' : 'false');
    muteButton.setAttribute(
      'aria-label',
      source.enabled ? 'Mute source' : 'Unmute source'
    );
    muteButton.title = source.enabled ? 'Mute source' : 'Unmute source';
    muteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      source.enabled = !source.enabled;
      callbacks.onPushHistory();
      callbacks.onRenderSources();
      callbacks.onRenderProperties();
      callbacks.onComputeScene();
    });

    controls.appendChild(soloButton);
    controls.appendChild(muteButton);

    // Collapse button
    const collapseButton = document.createElement('button');
    collapseButton.type = 'button';
    collapseButton.className = 'source-collapse';
    const isCollapsed = context.collapsedSources.has(source.id);
    collapseButton.textContent = isCollapsed ? '>' : 'v';
    collapseButton.setAttribute(
      'aria-label',
      isCollapsed ? 'Expand source' : 'Collapse source'
    );
    collapseButton.title = isCollapsed ? 'Expand' : 'Collapse';
    collapseButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (context.collapsedSources.has(source.id)) {
        context.collapsedSources.delete(source.id);
      } else {
        context.collapsedSources.add(source.id);
      }
      callbacks.onRenderSources();
    });

    // Assemble header
    const titleBlock = document.createElement('div');
    titleBlock.className = 'source-title';
    titleBlock.appendChild(nameInput);
    titleBlock.appendChild(idTag);

    const headerActions = document.createElement('div');
    headerActions.className = 'source-actions';
    headerActions.appendChild(controls);
    headerActions.appendChild(collapseButton);

    header.appendChild(titleBlock);
    header.appendChild(headerActions);
    row.appendChild(header);

    // Fields section (power, spectrum, height)
    const fields = document.createElement('div');
    fields.className = 'source-fields';

    // Overall power display
    const overallZ = calculateOverallLevel(source.spectrum, 'Z');
    const overallA = calculateOverallLevel(source.spectrum, 'A');
    const powerDisplay = document.createElement('div');
    powerDisplay.className = 'source-power-display';
    powerDisplay.innerHTML = `<span class="source-power-label">Power:</span> <strong>${formatLevel(overallZ)}</strong> dBZ / <strong>${formatLevel(overallA)}</strong> dBA`;
    fields.appendChild(powerDisplay);

    // Compact spectrum visualization
    const spectrumBar = createSpectrumBar(source.spectrum, context.displayWeighting);
    fields.appendChild(spectrumBar);

    // Height field
    fields.appendChild(
      createInlineField('Height (m)', source.z, (value) => {
        source.z = value;
        callbacks.onPushHistory();
        callbacks.onRenderProperties();
        callbacks.onComputeScene();
      })
    );

    if (!context.collapsedSources.has(source.id)) {
      row.appendChild(fields);
    }

    // Row click handler for selection
    row.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'BUTTON') return;
      callbacks.onSetSelection({ type: 'source', id: source.id });
    });

    container.appendChild(row);
  }

  // Update summation mode display
  if (sumModeEl) {
    sumModeEl.textContent = context.soloSourceId
      ? `Summation: Energetic (dB) - Solo ${context.soloSourceId.toUpperCase()}`
      : 'Summation: Energetic (dB)';
  }
}
