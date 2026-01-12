# GeoNoise Roadmap

This document contains planned features and enhancements for GeoNoise. For completed implementations, see [CHANGELOG.md](./CHANGELOG.md).

---

## Table of Contents

1. [Status Summary](#status-summary)
2. [Calculation Profile Presets](#calculation-profile-presets)
3. [Physics Audit - Bug Fixes](#physics-audit---bug-fixes)
4. [High Priority - In Progress](#high-priority---in-progress)
5. [Planned This Cycle](#planned-this-cycle)
6. [Future Enhancements](#future-enhancements)
7. [Barrier Side Diffraction Toggle](#barrier-side-diffraction-toggle)
8. [Configurable Diffraction Models](#configurable-diffraction-models)
9. [Wall Reflections for Diffracted Paths](#wall-reflections-for-diffracted-paths)
10. [Phase 1 Remaining Tasks](#phase-1-remaining-tasks)

---

## Status Summary

### 🚨 Critical Bugs

#### Ray Visualization Only Shows One First-Order Wall Reflection

**Status:** 🔴 Open
**Discovered:** 2026-01-12
**File:** `apps/web/src/probeWorker.ts`

**Problem:** The probe ray visualization only displays a single first-order wall reflection when there should be multiple reflections from all nearby building walls. The physics computation appears correct (multiple wall paths ARE being traced), but only one is being passed to the visualization.

**Symptoms:**
- Toggle "Show Traced Rays" in probe inspector
- Only ONE "Wall Reflection" path appears in the list and on the map
- Multiple buildings are in range that should produce valid reflections

**Suspected Cause:**
- The `collectedPaths` array may not be collecting all valid wall paths
- Possible filtering or early-exit in the wall path collection loop
- May be related to the `blockedBySameBuilding` check being too aggressive
- Most wall reflections may be geometrically invalid (image source method geometry constraints)
- Many paths may be correctly filtered by blocking checks (paths through buildings)

**Code Verification (2026-01-12):**
✅ **Coherent summation is CONFIRMED CORRECT** - Code review verified that:
1. `traceWallReflectionPaths()` iterates ALL building segments (line 1392)
2. ALL valid paths are pushed to `wallPaths` array (lines 1664-1672)
3. ALL wall paths are added to phasors for coherent summation (lines 1824-1833)
4. Phasor summation uses correct complex addition: `Σ p_i * e^(j*φ_i)` (lines 1848-1860)

The physics computation appears correct. The issue is isolated to the visualization/filtering layer, not the acoustic calculation itself.

**Impact:** Visualization doesn't accurately represent all computed paths, making it difficult to debug and understand multi-path propagation. **Physics results are unaffected.**

**Mitigation:** Feature flag `ENABLE_RAY_VISUALIZATION` set to `false` to hide from production until fixed.

---

### ✅ Recently Completed

- **Settings Panel UI Redesign** (v0.5.0) - Tabbed category selection with animated slide-out panels
- **Physics Audit Fixes #5, #6, #12** (v0.4.8) - Side diffraction geometry, Delany-Bazley bounds, dual sigma models
- **Barrier side diffraction toggle** (v0.4.2) - See [CHANGELOG.md](./CHANGELOG.md)
- **Noise map resolution strategy** (v0.4.2) - Adaptive point caps for better UX

### 🔨 In Progress / High Priority

- Visual indicator when probe is "calculating"
- **Physics audit fixes** (7 remaining - see below)

### 📅 Planned (This Cycle)

- Building diffraction models UI exposure
- Expose `maxReflections` setting in UI (currently hardcoded to 0)

## ~~Settings Panel UI Redesign~~ ✅ COMPLETED

> **Status:** ✅ Completed in v0.5.0
> **Implemented:** 2026-01-10

See [CHANGELOG.md](./CHANGELOG.md#settings-panel-ui-redesign) for full implementation details.

### Overview

Redesign the settings popover to reduce visual clutter while maintaining quick access to all controls. The current flat list of settings sections becomes overwhelming as more options are added.

### Design Concept

The gear button continues to trigger a popup from below. Instead of showing all settings in a scrollable list, the popup shows **three raised category tiles**:

```
┌─────────────────────────────────────────────────┐
│  ⚙ Settings                                     │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Display  │  │ Environ  │  │ Physics  │      │
│  │    🎨    │  │    🌡️    │  │    📐    │      │
│  └──────────┘  └──────────┘  └──────────┘      │
│   (raised)      (raised)       (raised)        │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Interaction Flow

1. **Gear Button Click**: Popover appears with three category tiles (neumorphic raised style)
2. **Category Click**:
   - Selected tile becomes **sunken** (pressed state)
   - A slide panel animates in from the right showing that category's controls
   - Other tiles remain raised but dimmed
3. **Back/Close**:
   - Click outside closes everything
   - Click the sunken tile again returns to category selection
   - ESC key closes

### Category Contents

#### Display (🎨)
- Frequency Weighting (A/C/Z)
- Display Band selector
- Contour Mode toggle
- Band Step (dB)
- Auto-scale colors toggle

#### Environmental/Atmospheric (🌡️)
- Temperature (°C)
- Relative Humidity (%)
- Atmospheric Pressure (kPa)
- Derived Speed of Sound (display)
- Atmospheric Model dropdown (ISO 9613-1 / Simple / None)

#### Physics (📐)
- Ground Reflection toggle
- Ground Type dropdown
- Mixed Ground Model dropdown
- Ground Algorithm dropdown
- Spreading Loss dropdown
- Barrier Side Diffraction dropdown
- (Future: maxReflections, diffraction model)

### Animation Details

```
Category Selection              →  Slide Panel
┌─────────────────┐             ┌─────────────────────────────────┐
│  [D] [E] [P]    │  ─────────→ │  [D] [E] [P] │  Display Panel  │
│  raised tiles   │   slide-in  │  (D sunken)  │  ├─ Freq Weight │
│                 │             │              │  ├─ Band Select │
└─────────────────┘             └──────────────┴──────────────────┘
```

- **Slide animation**: Panel slides in from right (300ms ease-out)
- **Tile transition**: Raised → sunken (150ms with haptic feel)
- **Backdrop dim**: Other tiles fade to 60% opacity
- **Close animation**: Reverse slide-out

### Visual Design (Neumorphic)

**Raised Tile (Inactive):**
```css
.settings-category-tile {
  background: linear-gradient(145deg, var(--surface-hi), var(--surface-lo));
  box-shadow:
    6px 6px 12px var(--shadow-dark),
    -6px -6px 12px var(--shadow-light);
  border-radius: 16px;
  cursor: pointer;
  transition: all 150ms ease;
}
```

**Sunken Tile (Active):**
```css
.settings-category-tile.is-active {
  box-shadow:
    inset 4px 4px 8px var(--shadow-dark),
    inset -4px -4px 8px var(--shadow-light);
  background: var(--surface);
}
```

**Slide Panel:**
```css
.settings-slide-panel {
  position: absolute;
  right: 0;
  top: 0;
  height: 100%;
  transform: translateX(100%);
  opacity: 0;
  transition: transform 300ms ease-out, opacity 200ms ease;
}

.settings-slide-panel.is-open {
  transform: translateX(0);
  opacity: 1;
}
```

### State Management

```typescript
type SettingsPanelState = {
  isOpen: boolean;
  activeCategory: 'display' | 'environmental' | 'physics' | null;
};
```

### Responsive Behavior

- **Desktop (>768px)**: Full 3-column category grid, side panel slides right
- **Mobile (<768px)**: Full-width categories stacked, panel slides up as bottom sheet

### Implementation Plan

| Phase | Task | Effort |
|-------|------|--------|
| 1 | Restructure HTML with category tiles container | Low |
| 2 | Add CSS for raised/sunken tile states | Low |
| 3 | Create slide panel container structure | Medium |
| 4 | Implement JavaScript state management | Medium |
| 5 | Add slide animations and transitions | Medium |
| 6 | Test and refine interaction feel | Low |
| 7 | Mobile responsive adjustments | Low |

### Files to Modify

| File | Changes |
|------|---------|
| `apps/web/index.html` | Restructure settings popover HTML |
| `apps/web/src/style.css` | Add category tile and slide panel styles |
| `apps/web/src/main.ts` | Add settings panel state and event handlers |

---

- **[Select Box Multi-Selection Tool](./FEATURE_SELECT_BOX.md)** - Rectangular marquee selection of multiple elements for batch operations (delete, duplicate). Ctrl+click drag to draw select box, shift+click for additive selection.

---

## Calculation Profile Presets

> **Status:** 📋 Planned
> **Priority:** High
> **Target:** v0.6.0

### Overview

GeoNoise currently offers many physics settings that users must configure individually. A **profile-based system** offers validated presets while preserving full customization.

The two primary profiles target different versions of ISO 9613-2:
- **ISO 9613-2:1996** - Original standard (current implementation)
- **ISO 9613-2:2024** - Updated standard with K_geo, barrier cancellation, etc.

---

## ISO 9613-2:1996 Profile ✅

> **Status:** ✅ Fully Implemented
> **All features are currently working in the Grid Engine**

### Profile Settings

| Setting | Value | Status |
|---------|-------|--------|
| Ground Model | `iso9613-tables` (Tables 3-4 per-band) | ✅ Implemented |
| Ground Effect Formula | A_gr = A_s + A_r + A_m | ✅ Implemented |
| Ground Effect Clamp | Total A_gr ≥ -3 dB | ✅ Implemented |
| Barrier Diffraction | Maekawa formula | ✅ Implemented |
| Thin Barrier | Coefficient 20, cap 20 dB | ✅ Implemented |
| Thick Barrier | Coefficient 40, cap 25 dB | ✅ Implemented |
| Barrier + Ground (blocked) | Partitioned A_gr additive with D_z | ✅ Implemented |
| Atmospheric Absorption | ISO 9613-1 | ✅ Implemented |
| Atmospheric Path | Uses actual diffracted path length | ✅ Implemented |
| Source Summation | Incoherent (power sum) | ✅ Implemented |
| Side Diffraction | Off (infinite barrier assumption) | ✅ Configurable |

### Remaining Work for 1996 Profile

| Task | Priority | Description |
|------|----------|-------------|
| Create profile dropdown in UI | HIGH | Settings → Profile selector |
| Define profile type in schema | HIGH | `CalculationProfile` enum |
| Auto-detect when settings match profile | MEDIUM | Show "Custom" when user deviates |
| Profile persistence in scene JSON | LOW | Save/restore selected profile |

---

## ISO 9613-2:2024 Profile 🔶

> **Status:** 🔶 Partially Implemented (3 features pending)

### Profile Settings

| Setting | Value | Status |
|---------|-------|--------|
| Ground Model | `iso9613-tables` + K_geo | 🔶 K_geo TODO |
| Ground Effect Formula | A_gr = A_s + A_r + A_m | ✅ Implemented |
| Ground Effect Clamp | Total A_gr ≥ -3 dB | ✅ Implemented |
| **Barrier Cancellation** | A_gr > 0 → set to 0 when blocked | ❌ TODO |
| Barrier Diffraction | Updated D_z formula | 🔶 D_z+K_met TODO |
| Thin Barrier | Coefficient 20, cap 20 dB | ✅ Implemented |
| Thick Barrier | Coefficient 40, cap 25 dB | ✅ Implemented |
| Barrier + Ground (blocked) | A_gr cancelled when positive | ❌ TODO |
| Atmospheric Absorption | ISO 9613-1 | ✅ Implemented |
| Source Summation | Incoherent (power sum) | ✅ Implemented |

### Implementation Roadmap for 2024 Profile

#### Phase 1: Barrier Cancellation Rule (HIGH Priority)

**The most significant change from 1996 to 2024.**

```typescript
// File: packages/engine/src/propagation/index.ts

// CURRENT (ISO 9613-2:1996):
if (barrierBlocked && barrierInfo) {
  Agr = Agr_source + Agr_receiver;  // Partitioned ground effect
  totalAttenuation = Adiv + Aatm + Abar + Agr;  // Additive
}

// NEW (ISO 9613-2:2024):
if (barrierBlocked && barrierInfo) {
  const Agr_partitioned = Agr_source + Agr_receiver;

  // 2024 Rule: If ground would attenuate (positive), cancel it
  if (Agr_partitioned > 0) {
    Agr = 0;  // Ground attenuation cancelled
  } else {
    Agr = Agr_partitioned;  // Boost still applies
  }

  totalAttenuation = Adiv + Aatm + Abar + Agr;
}
```

**Tasks:**
- [ ] Add `isoVersion: '1996' | '2024'` to PropagationConfig schema
- [ ] Implement barrier cancellation logic in `calculatePropagation()`
- [ ] Add UI toggle for ISO version (or include in profile)
- [ ] Update tests for 2024 behavior
- [ ] Document behavior difference

**Impact:** Blocked paths over soft ground will show **higher receiver levels** (less attenuation) in 2024 mode because positive A_gr is cancelled.

---

#### Phase 2: K_geo Geometric Correction (HIGH Priority)

**New in 2024:** Corrects A_gr at short distances and low heights.

```typescript
// File: packages/engine/src/propagation/index.ts

/**
 * ISO 9613-2:2024 K_geo correction factor.
 * Reduces ground effect at small distance-to-height ratios.
 */
function calculateKgeo(
  distance: number,
  sourceHeight: number,
  receiverHeight: number
): number {
  // TODO: Implement exact formula from ISO 9613-2:2024
  // K_geo approaches 0 as d/(h_s + h_r) decreases
  // K_geo approaches 1 for large distance-to-height ratios
  const hSum = sourceHeight + receiverHeight;
  const ratio = distance / Math.max(hSum, 0.1);

  // Placeholder - need exact formula from standard
  if (ratio < 10) {
    return ratio / 10;  // Linear taper
  }
  return 1.0;
}

// In agrISO9613PerBand():
export function agrISO9613PerBand(
  distance: number, sourceHeight: number, receiverHeight: number,
  groundFactor: number, frequency: number,
  options: { enable2024Kgeo?: boolean } = {}
): number {
  // ... existing calculation ...
  const Agr = As + Ar + Am;

  // ISO 9613-2:2024 K_geo correction
  if (options.enable2024Kgeo) {
    const Kgeo = calculateKgeo(distance, sourceHeight, receiverHeight);
    return Math.max(-3, Agr * Kgeo);
  }

  return Math.max(-3, Agr);
}
```

**Tasks:**
- [ ] Research exact K_geo formula from ISO 9613-2:2024 document
- [ ] Implement `calculateKgeo()` function
- [ ] Add `enable2024Kgeo` option to propagation config
- [ ] Wire through to `agrISO9613PerBand()`
- [ ] Add tests for K_geo behavior

---

#### Phase 3: D_z + K_met Updates (MEDIUM Priority)

**New in 2024:** Fixes errors with low barriers at large distances.

**Tasks:**
- [ ] Research updated D_z + K_met combination rules from ISO 9613-2:2024
- [ ] Implement modified barrier attenuation calculation
- [ ] Implement modified meteorological correction
- [ ] Add tests for new behavior

---

#### Phase 4: Profile UI (HIGH Priority)

**Create unified profile selection in Settings panel.**

```typescript
// File: packages/core/src/schema/index.ts

export const CalculationProfileSchema = z.enum([
  'iso-9613-2-1996',    // Original ISO standard
  'iso-9613-2-2024',    // Updated ISO standard
  'physically-accurate', // Two-ray phasor, coherent summation
  'custom'              // User-modified settings
]);

export type CalculationProfile = z.infer<typeof CalculationProfileSchema>;
```

**Tasks:**
- [ ] Define `CalculationProfile` type in schema
- [ ] Create `ISO_9613_1996_SETTINGS` constant
- [ ] Create `ISO_9613_2024_SETTINGS` constant
- [ ] Create `PHYSICALLY_ACCURATE_SETTINGS` constant
- [ ] Add `applyProfile(profile)` function
- [ ] Add profile dropdown to Settings UI
- [ ] Implement `detectProfile(config)` for auto-detection
- [ ] Show "Custom" when user modifies any setting

---

### Full Profile Comparison Table

| Feature | ISO 9613-2:1996 | ISO 9613-2:2024 |
|---------|-----------------|-----------------|
| **Ground effect (A_gr)** | Tables 3-4 per-band | Same + K_geo correction for short distances/low heights |
| **Barrier + Ground** | Partitioned A_gr additive with D_z | **Cancellation rule:** If A_gr > 0 & barrier present, A_gr is set to 0 |
| **D_z + K_met** | Original formulas | Modified to fix under-prediction for low barriers at large distances |
| **Method harmonization** | General vs Simplified separate | Unified approach (harmonized §7.3.1 & §7.3.2) |
| **Wind turbines** | Not covered | **Annex D** - Methodology aligning with IOA |
| **Advanced foliage** | Simple method only | **Annex A** - Detailed method with forestal parameters |
| **Reflections** | First-order only | Higher-order + reflections from vertical cylindrical bodies |
| **Meteorology** | Standard K_met | **Annex C** - Correction based on local wind climatology |
| **Source Directivity** | General | Improved classification + specific D_c for chimney stacks (Annex B) |
| **Extended Sources** | General | Improved subdivision rules to reduce software uncertainty |
| **Ground Factor (G)** | General | More detailed definition for horizontal plane projection |
| **Housing Attenuation** | General | **Annex A** - More specific for industrial sites/housing |
| **Simplified Method h_m** | Original definition | Modified mean height (h_m) definition in §7.3.2 |

---

### Physically Accurate Profile (Non-ISO)

For research, detailed analysis, and scenarios where interference effects matter.

| Setting | Value | Notes |
|---------|-------|-------|
| Ground Model | Two-ray phasor | Full wave interference model |
| A_gr Boost | Yes (allows negative) | Physically correct interference |
| Barrier+Ground | Coherent summation | Full phasor combination |
| Wall Reflections | On (first-order) | Included in phasor sum |
| Side Diffraction | Auto | Include for short barriers |
| Source Summation | Incoherent* | *Coherent available but not default |
| Phase Modeling | Yes | Full k·d phase calculation |

---

### New 2024 Annexes & Features (LOW Priority)

These are optional extensions introduced in ISO 9613-2:2024:

| Feature | Annex | Description | Priority |
|---------|-------|-------------|----------|
| **Wind turbines** | Annex D | IOA-aligned SPL calculation for wind turbines | LOW |
| **Advanced foliage** | Annex A | Detailed forestal parameters beyond simple attenuation | LOW |
| **Higher-order reflections** | — | Multiple reflections + vertical cylindrical bodies | MEDIUM |
| **Local meteorology** | Annex C | K_met from local wind-climatology data | LOW |
| **Chimney stack directivity** | Annex B | Specific D_c correction for chimney stacks | LOW |
| **Extended source subdivision** | — | Improved rules for industrial plants, traffic lines | LOW |
| **Housing attenuation** | Annex A | More specific for industrial sites/housing | LOW |
| **Ground factor (G) projection** | — | More detailed horizontal plane projection rules | MEDIUM |
| **Simplified method h_m** | §7.3.2 | Modified mean height definition | MEDIUM |

---

## 🔮 Future Enhancements
- **ISO 9613-2 Ground Effect (Agr) Per-Band Compliance** - ✅ COMPLETED: Implemented Tables 3-4 with frequency-dependent coefficients (A_gr = A_s + A_r + A_m)
- **ISO 9613-2 A_gr Clamping Clarification** - ✅ COMPLETED: ISO 9613-2 does NOT specify per-region clamping. Only total A_gr is clamped at -3 dB as a practical floor to avoid unrealistic amplification. Individual regions (A_s, A_r, A_m) compute freely.
- **Sommerfeld Ground Wave Correction** - ✅ COMPLETED: Implemented in reflectionCoeff() (smooth transition at |w|=4 still pending)
- **Rename "Ground Reflection" toggle to "Ground Effects"** - ✅ COMPLETED: Toggle now labeled "Ground Effects" to reflect both two-ray reflection model AND ISO Agr absorption
- Configurable diffraction model selection (Maekawa / Kurze-Anderson / ISO 9613-2)
- Higher-order reflections (2nd, 3rd order bounces)
- Wall reflections for diffracted paths
- Ghost source visualization on canvas
- LOD system for performance modes
- Probe comparison mode
- WebAssembly/GPU acceleration
- Spatial caching for nearby positions
- Terrain/topography effects
- Expose `maxReflections` setting in UI (currently hardcoded to 0)

---

## Physics Audit - Bug Fixes

> **Audit Date:** 2025-01-08 (Updated: 2025-01-09)
> **Status:** 13 Resolved, 7 Pending
> **Ground Truth:** [physics_audit.md](./physics_audit.md)

A comprehensive physics consistency audit identified several issues. See [physics_audit.md](./physics_audit.md) for full details and implementation code.

### ✅ Resolved Issues (13)

| Issue | Description | Resolution |
|-------|-------------|------------|
| #1 | Spreading Loss Formula Constant Ambiguity | Fixed with exact constants + documentation |
| #2 | Two-Ray Ground Model Sign Inconsistency | Resolved by design (see Calculation Profile Presets) |
| #2b | computeProbeCoherent Double-Counts Direct Path | Fixed: paths now processed uniformly |
| #3 | Barrier + Ground Effect Interaction | Fixed: ISO 9613-2 §7.4 additive formula with ground partitioning |
| #4 | Atmospheric Absorption Uses Direct Distance | Fixed: now uses actualPathLength for diffracted paths |
| #5 | Side Diffraction Geometry Oversimplified | Fixed: horizontal diffraction at ground level |
| #5 (probeWorker) | Simplified Atmospheric Absorption | Fixed: now respects UI model selection |
| #6 | Delany-Bazley Extrapolation Outside Valid Range | Fixed: bounds checking + Miki (1990) extension |
| #10 | "Simple" Atmospheric Model Incorrectly Formulated | Fixed: replaced buggy formula with lookup table |
| #11 | Diffraction Only Traced When Direct Blocked | Fixed: traces nearby diffraction for coherent summation |
| #12 | Mixed Ground Sigma Calculation Arbitrary | Fixed: user-selectable ISO 9613-2 or logarithmic interpolation |
| #16 | Same Formula for Thin/Thick Barriers | Fixed: buildings use coefficient 40 and cap 25 dB |
| #18 | Speed of Sound Constant vs Formula Mismatch | Fixed: Environmental Conditions UI for user-controlled temp/humidity/pressure |

### 🟠 Moderate Priority - Pending (2)

> **Note on Wall Reflections:** Wall reflections are NOT required for ISO 9613-2 compliance. They are a ray-tracing enhancement for the Probe engine only.

> **Note on Coherent Summation:** The Grid engine correctly uses incoherent (energetic) summation per ISO 9613-2. Coherent phasor summation is only used in the Probe engine for interference modeling.

#### #7. Ground Reflection Assumes Flat Ground (z=0)

**File:** `packages/engine/src/raytracing/index.ts:312-317`
**Status:** ⬜ Open

**Problem:** Ground reflection point calculation hardcodes `z: 0`, doesn't account for terrain variation.

**Impact:** Wrong for any terrain variation.

---

#### #9. Wall Reflection Height Geometry Incorrect

**File:** `packages/engine/src/raytracing/index.ts:387-389`
**Status:** ⬜ Open

**Problem:** Uses arbitrary clamping `Math.min(imageSource.surface.height, Math.max(source.z, receiver.z))` instead of proper geometric calculation from image source method.

**Impact:** Geometry error in reflected paths.

---

### 🟡 Minor Priority - Pending (5)

#### #13. Sommerfeld Correction Discontinuity at |w|=4

**File:** `packages/engine/src/propagation/ground.ts:192-200`
**Status:** ⬜ Open (Sommerfeld IS implemented, smooth transition pending)

**Problem:** Hard threshold at |w|=4 causes small discontinuity. Should use smooth Hermite transition.

---

#### #14. Hardcoded Diffraction Phase Shift

**File:** `packages/engine/src/raytracing/index.ts:467`
**Status:** ⬜ Open

**Problem:** Uses `-π/4` constant. Exact phase depends on diffraction angle (UTD model).

---

#### #15. Incoherent Source Summation Only

**File:** `packages/engine/src/compute/index.ts:467`
**Status:** ⬜ Open (by design)

**Note:** Cannot model correlated sources. Low priority - most real-world sources are uncorrelated.

---

#### #17. Ground Absorption Not Spectral

**File:** `packages/engine/src/raytracing/index.ts:340-345`
**Status:** ⬜ Open

**Problem:** Uses single absorption value for all frequencies instead of ISO 9613-2 Table 2 spectral coefficients.

---

#### #19. Diffraction Loss = 0 in Ray Tracing Result

**File:** `packages/engine/src/raytracing/index.ts:469`
**Status:** ⬜ Open

**Problem:** Diffraction loss is a placeholder (0), computed downstream. Should pre-compute per-band loss.

---

### ✅ Verified Correct

The following implementations were verified as **physically accurate**:

| Component | Location | Status |
|-----------|----------|--------|
| Spreading Loss | `propagation/index.ts:61-76` | ✅ `20·log₁₀(r) + 11` for point source |
| Maekawa Diffraction | `propagation/index.ts:172-209` | ✅ `10·log₁₀(3 + 20·N)` |
| Phasor Phase | `phasor/index.ts:173-174` | ✅ `phase = -k·distance` |
| Double-Edge Diffraction | `probeWorker.ts:655` | ✅ Coefficient 40, cap 25 dB |
| Two-Ray Geometry | `probeWorker.ts:971-988` | ✅ r1, r2 formulas correct |
| Coherent Phasor Sum | `phasor/index.ts:213-227` | ✅ Proper complex summation |

---

## High Priority - In Progress

### Visual Indicator When Probe is Calculating

Add a loading/calculating indicator to show when probe computation is in progress.

**Status:** In Progress
**Priority:** High

---

## Planned This Cycle

### Expose maxReflections Setting in UI

**Problem:** Currently hardcoded to 0 in `PropagationConfigSchema` (range: 0-3). This controls higher-order reflections and could significantly impact accuracy.

**Evaluation needed:**
1. Performance impact of 1st/2nd/3rd order reflections
2. Whether to expose as advanced setting or simple toggle
3. Interaction with existing wall reflection code in `probeWorker.ts`

---

## ~~Barrier Side Diffraction Toggle~~ ✅ COMPLETED

> **Status:** ✅ Completed in v0.4.2
> **Implemented:** 2026-01-07

See [CHANGELOG.md](./CHANGELOG.md#barrier-side-diffraction-toggle) for full implementation details.

---

## Configurable Diffraction Models

> **Status:** Future Enhancement
> **Priority:** Medium

### Overview

Different acoustic scenarios benefit from different diffraction models. A festival planner may prefer fast approximate models, while an environmental noise consultant may require ISO-compliant calculations.

### Proposed UI Configuration

```typescript
interface DiffractionConfig {
  // Barrier (thin screen) diffraction model
  barrierModel: 'maekawa' | 'kurze-anderson' | 'iso9613-2' | 'none';

  // Building (thick obstacle) diffraction model
  buildingModel: 'blocking-only' | 'double-edge-maekawa' | 'pierce' | 'shortest-path';

  // Whether to consider horizontal (around-corner) diffraction
  enableHorizontalDiffraction: boolean;

  // Maximum diffraction loss before path is considered "blocked"
  maxDiffractionLoss: number;  // default: 25 dB
}
```

### Barrier Diffraction Models

| Model | Description | Pros | Cons |
|-------|-------------|------|------|
| `maekawa` | Simplest, most widely used | Fast, validated | Less accurate at low N |
| `kurze-anderson` | Better low-frequency behavior | Smooth transition at N=0 | Marginally more complex |
| `iso9613-2` | Full ISO compliance with ground corrections | Standards-compliant | More complex geometry |
| `none` | Barriers block completely or ignored | Debugging | Unrealistic |

### Building Diffraction Models

| Model | Description | Max Loss |
|-------|-------------|----------|
| `blocking-only` | No diffraction, infinite attenuation | ∞ |
| `double-edge-maekawa` | Coefficient 40 for roof paths | 25-30 dB |
| `pierce` | Separate edge losses + coupling | 30-35 dB |
| `shortest-path` | Evaluates roof + both corners, takes minimum | Varies |

### Configuration Examples

**Festival Mode (Fast):**
```typescript
{
  barrierModel: 'maekawa',
  buildingModel: 'blocking-only',
  enableHorizontalDiffraction: false,
  maxDiffractionLoss: 20
}
```

**Standard Mode (Balanced):**
```typescript
{
  barrierModel: 'maekawa',
  buildingModel: 'double-edge-maekawa',
  enableHorizontalDiffraction: false,
  maxDiffractionLoss: 25
}
```

**Accurate Mode (Consulting):**
```typescript
{
  barrierModel: 'iso9613-2',
  buildingModel: 'shortest-path',
  enableHorizontalDiffraction: true,
  maxDiffractionLoss: 30
}
```

### Implementation Phases

| Phase | Task | Priority |
|-------|------|----------|
| 1 | Implement `blocking-only` for buildings | High |
| 2 | Add `double-edge-maekawa` for buildings | High |
| 3 | Add UI toggle for building model | Medium |
| 4 | Implement `pierce` thick barrier model | Medium |
| 5 | Add `shortest-path` with horizontal diffraction | Low |
| 6 | Add `kurze-anderson` and `iso9613-2` barrier models | Low |

---

## Wall Reflections for Diffracted Paths

> **Status:** Future Enhancement
> **Priority:** Low

### Problem Statement

Currently, when a direct path is blocked by a building:
1. We compute diffraction paths (over roof + around corners)
2. Each diffraction path creates a phasor with proper attenuation and phase
3. All paths are summed coherently

However, these diffracted paths are treated as **terminal** — they cannot undergo further wall reflections. In reality, a diffracted sound wave can reflect off nearby building walls.

### Current Behavior

```
        S                              R
         \                            /
          \      DIFFRACTED PATH     /
           A₁ ──→ ●────────● ←── A₂
                  │  ROOF  │
           ═══════╧════════╧═══════   Building A

                                       ┌─────────────┐
                                       │  Building B │
                                       └─────────────┘
                                             ↑
                             Currently: No reflection computed
```

**What we compute:**
- S → Roof → R (diffracted path) ✅

**What we DON'T compute:**
- S → Roof → Wall_B → R (diffracted + reflected path) ❌

### Proposed Enhancement

Add an option to trace wall reflections from diffracted paths:

```typescript
interface DiffractionConfig {
  // Enable wall reflections on diffracted paths
  enableDiffractedPathReflections: boolean;  // default: false

  // Maximum reflection order for diffracted paths
  maxDiffractedPathReflectionOrder: number;  // default: 1
}
```

### Performance Considerations

This enhancement significantly increases path count:
- Current: ~1-5 paths per source
- With diffracted reflections: 10-20+ paths per source

**Mitigation strategies:**
1. Default to OFF (user must opt-in)
2. Limit to first-order reflections only
3. Distance culling (skip reflections > 100m from receiver)
4. Amplitude culling (skip paths with estimated level < -80 dB)
5. Lazy evaluation (only compute if diffraction loss < 20 dB)

### When This Matters

**High Impact Scenarios:**
- Urban canyons with many reflective surfaces
- Source behind building, receiver in courtyard surrounded by walls
- Long diffraction paths with nearby reflective walls

**Low Impact Scenarios:**
- Open fields with isolated buildings
- Soft/absorptive building facades
- Short source-receiver distances

---

## Phase 1 Remaining Tasks

From the original project TODO:

- [ ] Save/load scene JSON with migrate/validate/normalize + tests `T6.1.1` and `T6.1.2`
- [ ] Test `T7.1.1`: incremental equals full recompute within tolerance
- [ ] DoD verification + integration tests
- [ ] SPEC docs (`SPEC.*.md`) for Phase 1 behavior
- [ ] Align UI compute with engine propagation config (mode/output metric)
- [ ] Add canonical scenes and golden snapshots through router for receivers + panels

---

## Probe Ray Visualization

> **Status:** 📋 Planned
> **Priority:** Medium

### Overview

Add a toggle in the probe inspector to visualize all rays traced by the Probe engine, both on the map and as a level breakdown in the inspector panel.

### Inspector Panel: Path Breakdown

The toggle and path breakdown are contained in a **raised neumorphic element** inside the probe panel. When the toggle is enabled, path data is fetched and displayed:

```
┌─ Probe Inspector ─────────────────────────────────┐
│  L_eq: 72.3 dB(A)                                 │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │  ☑ Show Traced Rays         (raised card)   │  │
│  │                                             │  │
│  │  Path Contributions:                        │  │
│  │  ━━━ Direct              68.2 dB  ████████  │  │
│  │  ┅┅┅ Ground Bounce       64.1 dB  ██████    │  │
│  │  ••• Wall Reflection     52.3 dB  ███       │  │
│  │  ━•━ Roof Diffraction    48.7 dB  ██        │  │
│  │                                             │  │
│  │  Phase Info:                                │  │
│  │  🔵 Constructive: Direct + Ground (Δφ=12°)  │  │
│  │  🔴 Destructive: Direct + Wall (Δφ=168°)    │  │
│  │                                             │  │
│  │  Dominant: Direct path (68.2 dB)            │  │
│  └─────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

#### Toggle Design (per NEUMORPHIC_STYLE_GUIDE.md)

The toggle follows the standard neumorphic toggle switch pattern:
- **Track (OFF)**: Sunken inset with `box-shadow: inset 3px 3px 6px #b8c4d0, inset -2px -2px 4px #ffffff`
- **Track (ON)**: Solid `var(--active-blue)` background
- **Thumb**: Raised circle (28px) extending 2px beyond track height, with dual shadows

### Map Visualization

When toggle enabled, render ray paths on the map canvas:

```
                    🔊 Source
                   /|\`\
                  / | \ `\
        Direct → /  |  \  `\ ← Wall reflection
                /   |   \   `\
               /    |    \    🏢
              /     |     \   Wall
             /    ●──┘     \
            /   Ground      \
           /   reflection    \
          /                   \
         🎤 ←─────────────────┘
        Probe
```

**Line styles:**
- **Solid (━━━)**: Direct path
- **Dashed (┅┅┅)**: Ground bounce (shows reflection point)
- **Dotted (•••)**: Wall reflections
- **Dash-dot (━•━)**: Diffraction paths (over/around barriers)

**Color/opacity:** Based on path contribution level (brighter = higher dB)

### Behavior: Scene Changes Auto-Disable Toggle

When the scene changes (sources move, barriers move, probe moves), the ray visualization toggle is **automatically turned OFF**. The user must manually toggle it back on to re-fetch and display updated ray data.

**Rationale:**
- Avoids expensive re-renders on every scene change
- Path data is only fetched when explicitly requested
- Canvas doesn't need to continuously redraw path overlays

### Worker Communication Optimization

Path geometry is **only sent from the worker when the toggle is enabled**:

```typescript
// In main thread - request with visualization flag
probeWorker.postMessage({
  type: 'compute',
  probeId,
  position,
  includePathGeometry: showRaysToggle.checked  // Only when enabled
});

// In worker - conditionally include path data
if (request.includePathGeometry) {
  result.paths = tracedPaths.map(p => ({
    type: p.type,
    points: p.points.map(v => ({ x: v.x, y: v.y })),  // 2D only for map
    level_dB: p.level_dB,
    phase_rad: p.phase_rad,
    sourceId: p.sourceId
  }));
}
```

### Use Cases

1. **Debug** - Understand why probe level differs from expected
2. **Verify** - Confirm engine is tracing correct paths
3. **Optimize** - Identify dominant paths for barrier placement
4. **Educational** - Visualize multi-path propagation physics

### Implementation Notes

```typescript
interface TracedPath {
  type: 'direct' | 'ground' | 'wall' | 'diffraction';
  points: Vec2[];           // Path vertices (2D for map drawing)
  level_dB: number;         // Contribution level
  phase_rad: number;        // Phase at receiver
  sourceId: string;         // Which source this path is from
  reflectionPoint?: Vec2;   // For ground/wall paths
  diffractionEdge?: Vec2;   // For diffraction paths
}

interface PhaseRelationship {
  path1Type: string;
  path2Type: string;
  phaseDelta_deg: number;
  isConstructive: boolean;  // |Δφ| < 90°
}

interface ProbeRayVisualization {
  enabled: boolean;
  paths: TracedPath[];
  phaseRelationships: PhaseRelationship[];  // Pairwise phase info
  showLabels: boolean;      // Show dB labels on paths
  colorByLevel: boolean;    // Color intensity by contribution
}
```

### Raised Card Styling

The ray visualization container uses neumorphic raised styling:

```css
.ray-viz-card {
  background: var(--bg);
  border-radius: 16px;
  padding: 12px 16px;
  margin-top: 12px;
  box-shadow: 3px 3px 6px rgba(100, 110, 130, 0.3),
              -2px -2px 5px rgba(255, 255, 255, 0.7);
}

.ray-viz-card .path-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}

.ray-viz-card .phase-info {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(100, 110, 130, 0.15);
  font-size: 11px;
  color: var(--text-muted);
}
```

### Files to Modify

| File | Changes |
|------|---------|
| `apps/web/src/probeWorker.ts` | Conditionally return path geometry with results |
| `apps/web/src/main.ts` | Render paths on canvas, update inspector, auto-disable on scene change |
| `apps/web/index.html` | Add raised card with toggle and path breakdown UI |
| `apps/web/src/style.css` | Raised card and path breakdown styling per neumorphic guide |

---

## Future Enhancements Summary

| Feature | Priority | Effort | Status |
|---------|----------|--------|--------|
| Probe calculating indicator | High | Low | In Progress |
| Expose maxReflections UI | Medium | Low | Planned |
| Configurable diffraction models | Medium | High | Future |
| Ghost source visualization | Low | Medium | Future |
| LOD performance modes | Low | High | Future |
| Probe comparison mode | Low | Medium | Future |
| WebGPU acceleration | Low | Very High | Future |
| Spatial caching | Low | Medium | Future |
| Terrain/topography | Low | Very High | Future |
| Diffracted path reflections | Low | High | Future |
| Auralization/HRTF | Low | Very High | Future |
| Bouncing/physics equation tiles | Low | Medium | Future |

---

## Bouncing Physics Equation Tiles

> **Status:** Future Enhancement
> **Priority:** Low

### Concept

In the Full Equations tab, have the section containers (Core Levels, Geometry, Spreading, etc.) float freely and bounce off each other using physics simulation. This creates a playful, interactive experience that showcases the neumorphic design.

### Implementation Notes

- Target `.spec-section` containers with absolute positioning
- Use AABB (axis-aligned bounding box) collision detection
- Implement momentum-based elastic collisions
- Sections bounce off container walls
- Gentle friction + occasional random nudges to keep motion going

### Technical Challenges

- Initial positioning needs to avoid overlap
- Collision resolution can cause overlapping if not carefully separated
- Performance with many sections at 60fps
- May need to pause animation when tab not visible

### Attempted Implementation

An initial implementation was attempted using:
- `position: absolute` on `.equations-grid .spec-section`
- requestAnimationFrame physics loop
- AABB collision detection with momentum exchange

However, the initial grid layout and collision resolution caused sections to overlap. Future work could:
1. Use a force-directed layout algorithm (like D3.js force simulation)
2. Start with sections spread apart in a Masonry-like layout
3. Add "settling" phase before enabling bouncing

---

*See also: [ARCHITECTURE.md](./ARCHITECTURE.md) for system overview, [CHANGELOG.md](./CHANGELOG.md) for completed implementations.*
