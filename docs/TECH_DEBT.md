# Technical Debt & Quality Roadmap

> **Goal:** Reach world-class code quality (9+/10). This document is the single source of truth for architectural issues, quality gaps, and the concrete path to fix them.

**Last Updated:** 2026-02-09
**Quality Score:** 7.0/10
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
| Maintainability | 6.5 | 9.0 | main.ts monolith, naming overlap |
| Code Quality (frontend) | 5.5 | 9.0 | Global state, god file, 70+ `let` vars |
| CI/CD & Tooling | 5.0 | 9.0 | No CI, no enforced linting |
| CSS Architecture | 4.0 | 8.0 | Single 5,268-line file, no scoping |
| **Overall** | **7.0** | **9.0** | |

---

## Tier 1 — Critical (Blocking 8.0)

These issues must be resolved to reach 8.0/10. They represent the largest quality gaps.

### 1.1 Monolithic `main.ts` (~5,200 lines)

**Priority:** Critical
**Effort:** Large (ongoing — 35% reduction already achieved)
**Location:** `apps/web/src/main.ts`

The main entry point contains ~175 functions and ~70 global mutable `let` variables. It acts as state container, UI wirer, render coordinator, and event dispatcher simultaneously.

**Current state:** Down from 7,911 → 5,200 lines. 17+ modules extracted.

**Problems:**
- 70+ global mutable variables (race condition risk, impossible to test)
- ~150 `document.querySelector()` calls centralized at the top
- Functions with 5+ side effects modifying shared globals
- `computeNoiseMapInternal()` at 110 lines — god function
- Tight coupling: imports from 20+ modules

**Target:** `main.ts` ≤ 600 lines — orchestration only.

**Remaining extractions (priority order):**

| Function/Section | ~Lines | Target Module | Effort |
|------------------|--------|---------------|--------|
| Global state vars (70+ `let` declarations) | ~150 | Consolidate into `state/` modules | Medium |
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

### 1.2 No CI/CD Pipeline

**Priority:** Critical
**Effort:** Small
**Location:** Missing `.github/workflows/`

No automated quality gates exist. All quality enforcement depends on developer discipline.

**Required:**
- [ ] GitHub Actions workflow: `npm run build && npm test && npm run typecheck`
- [ ] Run on every push to `main` and on every PR
- [ ] Fail the build on lint errors, type errors, or test failures
- [ ] Badge in README showing CI status

**Suggested `.github/workflows/ci.yml`:**

```yaml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run build
      - run: npm test
```

### 1.3 No Enforced Linting

**Priority:** Critical
**Effort:** Small
**Location:** Missing config files

ESLint and Prettier are in `devDependencies` but **no configuration files exist**. No `.eslintrc`, `eslint.config.*`, or `.prettierrc` anywhere in the repo.

**Required:**
- [ ] Create root `eslint.config.mjs` (flat config, ESLint 9 compatible)
- [ ] Create root `.prettierrc` with project conventions
- [ ] Add `.prettierignore` (dist, node_modules, coverage)
- [ ] Add `lint` scripts to each package's `package.json`
- [ ] Add pre-commit hook via `husky` + `lint-staged`
- [ ] Verify `npm run lint` passes cleanly before merging

**Recommended ESLint rules beyond defaults:**
- `@typescript-eslint/no-explicit-any` — enforce the existing zero-any practice
- `@typescript-eslint/consistent-type-imports` — type-only imports
- `no-console` (warn) — catch debug logs
- `@typescript-eslint/no-floating-promises` — prevent unhandled async

### 1.4 Monolithic `style.css` (~5,268 lines)

**Priority:** Critical
**Effort:** Large

A single CSS file with no scoping, no naming convention, and no modular structure. Changing one component risks unintended side effects across the entire UI.

**Problems:**
- No CSS naming convention (BEM, utility classes, etc.)
- No CSS custom properties file separated from component styles
- No component-level scoping (no CSS Modules, no Shadow DOM, no namespacing)
- Impossible to know which styles are unused

**Plan:**
- [ ] Extract CSS custom properties to `styles/theme.css` (may already be partially done)
- [ ] Split into component files: `styles/toolbar.css`, `styles/panels.css`, `styles/modals.css`, etc.
- [ ] Adopt a consistent naming convention (BEM recommended: `.panel__header--collapsed`)
- [ ] Use CSS `@import` or a build step to combine them
- [ ] Consider CSS Modules if a build step is added later

**Target:** No single CSS file > 500 lines. Theme variables in one file, components in their own files.

---

## Tier 2 — High (Blocking 8.5)

### 2.1 Global Mutable State in `main.ts`

**Priority:** High
**Effort:** Medium
**Location:** `apps/web/src/main.ts` lines ~527-600

70+ `let` variables floating in module scope. This is the root cause of the testability and maintainability problems.

**Specific problems:**
```typescript
// These are all module-scope mutable globals:
let noiseMap: NoiseMap | null = null;
let isComputing = false;
let computeToken = 0;
let activeComputeToken = 0;
let queuedMapResolutionPx: number | null = null;
let dragContribution: DragContribution | null = null;
// ... 60+ more
```

**Plan:**
- [ ] Group related globals into state objects with getter/setter APIs
- [ ] Migrate compute state → `state/compute.ts` (isComputing, tokens, pending)
- [ ] Migrate noise map state → `state/noiseMap.ts` (noiseMap, range, style)
- [ ] Migrate draft state → `state/drafts.ts` (barrier/building drafts, polygon draft)
- [ ] Migrate UI state → `state/ui.ts` (aboutOpen, canvasTheme)
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

### 2.3 Confusing Directory Naming: `interaction/` vs `interactions/`

**Priority:** High
**Effort:** Small
**Location:** `apps/web/src/interaction/` and `apps/web/src/interactions/`

Two directories with nearly identical names serve different purposes:
- `interaction/` — pointer.ts, keyboard.ts (raw event handlers)
- `interactions/` — hitTest.ts, drag/, tools/ (interaction logic)

**Plan:**
- [ ] Merge into a single `interaction/` directory
- [ ] Subdirectories: `interaction/events/`, `interaction/hitTest/`, `interaction/drag/`, `interaction/tools/`
- [ ] Or rename: `input/` (raw events) vs `interaction/` (logic)
- [ ] Add barrel `index.ts` to `interaction/` (currently missing)

---

## Tier 3 — Medium (Blocking 9.0)

### 3.1 No Pre-Commit Hooks

**Priority:** Medium
**Effort:** Small

No automated enforcement at commit time. Developers can commit code that fails typecheck or lint.

**Required:**
- [ ] Install `husky` and `lint-staged`
- [ ] Pre-commit: run `lint-staged` (format + lint changed files)
- [ ] Pre-push: run `npm run typecheck && npm test`

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

### 3.4 `eval()` Workaround for Dynamic Import

**Priority:** Medium
**Effort:** Small
**Location:** `packages/engine-backends/src/index.ts` line 43

```typescript
const mod = await eval("import('@geonoise/engine-webgpu')") as WebGPUModule | null;
```

This bypasses Vite's static analysis to prevent bundling WebGPU when unused. Functionally correct but:
- Triggers security linter warnings
- Obscures intent for new contributors
- May break in future bundler versions

**Plan:**
- [ ] Replace with Vite-native `import.meta.glob` or conditional `import()` with `/* @vite-ignore */` comment
- [ ] Add explanatory comment if `eval` must stay

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
| `main.ts` | ~5,200 | 🔴 Critical | Target ≤ 600 |
| `style.css` | ~5,268 | 🔴 Critical | Target: split to ≤ 500 each |
| `mapboxUI.ts` | 25 | ✅ Resolved | Split into `mapbox/` (8 modules) |
| `interaction/pointer.ts` | ~680 | 🟢 OK | Well-structured |
| `ui/contextPanel/properties.ts` | ~415 | 🟢 OK | Well-structured |
| `index.html` | ~1,600 | 🟡 Monitor | Extract inline styles |

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
- `state/` ✅ — scene, selection, history, tools, viewport
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
- [ ] Create ESLint + Prettier configuration and pass cleanly
- [ ] Add GitHub Actions CI (build + typecheck + lint + test)
- [ ] Reduce `main.ts` to ≤ 2,000 lines
- [ ] Split `style.css` into component files
- [ ] Eliminate 50% of global `let` variables
- [ ] Merge `interaction/` and `interactions/` directories

### → 8.5
- [ ] Reduce `main.ts` to ≤ 1,000 lines
- [ ] Add pre-commit hooks (husky + lint-staged)
- [ ] Add integration tests for computation pipeline
- [ ] Add unit tests for all `state/` modules
- [ ] Fix engine numerical precision issues
- [ ] Standardize export patterns across packages

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
