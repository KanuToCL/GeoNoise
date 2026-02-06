/**
 * Ray Visualization Rendering
 *
 * Draws traced acoustic ray paths on the canvas for visualization.
 */

// =============================================================================
// TYPES
// =============================================================================

/** A point in 2D space */
export interface Point2D {
  x: number;
  y: number;
}

/** Type of acoustic path */
export type PathType = 'direct' | 'ground' | 'wall' | 'diffraction';

/** A traced acoustic path for visualization */
export interface TracedPath {
  type: PathType;
  points: Point2D[];
  level_dB: number;
  reflectionPoint?: Point2D;
  diffractionEdge?: Point2D;
}

/** Colors for different path types (RGBA format) */
export const PATH_COLORS: Record<PathType, string> = {
  direct: '45, 140, 255',      // Blue
  ground: '76, 175, 80',       // Green
  wall: '255, 152, 0',         // Orange
  diffraction: '156, 39, 176', // Purple
};

/** Dash patterns for different path types */
export const PATH_DASH_PATTERNS: Record<PathType, number[]> = {
  direct: [],
  ground: [6, 4],
  wall: [2, 3],
  diffraction: [8, 3, 2, 3],
};

// =============================================================================
// RAY DRAWING
// =============================================================================

/**
 * Draw traced acoustic rays on the canvas.
 *
 * @param ctx - Canvas 2D rendering context
 * @param paths - Array of traced paths to draw
 * @param worldToCanvas - Function to convert world coordinates to canvas coordinates
 */
export function drawTracedRays(
  ctx: CanvasRenderingContext2D,
  paths: TracedPath[],
  worldToCanvas: (point: Point2D) => Point2D
): void {
  if (!paths || paths.length === 0) return;

  // Find max level for opacity calculation
  const maxLevel = Math.max(...paths.map((p) => p.level_dB));

  for (const path of paths) {
    if (path.points.length < 2) continue;

    // Calculate opacity based on relative level (brighter = louder)
    const relativeLevel = path.level_dB - maxLevel;
    const opacity = Math.max(0.3, 1 + relativeLevel / 40);

    // Get color and dash pattern for this path type
    const color = PATH_COLORS[path.type] ?? '100, 100, 100';
    const dashPattern = PATH_DASH_PATTERNS[path.type] ?? [];

    ctx.save();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(${color}, ${opacity})`;
    ctx.setLineDash(dashPattern);

    // Draw the path
    ctx.beginPath();
    const firstPoint = worldToCanvas(path.points[0]);
    ctx.moveTo(firstPoint.x, firstPoint.y);

    for (let i = 1; i < path.points.length; i++) {
      const point = worldToCanvas(path.points[i]);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();

    // Draw reflection/diffraction point marker if present
    const markerPoint = path.reflectionPoint ?? path.diffractionEdge;
    if (markerPoint) {
      const mp = worldToCanvas(markerPoint);
      ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

/**
 * Get a human-readable label for a path type.
 */
export function getPathTypeLabel(type: PathType): string {
  switch (type) {
    case 'direct':
      return 'Direct';
    case 'ground':
      return 'Ground Reflection';
    case 'wall':
      return 'Wall Reflection';
    case 'diffraction':
      return 'Diffraction';
    default:
      return 'Unknown';
  }
}

/**
 * Get the CSS color for a path type.
 */
export function getPathTypeColor(type: PathType): string {
  const rgb = PATH_COLORS[type] ?? '100, 100, 100';
  return `rgb(${rgb})`;
}
