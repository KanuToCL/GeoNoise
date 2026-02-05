# Technical Debt Tracker

This document tracks architectural issues, inconsistencies, and refactoring opportunities in the GeoNoise codebase.

**Last Updated:** 2026-02-04
**Overall Health Score:** 6.5/10

---

## Critical Issues

### 1. Monolithic main.ts (~9200+ lines)
**Priority:** High
**Effort:** Large
**Location:** `apps/web/src/main.ts`

The main entry point contains too many responsibilities:
- `Building` class definition
- All UI wiring functions (`wireTools`, `wireKeyboard`, `wirePointer`, etc.)
- Rendering logic (`drawNoiseMap`, `drawBuildings`, `drawBarriers`, etc.)
- Drag handlers for all entity types
- Scene state management
- Undo/redo system

**Proposed Split:**
```
apps/web/src/
├── main.ts              # Entry point, initialization only
├── entities/
│   ├── building.ts      # Building class
│   ├── barrier.ts       # Barrier type + helpers
│   ├── source.ts        # Source type + helpers
│   └── receiver.ts      # Receiver type + helpers
├── state/
│   ├── scene.ts         # Scene state store
│   ├── selection.ts     # Selection state
│   └── history.ts       # Undo/redo
├── rendering/
│   ├── canvas.ts        # Core canvas operations
│   ├── buildings.ts     # Building rendering
│   ├── noiseMap.ts      # Heatmap rendering
│   └── controls.ts      # Handles, grips, etc.
├── interactions/
│   ├── dragHandlers.ts  # Unified drag system
│   ├── keyboard.ts      # Keyboard shortcuts
│   └── pointer.ts       # Mouse/touch events
└── ui/
    ├── panels.ts        # Side panel logic
    └── modals.ts        # Modal dialogs
```

---

## Consistency Issues

### 2. Mixed Entity Abstractions
**Priority:** Medium
**Effort:** Medium

`Building` is a class with methods (`translate()`, `getVertices()`, `isPolygon()`), but other entities are plain objects:
- `Barrier` - plain type with inline manipulation
- `Source` - plain type
- `Receiver` - plain type
- `Panel` - plain type

**Problem:** Drag logic handles each entity differently with duplicated patterns.

**Options:**
1. Convert all entities to classes with consistent interfaces
2. Keep all as plain types and use pure functions
3. Create a `Draggable` interface/mixin

---

### 3. Scattered Global State
**Priority:** Medium
**Effort:** Medium
**Location:** `apps/web/src/main.ts` (lines 700-900+)

State is spread across many `let` declarations:
```typescript
let dragState: DragState | null = null;
let activeTool: Tool = 'select';
let buildingDragActive = false;
let buildingPolygonDraft: Point[] = [];
let buildingPolygonPreviewPoint: Point | null = null;
let measureStart: Point | null = null;
let measureEnd: Point | null = null;
// ... 20+ more
```

**Proposed:** Consolidate into a single state object or use a minimal state manager:
```typescript
const appState = {
  tool: { active: 'select', mode: null },
  drag: { state: null, active: false },
  drawing: { polygonDraft: [], previewPoint: null },
  measure: { start: null, end: null },
  // ...
};
```

---

### 4. Inline Styles in HTML
**Priority:** Low
**Effort:** Small
**Location:** `apps/web/index.html`

Many UI elements use extensive inline styles:
```html
<div style="display: flex; flex-direction: column; gap: 6px; position: relative;">
  <label style="font-size: 11px; color: #aaa; font-weight: 500;">Search Location:</label>
  ...
</div>
```

**Proposed:** Extract to CSS classes in `style.css` or `theme.css`.

---

### 5. Magic Numbers
**Priority:** Low
**Effort:** Small

Scattered constants without clear naming:
- `16` - default zoom level for search results
- `300` - debounce timeout in ms
- `20` - rotation handle offset
- `0.7` - various opacity values

**Proposed:** Create a `constants.ts` file:
```typescript
export const UI = {
  DEBOUNCE_MS: 300,
  DEFAULT_SEARCH_ZOOM: 16,
  ROTATION_HANDLE_OFFSET_PX: 20,
};
```

---

## Code Duplication

### 6. Drag Handler Patterns
**Priority:** Medium
**Effort:** Medium
**Location:** `apps/web/src/main.ts` (lines 7300-7450)

Each entity type has similar drag logic:
```typescript
if (activeDrag.type === 'building') { ... }
if (activeDrag.type === 'barrier') { ... }
if (activeDrag.type === 'panel') { ... }
// etc.
```

**Proposed:** Create a unified `DragHandler` abstraction:
```typescript
interface Draggable {
  id: string;
  getPosition(): Point;
  setPosition(p: Point): void;
  translate(dx: number, dy: number): void;
}
```

---

### 7. Layer Toggle Wiring
**Priority:** Low
**Effort:** Small

`wireLayerToggle` is generic but other wiring functions are copy-pasted with slight variations.

---

## Growing Files to Watch

| File | Lines | Status |
|------|-------|--------|
| `main.ts` | ~9200 | 🔴 Critical |
| `mapboxUI.ts` | ~1100 | 🟡 Growing |
| `index.html` | ~1600 | 🟡 Large |

---

## Refactoring Backlog

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Extract `Building` class to own file | High | Small | ✅ Done |
| Extract utility functions to utils/ | High | Small | ✅ Done |
| Extract UI types to types/ | High | Small | ✅ Done |
| Create constants file | Low | Small | ✅ Done |
| Extract rendering functions | High | Medium | 🔲 Todo |
| Consolidate global state | Medium | Medium | 🔲 Todo |
| Unify entity abstractions | Medium | Large | 🔲 Todo |
| Extract drag handlers | Medium | Medium | 🔲 Todo |
| Split probeWorker.ts (path collection vs level computation) | Low | Medium | 🔲 Todo |
| Collect building diffraction paths for ray viz | Medium | Small | 🔲 Todo |
| Fix barrier diffraction viz geometry | Low | Small | 🔲 Todo |
| Move inline styles to CSS | Low | Small | 🔲 Todo |

---

## Ray Visualization Incomplete Implementation

### 8. Building Diffraction Paths Not Collected for Visualization
**Priority:** Medium
**Effort:** Small
**Location:** `apps/web/src/probeWorker.ts` (lines 1705-1727)

The physics engine correctly computes building diffraction paths (over-roof and around-corner), and these are included in the coherent phasor summation. However, **they are never added to `collectedPaths`** for ray visualization.

**Current State:**
- `buildingDiffPaths` computed and used in phasor loop ✅
- No `collectedPaths.push()` for building diffraction paths ❌

**Compare to other path types:**
- Direct path: collected at line 1694-1702 ✅
- Ground reflection: collected at line 1783-1791 ✅
- Wall reflection: collected at line 1837-1845 ✅
- Barrier diffraction: collected at line 1813-1821 ✅
- Building diffraction: **NOT COLLECTED** ❌

**Impact:** When ray visualization is enabled, building diffraction rays (which may be the dominant path when buildings block line-of-sight) are invisible to the user.

**Fix:** Add path collection loop after line 1727 to extract 2D points from `buildingDiffPaths[].waypoints`.

---

### 9. Barrier Diffraction Visualization Uses Midpoint Approximation
**Priority:** Low
**Effort:** Small
**Location:** `apps/web/src/probeWorker.ts` (lines 1808-1812)

The barrier diffraction visualization uses the midpoint between source and receiver as the diffraction point:
```typescript
// Calculate approximate diffraction point (midpoint for simplicity)
const diffPoint: Point2D = {
  x: (srcPos.x + probePos.x) / 2,
  y: (srcPos.y + probePos.y) / 2,
};
```

**Note:** The physics computation is correct - it uses the actual barrier intersection point (see `traceBarrierDiffractionPaths()` at line 942-944). This is only a visualization issue.

**Impact:** Ray visualization shows diffraction occurring at wrong location. Low priority since physics is correct.

**Fix:** The `RayPath` interface returned by `traceBarrierDiffractionPaths()` doesn't include waypoint geometry. Either:
1. Extend `RayPath` to include `waypoints?: Point3D[]`
2. Re-compute intersection when collecting paths (duplicate work but simple)

---

### 10. TracedPath Type Missing Building Diffraction Category
**Priority:** Low
**Effort:** Small
**Location:** `packages/engine/src/api/index.ts` (line 206)

The `TracedPath.type` only supports:
```typescript
type: 'direct' | 'ground' | 'wall' | 'diffraction';
```

But internally the code uses `pathTypes.add('building-diffraction')` (probeWorker.ts:1632). Building diffraction cannot be visually distinguished from barrier diffraction.

**Note:** ISO 9613-2 doesn't distinguish these for calculation purposes - both use Maekawa-style diffraction. This is purely a visualization/debugging enhancement.

**Fix:** Extend type to include `'building-roof' | 'building-corner'` if visual distinction is desired.

---

### 11. Side Diffraction Paths Lack Proper Visualization Geometry
**Priority:** Low
**Effort:** Small
**Location:** `apps/web/src/probeWorker.ts`

When `barrierSideDiffraction` is enabled, the engine computes around-left and around-right paths via `traceBarrierDiffractionPaths()`. However, the path collection doesn't distinguish between over-top and around-side diffraction - all are collected with the same midpoint approximation.

**Impact:** When side diffraction is the dominant path (short barriers), visualization may be misleading.

---

## Ray Visualization Summary Table

| Path Type | Physics Computed | Visualization Collected | Geometry Accurate |
|-----------|-----------------|------------------------|-------------------|
| Direct | ✅ | ✅ | ✅ |
| Ground Bounce | ✅ | ✅ | ✅ |
| Wall Reflection (1st order) | ✅ | ✅ | ✅ |
| Barrier Diffraction (over-top) | ✅ | ✅ | ⚠️ Midpoint approx |
| Barrier Diffraction (around-side) | ✅ | ✅ | ⚠️ Midpoint approx |
| Building Diffraction (over-roof) | ✅ | ❌ | N/A |
| Building Diffraction (around-corner) | ✅ | ❌ | N/A |

---

## Notes

- Avoid refactoring during active feature development
- Prioritize extractions that unblock new features
- Test thoroughly after each refactoring step
- Consider adding unit tests before major refactors
