# Spectral Source Schema Migration

## Overview

As of January 2026, the GeoNoise engine migrated from single-value `soundPowerLevel` sources to full 9-band spectral sources. This document captures the required changes for future reference.

## Schema Changes

### Source Schema (Required Properties)

Sources now **require** two additional properties:

```typescript
interface Source {
  // ...existing properties...
  soundPowerLevel: number;      // Legacy single dB value (still used for UI/display)
  spectrum: Spectrum9;          // NEW: 9-band spectrum [63Hz - 16kHz] in dB Lw
  gain: number;                 // NEW: Gain offset applied on top of spectrum
}
```

### Spectrum9 Type

```typescript
// 9-element tuple for octave bands: 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz
type Spectrum9 = [number, number, number, number, number, number, number, number, number];
```

## Converting Legacy Sources

Use `createFlatSpectrum` from `@geonoise/shared` to convert a single dB level to a flat spectrum:

```typescript
import { createFlatSpectrum, type Spectrum9 } from '@geonoise/shared';

// Convert legacy soundPowerLevel to spectrum
const spectrum = createFlatSpectrum(source.soundPowerLevel) as Spectrum9;
const gain = 0; // Default gain
```

## Files Requiring Updates

### Web App (`apps/web/src/main.ts`)

1. **Import `createFlatSpectrum`:**
   ```typescript
   import { createFlatSpectrum, type Spectrum9 } from '@geonoise/shared';
   ```

2. **Update `buildEngineScene` source mapping:**
   ```typescript
   sources: scene.sources.filter(isSourceEnabled).map((source) => ({
     id: source.id,
     position: { x: source.x, y: source.y, z: source.z },
     spectrum: createFlatSpectrum(source.power) as Spectrum9,
     gain: 0,
   })),
   ```

3. **Update `buildProbeRequest` source mapping:**
   ```typescript
   const sources = scene.sources
     .filter((source) => isSourceEnabled(source))
     .map((source) => ({
       id: source.id,
       position: { x: source.x, y: source.y, z: source.z },
       spectrum: createFlatSpectrum(source.power) as Spectrum9,
     }));
   ```

### Engine Tests

All test files that create source fixtures need updating:

- `packages/engine/tests/golden.spec.ts`
- `packages/engine/tests/propagation.spec.ts`
- `packages/engine/tests/panel.spec.ts`

**Pattern for test sources:**
```typescript
import { createFlatSpectrum, type Spectrum9 } from '@geonoise/shared';

scene.sources.push({
  id: 's1',
  type: 'point',
  position: { x: 0, y: 0, z: 1 },
  soundPowerLevel: 100,
  spectrum: createFlatSpectrum(100) as Spectrum9,
  gain: 0,
  enabled: true,
} as any);
```

## ProbeSource Interface

The `ProbeSource` interface in `packages/engine/src/api/index.ts` also requires spectrum:

```typescript
export interface ProbeSource {
  id: string;
  position: { x: number; y: number; z: number };
  spectrum: Spectrum9;  // Required
  gain?: number;        // Optional, defaults to 0
}
```

## Common Pitfalls

### 1. Stale Compiled Files

If tests fail with `createPinkNoise is not a function` or similar errors about missing functions, there may be stale `.js` files in `src/` directories. Clean them:

```bash
cd packages/engine
find src -name "*.js" -delete
find src -name "*.d.ts" -delete
find src -name "*.js.map" -delete
find src -name "*.d.ts.map" -delete
```

The TypeScript compiler outputs to `dist/`, not `src/`. Stale files in `src/` can interfere with module resolution.

### 2. HTMLElement vs HTMLDivElement

When creating floating panels with `<aside>` elements, use `HTMLElement` instead of `HTMLDivElement` in type definitions:

```typescript
type PinnedProbePanel = {
  panel: HTMLElement;  // Not HTMLDivElement
  // ...
};
```

### 3. CSV Export Columns

If adding new statistics (like `LAeq_p50`), ensure all row types have matching column counts:
- Update header array
- Add empty strings to receiver rows
- Add empty strings to panel_sample rows
- Add the actual value to panel_stats rows

## Test Snapshot Updates

After migrating to spectral sources, panel test snapshots will change because:
1. Results now include `Leq_spectrum` arrays
2. LAeq values may differ slightly due to proper spectral summation

Run tests with `--update` flag to update snapshots:
```bash
npm -w @geonoise/engine run test -- --update
```
