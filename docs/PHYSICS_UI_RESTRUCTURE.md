# Physics Settings UI Restructure

> **Document Date:** 2026-01-11
> **Status:** Proposed
> **Goal:** Separate Grid and Probe engine settings with COMSOL-style live equations

---

## Overview

GeoNoise uses two calculation engines with different physics models. The current UI conflates settings that affect different engines, causing confusion. This document proposes a restructured settings panel that clearly separates:

1. **Shared settings** - Environment and geometry (affect both engines)
2. **Grid Engine settings** - For heatmaps, receivers, measure grids
3. **Probe Engine settings** - For probe microphones only

Each setting includes a collapsible equation display that updates based on the selected option.

---

## Settings Architecture

### 🌍 SHARED (Both Engines)

These settings define the physical environment and affect both calculation engines identically.

| Setting | Options | Description |
|---------|---------|-------------|
| **Temperature** | -10 to 40 °C | Affects speed of sound and atmospheric absorption |
| **Humidity** | 10 to 100 % | Affects atmospheric absorption coefficients |
| **Pressure** | 95 to 108 kPa | Affects atmospheric absorption coefficients |
| **Ground Surface** | Hard / Mixed / Soft | Physical ground type (impedance) |
| **Spreading Loss** | Spherical / Cylindrical | Point source vs line source |
| **Atmospheric Absorption** | None / Simple / ISO 9613-1 | Air absorption model |

---

### 📊 GRID ENGINE (Heatmaps, Receivers, Measure Grids)

Single-path calculation with incoherent source summation.

| Setting | Options | Description |
|---------|---------|-------------|
| **Ground Effects** | Toggle | Enable/disable ground effect calculation |
| **Ground Effect Model** | ISO 9613-2 / Ground Interference | How A_gr is calculated |
| **Mixed Ground Interpolation** | ISO 9613-2 / Logarithmic | Sigma interpolation for mixed ground |
| **Side Diffraction** | Off / Auto / On | Horizontal diffraction around barrier ends |

---

### 🎤 PROBE ENGINE (Probe Microphones)

Multi-path ray tracing with coherent phasor summation.

| Setting | Options | Description |
|---------|---------|-------------|
| **Ground Reflection** | Toggle | Trace ground-reflected ray |
| **Wall Reflections** | Toggle | Trace 1st-order wall reflection rays |
| **Barrier Diffraction** | Toggle | Trace over-top and side diffraction paths |
| **Sommerfeld Correction** | Toggle | Spherical wave ground correction |
| **Ground Impedance Model** | Delany-Bazley / Delany-Bazley-Miki | Surface impedance calculation |

> **Note:** Side diffraction is always ON for Probe engine (all paths are traced).

---

## COMSOL-Style Equation Display

Each physics option includes a collapsible equation section that shows the formula being used. When the user changes a setting, the equation updates to reflect the new selection.

### Design Pattern

```
┌─────────────────────────────────────────────────────────────┐
│ Ground Effect Model                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Ground Interference                                   ▼ │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ▶ Equation                                    [collapsed]   │
└─────────────────────────────────────────────────────────────┘

     ↓ Click to expand ↓

┌─────────────────────────────────────────────────────────────┐
│ Ground Effect Model                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Two-Ray Phasor                                        ▼ │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ▼ Equation                                     [expanded]   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                                                         │ │
│ │   Agr = -20·log₁₀|1 + Γ·(r₁/r₂)·e^(jk(r₂-r₁))|         │ │
│ │                                                         │ │
│ │   where:                                                │ │
│ │     Γ = reflection coefficient (Fresnel)                │ │
│ │     r₁ = direct path length                             │ │
│ │     r₂ = ground-reflected path length                   │ │
│ │     k = 2πf/c (wavenumber)                              │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Complete Equations Reference

### Shared Settings

#### Spreading Loss

<details>
<summary><strong>Spherical (Point Source)</strong></summary>

```
A_div = 20·log₁₀(d) + 10·log₁₀(4π)
      = 20·log₁₀(d) + 10.99 dB

where:
  d = 3D distance from source to receiver (m)
  4π = solid angle of full sphere (steradians)
```

**Derivation:** Sound power W spreads over sphere surface 4πr², so intensity I = W/(4πr²)

</details>

<details>
<summary><strong>Cylindrical (Line Source)</strong></summary>

```
A_div = 10·log₁₀(d) + 10·log₁₀(2π)
      = 10·log₁₀(d) + 7.98 dB

where:
  d = perpendicular distance from line source (m)
  2π = circumference factor
```

**Derivation:** Sound power spreads over cylinder surface 2πrL, giving 10·log₁₀ decay

</details>

---

#### Atmospheric Absorption

<details>
<summary><strong>None</strong></summary>

```
A_atm = 0
```

Atmospheric absorption disabled.

</details>

<details>
<summary><strong>Simple (Lookup Table)</strong></summary>

```
A_atm = α(f) · d / 1000

where α (dB/km) at 20°C, 50% RH:
  ┌────────┬───────┬───────┬───────┬───────┬───────┬───────┬───────┬───────┐
  │ 63 Hz  │125 Hz │250 Hz │500 Hz │ 1 kHz │ 2 kHz │ 4 kHz │ 8 kHz │16 kHz │
  ├────────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┤
  │  0.1   │  0.4  │  1.0  │  1.9  │  3.7  │  9.7  │  33   │  117  │  392  │
  └────────┴───────┴───────┴───────┴───────┴───────┴───────┴───────┴───────┘
```

Linear temperature/humidity correction applied.

</details>

<details>
<summary><strong>ISO 9613-1 (Full Calculation)</strong></summary>

```
A_atm = α · d / 1000

α = 8.686·f² × [
    1.84×10⁻¹¹ (p/p₀)⁻¹ (T/T₀)^(1/2)
    + (T/T₀)^(-5/2) × (
        0.01275·e^(-2239.1/T) × f_rO/(f_rO² + f²)
      + 0.1068·e^(-3352/T) × f_rN/(f_rN² + f²)
    )
]

where:
  T = absolute temperature (K)
  p = atmospheric pressure (kPa)
  f_rO = O₂ relaxation frequency
  f_rN = N₂ relaxation frequency

f_rO = (p/p₀) × [24 + 4.04×10⁴·h·(0.02+h)/(0.391+h)]
f_rN = (p/p₀) × (T/T₀)^(-1/2) × [9 + 280·h·e^(-4.17×((T/T₀)^(-1/3) - 1))]
```

Full molecular relaxation model per ISO 9613-1:1993.

</details>

---

#### Side Diffraction

<details>
<summary><strong>Off (Over-top only)</strong></summary>

```
δ = A + B - d_direct

where:
  A = distance from source to barrier top
  B = distance from barrier top to receiver
  d_direct = direct source-receiver distance

Only vertical (over-top) diffraction computed.
ISO 9613-2 assumption of infinite barriers.
```

</details>

<details>
<summary><strong>Auto (< 50m barriers)</strong></summary>

```
For barriers with length < 50m:

  δ_top   = A + B - d_direct           (over top)
  δ_left  = |S→P₁| + |P₁→R| - d_direct (around left end)
  δ_right = |S→P₂| + |P₂→R| - d_direct (around right end)

  δ = min(δ_top, δ_left, δ_right)

Sound takes path with minimum path difference.
```

</details>

<details>
<summary><strong>On (All barriers)</strong></summary>

```
For ALL barriers regardless of length:

  δ_top   = A + B - d_direct
  δ_left  = |S→P₁| + |P₁→R| - d_direct
  δ_right = |S→P₂| + |P₂→R| - d_direct

  δ = min(δ_top, δ_left, δ_right)

  A_bar = 10·log₁₀(3 + 20N)  where N = 2δ/λ
```

</details>

---

### Grid Engine Settings

#### Ground Effect Model

> **ISO 9613-2**: Empirical per-band coefficients, no interference effects
> **Ground Interference**: Models constructive/destructive interference between direct and ground-reflected paths (produces "ground dip" phenomenon)

<details>
<summary><strong>ISO 9613-2 (Tables 3-4)</strong></summary>

```
A_gr = A_s + A_r + A_m

Source region (A_s):
  A_s = -1.5 + G·a_s(f)·log(h_s) + G·b_s(f)·log(d_p,s) + G·c_s(f)
  d_p,s = min(30·h_s, d)

Receiver region (A_r):
  A_r = -1.5 + G·a_r(f)·log(h_r) + G·b_r(f)·log(d_p,r) + G·c_r(f)
  d_p,r = min(30·h_r, d)

Middle region (A_m):
  q = max(0, 1 - 30(h_s + h_r)/d)
  A_m = q·[a_m(f) + b_m(f)·(1-G)]

where:
  G = ground factor (0=hard, 0.5=mixed, 1=soft)
  h_s, h_r = source/receiver heights (m)
  d = horizontal distance (m)
  a,b,c = frequency-dependent coefficients from Tables 3-4

Frequency coefficients (ISO 9613-2 Table 3):
┌────────┬───────┬───────┬───────┬───────┬───────┬───────┬───────┬───────┐
│        │ 63 Hz │125 Hz │250 Hz │500 Hz │ 1 kHz │ 2 kHz │ 4 kHz │ 8 kHz │
├────────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┤
│ a'     │ -1.5  │ -1.5  │ -1.5  │ -1.5  │ -1.5  │ -1.5  │ -1.5  │ -1.5  │
│ b'     │ -3.0  │ -3.0  │ -3.0  │ -3.0  │ -3.0  │ -3.0  │ -3.0  │ -3.0  │
│ c'     │  ...  │  ...  │  ...  │  ...  │  ...  │  ...  │  ...  │  ...  │
└────────┴───────┴───────┴───────┴───────┴───────┴───────┴───────┴───────┘
```

**Characteristics:**
- ✅ ISO 9613-2 compliant
- ❌ No interference effects
- ❌ No ground dip phenomenon

</details>

<details>
<summary><strong>Ground Interference (Direct + Ground Bounce)</strong></summary>

```
        Direct ray (r₁)
   S ─────────────────────── R
    \                       /
     \        r₂           /
      ●───────────────────●
        Ground reflection

A_gr = -20·log₁₀|1 + Γ·(r₁/r₂)·e^(jk(r₂-r₁))|

Path lengths:
  r₁ = √(d² + (h_s - h_r)²)     (direct)
  r₂ = √(d² + (h_s + h_r)²)     (reflected)

Reflection coefficient:
  Γ = (Z_n·cosθ - 1) / (Z_n·cosθ + 1)

  cosθ = (h_s + h_r) / r₂

Normalized impedance (Delany-Bazley):
  Z_n = 1 + 9.08(f/σ)^(-0.75) - j·11.9(f/σ)^(-0.73)

where:
  σ = flow resistivity (Pa·s/m²)
      Hard: 200,000 | Mixed: interpolated | Soft: 20,000
  k = 2πf/c (wavenumber)
```

**Characteristics:**
- ❌ Not ISO compliant
- ✅ Models constructive/destructive interference
- ✅ Shows ground dip phenomenon
- ✅ Can produce negative A_gr (boost)

</details>

---

#### Mixed Ground Interpolation

<details>
<summary><strong>ISO 9613-2 (Linear G-factor)</strong></summary>

```
σ_eff = σ_soft / G

where:
  G = ground factor (0.5 for typical mixed)
  σ_soft = 20,000 Pa·s/m²

Example:
  G = 0.5 → σ_eff = 40,000 Pa·s/m²
```

Linear admittance interpolation per ISO 9613-2.

</details>

<details>
<summary><strong>Logarithmic (Physically Accurate)</strong></summary>

```
log(σ_eff) = G·log(σ_soft) + (1-G)·log(σ_hard)

σ_eff = σ_soft^G × σ_hard^(1-G)

where:
  G = ground factor (0 to 1)
  σ_soft = 20,000 Pa·s/m²
  σ_hard = 1,000,000,000 Pa·s/m² (≈∞)

Example:
  G = 0.5 → σ_eff = √(20,000 × 10⁹) ≈ 4.5×10⁶ Pa·s/m²
```

Geometric mean - more accurate for impedance calculations.

</details>

---

### Probe Engine Settings

#### Overall Probe Calculation

```
Final level at probe:

  L_p = 20·log₁₀|p_total / p_ref|

where:
  p_total = Σ pᵢ · e^(jφᵢ)     (coherent phasor sum)
  p_ref = 20 μPa

Each path i contributes:
  pᵢ = pressure amplitude (from source level and attenuation)
  φᵢ = -k·dᵢ + φ_reflection   (phase from path length + reflections)

Paths traced:
  • Direct (if unblocked)
  • Ground reflection (if enabled)
  • Wall reflections (if enabled, 1st order)
  • Barrier diffraction (over-top and sides)
```

---

#### Ground Reflection

<details>
<summary><strong>Enabled</strong></summary>

```
Ground-reflected path traced as separate ray:

       S (source)
      /|
     / |
    /  | h_s              Direct: r₁
   /   |
──●────┼────●────────────── Ground (z=0)
  └────┼────┘
       |    reflection     Reflected: r₂
       |    point
       ▼
       R (receiver)

Path geometry:
  r₁ = √(d² + (h_s - h_r)²)
  r₂ = √(d² + (h_s + h_r)²)

Ground ray phasor:
  p_ground = |Γ| · p_incident · (r₁/r₂)
  φ_ground = -k·r₂ + arg(Γ)

where Γ = complex reflection coefficient
```

Adds ground-reflected ray to coherent sum.

</details>

<details>
<summary><strong>Disabled</strong></summary>

```
No ground-reflected path traced.
Only direct path (and other enabled paths) contribute.
```

</details>

---

#### Wall Reflections

<details>
<summary><strong>Enabled (1st Order)</strong></summary>

```
Image source method for specular wall reflections:

         Wall
           │
   S ──────┼────── R
    \      │      /
     \     │     /
      S'   │    (S' = mirror of S across wall)

Reflection point:
  P = intersection of line R→S' with wall

Reflected path:
  d_refl = |S→P| + |P→R|

Wall ray phasor:
  p_wall = |Γ_wall| · p_incident · (r₁/d_refl)
  φ_wall = -k·d_refl + φ_surface

where:
  |Γ_wall| ≈ 0.9 (typical building, 10% absorption)
  φ_surface = 0 or π depending on material
```

First-order reflections from building walls.

</details>

<details>
<summary><strong>Disabled</strong></summary>

```
No wall reflection paths traced.
Buildings only provide occlusion/diffraction.
```

</details>

---

#### Barrier Diffraction

<details>
<summary><strong>Enabled</strong></summary>

```
Diffraction paths traced over and around barriers:

Over-top (thin barrier):
       ●─── diffraction point
      /│\
     / │ \
    S  │  R
       │
  ═════╧═════  Barrier

  δ = A + B - d_direct
  N = 2δ/λ (Fresnel number)
  A_diff = 10·log₁₀(3 + 20N)   cap 20 dB

Over-top (thick barrier / building):
       ●─────────●
      /│ roof    │\
     / │ width   │ \
    S  │    B    │  R
       │         │
  ═════╧═════════╧═════

  δ = A + B + C - d_direct
  A_diff = 10·log₁₀(3 + 40N)   cap 25 dB

Diffraction phasor:
  p_diff = p_incident × 10^(-A_diff/20)
  φ_diff = -k·(A+B) - π/4
```

</details>

<details>
<summary><strong>Disabled</strong></summary>

```
No diffraction paths traced.
Blocked paths contribute zero (full shadow).
```

</details>

---

#### Sommerfeld Correction

<details>
<summary><strong>Enabled</strong></summary>

```
Spherical wave correction for ground reflection:

Γ_spherical = Γ_plane + (1 - Γ_plane)·F(w)

where:
  Γ_plane = plane-wave reflection coefficient
  F(w) = Sommerfeld ground wave function
  w = numerical distance (complex)

Numerical distance:
  w = (1 + j)·√(k·r₂/2) · (cosθ + 1/Z_n)

F(w) approximation:
  |w| < 0.5:  F ≈ 1 (plane wave dominates)
  |w| > 6:    F ≈ -0.5/w² + 0.75/w⁴ (asymptotic)
  0.5-6:      Smooth interpolation

Corrects for spherical spreading near the ground at low frequencies.
```

</details>

<details>
<summary><strong>Disabled</strong></summary>

```
Γ = Γ_plane (no spherical correction)

Uses standard plane-wave Fresnel coefficient only.
Faster but less accurate at low frequencies near ground.
```

</details>

---

#### Ground Impedance Model

<details>
<summary><strong>Delany-Bazley</strong></summary>

```
Normalized surface impedance:

Z_n = 1 + 9.08(f/σ)^(-0.75) - j·11.9(f/σ)^(-0.73)

Valid range: 0.01 < f/σ < 1.0

where:
  f = frequency (Hz)
  σ = flow resistivity (Pa·s/m²)
      Hard: 200,000 | Soft: 20,000

Outside valid range:
  f/σ < 0.01: Returns high impedance (|Γ| ≈ 1)
  f/σ > 1.0:  Model breaks down (may produce errors)
```

Original Delany-Bazley (1970) empirical model. Use when strict
compliance with D-B is required, but be aware of range limitations.

</details>

<details>
<summary><strong>Delany-Bazley-Miki (Recommended)</strong></summary>

```
Hybrid model with automatic fallback:

  If 0.01 < f/σ < 1.0:
    Z_n = 1 + 9.08(f/σ)^(-0.75) - j·11.9(f/σ)^(-0.73)   [Delany-Bazley]

  If f/σ ≥ 1.0 (or f/σ < 0.01):
    Z_n = 1 + 5.50(f/σ)^(-0.632) - j·8.43(f/σ)^(-0.632) [Miki]

Miki valid range: 0.01 < f/σ < 10.0 (extended)

Reference: Y. Miki (1990), J. Acoust. Soc. Jpn.

More robust for:
  • High frequencies over soft ground (f/σ > 1.0)
  • Low frequencies over hard ground (f/σ < 0.01)
```

Delany-Bazley with automatic Miki fallback when outside D-B valid range.
Recommended for general use.

</details>

---

## Proposed UI Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PHYSICS                                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ┌─ SHARED ────────────────────────────────────────────────────────────┐ │
│ │                                                                     │ │
│ │ Ground Surface:       [Mixed ▼]                                     │ │
│ │ Spreading:            [Spherical ▼]                                 │ │
│ │   ▶ Equation                                                        │ │
│ │                                                                     │ │
│ │ Atm. Absorption:      [ISO 9613-1 ▼]                               │ │
│ │   ▶ Equation                                                        │ │
│ │                                                                     │ │
│ │ Side Diffraction:     [Auto < 50m ▼]                               │ │
│ │   ▶ Equation                                                        │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ┌─ 📊 GRID ENGINE ────────────────────────────────────────────────────┐ │
│ │ Heatmaps · Receivers · Measure Grids                                │ │
│ │                                                                     │ │
│ │ ☑ Ground Effects                                                    │ │
│ │                                                                     │ │
│ │ Ground Effect Model:  [Ground Interference ▼]                      │ │
│ │   ▼ Equation                                                        │ │
│ │   ┌───────────────────────────────────────────────────────────────┐ │ │
│ │   │ A_gr = -20·log₁₀|1 + Γ·(r₁/r₂)·e^(jk(r₂-r₁))|                 │ │ │
│ │   │                                                               │ │ │
│ │   │ where Γ = (Z_n·cosθ - 1)/(Z_n·cosθ + 1)                       │ │ │
│ │   └───────────────────────────────────────────────────────────────┘ │ │
│ │                                                                     │ │
│ │ Mixed Interpolation:  [Logarithmic ▼]   (if Mixed)                 │ │
│ │   ▶ Equation                                                        │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ┌─ 🎤 PROBE ENGINE ───────────────────────────────────────────────────┐ │
│ │ Probe Microphones · Frequency Response                              │ │
│ │                                                                     │ │
│ │ Paths Traced:                                                       │ │
│ │   ☑ Ground Reflection                                               │ │
│ │   ☑ Wall Reflections                                                │ │
│ │   ☑ Barrier Diffraction                                             │ │
│ │                                                                     │ │
│ │ Ground Physics:                                                     │ │
│ │   ☑ Sommerfeld Correction                                          │ │
│ │     ▶ Equation                                                      │ │
│ │                                                                     │ │
│ │   Impedance Model:    [Delany-Bazley ▼]                            │ │
│ │     ▶ Equation                                                      │ │
│ │                                                                     │ │
│ │ ┌───────────────────────────────────────────────────────────────┐   │ │
│ │ │ 📐 p = Σ pᵢ · e^(j·φᵢ)   where φᵢ = -k·dᵢ + φ_refl            │   │ │
│ │ └───────────────────────────────────────────────────────────────┘   │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Notes

### Equation Display Component

```typescript
interface EquationDisplay {
  collapsed: boolean;
  equation: string;       // Main formula (LaTeX or Unicode)
  description?: string;   // "where:" section
  references?: string[];  // ISO references, papers
}

// Example: Render equation based on selected option
function getGroundEffectEquation(model: 'iso9613' | 'groundInterference'): EquationDisplay {
  if (model === 'groundInterference') {
    return {
      collapsed: true,
      equation: 'A_gr = -20·log₁₀|1 + Γ·(r₁/r₂)·e^(jk(r₂-r₁))|',
      description: 'Γ = reflection coefficient, r₁/r₂ = path lengths, k = wavenumber',
    };
  } else {
    return {
      collapsed: true,
      equation: 'A_gr = A_s + A_r + A_m',
      description: 'Per-band coefficients from ISO 9613-2 Tables 3-4',
    };
  }
}
```

### CSS Styling

```css
.equation-collapsible {
  margin-top: 4px;
}

.equation-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 10px;
  color: var(--text-muted);
  text-transform: lowercase;
}

.equation-header:hover {
  color: var(--active-blue);
}

.equation-content {
  margin-top: 8px;
  padding: 12px;
  border-radius: 10px;
  background: var(--brand-bg);
  box-shadow: inset 3px 3px 6px var(--shadow-dark),
              inset -3px -3px 6px var(--shadow-light);
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text);
}

.equation-main {
  font-weight: 600;
  margin-bottom: 8px;
}

.equation-where {
  font-size: 11px;
  color: var(--text-muted);
}
```

---

## Migration Checklist

- [ ] Restructure `index.html` settings panel with three sections
- [ ] Add collapsible equation components
- [ ] Wire equation updates to dropdown change events
- [ ] Add Probe-specific toggles (currently hardcoded)
- [ ] Add Sommerfeld toggle to Probe section
- [ ] Add Impedance Model dropdown to Probe section
- [ ] Update `probeWorker.ts` to respect new toggles
- [ ] Update schema with new Probe config fields
- [ ] Test equation display on all options
- [ ] Update Engines tab in Details modal to reference new structure

---

## References

- ISO 9613-1:1993 - Atmospheric absorption
- ISO 9613-2:1996 - Outdoor sound propagation
- Delany & Bazley (1970) - Fibrous absorbent materials
- Miki (1990) - Impedance model extension
- Maekawa (1968) - Barrier diffraction
- Pierce (1981) - Acoustics textbook
