# GeoNoise Physics Reference

This document contains all acoustic propagation formulas and physics models used in GeoNoise. For implementation details, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Table of Contents

1. [Spreading Loss](#1-spreading-loss)
2. [Atmospheric Absorption](#2-atmospheric-absorption)
3. [Ground Effect](#3-ground-effect)
4. [Barrier Diffraction (Thin Screen)](#4-barrier-diffraction-thin-screen)
5. [Building Diffraction (Thick Barrier)](#5-building-diffraction-thick-barrier)
6. [Horizontal Diffraction Around Buildings](#6-horizontal-diffraction-around-buildings)
7. [Total Attenuation](#7-total-attenuation)
8. [Sound Pressure Level](#8-sound-pressure-level)
9. [Frequency Weighting](#9-frequency-weighting)
10. [Two-Ray Ground Reflection](#10-two-ray-ground-reflection)
11. [Coherent Phasor Summation](#11-coherent-phasor-summation)
12. [Diffraction Model Comparison](#12-diffraction-model-comparison)
13. [References](#13-references)

---

## 1. Spreading Loss

Sound energy spreads over an increasing area as it propagates from the source.

### Spherical Spreading (Point Source)

```
A_div = 20·log₁₀(r) + 11 dB
```

Where `r` is distance in meters (clamped to minimum for stability).

### Cylindrical Spreading (Line Source)

```
A_div = 10·log₁₀(r) + 8 dB
```

**Implementation**: [packages/engine/src/propagation/index.ts](../packages/engine/src/propagation/index.ts) - `spreadingLoss()`

---

## 2. Atmospheric Absorption

Frequency-dependent absorption due to molecular relaxation in air.

### Formula

```
A_atm = α(f, T, RH, p) × r  (dB)
```

Where:
- `α` = frequency-dependent attenuation coefficient (dB/m)
- `f` = frequency (Hz)
- `T` = temperature (°C)
- `RH` = relative humidity (%)
- `p` = atmospheric pressure (kPa)
- `r` = distance (m)

### Available Models

GeoNoise offers two atmospheric absorption models selectable via Settings → Simulation Physics → Atmospheric Model:

| Model | Method | Accuracy | Speed |
|-------|--------|----------|-------|
| **Simple** | Lookup table with T/RH corrections | Good for typical conditions | Fast |
| **ISO 9613-1** | Full physical calculation with O₂/N₂ molecular relaxation | High accuracy across all conditions | Slightly slower |

**Simple Model:** Uses pre-computed absorption coefficients for standard conditions (20°C, 50% RH) with linear corrections for temperature and humidity. Suitable for most practical applications.

**ISO 9613-1 Model:** Calculates absorption from first principles using molecular relaxation frequencies of oxygen and nitrogen. More accurate for extreme temperatures, humidity levels, or long propagation distances.

### ISO 9613-1 Coefficients

At 20°C, 70% RH, typical values are:

| Frequency (Hz) | α (dB/km) |
|----------------|-----------|
| 63             | 0.1       |
| 125            | 0.4       |
| 250            | 1.0       |
| 500            | 1.9       |
| 1000           | 3.7       |
| 2000           | 9.7       |
| 4000           | 32.8      |
| 8000           | 117.0     |
| 16000          | 340.0     |

**Implementation**: [packages/engine/src/propagation/index.ts](../packages/engine/src/propagation/index.ts) - `totalAtmosphericAbsorption()`

---

## 3. Ground Effect

### ISO 9613-2 Equation 10 (Legacy Model)

Soft ground reflection attenuation:

```
h_m = (h_s + h_r) / 2
A_gr = max(0, 4.8 - (2·h_m/d)·(17 + 300/d))
```

Where:
- `h_s` = source height (m)
- `h_r` = receiver height (m)
- `d` = horizontal distance source → receiver (m)
- `h_m` = mean path height (m)

### Two-Ray Phasor Model

See [Section 10: Two-Ray Ground Reflection](#10-two-ray-ground-reflection) for the advanced coherent model.

**Implementation**: [packages/engine/src/propagation/index.ts](../packages/engine/src/propagation/index.ts) - `groundEffect()`

---

## 4. Barrier Diffraction (Thin Screen)

Sound bends around obstacles via diffraction. For a **thin barrier** (wall, fence), we use the Maekawa formula based on the Fresnel number.

### Geometry (Over-Top Diffraction)

```
        S                    R
         \                  /
          \    δ = A+B-d   /
           \      ↓       /
            A ──→ ● ←── B     (single diffraction point at barrier top)
                  │
            ══════╧══════     Thin barrier (negligible thickness)
                  ↑
            Barrier height h
```

### Path Difference

```
A = distance from Source to barrier top
B = distance from barrier top to Receiver
d = direct distance Source → Receiver

δ = A + B - d
```

### Fresnel Number

```
N = 2δ/λ = 2δf/c
```

Where:
- `λ` = wavelength (m)
- `f` = frequency (Hz)
- `c` = speed of sound ≈ 343 m/s

### Maekawa Insertion Loss

```
A_bar = 10·log₁₀(3 + 20·N)    for N ≥ -0.1
A_bar = 0                      for N < -0.1 (no shadow zone)
A_bar capped at 20-25 dB       (single-screen limit)
```

### Physical Interpretation

- Higher frequency → larger N → more attenuation (shadow zone deepens)
- Larger path difference → larger N → more attenuation
- Low frequencies diffract easily (small N) → less attenuation

---

## 4.1 Barrier Side Diffraction (Horizontal)

**Added in v0.4.2**

For finite-length barriers, sound can also diffract **around the ends** (horizontal diffraction), not just over the top (vertical diffraction).

### Geometry (Top-Down View)

```
              BARRIER (finite length)
              ══════════════════════
             ●                      ●
         Left Edge              Right Edge
            (p1)                   (p2)
             ↑                      ↑
            /                        \
           /                          \
    S ────┘                            └──── R
   (source)   ← PATH A: around left    (receiver)
              ← PATH B: around right →
```

### Side Path Difference

For each barrier edge (left/right):

```
δ_side = |S→Edge| + |Edge→R| - |S→R|
```

Where:
- `S→Edge` = 3D distance from source to barrier edge point
- `Edge→R` = 3D distance from edge point to receiver
- `S→R` = direct 3D distance (blocked by barrier)

### Combined Path Selection

When side diffraction is enabled, compute all three paths and select the **minimum δ** (least obstructed path):

```typescript
δ_top   = computeTopDiffraction(...)      // Over-top path
δ_left  = computeSidePathDelta(leftEdge)  // Around left edge
δ_right = computeSidePathDelta(rightEdge) // Around right edge

δ_effective = min(δ_top, δ_left, δ_right)
```

The path with minimum δ produces minimum attenuation, representing the "loudest" diffraction path that sound can take.

### Side Diffraction Toggle

| Mode | Behavior | Use Case |
|------|----------|----------|
| `off` | Over-top only (ISO 9613-2 infinite barrier assumption) | Long barriers, noise walls |
| `auto` | Enable for barriers < 50m (default) | General use, most realistic |
| `on` | Enable for all barriers | Short barriers, fences |

### Auto Mode Threshold

| Barrier Length | Side Diffraction | Rationale |
|----------------|------------------|-----------|
| < 20m | Always useful | Side paths often shorter than over-top |
| 20-50m | Usually useful | Depends on geometry |
| > 50m | Rarely useful | Side path so long that over-top dominates |
| > 100m | Never useful | Effectively infinite barrier |

### Implementation Files

- **Schema**: [packages/core/src/schema/index.ts](../packages/core/src/schema/index.ts) - `BarrierSideDiffractionSchema`
- **Engine**: [packages/engine/src/compute/index.ts](../packages/engine/src/compute/index.ts) - `computeSidePathDelta()`, `shouldUseSideDiffraction()`
- **Probe Worker**: [apps/web/src/probeWorker.ts](../apps/web/src/probeWorker.ts) - `traceBarrierDiffractionPaths()`

**Implementation**: [packages/engine/src/propagation/index.ts](../packages/engine/src/propagation/index.ts) - `barrierAttenuation()`

---

## 5. Building Diffraction (Thick Barrier)

For a **thick obstacle** like a building, sound must diffract **twice** — once at the near edge (entry), once at the far edge (exit). This is called **double-edge diffraction**.

### Geometry

```
        S                              R
         \                            /
          \  δ₁                  δ₂  /
           \  ↓                  ↓  /
            A₁ ──→ ●────────● ←── A₂
                   │ ROOF   │
            ═══════╧════════╧═══════   Building (thick obstacle)
                   ↑        ↑
              Edge 1    Edge 2
              (near)    (far)

    Path: S → Edge1 → Edge2 → R  (over the roof)
```

### Path Segments

```
A₁ = distance from Source to Edge 1 (near roof edge)
T  = distance across roof (Edge 1 → Edge 2)
A₂ = distance from Edge 2 to Receiver
d  = direct distance Source → Receiver

Total detour path: A₁ + T + A₂
Path difference: δ = (A₁ + T + A₂) - d
```

### Double-Edge Fresnel Approach

**Modified Maekawa Coefficient:**

For double diffraction, use coefficient 40 instead of 20:

```
N = 2δ/λ                              (Fresnel number for total path difference)
A_bar = 10·log₁₀(3 + 40·N)            (double-edge formula)
A_bar capped at 25-30 dB              (thick barrier limit)
```

### Example Calculation

```
Building: 10m wide, 8m tall
Source:   5m from building, z = 1.5m
Receiver: 10m from building, z = 1.5m
Frequency: 1000 Hz (λ = 0.343m)

Heights above receiver plane:
  Δh = 8m - 1.5m = 6.5m

Path calculation:
  A₁ = √(5² + 6.5²) = 8.2m    (source to roof edge 1)
  T  = 10m                     (across roof)
  A₂ = √(10² + 6.5²) = 11.9m   (roof edge 2 to receiver)

  Total detour = 8.2 + 10 + 11.9 = 30.1m
  Direct path d = √((5+10+10)² + 0²) = 25m

  Path difference δ = 30.1 - 25 = 5.1m

Fresnel number:
  N = 2 × 5.1 / 0.343 = 29.7

Insertion loss (double-edge):
  A_bar = 10·log₁₀(3 + 40 × 29.7) = 30.8 dB
  → Capped at ~25 dB
```

### Comparison: Thin vs Thick Barriers

```
┌─────────────────────┬─────────────────┬───────────────────┐
│ Aspect              │ Thin Barrier    │ Thick Building    │
├─────────────────────┼─────────────────┼───────────────────┤
│ Diffraction points  │ 1 (top edge)    │ 2 (entry + exit)  │
│ Path                │ S → Edge → R    │ S → E1 → E2 → R   │
│ Maekawa coefficient │ 20              │ 40 (≈ 2× loss)    │
│ Typical max loss    │ 20 dB           │ 25-30 dB          │
│ Frequency effect    │ Higher f = more │ Same, but more    │
│                     │ attenuation     │ pronounced        │
└─────────────────────┴─────────────────┴───────────────────┘
```

---

## 6. Horizontal Diffraction Around Buildings

Sound can also diffract **around** buildings horizontally, not just over them. This requires finding the shortest path around building corners.

### Geometry (Top-Down View)

```
                    ┌───────────────┐
                    │               │
        S ─────────→│   BUILDING    │←───────── R
                    │               │
                    └───────────────┘

        Path blocked by building footprint

        Alternative: Diffract around corner(s)

                    ┌───────────────┐
                    │               │
        S ─────────→●               │            R
                   /│               │           /
                  / └───────────────┘          /
                 /                            /
                └────────────────────────────┘
                    Diffracted path around corner
```

### Path Options

```
1. Over the roof (vertical diffraction)
   - Uses building height
   - Double-edge as described above

2. Around left corner (horizontal diffraction)
   - Uses building footprint geometry
   - May be single or double edge depending on building shape

3. Around right corner (horizontal diffraction)
   - Same as left, different path

4. Combined paths (multiple diffractions)
   - L-shaped buildings may require corner + edge
```

### Selection Logic

```
For each blocked path, find minimum-loss diffraction route:

  loss_over  = double_edge_loss(roof_path)
  loss_left  = edge_loss(left_corner_path)
  loss_right = edge_loss(right_corner_path)

  effective_loss = min(loss_over, loss_left, loss_right)

  // In practice, energetic sum of all paths may be used
  // for more accurate interference modeling
```

---

## 7. Total Attenuation

### Unblocked Path

```
A_total = A_div + A_atm + A_gr
```

### Blocked Path (Barrier Present)

```
A_total = A_div + A_atm + max(A_bar, A_gr)
```

The `max()` term prevents a barrier from making results louder than the unblocked case.

---

## 8. Sound Pressure Level

```
SPL = L_w - A_total
```

Where:
- `L_w` = source sound power level (dB re 1 pW)
- `A_total` = total path attenuation (dB)

---

## 9. Frequency Weighting

### A-Weighted Overall Level (LAeq)

```
LAeq = 10·log₁₀[Σᵢ 10^((Lᵢ + Aᵢ)/10)]
```

Where:
- `Lᵢ` = band level at frequency i
- `Aᵢ` = A-weighting correction for band i

### A-Weighting Corrections (Octave Bands)

| Frequency (Hz) | A-Weighting (dB) |
|----------------|------------------|
| 63             | -26.2            |
| 125            | -16.1            |
| 250            | -8.6             |
| 500            | -3.2             |
| 1000           | 0.0              |
| 2000           | +1.2             |
| 4000           | +1.0             |
| 8000           | -1.1             |
| 16000          | -6.6             |

### C-Weighting

Similar formula with C-weighting corrections (flatter response).

### Z-Weighting (Unweighted)

Linear summation without frequency correction:

```
LZeq = 10·log₁₀[Σᵢ 10^(Lᵢ/10)]
```

---

## 10. Two-Ray Ground Reflection

Advanced coherent model for ground reflection with frequency-dependent interference.

### Path Geometry

```
r₁ = √(d² + (h_s - h_r)²)  (direct path)
r₂ = √(d² + (h_s + h_r)²)  (reflected path via image source)
```

### Phase Calculation

```
φ = -k(r₂ - r₁)  where k = 2πf/c
```

### Complex Reflection Coefficient

```
γ = (ζ·cosθ - 1)/(ζ·cosθ + 1)
```

Where `ζ` is the normalized ground impedance from the Delany-Bazley model.

### Ground Attenuation

```
A_gr = -20·log₁₀|1 + γ·(r₁/r₂)·e^(jφ)|
```

### Ground Types

| Ground Type | Flow Resistivity (σ) | |γ| at 1kHz | Phase |
|-------------|---------------------|------------|-------|
| Hard        | > 200,000 kPa·s/m²  | ~0.95      | ~0°   |
| Mixed       | 20,000 - 200,000    | ~0.7-0.9   | varies |
| Soft        | < 20,000            | ~0.6-0.7   | ~160-170° |

**Implementation**: [packages/engine/src/propagation/ground.ts](../packages/engine/src/propagation/ground.ts)

---

## 11. Coherent Phasor Summation

For probe calculations, all paths from the same source are summed coherently (with phase) to capture interference effects.

### Phasor Representation

```
Phasor = { pressure: number, phase: number }
```

Where:
- `pressure` = sound pressure amplitude (Pa)
- `phase` = phase angle (radians)

### dB to Pressure Conversion

```
pressure = p_ref × 10^(L_dB/20)
p_ref = 2×10⁻⁵ Pa (reference pressure)
```

### Coherent Summation

```
p_total = √[(Σᵢ pᵢ·cos(φᵢ))² + (Σᵢ pᵢ·sin(φᵢ))²]
```

Convert back to dB:

```
L_total = 20·log₁₀(p_total / p_ref)
```

### Path Phase Calculation

```
φ = -k × distance + reflection_phase_shift

k = 2πf/c
```

### Summation Rules

- **Same source, multiple paths**: Coherent (phasor) summation → captures interference
- **Different sources**: Energetic (incoherent) summation → independent sources

**Implementation**: [packages/shared/src/phasor/index.ts](../packages/shared/src/phasor/index.ts)

---

## 12. Diffraction Model Comparison

### Barrier Diffraction Models

#### Maekawa (1968) - Current Default

```
A_bar = 10·log₁₀(3 + 20·N)     for N ≥ 0
A_bar = 0                       for N < -0.1
```

**Pros:** Fast, simple, widely validated
**Cons:** Less accurate for low Fresnel numbers

#### Kurze-Anderson (1971)

```
For N > 0:
  A_bar = 5 + 20·log₁₀(√(2πN) / tanh(√(2πN)))

Simplified:
  N < 0:     A_bar = 0
  0 ≤ N < 1: A_bar ≈ 5 + 20·log₁₀(√(2πN) · (1 - N/3))
  N ≥ 1:     A_bar ≈ 5 + 20·log₁₀(√(2πN))
```

**Pros:** Better at low N values, smooth transition at N=0
**Cons:** Slightly more complex, marginal improvement

#### Model Comparison Table

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

### Building Diffraction Models

#### Blocking-Only

No diffraction calculation. Blocked paths have infinite attenuation.

```
if (pathIntersectsBuilding && pathHeight < buildingTop) {
  attenuation = Infinity;
} else {
  attenuation = 0;
}
```

#### Double-Edge Maekawa (Recommended)

Uses modified coefficient 40:

```
A_bar = 10·log₁₀(3 + 40·N)
Max attenuation: ~25-30 dB
```

#### Pierce Thick Barrier (1974)

Treats each edge independently with coupling correction:

```
D_total = D₁ + D₂ + C

Where:
  D₁ = Maekawa loss for first edge
  D₂ = Maekawa loss for second edge
  C  = coupling correction (0 to 6 dB)
```

**Comparison:**

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

---

## 13. References

- **ISO 9613-1**: Calculation of the absorption of sound by the atmosphere
- **ISO 9613-2**: Attenuation of sound during propagation outdoors — Part 2: General method of calculation
- **Maekawa, Z. (1968)**: "Noise reduction by screens" - Applied Acoustics 1(3): 157-173
- **Kurze, U.J. and Anderson, G.S. (1971)**: "Sound attenuation by barriers" - Applied Acoustics 4(1): 35-53
- **Pierce, A.D. (1981)**: "Acoustics: An Introduction to Its Physical Principles and Applications"
- **Keller, J.B. (1962)**: "Geometrical theory of diffraction" - Journal of the Optical Society of America
- **Delany, M.E. & Bazley, E.N. (1970)**: "Acoustical properties of fibrous absorbent materials" - Applied Acoustics 3(2): 105-116

---

*See also: [ARCHITECTURE.md](./ARCHITECTURE.md) for implementation details and component breakdown.*
