/**
 * UI-related types for GeoNoise canvas editor
 * Types for tools, selection, drag state, and visualization
 */

export type Point = { x: number; y: number };

/** Display mode: which frequency band to show (overall or specific octave band index 0-8) */
export type DisplayBand = 'overall' | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Labels for octave band display */
export const OCTAVE_BAND_LABELS = ['63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'] as const;

/** Available tools in the editor */
export type Tool =
  | 'select'
  | 'add-source'
  | 'add-receiver'
  | 'add-probe'
  | 'add-panel'
  | 'add-barrier'
  | 'add-building'
  | 'measure'
  | 'delete';

/** Types of elements that can be selected */
export type SelectableElementType = 'source' | 'receiver' | 'probe' | 'panel' | 'barrier' | 'building';

/** Item in a multi-selection */
export interface SelectionItem {
  elementType: SelectableElementType;
  id: string;
}

/** Current selection state */
export type Selection =
  | { type: 'none' }
  | { type: 'source'; id: string }
  | { type: 'probe'; id: string }
  | { type: 'receiver'; id: string }
  | { type: 'panel'; id: string }
  | { type: 'barrier'; id: string }
  | { type: 'building'; id: string }
  | { type: 'multi'; items: SelectionItem[] };

/** Current drag operation state */
export type DragState =
  | null
  | {
      type: 'source' | 'receiver' | 'probe' | 'panel' | 'barrier' | 'building';
      id: string;
      offset: Point;
    }
  | {
      type: 'panel-vertex';
      id: string;
      index: number;
      offset: Point;
    }
  | {
      type: 'building-resize';
      id: string;
    }
  | {
      type: 'building-rotate';
      id: string;
      startAngle: number;
      startRotation: number;
    }
  | {
      type: 'barrier-endpoint';
      id: string;
      endpoint: 'p1' | 'p2';
    }
  | {
      type: 'barrier-rotate';
      id: string;
      startAngle: number;
      startRotation: number;
      startLength: number;
      startMidpoint: Point;
    }
  | {
      type: 'select-box';
      startCanvasPoint: Point;
      currentCanvasPoint: Point;
    }
  | {
      type: 'move-multi';
      offsets: Map<string, Point>;
    };

/** Cached energy contributions for drag preview */
export type DragContribution = {
  sourceId: string;
  receiverEnergy: Map<string, number>;
  panelEnergy: Map<string, Float64Array>;
};

/** Noise map visualization data */
export type NoiseMap = {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  resolution: number;
  elevation: number;
  cols: number;
  rows: number;
  values: number[];
  min: number;
  max: number;
  texture: HTMLCanvasElement;
};

/** Range for color mapping */
export type MapRange = { min: number; max: number };

/** Rendering style for noise map */
export type MapRenderStyle = 'Smooth' | 'Contours';

/**
 * Compare two selections for equality
 */
export function sameSelection(a: Selection | null, b: Selection | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'none' || b.type === 'none') return a.type === b.type;
  if (a.type === 'multi' || b.type === 'multi') {
    if (a.type !== 'multi' || b.type !== 'multi') return false;
    if (a.items.length !== b.items.length) return false;
    return a.items.every((item, i) =>
      item.elementType === b.items[i].elementType && item.id === b.items[i].id
    );
  }
  return a.id === b.id;
}
