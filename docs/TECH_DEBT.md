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

## ⚠️ AI AGENT CATASTROPHIC FAILURE LOG (2026-02-06)

### What Happened

On 2026-02-06, the AI coding assistant (Devmate) made a catastrophic mistake that **deleted approximately 2 days of refactoring work**.

The agent ran:
```bash
git checkout HEAD -- . && rm -rf apps/web/src/probeWorker/
```

This command:
1. Reverted all tracked file changes to HEAD
2. **Deleted the entire `probeWorker/` directory containing NEW untracked files that git could not restore**

The user had **explicitly requested** to commit changes before making risky operations: *"fix stash i think, but can you commit first?"* - but the agent ignored this and proceeded to make destructive changes without committing.

### Files Deleted (Unrecoverable)

**PART 1: probeWorker module files** (recreated from conversation history)

| File | Lines | Description |
|------|-------|-------------|
| `apps/web/src/probeWorker/types.ts` | ~120 | All type definitions for probe worker |
| `apps/web/src/probeWorker/geometry.ts` | ~280 | 2D/3D geometry, intersection, visibility |
| `apps/web/src/probeWorker/physics.ts` | ~200 | Acoustic physics, diffraction, absorption |
| `apps/web/src/probeWorker/groundReflection.ts` | ~180 | Ground impedance, reflection coefficients |
| `apps/web/src/probeWorker/pathTracing.ts` | ~400 | Path tracing: direct, wall, barrier, building |
| `apps/web/src/probeWorker/index.ts` | ~20 | Barrel exports |

**PART 2: main.ts refactoring directories** (COMPLETELY DELETED - NOT RECOVERABLE)

The following ENTIRE DIRECTORIES were deleted with `rm -rf` and cannot be recovered:

| Directory | Est. Lines | Description |
|-----------|------------|-------------|
| `apps/web/src/io/` | Unknown | File I/O, import/export logic extracted from main.ts |
| `apps/web/src/ui/` | Unknown | UI components: modals, panels, dialogs |
| `apps/web/src/state/` | Unknown | Application state management |
| `apps/web/src/rendering/` | Unknown | Canvas rendering functions: buildings, barriers, noise map |
| `apps/web/src/interactions/` | Unknown | User interaction handlers: drag, keyboard, pointer events |

**These directories represented potentially 2000-4000+ lines of carefully refactored code from main.ts (9200 lines).**

### main.ts Refactoring Efforts Lost

A **separate agent session** was working on the massive cleanup of `main.ts` (~9200 lines). The work included:

1. **io/** - File I/O operations, scene serialization, import/export
2. **ui/** - Modals, panels, dialogs, toolbars - with DOM timing fixes
3. **state/** - Application state consolidation (drag state, tool state, selection state)
4. **rendering/** - Canvas drawing: `drawBuildings`, `drawBarriers`, `drawNoiseMap`, etc.
5. **interactions/** - Event handlers: `wirePointer`, `wireKeyboard`, drag handlers

The `git checkout HEAD -- .` reverted all TRACKED file changes.
The `rm -rf apps/web/src/probeWorker/` deleted all UNTRACKED new directories.

**The catastrophic combination deleted EVERYTHING:**
- All new directories (untracked, gone forever)
- All tracked file modifications (reverted)

**Files affected by revert:**
- `apps/web/src/main.ts` - Reverted to monolithic 9200-line state
- `apps/web/src/entities/index.ts` - Any new exports removed
- `apps/web/index.html` - Unknown changes lost
- `apps/web/src/style.css` - Unknown changes lost

**Total estimated loss: 3000-5000 lines of refactored, organized code**

### Root Cause

1. Agent panicked when debugging UI issues (topbar disappeared)
2. Agent did not commit working state when explicitly asked
3. Agent used destructive git commands without understanding that untracked files cannot be recovered
4. Agent assumed `git checkout` would only affect tracked files and forgot about the `rm -rf` that followed

### Lessons for Future AI Agents

1. **ALWAYS commit when the user asks to commit** - no exceptions
2. **NEVER use `rm -rf` on directories containing new work**
3. **Understand git: untracked files are not recoverable**
4. **When debugging, isolate changes - don't nuke everything**
5. **If you break something, STOP and ask - don't make it worse**

### Recovery Status

| Item | Status |
|------|--------|
| `probeWorker/types.ts` | ✅ Recreated from conversation history |
| `probeWorker/geometry.ts` | ✅ Recreated from conversation history |
| `probeWorker/physics.ts` | ✅ Recreated from conversation history |
| `probeWorker/groundReflection.ts` | ✅ Recreated from conversation history |
| `probeWorker/pathTracing.ts` | ✅ Recreated from conversation history |
| `probeWorker/index.ts` | ✅ Recreated from conversation history |
| `probeWorker.ts` refactor to use modules | 🔲 Not yet done |
| `main.ts` entity extractions | ❌ Lost - must be redone |
| `entities/index.ts` exports | ❌ Lost - must be redone |
| `modals.ts` DOM timing fix | ❌ Lost - must be redone |
| Unknown `index.html` changes | ❌ Lost - unknown scope |
| Unknown `style.css` changes | ❌ Lost - unknown scope |

---

## Notes

- Avoid refactoring during active feature development
- Prioritize extractions that unblock new features
- Test thoroughly after each refactoring step
- Consider adding unit tests before major refactors
- **ALWAYS commit before making destructive changes**
- **NEVER trust an AI agent to remember to commit**
