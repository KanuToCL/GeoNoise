/**
 * Spatial indexing structures for efficient queries
 * Simple R-tree-like implementation and spatial hash
 */

import type { BoundingBox2D, Point2D } from '@geonoise/core/coords';
import { boundingBoxesIntersect, pointInBoundingBox } from '@geonoise/core/coords';

// ============================================================================
// Spatial Hash Grid
// ============================================================================

/**
 * A simple spatial hash for fast 2D point/object lookups
 */
export class SpatialHash<T> {
  private cells: Map<string, T[]> = new Map();
  private cellSize: number;
  private getBounds: (item: T) => BoundingBox2D;

  constructor(cellSize: number, getBounds: (item: T) => BoundingBox2D) {
    this.cellSize = cellSize;
    this.getBounds = getBounds;
  }

  /** Hash a coordinate to a cell key */
  private hash(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  /** Get all cell keys that a bounding box overlaps */
  private getCellKeys(bounds: BoundingBox2D): string[] {
    const keys: string[] = [];
    const minCx = Math.floor(bounds.minX / this.cellSize);
    const maxCx = Math.floor(bounds.maxX / this.cellSize);
    const minCy = Math.floor(bounds.minY / this.cellSize);
    const maxCy = Math.floor(bounds.maxY / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        keys.push(`${cx},${cy}`);
      }
    }
    return keys;
  }

  /** Insert an item into the hash */
  insert(item: T): void {
    const bounds = this.getBounds(item);
    const keys = this.getCellKeys(bounds);
    for (const key of keys) {
      let cell = this.cells.get(key);
      if (!cell) {
        cell = [];
        this.cells.set(key, cell);
      }
      cell.push(item);
    }
  }

  /** Insert multiple items */
  insertAll(items: T[]): void {
    for (const item of items) {
      this.insert(item);
    }
  }

  /** Query items that may intersect a bounding box */
  query(bounds: BoundingBox2D): T[] {
    const keys = this.getCellKeys(bounds);
    const seen = new Set<T>();
    const results: T[] = [];

    for (const key of keys) {
      const cell = this.cells.get(key);
      if (cell) {
        for (const item of cell) {
          if (!seen.has(item)) {
            seen.add(item);
            // Double-check actual intersection
            if (boundingBoxesIntersect(bounds, this.getBounds(item))) {
              results.push(item);
            }
          }
        }
      }
    }

    return results;
  }

  /** Query items near a point */
  queryPoint(point: Point2D): T[] {
    const key = this.hash(point.x, point.y);
    const cell = this.cells.get(key);
    if (!cell) return [];

    return cell.filter((item) => pointInBoundingBox(point, this.getBounds(item)));
  }

  /** Clear all items */
  clear(): void {
    this.cells.clear();
  }

  /** Get the number of cells */
  get cellCount(): number {
    return this.cells.size;
  }

  /** Get total item count (may include duplicates) */
  get itemCount(): number {
    let count = 0;
    for (const cell of this.cells.values()) {
      count += cell.length;
    }
    return count;
  }
}

// ============================================================================
// Simple R-Tree (Flat)
// ============================================================================

interface RTreeNode<T> {
  bounds: BoundingBox2D;
  item: T;
}

/**
 * A simple flat R-tree for spatial queries
 * Good enough for moderate datasets (<10k items)
 */
export class SimpleRTree<T> {
  private nodes: RTreeNode<T>[] = [];
  private getBounds: (item: T) => BoundingBox2D;

  constructor(getBounds: (item: T) => BoundingBox2D) {
    this.getBounds = getBounds;
  }

  /** Insert an item */
  insert(item: T): void {
    this.nodes.push({
      bounds: this.getBounds(item),
      item,
    });
  }

  /** Insert multiple items */
  insertAll(items: T[]): void {
    for (const item of items) {
      this.insert(item);
    }
  }

  /** Query items that intersect a bounding box */
  query(bounds: BoundingBox2D): T[] {
    return this.nodes
      .filter((node) => boundingBoxesIntersect(bounds, node.bounds))
      .map((node) => node.item);
  }

  /** Query items that contain a point */
  queryPoint(point: Point2D): T[] {
    return this.nodes
      .filter((node) => pointInBoundingBox(point, node.bounds))
      .map((node) => node.item);
  }

  /** Clear all items */
  clear(): void {
    this.nodes = [];
  }

  /** Get item count */
  get size(): number {
    return this.nodes.length;
  }

  /** Get all bounds for debugging */
  getAllBounds(): BoundingBox2D[] {
    return this.nodes.map((n) => n.bounds);
  }
}

// ============================================================================
// Grid-based Spatial Index
// ============================================================================

/**
 * A grid-based index specifically for receiver/sample points
 */
export class PointGrid {
  private grid: Map<string, Point2D[]> = new Map();
  private cellSize: number;
  private bounds: BoundingBox2D | null = null;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  /** Hash a coordinate to a cell key */
  private hash(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  /** Add a point */
  add(point: Point2D): void {
    const key = this.hash(point.x, point.y);
    let cell = this.grid.get(key);
    if (!cell) {
      cell = [];
      this.grid.set(key, cell);
    }
    cell.push(point);

    // Update bounds
    if (!this.bounds) {
      this.bounds = { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
    } else {
      if (point.x < this.bounds.minX) this.bounds.minX = point.x;
      if (point.y < this.bounds.minY) this.bounds.minY = point.y;
      if (point.x > this.bounds.maxX) this.bounds.maxX = point.x;
      if (point.y > this.bounds.maxY) this.bounds.maxY = point.y;
    }
  }

  /** Add multiple points */
  addAll(points: Point2D[]): void {
    for (const point of points) {
      this.add(point);
    }
  }

  /** Get points in a bounding box */
  query(bounds: BoundingBox2D): Point2D[] {
    const results: Point2D[] = [];
    const minCx = Math.floor(bounds.minX / this.cellSize);
    const maxCx = Math.floor(bounds.maxX / this.cellSize);
    const minCy = Math.floor(bounds.minY / this.cellSize);
    const maxCy = Math.floor(bounds.maxY / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const cell = this.grid.get(`${cx},${cy}`);
        if (cell) {
          for (const point of cell) {
            if (pointInBoundingBox(point, bounds)) {
              results.push(point);
            }
          }
        }
      }
    }

    return results;
  }

  /** Get all points */
  getAllPoints(): Point2D[] {
    const results: Point2D[] = [];
    for (const cell of this.grid.values()) {
      results.push(...cell);
    }
    return results;
  }

  /** Clear all points */
  clear(): void {
    this.grid.clear();
    this.bounds = null;
  }

  /** Get total point count */
  get size(): number {
    let count = 0;
    for (const cell of this.grid.values()) {
      count += cell.length;
    }
    return count;
  }

  /** Get the bounds of all points */
  getBounds(): BoundingBox2D | null {
    return this.bounds;
  }
}

// ============================================================================
// Nearest Neighbor Search
// ============================================================================

/**
 * Find the k nearest points to a target
 */
export function kNearestPoints(
  target: Point2D,
  points: Point2D[],
  k: number
): { point: Point2D; distance: number }[] {
  const distances = points.map((point) => {
    const dx = point.x - target.x;
    const dy = point.y - target.y;
    return {
      point,
      distance: Math.sqrt(dx * dx + dy * dy),
    };
  });

  distances.sort((a, b) => a.distance - b.distance);

  return distances.slice(0, k);
}

/**
 * Find all points within a radius
 */
export function pointsWithinRadius(
  target: Point2D,
  points: Point2D[],
  radius: number
): { point: Point2D; distance: number }[] {
  const radiusSq = radius * radius;
  const results: { point: Point2D; distance: number }[] = [];

  for (const point of points) {
    const dx = point.x - target.x;
    const dy = point.y - target.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= radiusSq) {
      results.push({ point, distance: Math.sqrt(distSq) });
    }
  }

  return results.sort((a, b) => a.distance - b.distance);
}
