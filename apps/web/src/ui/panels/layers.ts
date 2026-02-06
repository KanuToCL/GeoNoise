/**
 * Layers Panel Module
 *
 * Handles layer visibility toggles and popover UI.
 */

import { layers } from '../../state/scene.js';

// =============================================================================
// TYPES
// =============================================================================

/** Layer keys that can be toggled */
export type LayerKey = keyof typeof layers;

/** Layer display labels */
export const LAYER_LABELS: Record<LayerKey, string> = {
  sources: 'Sources',
  receivers: 'Receivers',
  panels: 'Panels',
  noiseMap: 'Noise Map',
  grid: 'Grid',
};

// =============================================================================
// LAYER TOGGLE WIRING
// =============================================================================

/**
 * Wire a checkbox input to toggle a layer's visibility.
 *
 * @param input - The checkbox input element
 * @param key - The layer key to toggle
 * @param onToggle - Callback when layer visibility changes
 * @param debugLayer - Optional debug element to update with layer name
 */
export function wireLayerToggle(
  input: HTMLInputElement | null,
  key: LayerKey,
  onToggle: () => void,
  debugLayer?: HTMLElement | null
): void {
  if (!input) return;

  // Set initial state
  input.checked = layers[key];

  input.addEventListener('change', () => {
    layers[key] = input.checked;

    // Update debug display
    if (debugLayer && input.checked) {
      debugLayer.textContent = LAYER_LABELS[key];
    }

    onToggle();
  });
}

/**
 * Wire all layer toggle inputs.
 *
 * @param inputs - Object mapping layer keys to their input elements
 * @param onToggle - Callback when any layer visibility changes
 * @param debugLayer - Optional debug element
 */
export function wireAllLayerToggles(
  inputs: Partial<Record<LayerKey, HTMLInputElement | null>>,
  onToggle: () => void,
  debugLayer?: HTMLElement | null
): void {
  for (const key of Object.keys(inputs) as LayerKey[]) {
    wireLayerToggle(inputs[key] ?? null, key, onToggle, debugLayer);
  }
}

// =============================================================================
// POPOVER MANAGEMENT
// =============================================================================

/**
 * Wire a popover to toggle on button click.
 *
 * @param button - The button that toggles the popover
 * @param popover - The popover element
 * @param onOpen - Optional callback when popover opens
 * @param onClose - Optional callback when popover closes
 */
export function wirePopover(
  button: HTMLButtonElement | null,
  popover: HTMLElement | null,
  onOpen?: () => void,
  onClose?: () => void
): void {
  if (!button || !popover) return;

  let isOpen = false;

  const open = () => {
    isOpen = true;
    popover.classList.add('is-visible');
    button.setAttribute('aria-expanded', 'true');
    onOpen?.();
  };

  const close = () => {
    isOpen = false;
    popover.classList.remove('is-visible');
    button.setAttribute('aria-expanded', 'false');
    onClose?.();
  };

  const toggle = () => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  };

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    toggle();
  });

  // Close on click outside
  document.addEventListener('click', (event) => {
    if (!isOpen) return;
    const target = event.target as Node;
    if (!popover.contains(target) && !button.contains(target)) {
      close();
    }
  });

  // Close on escape
  document.addEventListener('keydown', (event) => {
    if (isOpen && event.key === 'Escape') {
      close();
    }
  });
}

/**
 * Check if a layer is currently visible.
 */
export function isLayerVisible(key: LayerKey): boolean {
  return layers[key];
}

/**
 * Set a layer's visibility.
 */
export function setLayerVisibility(key: LayerKey, visible: boolean): void {
  layers[key] = visible;
}

/**
 * Toggle a layer's visibility.
 */
export function toggleLayer(key: LayerKey): boolean {
  layers[key] = !layers[key];
  return layers[key];
}
