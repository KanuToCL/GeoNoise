# Technical Debt Tracker

This document tracks architectural issues, inconsistencies, and refactoring opportunities in the GeoNoise codebase.

**Last Updated:** 2026-02-06
**Overall Health Score:** 6.5/10 (main.ts still 7,911 lines; extraction strategy defined)
**Next Milestone:** Reduce main.ts to ~2,000 lines via 12 module extractions

---

## Critical Issues

### 1. Monolithic main.ts (~7,911 lines)
**Priority:** High
**Effort:** Large
**Location:** `apps/web/src/main.ts`

The main entry point still contains 232 functions across multiple responsibilities:
- Probe system (charts, inspector, ray viz, pinning)
- Compute orchestration (receivers, panels, incremental)
- Pointer/interaction handlers (mouse events, hit testing)
- Context panel and properties rendering
- UI wiring (dock, settings, equations, propagation)
- Scene I/O (save, load, download)

**See:** [Main.ts Extraction Strategy](#maints-extraction-strategy-7911--2000-lines) for detailed plan.

**Proposed Split:**
```
apps/web/src/
├── main.ts                    # Entry point ONLY (~200-400 lines max) 🔲 Currently 7,915 lines
│
├── entities/                  # Entity definitions and helpers
│   ├── building.ts            # Building class ✅ Done
│   ├── barrier.ts             # Barrier type + helpers ✅ Done
│   ├── source.ts              # Source type + helpers ✅ Done
│   ├── receiver.ts            # Receiver type + helpers ✅ Done
│   ├── panel.ts               # Panel type + helpers ✅ Done
│   ├── probe.ts               # Probe type + helpers ✅ Done
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
│   ├── tools/                 # Tool-specific interaction ⚠️ PARTIAL
│   │   ├── select.ts          # Selection tool logic 🔲 Todo
│   │   ├── building.ts        # Building drawing tool 🔲 Todo
│   │   ├── barrier.ts         # Barrier drawing tool 🔲 Todo
│   │   ├── measure.ts         # Measure tool state ✅ Done
│   │   └── index.ts           # Barrel exports ✅ Done
│   └── index.ts               # Barrel exports ✅ Done
│
├── ui/                        # UI wiring and components ⚠️ PARTIAL
│   ├── panels/                # Side panels
│   │   ├── properties.ts      # Properties panel 🔲 Todo (~300 lines in main.ts)
│   │   ├── layers.ts          # Layer toggles ✅ Done
│   │   ├── settings.ts        # Settings panel 🔲 Todo (~200 lines in main.ts)
│   │   └── index.ts           # Barrel exports ✅ Done
│   ├── modals/                # Modal dialogs
│   │   ├── about.ts           # About/help modal ✅ Done
│   │   ├── export.ts          # Export dialog 🔲 Todo
│   │   ├── import.ts          # Import dialog 🔲 Todo
│   │   └── index.ts           # Barrel exports ✅ Done
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

**Target:** Reduce `main.ts` from ~7,911 lines to ~2,000 lines (see extraction strategy)

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

| File | Lines | Status | Action |
|------|-------|--------|--------|
| `main.ts` | ~7,911 | 🔴 Critical | See extraction strategy below |
| `mapboxUI.ts` | ~1,100 | 🟡 Growing | Monitor, consider split if >1,500 |
| `index.html` | ~1,600 | 🟡 Large | Extract inline styles to CSS |

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

---

## Main.ts Extraction Strategy (7,911 → 2,000 lines)

**Date:** 2026-02-06
**Current:** 7,911 lines, 232 functions
**Target:** ~2,000 lines (orchestration + minimal glue code)
**Estimated Extraction:** ~5,900 lines across 12 new/extended modules

### Why This Matters (From modular-architecture.md)

> **"Rule of thumb:** If an agent needs to read >500 lines to make a 10-line change, the code is too coupled."

| Scenario | Lines Read | ~Tokens | Context Used |
|----------|------------|---------|--------------|
| Read current main.ts (7,911 lines) | 7,911 | ~31,644 | 31% of 100k |
| Read focused module (200 lines) | 200 | ~800 | 0.8% of 100k |

**Current pain points:**
- Agent must load entire 7,911 lines to understand any subsystem
- No clear boundaries between probe system, compute, UI, interactions
- Can't test subsystems in isolation
- Changes to one area risk breaking unrelated code

---

### Function Category Analysis

| Category | Line Range | ~Lines | Functions | Extraction Target |
|----------|------------|--------|-----------|-------------------|
| **Probe system** | 1882-2831 | 950 | 27 | `probe/` module |
| **Spectrum editor** | 3052-3546 | 494 | 6 | `ui/spectrum/` module |
| **Pointer handlers** | 5121-6769 | 1,648 | 23 | `interactions/pointer/` |
| **Context panel** | 2831-4136 | 1,305 | 12 | `ui/contextPanel/` |
| **Compute orchestration** | 1069-1812 | 743 | 20 | `compute/orchestration/` |
| **Scene I/O** | 7121-7252 | 131 | 4 | `io/scene.ts` |
| **Modals/popovers** | 4277-4602 | 325 | 9 | `ui/settings/` |
| **Dock system** | 4811-5105 | 294 | 7 | `ui/dock/` |
| **Equations UI** | 4602-4714 | 112 | 8 | `ui/equations/` |
| **Propagation controls** | 7522-7830 | 308 | 3 | `ui/propagation/` |
| **Drawing wrappers** | 5733-5951 | 218 | 13 | Inline into render loop |
| **Init/globals** | 160-540, 7830+ | 450 | 15 | Keep in main.ts |

---

### New Module Structure

```
apps/web/src/
├── main.ts                           # ← TARGET: ~2,000 lines (orchestration only)
│
├── probe/                            # NEW: Acoustic probe subsystem (~950 lines)
│   ├── types.ts                      # ProbeState, PinnedProbe, ProbeSnapshot
│   ├── worker.ts                     # initProbeWorker, sendProbeRequest, handleProbeResult
│   ├── chart.ts                      # renderProbeChart, resizeProbeChart, renderProbeChartOn
│   ├── inspector.ts                  # renderProbeInspector, getProbeStatusLabel
│   ├── pinning.ts                    # pinProbe, unpinProbe, createPinnedProbePanel
│   ├── snapshots.ts                  # createProbeSnapshot, renderProbeSnapshots
│   ├── rays.ts                       # renderRayVisualization, disableRayVisualization, drawTracedRays
│   └── index.ts                      # Barrel exports
│
├── compute/                          # EXTEND: Computation orchestration (~743 lines)
│   ├── orchestration/                # NEW: Scene computation coordination
│   │   ├── scene.ts                  # buildEngineScene, computeScene, cancelCompute
│   │   ├── receivers.ts              # computeReceivers, computeReceiversIncremental
│   │   ├── panels.ts                 # computePanel, computePanelIncremental
│   │   ├── incremental.ts            # primeDragContribution, applyReceiverDelta, applyPanelDelta
│   │   └── index.ts                  # Barrel exports
│   ├── noiseGrid.ts                  # ✅ Already exists
│   ├── workerPool.ts                 # ✅ Already exists
│   └── index.ts                      # Update barrel
│
├── ui/                               # EXTEND: UI subsystems
│   ├── contextPanel/                 # NEW: Context/properties panel (~500 lines)
│   │   ├── types.ts                  # PinnedPanel state
│   │   ├── panel.ts                  # renderContextPanel, updateContextTitle
│   │   ├── properties.ts             # renderPropertiesFor, createInputRow
│   │   ├── pinning.ts                # createPinnedContextPanel, refreshPinnedContextPanels
│   │   └── index.ts                  # Barrel exports
│   │
│   ├── spectrum/                     # NEW: Spectrum editing (~494 lines)
│   │   ├── editor.ts                 # createSpectrumEditor, createInlineField
│   │   ├── chart.ts                  # renderSourceChartOn
│   │   ├── bar.ts                    # createSpectrumBar
│   │   └── index.ts                  # Barrel exports
│   │
│   ├── settings/                     # NEW: Settings popovers (~325 lines)
│   │   ├── map.ts                    # wireMapSettings, updateMapSettingsControls
│   │   ├── display.ts                # wireDisplaySettings
│   │   ├── layers.ts                 # wireLayersPopover (move from panels/)
│   │   └── index.ts                  # Barrel exports
│   │
│   ├── dock/                         # NEW: Dock system (~294 lines)
│   │   ├── labels.ts                 # wireDockLabels, resetDockInactivityTimer
│   │   ├── expand.ts                 # wireDockExpand
│   │   ├── submenu.ts                # showDrawingModeSubmenu, hideDrawingModeSubmenu
│   │   └── index.ts                  # Barrel exports
│   │
│   ├── equations/                    # NEW: Physics equation display (~112 lines)
│   │   ├── equations.ts              # updateAllEquations, rerenderKatex
│   │   ├── collapsibles.ts           # wireEquationCollapsibles
│   │   └── index.ts                  # Barrel exports
│   │
│   ├── propagation/                  # NEW: Propagation controls (~308 lines)
│   │   ├── controls.ts               # wirePropagationControls, updatePropagationControls
│   │   └── index.ts                  # Barrel exports
│   │
│   ├── status/                       # NEW: Status indicators (~100 lines)
│   │   ├── compute.ts                # setComputeChip, updateComputeButtonState, updateComputeUI
│   │   ├── map.ts                    # setMapToast, updateMapUI, updateMapButtonState
│   │   └── index.ts                  # Barrel exports
│   │
│   ├── panels/                       # ✅ Exists (layers.ts)
│   ├── modals/                       # ✅ Exists (about.ts)
│   └── toolbar.ts                    # ✅ Exists
│
├── interactions/                     # EXTEND: Pointer handlers (~1,648 lines)
│   ├── pointer/                      # NEW: Mouse/touch event handling
│   │   ├── types.ts                  # PointerState, HitResult
│   │   ├── handlers.ts               # handlePointerDown, handlePointerMove, handlePointerUp
│   │   ├── wheel.ts                  # handleWheel, wireWheel
│   │   └── index.ts                  # Barrel exports
│   │
│   ├── selection/                    # NEW: Selection operations (~300 lines)
│   │   ├── delete.ts                 # deleteSelection
│   │   ├── duplicate.ts              # duplicateMultiSelection
│   │   ├── selectAll.ts              # selectAll
│   │   ├── boxSelect.ts              # getElementsInSelectBox
│   │   └── index.ts                  # Barrel exports
│   │
│   ├── commit/                       # NEW: Draft commit operations (~400 lines)
│   │   ├── barrier.ts                # commitBarrierDraft, commitBarrierCenterDraft
│   │   ├── building.ts               # commitBuildingDraft, commitBuildingCenterDraft, commitBuildingPolygonDraft
│   │   ├── entities.ts               # addSourceAt, addReceiverAt, addProbeAt, addPanelAt
│   │   └── index.ts                  # Barrel exports
│   │
│   ├── hitTest.ts                    # ✅ Exists
│   ├── keyboard.ts                   # ✅ Exists
│   └── drag/                         # ✅ Exists
│
├── io/                               # EXTEND: Scene persistence (~131 lines)
│   ├── scene.ts                      # NEW: buildScenePayload, downloadScene, applyLoadedScene
│   ├── serialize.ts                  # ✅ Exists
│   └── deserialize.ts                # ✅ Exists
│
└── results/                          # NEW: Results rendering (~200 lines)
    ├── receivers.ts                  # getReceiverDisplayLevel, renderResults
    ├── panels.ts                     # panelSamplesToEnergy, recomputePanelStats, renderPanelStats
    ├── legend.ts                     # renderNoiseMapLegend, renderPanelLegend
    └── index.ts                      # Barrel exports
```

---

### Extraction Priority Order

Based on the **Four Questions Test** from modular-architecture.md:

| Priority | Module | Lines | Cohesion Test | Why First |
|----------|--------|-------|---------------|-----------|
| 1 | `probe/` | 950 | ✅ Single purpose: acoustic probes | Most self-contained, no external dependencies |
| 2 | `ui/spectrum/` | 494 | ✅ Single purpose: spectrum editing | High cohesion, used in multiple places |
| 3 | `compute/orchestration/` | 743 | ✅ Single purpose: compute coordination | Critical path, complex but isolated |
| 4 | `interactions/pointer/` | 700 | ✅ Single purpose: mouse events | Largest chunk, clears main.ts significantly |
| 5 | `interactions/selection/` | 300 | ✅ Single purpose: selection ops | Depends on entities, but isolated logic |
| 6 | `interactions/commit/` | 400 | ✅ Single purpose: draft → entity | Related to pointer handlers |
| 7 | `ui/contextPanel/` | 500 | ✅ Single purpose: property editing | UI-heavy, depends on entities |
| 8 | `results/` | 200 | ✅ Single purpose: result display | Small, quick win |
| 9 | `ui/settings/` | 325 | ⚠️ "Settings AND layers" | Could split further, but OK |
| 10 | `ui/dock/` | 294 | ✅ Single purpose: dock behavior | UI polish, low priority |
| 11 | `ui/equations/` | 112 | ✅ Single purpose: equation display | Small, quick win |
| 12 | `io/scene.ts` | 131 | ✅ Single purpose: scene I/O | Small, quick win |

---

### What Remains in main.ts (~2,000 lines)

After full extraction, `main.ts` should contain only:

```typescript
// === Imports (~100 lines) ===
import { initScene } from './state/scene.js';
import { initProbe, wireProbePanel } from './probe/index.js';
import { wirePointer } from './interactions/pointer/index.js';
// ... all module imports

// === DOM Element Queries (~100 lines) ===
const canvasEl = document.querySelector<HTMLCanvasElement>('#mapCanvas');
// ... essential DOM refs

// === Thin Wrapper Functions (~400 lines) ===
// Functions that coordinate between modules but contain no logic
function updateCounts() { /* calls state + UI */ }
function refreshCanvasTheme() { /* calls theme + rendering */ }

// === Global State Bindings (~200 lines) ===
// Necessary to wire module callbacks together
let noiseMapTexture: ImageData | null = null;
let renderPending = false;

// === Render Loop (~100 lines) ===
function requestRender() { ... }
function renderLoop() { ... }

// === Init Function (~100 lines) ===
function init() {
  initScene();
  initProbe();
  wirePointer(canvasEl);
  wireKeyboard();
  // ... module initialization calls
}

// === DOMContentLoaded ===
document.addEventListener('DOMContentLoaded', init);
```

**Key principle:** Any function in main.ts should either:
1. Be <20 lines (thin wrapper/coordinator)
2. Be directly related to wiring modules together
3. Manage the render loop

---

### Token Efficiency After Refactoring

| Scenario | Before | After | Savings |
|----------|--------|-------|---------|
| "Fix probe chart rendering" | 7,911 lines | 200 lines | **97.5%** |
| "Add new spectrum weighting" | 7,911 lines | 494 lines | **93.8%** |
| "Debug incremental compute" | 7,911 lines | 743 lines | **90.6%** |
| "Add new pointer gesture" | 7,911 lines | 700 lines | **91.2%** |

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
