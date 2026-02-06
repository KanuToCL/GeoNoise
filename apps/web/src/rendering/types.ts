/**
 * Rendering Types
 *
 * Type definitions for canvas rendering functions.
 */

import type { Point } from '../entities/index.js';
import type { CanvasTheme } from '../types/theme.js';

/**
 * Canvas rendering context with typed 2D context
 */
export type RenderContext = {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  theme: CanvasTheme;
  pixelsPerMeter: number;
  worldToCanvas: (point: Point) => Point;
};

/**
 * Visible layer toggles
 */
export type LayerVisibility = {
  grid: boolean;
  noiseMap: boolean;
  sources: boolean;
  receivers: boolean;
  panels: boolean;
};

/**
 * Handle rendering options
 */
export type HandleOptions = {
  fillColor: string;
  strokeColor: string;
  radius: number;
  lineWidth?: number;
};

/**
 * Line rendering options
 */
export type LineOptions = {
  color: string;
  width: number;
  dash?: number[];
  cap?: CanvasLineCap;
  join?: CanvasLineJoin;
};

/**
 * Selection state for rendering highlights
 */
export type SelectionState = {
  type: string;
  id?: string;
  items?: Array<{ elementType: string; id: string }>;
};

/**
 * Label rendering options
 */
export type LabelOptions = {
  font?: string;
  color: string;
  offsetX?: number;
  offsetY?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
};

/**
 * Badge rendering options
 */
export type BadgeOptions = {
  bgColor: string;
  borderColor: string;
  textColor: string;
  padding?: number;
  offsetX?: number;
  offsetY?: number;
};

/**
 * Dimension label box (for building/barrier drafts)
 */
export type DimensionBox = {
  lines: string[];
  centerX: number;
  centerY: number;
  bgColor?: string;
  textColor?: string;
  font?: string;
};
