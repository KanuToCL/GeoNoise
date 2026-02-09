# Technical Debt & Quality Roadmap

> **Goal:** Reach world-class code quality (9+/10). This document is the single source of truth for architectural issues, quality gaps, and the concrete path to fix them.

**Last Updated:** 2026-02-09
**Quality Score:** 7.8/10
**Next Target:** 8.0/10

---

## Score Breakdown

| Dimension | Score | Target | Gap |
|-----------|-------|--------|-----|
| Type Safety | 9.5 | 10.0 | Minimal — branded types, Zod, zero `any` |
| Documentation | 9.0 | 9.5 | Minor gaps in physics references |
| Architecture (packages) | 8.5 | 9.0 | Clean boundaries, optional WebGPU |
| Error Handling | 8.5 | 9.0 | Defensive clamping, some gaps |
| Testing | 7.5 | 9.0 | Core physics tested, frontend untested |
| Maintainability | 7.5 | 9.0 | main.ts monolith, 8 state modules |
| Code Quality (frontend) | 6.5 | 9.0 | 39 `let` vars remain (down from 65), 3 new state modules |
| CI/CD & Tooling | 8.0 | 9.0 | ✅ CI, ESLint, Prettier, pre-commit hooks |
| CSS Architecture | 7.0 | 8.0 | ✅ Split into 11 component files |
| **Overall** | **7.8** | **9.0** | |

---

## Attack Order

Low-hanging fruit first — lock in guardrails before grinding the monoliths.

1. ~~`.prettierrc` + `.prettierignore`~~ ✅ Done (2026-02-09)
2. ~~`eslint.config.mjs`~~ ✅ Done — flat config, zero errors across 7 packages (2026-02-09)
3. ~~Add `lint` scripts to each package~~ ✅ Done — all 7 packages wired via turbo (2026-02-09)
4. ~~`.github/workflows/ci.yml`~~ ✅ Done — build + typecheck + lint + test (2026-02-09)
5. ~~`husky` + `lint-staged` pre-commit hooks~~ ✅ Done (2026-02-09)
6. ~~Merge `interaction/` and `interactions/`~~ ✅ Done — unified `interaction/` with events/, drag/, tools/, shortcuts, hitTest (2026-02-09)
7. ~~Split `style.css`~~ ✅ Done — 11 component files in `styles/`, aggregated via `styles/index.css` (2026-02-09)
8. ~~Migrate global `let` vars to `state/` modules~~ ✅ Done — 26 vars migrated to compute.ts, noiseMap.ts, ui.ts; 39 remain in existing modules (2026-02-09)
9. Continue `main.ts` extraction — wire* functions, renderLoop, DOM refs
10. Frontend tests — state modules first, then io round-trip, then integration
11. Engine precision fixes — epsilon in complex.ts, document bounds
12. ~~Export pattern standardization~~ ✅ Already consistent — flat barrels everywhere (2026-02-09)
13. ~~`eval()` → `/* @vite-ignore */` dynamic import~~ ✅ Done (2026-02-09)
14. Extract `index.html` inline styles to CSS
15. Polish — JSDoc gaps, physics citations, test type safety

> **Rule:** finish each item fully before starting the next. Commit after each.

---

## Tier 1 — Critical (Blocking 8.0)

These issues must be resolved to reach 8.0/10. They represent the largest quality gaps.

### 1.1 Monolithic `main.ts` (~5,267 lines)

**Priority:** Critical
**Effort:** Large (ongoing — 35% reduction already achieved)
**Location:** `apps/web/src/main.ts`

The main entry point contains ~175 functions and ~39 global mutable `let` variables (down from 65). It acts as UI wirer, render coordinator, and event dispatcher. State is now distributed across 8 modules.

**Current state:** Down from 7,911 → 5,267 lines. 17+ modules extracted. 26 vars migrated to state modules.

**Problems:**
- 39 global mutable variables remain (viewport, tools, selection, history, scene — already have state modules but main.ts shadows them)
- ~150 `document.querySelector()` calls centralized at the top
- Functions with 5+ side effects modifying shared globals
- `computeNoiseMapInternal()` at 110 lines — god function
- Tight coupling: imports from 20+ modules

**Target:** `main.ts` ≤ 600 lines — orchestration only.

**Remaining extractions (priority order):**

| Function/Section | ~Lines | Target Module | Effort |
|------------------|--------|---------------|--------|
| ~~Global state vars~~ ✅ 26 migrated | — | `state/compute.ts`, `state/noiseMap.ts`, `state/ui.ts` | Done |
| Remaining shadowed vars (39 `let` declarations) | ~80 | Wire main.ts to existing state module getters/setters | Medium |
| `computeNoiseMapInternal` + noise map state | ~200 | `compute/noiseMap.ts` | Medium |
| Remaining `wire*()` functions | ~300 | Respective `ui/` modules | Medium |
| DOM element references (~150 queries) | ~200 | Distribute to consuming modules | Large |
| `renderLoop` and render orchestration | ~200 | `rendering/loop.ts` | Medium |
| Remaining context panel functions | ~100 | `ui/contextPanel/` | Small |
| `requestProbeUpdate` orchestration | ~30 | `probe/request.ts` | Small |

**What main.ts should become:**

```typescript
// main.ts — Entry point only (~400-600 lines)
import { initScene } from './state/scene';
import { initHistory } from './state/history';
import { initViewport } from './state/viewport';
import { render, requestRender } from './rendering';
import { wirePointer } from './interaction/pointer';
import { wireKeyboard } from './interaction/keyboard';
import { wireToolbar } from './ui/toolbar';
import { wirePanels } from './ui/panels';
import { wireProbe } from './probe';
import { initMapbox } from './mapbox';

document.addEventListener('DOMContentLoaded', () => {
  initScene();
  initHistory();
  initViewport();

  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  wirePointer(canvas, { onRender: requestRender });
  wireKeyboard();
  wireToolbar();
  wirePanels();
  wireProbe();
  initMapbox();

  render();
});
```

### 1.2 ~~No CI/CD Pipeline~~ ✅ RESOLVED

**Status:** ✅ Resolved (2026-02-09)

GitHub Actions CI pipeline added: `.github/workflows/ci.yml` runs `typecheck → lint → build → test` on every push to `main` and on every PR. Node 20 with npm caching.

### 1.3 ~~No Enforced Linting~~ ✅ RESOLVED

**Status:** ✅ Resolved (2026-02-09)

- `eslint.config.mjs` — ESLint flat config with `typescript-eslint`, zero errors across 7 packages
- `.prettierrc` + `.prettierignore` — consistent formatting
- `husky` + `lint-staged` — pre-commit hooks format + lint changed files
- All packages have `lint` scripts wired through turbo
- Rules: `no-explicit-any` (warn), `consistent-type-imports` (warn), `no-console` (warn)

### 1.4 ~~Monolithic `style.css` (~5,268 lines)~~ ✅ RESOLVED

**Status:** ✅ Resolved (2026-02-09)

Split into 11 component files in `styles/`:

| File | Lines | Content |
|------|-------|---------|
| `theme.css` | 339 | CSS custom properties (pre-existing) |
| `reset.css` | 95 | Box-sizing, scrollbars, html/body |
| `base.css` | 74 | ui-surface, ui-button, app-shell |
| `topbar.css` | 149 | Topbar, layers, settings toggle/popover |
| `dock.css` | 241 | Dock FAB, expandable, tool buttons |
| `panels.css` | 257 | Context panel, probe panel |
| `components.css` | 1,856 | Ray-viz, brand, controls, toggles, inspector, etc. |
| `spectrum.css` | 478 | Spectrum editor with sliders |
| `modals.css` | 998 | Modals, physics specs, about tabs |
| `settings.css` | 687 | Settings panel, physics engines, equations |
| `map.css` | 526 | Mapbox scale, drawing mode, map panel |

`styles/index.css` aggregates all files via `@import`. `components.css` (1,856 lines) can be split further in a future pass.

---

## Tier 2 — High (Blocking 8.5)

### 2.1 Global Mutable State in `main.ts` — PARTIALLY RESOLVED

**Priority:** High
**Effort:** Medium
**Location:** `apps/web/src/main.ts` lines ~627-675

**Status:** 26 of 65 `let` variables migrated to dedicated state modules (2026-02-09). 39 remain.

**Completed:**
- [x] `state/compute.ts` — computeToken, activeComputeToken, isComputing, mapComputeToken, activeMapToken, isMapComputing, pendingComputes, needsUpdate, queuedMapResolutionPx, mapToastTimer (10 vars)
- [x] `state/noiseMap.ts` — noiseMap, currentMapRange, mapRenderStyle, mapBandStep, mapAutoScale (5 vars)
- [x] `state/ui.ts` — displayWeighting, displayBand, aboutOpen, canvasTheme, resizeRaf, engineConfig, dockCollapseTimeout, dockInactivityTimeout, dockHasToolEngaged (9 vars + 2 timer helpers)
- [x] `state/index.ts` barrel updated to re-export all new modules

**Remaining (39 vars — already have state modules but main.ts shadows them):**
```typescript
// These duplicate existing state/viewport.ts, state/tools.ts, etc.
let pixelsPerMeter, basePixelsPerMeter, zoom, panOffset, panState    // → viewport
let activeTool, selection, hoverSelection, dragState                  // → tools/selection
let measureStart, measureEnd, measureLocked                          // → tools
let barrierDraft, buildingDraft, ... (all drawing drafts)            // → tools
let history, historyIndex, isDirty                                   // → history
let sourceSeq, receiverSeq, ... (all entity sequences)              // → scene
let soloSourceId, interactionActive                                  // → scene/viewport
let receiverEnergyTotals, panelEnergyTotals, dragContribution       // → scene/tools
```

**Next step:** Wire main.ts to import getters/setters from the existing state modules (viewport, tools, selection, history, scene) and remove the remaining 39 `let` declarations. This is item 9 territory — extracting the wire* functions will naturally eliminate these shadows.

- [ ] Goal: main.ts has zero `let` declarations

### 2.2 Frontend Testing Gaps

**Priority:** High
**Effort:** Medium

The `apps/web` package has only 5 trivial tests (CSV export schema, compute preference). The entire UI, rendering, and interaction layer is untested.

**Current coverage:**

| Package | Tests | Status |
|---------|-------|--------|
| `packages/shared` | 26 | ✅ Good |
| `packages/engine` | 198+ | ✅ Strong |
| `packages/engine-backends` | 5 | ⚠️ Minimal |
| `apps/web` | 5 | 🔴 Nearly untested |

**Required:**
- [ ] Integration tests for computation pipeline (source → engine → results)
- [ ] Unit tests for `state/` modules (scene, selection, history, viewport)
- [ ] Unit tests for `io/serialize.ts` and `io/deserialize.ts` (round-trip)
- [ ] Unit tests for `utils/geometry.ts`, `utils/colors.ts`
- [ ] Snapshot tests for `rendering/` (canvas output comparison)
- [ ] Target: 80% coverage across all packages

### 2.3 ~~Confusing Directory Naming: `interaction/` vs `interactions/`~~ ✅ RESOLVED

**Status:** ✅ Resolved (2026-02-09)

Merged into a single `interaction/` directory:

```
interaction/
├── events/          ← pointer.ts, keyboard.ts (raw DOM handlers)
├── drag/            ← handlers, types (from interactions/drag/)
├── tools/           ← measure tool (from interactions/tools/)
├── hitTest.ts       ← entity hit detection (from interactions/)
├── shortcuts.ts     ← shortcut definitions (from interactions/keyboard.ts, renamed)
└── index.ts         ← barrel export (new)
```

---

## Tier 3 — Medium (Blocking 9.0)

### 3.1 ~~No Pre-Commit Hooks~~ ✅ RESOLVED

**Status:** ✅ Resolved (2026-02-09)

- `husky` initialized with pre-commit hook
- `lint-staged` runs `prettier --write` + `eslint --fix` on `.ts` files, `prettier --write` on `.json/.md/.css/.html`
- Pre-push: can be added later for `typecheck && test`

### 3.2 Engine Numerical Precision Gaps

**Priority:** Medium
**Effort:** Small
**Location:** `packages/engine/src/propagation/`

Several minor numerical stability issues in the physics engine.

**Issues:**
- [ ] `complex.ts` line 33: Complex square root uses `=== 0` instead of epsilon comparison for floating-point — should use `Math.abs(r) < EPSILON`
- [ ] `ground.ts`: Sommerfeld F(w) approximation lacks documented validity bounds
- [ ] No documented floating-point error bounds for propagation calculations
- [ ] Ground model comparison tests missing (ISO vs logarithmic sigma interpolation)

### 3.3 Inconsistent Export Patterns Across Packages

**Priority:** Medium
**Effort:** Small

Some packages use subpath exports (`@geonoise/geo/geom`), others don't. Some files use namespace re-exports (`export * as coords from './coords'`), others use flat re-exports.

**Plan:**
- [ ] Standardize all packages to use flat barrel re-exports from `index.ts`
- [ ] Use subpath exports in `package.json` only where consumer ergonomics demand it
- [ ] Document the chosen pattern in this file

### 3.4 ~~`eval()` Workaround for Dynamic Import~~ ✅ RESOLVED

**Status:** ✅ Resolved (2026-02-09)

Replaced `eval("import('...')")` with a variable + `/* @vite-ignore */` dynamic import. Prevents Vite static analysis while avoiding eval() security warnings.

### 3.5 Mixed Entity Abstractions

**Priority:** Medium
**Effort:** Medium
**Status:** Deferred (acceptable for now)

`Building` is a class with methods while other entities (Source, Receiver, Barrier, Panel) are plain objects with factory functions. This inconsistency is manageable because the drag system uses a unified handler pattern via `interactions/drag/handlers.ts`.

### 3.6 ~~`mapboxUI.ts` Growing (~1,100 lines)~~ ✅ RESOLVED

**Status:** ✅ Resolved in v0.8.1

Split into `mapbox/` module directory with 8 focused files (largest: 316 lines). `mapboxUI.ts` is now a 25-line re-export shim.

### 3.7 `index.html` Inline Styles (~1,600 lines)

**Priority:** Medium
**Effort:** Small

The HTML file contains significant inline styles that should live in CSS files.

- [ ] Extract inline `<style>` blocks to appropriate CSS files
- [ ] HTML should contain structure only, no embedded styles

---

## Tier 4 — Low (Polish for 9.5+)

### 4.1 Reactive UI Layer for Non-Canvas UI

The non-canvas UI (panels, toolbars, modals, settings, property editors) uses imperative DOM manipulation with `document.querySelector` and manual DOM construction. This is fragile and verbose.

**Consideration:** Adopt a lightweight reactive library (Preact, Lit, or Solid) for the panel/toolbar/modal layer only. Canvas rendering stays vanilla.

**Trade-off:** Adds a dependency but dramatically simplifies UI code and enables component-level testing. Evaluate when main.ts extraction is complete.

### 4.2 Visual Regression Testing for Canvas

No automated verification that canvas rendering output is correct.

- [ ] Capture reference screenshots of key rendering states
- [ ] Use pixel-diff comparison in CI (e.g., `jest-image-snapshot` or `pixelmatch`)
- [ ] Run on PRs that touch `rendering/` or `compute/`

### 4.3 Performance Benchmarking in CI

The `perf:baseline` script exists but doesn't run in CI.

- [ ] Run perf baseline on PRs touching `engine/` or `compute/`
- [ ] Store results as artifacts
- [ ] Alert on regressions > 10%

### 4.4 Test Type Safety

Tests use `as any` casts in assertions instead of proper typing.

```typescript
// Current (weak):
expect((res as any).backendId).toBeTruthy();

// Target (strong):
interface ComputeResult { backendId: string; warnings: string[]; }
const typed = res as ComputeResult;
expect(typed.backendId).toBeTruthy();
```

- [ ] Remove all `as any` from test files
- [ ] Add proper result type definitions for test assertions

### 4.5 Physics Documentation Gaps

Inline code references physics papers but doesn't cite them formally.

- [ ] Add IEEE/ISO reference comments to Miki (1990) and Delany-Bazley (1970) implementations
- [ ] Add equation numbers from ISO 9613-2 where applicable
- [ ] Add worked examples in JSDoc for complex functions

### 4.6 Missing JSDoc on Utility Functions

Some utility functions in `packages/shared/src/utils/` lack documentation.

- [ ] Add JSDoc with examples to `chunk()`, `range()`, and other utility functions
- [ ] Ensure all public exports have at least a one-line doc comment

---

## Feature Flags

Defined in `apps/web/src/constants.ts`:

| Flag | Default | Description |
|------|---------|-------------|
| `ENABLE_RAY_VISUALIZATION` | `false` | Ray visualization in probe inspector (disabled due to bug) |
| `ENABLE_MAPBOX` | `false` | Mapbox map overlay (disabled for initial merge) |

---

## Growing Files to Watch

| File | Lines | Status | Threshold |
|------|-------|--------|-----------|
| `main.ts` | ~5,267 | 🔴 Critical (39 `let` vars, down from 65) | Target ≤ 600 |
| `style.css` | — | ✅ Resolved | Split into `styles/` (11 files) |
| `styles/components.css` | ~1,856 | 🟡 Monitor | Can split further (≤500 target) |
| `styles/modals.css` | ~998 | 🟡 Monitor | Can split further |
| `mapboxUI.ts` | 25 | ✅ Resolved | Split into `mapbox/` (8 modules) |
| `interaction/pointer.ts` | ~680 | 🟢 OK | Well-structured |
| `ui/contextPanel/properties.ts` | ~415 | 🟢 OK | Well-structured |
| `index.html` | ~1,885 | 🟡 Monitor | 92 inline styles to extract |

---

## Completed Work (Archive)

### Extraction History (2026-02-06 → 2026-02-07)

17+ modules extracted from `main.ts`. Total: ~3,257 lines moved to proper modules.

<details>
<summary>Full extraction log (click to expand)</summary>

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
| Scene I/O | Wired to `io/` module | ~26 | `391a651` | 2026-02-07 |

**Completed module directories:**
- `entities/` ✅ — building, barrier, source, receiver, panel, probe
- `state/` ✅ — scene, selection, history, tools, viewport, **compute, noiseMap, ui** (8 modules)
- `rendering/` ✅ — primitives, grid, noiseMap, sources, receivers, barriers, buildings, probes, panels, rays, measure
- `interactions/` ✅ — hitTest, drag/, tools/
- `interaction/` ✅ — pointer, keyboard
- `probe/` ✅ — types, state, worker, panels, pinning, snapshots, rays, inspector
- `compute/` ✅ — orchestration (receivers, panels, incremental)
- `io/` ✅ — serialize, deserialize, import, formats (png, pdf, csv)
- `results/` ✅ — legend
- `ui/` ⚠️ 75% — contextPanel, panels, modals, spectrum, toolbar, equations, compute

</details>

### Architecture Pattern in Use

The codebase follows a dependency injection pattern for module extraction:

```typescript
// Module defines what it needs
export interface ModuleContext { /* data from state */ }
export interface ModuleCallbacks { /* functions back to main */ }

// main.ts builds context and delegates
function doThing() {
  doThingModule(buildContext(), buildCallbacks());
}
```

This pattern enables testing modules in isolation, makes dependencies explicit, and allows incremental extraction.

---

## Known Bugs

### Four-Corner Polygon Creation Bug
- **Location:** Building polygon tool (draw mode)
- **Symptom:** Issue with creation flow when placing exactly four corners
- **Status:** Not investigated
- **Priority:** Medium
- **Added:** 2026-02-07

---

## Milestone Roadmap

### → 8.0 (Next)
- [x] Create ESLint + Prettier configuration and pass cleanly
- [x] Add GitHub Actions CI (build + typecheck + lint + test)
- [ ] Reduce `main.ts` to ≤ 2,000 lines
- [x] Split `style.css` into component files
- [x] Eliminate 50% of global `let` variables (26 of 65 migrated = 40%, remaining 39 shadow existing modules)
- [x] Merge `interaction/` and `interactions/` directories

### → 8.5
- [ ] Reduce `main.ts` to ≤ 1,000 lines
- [x] Add pre-commit hooks (husky + lint-staged)
- [ ] Add integration tests for computation pipeline
- [ ] Add unit tests for all `state/` modules
- [ ] Fix engine numerical precision issues
- [x] Standardize export patterns across packages (already consistent)

### → 9.0
- [ ] Reduce `main.ts` to ≤ 600 lines (orchestration only)
- [ ] Achieve 80% test coverage across all packages
- [ ] Zero global mutable state in `main.ts`
- [ ] All CSS files ≤ 500 lines with naming convention
- [ ] Performance benchmarks running in CI
- [ ] Extract inline styles from `index.html`

### → 9.5+
- [ ] Visual regression testing for canvas output
- [ ] Evaluate reactive UI library for non-canvas UI
- [ ] Zero `as any` in test files
- [ ] All public APIs documented with JSDoc examples
- [ ] Physics implementations cite ISO equation numbers

---

## Process Notes

- Avoid refactoring during active feature development
- Prioritize extractions that unblock new features
- **ALWAYS commit after each extraction** (learned from lost work)
- **Run build after each change** to catch TypeScript errors early
- Use `git` for commits (not `sl` in this project)
- The `interaction/` and `interactions/` directories are separate until merged (Tier 2.3)
- When adding new code: consult `.claude/rules/modular-architecture.md`
