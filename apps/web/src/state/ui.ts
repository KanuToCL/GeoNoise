/**
 * UI State Module
 *
 * Manages display-related UI state: about modal, canvas theme,
 * frequency weighting / band display, resize debounce, engine config,
 * and dock collapse timers.
 */

import type { CanvasTheme, DisplayBand } from '../types/index.js';
import type { FrequencyWeighting } from '@geonoise/shared';
import type { EngineConfig } from '@geonoise/core';
import { getDefaultEngineConfig } from '@geonoise/engine';

// =============================================================================
// DISPLAY STATE
// =============================================================================

/** Current frequency weighting for display (A/C/Z) */
let displayWeighting: FrequencyWeighting = 'A';

/** Current band to display: 'overall' or band index 0-8 */
let displayBand: DisplayBand = 'overall';

/** Whether the about modal is open */
let aboutOpen = false;

/** Active canvas theme colours resolved from CSS custom properties */
let canvasTheme: CanvasTheme | null = null;

/** requestAnimationFrame ID for canvas resize debounce */
let resizeRaf: number | null = null;

/** Active engine configuration */
let engineConfig: EngineConfig = getDefaultEngineConfig('festival_fast');

// =============================================================================
// DOCK STATE
// =============================================================================

/** Timer for hover-triggered dock collapse */
let dockCollapseTimeout: ReturnType<typeof setTimeout> | null = null;

/** Timer for inactivity-triggered dock collapse */
let dockInactivityTimeout: ReturnType<typeof setTimeout> | null = null;

/** True when the user clicked a non-select tool (keeps dock open longer) */
let dockHasToolEngaged = false;

// =============================================================================
// DISPLAY GETTERS / SETTERS
// =============================================================================

export function getDisplayWeighting(): FrequencyWeighting {
  return displayWeighting;
}
export function setDisplayWeighting(w: FrequencyWeighting): void {
  displayWeighting = w;
}

export function getDisplayBand(): DisplayBand {
  return displayBand;
}
export function setDisplayBand(band: DisplayBand): void {
  displayBand = band;
}

export function getAboutOpen(): boolean {
  return aboutOpen;
}
export function setAboutOpen(open: boolean): void {
  aboutOpen = open;
}

export function getCanvasTheme(): CanvasTheme | null {
  return canvasTheme;
}
export function setCanvasTheme(theme: CanvasTheme): void {
  canvasTheme = theme;
}

export function getResizeRaf(): number | null {
  return resizeRaf;
}
export function setResizeRaf(id: number | null): void {
  resizeRaf = id;
}

export function getEngineConfig(): EngineConfig {
  return engineConfig;
}
export function setEngineConfig(config: EngineConfig): void {
  engineConfig = config;
}

// =============================================================================
// DOCK GETTERS / SETTERS
// =============================================================================

export function getDockCollapseTimeout(): ReturnType<typeof setTimeout> | null {
  return dockCollapseTimeout;
}
export function setDockCollapseTimeout(timer: ReturnType<typeof setTimeout> | null): void {
  dockCollapseTimeout = timer;
}
export function clearDockCollapseTimeout(): void {
  if (dockCollapseTimeout !== null) {
    clearTimeout(dockCollapseTimeout);
    dockCollapseTimeout = null;
  }
}

export function getDockInactivityTimeout(): ReturnType<typeof setTimeout> | null {
  return dockInactivityTimeout;
}
export function setDockInactivityTimeout(timer: ReturnType<typeof setTimeout> | null): void {
  dockInactivityTimeout = timer;
}
export function clearDockInactivityTimeout(): void {
  if (dockInactivityTimeout !== null) {
    clearTimeout(dockInactivityTimeout);
    dockInactivityTimeout = null;
  }
}

export function getDockHasToolEngaged(): boolean {
  return dockHasToolEngaged;
}
export function setDockHasToolEngaged(engaged: boolean): void {
  dockHasToolEngaged = engaged;
}
