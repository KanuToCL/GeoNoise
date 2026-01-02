# GeoNoise Copilot Instructions

## Project Overview

GeoNoise is an interactive sound propagation sandbox for acoustic site planning. It computes noise levels across sources, receivers, barriers, and buildings using a physics-based model implementing ISO 9613-style calculations.

## Architecture

### Monorepo Structure (Turborepo + npm workspaces)

```
apps/web          → Canvas-based UI, single 5k-line main.ts orchestrates everything
packages/core     → Schemas (Zod), units, coordinate transforms, scene migration
packages/shared   → Constants, branded types, math utilities
packages/engine   → Reference CPU propagation model (the physics)
packages/engine-backends → Backend router (CPU-worker vs WebGPU), engineCompute() entrypoint
packages/engine-webgpu  → WebGPU backend stub (not yet implemented)
packages/geo      → Geometry kernel, spatial grid generation
```

### Data Flow

1. UI creates scene objects matching `@geonoise/core` schemas
2. UI calls `engineCompute(request, preference)` from `@geonoise/engine-backends`
3. `BackendRouter` selects backend based on preference (`'auto' | 'cpu' | 'gpu'`) and workload size
4. Backend delegates to `CPUEngine` which applies propagation physics
5. Response contains `ReceiverResult[]`, `PanelResult`, or `GridResult` with timings/warnings

### Key Types and Interfaces

- **Scene**: Validated via `SceneSchema` in [packages/core/src/schema/index.ts](packages/core/src/schema/index.ts)
- **ComputeRequest/Response**: Union types for `'receivers' | 'panel' | 'grid'` in [packages/engine/src/api/index.ts](packages/engine/src/api/index.ts)
- **PropagationResult**: Per-path attenuation breakdown in [packages/engine/src/propagation/index.ts](packages/engine/src/propagation/index.ts)

## Developer Commands

```bash
npm install           # Install all workspaces
npm run dev           # Start all dev servers (web at localhost:5173)
npm run build         # Build all packages (turbo)
npm run test          # Run all tests (vitest via turbo)
npm run typecheck     # TypeScript check all packages
npm -w @geonoise/engine run test:watch  # Watch tests for specific package
```

## Coding Conventions

### TypeScript Patterns

- **ESM-only**: All imports use `.js` extension even for TypeScript files
- **Branded types**: IDs use branded primitives (`ReceiverId`, `PanelId`, `SceneHash`) in `@geonoise/shared/types`
- **Zod schemas**: Runtime validation for scene data; derive types with `z.infer<>`
- **Constants centralized**: Physical constants in [packages/shared/src/constants/index.ts](packages/shared/src/constants/index.ts)

### Package Dependencies

- Packages import via `@geonoise/<pkg>` aliases (configured in tsconfig.base.json paths)
- Dependency graph: `shared → core → geo/engine → engine-backends → web`
- Never import from `dist/`; use source paths for development

### Testing Patterns

- Framework: **Vitest**
- Test files: `*.spec.ts` in `tests/` or `test/` directories
- Golden tests in [packages/engine/tests/golden.spec.ts](packages/engine/tests/golden.spec.ts) verify end-to-end SPL calculations
- Snapshot expectations: `toBeCloseTo()` with tolerance for floating-point physics

## Physics Model Specifics

The propagation model applies per source-receiver path (see [packages/engine/src/propagation/index.ts](packages/engine/src/propagation/index.ts)):

1. **Spreading loss**: `20*log10(r)+11` (spherical) or `10*log10(r)+8` (cylindrical)
2. **Atmospheric absorption**: ISO 9613 or simplified, alpha(f,T,RH) × distance
3. **Ground effect**: ISO 9613-2 Eq.10 or two-ray phasor model
4. **Barrier attenuation**: Maekawa single-screen with path difference delta

Blocked vs unblocked paths: `A_total = A_div + A_atm + max(A_bar, A_gr)` when blocked

## Important Implementation Details

- **Request cancellation**: `engineCompute` supports `requestId` for stale-request rejection
- **Barrier geometry**: 2D UI barriers → 3D physics via intersection point + height (see [packages/engine/src/compute/index.ts](packages/engine/src/compute/index.ts) lines 18-70)
- **Grid sampling**: [packages/geo/src/geom/index.ts](packages/geo/src/geom/index.ts) generates sample points for panels and noise maps
- **Scene migration**: Version upgrades handled in [packages/core/src/migration/index.ts](packages/core/src/migration/index.ts)

## Common Tasks

### Adding a new propagation feature

1. Add constants to `@geonoise/shared/constants`
2. Implement calculation in `@geonoise/engine/propagation`
3. Wire through `calculatePropagation()` and update `PropagationConfig` schema in core
4. Add golden test case in `packages/engine/tests/`

### Adding a new compute request type

1. Define request/response interfaces in `packages/engine/src/api/index.ts`
2. Add compute method to `Engine` interface
3. Implement in `CPUEngine` (`packages/engine/src/compute/index.ts`)
4. Expose through `CPUWorkerBackend` and `engineCompute()`

## Long-Term Vision

- **Multi-frequency band lazy loop**: Defer per-band calculations until needed, enabling efficient banded output without computing all octave bands upfront
- **HRTF for probes with direction**: Head-related transfer functions for directional probes, supporting auralization and binaural rendering
- **WebGPU backend**: Full GPU-accelerated compute for large grids (stub exists in `@geonoise/engine-webgpu`)
