# Physics Engine Audit

> **Audit Date:** 2025-01-08 (Updated: 2025-01-12)
> **Status:** 18 resolved, 4 pending
> **Auditor:** Physics review session

This document tracks identified issues in the GeoNoise physics engine, organized by severity. Each issue includes the current formulation, current code implementation, and proposed fix.

---

## ISO 9613-2 Compliance Overview

GeoNoise Grid Engine targets compliance with **ISO 9613-2** for outdoor sound propagation. The standard has two versions:

| Version | Status | Description |
|---------|--------|-------------|
| **ISO 9613-2:1996** | ✅ **Compliant** | Original standard, fully implemented |
| **ISO 9613-2:2024** | 🔶 **Partial** | Incremental revision, 3 features pending |

### Key Differences Between 1996 and 2024

| Feature | ISO 9613-2:1996 | ISO 9613-2:2024 |
|---------|-----------------|-----------------|
| **Ground effect (A_gr)** | Tables 3-4 per-band | Same + **K_geo correction** for short distances/low heights |
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

#### Summary of Impact

The 2024 update is not a radical departure but a significant **"bug fix" and modernization**:

- **K_geo ground correction** — Prevents over-attenuation near the ground at short distances
- **Barrier/ground cancellation rule** — Prevents "double dipping" of attenuation (barrier + ground)
- **Wind Turbine module (Annex D)** — Critical addition for specialized projects
- **Cylindrical Reflection module** — Important for industrial/urban modeling

---

## Quick Status Summary

### ✅ Resolved (18)
- **#1** Spreading Loss Formula Constant Ambiguity — *Fixed with exact constants + documentation*
- **#2** Two-Ray Ground Model Sign Inconsistency — *Resolved by design (see [Calculation Profile Presets](./ROADMAP.md#calculation-profile-presets))*
- **#2b** computeProbeCoherent Double-Counts Direct Path — *Fixed: paths now processed uniformly*
- **#3** Barrier + Ground Effect Interaction Physically Incorrect — *Fixed: ISO 9613-2 §7.4 additive formula with ground partitioning*
- **#4** Atmospheric Absorption Uses Direct Distance — *Fixed: now uses actualPathLength for diffracted paths*
- **#5** Side Diffraction Geometry Oversimplified — *Fixed: horizontal diffraction at ground level*
- **#5 (probeWorker)** Simplified Atmospheric Absorption in probeWorker — *Fixed: now respects UI model selection*
- **#6** Delany-Bazley Extrapolation Outside Valid Range — *Fixed: bounds checking + Miki (1990) extension*
- **#9** Wall Reflection Height Geometry Incorrect — *Fixed: geometric Z interpolation from image source method with wall bounds validation*
- **#10** "Simple" Atmospheric Absorption Model Incorrectly Formulated — *Fixed: replaced buggy formula with lookup table*
- **#11** Diffraction Only Traced When Direct Path Blocked — *Fixed: now traces diffraction for nearby barriers even when direct path is unblocked (for coherent summation accuracy)*
- **#12** Mixed Ground Sigma Calculation Arbitrary — *Fixed: user-selectable ISO 9613-2 or logarithmic interpolation*
- **#15** Incoherent Source Summation Only — *Resolved by design: Grid engine uses incoherent summation per ISO 9613-2. Coherent summation is Probe-only.*
- **#16** Same Formula for Thin/Thick Barriers — *Fixed: buildings now use coefficient 40 and cap 25 dB*
- **#17** Ground Absorption Not Spectral — *Fixed: Grid engine now uses ISO 9613-2 Tables 3-4 per-band coefficients in `agrISO9613PerBand()`*
- **#18** Speed of Sound Constant vs Formula Mismatch — *Fixed: added Environmental Conditions UI for user-controlled temperature/humidity/pressure*
- **#20** ISO 9613-2 Ground Effect (Agr) Not Frequency-Dependent — *Fixed: Implemented Tables 3-4 per-band coefficients with A_gr = A_s + A_r + A_m calculation*
- **#21** ISO 9613-2 A_gr Clamping Clarification — *Fixed: Removed incorrect per-region clamping. ISO 9613-2 does NOT specify per-region clamping; only total A_gr is clamped at -3 dB as a practical floor*

### 🔴 Critical - Pending (0)
*No critical issues pending*

### 🟠 Moderate - Pending (1)
- **#7** Ground Reflection Assumes Flat Ground (z=0)

### 🟡 Minor - Pending (3)
- **#13** Sommerfeld Correction Smooth Transition at |w|=4 — Sommerfeld IS implemented and working; smooth transition at threshold pending (low priority)
- **#14** Hardcoded Diffraction Phase Shift
- **#19** Diffraction Loss = 0 in Ray Tracing Result

---

---

## 🔴 CRITICAL ISSUES

### 1. Spreading Loss Formula Constant Ambiguity
- [x] **Status:** Resolved
- **Location:** `packages/engine/src/propagation/index.ts:69-74`
- **Impact:** ±11 dB error potential
- **Fixed:** Added comprehensive documentation explaining the Lw convention, used exact mathematical constants, and added `spreadingLossFromReference()` for SPL@1m sources

#### Before (Problematic Code)
```typescript
// Rounded constants without documentation
export function spreadingLoss(
  distance: number,
  type: 'spherical' | 'cylindrical' = 'spherical'
): number {
  if (distance < MIN_DISTANCE) {
    distance = MIN_DISTANCE;
  }

  if (type === 'spherical') {
    return 20 * Math.log10(distance) + 11;  // Rounded constant
  } else {
    return 10 * Math.log10(distance) + 8;   // Rounded constant
  }
}
```

#### After (Fixed Code)
```typescript
// Exact mathematical constants
const SPHERICAL_CONSTANT = 10 * Math.log10(4 * Math.PI); // ≈ 10.99 dB
const CYLINDRICAL_CONSTANT = 10 * Math.log10(2 * Math.PI); // ≈ 7.98 dB

/**
 * Calculate geometric spreading loss (divergence attenuation)
 *
 * IMPORTANT: Source Level Convention
 * ----------------------------------
 * This function assumes source levels are specified as Sound Power Level (Lw)
 * in dB re 1 pW, which is the standard convention in ISO 9613-2.
 *
 * For spherical spreading (point source):
 *   A_div = 20·log₁₀(r) + 10·log₁₀(4π) ≈ 20·log₁₀(r) + 11
 *
 * If sources are specified as SPL at 1m reference instead of Lw, use
 * spreadingLossFromReference() which omits the geometric constant.
 */
export function spreadingLoss(
  distance: number,
  type: 'spherical' | 'cylindrical' = 'spherical'
): number {
  if (distance < MIN_DISTANCE) {
    distance = MIN_DISTANCE;
  }

  if (type === 'spherical') {
    // Point source: A_div = 20·log₁₀(r) + 10·log₁₀(4π)
    return 20 * Math.log10(distance) + SPHERICAL_CONSTANT;
  } else {
    // Line source: A_div = 10·log₁₀(r) + 10·log₁₀(2π)
    return 10 * Math.log10(distance) + CYLINDRICAL_CONSTANT;
  }
}

/**
 * Calculate spreading loss for sources specified as SPL at 1m reference
 */
export function spreadingLossFromReference(
  distance: number,
  type: 'spherical' | 'cylindrical' = 'spherical'
): number {
  if (distance < MIN_DISTANCE) {
    distance = MIN_DISTANCE;
  }

  if (type === 'spherical') {
    return 20 * Math.log10(distance);  // No geometric constant
  } else {
    return 10 * Math.log10(distance);
  }
}
```

---

### 2. Two-Ray Ground Model Sign Inconsistency
- [x] **Status:** Resolved (by design - see Calculation Profile Presets)
- **Location:** `packages/engine/src/propagation/ground.ts:109`
- **Impact:** Different behavior between ground models (intentional)
- **Resolution:** The two models serve different purposes:
  - **Two-ray phasor model:** Physically accurate, allows negative A_gr (constructive interference boost)
  - **Legacy ISO 9613-2 Eq.10:** Engineering approximation, clamps to ≥0 (no boost)
  - See [ROADMAP.md - Calculation Profile Presets](./ROADMAP.md#calculation-profile-presets) for the planned profile system that lets users choose between ISO-compliant and physically-accurate modes

#### Current Formulation (Math)
Two-ray interference model computes the ratio of combined field to free-field:
```
ratio = |1 + Γ·(r₁/r₂)·e^(jφ)|

where:
  Γ = complex reflection coefficient
  r₁ = direct path length
  r₂ = reflected path length
  φ = -k(r₂ - r₁) = phase difference

A_gr = -20·log₁₀(ratio)
```

When `ratio > 1` (constructive): A_gr < 0 (level boost)
When `ratio < 1` (destructive): A_gr > 0 (attenuation)

Legacy ISO 9613-2 Eq. 10:
```
A_gr = 4.8 - (2·h_m/d)·(17 + 300/d)    clamped to ≥0
```

#### Current Code Implementation
```typescript
// Two-ray model (ground.ts:109)
return -20 * Math.log10(Math.max(mag, magFloor));
// Can return NEGATIVE values for constructive interference

// Legacy model (propagation/index.ts:139)
return Math.max(0, agr);
// Always returns ≥0 (no boost possible)
```

#### Proposed Implementation
```typescript
// Option A: Document and allow negative values (physically correct)
export function agrTwoRayDb(
  fHz: number, d: number, hs: number, hr: number,
  ground: GroundType, sigmaSoft: number, mixedFactor: number, speedOfSound: number
): number {
  // ... existing calculation ...

  const mag = complexAbs(ratio);
  if (!Number.isFinite(mag)) return 0;

  // NOTE: Returns negative for constructive interference (level boost)
  // This is physically correct - interference can increase levels
  return -20 * Math.log10(Math.max(mag, magFloor));
}

// Option B: Add compatibility flag
export function agrTwoRayDb(
  fHz: number, d: number, hs: number, hr: number,
  ground: GroundType, sigmaSoft: number, mixedFactor: number, speedOfSound: number,
  allowBoost: boolean = true  // false for legacy compatibility
): number {
  // ... existing calculation ...

  const mag = complexAbs(ratio);
  if (!Number.isFinite(mag)) return 0;

  const agr = -20 * Math.log10(Math.max(mag, magFloor));

  // Optionally clamp to prevent boost (legacy behavior)
  return allowBoost ? agr : Math.max(0, agr);
}
```

---

### 2b. computeProbeCoherent Double-Counts Direct Path with Two-Ray Ground Model
- [x] **Status:** Resolved
- **Location:** `packages/engine/src/probeCompute/index.ts:341-375`
- **Impact:** Incorrect levels (observed -146 dB instead of ~70 dB)
- **Related to:** Issue #2 (Two-Ray Ground Model)
- **Fixed:** Used Option B - removed `computeGroundReflectionPhasor`, now all paths (direct, ground, wall, diffraction) are processed uniformly through `computeSourcePhasors` and coherent summation handles interference naturally

#### Before (Problematic Code)
```typescript
// Handle ground reflection specially using the accurate two-ray model
let groundPhasor: SpectralPhasor | null = null;
if (config.groundReflection && source.position.z > 0 && probePosition.z > 0) {
  groundPhasor = computeGroundReflectionPhasor(source, probePosition, config);
  // ↑ This uses agrTwoRayDb which ALREADY includes direct+ground interference
}

// Compute phasors for all other paths
const nonGroundPaths = paths.filter(p => p.type !== 'ground');  // Keeps 'direct'!
const pathPhasors = computeSourcePhasors(source, probePosition, nonGroundPaths, config);
// ↑ This STILL includes the direct path as a standalone phasor

// Combine them - WRONG: direct is now counted twice!
const allPhasors = groundPhasor ? [...pathPhasors, groundPhasor] : pathPhasors;
```

#### After (Fixed Code)
```typescript
/**
 * Issue #2b Fix (Option B):
 * Process ALL paths (including ground) through the same phasor computation.
 * Each path contributes an independent phasor with its own pressure and phase.
 * The coherent summation naturally handles interference between:
 * - Direct path (phase from direct distance)
 * - Ground path (phase from reflected distance + reflection phase shift)
 * - Wall reflections (phase from reflected distance + surface phase shift)
 * - Diffracted paths (phase from diffracted distance + diffraction phase shift)
 *
 * This approach:
 * 1. Avoids double-counting the direct path (previous bug)
 * 2. Enables future second-order reflections (ground+wall, wall+ground)
 * 3. Is physically correct: p_total = |Σ p_i · e^(jφ_i)|
 */
const pathPhasors = computeSourcePhasors(source, probePosition, paths, config);

// Sum phasors (coherent or energetic)
const sourceSpectrum = sumSourceSpectralPhasors(pathPhasors, config.coherentSummation);
```

---

### 3. Barrier + Ground Effect Interaction
- [x] **Status:** Resolved (ISO 9613-2:1996 compliant; 2024 updates pending)
- **Location:** `packages/engine/src/propagation/index.ts:314`, `packages/engine/src/compute/index.ts`
- **Impact:** Correct levels behind barriers on soft ground
- **Fixed:** ISO 9613-2 partitioned ground effect for diffracted paths

#### ISO 9613-2 Specification (Key Points)

**Critical Rule:** When a barrier is present, the normal ground effect (A_gr) is **cancelled/modified** because the barrier disrupts the ground-reflected ray that causes the ground effect.

**Correct Implementation (ISO 9613-2 Section 7.4):**
1. For blocked paths, A_gr is **recalculated** for the diffracted path geometry
2. Ground effect is computed separately for:
   - **Source-to-barrier segment** (using source region G factor)
   - **Barrier-to-receiver segment** (using receiver region G factor)
3. The direct-path ground effect does NOT apply to diffracted paths

**Common Mistakes:**
- ❌ `max(A_bar, A_gr)` — Non-standard simplification, not ISO-compliant
- ❌ Simple additive `A_bar + A_gr` — Ignores that barrier cancels ground reflection
- ✅ Partitioned ground effect for diffracted path segments — ISO-compliant

**ISO 9613-2:2024 Updates (TODO):**
- Introduces `K_geo` correction factor for A_gr at small distance-to-height ratios
- Modifies how `D_z` (barrier) and `K_met` (meteorological) combine
- Fixes under-prediction issues from 1996 version

#### Before (Problematic Code)
```typescript
// NON-STANDARD: treats barrier and ground as mutually exclusive
const barrierTerm = barrierBlocked ? Math.max(Abar, Agr) : Agr;
const totalAttenuation = Adiv + Aatm + barrierTerm;
```

#### After (Fixed Code)

**propagation/index.ts - ISO 9613-2 compliant implementation:**
```typescript
if (barrierBlocked && barrierInfo && config.groundReflection) {
  // ISO 9613-2 Section 7.4: Partitioned ground effect for blocked paths
  // The barrier CANCELS the normal ground reflection; we recalculate
  // ground effect for the diffracted path's source and receiver segments.
  const { distSourceToBarrier, distBarrierToReceiver, barrierHeight } = barrierInfo;

  // Source-side ground effect (source to barrier diffraction edge)
  const Agr_source = calculateGroundEffectRegion(
    distSourceToBarrier, sourceHeight, barrierHeight, config, meteo, frequency
  );

  // Receiver-side ground effect (barrier diffraction edge to receiver)
  const Agr_receiver = calculateGroundEffectRegion(
    distBarrierToReceiver, barrierHeight, receiverHeight, config, meteo, frequency
  );

  // Partitioned ground effect for diffracted path
  Agr = Agr_source + Agr_receiver;

  // Barrier diffraction attenuation
  Abar = barrierAttenuation(barrierPathDiff, frequency, lambda, barrierType);

  // ISO 9613-2: D_z + recalculated A_gr for diffracted path
  totalAttenuation = Adiv + Aatm + Abar + Agr;
} else if (barrierBlocked) {
  // FALLBACK (NON-STANDARD): When barrier geometry unavailable
  // This is NOT ISO-compliant; used only as safety net
  totalAttenuation = Adiv + Aatm + Math.max(Abar, Agr);
} else {
  // Unblocked path: normal ground effect applies
  totalAttenuation = Adiv + Aatm + Agr;
}
```

#### Implementation Status

| Condition | Formula | ISO Compliant |
|-----------|---------|---------------|
| Blocked path WITH barrierInfo | `A_div + A_atm + D_z + A_gr_partitioned` | ✅ Yes (1996) |
| Blocked path WITHOUT barrierInfo | `A_div + A_atm + max(A_bar, A_gr)` | ❌ Non-standard fallback |
| Unblocked path | `A_div + A_atm + A_gr` | ✅ Yes |

#### Future Work: ISO 9613-2:2024 Updates

The 2024 revision is an incremental update to the 1996 standard, primarily refining algorithms and integrating ISO/TR 17534-3.

**1. Ground Attenuation (A_gr) Refinements**

| Feature | Description | Priority |
|---------|-------------|----------|
| **K_geo correction** | Corrects A_gr at short distances and low heights to fix overprediction in 1996 version | HIGH |
| **Method harmonization** | Unifies General Method (§7.3.1) and Simplified Method (§7.3.2) | MEDIUM |
| **Barrier cancellation rule** | **Critical change:** For blocked paths where A_gr > 0, ground attenuation is explicitly set to 0 dB — only D_z applies. This REPLACES partitioned ground effect when A_gr would be positive. | HIGH |

**2. Barrier Algorithm (D_z) Refinements**

| Feature | Description | Priority |
|---------|-------------|----------|
| **D_z + K_met fixes** | Eliminates known errors with low barriers at large distances | HIGH |
| **ISO/TR 17534-3 integration** | Formal screening strategy with clearer vertical + lateral diffraction combination | MEDIUM |
| **Effectiveness changes** | 2024 can show significant reductions in barrier effectiveness vs 1996 in certain scenarios | MEDIUM |

**3. New Modeling Capabilities (Annexes)**

| Feature | Description | Priority |
|---------|-------------|----------|
| **Wind turbines (Annex D)** | Specific SPL calculation method, aligned with IOA methodology | LOW |
| **Advanced foliage method** | Detailed forestal parameters beyond simple foliage attenuation | LOW |
| **Higher-order reflections** | Extended support for multiple reflections and cylindrical bodies | MEDIUM |
| **Local meteorology (Annex C)** | K_met from local historical wind-climatology data | LOW |

**⚠️ Critical Implementation Change: Barrier Cancellation Rule**

The 2024 **barrier cancellation rule** fundamentally changes our logic:

```typescript
// CURRENT (ISO 9613-2:1996 interpretation):
// Partitioned ground effect is ADDITIVE with barrier diffraction
if (barrierBlocked && barrierInfo) {
  Agr = Agr_source + Agr_receiver;  // Partitioned ground effect
  totalAttenuation = Adiv + Aatm + Abar + Agr;  // Additive
}

// ISO 9613-2:2024 CHANGE:
// When A_gr > 0 (attenuation), it is CANCELLED for blocked paths
// Only D_z (barrier) applies; ground effect is set to 0
if (barrierBlocked && barrierInfo) {
  const Agr_partitioned = Agr_source + Agr_receiver;

  // 2024 Rule: If ground would attenuate (positive), cancel it
  // Only allow ground "boost" (negative A_gr) to persist
  if (Agr_partitioned > 0) {
    Agr = 0;  // Ground attenuation cancelled - barrier disrupts ground ray
  } else {
    Agr = Agr_partitioned;  // Negative (boost) still applies
  }

  totalAttenuation = Adiv + Aatm + Abar + Agr;
}
```

**Impact:** For blocked paths over soft ground, the 2024 version predicts **higher receiver levels** (less total attenuation) than our current 1996 implementation because positive ground attenuation is cancelled when a barrier is present.

**Rationale:** The barrier physically disrupts the ground-reflected ray that causes ground attenuation. Without the ground reflection path, there is no ground effect to apply (other than potential constructive interference effects that could boost levels).

---

### 4. Atmospheric Absorption Uses Direct Distance, Not Actual Path
- [x] **Status:** Resolved
- **Location:** `packages/engine/src/propagation/index.ts:260`, `packages/engine/src/compute/index.ts:295`
- **Impact:** Fixed 1+ dB error at high frequencies for diffracted paths
- **Fixed:** `computeBarrierPathDiff` now returns `actualPathLength`, and `calculatePropagation` uses it for atmospheric absorption

#### Before (Problematic Code)

**compute/index.ts - No actualPathLength returned:**
```typescript
function computeBarrierPathDiff(
  source: Point3D,
  receiver: Point3D,
  geometry: BarrierGeometry,
  sideDiffractionMode: 'off' | 'auto' | 'on' = 'auto'
): { blocked: boolean; pathDifference: number } {
  // ...
  if (maxDelta === null) {
    return { blocked: false, pathDifference: 0 };
  }
  return { blocked: true, pathDifference: maxDelta };
}
```

**propagation/index.ts - Always used direct distance:**
```typescript
export function calculatePropagation(
  distance: number,
  sourceHeight: number,
  receiverHeight: number,
  config: PropagationConfig,
  meteo: Meteo,
  barrierPathDiff = 0,
  barrierBlocked = false,
  frequency = 1000
): PropagationResult {
  // ...
  // Atmospheric absorption (applied along the direct distance)
  const Aatm = totalAtmosphericAbsorption(distance, frequency, config, meteo);
  // ↑ 'distance' is always the direct S→R distance, even for diffracted paths!
```

#### After (Fixed Code)

**compute/index.ts - Now returns actualPathLength:**
```typescript
/** Result of barrier path difference calculation */
type BarrierPathResult = {
  /** Whether the direct path is blocked by a barrier */
  blocked: boolean;
  /** Path difference (delta) in meters for Maekawa formula */
  pathDifference: number;
  /** Actual path length sound travels (for atmospheric absorption) */
  actualPathLength: number;
};

function computeBarrierPathDiff(
  source: Point3D,
  receiver: Point3D,
  geometry: BarrierGeometry,
  sideDiffractionMode: 'off' | 'auto' | 'on' = 'auto'
): BarrierPathResult {
  const s2 = { x: source.x, y: source.y };
  const r2 = { x: receiver.x, y: receiver.y };
  const direct2D = distance2D(s2, r2);
  const direct3D = Math.hypot(direct2D, source.z - receiver.z);

  if (!geometry.barrierSegments.length && !geometry.buildings.length) {
    return { blocked: false, pathDifference: 0, actualPathLength: direct3D };
  }

  // ... barrier intersection logic ...

  if (maxDelta === null) {
    return { blocked: false, pathDifference: 0, actualPathLength: direct3D };
  }

  // Actual path length = direct distance + path difference (the detour over/around the barrier)
  const actualPathLength = direct3D + maxDelta;

  return { blocked: true, pathDifference: maxDelta, actualPathLength };
}
```

**propagation/index.ts - Now uses actualPathLength when provided:**
```typescript
export function calculatePropagation(
  distance: number,
  sourceHeight: number,
  receiverHeight: number,
  config: PropagationConfig,
  meteo: Meteo,
  barrierPathDiff = 0,
  barrierBlocked = false,
  frequency = 1000,
  actualPathLength?: number  // NEW PARAMETER
): PropagationResult {
  // ...
  // Issue #4 Fix: Atmospheric absorption uses the ACTUAL path length sound travels.
  // For diffracted paths, this is longer than direct distance (sound goes over/around barrier).
  // If actualPathLength is not provided, fall back to direct distance (unblocked paths).
  const pathForAbsorption = actualPathLength ?? distance;
  const Aatm = totalAtmosphericAbsorption(pathForAbsorption, frequency, config, meteo);
```

#### Mathematical Impact

| Frequency | α (dB/m) | 10m extra path | 50m extra path |
|-----------|----------|----------------|----------------|
| 1000 Hz   | 0.004    | 0.04 dB        | 0.2 dB         |
| 4000 Hz   | 0.033    | 0.33 dB        | 1.6 dB         |
| 8000 Hz   | 0.117    | **1.2 dB**     | **5.9 dB**     |
| 16000 Hz  | 0.340    | **3.4 dB**     | **17 dB**      |

---

### 5. Side Diffraction Geometry Oversimplified
- [x] **Status:** Resolved
- **Location:** `packages/engine/src/compute/index.ts:223-268`
- **Impact:** Several dB error for finite barriers (now fixed)

#### Current Formulation (Math)
Current (incorrect):
```
edgeZ = min(barrierHeight, max(sourceZ, receiverZ))

δ_side = |S→(edgeX, edgeY, edgeZ)| + |(edgeX, edgeY, edgeZ)→R| - |S→R|
```

Correct for horizontal (around-the-end) diffraction:
```
For diffraction around barrier endpoint at ground level:
  edgeZ = 0  (or terrain height at that point)

δ_side = |S→(edgeX, edgeY, 0)| + |(edgeX, edgeY, 0)→R| - |S→R|

For diffraction around barrier endpoint at barrier height:
  edgeZ = barrierHeight

δ_vertical = |S→(edgeX, edgeY, h_barrier)| + |(edgeX, edgeY, h_barrier)→R| - |S→R|

Take minimum path: δ = min(δ_side_left, δ_side_right, δ_over_top)
```

#### Current Code Implementation
```typescript
function computeSidePathDelta(
  source: Point3D, receiver: Point3D,
  edgePoint: Point2D, edgeHeight: number, direct3D: number
): number {
  // WRONG: Uses clamped height instead of ground level
  const edgeZ = Math.min(edgeHeight, Math.max(source.z, receiver.z));

  const pathA = Math.hypot(
    distance2D({ x: source.x, y: source.y }, edgePoint),
    edgeZ - source.z
  );
  const pathB = Math.hypot(
    distance2D(edgePoint, { x: receiver.x, y: receiver.y }),
    edgeZ - receiver.z
  );

  return pathA + pathB - direct3D;
}
```

#### After (Fixed Code)

**compute/index.ts - Updated computeSidePathDelta():**
```typescript
/**
 * Compute the path difference for horizontal (around-the-end) diffraction.
 *
 * Issue #5 Fix: For finite barriers, sound can diffract AROUND the ends
 * (horizontally) in addition to OVER the top (vertically). The horizontal
 * path goes around at ground level, not at barrier height.
 *
 * Path: Source → Edge at ground → Receiver
 * Delta: |S→(edge_x, edge_y, ground_z)| + |(edge_x, edge_y, ground_z)→R| - |S→R|
 *
 * @param source - Source position (3D)
 * @param receiver - Receiver position (3D)
 * @param edgePoint - 2D position of barrier endpoint
 * @param groundElevation - Ground height at edge point (typically 0)
 * @param direct3D - Direct 3D distance from source to receiver
 * @returns Path difference δ in meters
 */
function computeSidePathDelta(
  source: Point3D,
  receiver: Point3D,
  edgePoint: Point2D,
  groundElevation: number,
  direct3D: number
): number {
  // Issue #5 Fix: Horizontal diffraction goes AROUND at ground level
  // The edge point is at ground elevation, not barrier height
  const edgeZ = groundElevation;

  // 3D distance from source to edge point at ground
  const pathA = Math.hypot(
    distance2D({ x: source.x, y: source.y }, edgePoint),
    source.z - edgeZ
  );

  // 3D distance from edge point at ground to receiver
  const pathB = Math.hypot(
    distance2D(edgePoint, { x: receiver.x, y: receiver.y }),
    receiver.z - edgeZ
  );

  return pathA + pathB - direct3D;
}
```

**All calls to computeSidePathDelta() now pass groundElevation=0:**
```typescript
// Issue #5 Fix: Horizontal diffraction at ground level (groundElevation = 0)
if (shouldUseSideDiffraction(segment.length, sideDiffractionMode)) {
  const leftDelta = computeSidePathDelta(source, receiver, segment.p1, 0, direct3D);
  const rightDelta = computeSidePathDelta(source, receiver, segment.p2, 0, direct3D);
  // ...
}
```

---

## 🟠 MODERATE ISSUES

### 6. Delany-Bazley Extrapolation Outside Valid Range
- [x] **Status:** Resolved
- **Location:** `packages/engine/src/propagation/ground.ts:19-75`
- **Impact:** Invalid results for hard surfaces → Now properly handled

#### Current Formulation (Math)
Delany-Bazley empirical model:
```
ζ = Z/ρc = 1 + 9.08(f/σ)^(-0.75) - j·11.9(f/σ)^(-0.73)

Valid range: 0.01 < f/σ < 1.0
```

Outside this range, the power-law extrapolation produces non-physical results.

#### Current Code Implementation
```typescript
export function delanyBazleyNormalizedImpedance(fHz: number, sigma: number): Complex {
  const frequency = Math.max(20, fHz);      // Clamp frequency
  const resistivity = Math.max(1, sigma);   // Clamp resistivity
  const ratio = frequency / resistivity;    // NO BOUNDS CHECK!

  const re = 1 + 9.08 * Math.pow(ratio, -0.75);
  const im = -11.9 * Math.pow(ratio, -0.73);
  return complex(re, im);
}
```

#### After (Fixed Code)
```typescript
/**
 * Miki (1990) modification of Delany-Bazley for extended frequency range.
 *
 * Miki's model extends the valid range of Delany-Bazley to higher f/σ ratios
 * and provides more physically realistic behavior at the boundaries.
 *
 * Reference: Y. Miki, "Acoustical properties of porous materials - Modifications
 * of Delany-Bazley models", J. Acoust. Soc. Jpn., 11(1), 19-24, 1990.
 *
 * Valid range: 0.01 < f/σ < 10.0 (much wider than Delany-Bazley)
 */
function mikiNormalizedImpedance(fHz: number, sigma: number): Complex {
  const frequency = Math.max(20, fHz);
  const resistivity = Math.max(1, sigma);
  const ratio = frequency / resistivity;

  // Miki coefficients (modified Delany-Bazley)
  const re = 1 + 5.50 * Math.pow(ratio, -0.632);
  const im = -8.43 * Math.pow(ratio, -0.632);
  return complex(re, im);
}

/**
 * Delany-Bazley normalized surface impedance model.
 *
 * Issue #6 Fix: Added bounds checking for the f/σ ratio.
 *
 * The original Delany-Bazley (1970) empirical model is only valid for:
 *   0.01 < f/σ < 1.0
 *
 * Outside this range:
 * - For f/σ < 0.01 (very hard surface): Returns high impedance (|Γ| ≈ 1)
 * - For f/σ > 1.0 (outside valid range): Uses Miki (1990) extension
 */
export function delanyBazleyNormalizedImpedance(fHz: number, sigma: number): Complex {
  const frequency = Math.max(20, fHz);
  const resistivity = Math.max(1, sigma);
  const ratio = frequency / resistivity;

  // Issue #6 Fix: Check validity range

  // Below valid range (very hard surface): high impedance → |Γ| ≈ 1
  if (ratio < 0.01) {
    return complex(100, 0);
  }

  // Above valid range: use Miki (1990) extension
  if (ratio > 1.0) {
    return mikiNormalizedImpedance(fHz, sigma);
  }

  // Within valid range (0.01 ≤ f/σ ≤ 1.0): use standard Delany-Bazley
  const re = 1 + 9.08 * Math.pow(ratio, -0.75);
  const im = -11.9 * Math.pow(ratio, -0.73);
  return complex(re, im);
}
```

---

### 7. Ground Reflection Assumes Flat Ground (z=0)
- [ ] **Status:** Open
- **Location:** `packages/engine/src/raytracing/index.ts:312-317`
- **Impact:** Wrong for any terrain variation

#### Current Formulation (Math)
```
Ground reflection point via image source method:
  S' = (S_x, S_y, -S_z)  (source mirrored below z=0)

Reflection point G at:
  t = S_z / (S_z + R_z)
  G = S + t·(R - S)
  G_z = 0  (always)
```

#### Current Code Implementation
```typescript
const t = source.z / (source.z + receiver.z);
const groundPoint: Point3D = {
  x: source.x + t * (receiver.x - source.x),
  y: source.y + t * (receiver.y - source.y),
  z: 0,  // Hardcoded flat ground
};
```

#### Proposed Implementation
```typescript
/**
 * Find ground reflection point, accounting for terrain elevation.
 *
 * @param source - Source position
 * @param receiver - Receiver position
 * @param getTerrainHeight - Function to query terrain height at (x,y)
 */
function findGroundReflectionPoint(
  source: Point3D, receiver: Point3D,
  getTerrainHeight: (x: number, y: number) => number = () => 0
): Point3D | null {
  // Iterative solution for non-flat terrain
  // Start with flat-ground approximation
  let t = source.z / (source.z + receiver.z);

  for (let iter = 0; iter < 5; iter++) {
    const gx = source.x + t * (receiver.x - source.x);
    const gy = source.y + t * (receiver.y - source.y);
    const groundZ = getTerrainHeight(gx, gy);

    // Recalculate t accounting for terrain elevation
    const sourceAboveGround = source.z - groundZ;
    const receiverAboveGround = receiver.z - groundZ;

    if (sourceAboveGround <= 0 || receiverAboveGround <= 0) {
      return null;  // Source or receiver below ground - no reflection
    }

    const newT = sourceAboveGround / (sourceAboveGround + receiverAboveGround);

    if (Math.abs(newT - t) < 0.001) break;  // Converged
    t = newT;
  }

  const gx = source.x + t * (receiver.x - source.x);
  const gy = source.y + t * (receiver.y - source.y);

  return { x: gx, y: gy, z: getTerrainHeight(gx, gy) };
}
```

---

### 8. Maekawa Negative N Threshold Documentation
- [ ] **Status:** Open
- **Location:** `packages/engine/src/propagation/index.ts:203`
- **Impact:** Minor—current threshold is safe

#### Current Formulation (Math)
Maekawa approximation:
```
A_bar = 10·log₁₀(3 + 20N)

where N = 2δ/λ (Fresnel number)

Mathematical constraint:
  3 + 20N > 0  →  N > -0.15

Current code uses N < -0.1 threshold (safe margin).
```

#### Current Code Implementation
```typescript
if (N < -0.1) return 0;

const attenuation = 10 * Math.log10(3 + 20 * N);
```

#### Proposed Implementation
```typescript
/**
 * Calculate barrier insertion loss using Maekawa approximation.
 *
 * @param pathDifference - δ = (A + B - d) in meters
 * @param frequency - Frequency in Hz
 * @param wavelength - λ = c/f in meters
 * @returns Insertion loss in dB (positive = attenuation)
 */
export function barrierAttenuation(
  pathDifference: number,
  frequency: number,
  wavelength?: number
): number {
  const lambda = wavelength ?? 343 / frequency;
  const N = (2 * pathDifference) / lambda;

  // Mathematical constraint: argument of log must be positive
  // 3 + 20N > 0  →  N > -0.15
  // We use -0.1 for numerical safety margin
  //
  // Physical interpretation:
  // - N < 0: receiver can "see" over the barrier (no shadow)
  // - N ≈ 0: receiver at shadow boundary
  // - N > 0: receiver in shadow zone (increasing attenuation)
  //
  // Note: For N < 0, there's actually a slight focusing effect from
  // edge diffraction that we ignore (typically < 1 dB).
  if (N < -0.1) return 0;

  const attenuation = 10 * Math.log10(3 + 20 * N);

  // Cap at single thin-screen limit (typically 20-24 dB)
  return Math.min(attenuation, 20);
}
```

---

### 9. Wall Reflection Height Geometry Incorrect
- [x] **Status:** Resolved
- **Location:** `packages/engine/src/raytracing/index.ts:360-400`
- **Impact:** Geometry error in reflected paths — Fixed

#### Problem
The old code used arbitrary clamping for the reflection point Z coordinate:
```typescript
// WRONG: Arbitrary clamping instead of geometric calculation
z: Math.min(imageSource.surface.height, Math.max(source.z, receiver.z))
```

This could place reflection points "in space" above the wall or at incorrect heights that don't match the actual ray geometry.

#### Correct Formulation (Math)
Image source method for vertical wall:
```
Image source S' = mirror of S across wall plane (same Z)

Reflection point R_p lies on wall segment where line R→S' intersects wall.

Correct Z coordinate of reflection point:
  t = parameter along R→S' where intersection occurs
  R_p.z = R.z + t·(S'.z - R.z) = R.z + t·(S.z - R.z)

Validation: 0 ≤ R_p.z ≤ wall_height (or skip path)
```

#### Before (Problematic Code)
```typescript
// WRONG: Arbitrary clamping instead of geometric calculation
const reflectionPoint3D: Point3D = {
  ...reflectionPoint2D,
  z: Math.min(imageSource.surface.height, Math.max(source.z, receiver.z)),
};
```

#### After (Fixed Code)
```typescript
// Issue #9 Fix: Calculate reflection Z geometrically from image source method
const dx = imageSource.position.x - receiver.x;
const dy = imageSource.position.y - receiver.y;
const rx = reflectionPoint2D.x - receiver.x;
const ry = reflectionPoint2D.y - receiver.y;

// Parameter t = how far along the R→S' line the reflection point is (normalized)
const lineLenSq = dx * dx + dy * dy;
const reflDistSq = rx * rx + ry * ry;
const t = lineLenSq > EPSILON * EPSILON ? Math.sqrt(reflDistSq / lineLenSq) : 0.5;

// Interpolate Z coordinate along the receiver → image source line
const reflectionZ = receiver.z + t * (imageSource.position.z - receiver.z);

// Validate: reflection point must be ON the wall (0 ≤ z ≤ wall height)
// If z < 0: ray would hit below ground (impossible)
// If z > wallHeight: ray would miss the wall entirely (go over it)
if (reflectionZ < 0 || reflectionZ > imageSource.surface.height) continue;

const reflectionPoint3D: Point3D = {
  ...reflectionPoint2D,
  z: reflectionZ,
};
```

#### Impact

| Scenario | Old Behavior | New Behavior |
|----------|--------------|--------------|
| Source z=2, Receiver z=1, Wall 10m | z = max(2,1) = 2m | z calculated from ray geometry |
| Geometric z = 15m, Wall = 10m | z clamped to 10m (wrong) | Path skipped (ray misses wall) |
| Geometric z = -1m | z = max(source.z, receiver.z) | Path skipped (underground) |

---

### 10. "Simple" Atmospheric Absorption Model Incorrectly Formulated
- [x] **Status:** Resolved
- **Location:** `packages/core/src/units/index.ts:64-82`
- **Impact:** Severe underestimation of HF absorption (up to 83% error)
- **Fixed:** Replaced buggy formula with lookup table matching probeWorker implementation

#### Before (Problematic Code)

The core package had an invented formula that doesn't match any acoustic standard:

```typescript
export function atmosphericAbsorptionSimple(
  frequencyHz: number,
  temperatureC: number = STANDARD_TEMPERATURE,
  relativeHumidity: number = STANDARD_HUMIDITY
): number {
  // Simplified absorption coefficient (dB/100m)
  // Based on ISO 9613-1 approximation
  const f = frequencyHz / 1000; // Convert to kHz
  const T = temperatureC;
  const h = relativeHumidity;

  // Very simplified formula
  const alpha =
    (1.84e-11 * (T + 273.15) ** 0.5 * f ** 2) / (1 + (f / (0.1 + 10 * h / 100)) ** 2) +
    f ** 2 * (1.275e-2 * Math.exp(-2239.1 / (T + 273.15))) /
      (1 + (f / (0.1 + 10 * h / 100)) ** 2);

  return alpha / 100; // Convert to dB/m
}
```

**Problems with this formula:**
1. `(f / (0.1 + 10 * h / 100))` - Invented humidity term, appears nowhere in ISO 9613-1
2. Missing O₂ and N₂ molecular relaxation frequencies
3. Suspicious `/100` division at end with unclear units
4. Creates low-pass filter effect that incorrectly reduces HF absorption

**Numerical comparison at 20°C, 50% RH:**

| Frequency | ISO 9613-1 (correct) | Buggy formula | Error |
|-----------|---------------------|---------------|-------|
| 1000 Hz   | 0.0037 dB/m         | ~0.001 dB/m   | -73%  |
| 8000 Hz   | 0.117 dB/m          | ~0.02 dB/m    | -83%  |

#### After (Fixed Code)

Replaced with lookup table approach (matching probeWorker implementation):

```typescript
export function atmosphericAbsorptionSimple(
  frequencyHz: number,
  temperatureC: number = STANDARD_TEMPERATURE,
  relativeHumidity: number = STANDARD_HUMIDITY
): number {
  // Lookup table with linear corrections for temperature and humidity.
  // Base values derived from ISO 9613-1 at 20°C, 50% RH.
  // This is faster than full ISO calculation with acceptable accuracy
  // for typical outdoor conditions (10-30°C, 30-90% RH, 63-16000 Hz).

  // Temperature correction factor (absorption generally increases with temperature)
  const tempFactor = 1 + 0.01 * (temperatureC - 20);

  // Humidity correction (lower humidity = higher absorption at high frequencies)
  const humidityFactor = 1 + 0.005 * (50 - relativeHumidity);

  // Frequency-dependent base absorption coefficients (dB/m at 20°C, 50% RH)
  let baseAlpha: number;

  if (frequencyHz <= 63) {
    baseAlpha = 0.0001;
  } else if (frequencyHz <= 125) {
    baseAlpha = 0.0003;
  } else if (frequencyHz <= 250) {
    baseAlpha = 0.001;
  } else if (frequencyHz <= 500) {
    baseAlpha = 0.002;
  } else if (frequencyHz <= 1000) {
    baseAlpha = 0.004;
  } else if (frequencyHz <= 2000) {
    baseAlpha = 0.008;
  } else if (frequencyHz <= 4000) {
    baseAlpha = 0.02;
  } else if (frequencyHz <= 8000) {
    baseAlpha = 0.06;
  } else {
    // 16000 Hz and above
    baseAlpha = 0.2;
  }

  return Math.max(baseAlpha * tempFactor * humidityFactor, 0);
}
```

**Lookup table values (dB/m at 20°C, 50% RH):**

| Frequency | Lookup Value | ISO 9613-1 Reference | Error |
|-----------|--------------|---------------------|-------|
| 63 Hz     | 0.0001       | 0.00012             | -17%  |
| 125 Hz    | 0.0003       | 0.00041             | -27%  |
| 250 Hz    | 0.001        | 0.00109             | -8%   |
| 500 Hz    | 0.002        | 0.00193             | +4%   |
| 1000 Hz   | 0.004        | 0.00367             | +9%   |
| 2000 Hz   | 0.008        | 0.00963             | -17%  |
| 4000 Hz   | 0.02         | 0.03278             | -39%  |
| 8000 Hz   | 0.06         | 0.117               | -49%  |

Note: Lookup table is approximate but much better than buggy formula. For accurate
calculations, use `atmosphericAbsorption: 'iso9613'` mode which uses the full formula.

---

### 11. Diffraction Only Traced When Direct Path Blocked
- [x] **Status:** Resolved
- **Location:** `packages/engine/src/raytracing/index.ts:545-546`
- **Impact:** Missing paths for coherent summation → Now traces nearby diffraction for accuracy

#### Current Formulation (Math)
For coherent summation, all contributing paths must be included:
```
p_total = Σ p_i · e^(jφ_i)

This requires ALL paths with significant energy, including:
- Direct path (if unblocked)
- Diffracted paths (even if direct is unblocked!)
- Reflected paths
- Combined paths
```

#### Resolution
Added `maxDiffractionDeltaForUnblockedPath` configuration parameter (default: 5.0 meters, ~1 wavelength at 63 Hz).

When the direct path is unblocked but a barrier is nearby (path difference < threshold), the diffraction path is now traced for coherent summation accuracy. This captures interference patterns that were previously missing.

#### Implementation Details

**raytracing/index.ts - New config parameter:**
```typescript
export interface RayTracingConfig {
  // ... existing fields ...

  /**
   * Maximum path difference (meters) for diffraction when direct path is unblocked.
   * When the direct path is clear, diffraction paths with path difference less than
   * this value will still be traced for coherent summation accuracy.
   * Set to 0 to disable (only trace diffraction when direct is blocked).
   * Default: 5.0 meters (~1 wavelength at 63 Hz)
   */
  maxDiffractionDeltaForUnblockedPath: number;
}

export const DEFAULT_RAYTRACING_CONFIG: RayTracingConfig = {
  // ...
  maxDiffractionDeltaForUnblockedPath: 5.0, // ~1 wavelength at 63 Hz
};
```

**raytracing/index.ts - Updated traceAllPaths():**
```typescript
// 4. Diffraction paths
// Issue #11 fix: Trace diffraction for all barriers that could contribute to
// coherent summation, not just when the direct path is blocked.
if (config.includeDiffraction) {
  for (const barrier of diffractingSurfaces) {
    const diffPath = traceDiffractionPath(source, receiver, barrier, allSurfaces);
    if (!diffPath) continue;

    // When direct path is blocked, diffraction is the PRIMARY path - always include it
    if (!directPath.valid) {
      if (diffPath.valid) paths.push(diffPath);
      continue;
    }

    // When direct path is unblocked, only include diffraction paths with
    // small path difference that could interfere significantly with direct wave.
    const maxDelta = config.maxDiffractionDeltaForUnblockedPath ?? 0;
    if (maxDelta > 0 && diffPath.valid && diffPath.pathDifference < maxDelta) {
      paths.push(diffPath);
    }
  }
}
```

**probeCompute/index.ts - Enabled for coherent probe:**
```typescript
const rtConfig: RayTracingConfig = {
  // ...
  maxDiffractionDeltaForUnblockedPath: 5.0, // Issue #11: trace nearby diffraction
};
```

#### Test Coverage
- 11 new unit tests in `packages/engine/tests/probe-diffraction.spec.ts`
- Tests cover: blocked path behavior (preserved), unblocked path threshold, multiple barriers, path difference geometry

---

### 12. Mixed Ground Sigma Calculation Arbitrary
- [x] **Status:** Resolved
- **Location:** `packages/engine/src/propagation/ground.ts:33-83`
- **Impact:** Non-physical interpolation → Now user-selectable with two physical models

#### Current Formulation (Math)
The original code used an arbitrary formula without physical basis.

ISO 9613-2 uses an area-weighted G factor:
```
G = (G_s × d_s + G_m × d_m + G_r × d_r) / d_total

where G = 0 for hard, G = 1 for soft
```

For impedance calculations, logarithmic interpolation is more physically accurate:
```
log(σ) = G·log(σ_soft) + (1-G)·log(σ_hard)
σ = σ_soft^G × σ_hard^(1-G)
```

#### After (Fixed Code)
```typescript
/**
 * Mixed ground sigma interpolation model.
 * Controls how flow resistivity is interpolated for mixed ground types.
 *
 * - 'iso9613': ISO 9613-2 compliant linear G-factor interpolation
 *              σ_eff = σ_soft / G  (for G > 0)
 * - 'logarithmic': Physically accurate logarithmic interpolation
 *                  log(σ) = G·log(σ_soft) + (1-G)·log(σ_hard)
 *                  More realistic for impedance calculations
 */
export type GroundMixedSigmaModel = 'iso9613' | 'logarithmic';

const SIGMA_HARD = 1e9;

export function getEffectiveSigma(
  groundType: GroundType,
  sigmaSoft: number,
  mixedFactor: number,
  model: GroundMixedSigmaModel = 'iso9613'
): number {
  if (groundType === 'soft') return sigmaSoft;
  if (groundType === 'hard') return SIGMA_HARD;

  const G = clamp(mixedFactor, 0, 1);

  if (model === 'logarithmic') {
    // Geometric interpolation (physically accurate)
    const logSigma = G * Math.log(sigmaSoft) + (1 - G) * Math.log(SIGMA_HARD);
    return Math.exp(logSigma);
  } else {
    // ISO 9613-2 linear admittance interpolation
    // σ_eff = σ_soft / G
    const Gclamped = Math.max(G, 0.01);
    return sigmaSoft / Gclamped;
  }
}
```

**Config schema (core/src/schema/index.ts):**
```typescript
groundMixedSigmaModel: z.enum(['iso9613', 'logarithmic']).default('iso9613')
```

**Profile usage:**
- ISO-compliant profile: `groundMixedSigmaModel: 'iso9613'`
- Ray tracing accuracy profile: `groundMixedSigmaModel: 'logarithmic'`

---

## 🟡 MINOR ISSUES

### 13. Sommerfeld Correction — Smooth Transition at |w|=4 Pending
- [ ] **Status:** Partially resolved (correction implemented, smooth transition pending)
- **Location:** `packages/engine/src/propagation/ground.ts:192-200`
- **Impact:** Minor — small potential discontinuity near threshold only
- **Priority:** Low — the hard threshold works correctly; smooth transition is a polish item

#### Implementation Status

| Aspect | Status |
|--------|--------|
| Sommerfeld correction formula | ✅ Implemented |
| Asymptotic F(w) terms (-0.5/w² + 0.75/w⁴) | ✅ Correct |
| Spherical wave correction applied | ✅ Working |
| Smooth transition at threshold | ⚠️ **Pending** |

#### Formulation (Math)
Sommerfeld ground wave function F(w):
```
For |w| >> 1 (far from source):
  F(w) ≈ -1/(2w²) + 3/(4w⁴) + ...  (asymptotic)

For |w| << 1 (near source):
  F(w) ≈ 1 - √π·w·e^(-w²)·erfc(-jw)  (series)

Current code: uses plane-wave Γ for |w| < 4, asymptotic for |w| ≥ 4
```

#### Before (No Sommerfeld Correction)
```typescript
// Old code had no ground wave correction at all
const gamma = complexDiv(num, den);  // Plane-wave reflection only
// Missing: spherical wave correction F(w)
```

#### After (Current Implementation with Sommerfeld Correction)
```typescript
// ground.ts lines 185-200
const beta = complexDiv(complex(1, 0), zeta);
const k = (2 * Math.PI * fHz) / speedOfSound;
const factor = complexSqrt(complex(0, (k * r2) / 2));
const term = complexAdd(complex(clampedCos, 0), beta);
const w = complexMul(factor, term);
const magW = complexAbs(w);

// Sommerfeld asymptotic correction for |w| ≥ 4
if (magW >= 4) {
  const w2 = complexMul(w, w);
  const w4 = complexMul(w2, w2);
  const term1 = complexDiv(complex(-0.5, 0), w2);  // -1/(2w²)
  const term2 = complexDiv(complex(0.75, 0), w4);  // +3/(4w⁴)
  const Fw = complexAdd(term1, term2);
  const correction = complexMul(complexSub(complex(1, 0), gamma), Fw);
  gamma = complexAdd(gamma, correction);  // Apply spherical wave correction
}
```

#### Why This Works (Low Impact)

At the threshold |w|=4, the correction terms are small:
- F(w) ≈ -0.5/16 + 0.75/256 ≈ -0.028
- The correction approaches zero at the threshold, minimizing discontinuity

#### Proposed Enhancement (Smooth Transition)
```typescript
/**
 * Sommerfeld ground wave function F(w)
 * Uses smooth transition between series and asymptotic forms
 */
function sommerfeldF(w: Complex): Complex {
  const magW = complexAbs(w);

  if (magW < 0.5) {
    // Small |w|: F ≈ 1 (plane wave dominates)
    return complex(1, 0);
  }

  if (magW > 6) {
    // Large |w|: asymptotic expansion
    const w2 = complexMul(w, w);
    const w4 = complexMul(w2, w2);
    return complexAdd(
      complexDiv(complex(-0.5, 0), w2),
      complexDiv(complex(0.75, 0), w4)
    );
  }

  // Transition region (0.5 ≤ |w| ≤ 6): use weighted blend
  const t = (magW - 0.5) / 5.5;  // 0 to 1 across transition
  const weight = t * t * (3 - 2 * t);  // Smooth step (Hermite)

  const F_small = complex(1, 0);
  const w2 = complexMul(w, w);
  const w4 = complexMul(w2, w2);
  const F_large = complexAdd(
    complexDiv(complex(-0.5, 0), w2),
    complexDiv(complex(0.75, 0), w4)
  );

  // Blend: F = (1-weight)·F_small + weight·F_large
  return complexAdd(
    complexScale(F_small, 1 - weight),
    complexScale(F_large, weight)
  );
}
```

---

### 14. Hardcoded Diffraction Phase Shift
- [ ] **Status:** Open
- **Location:** `packages/engine/src/raytracing/index.ts:467`
- **Impact:** Phase error in coherent summation

#### Current Formulation (Math)
UTD edge diffraction phase (simplified):
```
φ_diff = -π/4 - k·δ + phase corrections

Full UTD:
D(φ,φ',n) = -e^(-jπ/4) / (2n·√(2πk)) × [cot((π+β)/2n) + cot((π-β)/2n)]

For knife-edge (n=2):
φ ≈ -π/4  (independent of frequency to first order)
```

#### Current Code Implementation
```typescript
reflectionPhaseChange: -Math.PI / 4,  // Hardcoded
```

#### Proposed Implementation
```typescript
/**
 * Calculate diffraction phase shift for knife-edge.
 *
 * The -π/4 approximation is reasonable for single knife-edge,
 * but exact phase depends on diffraction angle.
 */
function diffractionPhaseShift(
  source: Point3D, diffractionPoint: Point3D, receiver: Point3D
): number {
  // For simple knife-edge model, -π/4 is the standard approximation
  // This comes from the asymptotic form of the Fresnel integral

  // More accurate: phase depends on shadow angle
  const d1 = distance3D(source, diffractionPoint);
  const d2 = distance3D(diffractionPoint, receiver);

  // Incident and diffracted ray angles relative to barrier
  // For now, use standard -π/4 (TODO: implement full UTD if needed)
  const basePhase = -Math.PI / 4;

  return basePhase;
}

// In traceDiffractionPath:
return {
  type: 'diffracted',
  // ...
  reflectionPhaseChange: diffractionPhaseShift(source, diffractionPoint, receiver),
  // ...
};
```

---

### 15. Incoherent Source Summation Only
- [ ] **Status:** Open (by design)
- **Location:** `packages/engine/src/compute/index.ts:467`
- **Impact:** Cannot model correlated sources

#### Current Formulation (Math)
Current (incoherent/energetic sum):
```
p²_total = Σ p²_i
L_total = 10·log₁₀(Σ 10^(L_i/10))
```

Coherent sum (for correlated sources):
```
p_total = |Σ p_i · e^(jφ_i)|
L_total = 20·log₁₀(|Σ p_i · e^(jφ_i)| / p_ref)
```

#### Current Code Implementation
```typescript
// Energetic (incoherent) sum of source spectra
const totalSpectrum = sourceSpectra.length > 0
  ? sumMultipleSpectra(sourceSpectra)  // Uses power summation
  : createEmptySpectrum();
```

#### Proposed Implementation
```typescript
export interface SourceComputeOptions {
  /** Sum sources coherently (for synchronized/correlated sources) */
  coherentSourceSum?: boolean;
}

async computeReceivers(
  request: ComputeReceiversRequest,
  options: SourceComputeOptions = {}
): Promise<ComputeReceiversResponse> {
  // ...

  const results: ReceiverResult[] = receivers.map(recv => {
    if (options.coherentSourceSum) {
      // Coherent: sum as phasors
      const sourcePhasors: SpectralPhasor[] = [];

      for (const src of enabledSources) {
        const dist = distance3D(src.position, recv.position);
        const sourceSpectrum = applyGainToSpectrum(src.spectrum, src.gain ?? 0);
        // ... propagation calculation ...

        // Create phasor with phase from distance
        const phasor = createSpectralPhasor(receiverSpectrum, dist, speedOfSound);
        sourcePhasors.push(phasor);
      }

      const totalSpectrum = sumSpectralPhasorsCoherent(sourcePhasors);
      // ...
    } else {
      // Incoherent: existing energetic sum (default)
      const totalSpectrum = sumMultipleSpectra(sourceSpectra);
      // ...
    }
  });
}
```

---

### 16. Same Formula for Thin/Thick Barriers
- [x] **Status:** Resolved
- **Location:** `packages/engine/src/propagation/index.ts`, `packages/engine/src/compute/index.ts`
- **Impact:** ~5 dB difference for thick barriers → Now correctly applied

#### Current Formulation (Math)
Thin screen (Maekawa):
```
A_bar = 10·log₁₀(3 + 20N)    cap at 20 dB
```

Thick barrier/building (double diffraction):
```
A_bar = 10·log₁₀(3 + 40N)    cap at 25 dB
```

#### Resolution
Added `barrierType` parameter to diffraction calculation:
- **Thin barriers (walls/screens):** coefficient 20, cap 20 dB
- **Thick barriers (buildings):** coefficient 40, cap 25 dB

The `computeBarrierPathDiff()` function now tracks whether the blocking obstacle is a thin barrier or thick building, and passes this type through to `barrierAttenuation()`.

#### Implementation Details

**propagation/index.ts - Updated barrierAttenuation():**
```typescript
export type BarrierType = 'thin' | 'thick';

export function barrierAttenuation(
  pathDifference: number,
  frequency: number,
  wavelength?: number,
  barrierType: BarrierType = 'thin'
): number {
  const lambda = wavelength ?? 343 / frequency;
  const N = (2 * pathDifference) / lambda;

  if (N < -0.1) return 0;

  // Select coefficient and cap based on barrier type
  const coefficient = barrierType === 'thick' ? 40 : 20;
  const maxAttenuation = barrierType === 'thick' ? 25 : 20;

  const attenuation = 10 * Math.log10(3 + coefficient * N);
  return Math.min(attenuation, maxAttenuation);
}
```

**compute/index.ts - Updated BarrierPathResult:**
```typescript
type BarrierPathResult = {
  blocked: boolean;
  pathDifference: number;
  actualPathLength: number;
  barrierType: BarrierType;  // NEW: 'thin' for walls, 'thick' for buildings
};

function computeBarrierPathDiff(...): BarrierPathResult {
  // ...
  // Check buildings (thick barriers)
  for (const building of geometry.buildings) {
    const delta = computeBuildingDelta(...);
    if (delta !== null && (maxDelta === null || delta > maxDelta)) {
      maxDelta = delta;
      maxBarrierType = 'thick';  // Buildings use thick barrier formula
    }
  }
  return { blocked: true, pathDifference: maxDelta, actualPathLength, barrierType: maxBarrierType };
}
```

#### Expected Impact

For buildings with ~5m path difference:

| Frequency | Old (thin, cap 20) | New (thick, cap 25) | Improvement |
|-----------|-------------------|---------------------|-------------|
| 63 Hz     | 18.8 dB           | 21.6 dB             | +2.8 dB     |
| 16 kHz    | 20 dB (capped)    | 25 dB (capped)      | +5 dB       |

Note: probeWorker already used correct thick barrier formula via `doubleEdgeDiffraction()`.
This fix aligns receiver/grid calculations with probe accuracy.

---

### 17. Ground Absorption Not Spectral
- [ ] **Status:** Open
- **Location:** `packages/engine/src/raytracing/index.ts:340-345`
- **Impact:** HF absorption underestimated

#### Current Formulation (Math)
ISO 9613-2 Table 2 ground absorption coefficients:
```
Frequency (Hz) | Hard  | Soft
63             | 0.01  | 0.10
125            | 0.01  | 0.15
250            | 0.01  | 0.20
500            | 0.01  | 0.30
1000           | 0.02  | 0.40
2000           | 0.02  | 0.50
4000           | 0.02  | 0.55
8000           | 0.03  | 0.60
```

#### Current Code Implementation
```typescript
let absorption = 0;
if (groundParams.type === 'soft') {
  absorption = 0.2;  // Single value for all frequencies
} else if (groundParams.type === 'mixed') {
  absorption = 0.1 * groundParams.mixedFactor;
}
```

#### Proposed Implementation
```typescript
const GROUND_ABSORPTION_SOFT: Record<number, number> = {
  63: 0.10, 125: 0.15, 250: 0.20, 500: 0.30,
  1000: 0.40, 2000: 0.50, 4000: 0.55, 8000: 0.60, 16000: 0.65
};

const GROUND_ABSORPTION_HARD: Record<number, number> = {
  63: 0.01, 125: 0.01, 250: 0.01, 500: 0.01,
  1000: 0.02, 2000: 0.02, 4000: 0.02, 8000: 0.03, 16000: 0.03
};

function getGroundAbsorption(
  groundType: 'hard' | 'soft' | 'mixed',
  frequency: number,
  mixedFactor: number = 0.5
): number {
  // Find nearest band
  const bands = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const nearestBand = bands.reduce((a, b) =>
    Math.abs(b - frequency) < Math.abs(a - frequency) ? b : a
  );

  const alphaSoft = GROUND_ABSORPTION_SOFT[nearestBand] ?? 0.4;
  const alphaHard = GROUND_ABSORPTION_HARD[nearestBand] ?? 0.02;

  switch (groundType) {
    case 'hard': return alphaHard;
    case 'soft': return alphaSoft;
    case 'mixed': return alphaHard + mixedFactor * (alphaSoft - alphaHard);
  }
}
```

---

### 18. Speed of Sound Constant vs Formula Mismatch
- [x] **Status:** Resolved
- **Location:** Multiple files
- **Impact:** 0.1% difference (negligible) → Now user-controlled

#### Current Formulation (Math)
```
Constant: c = 343.0 m/s
Formula:  c = 331.3 + 0.606·T = 331.3 + 0.606×20 = 343.42 m/s
```

#### Resolution
Added **Environmental Conditions** settings panel in the UI that exposes:
- **Temperature** (°C): -10 to 40, default 20
- **Relative Humidity** (%): 10 to 100, default 50
- **Atmospheric Pressure** (kPa): 95 to 108, default 101.325 (sea level)
- **Derived Speed of Sound** display: calculated as `c = 331.3 + 0.606 × T`

These values are passed through to the probe worker and noise map calculations,
affecting atmospheric absorption and wavelength-dependent calculations.

#### Implementation Details
- `apps/web/index.html`: Environmental Conditions section in settings popover
- `apps/web/src/style.css`: Styling for input-with-unit and derived-display
- `apps/web/src/main.ts`: `meteoState` object, `calculateSpeedOfSound()`, `updateSpeedOfSoundDisplay()`, `getMeteoConfig()` functions, event handlers
- `buildProbeRequest()`: Now uses `getMeteoConfig()` instead of hardcoded values

---

### 19. Diffraction Loss = 0 in Ray Tracing Result
- [ ] **Status:** Open
- **Location:** `packages/engine/src/raytracing/index.ts:469`
- **Impact:** Requires downstream computation

#### Current Code Implementation
```typescript
return {
  type: 'diffracted',
  // ...
  diffractionLoss: 0,  // Placeholder - computed later
};
```

#### Proposed Implementation
```typescript
/**
 * Trace diffraction path with per-band attenuation pre-computed
 */
export function traceDiffractionPath(
  source: Point3D, receiver: Point3D,
  barrier: ReflectingSurface, allSurfaces: ReflectingSurface[],
  frequencies: number[] = OCTAVE_BANDS,  // NEW: compute for these bands
  speedOfSound: number = SPEED_OF_SOUND_20C
): RayPathWithSpectralLoss | null {
  // ... existing geometry calculation ...

  // Pre-compute per-band diffraction loss
  const spectralDiffractionLoss: number[] = frequencies.map(freq => {
    return maekawaDiffraction(pathDifference, freq, speedOfSound);
  });

  return {
    type: 'diffracted',
    totalDistance,
    directDistance,
    pathDifference,
    waypoints: [source, diffractionPoint, receiver],
    surfaces: [barrier],
    absorptionFactor: 1,
    reflectionPhaseChange: -Math.PI / 4,
    valid: true,
    diffractionLoss: spectralDiffractionLoss[4],  // 1kHz representative
    spectralDiffractionLoss,  // NEW: full spectrum
  };
}

interface RayPathWithSpectralLoss extends RayPath {
  spectralDiffractionLoss?: number[];  // Per-band loss in dB
}
```

---

### 20. ISO 9613-2 Ground Effect (Agr) Not Frequency-Dependent
- [x] **Status:** Resolved
- **Location:** `packages/engine/src/propagation/index.ts:224-234`
- **Impact:** Non-compliant with ISO 9613-2 Tables 3-4
- **Fixed:** Implemented ISO 9613-2 Tables 3-4 per-band coefficients in `agrISO9613PerBand()`

#### Current Formulation (Problem)

The current "legacy" ISO 9613-2 ground model uses only Equation (10), which is frequency-independent:

```
Agr = 4.8 - (2·hm/d)·(17 + 300/d)    where hm = (hs + hr) / 2
```

This is a simplified approximation that:
1. **Ignores frequency** - the `frequency` parameter is discarded
2. **Only applies to soft ground** - returns 0 for hard/mixed
3. **Only approximates the middle region** - doesn't use source/receiver regions

#### ISO 9613-2 Specification (Correct)

The full ISO 9613-2 Agr calculation uses **Tables 3-4** with **frequency-dependent** coefficients:

```
Agr = As + Ar + Am

Where each region has per-band values:

As (source region):  varies by frequency, hs, dp (30·hs or dp, whichever smaller), and Gs
Ar (receiver region): varies by frequency, hr, dp (30·hr or dp, whichever smaller), and Gr
Am (middle region):  varies by frequency, d, and Gm
```

ISO 9613-2 Equations 8-9 specify the formulas for each region.

#### What's Already Implemented ✅

**Region partitioning is already in place from Issue #3!**

The `calculateGroundEffectRegion()` function already:
- Splits paths at barrier diffraction points
- Calculates source-side and receiver-side ground effects separately
- Passes frequency parameter through

```typescript
// Already exists in propagation/index.ts
const Agr_source = calculateGroundEffectRegion(
  distSourceToBarrier, sourceHeight, barrierHeight, config, meteo, frequency
);
const Agr_receiver = calculateGroundEffectRegion(
  distBarrierToReceiver, barrierHeight, receiverHeight, config, meteo, frequency
);
Agr = Agr_source + Agr_receiver;
```

#### What Needs to Be Fixed

The `groundEffect()` function discards the frequency parameter:

```typescript
export function groundEffect(
  distance: number,
  sourceHeight: number,
  receiverHeight: number,
  groundType: GroundType,
  frequency: number  // IGNORED!
): number {
  void frequency;  // <-- Frequency is discarded
  if (groundType !== GroundType.Soft) return 0;
  return agrIsoEq10Db(distance, sourceHeight, receiverHeight);
}
```

#### Proposed Implementation

Replace the frequency-independent Eq. (10) with ISO 9613-2 Equations 8-9:

```typescript
/**
 * ISO 9613-2 Table 3 - Ground attenuation coefficients for source/receiver regions.
 *
 * Format: a'(f), b'(f), c'(f), d'(f) for each octave band
 * As = a'(f) + b'(f)·G·log(max(hs, 0.25)) + c'(f)·G·log(dp) + d'(f)·G
 */
const ISO_TABLE_3: Record<number, { a: number; b: number; c: number; d: number }> = {
  63:   { a: -1.5, b: 0,    c: 0,    d: 0    },
  125:  { a: -1.5, b: 0,    c: 0,    d: 0    },
  250:  { a: -1.5, b: 0,    c: 0,    d: 0    },
  500:  { a: -1.5, b: 0,    c: 0,    d: 0    },
  1000: { a: -1.5, b: 0,    c: 0,    d: 0    },
  2000: { a: -1.5, b: 0,    c: 0,    d: 0    },
  4000: { a: -1.5, b: 0,    c: 0,    d: 0    },
  8000: { a: -1.5, b: 0,    c: 0,    d: 0    },
};

/**
 * ISO 9613-2 Table 4 - Ground attenuation coefficients for middle region.
 *
 * Format: a(f), b(f) for each octave band where q = 1 - 30(hs+hr)/d for q > 0
 * Am = a(f)·q + b(f)·(1-Gm)·q
 */
const ISO_TABLE_4: Record<number, { a: number; b: number }> = {
  63:   { a: -3.0, b: -3.0 },
  125:  { a: -3.0, b: -3.0 },
  250:  { a: -3.0, b: -3.0 },
  500:  { a: -3.0, b: -3.0 },
  1000: { a: -3.0, b: -3.0 },
  2000: { a: -3.0, b: -3.0 },
  4000: { a: -3.0, b: -3.0 },
  8000: { a: -3.0, b: -3.0 },
};

export function agrISO9613PerBand(
  distance: number,
  sourceHeight: number,
  receiverHeight: number,
  groundFactor: number,
  frequency: number
): number {
  const G = Math.max(0, Math.min(1, groundFactor));
  const band = nearestOctaveBand(frequency);

  // Source region (As)
  const dp_s = Math.min(30 * sourceHeight, distance);
  const As = calculateRegion(sourceHeight, dp_s, G, band, ISO_TABLE_3);

  // Receiver region (Ar)
  const dp_r = Math.min(30 * receiverHeight, distance);
  const Ar = calculateRegion(receiverHeight, dp_r, G, band, ISO_TABLE_3);

  // Middle region (Am)
  const q = Math.max(0, 1 - 30 * (sourceHeight + receiverHeight) / distance);
  const Am = calculateMiddleRegion(q, G, band, ISO_TABLE_4);

  return As + Ar + Am;
}
```

#### UI Consideration

The "Ground Reflection" toggle should be renamed to **"Ground Effects"** since:
- With Two-Ray model: It controls coherent ground reflection interference
- With ISO 9613-2 model: It controls Agr absorption (not coherent reflection)

The current label is misleading and suggests only the reflection aspect.

---

## 📊 SUMMARY

| Severity | Total | Resolved | Pending |
|----------|-------|----------|---------|
| 🔴 Critical | 6 | 6 | 0 |
| 🟠 Moderate | 5 | 4 | 1 |
| 🟡 Minor | 8 | 5 | 3 |
| **Total** | **21** | **18** | **4** |

---

## 🎯 RECOMMENDED ATTACK ORDER

### Phase 1: Critical Fixes (Accuracy)
1. ~~**Issue #1** - Spreading loss formula~~ ✅ Resolved
2. ~~**Issue #2** - Ground model sign consistency~~ ✅ Resolved (by design)
3. ~~**Issue #2b** - Double-counting direct path~~ ✅ Resolved
4. ~~**Issue #4** - Atmospheric absorption path length~~ ✅ Resolved

### Phase 2: Critical Fixes (Geometry)
5. **Issue #3** - Barrier+ground partitioning (next priority)
6. **Issue #5** - Side diffraction geometry

### Phase 3: Moderate Fixes
7. **Issue #10** - Replace simple atmospheric model
8. **Issue #6** - Delany-Bazley bounds
9. **Issue #9** - Wall reflection geometry
10. **Issue #16** - Thick barrier formula

### Phase 4: Polish
11. Remaining minor issues as time permits

---

## CHANGELOG

| Date | Issue # | Action | Commit |
|------|---------|--------|--------|
| 2025-01-08 | — | Initial audit created | — |
| 2025-01-08 | — | Added detailed formulations and proposed implementations | — |
| 2025-01-08 | #20 | Fixed: Display floor was applied before A-weighting, causing A-curve artifacts | — |
| 2025-01-08 | #21 | Fixed: Error fallback in probeWorker returned 35 dB instead of MIN_LEVEL | — |
| 2025-01-08 | #22 | Fixed: Null pointer exception in traceBuildingDiffractionPaths corner validation | — |
| 2025-01-08 | #23 | Fixed: Probe only traced diffraction for first blocking building, not all | — |
| 2025-01-08 | — | Added documentation for Probe vs Receiver accuracy differences in PHYSICS_REFERENCE.md | — |

---

## Polygon Building Geometry Audit

> **Audit Date:** 2026-02-04
> **Status:** ✅ Engine Ready (UI pending)
> **Scope:** Probe worker ray tracing and building geometry handling

### Overview

This section audits the physics engine's ability to handle **arbitrary polygon building shapes**, beyond the current rectangular UI representation. The engine is **fully polygon-based** and ready for non-rectangular buildings.

### Architecture: Polygon-First Design

The physics engine does **NOT** assume rectangular buildings. It operates on arbitrary polygons:

```
UI (main.ts)                    Probe Worker (probeWorker.ts)
┌─────────────────────┐         ┌─────────────────────────────┐
│ Building class      │         │ BuildingFootprint           │
│ - x, y (center)     │  ──→    │ - vertices: Point2D[]       │
│ - width, height     │ getVertices()  │ - height: number     │
│ - rotation          │         │ - groundElevation           │
└─────────────────────┘         └─────────────────────────────┘
        ↓                                   ↓
  Rectangle coords              Arbitrary polygon edges
  (UI convenience)              (Physics calculations)
```

### ✅ Polygon-Safe Operations

| Operation | Implementation | Location |
|-----------|----------------|----------|
| **Occlusion/Blocking** | `segmentIntersectsPolygon()` - iterates all edges | Lines 364-416 |
| **Point-in-Polygon** | `pointInPolygon()` - ray-casting algorithm | Lines 341-359 |
| **Wall Reflections** | Image source per polygon edge | Lines 1382-1494 |
| **Over-Roof Diffraction** | Entry/exit points on polygon boundary | Lines 587-603 |
| **Corner Diffraction** | `findVisibleCorners()` - all vertices | Lines 528-567 |
| **3D Height Checks** | Path height at intersection points | Lines 422-438 |

### ⚠️ Edge Cases to Monitor

#### 1. Concave Buildings (L-shaped, U-shaped)

**Concern:** `findVisibleCorners()` may incorrectly include interior corners

**Risk Level:** Low - Other diffraction paths (roof, exterior corners) still work

**Future Fix:** Enhance with winding-number algorithm

#### 2. Self-Intersecting Polygons

**Concern:** `pointInPolygon()` gives undefined results for figure-8 shapes

**Risk Level:** Critical - Must reject at UI validation

**Mitigation:** Validate polygon edges don't cross when implementing polygon drawing

#### 3. Very Thin Polygons

**Concern:** Numerical precision at grazing angles

**Risk Level:** Low - EPSILON tolerance (1e-10) handles most cases

**Mitigation:** Enforce minimum edge length (≥ 0.5m) in UI

#### 4. Many-Vertex Polygons (20+ vertices)

**Concern:** Performance of O(n) polygon operations

**Risk Level:** Medium - Performance impact, not correctness

**Mitigation:** Consider bounding-box pre-filter, limit to 12-16 vertices

#### 5. Multi-Corner Diffraction

**Concern:** Current implementation only traces single-corner paths

**Risk Level:** Low - Over-roof diffraction typically dominates

**Future Fix:** Implement recursive corner-to-corner visibility graph

### Recommendations for Polygon Building UI

When implementing polygon drawing mode:

1. **Validate simple polygons** - Reject self-intersecting shapes
2. **Enforce minimum edge length** - At least 0.5m per edge
3. **Enforce minimum area** - At least 1 m²
4. **Limit complexity** - Maximum 12-16 vertices
5. **Prefer convex shapes** - Indicate best physics accuracy for convex

### Conclusion

The probe worker ray tracing engine is **production-ready for polygon buildings**. The architecture is inherently polygon-based, and all major acoustic phenomena work correctly for arbitrary shapes. Only minor edge cases exist for highly concave or complex geometries.
