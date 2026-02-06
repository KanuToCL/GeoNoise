/**
 * Types for the spectrum editor module
 */

import type { Spectrum9, FrequencyWeighting } from '@geonoise/shared';
import type { Source } from '../../entities/types.js';

/**
 * Callback fired when spectrum values change
 */
export type OnChangeSpectrum = (spectrum: Spectrum9) => void;

/**
 * Callback fired when gain value changes
 */
export type OnChangeGain = (gain: number) => void;

/**
 * Configuration for the spectrum editor
 */
export interface SpectrumEditorConfig {
  /** The source to edit */
  source: Source;
  /** Callback when spectrum changes */
  onChangeSpectrum: OnChangeSpectrum;
  /** Callback when gain changes */
  onChangeGain: OnChangeGain;
  /** Current display weighting for chart rendering */
  displayWeighting: FrequencyWeighting;
}

/**
 * Chart rendering configuration
 */
export interface ChartRenderConfig {
  /** Canvas element to render on */
  canvas: HTMLCanvasElement;
  /** 2D rendering context */
  ctx: CanvasRenderingContext2D;
  /** 9-band spectrum in dB Lw (sound power level) */
  spectrum: Spectrum9;
  /** Master gain offset in dB */
  gain: number;
  /** Frequency weighting to apply */
  weighting: FrequencyWeighting;
}

/**
 * Chart padding configuration
 */
export interface ChartPadding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Function type for reading CSS variables
 */
export type ReadCssVar = (name: string) => string;
