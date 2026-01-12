# GeoNoise Changelog

This document contains the implementation history of completed features. For planned features, see [ROADMAP.md](./ROADMAP.md).

---

## 2026-01-12

### LaTeX Equation Rendering with KaTeX

**Status:** ✅ Complete

Added KaTeX library integration for beautiful LaTeX-style equation rendering throughout the application.

#### Features

| Feature | Description |
|---------|-------------|
| **KaTeX CDN Integration** | Added KaTeX 0.16.9 via CDN with auto-render extension |
| **Display & Inline Math** | `$$...$$` for display equations, `$...$` for inline |
| **Collapsible Subtitles** | Equations rendered in section subtitle previews |
| **CSS Styling** | Custom styling for KaTeX within neumorphic UI |

#### Equations Converted to LaTeX

| Section | Equation |
|---------|----------|
| Main formula | `$L_p(f) = L_W(f) - A_{div} - A_{atm}(f) - A_{gr}(f) - A_{bar}(f)$` |
| Geometric Divergence | `$A = 20\log_{10}(d) + 10\log_{10}(4\pi)$` |
| Atmospheric Absorption | `$A_{atm} = \alpha(f) \cdot d / 1000$` |
| Ground Effect | `$A_{gr} = A_s + A_r + A_m$` |
| Barrier Diffraction | `$A_{bar} = 10\log_{10}(3 + 20N)$` |
| Coherent Summation | `$p_{total} = \sum_i p_i \cdot e^{j\phi_i}$` |
| Wall Reflection | `$|\Gamma| \approx 0.9$` |
| Two-Ray Model | `$r_1 = \sqrt{d^2 + (h_s - h_r)^2}$` |
| Delany-Bazley | `$Z_n = 1 + 9.08(f/\sigma)^{-0.75} + j \cdot 11.9(f/\sigma)^{-0.73}$` |
| Coherent Ground Effect | `$A_{gr} = -20\log_{10}|1 + \Gamma \cdot (r_1/r_2) \cdot e^{jk(r_2 - r_1)}|$` |

#### Bug Fixes

| Fix | Description |
|-----|-------------|
| **Profile equation updates** | `applyProfile()` now calls `updateAllEquations()` to refresh equations when profile changes |
| **Profile recalculation** | `applyProfile()` now calls `markDirty()` and `computeScene()` to recalculate with new settings |
| **Corrupted event listener** | Fixed `propagationGroundModel` event listener that had malformed code merged in |
| **Missing probeClose listener** | Restored `probeClose` button click handler that was accidentally removed |

#### Files Modified

| File | Changes |
|------|---------|
| `apps/web/index.html` | Added KaTeX CDN links, converted all equations to LaTeX notation |
| `apps/web/src/style.css` | Added `.formula-katex` and `.equation-katex` CSS classes |
| `apps/web/src/main.ts` | Added `rerenderKatex()` helper, re-render on modal/panel open and collapsible expand, converted dynamic equation updates to LaTeX, fixed profile application bugs |

#### Technical Details

- **Auto-render on page load**: Uses KaTeX auto-render extension
- **Re-render on modal open**: `openAbout()` calls `rerenderKatex()` for hidden content
- **Re-render on settings panel open**: `showPanel()` calls `rerenderKatex()` when slide panel opens
- **Re-render on collapsible expand**: Equation collapsibles trigger `rerenderKatex()` when expanded
- **Dynamic equation updates**: All `update*Equation()` functions now use LaTeX syntax and call `rerenderKatex()`
- **Profile switching**: Switching profiles now properly updates equation displays and recalculates the scene

---

### Calculation Profile Selector

**Status:** ✅ Complete

Added a calculation profile selector to the Physics settings panel that allows switching between ISO 9613-2:1996 compliant and Physically Accurate presets, with auto-detection of Custom when settings are modified.

#### Features

| Feature | Description |
|---------|-------------|
| **Profile Dropdown** | Dropdown in Physics panel with ISO 9613-2:1996, Physically Accurate, and Custom options |
| **Profile Indicator** | Small text indicator in main settings popover header showing active profile |
| **Auto-detection** | Automatically switches to "Custom" when any setting differs from presets |
| **Preset Application** | Clicking a profile applies all associated settings instantly |

#### Profile Definitions

| Setting | ISO 9613-2:1996 | Physically Accurate |
|---------|-----------------|---------------------|
| Spreading Loss | Spherical | Spherical |
| Ground Type | Mixed | Mixed |
| Ground Effects | ON | ON |
| Ground Effect Model | ISO 9613-2 (legacy) | Ground Interference (twoRayPhasor) |
| Mixed Interpolation | ISO 9613-2 (Linear) | Logarithmic |
| Side Diffraction | Off | Auto |
| Atmospheric Absorption | ISO 9613-1 | ISO 9613-1 |

#### UI Improvements

- Enabled probe engine controls (previously feature-flagged)
- Reduced equation dropdown margins for tighter visual coupling with controls
- Converted phasor summation equation to collapsible dropdown format

---

### Delany-Bazley & Miki Impedance Models

**Status:** ✅ Complete - Wired to Probe Worker

Replaced simplified empirical ground reflection model with physics-based impedance calculations using the Delany-Bazley and Miki models from acoustic literature.

#### Implementation Details

| Component | Formula | Reference |
|-----------|---------|-----------|
| **Delany-Bazley** | `Zn = 1 + 9.08(f/σ)^(-0.75) - j·11.9(f/σ)^(-0.73)` | Delany & Bazley (1970) |
| **Miki Extension** | `Zn = 1 + 5.50(f/σ)^(-0.632) - j·8.43(f/σ)^(-0.632)` | Miki (1990) |
| **Reflection Coefficient** | `Γ = (Zn·cos(θ) - 1) / (Zn·cos(θ) + 1)` | Plane-wave theory |
| **Mixed Ground** | `σ_eff = σ_hard^(1-G) × σ_soft^G` | ISO 9613-2 logarithmic interpolation |

#### Flow Resistivity Values (Pa·s/m²)

| Ground Type | Value | Description |
|-------------|-------|-------------|
| Hard | 2,000,000 | Concrete, asphalt |
| Soft | 20,000 | Loose soil, grass lawn |
| Gravel | 500,000 | Gravel surface |
| Compact Soil | 100,000 | Compacted earth |
| Snow | 30,000 | Fresh snow |

#### Model Selection Logic

- **Delany-Bazley**: Used when f/σ < 1.0 (its valid range)
- **Miki**: Used when f/σ ≥ 1.0 (extended range with better low-frequency behavior)
- **Auto mode**: Automatically selects based on f/σ ratio

#### Technical Changes

- Added `Complex` interface and operations (`complexMultiply`, `complexDivide`, `complexMagnitude`, `complexPhase`)
- Added `FLOW_RESISTIVITY` constants for different ground types
- Implemented `delanyBazleyImpedance()` and `mikiImpedance()` functions
- Implemented `calculateSurfaceImpedance()` with auto-selection logic
- Implemented `calculateReflectionCoefficient()` using plane-wave formula
- Implemented `calculateMixedFlowResistivity()` with logarithmic interpolation
- Updated `getGroundReflectionCoeff()` to use physics-based model

---

## 2026-01-11

### Physics Settings UI Restructure

**Status:** ✅ UI Complete | ⚠️ Probe Engine Wiring Pending

Major redesign of the Physics settings panel separating Grid Engine and Probe Engine settings with COMSOL-style collapsible equations.

#### New Panel Structure

| Section | Purpose | Wiring Status |
|---------|---------|---------------|
| **s h a r e d** | Spreading Loss, Ground Surface | ✅ Fully wired to engine |
| **g r i d  e n g i n e** | Ground Effects, Ground Model, Mixed Interpolation, Side Diffraction | ✅ Fully wired to engine |
| **p r o b e  e n g i n e** | Ground Reflection, Wall Reflections, Barrier Diffraction, Sommerfeld, Impedance Model | ⚠️ **UI Only - Not wired to probe worker** |

#### Probe Engine Controls (Placeholders - Wiring TODO)

These controls update the UI and equations but do NOT affect probe calculations yet:

| Control | Current Behavior | TODO |
|---------|-----------------|------|
| Ground Reflection toggle | `console.log()` only | Wire to `probeWorker.ts` |
| Wall Reflections toggle | `console.log()` only | Wire to `probeWorker.ts` |
| Barrier Diffraction toggle | `console.log()` only | Wire to `probeWorker.ts` |
| Sommerfeld Correction toggle | `console.log()` only | Add Sommerfeld to ground model |
| Impedance Model dropdown | `console.log()` only | Add Miki fallback logic |

The probe worker currently has these features hardcoded ON. Wiring the toggles will allow users to disable specific path types for debugging or performance.

#### Features Implemented

- **Three clear sections** with letter-spaced titles (`s h a r e d`, `g r i d  e n g i n e`, `p r o b e  e n g i n e`)
- **Collapsible equations** that update dynamically when dropdown selection changes
- **Phasor summation display** showing `p = Σ pᵢ · e^(j·φᵢ)` for probe paths
- **Blue toggle ring** with inset effect when active (matching slider style)
- **Fade effect** on collapsed equations (50% opacity → 100% when expanded)
- **No hover bounce** on toggles (removed per user feedback)

#### Build Tools Added

| File | Purpose |
|------|---------|
| `nuke-rebuild.command` | Double-click for nuclear clean + rebuild (clears all caches) |
| `run-web.command` | Updated to use `npm run build:clean` when stale build detected |

#### Files Modified

| File | Changes |
|------|---------|
| `apps/web/index.html` | Restructured physics panel into 3 sections with equation collapsibles |
| `apps/web/src/style.css` | ~150 lines for section styling, equation displays, toggle effects |
| `apps/web/src/main.ts` | Equation update functions, placeholder event listeners for probe controls |
| `docs/PHYSICS_UI_RESTRUCTURE.md` | Updated status to "Implemented (UI Complete, Probe Wiring Pending)" |

---

### Engines Tab in Details Modal

**Status:** ✅ Implemented (v0.6.0)

Added a new "Engines" tab to the Details modal providing comprehensive documentation of GeoNoise's dual-engine calculation architecture. This documentation is verified against the actual codebase for academic accuracy.

#### Content Added

1. **Grid Engine Section**
   - Used for: Measure Grids, Receivers, Noise Maps
   - Single direct path per source-receiver pair
   - Barrier occlusion check with diffraction computation
   - Ground effect via A_gr model (user-selectable ISO 9613-2 or Two-Ray phasor)
   - Energy (power) summation across sources (incoherent)

2. **Probe Engine Section**
   - Used for: Probe microphones only
   - Ray tracing with multi-path: Direct, Ground-reflected, Wall reflections (first-order), Side diffraction, Over-top diffraction
   - Coherent phasor summation with phase from path length (φ = -k·d)
   - Full interference modeling (constructive/destructive, ground dip, comb filtering)

3. **Architecture Diagram (ASCII)**
   - Visual flow: Sources → Path Finding → Attenuation (ISO 9613-2) → Summation
   - Shows Grid Engine vs Probe Engine branches
   - Shows Incoherent vs Coherent summation methods

4. **Comparison Table**
   - 9 comparison aspects: Path count, Ground effect, Wall reflections, Summation, Ground interference, Multi-path interference, Ground dip, Performance, Output

5. **"Why Two Engines?" Explanation**
   - Rationale for using ISO 9613-2 single-path for grids (fast, thousands of points)
   - Rationale for ray tracing + phasor for probes (detailed frequency response, interference)

#### Code Verification

All claims verified against production code with exact file paths and function names:

| Claim | Verified Function | File |
|-------|-------------------|------|
| Single path per source-receiver | `traceDirectPath()` | `raytracing/index.ts:274-295` |
| Barrier occlusion & diffraction | `traceDiffractionPath()` | `raytracing/index.ts:428-471` |
| ISO 9613-2 ground effect | `agrISO9613PerBand()` | `propagation/index.ts:348-425` |
| Two-Ray phasor ground effect | `agrTwoRayDb()` | `propagation/ground.ts:212-243` |
| Coherent phasor summation | `sumPhasorsCoherent()` | `phasor/index.ts:213-227` |
| Phase formula φ = -k·d | `createPhasor()` | `phasor/index.ts:165-176` |
| Ray tracing multi-path | `traceAllPaths()` | `raytracing/index.ts:513-586` |
| Wall reflections | `traceWallPaths()` | `raytracing/index.ts:362-422` |
| Maekawa diffraction | `maekawaDiffraction()` | `raytracing/index.ts:596-608` |
| Incoherent source summation | `sumMultipleSpectra()` | `compute/index.ts:730-732` |

#### Accuracy Corrections

Fixed incorrect claim that Grid engine "cannot capture interference":
- **ISO 9613-2 model**: Empirical per-band coefficients (no interference) ✓
- **Two-Ray model**: DOES compute phasor interference between direct + ground reflection ✓
- Updated comparison table: "Ground interference: With Two-Ray only" for Grid engine

#### Files Modified

| File | Changes |
|------|---------|
| `apps/web/index.html` | Added "Engines" tab button, Engines panel with all content |

---

### Enhanced Canvas Controls Help Tooltip

**Status:** ✅ Implemented (v0.5.3)

Expanded the Canvas Controls help tooltip with comprehensive documentation of all canvas behaviors and added an auto-hide feature with spring animation.

#### New Controls Documented

- **Selection:** Added `⌘+Drag: Box select multiple` for marquee selection
- **Editing section (new):**
  - `Drag element: Move (live update)` - real-time position updates
  - `Shift+Drag: Duplicate item` - drag-to-duplicate gesture
  - `⌘+D: Duplicate selected` - keyboard duplicate shortcut
  - `Delete/Backspace: Remove selected` - deletion
  - `Escape: Deselect / Cancel` - cancel operations
- **Tools:** Expanded to show all keyboard shortcuts (V, S, R, B, H, G, P)

#### Auto-Hide with Spring Animation

The tooltip now automatically disappears after 10 seconds of inactivity with a bouncy spring-out animation:

- Starts timer on initial load or when manually opened
- Hovering over the tooltip pauses the timer
- Spring animation bounces up slightly before collapsing down
- Timer resets when mouse leaves the tooltip

#### Files Modified

| File | Changes |
|------|---------|
| `apps/web/index.html` | Expanded Canvas Controls tooltip content with new sections |
| `apps/web/src/style.css` | Added `.is-hiding` class and `tooltipSpringOut` keyframe animation |
| `apps/web/src/main.ts` | Added 10-second auto-hide timer with spring-out animation |

---

### Noise Map Resolution Fix on Panel Selection

**Status:** ✅ Fixed (Bug)

**Issue:** Clicking on a measure grid (panel) caused the noise map resolution to drop drastically, making the heatmap appear very pixelated. The resolution never recovered after clicking.

**Root Cause:** The `recalculateNoiseMapIfVisible()` function always used ultra-low resolution (`RES_LOW` with only 2,500 points) for any recalculation, regardless of whether the user was actively dragging or just clicking to select. When clicking on a panel:

1. `computeScene()` was called on mouseup
2. This triggered `recalculateNoiseMapIfVisible()` with ultra-low resolution
3. Since panel drags don't affect geometry, `shouldLiveUpdateMap()` returned `false`
4. The high-resolution restoration (`recalculateNoiseMap(RES_HIGH)`) was never called
5. Result: Map stuck at 2,500 points permanently until another action triggered high-res

**Fix:** Modified `recalculateNoiseMapIfVisible()` to check the `interactionActive` flag before choosing resolution:

```typescript
function recalculateNoiseMapIfVisible() {
  if (!layers.noiseMap || !noiseMap) {
    return; // Map not visible, nothing to recalculate
  }
  // Use low resolution only during active dragging for responsiveness.
  // For static updates (after changes complete), use high resolution.
  if (interactionActive) {
    recalculateNoiseMap(RES_LOW, DRAG_POINTS);  // 8px/cell, 35k points
  } else {
    recalculateNoiseMap(RES_HIGH, STATIC_POINTS);  // 2px/cell, 50k points
  }
}
```

Now the function only uses low resolution during actual geometry-affecting drags. Static updates (like clicking to select a panel) use high resolution.

#### Files Modified

| File | Changes |
|------|---------|
| `apps/web/src/main.ts` | Updated `recalculateNoiseMapIfVisible()` to check `interactionActive` flag |

---

### Inspector Panel Visual Fixes

**Status:** ✅ Implemented (v0.5.2)

Fixed two visual issues with floating inspector panels and the dock toolbar.

#### Dock Z-Index Fix

The add element dock (bottom toolbar with V, S, R, P, B, H, G buttons) was being covered by floating inspector windows. This was caused by CSS `transform: translateX(-50%)` creating a new stacking context, which prevented the z-index from working globally.

**Before:**
```css
.dock {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);  /* Creates stacking context! */
  z-index: 99999;
}
```

**After:**
```css
.dock {
  position: fixed;
  left: 50%;
  margin-left: -170px;  /* Margin-based centering, no stacking context */
  z-index: 99999;
}
```

The dock now uses `position: fixed` with margin-based centering, ensuring it always remains on top of all inspector panels regardless of their z-index.

#### Probe Panel Halo Removal

Probe inspector windows had a soft, light-colored halo/glow effect around them, while other panels (like Barrier/Source inspectors) had hard edge shadows. This inconsistency was due to different box-shadow values.

**Before (probe-panel):**
```css
box-shadow: 0 4px 16px rgba(80, 90, 110, 0.35), 0 1px 3px rgba(80, 90, 110, 0.2);
```

**After (matches topbar and context-panel):**
```css
box-shadow: 0 8px 32px #8a95a8, 0 2px 8px #a0a8b8;
```

All floating panels now use the same hard-edge shadow style for visual consistency.

#### Files Modified

| File | Changes |
|------|---------|
| `apps/web/src/style.css` | Changed dock positioning from transform to margin-based centering; unified probe-panel shadows with context-panel |
| `apps/web/index.html` | Fixed CSS file paths (`./src/styles/theme.css`, `./src/style.css`) |

---

## 2026-01-10

### Settings Panel UI Refinements

**Status:** ✅ Implemented (v0.5.1)

Follow-up refinements to the settings panel for improved visual consistency.

#### Layers Integration

Moved the Layers toggle from the topbar into the Settings panel as a fourth category tab.

**Before:**
- Layers button in topbar (separate popover)
- 3 settings categories: Display, Environmental, Physics

**After:**
- Layers integrated into Settings
- 4 categories in order: **physics → environmental → display → layers**
- Topbar is cleaner with fewer buttons

#### Font Styling Consistency

Unified all text styling across the UI to match the elegant "details" and "about" buttons.

| Element | Before | After |
|---------|--------|-------|
| `button.primary` (Compute, Generate Map) | `font-weight: 600` | `font-weight: 500` |
| `.settings-header` | `font-weight: 600` | `font-weight: 500` |
| `.settings-category-btn` | `font-weight: 600` | `font-weight: 500` |
| `.settings-panel-header` | `font-weight: 600` | `font-weight: 500` |
| `.settings-title` (section headers) | `uppercase`, `font-weight: 700` | `lowercase`, `font-weight: 500` |

All text now follows consistent styling:
- **lowercase** text transform
- **font-weight: 500** (lighter, elegant)
- **letter-spacing: 0.08em** (consistent spacing)

#### Files Modified

| File | Changes |
|------|---------|
| `apps/web/index.html` | Removed Layers button from topbar, added Layers category + panel, lowercase text throughout |
| `apps/web/src/style.css` | Updated font-weight to 500, lowercase transforms, consistent letter-spacing |
| `apps/web/src/main.ts` | Updated category type to include 'layers' |

---

### Settings Panel UI Redesign

**Status:** ✅ Implemented (v0.5.0)

Redesigned the settings popover to reduce visual clutter with a tabbed category system and animated slide-out panels.

#### New Design

The gear button now opens a compact popover with 3 vertical category buttons. Clicking a category opens a secondary slide-out panel to the left with that category's settings.

```
┌─────────────────────┐          ┌─────────────────────┐
│  Settings Slide     │  ←──────  │    Settings         │
│  (appears LEFT)     │  12px gap │                     │
│                     │          │  ┌─────────────────┐ │
│  [Panel Content]    │          │  │   Display       │ │  ← raised
│                     │          │  └─────────────────┘ │
│                     │          │  ┌─────────────────┐ │
│                     │          │  │  Environmental  │ │  ← raised
│                     │          │  └─────────────────┘ │
│                     │          │  ┌─────────────────┐ │
│                     │          │  │    Physics      │ │  ← raised
│                     │          │  └─────────────────┘ │
└─────────────────────┘          └─────────────────────┘
```

#### Interaction Flow

1. **Click gear button**: Settings popover appears with 3 raised category buttons
2. **Hover button**: Button becomes sunken (pressed appearance)
3. **Click button**: Button gets blue ring, slide-out panel animates in from the right
4. **Click same button again**: Slide-out panel closes
5. **Click outside**: Both popovers close

#### Button States (Dock-Style Neumorphic)

| State | Visual Effect |
|-------|---------------|
| **Default** | Raised (outer shadow) |
| **Hover** | Sunken (inset shadow, scale 0.98) |
| **Active** | Deeper sunken (scale 0.96) |
| **Selected** | Sunken with inset blue ring |

#### Category Contents

| Category | Settings |
|----------|----------|
| **Display** | Frequency Weighting, Display Band, Contour Mode, Band Step, Auto-scale |
| **Environmental** | Temperature, Humidity, Pressure, Speed of Sound, Atmospheric Model |
| **Physics** | Ground Reflection, Ground Type, Mixed Ground Model, Ground Algorithm, Spreading Loss, Barrier Side Diffraction |

#### Files Modified

| File | Changes |
|------|---------|
| `apps/web/index.html` | Restructured settings popover with category buttons + separate slide popup |
| `apps/web/src/style.css` | Added ~200 lines for category buttons and slide popup styles |
| `apps/web/src/main.ts` | Updated `wireSettingsPopover()` with slide popup positioning and state management |

---

### Physics Audit Fixes: Issues #5, #6, #12

**Status:** ✅ Implemented (v0.4.8)

Resolved three physics issues identified in the audit, improving acoustic accuracy.

#### Issue #5: Side Diffraction Geometry Oversimplified

**Problem:** Horizontal (around-the-end) diffraction was using incorrect edge height:
```typescript
// OLD: Clamped to source/receiver heights (wrong for horizontal diffraction)
edgeZ = Math.min(edgeHeight, Math.max(source.z, receiver.z))
```

**Root Cause:** Horizontal diffraction around barrier ends should occur at ground level (`z = groundElevation`), not at the barrier height. This is fundamentally different from vertical (over-top) diffraction.

**Fix applied:** Updated `computeSidePathDelta()` in `/packages/engine/src/compute/index.ts`:
```typescript
// NEW: Horizontal diffraction goes AROUND at ground level
const edgeZ = groundElevation;  // Typically 0 for flat terrain
```

**Tests added:** 5 new tests verifying side diffraction path calculations.

---

#### Issue #6: Delany-Bazley Extrapolation Outside Valid Range

**Problem:** The Delany-Bazley model was used without bounds checking on the `f/σ` ratio. Valid range is 0.01 < f/σ < 1.0.

**Impact:**
- Low frequencies over hard ground (`f/σ < 0.01`): Model outputs nonsense
- High frequencies over soft ground (`f/σ > 1.0`): Extrapolation becomes inaccurate

**Fix applied:** Added bounds checking with Miki (1990) extension in `/packages/engine/src/propagation/ground.ts`:
```typescript
function mikiNormalizedImpedance(fHz: number, sigma: number): Complex {
  const ratio = fHz / sigma;
  // Miki (1990) extension for high f/σ ratios
  const re = 1 + 5.50 * Math.pow(ratio, -0.632);
  const im = -8.43 * Math.pow(ratio, -0.632);
  return complex(re, im);
}
```

For `f/σ < 0.01`, returns high impedance (near-hard ground behavior).

**Tests added:** 5 new tests verifying impedance model bounds and continuity.

---

#### Issue #12: Mixed Ground Sigma Calculation Arbitrary

**Problem:** Mixed ground type used an arbitrary interpolation formula that was neither ISO-compliant nor physically accurate.

**Solution:** Implemented **two user-selectable models**:

| Model | Formula | Use Case |
|-------|---------|----------|
| **ISO 9613-2** | `σ = σ_soft / G` (G-factor linear) | Regulatory compliance |
| **Logarithmic** | `log(σ) = G·log(σ_soft) + (1-G)·log(σ_hard)` | Ray-tracing accuracy |

**Schema addition:** Added `groundMixedSigmaModel` to `PropagationConfigSchema`:
```typescript
groundMixedSigmaModel: GroundMixedSigmaModelSchema.default('iso9613'),
```

**UI addition:** New "Mixed Ground Model" dropdown in Settings → Simulation Physics. Visible only when Ground Type is "Mixed".

**Tests added:** 7 new tests verifying both interpolation models.

---

#### Files Modified

| File | Changes |
|------|---------|
| `packages/engine/src/compute/index.ts` | Fixed side diffraction geometry, removed unused functions |
| `packages/engine/src/propagation/ground.ts` | Added Miki extension, dual sigma models, bounds checking |
| `packages/core/src/schema/index.ts` | Added `GroundMixedSigmaModelSchema`, new config field |
| `packages/engine/tests/physics-validation.spec.ts` | Added 17 new tests |
| `apps/web/index.html` | Added Mixed Ground Model dropdown |
| `apps/web/src/main.ts` | Wired up new dropdown with event handlers |
| `docs/physics_audit.md` | Updated status: 13 resolved, 7 pending |

---

## 2026-01-09

### Environmental Conditions Settings

**Status:** ✅ Implemented (v0.4.7)

Added user-controllable environmental conditions that affect acoustic propagation calculations. This resolves **Physics Audit Issue #18** (Speed of Sound Constant vs Formula Mismatch).

#### Features

- **Temperature** (°C): -10 to 40, default 20°C
- **Relative Humidity** (%): 10 to 100, default 50%
- **Atmospheric Pressure** (kPa): 95 to 108, default 101.325 kPa (sea level)
- **Derived Speed of Sound** display: calculated as `c = 331.3 + 0.606 × T`

#### How It Works

Environmental values are passed to the probe worker and noise map calculations, affecting:
- Atmospheric absorption (temperature and humidity dependent)
- Wavelength-dependent calculations via speed of sound

When any environmental value changes, the scene recalculates automatically.

#### Technical Details

- Added Environmental Conditions section to settings popover (`index.html`)
- Added `meteoState` object to store user values (`main.ts`)
- Added `calculateSpeedOfSound()`, `updateSpeedOfSoundDisplay()`, `getMeteoConfig()` helper functions
- Event handlers with validation and clamping for all three inputs
- Updated `buildProbeRequest()` to use `getMeteoConfig()` instead of hardcoded values

---

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
