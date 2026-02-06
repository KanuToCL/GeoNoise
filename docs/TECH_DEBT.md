# Technical Debt Tracker

This document tracks architectural issues, inconsistencies, and refactoring opportunities in the GeoNoise codebase.

**Last Updated:** 2026-02-06
**Overall Health Score:** 7.0/10 (improved: state/, interactions/, ui/, rendering/ modules extracted)

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
├── main.ts                    # Entry point ONLY (~200-400 lines max) 🔲 Currently 8,092 lines
│
├── entities/                  # Entity definitions and helpers
│   ├── building.ts            # Building class ✅ Done
│   ├── barrier.ts             # Barrier type + helpers ✅ Done
│   ├── source.ts              # Source type + helpers 🔲 Todo (types in types.ts)
│   ├── receiver.ts            # Receiver type + helpers 🔲 Todo (types in types.ts)
│   ├── panel.ts               # Panel type + helpers 🔲 Todo (types in types.ts)
│   ├── probe.ts               # Probe type + helpers 🔲 Todo (types in types.ts)
│   ├── types.ts               # Shared entity types ✅ Done
│   └── index.ts               # Barrel exports ✅ Done
│
├── state/                     # Application state management ✅ ALL DONE
│   ├── scene.ts               # Scene data ✅ Done
│   ├── selection.ts           # Selection state ✅ Done
│   ├── history.ts             # Undo/redo stack ✅ Done
│   ├── tools.ts               # Active tool, drawing state ✅ Done
│   ├── viewport.ts            # Pan, zoom, camera ✅ Done
│   └── index.ts               # Barrel exports ✅ Done
│
├── rendering/                 # Canvas rendering functions ✅ ALL DONE
│   ├── types.ts               # Render types ✅ Done
│   ├── primitives.ts          # Lines, circles, handles ✅ Done
│   ├── grid.ts                # Background grid ✅ Done
│   ├── noiseMap.ts            # Heatmap rendering ✅ Done
│   ├── sources.ts             # drawSources ✅ Done
│   ├── receivers.ts           # drawReceivers ✅ Done
│   ├── barriers.ts            # drawBarriers ✅ Done
│   ├── buildings.ts           # drawBuildings ✅ Done
│   ├── probes.ts              # drawProbes ✅ Done
│   ├── panels.ts              # drawPanels, samples ✅ Done
│   ├── measure.ts             # Measurement, select box ✅ Done
│   ├── rays.ts                # Ray visualization ✅ Done
│   └── index.ts               # Barrel exports ✅ Done
│
├── interactions/              # User interaction handlers ⚠️ PARTIAL
│   ├── hitTest.ts             # Hit testing, box selection ✅ Done
│   ├── keyboard.ts            # Keyboard shortcuts ✅ Done
│   ├── pointer.ts             # Mouse/touch events 🔲 Todo (~400 lines in main.ts)
│   ├── drag/                  # Drag handling subsystem ✅ Done
│   │   ├── types.ts           # SceneData, DragApplyConfig ✅ Done
│   │   ├── handlers.ts        # Unified drag apply system ✅ Done
│   │   └── index.ts           # Barrel exports ✅ Done
│   ├── tools/                 # Tool-specific interaction 🔲 Todo
│   │   ├── select.ts          # Selection tool logic 🔲 Todo
│   │   ├── building.ts        # Building drawing tool 🔲 Todo
│   │   ├── barrier.ts         # Barrier drawing tool 🔲 Todo
│   │   ├── measure.ts         # Measure tool 🔲 Todo
│   │   └── index.ts           # 🔲 Todo
│   └── index.ts               # Barrel exports ✅ Done
│
├── ui/                        # UI wiring and components ⚠️ PARTIAL
│   ├── panels/                # Side panels
│   │   ├── properties.ts      # Properties panel 🔲 Todo (~300 lines in main.ts)
│   │   ├── layers.ts          # Layer toggles ✅ Done
│   │   ├── settings.ts        # Settings panel 🔲 Todo (~200 lines in main.ts)
│   │   └── index.ts           # 🔲 Todo
│   ├── modals/                # Modal dialogs
│   │   ├── about.ts           # About/help modal ✅ Done
│   │   ├── export.ts          # Export dialog 🔲 Todo
│   │   ├── import.ts          # Import dialog 🔲 Todo
│   │   └── index.ts           # 🔲 Todo
│   ├── toolbar.ts             # Tool grid, dock ✅ Done
│   ├── statusbar.ts           # Status bar updates 🔲 Todo
│   └── index.ts               # Barrel exports ✅ Done
│
├── io/                        # File I/O and serialization ✅ ALL DONE
│   ├── types.ts               # I/O types ✅ Done
│   ├── serialize.ts           # Scene to JSON ✅ Done
│   ├── deserialize.ts         # JSON to scene ✅ Done
│   ├── import.ts              # Import handling ✅ Done
│   ├── formats/               # Export format handlers
│   │   ├── png.ts             # PNG export ✅ Done
│   │   ├── pdf.ts             # PDF export ✅ Done
│   │   ├── csv.ts             # CSV data export ✅ Done
│   │   └── index.ts           # ✅ Done
│   └── index.ts               # Barrel exports ✅ Done
│
├── compute/                   # Computation orchestration ✅ ALL DONE
│   ├── types.ts               # Compute types ✅ Done
│   ├── noiseGrid.ts           # Grid computation ✅ Done
│   ├── workerPool.ts          # Web worker management ✅ Done
│   ├── progress.ts            # Progress tracking ✅ Done
│   └── index.ts               # Barrel exports ✅ Done
│
├── probeWorker/               # Acoustic probe worker ✅ ALL DONE
│   ├── types.ts               # ✅ Done
│   ├── geometry.ts            # ✅ Done
│   ├── physics.ts             # ✅ Done
│   ├── groundReflection.ts    # ✅ Done
│   ├── pathTracing.ts         # ✅ Done
│   └── index.ts               # ✅ Done
│
├── types/                     # Shared type definitions ✅ ALL DONE
│   ├── ui.ts                  # ✅ Done
│   ├── theme.ts               # ✅ Done
│   └── index.ts               # ✅ Done
│
├── utils/                     # Utility functions ✅ ALL DONE
│   ├── audio.ts               # ✅ Done
│   ├── colors.ts              # ✅ Done
│   ├── geometry.ts            # ✅ Done
│   ├── throttle.ts            # ✅ Done
│   └── index.ts               # ✅ Done
│
├── constants.ts               # App-wide constants ✅ Done
├── mapbox.ts                  # Mapbox core integration ✅ Done
├── mapboxUI.ts                # Mapbox UI controls (~1100 lines) ⚠️ Consider splitting
└── probeWorker.ts             # Worker entry point 🔲 Needs refactor to use probeWorker/
```

**Summary:**
- ✅ **Complete modules:** state/, rendering/, io/, compute/, probeWorker/, types/, utils/, entities/ (partial)
- ⚠️ **Partial modules:** interactions/ (hitTest, keyboard done), ui/ (layers, about, toolbar done)
- 🔲 **Still in main.ts:** pointer events, drag handlers, tool logic, properties panel, settings panel
- 🔲 **Needs integration:** All modules need to be wired into main.ts to remove duplicate code

**Target:** Reduce `main.ts` from ~8,566 lines to ~200-400 lines (entry point only)

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

### Phase 1: State Management (Priority: High) ✅ COMPLETE

| Task | Effort | Status | Notes |
|------|--------|--------|-------|
| Create `state/scene.ts` | Medium | ✅ Done | Sources, receivers, buildings, barriers arrays |
| Create `state/selection.ts` | Small | ✅ Done | Selected entity tracking, multi-select |
| Create `state/history.ts` | Medium | ✅ Done | Undo/redo stack implementation |
| Create `state/tools.ts` | Small | ✅ Done | Active tool, tool modes, drawing state |
| Create `state/viewport.ts` | Small | ✅ Done | Pan, zoom, camera state |
| Create `state/index.ts` | Small | ✅ Done | Barrel exports |

**Commit:** `df42938` (1,331 lines)

### Phase 2: Rendering (Priority: High) ✅ COMPLETE

| Task | Effort | Status | Notes |
|------|--------|--------|-------|
| Create `rendering/types.ts` | Small | ✅ Done | Render context, options types |
| Create `rendering/primitives.ts` | Medium | ✅ Done | Lines, circles, handles, labels |
| Create `rendering/grid.ts` | Small | ✅ Done | Background grid |
| Create `rendering/noiseMap.ts` | Medium | ✅ Done | Heatmap rendering |
| Create `rendering/sources.ts` | Small | ✅ Done | drawSources |
| Create `rendering/receivers.ts` | Small | ✅ Done | drawReceivers, badges |
| Create `rendering/barriers.ts` | Medium | ✅ Done | drawBarriers, drafts |
| Create `rendering/buildings.ts` | Medium | ✅ Done | drawBuildings, drafts |
| Create `rendering/probes.ts` | Small | ✅ Done | drawProbes |
| Create `rendering/panels.ts` | Medium | ✅ Done | drawPanels, samples |
| Create `rendering/measure.ts` | Small | ✅ Done | Measurement, select box |
| Create `rendering/index.ts` | Small | ✅ Done | Barrel exports |

**Commit:** `7d11d43` (1,582 lines)

### Phase 3: Interactions (Priority: High) ✅ PARTIAL

| Task | Effort | Status | Notes |
|------|--------|--------|-------|
| Create `interactions/hitTest.ts` | Medium | ✅ Done | Hit testing, box selection, selection helpers |
| Create `interactions/keyboard.ts` | Medium | ✅ Done | Keyboard shortcuts and handler factory |
| Create `interactions/index.ts` | Small | ✅ Done | Barrel exports |
| Create `interactions/pointer.ts` | Large | 🔲 Todo | Mouse/touch events (still in main.ts) |
| Create `interactions/drag/handlers.ts` | Medium | 🔲 Todo | Unified Draggable interface |
| Create `interactions/drag/building.ts` | Medium | 🔲 Todo | Building-specific drag |
| Create `interactions/drag/barrier.ts` | Small | 🔲 Todo | Barrier drag (endpoints, translate) |
| Create `interactions/drag/vertex.ts` | Small | 🔲 Todo | Vertex editing drag |
| Create `interactions/tools/select.ts` | Medium | 🔲 Todo | Selection tool logic |
| Create `interactions/tools/building.ts` | Medium | 🔲 Todo | Building drawing tool |
| Create `interactions/tools/barrier.ts` | Small | 🔲 Todo | Barrier drawing tool |
| Create `interactions/tools/measure.ts` | Small | 🔲 Todo | Measure tool |

**Commit:** `3d5bc66` (557 lines)

### Phase 4: UI (Priority: Medium) ✅ PARTIAL

| Task | Effort | Status | Notes |
|------|--------|--------|-------|
| Create `ui/panels/layers.ts` | Small | ✅ Done | Layer toggles and popover management |
| Create `ui/modals/about.ts` | Small | ✅ Done | Help/about modal with collapsible sections |
| Create `ui/toolbar.ts` | Medium | ✅ Done | Tool grid, drawing mode submenu, dock expansion |
| Create `ui/index.ts` | Small | ✅ Done | Barrel exports |
| Create `ui/panels/properties.ts` | Medium | 🔲 Todo | Properties panel |
| Create `ui/panels/settings.ts` | Medium | 🔲 Todo | Settings panel |
| Create `ui/modals/export.ts` | Medium | 🔲 Todo | Export dialog |
| Create `ui/modals/import.ts` | Medium | 🔲 Todo | Import dialog |
| Create `ui/statusbar.ts` | Small | 🔲 Todo | Status bar updates |

**Commit:** `56b96c3` (750 lines)

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

### Phase 9: Integration (Priority: High)

**Goal:** Wire new modules into main.ts and remove duplicate code

| Task | Effort | Status | Notes |
|------|--------|--------|-------|
| Import and use `state/` in main.ts | Large | 🔲 Todo | Replace ~500 lines of state variables |
| Import and use `interactions/` in main.ts | Medium | 🔲 Todo | Replace hit testing, keyboard |
| Import and use `ui/` in main.ts | Medium | 🔲 Todo | Replace toolbar, modals, layers |
| Import and use `rendering/` in main.ts | Large | 🔲 Todo | Replace ~1500 lines of draw functions |
| Remove dead code from main.ts | Medium | 🔲 Todo | Delete replaced implementations |
| Verify all functionality works | Large | 🔲 Todo | Full regression testing |

**Current main.ts:** ~8,566 lines
**Target main.ts:** ~400 lines (entry point only)
**Lines extracted to modules:** ~4,200+ lines (ready to integrate)

**Integration strategy:**
1. Add imports from new modules at top of main.ts
2. Replace function bodies with calls to module functions
3. Remove old implementations one section at a time
4. Test after each section is integrated
5. Commit after each successful integration

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
| **Agent A** | State + Interactions + UI | `state/`, `interactions/`, `ui/` | Sequential - each depends on prior |
| **Agent B** | Rendering + I/O + Compute | `rendering/`, `io/`, `compute/` | Waits for `state/` before starting `rendering/` |

**Rules:**
1. Both agents read `main.ts` but only extract their assigned sections
2. Agent A commits `state/` first (foundational for everything)
3. Agent B waits for `state/` commits, then can start `rendering/` (needs viewport/selection state)
4. `io/` and `compute/` are independent and can proceed in parallel
5. Neither agent touches physics (`probeWorker.ts`, `probeWorker/`)
6. After both complete, a single pass wires everything together in `main.ts`

**Merge order:**
```
main ← Agent A (state/) ← Agent B (rendering/) in parallel with Agent A (interactions/)
     ← Agent A (ui/) + Agent B (io/) + Agent B (compute/)
     ← final cleanup (lean main.ts)
```

**Commit strategy:** Commit after EACH file extraction, run tests before each commit.

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
