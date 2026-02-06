/**
 * Compute UI Module
 *
 * Functions for compute button, chip, and status display.
 * Extracted from main.ts for modular architecture.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Chip state for visual styling
 */
export type ComputeChipState = 'ready' | 'busy' | 'warning' | 'error';

/**
 * DOM elements for compute UI
 */
export interface ComputeUIElements {
  /** Compute button */
  computeButton: HTMLButtonElement | null;
  /** Compute status chip */
  computeChip: HTMLElement | null;
}

/**
 * Callbacks for compute state
 */
export interface ComputeUICallbacks {
  /** Check if compute is in progress */
  isComputing: () => boolean;
  /** Get current compute preference */
  getComputePreference: () => string;
  /** Resolve backend based on preference and capability */
  resolveBackend: (preference: string, capability: unknown) => { warning?: boolean };
  /** Get WebGPU capability info */
  getCapability: () => unknown;
}

/**
 * Metadata from compute response for status display
 */
export interface ComputeStatusMeta {
  /** Backend ID used */
  backendId: string;
  /** Timing information */
  timings?: { totalMs?: number };
  /** Warnings from compute */
  warnings?: unknown[];
}

// ============================================================================
// Chip Functions
// ============================================================================

/**
 * Set compute chip label and state
 *
 * @param chip - Chip element
 * @param label - Text label
 * @param state - Visual state
 */
export function setComputeChip(
  chip: HTMLElement | null,
  label: string,
  state: ComputeChipState
): void {
  if (!chip) return;
  chip.textContent = label;
  chip.dataset.state = state;
  chip.setAttribute('aria-label', label);
}

/**
 * Update compute chip based on busy state
 *
 * @param elements - DOM elements
 * @param callbacks - State callbacks
 * @param isBusy - Whether compute is in progress
 */
export function updateComputeChip(
  elements: Pick<ComputeUIElements, 'computeChip'>,
  callbacks: Pick<ComputeUICallbacks, 'getComputePreference' | 'resolveBackend' | 'getCapability'>,
  isBusy: boolean
): void {
  const { computeChip } = elements;

  if (isBusy) {
    setComputeChip(computeChip, 'Computing...', 'busy');
    if (computeChip) computeChip.title = '';
    return;
  }

  const preference = callbacks.getComputePreference();
  const capability = callbacks.getCapability();
  const resolved = callbacks.resolveBackend(preference, capability);

  if (resolved.warning) {
    setComputeChip(computeChip, 'Using CPU (GPU soon)', 'warning');
    if (computeChip) computeChip.title = '';
    return;
  }

  setComputeChip(computeChip, 'Ready', 'ready');
}

// ============================================================================
// Button Functions
// ============================================================================

/**
 * Update compute button state (Compute / Cancel)
 *
 * @param button - Compute button element
 * @param computing - Whether compute is in progress
 */
export function updateComputeButtonState(
  button: HTMLButtonElement | null,
  computing: boolean
): void {
  if (!button) return;
  button.textContent = computing ? 'Cancel' : 'Compute';
  button.classList.toggle('is-cancel', computing);
  button.title = computing
    ? 'Cancel the current compute.'
    : 'Run propagation and update receiver/grid levels.';
}

// ============================================================================
// Status Functions
// ============================================================================

/**
 * Update status tooltip with compute metadata
 *
 * @param chip - Chip element for tooltip
 * @param meta - Compute response metadata
 */
export function updateComputeStatus(
  chip: HTMLElement | null,
  meta: ComputeStatusMeta
): void {
  if (!chip) return;
  const timing = meta.timings?.totalMs;
  const timingLabel = typeof timing === 'number' ? `${timing.toFixed(1)} ms` : 'n/a';
  const warnings = meta.warnings?.length ?? 0;
  const warningLabel = warnings ? ` • ${warnings} warning${warnings === 1 ? '' : 's'}` : '';
  chip.title = `${meta.backendId} • ${timingLabel}${warningLabel}`;
}

/**
 * Show compute error on chip
 *
 * @param chip - Chip element
 * @param label - Error label
 * @param error - Error object
 */
export function showComputeError(
  chip: HTMLElement | null,
  label: string,
  error: unknown
): void {
  if (chip) {
    chip.textContent = 'Error';
    chip.dataset.state = 'error';
    chip.title = `${label} compute error`;
  }
  // eslint-disable-next-line no-console
  console.error(label, error);
}

// ============================================================================
// Combined Update Functions
// ============================================================================

/**
 * Update all compute UI elements
 *
 * @param elements - DOM elements
 * @param callbacks - State callbacks
 */
export function updateComputeUI(
  elements: ComputeUIElements,
  callbacks: ComputeUICallbacks
): void {
  const computing = callbacks.isComputing();
  updateComputeButtonState(elements.computeButton, computing);
  updateComputeChip(elements, callbacks, computing);
}
