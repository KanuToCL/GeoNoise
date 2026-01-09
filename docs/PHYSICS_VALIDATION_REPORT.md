# Physics Validation Report

Generated: 2026-01-09

## Test Results

| Category | Test | Expected | Actual | Tolerance | Status | Reference |
|----------|------|----------|--------|-----------|--------|-----------|
| Spreading | Spherical @ 1m | 10.99 dB | 10.99 dB | ±0.01 dB | ✅ | ISO 9613-2 Eq.6 |
| Spreading | Spherical @ 10m | 30.99 dB | 30.99 dB | ±0.01 dB | ✅ | ISO 9613-2 Eq.6 |
| Spreading | Spherical @ 100m | 50.99 dB | 50.99 dB | ±0.01 dB | ✅ | ISO 9613-2 Eq.6 |
| Spreading | Inverse Square Law | 6.02 dB/doubling | 6.02 dB/doubling | ±0.01 dB | ✅ | Physics |
| Spreading | Cylindrical @ 1m | 7.98 dB | 7.98 dB | ±0.01 dB | ✅ | ISO 9613-2 |
| Spreading | Cylindrical Law | 3.01 dB/doubling | 3.01 dB/doubling | ±0.01 dB | ✅ | Physics |
| Spreading | Cylindrical @ 10m | 17.98 dB | 17.98 dB | ±0.01 dB | ✅ | ISO 9613-2 |
| Spreading | Reference @ 1m | 0 dB | 0.00 dB | ±0.01 dB | ✅ | SPL@1m |
| Spreading | Reference @ 10m | 20 dB | 20.00 dB | ±0.01 dB | ✅ | SPL@1m |
| Spreading | Lw vs SPL@1m diff | 10.99 dB | 10.99 dB | ±0.01 dB | ✅ | Geometry |
| Spreading | Zero distance clamp | finite | finite | exact | ✅ | Robustness |
| Spreading | Negative distance clamp | finite | finite | exact | ✅ | Robustness |
| Spreading | Spherical @ 1km | ~70.99 dB | 70.99 dB | ±1 dB | ✅ | ISO 9613-2 |
| Diffraction | Default threshold | 5 m (~1λ @ 63Hz) | 5.00 m | exact | ✅ | Issue #11 |
| Diffraction | Blocked → diffract | direct blocked + 1 diffraction | blocked=true, diff=1 | exact | ✅ | Issue #11 |
| Diffraction | Disabled → no diff | direct valid, 0 diffraction | valid=true, diff=0 | exact | ✅ | Issue #11 |
| Diffraction | Nearby → include | δ < 5m, diffraction traced | δ=0.06m, traced=true | inequality | ✅ | Issue #11 |
| Diffraction | Path difference δ | 2.36 m | 2.36 m | ±0.1 m | ✅ | Geometry |
| Diffraction | Threshold ≈ λ(63Hz) | ~1.0 wavelengths | 0.92 wavelengths | ±20% | ✅ | Wave physics |
| Diffraction | Multi-barrier | 2 diffraction paths | 2 paths | exact | ✅ | Issue #11 |
| Diffraction | Non-intersecting → null | null | null | exact | ✅ | Geometry |
| Atmospheric | None mode @ 8kHz | 0 dB | 0.00 dB | exact | ✅ | User setting |
| Atmospheric | ISO 9613-1 @ 8kHz, 100m | 5-20 dB | 10.53 dB | range | ✅ | ISO 9613-1 |
| Atmospheric | Frequency dependence | A_atm(8kHz) > A_atm(125Hz) | 10.53 > 0.04 | inequality | ✅ | ISO 9613-1 |
| Atmospheric | Diffracted path length | A_atm(150m) > A_atm(100m) | 15.79 > 10.53 | inequality | ✅ | Issue #4 |
| Atmospheric | 50m extra @ 8kHz | 3-10 dB | 5.26 dB | range | ✅ | Issue #4 |
| Atmospheric | 50m extra @ 125Hz | < 1 dB | 0.02 dB | inequality | ✅ | Issue #4 |
| Barrier | Thin barrier (N=2) | 16.33 dB | 16.33 dB | ±0.1 dB | ✅ | Maekawa 1968 |
| Barrier | Thick barrier (N=2) | 19.19 dB | 19.19 dB | ±0.1 dB | ✅ | Issue #16 |
| Barrier | Thin barrier cap | 20 dB | 20.00 dB | exact | ✅ | ISO 9613-2 |
| Barrier | Thick barrier cap | 25 dB | 25.00 dB | exact | ✅ | Issue #16 |
| Barrier | Frequency dependence | A_bar(8kHz) > A_bar(125Hz) | 25.00 > 21.73 | inequality | ✅ | Maekawa 1968 |
| Barrier | Negative N guard | 0 dB | 0 dB | exact | ✅ | Maekawa 1968 |
| Barrier | Thick > Thin | thick > thin | 25.00 > 20.00 | inequality | ✅ | Issue #16 |
| Barrier | Default = thin | same | same | exact | ✅ | API |
| Speed of Sound | At 0°C | 331.3 m/s | 331.30 m/s | ±0.1 m/s | ✅ | ISO 9613-1 |
| Speed of Sound | At 20°C | 343.42 m/s | 343.42 m/s | ±0.1 m/s | ✅ | ISO 9613-1 |
| Speed of Sound | Temperature coefficient | 0.606 m/s/°C | 0.606 m/s/°C | ±0.001 | ✅ | ISO 9613-1 |
| Speed of Sound | At 15°C | 340.39 m/s | 340.39 m/s | ±0.1 m/s | ✅ | ISO 9613-1 |
| Speed of Sound | At 25°C | 346.45 m/s | 346.45 m/s | ±0.1 m/s | ✅ | ISO 9613-1 |
| Speed of Sound | Constant vs formula | < 1 m/s diff | 0.42 m/s | < 1 m/s | ✅ | Issue #18 |
| Ground | Complex addition | (4, -2) | (4, -2) | exact | ✅ | Math |
| Ground | Complex multiplication | (11, 2) | (11, 2) | exact | ✅ | Math |
| Ground | Complex sqrt(i) | (0.7071, 0.7071) | (0.7071, 0.7071) | ±0.001 | ✅ | Math |
| Ground | Delany-Bazley finite | finite, Re > 0 | Re=86.87, Im=-106.00 | exact | ✅ | Delany-Bazley 1970 |
| Ground | Hard ground R ≈ 1 | Re > 0.9 | Re=0.980 | inequality | ✅ | Physics |
| Ground | Two-ray frequency variation | finite, varies | 125Hz=-4.60, 1kHz=-1.72 | inequality | ✅ | Two-ray model |
| Ground | Zero distance → 0 | 0 dB | 0 dB | exact | ✅ | Robustness |
| Ground | Hard ground legacy | 0 dB | 0 dB | exact | ✅ | ISO 9613-2 |
| Ground | ISO Eq.10 near field | 0 dB | 0 dB | exact | ✅ | ISO 9613-2 Eq.10 |
| Ground | ISO Eq.10 far field | 4.4-4.8 dB | 4.52 dB | range | ✅ | ISO 9613-2 Eq.10 |
| Phasor | dB to pressure (94 dB) | 1.00 Pa | 1.00 Pa | ±0.01 Pa | ✅ | Acoustics |
| Phasor | Pressure to dB (1 Pa) | 94 dB | 93.98 dB | ±0.1 dB | ✅ | Acoustics |
| Phasor | Constructive (in-phase) | 26 dB | 26.02 dB | ±0.1 dB | ✅ | Physics |
| Phasor | Destructive (anti-phase) | deep null (< -100 dB) | -298.2 dB | inequality | ✅ | Physics |
| Phasor | Quadrature (90°) | 23 dB | 23.01 dB | ±0.2 dB | ✅ | Physics |
| Phasor | Phase from λ/2 path diff | -3.1416 rad | -3.1416 rad | ±0.01 rad | ✅ | Wave physics |
| Phasor | Wavelength @ 343 Hz | 1 m | 1.0000 m | ±0.01 m | ✅ | Wave physics |
| Phasor | Fresnel radius @ midpoint | 2.93 m | 2.93 m | ±0.01 m | ✅ | Wave physics |
| Weighting | A @ 1kHz = 0 | 0 dB | 0 dB | exact | ✅ | IEC 61672-1 |
| Weighting | A @ 63Hz | -26.2 dB | -26.2 dB | exact | ✅ | IEC 61672-1 |
| Weighting | A boost 2-4kHz | > 0 dB | 2kHz=1.2, 4kHz=1 | inequality | ✅ | IEC 61672-1 |
| Weighting | C flat 250-1kHz | 0 dB | 250=0, 500=0, 1k=0 | exact | ✅ | IEC 61672-1 |
| Weighting | Z = 0 all bands | all 0 | all 0 | exact | ✅ | IEC 61672-1 |
| Combined | SPL at 10m (spreading) | ~69 dB | 69.0 dB | ±1 dB | ✅ | ISO 9613-2 |
| Combined | SPL at 100m (spreading) | ~49 dB | 49.0 dB | ±1 dB | ✅ | ISO 9613-2 |
| Combined | Monotonic decrease | decreasing | decreasing | exact | ✅ | Physics |
| Combined | Blocked → MIN_LEVEL | -100 dB | -100 dB | exact | ✅ | API |
| Combined | MAX_DISTANCE → blocked | blocked=true | blocked=true | exact | ✅ | API |
| Probe | Simple @ 10m | 60-90 dB | 76.2 dB | range | ✅ | Probe API |
| Probe | Simple @ 100m | 40-70 dB | 56.2 dB | range | ✅ | Probe API |
| Probe | Inverse square law | 5-7 dB/doubling | 6.01 dB | range | ✅ | Physics |
| Probe | Zero sources → floor | 35 dB | 35 dB | exact | ✅ | Probe API |
| Probe | Two sources +3 dB | ~3 dB | 3.01 dB | ±1 dB | ✅ | Energetic sum |
| Probe | Coherent @ 10m | 50-90 dB | 76.2 dB | range | ✅ | Issue #2b |
| Probe | Ground adds paths | more paths with ground | with=2, without=1 | inequality | ✅ | Two-ray |
| Probe | Default config | ground=true, mixed, coherent=true, T=20 | ground=true, mixed, coherent=true, T=20 | exact | ✅ | API |

## Summary

**77/77 tests passed** ✅

## How to Run

```bash
# Run physics validation tests
cd packages/engine
npx vitest run tests/physics-validation.spec.ts

# Generate markdown report (stdout)
PHYSICS_REPORT=true npx vitest run tests/physics-validation.spec.ts
```

## Categories Tested

1. **Spreading Loss** (13 tests) - Geometric divergence per ISO 9613-2 (spherical + cylindrical)
2. **Diffraction Ray Tracing** (8 tests) - Issue #11 fix for coherent summation
3. **Atmospheric Absorption** (6 tests) - Air absorption per ISO 9613-1
4. **Barrier Diffraction** (8 tests) - Maekawa formula for thin and thick barriers
5. **Speed of Sound** (6 tests) - Temperature-dependent sound speed
6. **Ground Reflection** (11 tests) - Two-ray model, complex arithmetic, Delany-Bazley
7. **Phasor Arithmetic** (8 tests) - Coherent summation, interference patterns
8. **Frequency Weighting** (5 tests) - A/C/Z weighting per IEC 61672-1
9. **Combined Propagation** (5 tests) - Full propagation model validation
10. **Probe Computation** (8 tests) - Simple and coherent probe calculations

## Standards Referenced

- **ISO 9613-1** - Acoustics — Attenuation of sound during propagation outdoors — Part 1: Calculation of atmospheric absorption
- **ISO 9613-2** - Acoustics — Attenuation of sound during propagation outdoors — Part 2: General method of calculation
- **IEC 61672-1** - Electroacoustics — Sound level meters — Part 1: Specifications
- **Maekawa 1968** - Noise reduction by screens (barrier diffraction)
- **Delany-Bazley 1970** - Acoustical properties of fibrous absorbent materials (ground impedance)
