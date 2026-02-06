# Technical Debt Tracker

This document tracks architectural issues, inconsistencies, and refactoring opportunities in the GeoNoise codebase.

**Last Updated:** 2026-02-05
**Overall Health Score:** 5.5/10 (downgraded due to lost refactoring work)

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
├── main.ts                    # Entry point ONLY (~200-400 lines max)
│
├── entities/                  # Entity definitions and helpers
│   ├── building.ts            # Building class ✅ Done
│   ├── barrier.ts             # Barrier type + helpers ✅ Done
│   ├── source.ts              # Source type + helpers
│   ├── receiver.ts            # Receiver type + helpers
│   ├── panel.ts               # Solar panel type + helpers
│   ├── types.ts               # Shared entity types ✅ Done
│   └── index.ts               # Barrel exports ✅ Done
│
├── state/                     # Application state management
│   ├── scene.ts               # Scene data (sources, receivers, buildings, barriers)
│   ├── selection.ts           # What's selected, multi-select state
│   ├── history.ts             # Undo/redo stack
│   ├── tools.ts               # Active tool, tool modes, drawing state
│   ├── viewport.ts            # Pan, zoom, camera state
│   └── index.ts
│
├── rendering/                 # Canvas rendering functions
│   ├── canvas.ts              # Core canvas setup, context, transforms
│   ├── buildings.ts           # drawBuildings, building shadows
│   ├── barriers.ts            # drawBarriers
│   ├── sources.ts             # drawSources
│   ├── receivers.ts           # drawReceivers
│   ├── noiseMap.ts            # Heatmap/noise grid rendering
│   ├── grid.ts                # Background grid
│   ├── controls.ts            # Handles, grips, rotation controls
│   ├── rays.ts                # Ray visualization paths
│   ├── measure.ts             # Measurement tool rendering
│   └── index.ts
│
├── interactions/              # User interaction handlers
│   ├── pointer.ts             # Mouse/touch events, hit testing
│   ├── keyboard.ts            # Keyboard shortcuts
│   ├── drag/                  # Drag handling subsystem
│   │   ├── handlers.ts        # Unified drag system, DragHandler interface
│   │   ├── building.ts        # Building-specific drag logic
│   │   ├── barrier.ts         # Barrier drag (endpoints, translate)
│   │   ├── vertex.ts          # Vertex editing drag
│   │   └── index.ts
│   ├── tools/                 # Tool-specific interaction logic
│   │   ├── select.ts          # Selection tool logic
│   │   ├── building.ts        # Building drawing tool
│   │   ├── barrier.ts         # Barrier drawing tool
│   │   ├── measure.ts         # Measure tool
│   │   └── index.ts
│   └── index.ts
│
├── ui/                        # UI wiring and components
│   ├── panels/                # Side panels
│   │   ├── properties.ts      # Properties panel for selected entities
│   │   ├── layers.ts          # Layer visibility toggles
│   │   ├── settings.ts        # Settings panel
│   │   └── index.ts
│   ├── modals/                # Modal dialogs
│   │   ├── export.ts          # Export dialog
│   │   ├── import.ts          # Import dialog
│   │   ├── help.ts            # Help/about modal
│   │   └── index.ts
│   ├── toolbar.ts             # Top toolbar wiring
│   ├── statusbar.ts           # Status bar updates
│   └── index.ts
│
├── io/                        # File I/O and serialization
│   ├── serialize.ts           # Scene to JSON
│   ├── deserialize.ts         # JSON to scene
│   ├── formats/               # Export format handlers
│   │   ├── png.ts             # PNG export
│   │   ├── pdf.ts             # PDF export
│   │   ├── csv.ts             # CSV data export
│   │   └── index.ts
│   ├── import.ts              # Import handling
│   └── index.ts
│
├── compute/                   # Computation orchestration
│   ├── noiseGrid.ts           # Grid computation orchestration
│   ├── workerPool.ts          # Web worker management and lifecycle
│   ├── progress.ts            # Progress tracking for long computations
│   └── index.ts
│
├── probeWorker/               # Acoustic probe worker modules ✅ Done
│   ├── types.ts               # ✅ Recreated
│   ├── geometry.ts            # ✅ Recreated
│   ├── physics.ts             # ✅ Recreated
│   ├── groundReflection.ts    # ✅ Recreated
│   ├── pathTracing.ts         # ✅ Recreated
│   └── index.ts               # ✅ Recreated
│
├── types/                     # Shared type definitions ✅ Done
│   ├── ui.ts
│   ├── theme.ts
│   └── index.ts
│
├── utils/                     # Utility functions ✅ Done
│   ├── audio.ts
│   ├── colors.ts
│   ├── geometry.ts
│   ├── throttle.ts
│   └── index.ts
│
├── constants.ts               # App-wide constants ✅ Done
├── mapbox.ts                  # Mapbox core integration
├── mapboxUI.ts                # Mapbox UI controls (~1100 lines - consider splitting)
└── probeWorker.ts             # Worker entry point (needs refactor to use probeWorker/)
```

**Target:** Reduce `main.ts` from ~9200 lines to ~200-400 lines (entry point only)

### What main.ts Should Contain After Refactoring

```typescript
// main.ts - Entry point only (~200-400 lines)

// === Imports ===
import { initScene, getScene } from './state/scene';
import { initHistory } from './state/history';
import { initSelection } from './state/selection';
import { initViewport } from './state/viewport';
import { initCanvas, render } from './rendering';
import { wirePointer } from './interactions/pointer';
import { wireKeyboard } from './interactions/keyboard';
import { wireToolbar } from './ui/toolbar';
import { wirePanels } from './ui/panels';
import { initMapbox } from './mapbox';

// === DOM Ready ===
document.addEventListener('DOMContentLoaded', () => {
  // Initialize state
  initScene();
  initHistory();
  initSelection();
  initViewport();

  // Initialize canvas
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  initCanvas(canvas);

  // Initialize Mapbox (if enabled)
  initMapbox();

  // Wire up interactions
  wirePointer(canvas);
  wireKeyboard();

  // Wire up UI
  wireToolbar();
  wirePanels();

  // Initial render
  render();
});
```

**Key principles:**
- main.ts only orchestrates initialization
- All logic lives in imported modules
- No function definitions longer than ~20 lines
- No direct DOM manipulation beyond getting root elements
- State accessed through module APIs, not global variables

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

### Completed ✅

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Extract `Building` class to own file | High | Small | ✅ Done |
| Extract `Barrier` type to own file | High | Small | ✅ Done |
| Extract utility functions to utils/ | High | Small | ✅ Done |
| Extract UI types to types/ | High | Small | ✅ Done |
| Create constants file | Low | Small | ✅ Done |
| Create probeWorker/ modules | High | Medium | ✅ Recreated |

### Phase 1: State Management (Priority: High)

| Task | Effort | Status | Notes |
|------|--------|--------|-------|
| Create `state/scene.ts` | Medium | 🔲 Todo | Sources, receivers, buildings, barriers arrays |
| Create `state/selection.ts` | Small | 🔲 Todo | Selected entity tracking, multi-select |
| Create `state/history.ts` | Medium | 🔲 Todo | Undo/redo stack implementation |
| Create `state/tools.ts` | Small | 🔲 Todo | Active tool, tool modes, drawing state |
| Create `state/viewport.ts` | Small | 🔲 Todo | Pan, zoom, camera state |
| Create `state/index.ts` | Small | 🔲 Todo | Barrel exports |

### Phase 2: Rendering (Priority: High - Largest chunk of main.ts)

| Task | Effort | Status | Notes |
|------|--------|--------|-------|
| Create `rendering/canvas.ts` | Medium | 🔲 Todo | Canvas setup, context, transforms |
| Create `rendering/buildings.ts` | Medium | 🔲 Todo | drawBuildings, shadows |
| Create `rendering/barriers.ts` | Small | 🔲 Todo | drawBarriers |
| Create `rendering/sources.ts` | Small | 🔲 Todo | drawSources |
| Create `rendering/receivers.ts` | Small | 🔲 Todo | drawReceivers |
| Create `rendering/noiseMap.ts` | Large | 🔲 Todo | Heatmap/noise grid rendering |
| Create `rendering/grid.ts` | Small | 🔲 Todo | Background grid |
| Create `rendering/controls.ts` | Medium | 🔲 Todo | Handles, grips, rotation controls |
| Create `rendering/rays.ts` | Medium | 🔲 Todo | Ray visualization paths |
| Create `rendering/measure.ts` | Small | 🔲 Todo | Measurement tool rendering |
| Create `rendering/index.ts` | Small | 🔲 Todo | Barrel exports |

### Phase 3: Interactions (Priority: High)

| Task | Effort | Status | Notes |
|------|--------|--------|-------|
| Create `interactions/pointer.ts` | Large | 🔲 Todo | Mouse/touch events, hit testing |
| Create `interactions/keyboard.ts` | Medium | 🔲 Todo | Keyboard shortcuts |
| Create `interactions/drag/handlers.ts` | Medium | 🔲 Todo | Unified Draggable interface |
| Create `interactions/drag/building.ts` | Medium | 🔲 Todo | Building-specific drag |
| Create `interactions/drag/barrier.ts` | Small | 🔲 Todo | Barrier drag (endpoints, translate) |
| Create `interactions/drag/vertex.ts` | Small | 🔲 Todo | Vertex editing drag |
| Create `interactions/tools/select.ts` | Medium | 🔲 Todo | Selection tool logic |
| Create `interactions/tools/building.ts` | Medium | 🔲 Todo | Building drawing tool |
| Create `interactions/tools/barrier.ts` | Small | 🔲 Todo | Barrier drawing tool |
| Create `interactions/tools/measure.ts` | Small | 🔲 Todo | Measure tool |

### Phase 4: UI (Priority: Medium)

| Task | Effort | Status | Notes |
|------|--------|--------|-------|
| Create `ui/panels/properties.ts` | Medium | 🔲 Todo | Properties panel |
| Create `ui/panels/layers.ts` | Small | 🔲 Todo | Layer toggles |
| Create `ui/panels/settings.ts` | Medium | 🔲 Todo | Settings panel |
| Create `ui/modals/export.ts` | Medium | 🔲 Todo | Export dialog |
| Create `ui/modals/import.ts` | Medium | 🔲 Todo | Import dialog |
| Create `ui/modals/help.ts` | Small | 🔲 Todo | Help/about modal |
| Create `ui/toolbar.ts` | Medium | 🔲 Todo | Top toolbar wiring |
| Create `ui/statusbar.ts` | Small | 🔲 Todo | Status bar updates |

### Phase 5: I/O (Priority: Medium)

| Task | Effort | Status | Notes |
|------|--------|--------|-------|
| Create `io/serialize.ts` | Medium | 🔲 Todo | Scene to JSON |
| Create `io/deserialize.ts` | Medium | 🔲 Todo | JSON to scene |
| Create `io/formats/png.ts` | Small | 🔲 Todo | PNG export |
| Create `io/formats/pdf.ts` | Medium | 🔲 Todo | PDF export |
| Create `io/formats/csv.ts` | Small | 🔲 Todo | CSV data export |
| Create `io/import.ts` | Medium | 🔲 Todo | Import handling |
| Migrate existing `export.ts` | Small | 🔲 Todo | Move to io/formats/ |

### Phase 6: Compute (Priority: Medium)

| Task | Effort | Status | Notes |
|------|--------|--------|-------|
| Create `compute/noiseGrid.ts` | Medium | 🔲 Todo | Grid computation orchestration |
| Create `compute/workerPool.ts` | Medium | 🔲 Todo | Web worker management |
| Create `compute/progress.ts` | Small | 🔲 Todo | Progress tracking |

### Phase 7: Entity Completion (Priority: Medium)

| Task | Effort | Status | Notes |
|------|--------|--------|-------|
| Create `entities/source.ts` | Small | 🔲 Todo | Source type + helpers |
| Create `entities/receiver.ts` | Small | 🔲 Todo | Receiver type + helpers |
| Create `entities/panel.ts` | Small | 🔲 Todo | Solar panel type + helpers |

### Phase 8: Cleanup (Priority: Low)

| Task | Effort | Status | Notes |
|------|--------|--------|-------|
| Refactor `probeWorker.ts` to use probeWorker/ modules | Medium | 🔲 Todo | Import from modular files |
| Split `mapboxUI.ts` (~1100 lines) | Medium | 🔲 Todo | Consider splitting if grows more |
| Move inline styles to CSS | Small | 🔲 Todo | Extract from index.html |
| Collect building diffraction paths for ray viz | Small | 🔲 Todo | See issue #8 |
| Fix barrier diffraction viz geometry | Small | 🔲 Todo | See issue #9 |

---

### Extraction Order Recommendation

**Recommended order to minimize merge conflicts and enable incremental testing:**

1. **state/** - Foundation for everything else. Extract state first so other modules can import from it.
2. **entities/** completion - Finish source.ts, receiver.ts, panel.ts
3. **rendering/** - Largest single chunk, high impact on main.ts line count
4. **interactions/** - Depends on state and entities
5. **ui/** - Depends on state and interactions
6. **io/** - Can be done independently
7. **compute/** - Can be done independently

**Commit strategy:** Commit after EACH file extraction, not after completing a phase.

---

### Parallel Agent Strategy

To accelerate the refactoring, work can be split between two agents working in parallel:

| Agent | Focus Area | Files | Notes |
|-------|------------|-------|-------|
| **Agent A** | State + Interactions | `state/`, `interactions/` | Sequential - interactions depends on state |
| **Agent B** | Rendering + I/O | `rendering/`, `io/` | Can work independently |

**Rules:**
1. Both agents read `main.ts` but only extract their assigned sections
2. Agent A commits first (state is foundational)
3. Agent B rebases onto Agent A's commits before pushing
4. Neither agent touches physics (`probeWorker.ts`, `probeWorker/`)
5. After both complete, a single pass wires everything together in `main.ts`

**Merge order:**
```
main ← Agent A (state/) ← Agent A (interactions/) ← Agent B (rendering/) ← Agent B (io/) ← final cleanup
```

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

### Recovery Status (Updated 2026-02-05)

| Item | Status | Notes |
|------|--------|-------|
| `probeWorker/types.ts` | ✅ Recreated | From conversation history |
| `probeWorker/geometry.ts` | ✅ Recreated | From conversation history |
| `probeWorker/physics.ts` | ✅ Recreated | From conversation history |
| `probeWorker/groundReflection.ts` | ✅ Recreated | From conversation history |
| `probeWorker/pathTracing.ts` | ✅ Recreated | From conversation history |
| `probeWorker/index.ts` | ✅ Recreated | From conversation history |
| `entities/building.ts` | ✅ Exists | Was not lost |
| `entities/barrier.ts` | ✅ Exists | Was not lost |
| `entities/types.ts` | ✅ Exists | Was not lost |
| `types/` directory | ✅ Exists | Was not lost |
| `utils/` directory | ✅ Exists | Was not lost |
| `constants.ts` | ✅ Exists | Was not lost |
| `probeWorker.ts` refactor to use modules | 🔲 Todo | Still monolithic |
| `state/` directory | ❌ Lost | Must be redone |
| `rendering/` directory | ❌ Lost | Must be redone |
| `interactions/` directory | ❌ Lost | Must be redone |
| `ui/` directory | ❌ Lost | Must be redone |
| `io/` directory | ❌ Lost | Must be redone |
| `main.ts` refactoring | ❌ Lost | Still at ~9200 lines |

**Estimated work to recover:** ~50+ file extractions across 8 phases

---

## Notes

- Avoid refactoring during active feature development
- Prioritize extractions that unblock new features
- Test thoroughly after each refactoring step
- Consider adding unit tests before major refactors
- **ALWAYS commit before making destructive changes**
- **NEVER trust an AI agent to remember to commit**
