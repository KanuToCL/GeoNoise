# GeoNoise Changelog

This document contains the implementation history of completed features. For planned features, see [ROADMAP.md](./ROADMAP.md).

---

## 2026-01-09

### Noise Map Live Recalculation

**Status:** ✅ Implemented (v0.4.6)

Changed the noise map behavior so it **recalculates in place** instead of disappearing when scene changes occur.

#### Before
When any of the following changed, the noise map would completely disappear:
- Source band Lw values
- Settings dropdown or boolean values
- Building/wall dimensions

Users had to manually regenerate the map after each change.

#### After
The noise map now **stays visible** and **recalculates in the background** when:
- Source band Lw values change
- Any settings value (dropdowns or bools) changes
- Elements like buildings or walls change dimensions

The map uses low-resolution (fast) updates during editing for responsive feedback.

#### Technical Details

- Added `recalculateNoiseMapIfVisible()` function that triggers a silent low-res recompute if map is visible
- Updated `pushHistory()` to recalculate by default instead of invalidating
- Updated `computeScene()` to recalculate by default instead of invalidating
- New options: `invalidateMap: true` forces clear, `recalculateMap: false` skips map ops
- Scene load and undo/redo still invalidate (clear) the map as before

---

## 2026-01-08

### Select Box Multi-Selection Tool

**Status:** ✅ Implemented (v0.4.5)

Added a rectangular select box tool for selecting multiple elements at once and performing batch operations.

#### Features

- **Ctrl/Cmd+click drag** on empty canvas to draw rectangular selection box
- **Multi-element selection** - Select sources, receivers, probes, panels, barriers, buildings
- **Batch operations** - Delete and duplicate from inspector panel buttons
- **Ctrl+A** to select all elements
- **Ctrl+D** to duplicate selection (new elements become selected)
- **Shift+click** to add/remove individual elements from selection
- **Escape** to deselect all
- **Inspector panel** shows count of selected items with action buttons
- **Pin option hidden** for multi-selection (can't pin multiple elements)
- **Selection halos** rendered on all selected elements

#### Known Issues

- **Multi-move not working** - Clicking to drag a multi-selection currently resets to single selection. Group move needs debugging. Workaround: duplicate selection, then move duplicated items.

#### Technical Details

- Extended `Selection` type with `{ type: 'multi'; items: SelectionItem[] }` variant
- Added `DragState` variants: `'select-box'` and `'move-multi'`
- Helper functions: `isElementSelected()`, `selectionToItems()`, `itemsToSelection()`, `getSelectedCount()`, `getElementsInSelectBox()`
- Batch operations: `duplicateMultiSelection()`, `selectAll()`, extended `deleteSelection()`

---

### Settings Popover Z-Index / Stacking Context Fix

**Status:** ✅ Fixed (Critical Bug)

**Issue:** The settings popover (gear button in bottom-right corner) was not appearing when clicked. The popup should spring animate in front of all other elements (sources, probes, inspector panels).

#### Root Cause Analysis

Three issues were identified:

1. **Stacking Context Trap**: The settings popover was inside `.settings-toggle` which was inside `.canvas-corner`. CSS `backdrop-filter` or other properties on parent elements can create isolated stacking contexts that trap z-index.

2. **CSS Selector Mismatch**: After moving the popover to `document.body`, the CSS relied on parent-based selectors (`.settings-toggle.is-open .settings-popover`) which no longer worked since the popover was no longer a child.

3. **Stale dist/style.css**: The dev server (`apps/web/scripts/dev.mjs`) prioritizes `dist/style.css` over `src/style.css`. Edits to `src/style.css` were not being served because an old `dist/style.css` existed.

#### Solution

1. **Move popover to document.body** (`apps/web/src/main.ts`):
   ```typescript
   // Move popover to body to escape all stacking contexts
   document.body.appendChild(settingsPopover);
   ```

2. **Direct class toggling** - Toggle `.is-open` directly on the popover element:
   ```typescript
   const open = () => {
     settingsPopover.classList.add('is-open');
     // ... update position
   };
   ```

3. **CSS selector update** (`apps/web/src/style.css`):
   ```css
   /* Changed from parent-based selector */
   /* OLD: .settings-toggle.is-open .settings-popover--corner */
   /* NEW: .settings-popover--corner.is-open */

   .settings-popover--corner.is-open {
     opacity: 1 !important;
     visibility: visible !important;
     transform: scaleY(1) !important;
     pointer-events: auto !important;
   }
   ```

4. **Copy to dist**: Sync `src/style.css` → `dist/style.css` since dev server prioritizes dist:
   ```bash
   cp apps/web/src/style.css apps/web/dist/style.css
   ```

#### Dev Server CSS Resolution Order

The dev server (`apps/web/scripts/dev.mjs`, lines 38-42) resolves CSS in this order:

```javascript
if (urlPath === '/style.css') {
  const cssDist = resolve(dist, 'style.css');
  if (existsSync(cssDist)) return cssDist;  // 1. Check dist/ first
  return resolve(root, 'src', 'style.css'); // 2. Fallback to src/
}
```

**Lesson learned:** When editing CSS, ensure changes are reflected in `dist/style.css` or delete the stale dist version.

#### Files Modified

| File | Changes |
|------|---------|
| `apps/web/src/main.ts` | Move popover to `document.body`, toggle `.is-open` directly on popover |
| `apps/web/src/style.css` | Change selector to `.settings-popover--corner.is-open`, add `!important` |
| `apps/web/dist/style.css` | Sync from src (manual copy or build step) |

---

## 2026-01-07

### Ground Reflection 2D Distance Fix

**Status:** ✅ Fixed (Bug)

**Issue:** The `agrTwoRayDb()` ground reflection function was receiving 3D distance instead of 2D horizontal distance.

**Root Cause:** The two-ray phasor model computes path lengths internally using:
```
r1 = sqrt(d² + (hs + hr)²)  // reflected path
r2 = sqrt(d² + (hs - hr)²)  // direct path
```
When 'd' is the 3D distance (which already includes height), the height differential gets double-counted, leading to incorrect ground reflection amplitudes.

**Fix Location:** `packages/engine/src/propagation/index.ts`

```typescript
// Extract horizontal distance from 3D distance
const heightDiff = sourceHeight - receiverHeight;
const distance2D = Math.sqrt(Math.max(0, distance * distance - heightDiff * heightDiff));
Agr = agrTwoRayDb(
  frequency,
  distance2D,  // Now correctly uses 2D horizontal distance
  sourceHeight,
  receiverHeight,
  ...
);
```

**Discovered:** During 3D physics audit of all ray-path calculations.

---

### Noise Map Resolution Strategy

**Status:** ✅ Completed

Implemented an adaptive resolution strategy for noise maps that balances visual quality with performance across different interaction states.

#### Resolution Constants (`apps/web/src/main.ts`)

```typescript
const RES_HIGH = 2;       // Fine quality: 2px per grid cell
const RES_LOW = 8;        // Coarse preview: 8px per grid cell
const REFINE_POINTS = 75000;  // Maximum detail for refine button and initial load
const STATIC_POINTS = 50000;  // Good quality for static after drag
const DRAG_POINTS = 35000;    // Coarse preview during drag
```

#### Adaptive Point Cap Strategy

| Scenario           | Point Cap | Pixel Step | Purpose               |
|--------------------|-----------|------------|-----------------------|
| Initial load       | 75,000    | RES_HIGH=2 | Good first impression |
| During drag        | 35,000    | RES_LOW=8  | Smooth interaction    |
| Static after drag  | 50,000    | RES_HIGH=2 | Good quality          |
| Refine button      | 75,000    | RES_HIGH=2 | Maximum detail        |

#### Key Functions Updated

- **`buildNoiseMapGridConfig()`**: Default cap uses `STATIC_POINTS` for resolution-based calls
- **`recalculateNoiseMap()`**: Now accepts optional `maxPoints` parameter
- **Drag handler**: Passes `DRAG_POINTS` during drag operations
- **Initial load**: Uses `REFINE_POINTS` for high-quality first impression
- **Refine button**: Uses `REFINE_POINTS` for maximum detail

---

### Barrier Side Diffraction Toggle

**Status:** ✅ Completed

Adds horizontal diffraction around barrier ends, complementing the existing over-top (vertical) diffraction. This feature improves acoustic accuracy for short barriers where sound can bend around the sides.

#### UI Location

Settings → Simulation Physics → **Barrier Side Diffraction** dropdown

#### Modes

| Mode | Behavior |
|------|----------|
| **Off** | ISO 9613-2 infinite barrier assumption (over-top only) |
| **Auto** | Enable for barriers < 50m (recommended default) |
| **On** | Enable for all barriers |

#### Physics Implementation

For barriers that block the direct path, three diffraction paths are computed:

1. **Over-top path**: Source → Barrier Top → Receiver (always computed)
2. **Left edge path**: Source → Left Edge (p1) → Receiver (if side enabled)
3. **Right edge path**: Source → Right Edge (p2) → Receiver (if side enabled)

The path with **minimum δ** (least path difference) is selected, representing the least obstructed path that sound can take.

**Formulas:**
```
δ_top   = A + B - d           (over-top path difference)
δ_side  = |S→Edge| + |Edge→R| - |S→R|  (side path difference)
N = 2δ/λ = 2δf/c              (Fresnel number)
A_bar = 10·log₁₀(3 + 20·N)    (Maekawa insertion loss)
```

#### Schema Changes (`packages/core/src/schema/index.ts`)

```typescript
/** Barrier side diffraction mode */
export const BarrierSideDiffractionSchema = z.enum(['off', 'auto', 'on']);

export const PropagationConfigSchema = z.object({
  // ... existing fields ...
  barrierSideDiffraction: BarrierSideDiffractionSchema.default('auto'),
});
```

#### Engine Changes (`packages/engine/src/compute/index.ts`)

```typescript
// New functions added:
function computeSidePathDelta(source, receiver, edgePoint, edgeHeight, direct3D)
function shouldUseSideDiffraction(barrierLength, mode, threshold = 50)

// BarrierSegment type extended with length field
type BarrierSegment = {
  p1: Point2D;
  p2: Point2D;
  height: number;
  length: number;  // NEW: for side diffraction auto-mode
};

// computeBarrierPathDiff() now accepts sideDiffractionMode parameter
function computeBarrierPathDiff(source, receiver, geometry, sideDiffractionMode)
```

#### Probe Worker Changes (`apps/web/src/probeWorker.ts`)

```typescript
// New interface and functions:
interface BarrierDiffractionResult {
  topPath: RayPath | null;
  leftPath: RayPath | null;
  rightPath: RayPath | null;
}

function computeBarrierLength(barrier: WallSegment): number
function shouldUseSideDiffraction(barrier, mode, threshold)
function computeSidePathDifference(source, receiver, edgePoint, edgeHeight)
function traceBarrierDiffractionPaths(source, receiver, barrier, config)
```

#### UI Changes (`apps/web/index.html`)

```html
<label class="property-row property-row-stack">
  <span>Barrier Side Diffraction</span>
  <select class="ui-inset" id="propagationBarrierSideDiffraction">
    <option value="off">Off (Over-top only)</option>
    <option value="auto" selected>Auto (< 50m barriers)</option>
    <option value="on">On (All barriers)</option>
  </select>
</label>
```

#### Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/schema/index.ts` | Added `BarrierSideDiffractionSchema`, new field in `PropagationConfigSchema` |
| `packages/engine/src/api/index.ts` | Added `ProbeConfig` interface with `barrierSideDiffraction` |
| `packages/engine/src/compute/index.ts` | Added side diffraction logic, `length` field to `BarrierSegment` |
| `apps/web/index.html` | Added dropdown in Settings → Simulation Physics |
| `apps/web/src/main.ts` | Added DOM binding and event listener |
| `apps/web/src/probeWorker.ts` | Added side diffraction path tracing |
| `run-web.command` | Added build integrity check to prevent stale build issues |

#### Details Modal Documentation

Updated the "barrier diffraction" section in the Details modal with:
- Separate sections for Over-Top and Side diffraction
- ASCII diagrams for both vertical and horizontal diffraction
- Table explaining the three toggle modes
- Physics formulas and path selection logic

---

### Per-Band Noise Map Display

**Status:** ✅ Completed

Allow users to view noise maps for individual octave frequency bands (63 Hz - 16 kHz) instead of only the overall weighted level.

#### Design Approach

**On-Demand Recomputation (No Caching)**

Since noise maps are dynamically recalculated with every scene change, there's no benefit to caching per-band results. The implementation:
1. Accepts the target band selection from the UI
2. Passes it through to the compute engine
3. Returns either single-band level or weighted overall level based on selection

#### Schema Changes (`packages/core/src/schema/index.ts`)

```typescript
/** Frequency weighting type for grid display */
export const FrequencyWeightingSchema = z.enum(['A', 'C', 'Z']);

/** Extended GridConfigSchema with per-band options */
export const GridConfigSchema = z.object({
  // ... existing fields ...
  targetBand: z.number().int().min(0).max(8).optional(), // Band index 0-8 (63Hz-16kHz)
  weighting: FrequencyWeightingSchema.default('A'),       // Used when targetBand is undefined
});
```

#### Engine Changes (`packages/engine/src/compute/index.ts`)

```typescript
// Per-band noise map display options
const targetBand = gridConfig.targetBand;
const weighting = gridConfig.weighting ?? 'A';

if (targetBand !== undefined) {
  return totalSpectrum[targetBand]; // Unweighted single-band level
} else {
  return calculateOverallLevel(totalSpectrum, weighting); // Weighted overall
}
```

#### UI Behavior

| User Action | System Response |
|-------------|-----------------|
| Generate Map (first time) | Compute LAeq (A-weighted) |
| Select "500 Hz" | Recompute grid for band index 3 (unweighted) |
| Select "LAeq" | Recompute grid with A-weighting |
| Move a source | Recompute with current band selection |
| Change weighting to C | Recompute grid with C-weighting (if overall selected) |

#### Band Index Mapping

| Index | Frequency |
|-------|-----------|
| 0 | 63 Hz |
| 1 | 125 Hz |
| 2 | 250 Hz |
| 3 | 500 Hz |
| 4 | 1000 Hz |
| 5 | 2000 Hz |
| 6 | 4000 Hz |
| 7 | 8000 Hz |
| 8 | 16000 Hz |

#### Files Modified

- `packages/core/src/schema/index.ts` - Added `FrequencyWeightingSchema`, `targetBand`, `weighting` to `GridConfigSchema`
- `packages/engine/src/compute/index.ts` - Modified `computeGrid()` to use targetBand and weighting
- `apps/web/src/main.ts` - Updated `buildNoiseMapGridConfig()` and `wireDisplaySettings()`
- `apps/web/index.html` - Added Display Band dropdown in Layers popover

---

### Layers Popover UI Fixes

**Status:** ✅ Completed

Fixed z-index issue where popover appeared behind the inspector panel, and added slide-down animation.

#### Root Cause Analysis

The `.topbar` element uses `backdrop-filter: blur(18px)` which creates a new **stacking context** in CSS. This traps all child elements within that stacking context, preventing z-index from working across different parts of the DOM tree.

#### Solution

1. **HTML Structure Change**: Moved `.layers-popover` outside of `.topbar` to escape the stacking context

2. **CSS Animation**: Added slide-down animation using CSS transitions:
   ```css
   .layers-popover {
     position: fixed;
     top: 72px;
     right: 24px;
     z-index: 9999;
     opacity: 0;
     transform: translateY(-8px);
     visibility: hidden;
     transition: opacity 0.18s ease-out, transform 0.18s ease-out;
   }

   .layers-popover.is-open {
     opacity: 1;
     transform: translateY(0);
     visibility: visible;
   }
   ```

3. **JavaScript Update**: Toggle `is-open` class on the popover element

---

### Unified Active State Blue Color

**Status:** ✅ Completed

Standardized active state color (#2D8CFF) across all UI elements for consistency.

---

### Discrete LED Indicators

**Status:** ✅ Completed

Added tiny 4px LED dot indicators on dock buttons to show active state.

---

### Remove Debug Logging for Production

**Status:** ✅ Completed

Cleaned up `console.log` statements from `probeWorker.ts` and `main.ts` for production build.

---

### Building Occlusion (Polygon-Based)

**Status:** ✅ Completed

Implemented accurate polygon-based building occlusion with 3D height consideration.

#### Features Implemented

1. **Geometry Functions**
   - `pointInPolygon()` - Ray casting algorithm for polygon intersection
   - `segmentIntersectsPolygon()` - Check if a line segment crosses a polygon with entry/exit points
   - `pathHeightAtPoint()` - Calculate path height at any 2D point (for 3D height check)
   - `extractBuildingFootprints()` - Extract building data from wall segments
   - `findBlockingBuilding()` - Find which building blocks a 3D path (with height awareness)

2. **Building Diffraction (Per-Band Frequency Dependence)**
   - `findVisibleCorners()` - Find building corners visible from a point (for horizontal diffraction)
   - `traceBuildingDiffractionPaths()` - Compute all valid diffraction paths (roof + corners)
   - `doubleEdgeDiffraction()` - Uses coefficient **40** for roof paths, capped at 25 dB
   - `singleEdgeDiffraction()` - Uses coefficient **20** for corner paths, capped at 20 dB

3. **Coherent Phasor Summation**
   - All diffraction paths (roof + corners) are summed coherently with phase
   - Phase: `φ = -k × total_distance + phase_shift`
   - Captures frequency-dependent interference patterns

#### Physics Model

| Path Type | Diffraction Coefficient | Max Attenuation | Frequency Effect |
|-----------|------------------------|-----------------|------------------|
| Over-roof (double-edge) | 40 | 25 dB | Strong |
| Around-corner (single-edge) | 20 | 20 dB | Moderate |

---

### Bug Fix: Wall Reflections Bypassing Building Occlusion

**Status:** ✅ Completed

#### Problem

After implementing building occlusion, the probe showed ~61 dB while the receiver showed ~44 dB(Z) - a ~17 dB discrepancy.

**Root Cause:** Wall reflections from building walls were NOT being checked for building occlusion. When the direct path was blocked by a building, the wall reflections from that same building's walls were still being added to the phasor sum.

#### Fix

Updated `traceWallReflectionPaths()` to:
1. Check OTHER buildings for both legs of the reflection path
2. Check SAME building to verify neither leg passes through the building's interior

```typescript
// Check building blocking for BOTH legs of the reflection path
const otherBuildings = buildings.filter(b => b.id !== segment.id);
const leg1Block = findBlockingBuilding(source, reflPoint3D, otherBuildings);
const leg2Block = findBlockingBuilding(reflPoint3D, receiver, otherBuildings);

// Also check if the path goes through the SAME building
const sameBuilding = buildings.find(b => b.id === segment.id);
if (sameBuilding) {
  const srcToRefl = findBlockingBuilding(source, reflPoint3D, [sameBuilding]);
  const reflToRecv = findBlockingBuilding(reflPoint3D, receiver, [sameBuilding]);
  blockedBySameBuilding = srcToRefl.blocked || reflToRecv.blocked;
}
```

---

## 2026-01-06

### Probe Coherent Ray-Tracing

**Status:** ✅ Completed

Major enhancement to probe system for acoustically accurate analysis with interference modeling.

#### Features Implemented

| Feature | Location |
|---------|----------|
| Phasor arithmetic library | `packages/shared/src/phasor/index.ts` |
| Complex number operations | `complexAdd`, `complexMul`, `complexExpj`, etc. |
| Coherent phasor summation | `sumPhasorsCoherent()`, `sumSpectralPhasorsCoherent()` |
| Ray-tracing module | `packages/engine/src/raytracing/index.ts` |
| Image source method | First-order reflections via `createImageSources()` |
| Direct path tracing | With barrier blocking detection |
| Ground reflection | Proper two-ray model with separate phasors |
| Wall reflections | Image source method for buildings |
| Barrier diffraction | Maekawa model (`maekawaDiffraction()`) |
| Atmospheric absorption | Simplified ISO 9613-1 |
| Frequency weighting display | A/C/Z weighting in probe chart |
| Ghost source count | `interferenceDetails.ghostCount` populated |
| Unit tests | 26 tests in `phasor/index.spec.ts` |

---

### Bug Fix: Atmospheric Absorption Formula

**Status:** ✅ Completed

**Root Cause:** The `atmosphericAbsorptionCoeff()` function had a broken ISO 9613-1 formula producing astronomically wrong values (~3.7 million dB/m instead of ~0.0001 dB/m at 63 Hz).

**Fix:** Replaced with correct frequency-dependent lookup table with temperature/humidity corrections.

---

### Bug Fix: Ground Reflection Double-Counting

**Status:** ✅ Completed

**Root Cause:** The original code was using `twoRayGroundEffect()` which calculates the **combined** interference pattern of direct + ground paths, but then adding this as a **second phasor** alongside the direct path phasor. This caused ~3 dB too high (double-counting direct path).

**Fix:** Implemented proper two-ray model with **separate phasors**:

```typescript
// BEFORE (WRONG): Used combined two-ray formula as second phasor
const groundEffect = twoRayGroundEffect(...);  // Already includes direct!
phasors.push({ pressure, phase });  // Double-counts direct!

// AFTER (CORRECT): Ground reflection as separate ray
// 1. Direct path phasor (direct distance, no reflection)
phasors.push({ pressure: directPressure, phase: -k * r_direct });

// 2. Ground-reflected path phasor (longer distance, with reflection coeff)
const groundCoeff = getGroundReflectionCoeff(groundType, frequency);
const groundLevel = sourceLevel - spreadingLoss(r_reflected) - reflectionLoss;
phasors.push({
  pressure: dBToPressure(groundLevel),
  phase: -k * r_reflected + groundCoeff.phase
});
```

**New ground reflection model:**
- Frequency-dependent reflection coefficients (hard: ~0.95, soft: ~0.6-0.7)
- Proper phase shifts (hard: 0°, soft: ~160°-170°)
- Path geometry via image source method
- Coherent summation with other paths

---

## 2026-01-05

### Stale Build Cache Fix

**Status:** ✅ Completed

Application appeared completely non-functional. Root cause was stale `dist/` folder missing compiled JS files.

**Fix:** Added `npm run rebuild` command.

---

## January 2026 (Earlier)

### Spectral Source Schema Migration

**Status:** ✅ Completed

Migrated from single-value `soundPowerLevel` sources to full 9-band spectral sources.

#### Schema Changes

Sources now require two additional properties:

```typescript
interface Source {
  // ...existing properties...
  spectrum: Spectrum9;          // 9-band spectrum [63Hz - 16kHz] in dB Lw
  gain: number;                 // Gain offset applied on top of spectrum
}
```

#### UI Components Added

1. **Spectrum Editor (`createSpectrumEditor`)**
   - Full 9-band spectrum editor for source properties panel
   - Vertical sliders for each octave band
   - Overall level display
   - Real-time updates on change

2. **Spectrum Bar (`createSpectrumBar`)**
   - Compact spectrum visualization for source list
   - Mini bar chart showing relative levels
   - Tooltip with exact dB values

3. **Weighting & Band Controls**
   - `#displayWeighting` - Frequency weighting selector (A/C/Z)
   - `#displayBand` - Octave band selector

#### Files Updated

| File | Changes |
|------|---------|
| `apps/web/src/main.ts` | Source type includes `spectrum: Spectrum9` and `gain: number`, `buildEngineScene` passes actual source spectrum |
| `apps/web/src/probeWorker.ts` | Uses actual source spectrum instead of stub calculation |
| `apps/web/src/export.ts` | `ReceiverResult` includes `Leq_spectrum`, `LCeq`, `LZeq` |
| `apps/web/src/style.css` | New styles for spectrum display |
| `apps/web/index.html` | New controls in layers popover |

#### ProbeSource Interface

```typescript
export interface ProbeSource {
  id: string;
  position: { x: number; y: number; z: number };
  spectrum: Spectrum9;  // Required
  gain?: number;        // Optional, defaults to 0
}
```

#### Common Pitfalls

1. **Stale Compiled Files**: If tests fail with missing function errors, clean stale `.js` files from `src/` directories
2. **HTMLElement vs HTMLDivElement**: Use `HTMLElement` for `<aside>` elements
3. **CSV Export Columns**: Ensure all row types have matching column counts when adding new statistics

---

## v0.4.0 (Recently Completed)

### Barrier Rotation and Resize

**Status:** ✅ Completed

- Endpoint handles for resizing barriers
- Rotation lollipop for rotating barriers
- Properties panel with Length/Rotation controls

### Auto-Regenerate Noise Map

**Status:** ✅ Completed

Noise map automatically regenerates after geometry modifications (barriers, buildings).

### Inline Name Editing

**Status:** ✅ Completed

- Double-click to rename elements
- Custom display names on map tooltips

---

## Debug Sessions Archive

### Jan 6, 2026: Early Return Issue

Added `requestLiveProbeUpdates()` call before early return in `computeSceneIncremental()` to ensure probe updates happen during drag operations.

### Jan 5, 2026: Stale Build Cache

Application appeared non-functional. Root cause was stale `dist/` folder. Added `npm run rebuild` command.

---

*See also: [ARCHITECTURE.md](./ARCHITECTURE.md) for system overview, [ROADMAP.md](./ROADMAP.md) for planned features.*
