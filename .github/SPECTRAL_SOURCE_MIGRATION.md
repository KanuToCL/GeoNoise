# Spectral Source Schema Migration

## Overview

As of January 2026, the GeoNoise engine migrated from single-value `soundPowerLevel` sources to full 9-band spectral sources. This document captures the required changes for future reference.

## Status: ✅ COMPLETED

The migration is now complete. All components have been updated to support spectral sources with full UI editing and display capabilities.

### Summary of Changes

| Component | Status | Description |
|-----------|--------|-------------|
| Source Schema | ✅ | Added `spectrum` and `gain` fields |
| Spectrum Editor UI | ✅ | Interactive 9-band spectrum editing |
| Weighting Controls | ✅ | A/C/Z weighting selector in UI |
| Band Selector | ✅ | View individual octave bands |
| Receiver Spectrum | ✅ | Full spectrum in receiver results |
| Probe Worker | ✅ | Uses actual source spectrum |
| Display Integration | ✅ | Weighted levels in badges and results |

## Schema Changes

### Source Schema (Required Properties)

Sources now **require** two additional properties:

```typescript
interface Source {
  // ...existing properties...
  power: number;                // Overall power level (computed from spectrum)
  spectrum: Spectrum9;          // 9-band spectrum [63Hz - 16kHz] in dB Lw
  gain: number;                 // Gain offset applied on top of spectrum
}
```

### Spectrum9 Type

```typescript
// 9-element tuple for octave bands: 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz
type Spectrum9 = [number, number, number, number, number, number, number, number, number];

// Band labels for UI display
const OCTAVE_BAND_LABELS = ['63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
```

## UI Components Added

### Spectrum Editor (`createSpectrumEditor`)

Full 9-band spectrum editor for source properties panel:

```typescript
function createSpectrumEditor(
  spectrum: Spectrum9,
  onChange: (newSpectrum: Spectrum9) => void
): HTMLElement
```

Features:
- Vertical sliders for each octave band
- Overall level display
- Band labels (63Hz - 16kHz)
- Real-time updates on change

### Spectrum Bar (`createSpectrumBar`)

Compact spectrum visualization for source list:

```typescript
function createSpectrumBar(
  spectrum: Spectrum9,
  weighting: FrequencyWeighting
): HTMLElement
```

Features:
- Mini bar chart showing relative levels
- Tooltip with exact dB values
- Responsive to selected weighting

### Weighting & Band Controls

Located in the layers popover:

```html
<select id="displayWeighting">
  <option value="A">A-Weighting (dBA)</option>
  <option value="C">C-Weighting (dBC)</option>
  <option value="Z">Z-Weighting (dBZ)</option>
</select>

<select id="displayBand">
  <option value="overall">Overall</option>
  <option value="0">63 Hz</option>
  <!-- ... bands 1-8 -->
</select>
```

## Files Updated

### Web App (`apps/web/src/main.ts`)

1. **Source type** now includes `spectrum: Spectrum9` and `gain: number`

2. **`buildEngineScene`** passes actual source spectrum to engine:
   ```typescript
   sources: scene.sources.filter(isSourceEnabled).map((source) => ({
     id: source.id,
     position: { x: source.x, y: source.y, z: source.z },
     spectrum: source.spectrum,
     gain: source.gain,
   })),
   ```

3. **`buildProbeRequest`** passes spectrum to probe worker:
   ```typescript
   sources.map((source) => ({
     id: source.id,
     position: { x: source.x, y: source.y, z: source.z },
     spectrum: source.spectrum,
     gain: source.gain,
   }));
   ```

4. **`renderResults`** shows spectrum bars and weighted levels

5. **`drawReceiverBadges`** displays weighted level based on selection

### Probe Worker (`apps/web/src/probeWorker.ts`)

Updated to use actual source spectrum instead of stub calculation:
- Accumulates per-band energy from each source
- Applies spreading loss per band
- Returns full 9-band spectrum

### Export Types (`apps/web/src/export.ts`)

`ReceiverResult` now includes:
- `Leq_spectrum?: Spectrum9` - Full 9-band spectrum
- `LCeq?: number` - C-weighted overall
- `LZeq?: number` - Z-weighted overall

### CSS Styles (`apps/web/src/style.css`)

New styles added:
- `.result-row--spectrum` - Receiver row with spectrum display
- `.result-row-header` - Header layout for receiver results
- `.result-spectrum-mini` - Container for mini spectrum bars
- `.spectrum-bar-mini` - Individual spectrum bar styling
- `.spectrum-bar-mini.is-selected` - Highlighted band styling

### HTML (`apps/web/index.html`)

New controls in layers popover:
- `#displayWeighting` - Frequency weighting selector
- `#displayBand` - Octave band selector

## Engine Tests

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

The `ProbeSource` interface in `packages/engine/src/api/index.ts` requires spectrum:

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

## Future Enhancements

### Grid Spectrum Support

The noise map grid (`GridResult`) currently only stores LAeq values. Future enhancement to store per-band values would enable:
- Viewing noise maps at specific frequencies
- Applying different weightings to the map visualization

### Auralization / HRTF

With full spectral data available at probes/receivers, future work could add:
- Binaural rendering using HRTFs
- Real-time audio preview of noise at receiver locations

## Related Files

- [packages/shared/src/constants/index.ts](../packages/shared/src/constants/index.ts) - `OCTAVE_BANDS`, weighting arrays
- [packages/shared/src/utils/index.ts](../packages/shared/src/utils/index.ts) - `createFlatSpectrum`, `applyWeightingToSpectrum`
- [packages/engine/src/api/index.ts](../packages/engine/src/api/index.ts) - `Spectrum9`, `ReceiverResult`, `ProbeSource`
- [packages/engine/src/compute/index.ts](../packages/engine/src/compute/index.ts) - Spectral propagation calculations
