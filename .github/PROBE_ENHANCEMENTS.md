# Probe Enhancements Roadmap

## Overview

This document outlines proposed enhancements to the probe system to upgrade it from a simplified real-time preview tool to a more acoustically accurate analysis instrument.

---

## 📋 Status Summary

### ✅ Implemented
- Phasor arithmetic library with complex number operations
- Coherent phasor summation for interference modeling
- Ray-tracing module with image source method
- Direct path tracing with barrier blocking detection
- Ground reflection (two-ray model with separate phasors)
- Wall reflections (first-order, image source method)
- Barrier diffraction (Maekawa model, over-top only)
- Building occlusion (polygon-based with 3D height check)
- Building diffraction (double-edge over roof + around corners, per-band)
- Atmospheric absorption (simplified ISO 9613-1)
- Frequency weighting display (A/C/Z)
- Multi-source support (energetic summation)
- **Per-band noise map display** (on-demand recomputation, Jan 7 2026)
- **Layers popover UI fixes** (z-index, slide-down animation, Jan 7 2026)
- **Unified active state blue color** (#2D8CFF across all UI, Jan 7 2026)
- **Discrete LED indicators** (tiny 4px dots on dock buttons, Jan 7 2026)
- **Remove debug logging for production** (clean probeWorker.ts & main.ts, Jan 7 2026)

### 🔨 In Progress / High Priority
- Visual indicator when probe is "calculating"

### 📅 Planned (This Cycle)
- Barrier side diffraction toggle (per-barrier checkbox)
- Building diffraction models (double-edge Maekawa)

### 🔮 Future Enhancements
- Configurable diffraction model selection (Maekawa / Kurze-Anderson / ISO 9613-2)
- Higher-order reflections (2nd, 3rd order bounces)
- Wall reflections for diffracted paths (see detailed plan below)
- Ghost source visualization on canvas
- LOD system for performance modes
- Probe comparison mode
- WebAssembly/GPU acceleration
- Spatial caching for nearby positions
- Terrain/topography effects

---

## ✅ Implementation Status (Jan 6, 2026)

The following enhancements have been implemented on branch `feature/probe-coherent-raytracing`:

### Completed Features

| Feature | Status | Location |
|---------|--------|----------|
| **Phasor arithmetic library** | ✅ Done | `packages/shared/src/phasor/index.ts` |
| **Complex number operations** | ✅ Done | `complexAdd`, `complexMul`, `complexExpj`, etc. |
| **Coherent phasor summation** | ✅ Done | `sumPhasorsCoherent()`, `sumSpectralPhasorsCoherent()` |
| **Ray-tracing module** | ✅ Done | `packages/engine/src/raytracing/index.ts` |
| **Image source method** | ✅ Done | First-order reflections via `createImageSources()` |
| **Direct path tracing** | ✅ Done | With barrier blocking detection |
| **Ground reflection** | ✅ Done | Proper two-ray model with separate phasors (fixed Jan 6) |
| **Wall reflections** | ✅ Done | Image source method for buildings |
| **Barrier diffraction** | ✅ Done | Maekawa model (`maekawaDiffraction()`) |
| **Atmospheric absorption** | ✅ Done | Simplified ISO 9613-1 (fixed Jan 6, 2026) |
| **Frequency weighting display** | ✅ Done | A/C/Z weighting in probe chart |
| **Overall weighted level** | ✅ Done | Shows "72 dB(A)" on probe chart |
| **Ghost source count** | ✅ Done | `interferenceDetails.ghostCount` populated |
| **Unit tests** | ✅ Done | 26 tests in `phasor/index.spec.ts` |

---

## ✅ Bug Fixes (Jan 6, 2026)

### Fix 1: Atmospheric Absorption Formula

**Root Cause:** The `atmosphericAbsorptionCoeff()` function had a broken ISO 9613-1 formula producing astronomically wrong values (~3.7 million dB/m instead of ~0.0001 dB/m at 63 Hz).

**Fix:** Replaced with correct frequency-dependent lookup table with temperature/humidity corrections.

### Fix 2: Ground Reflection Double-Counting

**Root Cause:** The original code was using `twoRayGroundEffect()` which calculates the **combined** interference pattern of direct + ground paths, but then adding this as a **second phasor** alongside the direct path phasor. This caused:
- Direct path energy counted once in phasor 1
- Direct + ground interference counted again in phasor 2
- Result: ~3 dB too high (double-counting direct path)

**Fix:** Implemented proper two-ray model with **separate phasors**:

```typescript
// BEFORE (WRONG): Used combined two-ray formula as second phasor
const groundEffect = twoRayGroundEffect(...);  // Already includes direct!
const level = sourceLevel - atten - groundEffect;
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
- Coherent summation with other paths (wall reflections, diffraction)

---

## Current Capabilities (as of Jan 6, 2026)

### ✅ IMPLEMENTED

| Feature | Description |
|---------|-------------|
| **Barrier occlusion** | Direct path blocked when intersecting barriers |
| **Barrier diffraction** | Maekawa model for sound bending over barriers |
| **Ground reflection** | Proper two-ray with separate phasors, freq-dependent coefficients |
| **First-order wall reflections** | Image source method for building walls |
| **Coherent summation** | Phase-accurate phasor addition within single source |
| **Atmospheric absorption** | Frequency-dependent (simplified ISO 9613-1) |
| **Multi-source support** | Energetic (incoherent) sum across sources |

### ❌ NOT IMPLEMENTED

| Feature | Notes |
|---------|-------|
| **Higher-order reflections** | Only first-order (single bounce) supported |
| **Wall reflections for diffracted paths** | Diffracted paths don't spawn reflections (documented for future) |
| **Terrain effects** | Flat ground assumed |
| **Weather gradients** | No refraction modeling |

---

## Physics Model Summary

For each source-receiver pair, we trace:

1. **DIRECT PATH**: Line-of-sight with barrier blocking check
   - If blocked by barrier → path invalid, try diffraction instead
   - Attenuation: spherical spreading + atmospheric absorption
   - Phase: -k × distance

2. **GROUND REFLECTION**: Separate ray via image source method
   - Virtual source at z = -source_height (mirror below ground)
   - Path distance: sqrt(d² + (hs+hr)²)
   - Reflection coefficient: |Γ|(f) based on ground type
   - Phase: -k × path_distance + Γ_phase

3. **WALL REFLECTIONS**: Image source method
   - Mirror source position across each building wall
   - Trace path from image source to receiver via wall
   - 10% absorption per reflection (0.9 coefficient)

4. **BARRIER DIFFRACTION**: Maekawa approximation
   - Only computed when direct path is blocked
   - Path difference → Fresnel number → insertion loss
   - Max 25 dB attenuation

**Summation:**
- All paths from same source: **Coherent** (with phase) → captures interference
- Paths from different sources: **Energetic** (incoherent) → independent sources

---

## Remaining Work

### Immediate (High Priority)

- [x] **Add building occlusion** (see detailed plan below) ✅
- [x] Remove debug logging (console.log statements) for production ✅
- [ ] Add visual indicator when probe is "calculating"
- [ ] **Expose maxReflections setting in UI** - Currently hardcoded to 0 in PropagationConfigSchema (range: 0-3). This controls higher-order reflections and could significantly impact accuracy. Need to evaluate: (1) performance impact of 1st/2nd/3rd order reflections, (2) whether to expose as advanced setting or simple toggle, (3) interaction with existing wall reflection code in probeWorker.ts

### Future Enhancements

- [ ] Higher-order reflections (2nd, 3rd order bounces)
- [ ] Building edge diffraction
- [ ] Ghost source visualization on canvas
- [ ] LOD system for performance modes
- [ ] Probe comparison mode
- [ ] WebAssembly/GPU acceleration
- [ ] Spatial caching for nearby positions
- [ ] Terrain/topography effects

---

## 🏗️ Building Occlusion Implementation Plan

> **Status:** Planned
> **Priority:** High
> **Target:** Accurate polygon-based occlusion with 3D height consideration

### Problem Statement

Buildings currently do **not** block line-of-sight paths in the probe system. The `isPathBlocked()` function in `probeWorker.ts` explicitly skips buildings:

```typescript
// Current code (line 221-222)
for (const barrier of barriers) {
  if (barrier.type !== 'barrier') continue;  // ← SKIPS BUILDINGS!
  ...
}
```

This means sound propagates through buildings as if they don't exist for direct/ground paths, even though buildings are used for wall reflections.

### Design Goals

1. **Accuracy over speed** - Use polygon-based intersection for physically correct results
2. **3D height awareness** - Paths should clear low buildings if source/receiver are high enough
3. **Non-breaking** - Must not affect existing barrier, ground, reflection, or diffraction logic
4. **Consistent** - Both direct path AND ground reflection path should be blocked by buildings

### Approach: Polygon-Based Occlusion

Rather than checking individual wall segments (which can miss interior crossings), we use proper polygon intersection tests:

```
┌─────────────────┐
│    BUILDING     │
│   (footprint)   │  ← Path through interior IS blocked
│                 │     even if it doesn't hit walls
└─────────────────┘
        ↑
    Source ────X──── Receiver  (BLOCKED)
```

### Implementation Checklist

#### Phase 1: Data Structure Preparation

- [ ] **1.1** Add `BuildingFootprint` interface in `probeWorker.ts`:
  ```typescript
  interface BuildingFootprint {
    id: string;
    vertices: Point2D[];
    height: number;
    groundElevation: number;
  }
  ```

- [ ] **1.2** Extract building footprints in `calculateProbe()`:
  ```typescript
  const buildingFootprints: BuildingFootprint[] = req.walls
    .filter(w => w.type === 'building')
    .map(w => ({
      id: w.id,
      vertices: w.vertices,
      height: w.height,
      groundElevation: 0,
    }));
  ```

#### Phase 2: Geometry Functions

- [ ] **2.1** Add `pointInPolygon()` function (inline in worker or from geo package):
  ```typescript
  function pointInPolygon(point: Point2D, vertices: Point2D[]): boolean {
    // Ray casting algorithm
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;
      if ((yi > point.y) !== (yj > point.y) &&
          point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }
  ```

- [ ] **2.2** Add `segmentIntersectsPolygon()` function:
  ```typescript
  function segmentIntersectsPolygon(
    from: Point2D,
    to: Point2D,
    vertices: Point2D[]
  ): boolean {
    // Check if segment intersects any polygon edge
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      if (segmentIntersection(from, to, vertices[i], vertices[j])) {
        return true;
      }
    }
    // Check if either endpoint is inside polygon
    if (pointInPolygon(from, vertices)) return true;
    if (pointInPolygon(to, vertices)) return true;
    return false;
  }
  ```

- [ ] **2.3** Add `isPathBlockedByBuildings()` function with 3D height check:
  ```typescript
  function isPathBlockedByBuildings(
    from: Point3D,
    to: Point3D,
    buildings: BuildingFootprint[]
  ): boolean {
    const from2D = { x: from.x, y: from.y };
    const to2D = { x: to.x, y: to.y };

    for (const building of buildings) {
      if (segmentIntersectsPolygon(from2D, to2D, building.vertices)) {
        // 3D height check: does path clear the building?
        const buildingTop = building.groundElevation + building.height;

        // Simple check: minimum path height vs building top
        // (More accurate: compute exact height at intersection point)
        const minPathHeight = Math.min(from.z, to.z);

        if (minPathHeight < buildingTop) {
          return true; // BLOCKED
        }
      }
    }
    return false;
  }
  ```

#### Phase 3: Path Tracing Integration

- [ ] **3.1** Modify `traceDirectPath()` to check buildings:
  ```typescript
  function traceDirectPath(
    source: Point3D,
    receiver: Point3D,
    barriers: WallSegment[],
    buildings: BuildingFootprint[]  // NEW parameter
  ): RayPath {
    const s2d = { x: source.x, y: source.y };
    const r2d = { x: receiver.x, y: receiver.y };
    const dist = distance3D(source, receiver);

    // Check barriers (existing)
    const blockedByBarrier = isPathBlocked(s2d, r2d, barriers);

    // Check buildings (NEW)
    const blockedByBuilding = isPathBlockedByBuildings(source, receiver, buildings);

    return {
      type: 'direct',
      totalDistance: dist,
      directDistance: dist,
      pathDifference: 0,
      reflectionPhaseChange: 0,
      absorptionFactor: 1,
      valid: !blockedByBarrier && !blockedByBuilding,
    };
  }
  ```

- [ ] **3.2** Modify `traceGroundPath()` to check buildings on reflected path:
  ```typescript
  // Ground reflection path: Source → Ground Point → Receiver
  // Check if either leg is blocked by a building
  const groundPoint: Point3D = { x: reflectX, y: reflectY, z: 0 };
  const blockedLeg1 = isPathBlockedByBuildings(source, groundPoint, buildings);
  const blockedLeg2 = isPathBlockedByBuildings(groundPoint, receiver, buildings);
  const blockedByBuilding = blockedLeg1 || blockedLeg2;
  ```

- [ ] **3.3** Update `traceAllPaths()` to pass buildings to path tracers

- [ ] **3.4** Update `computeSourcePaths()` to extract and pass building footprints

#### Phase 4: Wall Reflection Path Validation

- [ ] **4.1** In wall reflection tracing, check if reflection path passes through OTHER buildings:
  ```typescript
  // For reflection off building wall B:
  // Path: Source → Reflection Point on B → Receiver
  // Check if either leg passes through any OTHER building (excluding B)
  const otherBuildings = buildings.filter(b => b.id !== reflectingWall.id);
  const blockedByOtherBuilding =
    isPathBlockedByBuildings(source, reflectionPoint, otherBuildings) ||
    isPathBlockedByBuildings(reflectionPoint, receiver, otherBuildings);
  ```

#### Phase 5: Testing & Validation

- [ ] **5.1** Add unit tests for `pointInPolygon()`
- [ ] **5.2** Add unit tests for `segmentIntersectsPolygon()`
- [ ] **5.3** Add unit tests for `isPathBlockedByBuildings()`
- [ ] **5.4** Integration test: Source behind building → probe receives only reflections
- [ ] **5.5** Integration test: Path clears low building → not blocked
- [ ] **5.6** Integration test: Barrier + building in scene → both work correctly
- [ ] **5.7** Regression test: Existing barrier/ground/reflection behavior unchanged

### Edge Cases to Handle

| Case | Expected Behavior |
|------|-------------------|
| Source inside building | All direct paths blocked; only diffraction/reflection possible |
| Receiver inside building | All paths blocked (or handle as special case) |
| Path grazes building corner | Small epsilon tolerance to avoid false positives |
| Very tall source/receiver | Path clears building → not blocked |
| Building with hole (courtyard) | Not supported (assumed solid footprint) |
| Concave building footprint | Polygon algorithm handles correctly |

### Performance Considerations

- Building count is typically small (< 50 in most scenes)
- Polygon intersection is O(n) where n = polygon vertices
- Total complexity per path: O(B × V) where B = buildings, V = avg vertices
- For real-time dragging, this should remain performant

### Files to Modify

| File | Changes |
|------|---------|
| `apps/web/src/probeWorker.ts` | Add geometry functions, modify path tracers |
| `packages/engine/src/api/index.ts` | Optionally add `groundElevation` to `ProbeWall` |
| (Optional) `packages/geo/src/geom/index.ts` | Could import existing functions instead of inlining |

### Success Criteria

1. ✅ Direct path blocked when crossing building footprint (at path height < building height)
2. ✅ Ground reflection blocked when either leg crosses building
3. ✅ Wall reflections still work (only blocked by OTHER buildings)
4. ✅ Barriers continue to work (occlusion + diffraction)
5. ✅ Paths that clear building height are NOT blocked
6. ✅ No regression in existing probe functionality
7. ✅ Performance remains acceptable for real-time dragging

---

## 🔧 Future: Configurable Diffraction Models

> **Status:** Future Enhancement
> **Priority:** Medium
> **Target:** User-selectable physics models for barriers and buildings

### Overview

Different acoustic scenarios benefit from different diffraction models. A festival planner may prefer fast approximate models, while an environmental noise consultant may require ISO-compliant calculations. This enhancement would allow users to select the diffraction model via UI toggles or propagation config.

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

---

### Barrier Diffraction Models (Thin Screen)

#### Model 1: `maekawa` (Current Default)

The simplest and most widely used approximation. Fast and reasonably accurate for single thin screens.

**Geometry:**
```
        S                    R
         \                  /
          \    δ = A+B-d   /
           \      ↓       /
            A ──→ ● ←── B
                  │
            ══════╧══════   Thin barrier
```

**Equations:**
```
Path difference:
  δ = A + B - d

Fresnel number:
  N = 2δ/λ = 2δf/c

Insertion loss (Maekawa, 1968):
  A_bar = 10·log₁₀(3 + 20·N)     for N ≥ 0
  A_bar = 0                       for N < -0.1
  A_bar ≈ 5·log₁₀(N) + 6.5        (simplified for N > 1)

Maximum attenuation: ~20-24 dB (single screen limit)
```

**Pros:** Fast, simple, widely validated
**Cons:** Less accurate for low Fresnel numbers, doesn't account for ground effects near barrier

---

#### Model 2: `kurze-anderson`

More accurate empirical formula, better behavior at low frequencies and small path differences.

**Equations:**
```
Kurze-Anderson (1971):

For N > 0:
  A_bar = 5 + 20·log₁₀(√(2πN) / tanh(√(2πN)))

Simplified approximations:
  N < 0:     A_bar = 0
  0 ≤ N < 1: A_bar ≈ 5 + 20·log₁₀(√(2πN) · (1 - N/3))
  N ≥ 1:     A_bar ≈ 5 + 20·log₁₀(√(2πN))

Maximum attenuation: ~24 dB
```

**Comparison with Maekawa:**
```
┌────────────┬──────────────┬─────────────────┐
│ Fresnel N  │ Maekawa (dB) │ Kurze-And. (dB) │
├────────────┼──────────────┼─────────────────┤
│    0.1     │     6.0      │      6.8        │
│    1.0     │    13.0      │     13.3        │
│   10.0     │    23.0      │     23.0        │
│  100.0     │    33.0      │     33.0        │
└────────────┴──────────────┴─────────────────┘
```

**Pros:** Better at low N values, smooth transition at N=0
**Cons:** Slightly more complex, marginal improvement for most cases

---

#### Model 3: `iso9613-2`

Full ISO 9613-2 barrier calculation with ground effect corrections and meteorological factors.

**Equations:**
```
ISO 9613-2 Section 7.4:

D_z = 10·log₁₀(3 + C₂/λ · C₃ · z · K_met)

where:
  z = path difference parameter (complex formula)
  C₂ = 20 (single diffraction)
  C₃ = 1 + (5λ/e)² / (1/3 + (5λ/e)²)
       where e = distance from source/receiver to barrier top
  K_met = meteorological correction (typically 1.0 for downwind)

Ground-reflected diffraction:
  Additional paths traced via image sources below ground
  Combined using energy or phasor summation

Maximum attenuation: 20-25 dB depending on geometry
```

**Pros:** Standards-compliant, includes ground corrections
**Cons:** More complex, requires additional geometry calculations

---

#### Model 4: `none`

Barriers block paths completely (infinite attenuation) or are ignored entirely. Useful for debugging or simplified scenarios.

---

### Building Diffraction Models (Thick Obstacle)

#### Model 1: `blocking-only` (Phase 1 Default)

No diffraction calculation. If path intersects building at height below roof, it is fully blocked (no energy). This is the simplest implementation.

**Behavior:**
```
        S                              R
         \                            /
          \    Path BLOCKED          /
           \        ↓               /
            ────────X──────────────
                    │ BUILDING │
            ════════╧══════════════   (path terminated)
```

**Equations:**
```
if (pathIntersectsBuilding && pathHeight < buildingTop) {
  attenuation = Infinity;  // Path fully blocked
} else {
  attenuation = 0;  // Path unobstructed
}
```

**Pros:** Fastest, simple to implement
**Cons:** Unrealistic - sound DOES diffract over/around buildings in reality

---

#### Model 2: `double-edge-maekawa` (Recommended)

Treats building as two thin screens (entry and exit roof edges). Uses modified Maekawa coefficient.

**Geometry:**
```
        S                              R
         \                            /
          \                          /
           A₁ ──→ ●────────● ←── A₂
                  │  ROOF  │
           ═══════╧════════╧═══════   Building
                  ↑        ↑
              Edge 1    Edge 2

    Path: S → Edge1 → Edge2 → R
```

**Equations:**
```
Path segments:
  A₁ = distance(S, edge1_point)
  T  = roof_width (edge1 to edge2)
  A₂ = distance(edge2_point, R)
  d  = direct_distance(S, R)

Total path difference:
  δ = (A₁ + T + A₂) - d

Fresnel number:
  N = 2δ/λ

Double-edge insertion loss:
  A_bar = 10·log₁₀(3 + 40·N)    ← Note: coefficient 40 (not 20)

Maximum attenuation: ~25-30 dB
```

**Example (from earlier):**
```
Building: 10m wide, 8m tall
Source:   5m from building, z = 1.5m
Receiver: 10m from building, z = 1.5m
Frequency: 1000 Hz (λ = 0.343m)

Calculation:
  A₁ = √(5² + 6.5²) = 8.2m
  T  = 10m
  A₂ = √(10² + 6.5²) = 11.9m
  δ  = 30.1 - 25 = 5.1m
  N  = 2 × 5.1 / 0.343 = 29.7

  A_bar = 10·log₁₀(3 + 40 × 29.7) = 30.8 dB → capped at 25 dB
```

**Pros:** Physically reasonable, moderate complexity
**Cons:** May overestimate loss for wide buildings

---

#### Model 3: `pierce`

Pierce's thick barrier approximation treats each edge independently and adds losses with a coupling correction. More accurate for very wide buildings.

**Geometry:**
```
        S           D₁                D₂            R
         \           ↓                 ↓           /
          \      ┌───●─────────────────●───┐      /
           \     │      WIDE BUILDING      │     /
            \    │                         │    /
             \   └─────────────────────────┘   /
              \                               /
               └──────────────────────────────

    Each edge treated as separate single diffraction
```

**Equations:**
```
Pierce Thick Barrier (1974):

Step 1: Calculate loss at first edge
  δ₁ = (A₁ + B₁) - d₁     (path diff for edge 1 as thin screen)
  N₁ = 2δ₁/λ
  D₁ = 10·log₁₀(3 + 20·N₁)

Step 2: Calculate loss at second edge
  δ₂ = (A₂ + B₂) - d₂     (path diff for edge 2 as thin screen)
  N₂ = 2δ₂/λ
  D₂ = 10·log₁₀(3 + 20·N₂)

Step 3: Coupling correction
  C = 10·log₁₀(1 + (N₁·N₂)/(N₁ + N₂ + 1))
  C typically ranges 0 to 6 dB

Total loss:
  D_total = D₁ + D₂ + C

Maximum attenuation: ~30-35 dB (practical limit)
```

**Comparison: Double-Edge vs Pierce:**
```
                        ┌─────────────────┬────────────────┐
                        │ Double-Edge     │ Pierce         │
┌───────────────────────┼─────────────────┼────────────────┤
│ Narrow building (5m)  │  22 dB          │  24 dB         │
│ Medium building (20m) │  26 dB          │  27 dB         │
│ Wide building (50m)   │  28 dB (capped) │  32 dB         │
│ Very wide (100m)      │  28 dB (capped) │  35 dB         │
└───────────────────────┴─────────────────┴────────────────┘
```

**Pros:** More accurate for wide buildings, separates edge contributions
**Cons:** More complex geometry calculations

---

#### Model 4: `shortest-path`

Evaluates BOTH vertical (over roof) and horizontal (around corners) diffraction paths, selecting the path with minimum loss. Most physically complete.

**Geometry (top-down + elevation views):**
```
TOP-DOWN VIEW:
                    ┌───────────────┐
                    │               │
        S ─ ─ ─ ─ ─ │   BUILDING    │ ─ ─ ─ ─ ─ R
                  ↗ │               │ ↖
        PATH A:  ●  └───────────────┘  ●  PATH B
         around    ↖                 ↗    around
          left      ─ ─ ─ ─ ─ ─ ─ ─      right

ELEVATION VIEW:
                    ┌───────────────┐
        S ─ ─ ─ ─ ─ ●───────────────● ─ ─ ─ ─ ─ R
                    │     ROOF      │
                    │   PATH C:     │
        PATH C:     │   over top    │
         over roof  └───────────────┘
```

**Algorithm:**
```
function shortestPathDiffraction(source, receiver, building) {
  // Option 1: Over the roof (vertical diffraction)
  const overRoofLoss = doubleEdgeDiffraction(source, receiver, building);

  // Option 2: Around left side (horizontal diffraction)
  const leftCorner = findLeftCornerPath(source, receiver, building);
  const aroundLeftLoss = leftCorner
    ? singleEdgeDiffraction(leftCorner.pathDiff)
    : Infinity;

  // Option 3: Around right side (horizontal diffraction)
  const rightCorner = findRightCornerPath(source, receiver, building);
  const aroundRightLoss = rightCorner
    ? singleEdgeDiffraction(rightCorner.pathDiff)
    : Infinity;

  // Method A: Take minimum loss (strongest path dominates)
  return Math.min(overRoofLoss, aroundLeftLoss, aroundRightLoss);

  // Method B: Energy sum (all paths contribute)
  // return -10 * Math.log10(
  //   10**(-overRoofLoss/10) +
  //   10**(-aroundLeftLoss/10) +
  //   10**(-aroundRightLoss/10)
  // );
}
```

**Path selection heuristics:**
```
Typical scenarios:

1. Tall narrow building (H >> W):
   → Around-side paths often shorter than over-roof
   → Horizontal diffraction dominates

2. Wide low building (W >> H):
   → Over-roof path shorter than around-side
   → Vertical diffraction dominates

3. Square building:
   → Compare all paths
   → Often similar losses, energy sum may be appropriate
```

**Pros:** Most physically accurate, considers all propagation paths
**Cons:** Most complex, requires corner-finding geometry, potentially slower

---

### Horizontal Diffraction Detail

When `enableHorizontalDiffraction: true`, we compute around-corner paths for buildings.

**Corner-finding algorithm:**
```
function findCornerDiffractionPath(source, receiver, building) {
  // 1. Project S and R onto building footprint plane
  // 2. Find convex hull of building (for complex footprints)
  // 3. Identify visible corners from both S and R
  // 4. For each corner, compute path S → Corner → R
  // 5. Check if path is valid (doesn't intersect building)
  // 6. Return path with minimum total distance

  // For rectangular buildings:
  const corners = [
    building.topLeft,
    building.topRight,
    building.bottomLeft,
    building.bottomRight
  ];

  let bestPath = null;
  let bestDelta = Infinity;

  for (const corner of corners) {
    // Check visibility from source
    if (!isLineOfSight(source, corner, building)) continue;

    // Check visibility to receiver
    if (!isLineOfSight(corner, receiver, building)) continue;

    // Calculate path difference
    const pathLength = distance(source, corner) + distance(corner, receiver);
    const directLength = distance(source, receiver);
    const delta = pathLength - directLength;

    if (delta < bestDelta) {
      bestDelta = delta;
      bestPath = { corner, delta };
    }
  }

  return bestPath;
}
```

**Horizontal diffraction loss:**
```
Uses standard Maekawa formula in the horizontal plane:

N_horizontal = 2·δ_horizontal / λ
A_horizontal = 10·log₁₀(3 + 20·N_horizontal)

Note: For corners, this is typically single-edge diffraction
unless the path wraps around multiple corners (L-shaped buildings)
```

---

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

---

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

## ✅ Per-Band Noise Map Display (On-Demand Recomputation)

> **Status:** ✅ COMPLETED (Jan 7, 2026)
> **Priority:** Medium
> **Implemented:** Allow users to view noise maps for individual frequency bands

### Problem Statement

Currently, the noise map (`GridResult`) only stores LAeq values:

```typescript
interface GridResult {
  values: number[]; // Flat array of LAeq values only
  // No per-band data stored!
}
```

When a user selects a specific frequency band (e.g., "500 Hz") from the display dropdown, the noise map **cannot show that band** because the per-band data was never stored — only the final A-weighted sum.

This means:
- Barrier diffraction appears frequency-independent in the map (it's not — we just can't see it)
- Users cannot visualize low-frequency "rumble" zones vs high-frequency falloff
- No way to identify frequency-specific problem areas

### Design Decision: Recompute on Demand (NOT Store All Bands)

Storing all 9 bands per grid point would be expensive:
- Current: 1 value × N points
- Full spectrum: 9 values × N points (9× memory)
- Plus transfer overhead to main thread

**Instead, recompute the grid when user selects a specific band:**

```
User selects "LAeq (A)" → Use cached grid (current behavior)
User selects "500 Hz"   → Recompute grid for 500 Hz only
User selects "LCeq (C)" → Recompute grid with C-weighting
```

### Implementation (Completed Jan 7, 2026)

#### Schema Changes (`packages/core/src/schema/index.ts`)

Added `FrequencyWeightingSchema` and extended `GridConfigSchema`:

```typescript
/** Frequency weighting type for grid display */
export const FrequencyWeightingSchema = z.enum(['A', 'C', 'Z']);

export const GridConfigSchema = z.object({
  // ... existing fields ...

  // Per-band noise map display options (on-demand recomputation)
  targetBand: z.number().int().min(0).max(8).optional(), // Band index 0-8 (63Hz-16kHz)
  weighting: FrequencyWeightingSchema.default('A'), // Used when targetBand is undefined
});
```

#### Engine Changes (`packages/engine/src/compute/index.ts`)

Modified `computeGrid()` to return single-band or weighted overall:

```typescript
// Per-band noise map display options
const targetBand = gridConfig.targetBand;
const weighting = gridConfig.weighting ?? 'A';

// Return single band level if targetBand is specified, otherwise weighted overall
if (targetBand !== undefined) {
  return totalSpectrum[targetBand]; // Unweighted single-band level
} else {
  return calculateOverallLevel(totalSpectrum, weighting); // Weighted overall
}
```

#### UI Wiring (`apps/web/src/main.ts`)

- `buildNoiseMapGridConfig()` reads `displayBand` and `displayWeighting` state
- `wireDisplaySettings()` triggers map recomputation on band/weighting change
- No caching - maps recompute on-demand with each change

### UI Behavior

| User Action | System Response |
| Generate Map (first time) | Compute LAeq (A-weighted) |
| Select "500 Hz" | Recompute grid for band index 3 (unweighted) |
| Select "LAeq" | Recompute grid with A-weighting |
| Move a source | Recompute with current band selection |
| Change weighting to C | Recompute grid with C-weighting (if overall selected) |

### Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/schema/index.ts` | Added `FrequencyWeightingSchema`, `targetBand`, `weighting` to `GridConfigSchema` |
| `packages/engine/src/compute/index.ts` | Modified `computeGrid()` to use targetBand and weighting |
| `apps/web/src/main.ts` | Updated `buildNoiseMapGridConfig()` and `wireDisplaySettings()` |
| `apps/web/index.html` | Added Display Band dropdown in Layers popover |
| `.github/PERBAND_NOISEMAP_AND_UI_FIXES.md` | Full documentation |

---

## 🚧 Barrier Side Diffraction Toggle

> **Status:** Planned
> **Priority:** Medium
> **Target:** Per-barrier checkbox to enable horizontal (around-edge) diffraction

### Problem Statement

ISO 9613-2 assumes barriers are **effectively infinite** in length. In reality, barriers have finite length, and sound can diffract **around the ends** as well as over the top.

Currently:
- Sound only diffracts **over the top** of barriers (vertical diffraction)
- Sound does NOT diffract **around the sides** (horizontal diffraction)
- Short barriers provide unrealistically high attenuation

### Proposed Solution: Per-Barrier Toggle

Add a checkbox in the barrier detail inspector:

```
┌─────────────────────────────────────────┐
│ Barrier Properties                      │
├─────────────────────────────────────────┤
│ Height: [3.0] m                         │
│ Length: 15.2 m (computed)               │
│                                         │
│ ☑ Enable side diffraction               │
│   (Sound can diffract around ends)      │
│                                         │
│ Max attenuation: [25] dB                │
└─────────────────────────────────────────┘
```

### Physics: Horizontal Diffraction Around Barrier Ends

**Geometry (top-down view):**
```
                 BARRIER (finite length)
                 ══════════════════
                ╱                  ╲
               ╱                    ╲
        PATH A: around              PATH B: around
         left end                    right end
             ╲                      ╱
              ╲                    ╱
        S ─────●──────X───────────●───── R
               ↑      ↑           ↑
           Left    Direct     Right
           edge   (blocked)    edge


    Direct path (over top): S → Barrier Top → R  (vertical diffraction)
    Left path:  S → Left Edge → R   (horizontal diffraction)
    Right path: S → Right Edge → R  (horizontal diffraction)
```

**Path difference for side diffraction:**
```
For diffraction around LEFT edge:

  Path length = |S → Left_Edge| + |Left_Edge → R|
  Direct length = |S → R|

  δ_left = Path_length - Direct_length

  N_left = 2·δ_left / λ
  A_left = 10·log₁₀(3 + 20·N_left)

Same formula for RIGHT edge.
```

**Combined attenuation:**

When side diffraction is enabled, we compute all three paths and take the **minimum loss** (loudest path dominates):

```typescript
function barrierAttenuationWithSides(
  source: Point3D,
  receiver: Point3D,
  barrier: Barrier,
  frequency: number
): number {
  const lambda = 343 / frequency;

  // 1. Over-top diffraction (existing)
  const deltaTop = computeTopPathDifference(source, receiver, barrier);
  const N_top = 2 * deltaTop / lambda;
  const A_top = 10 * Math.log10(3 + 20 * Math.max(N_top, 0));

  if (!barrier.enableSideDiffraction) {
    return Math.min(A_top, barrier.maxAttenuation ?? 25);
  }

  // 2. Around-left diffraction
  const leftEdge = barrier.vertices[0];  // First vertex
  const deltaLeft = computeSidePathDifference(source, receiver, leftEdge);
  const N_left = 2 * deltaLeft / lambda;
  const A_left = 10 * Math.log10(3 + 20 * Math.max(N_left, 0));

  // 3. Around-right diffraction
  const rightEdge = barrier.vertices[barrier.vertices.length - 1];  // Last vertex
  const deltaRight = computeSidePathDifference(source, receiver, rightEdge);
  const N_right = 2 * deltaRight / lambda;
  const A_right = 10 * Math.log10(3 + 20 * Math.max(N_right, 0));

  // Take minimum (loudest path wins)
  const minLoss = Math.min(A_top, A_left, A_right);

  return Math.min(minLoss, barrier.maxAttenuation ?? 25);
}
```

**Example calculation:**
```
Barrier: 10m long, 3m tall
Source: 5m from barrier center, 3m to the left of barrier end
Receiver: 10m from barrier center, directly behind
Frequency: 1000 Hz (λ = 0.343m)

Over-top path:
  δ_top = 2.1m → N = 12.2 → A_top = 24.0 dB

Around-left path:
  δ_left = 0.8m → N = 4.7 → A_left = 19.8 dB  ← LOWER LOSS

Around-right path:
  δ_right = 3.5m → N = 20.4 → A_right = 26.2 dB

Result: A_barrier = 19.8 dB (left path dominates)

Without side diffraction: 24.0 dB (over-top only)
With side diffraction: 19.8 dB (more realistic for short barrier)
```

### Data Model Changes

```typescript
// packages/core/src/schema/index.ts
export const BarrierSchema = z.object({
  id: z.string(),
  type: z.literal('barrier'),
  vertices: z.array(Point2DSchema).min(2),
  height: z.number().positive().default(3),
  groundElevation: z.number().default(0),
  attenuationDb: z.number().default(20),
  enabled: z.boolean().default(true),

  // NEW: Side diffraction toggle
  enableSideDiffraction: z.boolean().default(false),
});
```

### UI Implementation

Add checkbox to barrier inspector in `main.ts`:

```typescript
function renderBarrierInspector(barrier: Barrier) {
  return `
    <div class="inspector-section">
      <label>Height (m)</label>
      <input type="number" value="${barrier.height}" ... />
    </div>
    <div class="inspector-section">
      <label>
        <input type="checkbox"
               ${barrier.enableSideDiffraction ? 'checked' : ''}
               onchange="toggleBarrierSideDiffraction('${barrier.id}')" />
        Enable side diffraction
      </label>
      <span class="hint">Sound can diffract around barrier ends</span>
    </div>
  `;
}
```

### Frequency Dependence Visualization

With side diffraction enabled, the noise map WILL show frequency-dependent behavior:

| Frequency | Over-Top Loss | Side Loss | Effective |
|-----------|---------------|-----------|-----------|
| 125 Hz    | 12 dB         | 8 dB      | 8 dB      |
| 500 Hz    | 18 dB         | 14 dB     | 14 dB     |
| 2000 Hz   | 24 dB         | 20 dB     | 20 dB     |
| 8000 Hz   | 25 dB (cap)   | 24 dB     | 24 dB     |

Low frequencies diffract more easily around corners → less attenuation.

### Implementation Phases

| Phase | Task | Priority |
|-------|------|----------|
| 1 | Add `enableSideDiffraction` to BarrierSchema | High |
| 2 | Add UI checkbox in barrier inspector | High |
| 3 | Implement `computeSidePathDifference()` | High |
| 4 | Modify barrier attenuation to include side paths | High |
| 5 | Update probe worker to use new model | Medium |
| 6 | Add unit tests for side diffraction | Medium |

### Files to Modify

| File | Changes |
|------|---------|
| `packages/core/src/schema/index.ts` | Add `enableSideDiffraction` to `BarrierSchema` |
| `apps/web/src/main.ts` | Add checkbox to barrier inspector |
| `packages/engine/src/propagation/index.ts` | Modify `barrierAttenuation()` |
| `packages/engine/src/compute/index.ts` | Pass barrier config to attenuation |
| `apps/web/src/probeWorker.ts` | Update diffraction path tracing |

---

## Files Modified (Jan 6, 2026)

| File | Changes |
|------|---------|
| `apps/web/src/probeWorker.ts` | Fixed atmospheric absorption, fixed ground reflection double-counting, added comprehensive docs |
| `apps/web/src/main.ts` | Debug logging for probe request/response flow |
| `.github/PROBE_ENHANCEMENTS.md` | Updated with fix details and current state |

---

## ✅ Building Occlusion Implementation (Jan 7, 2026)

### Features Implemented

1. **Building Occlusion (Polygon-Based)**
   - `pointInPolygon()` - Ray casting algorithm for polygon intersection
   - `segmentIntersectsPolygon()` - Check if a line segment crosses a polygon with entry/exit points
   - `pathHeightAtPoint()` - Calculate path height at any 2D point (for 3D height check)
   - `extractBuildingFootprints()` - Extract building data from wall segments
   - `findBlockingBuilding()` - Find which building blocks a 3D path (with height awareness)

2. **Building Diffraction (Per-Band Frequency Dependence)**
   - `findVisibleCorners()` - Find building corners visible from a point (for horizontal diffraction)
   - `traceBuildingDiffractionPaths()` - Compute all valid diffraction paths (roof + corners)
   - `doubleEdgeDiffraction()` - Uses coefficient **40** for roof paths: `A = 10·log₁₀(3 + 40·N)`, capped at 25 dB
   - `singleEdgeDiffraction()` - Uses coefficient **20** for corner paths: `A = 10·log₁₀(3 + 20·N)`, capped at 20 dB

3. **Coherent Phasor Summation**
   - All diffraction paths (roof + corners) are summed coherently with phase
   - Phase: `φ = -k × total_distance + phase_shift`
   - Captures frequency-dependent interference patterns

### Physics Model

| Path Type | Diffraction Coefficient | Max Attenuation | Frequency Effect |
|-----------|------------------------|-----------------|------------------|
| Over-roof (double-edge) | 40 | 25 dB | Strong (low freq easy, high freq blocked) |
| Around-corner (single-edge) | 20 | 20 dB | Moderate |

**Example at 1000 Hz with δ = 5m path difference:**
- Fresnel number: `N = 2 × 5 / 0.343 = 29.2`
- Roof loss: `10·log₁₀(3 + 40 × 29.2) = 30.7 dB` → capped to **25 dB**
- Corner loss: `10·log₁₀(3 + 20 × 29.2) = 27.7 dB` → capped to **20 dB**

---

## ✅ Bug Fix: Wall Reflections Bypassing Building Occlusion (Jan 7, 2026)

### Problem

After implementing building occlusion, the probe showed ~61 dB while the receiver showed ~44 dB(Z) - a ~17 dB discrepancy.

**Root Cause:** Wall reflections from building walls were NOT being checked for building occlusion. When the direct path was blocked by a building, the wall reflections from that same building's walls were still being added to the phasor sum, creating invalid paths that bypassed the building.

```
        S                              R
         \                            /
          \   [BLOCKED by building]  /
           ─────────X───────────────
                    │ BUILDING │
                    └──────────┘
                         │
                    Wall reflections from building walls
                    were being added even though they
                    would pass THROUGH the building!
```

### Fix

Updated `traceWallReflectionPaths()` to:

1. **Check OTHER buildings:** Both legs of the reflection path (source→wall, wall→receiver) are validated against all buildings except the one owning the wall.

2. **Check SAME building:** Even for the building owning the wall, verify that neither leg passes through the building's interior (which would happen for walls on the "wrong" side).

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

if (leg1Block.blocked || leg2Block.blocked || blockedBySameBuilding) continue;
```

### Result

- Probe and receiver now show consistent levels (~44 dB vs ~44 dB)
- Building occlusion properly blocks invalid wall reflection paths
- Only geometrically valid reflection paths are included in coherent summation

### Files Modified

| File | Changes |
|------|---------|
| `apps/web/src/probeWorker.ts` | Added building occlusion, diffraction, and fixed wall reflection validation |
| `.github/PROBE_ENHANCEMENTS.md` | Documented implementation and bug fix |

---

## Previous Debug Sessions (Archived)

### Jan 5, 2026: Stale Build Cache

Application appeared completely non-functional. Root cause was stale `dist/` folder missing compiled JS files. Added `npm run rebuild` command.

### Jan 6, 2026: Early Return Issue

Added `requestLiveProbeUpdates()` call before early return in `computeSceneIncremental()` to ensure probe updates happen during drag operations.

---

## 🔮 Future: Wall Reflections for Diffracted Paths

> **Status:** Future Enhancement (User-Selectable)
> **Priority:** Low
> **Target:** Enable wall reflections on diffracted paths for increased accuracy

### Problem Statement

Currently, when a direct path is blocked by a building:
1. We compute diffraction paths (over roof + around corners)
2. Each diffraction path creates a phasor with proper attenuation and phase
3. All paths are summed coherently

However, these diffracted paths are treated as **terminal** — they cannot undergo further wall reflections. In reality, a diffracted sound wave can reflect off nearby building walls, creating additional propagation paths.

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
                                       │  (nearby)   │
                                       └─────────────┘
                                             ↑
                             Currently: No reflection computed
                             from diffracted path off Building B
```

**What we compute:**
- S → Roof → R (diffracted path) ✅

**What we DON'T compute:**
- S → Roof → Wall_B → R (diffracted + reflected path) ❌

### Proposed Enhancement

Add an option to trace wall reflections from diffracted paths, creating second-order hybrid paths:

```typescript
interface DiffractionConfig {
  // ... existing options ...

  // NEW: Enable wall reflections on diffracted paths
  enableDiffractedPathReflections: boolean;  // default: false

  // Maximum reflection order for diffracted paths
  // (0 = no reflections, 1 = first-order only)
  maxDiffractedPathReflectionOrder: number;  // default: 1
}
```

### Physics Model

**Diffraction + Reflection Path:**

```
        S                              R
         \                            /
          \                          /↗
           A₁ ──→ ●────────●       ╱
                  │  ROOF  │      ╱
           ═══════╧════════╧═══  ╱   Building A
                             ↘  ╱
                              ●──── Reflection point
                              │
                        ┌─────┴─────────┐
                        │   Building B  │
                        └───────────────┘

    Path: S → Edge1 → Edge2 → Wall_B → R

    Attenuation = A_diffraction(S→E1→E2) + A_spreading(E2→Wall→R) + A_reflection
    Phase = -k × total_path_length + φ_diffraction + φ_reflection
```

**Computation Steps:**

1. Trace diffraction path: S → Edge1 → Edge2 (compute intermediate point)
2. From Edge2, trace wall reflection paths to R (image source method)
3. Combine diffraction loss with reflection loss
4. Create phasor with total attenuation and phase
5. Add to coherent summation

### Implementation Approach

```typescript
function traceDiffractedReflectionPaths(
  source: Point3D,
  receiver: Point3D,
  blockingBuilding: BuildingFootprint,
  reflectingSurfaces: WallSegment[]
): RayPath[] {
  const paths: RayPath[] = [];

  // 1. Get diffraction exit point(s) from building
  const diffractionPaths = traceBuildingDiffractionPaths(source, receiver, blockingBuilding);

  for (const diffPath of diffractionPaths) {
    if (!diffPath.valid) continue;

    // 2. The "exit point" becomes a virtual source for reflection tracing
    const exitPoint = diffPath.waypoints[diffPath.waypoints.length - 2]; // Last point before receiver

    // 3. Trace wall reflections from exit point to receiver
    const reflectionPaths = traceWallReflectionPaths(
      exitPoint,
      receiver,
      reflectingSurfaces,
      [blockingBuilding.id]  // Exclude the blocking building itself
    );

    for (const reflPath of reflectionPaths) {
      if (!reflPath.valid) continue;

      // 4. Combine paths
      const combinedPath: RayPath = {
        type: 'diffracted-wall',
        totalDistance: diffPath.totalDistance + reflPath.totalDistance -
                       distance3D(exitPoint, receiver), // Avoid double-counting
        directDistance: diffPath.directDistance,
        pathDifference: /* computed from total path */,
        waypoints: [...diffPath.waypoints.slice(0, -1), ...reflPath.waypoints],
        absorptionFactor: diffPath.absorptionFactor * reflPath.absorptionFactor,
        reflectionPhaseChange: diffPath.reflectionPhaseChange + reflPath.reflectionPhaseChange,
        valid: true,
        diffractionLoss: diffPath.diffractionLoss,
      };

      paths.push(combinedPath);
    }
  }

  return paths;
}
```

### Per-Band Calculation

Each diffracted-reflected path gets per-band phasors:

```typescript
for (const path of diffractedReflectionPaths) {
  for (let bandIdx = 0; bandIdx < 9; bandIdx++) {
    const freq = OCTAVE_BANDS[bandIdx];
    const k = (2 * Math.PI * freq) / c;

    // Diffraction loss (frequency-dependent)
    const diffLoss = doubleEdgeDiffraction(path.diffractionPathDiff, freq, c);

    // Reflection loss (typically ~1 dB per reflection)
    const reflLoss = -20 * Math.log10(path.absorptionFactor);

    // Spreading + atmospheric
    const spreading = spreadingLoss(path.totalDistance);
    const atm = atmosphericAbsorption(freq, path.totalDistance);

    const level = sourceLevel - spreading - atm - diffLoss - reflLoss;
    const phase = -k * path.totalDistance + path.reflectionPhaseChange;

    phasors[bandIdx].push({ pressure: dBToPressure(level), phase });
  }
}
```

### UI Configuration

Add toggle in advanced settings:

```
┌─────────────────────────────────────────────────────────────┐
│ Advanced Probe Settings                                     │
├─────────────────────────────────────────────────────────────┤
│ ☑ Enable coherent phasor summation                          │
│ ☑ Enable ground reflection                                  │
│ ☑ Enable wall reflections (first-order)                     │
│ ☑ Enable building diffraction                               │
│                                                             │
│ ☐ Enable wall reflections on diffracted paths               │
│   └─ ⚠️ Increases computation time significantly            │
│                                                             │
│ Maximum reflection order: [1] ▼                             │
└─────────────────────────────────────────────────────────────┘
```

### Performance Considerations

This enhancement significantly increases path count:
- Current: ~1-5 paths per source (direct + ground + walls + diffraction)
- With diffracted reflections: Potentially 10-20+ paths per source

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

### Implementation Phases

| Phase | Task | Effort |
|-------|------|--------|
| 1 | Add `enableDiffractedPathReflections` config option | Low |
| 2 | Implement `traceDiffractedReflectionPaths()` function | Medium |
| 3 | Integrate with existing coherent summation | Medium |
| 4 | Add UI toggle in advanced settings | Low |
| 5 | Performance optimization (culling, caching) | Medium |
| 6 | Validation against reference measurements | High |

### Files to Modify

| File | Changes |
|------|---------|
| `apps/web/src/probeWorker.ts` | Add diffracted-reflection path tracing |
| `packages/core/src/schema/index.ts` | Add config option to PropagationConfig |
| `apps/web/src/main.ts` | Add UI toggle |

### Success Criteria

1. ✅ Diffracted paths can spawn wall reflections
2. ✅ Per-band frequency dependence preserved
3. ✅ Coherent phasor summation includes all paths
4. ✅ Performance acceptable (< 100ms for typical scenes)
5. ✅ UI toggle to enable/disable feature
6. ✅ Default OFF for backward compatibility

---

## References

- ISO 9613-2: Attenuation of sound during propagation outdoors
- Maekawa, Z. (1968). "Noise reduction by screens"
- Keller, J.B. (1962). "Geometrical theory of diffraction"
- Pierce, A.D. (1981). "Acoustics: An Introduction to Its Physical Principles and Applications"
- Delany, M.E. & Bazley, E.N. (1970). "Acoustical properties of fibrous absorbent materials"
