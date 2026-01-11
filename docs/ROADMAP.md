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
> **Target:** v0.5.0

### Rationale

GeoNoise currently offers many physics settings (ground model, atmospheric absorption, barrier diffraction, etc.) that users must configure individually. This creates two problems:

1. **For engineers needing ISO compliance:** They must manually ensure all settings match ISO 9613-2 requirements
2. **For users wanting accuracy:** They may not know which combination of settings produces physically correct results
3. **For power users:** Custom configurations may unknowingly mix incompatible models

A **profile-based system** solves this by offering validated presets while preserving full customization.

### Proposed Profiles

#### 1. ISO 9613-2 Compliant
For regulatory compliance, environmental impact assessments, and engineering reports.

| Setting | Value | Rationale |
|---------|-------|-----------|
| Ground Model | `iso9613-eq10` | ISO 9613-2 Eq. 10 empirical formula |
| Ground Effect | Clamped ≥ 0 | ISO does not model constructive interference |
| Atmospheric Absorption | `iso9613-1` | Full ISO 9613-1 calculation |
| Barrier Model | `iso9613-2` | ISO compliant diffraction |
| Barrier + Ground | `max(Abar, Agr)` | ISO 9613-2 Section 7.4 |
| Side Diffraction | `off` | ISO assumes infinite barriers |
| Max Reflections | 0 | Conservative (no reflections) |
| Source Level Convention | Sound Power Level (Lw) | ISO standard |

#### 2. Physically Accurate
For research, detailed analysis, and scenarios where interference effects matter.

| Setting | Value | Rationale |
|---------|-------|-----------|
| Ground Model | `twoRayPhasor` | Full wave interference model |
| Ground Effect | Allows negative (boost) | Physically correct interference |
| Atmospheric Absorption | `iso9613-1` | Most accurate available |
| Barrier Model | `maekawa` | Well-validated diffraction model |
| Barrier + Ground | Additive (partitioned) | Correct physics |
| Side Diffraction | `auto` | Include for short barriers |
| Max Reflections | 1 | First-order reflections |
| Coherent Summation | Enabled | Capture interference patterns |
| Source Level Convention | Configurable | Support both Lw and SPL@1m |

#### 3. Custom
User has full control. Profile dropdown auto-switches to "Custom" when any setting deviates from a preset.

### UI Design

```
┌─────────────────────────────────────────────────────────┐
│  Calculation Profile                                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ▼ Physically Accurate                           │   │
│  │   ○ ISO 9613-2 Compliant                        │   │
│  │   ● Physically Accurate                         │   │
│  │   ○ Custom                                      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ⓘ Using two-ray phasor ground model with coherent     │
│    summation. Ground interference effects are modeled.  │
│                                                         │
│  ▸ Advanced Settings                                    │
│    (Expanding this shows individual settings and        │
│     auto-switches profile to "Custom" if changed)       │
└─────────────────────────────────────────────────────────┘
```

### Settings Affected by Profile

| Category | Setting | ISO Profile | Accurate Profile |
|----------|---------|-------------|------------------|
| **Ground** | Model | `iso9613-eq10` | `twoRayPhasor` |
| | Allow boost | No | Yes |
| | Type | User choice | User choice |
| **Atmosphere** | Model | `iso9613-1` | `iso9613-1` |
| | Use actual path length | No (direct) | Yes (diffracted) |
| **Barriers** | Model | `iso9613-2` | `maekawa` |
| | Side diffraction | Off | Auto |
| | Thick barrier formula | N=20, cap 20dB | N=40, cap 25dB |
| **Barrier+Ground** | Interaction | `max(Abar, Agr)` | Additive |
| **Propagation** | Coherent summation | No | Yes |
| | Max reflections | 0 | 1 |
| **Sources** | Level convention | Lw (power) | Configurable |

### Implementation Plan

#### Phase 1: Core Profile System
- [ ] Define `CalculationProfile` type in schema
- [ ] Create `ISO_9613_PROFILE` and `ACCURATE_PROFILE` constants
- [ ] Add `applyProfile(profile)` function that sets all config values
- [ ] Add profile dropdown to Settings panel

#### Phase 2: Auto-Detection
- [ ] Implement `detectProfile(config)` that returns matching profile or 'custom'
- [ ] Auto-switch dropdown to "Custom" when user changes any setting
- [ ] Show info tooltip explaining current profile behavior

#### Phase 3: Profile Persistence
- [ ] Save selected profile in scene JSON
- [ ] Restore profile on scene load
- [ ] Handle profile migration for older scenes

#### Phase 4: Documentation
- [ ] Add profile descriptions to PHYSICS_REFERENCE.md
- [ ] Create comparison table showing expected differences
- [ ] Add "Which profile should I use?" guidance

### Technical Notes

1. **Profile is a shortcut, not a constraint:** User can always override individual settings (which switches to Custom)

2. **Backward compatibility:** Existing scenes without a profile field default to behavior matching their current settings

3. **Validation on save:** When exporting for regulatory purposes, warn if profile is not ISO-compliant

4. **Future profiles:** Could add more profiles later (e.g., "CNOSSOS-EU", "FHWA TNM", "Nord2000")

### Related Issues from Physics Audit

This feature addresses the root cause of Issue #2 (Two-Ray Ground Model Sign Inconsistency):
- ISO profile: Uses legacy model with `max(0, Agr)` - compliant with standard
- Accurate profile: Uses two-ray model with negative values allowed - physically correct
- Both behaviors are intentional and correct for their respective use cases

---

## 🔮 Future Enhancements
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

**File:** `packages/engine/src/propagation/ground.ts:59`
**Status:** ⬜ Open

**Problem:** Discontinuity in ground wave function at threshold. Should use smooth transition.

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
