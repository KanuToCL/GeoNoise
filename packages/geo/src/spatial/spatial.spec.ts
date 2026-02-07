/**
 * Unit tests for @geonoise/geo spatial module
 * Tests spatial indexing structures
 */

import { describe, it, expect } from 'vitest';
import {
  SpatialHash,
  SimpleRTree,
  PointGrid,
  kNearestPoints,
  pointsWithinRadius,
} from './index.js';
import type { BoundingBox2D, Point2D } from '@geonoise/core/coords';

// ============================================================================
// SpatialHash Tests
// ============================================================================

describe('SpatialHash', () => {
  interface TestItem {
    id: string;
    bounds: BoundingBox2D;
  }

  const getBounds = (item: TestItem) => item.bounds;

  it('creates empty hash', () => {
    const hash = new SpatialHash<TestItem>(10, getBounds);
    expect(hash.cellCount).toBe(0);
  });

  it('inserts and queries items', () => {
    const hash = new SpatialHash<TestItem>(10, getBounds);
    const item: TestItem = {
      id: 'a',
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
    };
    hash.insert(item);
    const results = hash.query({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(results).toContain(item);
  });

  it('does not return non-overlapping items', () => {
    const hash = new SpatialHash<TestItem>(10, getBounds);
    const item: TestItem = {
      id: 'a',
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
    };
    hash.insert(item);
    const results = hash.query({ minX: 100, minY: 100, maxX: 110, maxY: 110 });
    expect(results).not.toContain(item);
  });

  it('handles items spanning multiple cells', () => {
    const hash = new SpatialHash<TestItem>(10, getBounds);
    const largeItem: TestItem = {
      id: 'large',
      bounds: { minX: 0, minY: 0, maxX: 25, maxY: 25 },
    };
    hash.insert(largeItem);
    // Should be found in queries covering any part of the item
    expect(hash.query({ minX: 0, minY: 0, maxX: 5, maxY: 5 })).toContain(largeItem);
    expect(hash.query({ minX: 20, minY: 20, maxX: 30, maxY: 30 })).toContain(largeItem);
  });

  it('insertAll inserts multiple items', () => {
    const hash = new SpatialHash<TestItem>(10, getBounds);
    const items: TestItem[] = [
      { id: 'a', bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 } },
      { id: 'b', bounds: { minX: 10, minY: 10, maxX: 15, maxY: 15 } },
    ];
    hash.insertAll(items);
    const results = hash.query({ minX: 0, minY: 0, maxX: 20, maxY: 20 });
    expect(results.length).toBe(2);
  });

  it('queryPoint returns items containing point', () => {
    const hash = new SpatialHash<TestItem>(10, getBounds);
    const item: TestItem = {
      id: 'a',
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    };
    hash.insert(item);
    expect(hash.queryPoint({ x: 5, y: 5 })).toContain(item);
    expect(hash.queryPoint({ x: 15, y: 15 })).not.toContain(item);
  });

  it('clear removes all items', () => {
    const hash = new SpatialHash<TestItem>(10, getBounds);
    hash.insert({ id: 'a', bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 } });
    hash.clear();
    expect(hash.cellCount).toBe(0);
    expect(hash.query({ minX: 0, minY: 0, maxX: 100, maxY: 100 })).toEqual([]);
  });

  it('does not return duplicates for multi-cell items', () => {
    const hash = new SpatialHash<TestItem>(10, getBounds);
    const item: TestItem = {
      id: 'large',
      bounds: { minX: 0, minY: 0, maxX: 25, maxY: 25 },
    };
    hash.insert(item);
    const results = hash.query({ minX: 0, minY: 0, maxX: 30, maxY: 30 });
    // Should only appear once even though it's in multiple cells
    expect(results.filter(r => r === item).length).toBe(1);
  });
});

// ============================================================================
// SimpleRTree Tests
// ============================================================================

describe('SimpleRTree', () => {
  interface TestItem {
    id: string;
    bounds: BoundingBox2D;
  }

  const getBounds = (item: TestItem) => item.bounds;

  it('creates empty tree', () => {
    const tree = new SimpleRTree<TestItem>(getBounds);
    expect(tree.size).toBe(0);
  });

  it('inserts and queries items', () => {
    const tree = new SimpleRTree<TestItem>(getBounds);
    const item: TestItem = {
      id: 'a',
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
    };
    tree.insert(item);
    expect(tree.size).toBe(1);
    const results = tree.query({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(results).toContain(item);
  });

  it('does not return non-overlapping items', () => {
    const tree = new SimpleRTree<TestItem>(getBounds);
    const item: TestItem = {
      id: 'a',
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
    };
    tree.insert(item);
    const results = tree.query({ minX: 100, minY: 100, maxX: 110, maxY: 110 });
    expect(results).not.toContain(item);
  });

  it('insertAll inserts multiple items', () => {
    const tree = new SimpleRTree<TestItem>(getBounds);
    const items: TestItem[] = [
      { id: 'a', bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 } },
      { id: 'b', bounds: { minX: 10, minY: 10, maxX: 15, maxY: 15 } },
    ];
    tree.insertAll(items);
    expect(tree.size).toBe(2);
  });

  it('queryPoint returns items containing point', () => {
    const tree = new SimpleRTree<TestItem>(getBounds);
    const item: TestItem = {
      id: 'a',
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    };
    tree.insert(item);
    expect(tree.queryPoint({ x: 5, y: 5 })).toContain(item);
    expect(tree.queryPoint({ x: 15, y: 15 })).not.toContain(item);
  });

  it('clear removes all items', () => {
    const tree = new SimpleRTree<TestItem>(getBounds);
    tree.insert({ id: 'a', bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 } });
    tree.clear();
    expect(tree.size).toBe(0);
  });

  it('getAllBounds returns all bounding boxes', () => {
    const tree = new SimpleRTree<TestItem>(getBounds);
    const items: TestItem[] = [
      { id: 'a', bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 } },
      { id: 'b', bounds: { minX: 10, minY: 10, maxX: 15, maxY: 15 } },
    ];
    tree.insertAll(items);
    const bounds = tree.getAllBounds();
    expect(bounds.length).toBe(2);
  });
});

// ============================================================================
// PointGrid Tests
// ============================================================================

describe('PointGrid', () => {
  it('creates empty grid', () => {
    const grid = new PointGrid(10);
    expect(grid.size).toBe(0);
    expect(grid.getBounds()).toBeNull();
  });

  it('adds and queries points', () => {
    const grid = new PointGrid(10);
    grid.add({ x: 5, y: 5 });
    expect(grid.size).toBe(1);
    const results = grid.query({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(results.length).toBe(1);
    expect(results[0]).toEqual({ x: 5, y: 5 });
  });

  it('updates bounds as points are added', () => {
    const grid = new PointGrid(10);
    grid.add({ x: 5, y: 5 });
    expect(grid.getBounds()).toEqual({ minX: 5, minY: 5, maxX: 5, maxY: 5 });
    grid.add({ x: 10, y: 15 });
    expect(grid.getBounds()).toEqual({ minX: 5, minY: 5, maxX: 10, maxY: 15 });
    grid.add({ x: 0, y: 0 });
    expect(grid.getBounds()).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 15 });
  });

  it('addAll adds multiple points', () => {
    const grid = new PointGrid(10);
    grid.addAll([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 5, y: 5 },
    ]);
    expect(grid.size).toBe(3);
  });

  it('query returns only points in bounds', () => {
    const grid = new PointGrid(10);
    grid.addAll([
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 5, y: 5 },
    ]);
    const results = grid.query({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(results.length).toBe(2);
  });

  it('getAllPoints returns all points', () => {
    const grid = new PointGrid(10);
    const points: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ];
    grid.addAll(points);
    const all = grid.getAllPoints();
    expect(all.length).toBe(3);
  });

  it('clear removes all points', () => {
    const grid = new PointGrid(10);
    grid.addAll([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    grid.clear();
    expect(grid.size).toBe(0);
    expect(grid.getBounds()).toBeNull();
  });
});

// ============================================================================
// Nearest Neighbor Tests
// ============================================================================

describe('kNearestPoints', () => {
  const points: Point2D[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 5, y: 5 },
    { x: 20, y: 20 },
    { x: -5, y: -5 },
  ];

  it('returns k nearest points', () => {
    const nearest = kNearestPoints({ x: 0, y: 0 }, points, 2);
    expect(nearest.length).toBe(2);
    expect(nearest[0].point).toEqual({ x: 0, y: 0 });
    expect(nearest[0].distance).toBe(0);
  });

  it('returns all points if k > points.length', () => {
    const nearest = kNearestPoints({ x: 0, y: 0 }, points, 10);
    expect(nearest.length).toBe(5);
  });

  it('returns sorted by distance', () => {
    const nearest = kNearestPoints({ x: 0, y: 0 }, points, 5);
    for (let i = 1; i < nearest.length; i++) {
      expect(nearest[i].distance).toBeGreaterThanOrEqual(nearest[i - 1].distance);
    }
  });

  it('handles empty array', () => {
    const nearest = kNearestPoints({ x: 0, y: 0 }, [], 3);
    expect(nearest).toEqual([]);
  });
});

describe('pointsWithinRadius', () => {
  const points: Point2D[] = [
    { x: 0, y: 0 },
    { x: 3, y: 4 }, // distance = 5
    { x: 10, y: 0 },
    { x: 20, y: 20 },
  ];

  it('returns points within radius', () => {
    const within = pointsWithinRadius({ x: 0, y: 0 }, points, 6);
    expect(within.length).toBe(2); // origin and (3,4)
  });

  it('returns empty for very small radius', () => {
    const within = pointsWithinRadius({ x: 100, y: 100 }, points, 1);
    expect(within).toEqual([]);
  });

  it('returns sorted by distance', () => {
    const within = pointsWithinRadius({ x: 0, y: 0 }, points, 100);
    for (let i = 1; i < within.length; i++) {
      expect(within[i].distance).toBeGreaterThanOrEqual(within[i - 1].distance);
    }
  });

  it('includes point exactly at radius', () => {
    const within = pointsWithinRadius({ x: 0, y: 0 }, points, 5);
    expect(within.some(p => p.point.x === 3 && p.point.y === 4)).toBe(true);
  });

  it('handles empty array', () => {
    const within = pointsWithinRadius({ x: 0, y: 0 }, [], 10);
    expect(within).toEqual([]);
  });
});
