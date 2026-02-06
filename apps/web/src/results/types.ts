/**
 * Results Module Types
 *
 * Type definitions for the results display module, including
 * receiver/panel results rendering and legend configuration.
 */

import type { SceneResults, PanelResult } from '../export.js';
import type { MapRange, MapRenderStyle, DisplayBand, Selection } from '../types/index.js';
import type { FrequencyWeighting } from '@geonoise/shared';

// ============================================================================
// Legend Configuration
// ============================================================================

/**
 * DOM elements needed for noise map legend rendering
 */
export interface NoiseMapLegendElements {
  /** Container element for the legend */
  container: HTMLDivElement | null;
  /** Gradient bar element */
  gradient: HTMLDivElement | null;
  /** Labels container */
  labels: HTMLDivElement | null;
}

/**
 * Configuration for noise map legend rendering
 */
export interface NoiseMapLegendConfig {
  /** Active map range (min/max values) */
  range: MapRange;
  /** Band step for contour mode */
  bandStep: number;
  /** Current render style ('Smooth' or 'Contours') */
  renderStyle: MapRenderStyle;
}

// ============================================================================
// Panel Stats/Legend Configuration
// ============================================================================

/**
 * DOM elements for panel legend/stats rendering
 */
export interface PanelDisplayElements {
  /** Panel legend container */
  legend: HTMLDivElement | null;
  /** Panel stats container */
  stats: HTMLDivElement | null;
}

/**
 * Context for panel rendering
 */
export interface PanelRenderContext {
  /** All panel results */
  panelResults: PanelResult[];
  /** Number of panels in the scene */
  panelCount: number;
}

// ============================================================================
// Receiver Display Configuration
// ============================================================================

/**
 * Display result for a receiver: the level value and unit label
 */
export interface ReceiverDisplayResult {
  /** Level value in dB */
  level: number;
  /** Unit string for display (e.g., 'dB(A)', 'dB @ 1kHz') */
  unit: string;
}

/**
 * Configuration for receiver display
 */
export interface ReceiverDisplayConfig {
  /** Current display weighting (A/C/Z) */
  weighting: FrequencyWeighting;
  /** Current band selection ('overall' or band index) */
  band: DisplayBand;
}

/**
 * DOM elements for receiver results table
 */
export interface ReceiverTableElements {
  /** Receiver results table container */
  table: HTMLDivElement | null;
}

// ============================================================================
// Results Rendering Context
// ============================================================================

/**
 * Full context needed for renderResults
 */
export interface ResultsRenderContext {
  /** Scene results data */
  results: SceneResults;
  /** Current selection state */
  selection: Selection;
  /** Display configuration */
  displayConfig: ReceiverDisplayConfig;
  /** DOM elements for receiver table */
  receiverElements: ReceiverTableElements;
  /** DOM elements for panel display */
  panelElements: PanelDisplayElements;
  /** Number of panels in scene */
  panelCount: number;
  /** Callback to render sources table */
  onRenderSources: () => void;
  /** Callback to refresh pinned context panels */
  onRefreshPinnedPanels: () => void;
}
