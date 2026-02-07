# Technical Debt Tracker

This document tracks architectural issues, inconsistencies, and refactoring opportunities in the GeoNoise codebase.

**Last Updated:** 2026-02-07
**Overall Health Score:** 7.2/10 (main.ts reduced to 5,142 lines; 2,769 lines extracted)
**Next Milestone:** Reduce main.ts to ~3,500 lines (then ~2,000 lines)

---

## Executive Summary

### Current Status

| Metric | Value | Change |
|--------|-------|--------|
| **main.ts lines** | 5,142 | ↓ 2,769 from 7,911 (35% reduction) |
| **Modules extracted** | 17+ | +3 this session |
| **Functions in main.ts** | ~175 | ↓ from 232 |
| **Health Score** | 7.2/10 | ↑ from 7.0/10 |

### What Got Done (This Session)

| Extraction | Lines Removed | Module Created/Wired | Commit |
|------------|---------------|----------------------|--------|
| `renderPropertiesFor` | ~260 lines | `ui/contextPanel/properties.ts` | `0d3099b` |
| `createPinnedContextPanel` + `refreshPinnedContextPanels` | ~175 lines | `ui/contextPanel/pinnedPanel.ts` | `7f2a2bf` |
| Scene I/O wiring (`downloadScene`, `wireSaveLoad`, `buildScenePayload`) | ~26 lines | Wired to `io/` module | pending |
| **Total this session** | **~461 lines** | **3 extractions** | |

### What's Next (Priority Order)

1. **renderSources** (~250 lines) → `ui/sources.ts`
2. **createPinnedProbePanel / probe rendering** (~200 lines) → wire to `probe/` module
3. **wireMapSettings / wireDisplaySettings** (~150 lines) → `ui/settings.ts`
4. ~~**Scene I/O functions**~~ ✅ Wired to `io/` module
5. **Remaining context panel functions** (~100 lines) → `ui/contextPanel/`

---

## Critical Issues

### 1. Monolithic main.ts (~5,142 lines) ⚠️ IN PROGRESS

**Priority:** High
**Effort:** Large (ongoing)
**Location:** `apps/web/src/main.ts`

**Progress:** Down from 7,911 lines to 5,142 lines (35% reduction achieved)

The main entry point still contains ~175 functions across multiple responsibilities:
- ~~Probe system~~ → Partially extracted to `probe/` module
- ~~Compute orchestration~~ → Extracted to `compute/orchestration/`
- ~~Pointer/keyboard handlers~~ → Extracted to `interaction/pointer.ts`, `interaction/keyboard.ts`
- ~~Context panel properties~~ → Extracted to `ui/contextPanel/properties.ts`
- ~~Pinned context panels~~ → Extracted to `ui/contextPanel/pinnedPanel.ts`
- ~~Scene I/O (save, load, download)~~ → Wired to `io/` module
- UI wiring (dock, settings, equations, propagation) → Partially extracted

**Proposed Split (Updated):**
```
apps/web/src/
├── main.ts                    # Entry point (~5,142 lines → target ~2,000)
│
├── entities/                  # Entity definitions and helpers ✅ COMPLETE
│   ├── building.ts            ✅ Done
│   ├── barrier.ts             ✅ Done
│   ├── source.ts              ✅ Done
│   ├── receiver.ts            ✅ Done
│   ├── panel.ts               ✅ Done
│   ├── probe.ts               ✅ Done
│   ├── types.ts               ✅ Done
│   └── index.ts               ✅ Done
│
├── state/                     # Application state management ✅ COMPLETE
│   ├── scene.ts               ✅ Done
│   ├── selection.ts           ✅ Done
│   ├── history.ts             ✅ Done
│   ├── tools.ts               ✅ Done
│   ├── viewport.ts            ✅ Done
│   └── index.ts               ✅ Done
│
├── rendering/                 # Canvas rendering functions ✅ COMPLETE
│   ├── types.ts               ✅ Done
│   ├── primitives.ts          ✅ Done
│   ├── grid.ts                ✅ Done
│   ├── noiseMap.ts            ✅ Done
│   ├── sources.ts             ✅ Done
│   ├── receivers.ts           ✅ Done
│   ├── barriers.ts            ✅ Done
│   ├── buildings.ts           ✅ Done (with polygon draft preview)
│   ├── probes.ts              ✅ Done
│   ├── panels.ts              ✅ Done
│   ├── measure.ts             ✅ Done
│   ├── rays.ts                ✅ Done
│   └── index.ts               ✅ Done
│
├── interaction/               # User interaction handlers ✅ COMPLETE (NEW)
│   ├── pointer.ts             ✅ Done (extracted this refactor cycle)
│   ├── keyboard.ts            ✅ Done (extracted this refactor cycle)
│   └── (note: separate from interactions/ which has hitTest)
│
├── interactions/              # Hit testing and drag system ✅ COMPLETE
│   ├── hitTest.ts             ✅ Done
│   ├── keyboard.ts            ✅ Done (older version)
│   ├── drag/                  ✅ Done
│   │   ├── types.ts           ✅ Done
│   │   ├── handlers.ts        ✅ Done
│   │   └── index.ts           ✅ Done
│   ├── tools/                 ✅ Done
│   │   ├── measure.ts         ✅ Done
│   │   └── index.ts           ✅ Done
│   └── index.ts               ✅ Done
│
├── ui/                        # UI wiring and components ⚠️ 75% COMPLETE
│   ├── contextPanel/          ✅ COMPLETE (expanded this session)
│   │   ├── types.ts           ✅ Done
│   │   ├── fields.ts          ✅ Done
│   │   ├── properties.ts      ✅ Done (NEW - 415 lines)
│   │   ├── pinnedPanel.ts     ✅ Done (NEW - 262 lines)
│   │   └── index.ts           ✅ Done (updated)
│   ├── panels/                ✅ COMPLETE
│   │   ├── layers.ts          ✅ Done
│   │   ├── propagation.ts     ✅ Done
│   │   ├── collapsible.ts     ✅ Done
│   │   └── index.ts           ✅ Done
│   ├── modals/                ✅ COMPLETE
│   │   ├── about.ts           ✅ Done
│   │   └── index.ts           ✅ Done
│   ├── spectrum/              ✅ COMPLETE
│   │   ├── bar.ts             ✅ Done
│   │   ├── chart.ts           ✅ Done
│   │   ├── editor.ts          ✅ Done
│   │   ├── types.ts           ✅ Done
│   │   └── index.ts           ✅ Done
│   ├── toolbar.ts             ✅ Done (with drawing mode submenu)
│   ├── equations.ts           ✅ Done
│   ├── compute.ts             ✅ Done (NEW)
│   ├── index.ts               ✅ Done
│   ├── settings.ts            🔲 Todo (~200 lines remaining in main.ts)
│   └── sources.ts             🔲 Todo (renderSources ~250 lines)
│
├── probe/                     # Probe system ✅ MOSTLY COMPLETE
│   ├── types.ts               ✅ Done
│   ├── state.ts               ✅ Done
│   ├── worker.ts              ✅ Done
│   ├── panels.ts              ✅ Done
│   ├── pinning.ts             ✅ Done
│   ├── snapshots.ts           ✅ Done
│   ├── rays.ts                ✅ Done
│   ├── inspector.ts           ✅ Done
│   └── index.ts               ✅ Done
│
├── results/                   # Results rendering ✅ COMPLETE
│   ├── legend.ts              ✅ Done
│   └── index.ts               ✅ Done
│
├── compute/                   # Computation orchestration ✅ COMPLETE
│   ├── orchestration/         ✅ Done
│   │   ├── receivers.ts       ✅ Done
│   │   ├── panels.ts          ✅ Done
│   │   ├── incremental.ts     ✅ Done
│   │   └── index.ts           ✅ Done
│   └── index.ts               ✅ Done
│
├── io/                        # File I/O and serialization ✅ COMPLETE
│   ├── types.ts               ✅ Done
│   ├── serialize.ts           ✅ Done
│   ├── deserialize.ts         ✅ Done
│   ├── import.ts              ✅ Done
│   ├── formats/               ✅ Done
│   │   ├── png.ts             ✅ Done
│   │   ├── pdf.ts             ✅ Done
│   │   ├── csv.ts             ✅ Done
│   │   └── index.ts           ✅ Done
│   └── index.ts               ✅ Done
│
├── types/                     # Shared type definitions ✅ COMPLETE
├── utils/                     # Utility functions ✅ COMPLETE
├── constants.ts               ✅ Done
├── mapbox.ts                  ✅ Done
└── mapboxUI.ts                ⚠️ Consider splitting (~1,100 lines)
```

---

## Extraction Progress Tracker

### Completed Modules (This Refactor Cycle)

| Phase | Module | Lines | Commit | Date |
|-------|--------|-------|--------|------|
| Spectrum | `ui/spectrum/` | ~500 | `fdf630d0` | 2026-02-06 |
| Results | `results/legend.ts` | ~150 | `1abb2dc5` | 2026-02-06 |
| Compute | `compute/orchestration/` | ~400 | `1abb2dc5` | 2026-02-06 |
| Equations | `ui/equations.ts` | ~200 | `244719a1` | 2026-02-06 |
| Propagation | `ui/panels/propagation.ts` | ~300 | `0804d7d6` | 2026-02-06 |
| Compute UI | `ui/compute.ts` | ~100 | `23a8b3c3` | 2026-02-06 |
| Pointer | `interaction/pointer.ts` | ~680 | `ea8eb197` | 2026-02-06 |
| Keyboard | `interaction/keyboard.ts` | ~250 | `a7b17f48` | 2026-02-06 |
| Properties | `ui/contextPanel/properties.ts` | ~415 | `0d3099b` | 2026-02-06 |
| Pinned Panel | `ui/contextPanel/pinnedPanel.ts` | ~262 | `7f2a2bf` | 2026-02-06 |

**Total lines extracted this cycle:** ~3,257 lines in new modules

### Remaining in main.ts (Priority Order)

| Function/Section | ~Lines | Target Module | Priority |
|------------------|--------|---------------|----------|
| `renderSources` + source list UI | ~250 | `ui/sources.ts` | High |
| `createProbeSnapshotWrapper` | ~100 | wire to `probe/snapshots.ts` | High |
| `wireMapSettings` + `wireDisplaySettings` | ~150 | `ui/settings.ts` | Medium |
| ~~Scene I/O wrappers~~ | ~~100~~ | ~~wire to `io/` module~~ | ✅ Done |
| `createFieldLabel`, `createInlineField` | ~80 | already in `ui/contextPanel/fields.ts` | Low |
| Remaining legend/stats functions | ~80 | wire to `results/` module | Low |
| Drawing mode submenu state | ~100 | already in `ui/toolbar.ts` | Low |

---

## What main.ts Should Contain After Refactoring

```typescript
// main.ts - Entry point only (~400-600 lines target)

// === Imports ===
import { initScene, getScene } from './state/scene';
import { initHistory } from './state/history';
import { initSelection } from './state/selection';
import { initViewport } from './state/viewport';
import { render, requestRender } from './rendering';
import { wirePointer } from './interaction/pointer';
import { wireKeyboard } from './interaction/keyboard';
import { wireToolbar } from './ui/toolbar';
import { wirePanels } from './ui/panels';
import { wireProbe } from './probe';
import { initMapbox } from './mapbox';

// === Minimal State ===
// Only what's needed for orchestration between modules

// === DOM Ready ===
document.addEventListener('DOMContentLoaded', () => {
  // Initialize state modules
  initScene();
  initHistory();
  initSelection();
  initViewport();

  // Get DOM elements
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  // Wire up modules
  wirePointer(canvas, { onRender: requestRender });
  wireKeyboard();
  wireToolbar();
  wirePanels();
  wireProbe();
  initMapbox();

  // Initial render
  render();
});
```

**Key principles:**
- main.ts only orchestrates initialization
- All logic lives in imported modules
- No function definitions longer than ~20 lines
- State accessed through module APIs, not global variables
- Builder pattern for dependency injection (already using this pattern)

---

## Consistency Issues

### 2. Mixed Entity Abstractions
**Priority:** Medium
**Effort:** Medium
**Status:** Deferred

`Building` is a class with methods, but other entities are plain objects. This is acceptable for now as the drag system uses a unified handler pattern via `interactions/drag/handlers.ts`.

### 3. Scattered Global State
**Priority:** Medium → Low (improved)
**Effort:** Medium
**Status:** Partially addressed

State has been consolidated into `state/` modules:
- ✅ `state/scene.ts` - Scene data
- ✅ `state/selection.ts` - Selection state
- ✅ `state/history.ts` - Undo/redo
- ✅ `state/tools.ts` - Active tool, drawing modes
- ✅ `state/viewport.ts` - Pan, zoom, camera

**Remaining:** Some state still in main.ts needs to be migrated (drag state, measure state).

---

## Growing Files to Watch

| File | Lines | Status | Action |
|------|-------|--------|--------|
| `main.ts` | ~5,142 | 🟡 Improving | Continue extraction (target: 2,000) |
| `mapboxUI.ts` | ~1,100 | 🟡 Growing | Monitor, consider split if >1,500 |
| `ui/contextPanel/properties.ts` | ~415 | 🟢 Acceptable | Complete, well-structured |
| `interaction/pointer.ts` | ~680 | 🟢 Acceptable | Complete, well-structured |
| `index.html` | ~1,600 | 🟡 Large | Extract inline styles to CSS |

---

## Next Extraction Targets

### Immediate (Next Session)

| Target | Lines | Destination | Effort |
|--------|-------|-------------|--------|
| `renderSources` | ~250 | `ui/sources.ts` | Medium |
| Wire probe module calls | ~150 | Replace inline with module calls | Small |

### Short-term

| Target | Lines | Destination | Effort |
|--------|-------|-------------|--------|
| `wireMapSettings` | ~100 | `ui/settings.ts` | Small |
| `wireDisplaySettings` | ~80 | `ui/settings.ts` | Small |
| Remaining legend functions | ~80 | Wire to `results/` | Small |

### Medium-term

| Target | Lines | Destination | Effort |
|--------|-------|-------------|--------|
| Split `mapboxUI.ts` | ~1,100 | `mapbox/` directory | Large |
| Remaining drawing wrappers | ~200 | Inline into render loop | Medium |

---

## Commits This Session

| Hash | Message | Impact |
|------|---------|--------|
| `0d3099b` | Extract renderPropertiesFor to ui/contextPanel/properties module | -260 lines |
| `7f2a2bf` | Extract createPinnedContextPanel to ui/contextPanel/pinnedPanel module | -175 lines |
| `3f2f69e` | Fix trailing newline to pinnedPanel.ts | cleanup |
| pending | Wire scene I/O to io/ module (downloadScene, wireSaveLoad, remove buildScenePayload) | -26 lines |

---

## Architecture Pattern: Dependency Injection

The current extraction uses a consistent pattern for module extraction:

```typescript
// 1. Define interfaces for dependencies
export interface ModuleContext {
  // Data needed from global state
}

export interface ModuleCallbacks {
  // Functions to call back into main.ts
}

// 2. Create builder functions in main.ts
function buildModuleContext(): ModuleContext {
  return { /* capture from globals */ };
}

function buildModuleCallbacks(): ModuleCallbacks {
  return { /* wrap global functions */ };
}

// 3. Thin wrapper in main.ts
function doThing() {
  doThingModule(buildModuleContext(), buildModuleCallbacks());
}
```

This pattern:
- ✅ Enables testing modules in isolation
- ✅ Makes dependencies explicit
- ✅ Allows incremental extraction
- ✅ Preserves existing behavior

---

## Notes

- Avoid refactoring during active feature development
- Prioritize extractions that unblock new features
- Test thoroughly after each refactoring step
- **ALWAYS commit after each extraction** (learned from lost work)
- **Run build after each change** to catch TypeScript errors early
- Use `git` for commits (not `sl` in this project)
- The interaction/ and interactions/ directories are separate (pointer/keyboard vs hitTest/drag)
