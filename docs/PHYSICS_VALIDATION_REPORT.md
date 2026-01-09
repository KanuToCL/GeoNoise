# Physics Validation Report

Generated: 2026-01-09

This report validates the acoustic propagation engine against known physical values and standards.

## Test Results

| Category | Test | Expected | Actual | Tolerance | Status | Reference |
|----------|------|----------|--------|-----------|--------|-----------|
| Spreading | Spherical @ 1m | 10.99 dB | 10.99 dB | ±0.01 dB | ✅ | ISO 9613-2 Eq.6 |
| Spreading | Spherical @ 10m | 30.99 dB | 30.99 dB | ±0.01 dB | ✅ | ISO 9613-2 Eq.6 |
| Spreading | Spherical @ 100m | 50.99 dB | 50.99 dB | ±0.01 dB | ✅ | ISO 9613-2 Eq.6 |
| Spreading | Inverse Square Law | 6.02 dB/doubling | 6.02 dB/doubling | ±0.01 dB | ✅ | Physics |
| Spreading | Cylindrical @ 1m | 7.98 dB | 7.98 dB | ±0.01 dB | ✅ | ISO 9613-2 |
| Spreading | Cylindrical Law | 3.01 dB/doubling | 3.01 dB/doubling | ±0.01 dB | ✅ | Physics |
| Diffraction | Default threshold | 5 m (~1λ @ 63Hz) | 5.00 m | exact | ✅ | Issue #11 |
| Diffraction | Blocked → diffract | direct blocked + 1 diffraction | blocked=true, diff=1 | exact | ✅ | Issue #11 |
| Diffraction | Disabled → no diff | direct valid, 0 diffraction | valid=true, diff=0 | exact | ✅ | Issue #11 |
| Diffraction | Nearby → include | δ < 5m, diffraction traced | δ=0.06m, traced=true | inequality | ✅ | Issue #11 |
| Diffraction | Path difference δ | 2.36 m | 2.36 m | ±0.1 m | ✅ | Geometry |
| Diffraction | Threshold ≈ λ(63Hz) | ~1.0 wavelengths | 0.92 wavelengths | ±20% | ✅ | Wave physics |
| Atmospheric | None mode @ 8kHz | 0 dB | 0.00 dB | exact | ✅ | User setting |
| Atmospheric | ISO 9613-1 @ 8kHz, 100m | 5-20 dB | 10.53 dB | range | ✅ | ISO 9613-1 |
| Atmospheric | Frequency dependence | A_atm(8kHz) > A_atm(125Hz) | 10.53 > 0.04 | inequality | ✅ | ISO 9613-1 |
| Barrier | Thin barrier (N=2) | 16.33 dB | 16.33 dB | ±0.1 dB | ✅ | Maekawa 1968 |
| Barrier | Thick barrier (N=2) | 19.19 dB | 19.19 dB | ±0.1 dB | ✅ | Issue #16 |
| Barrier | Thin barrier cap | 20 dB | 20.00 dB | exact | ✅ | ISO 9613-2 |
| Barrier | Thick barrier cap | 25 dB | 25.00 dB | exact | ✅ | Issue #16 |
| Barrier | Frequency dependence | A_bar(8kHz) > A_bar(125Hz) | 25.00 > 21.73 | inequality | ✅ | Maekawa 1968 |
| Barrier | Negative N guard | 0 dB | 0 dB | exact | ✅ | Maekawa 1968 |
| Speed of Sound | At 0°C | 331.3 m/s | 331.30 m/s | ±0.1 m/s | ✅ | ISO 9613-1 |
| Speed of Sound | At 20°C | 343.42 m/s | 343.42 m/s | ±0.1 m/s | ✅ | ISO 9613-1 |
| Speed of Sound | Temperature coefficient | 0.606 m/s/°C | 0.606 m/s/°C | ±0.001 | ✅ | ISO 9613-1 |
| Combined | SPL at 10m (spreading) | ~69 dB | 69.0 dB | ±1 dB | ✅ | ISO 9613-2 |
| Combined | SPL at 100m (spreading) | ~49 dB | 49.0 dB | ±1 dB | ✅ | ISO 9613-2 |
| Combined | Diffracted path A_atm | A_atm(150m) > A_atm(100m) | 15.79 > 10.53 | inequality | ✅ | Issue #4 |
| Phasor | dB to pressure (94 dB) | 1.00 Pa | 1.00 Pa | ±0.01 Pa | ✅ | Acoustics |
| Phasor | Pressure to dB (1 Pa) | 94 dB | 93.98 dB | ±0.1 dB | ✅ | Acoustics |
| Phasor | Constructive (in-phase) | 26 dB | 26.02 dB | ±0.1 dB | ✅ | Physics |
| Phasor | Destructive (anti-phase) | deep null (< -100 dB) | -298.2 dB | inequality | ✅ | Physics |
| Phasor | Quadrature (90°) | 23 dB | 23.01 dB | ±0.2 dB | ✅ | Physics |
| Phasor | Phase from λ/2 path diff | -3.1416 rad | -3.1416 rad | ±0.01 rad | ✅ | Wave physics |
| Phasor | Wavelength @ 343 Hz | 1 m | 1.0000 m | ±0.01 m | ✅ | Wave physics |
| Phasor | Fresnel radius @ midpoint | 2.93 m | 2.93 m | ±0.01 m | ✅ | Wave physics |

## Summary

**35/35 tests passed** ✅

## How to Run

```bash
# Run physics validation tests
npm run test:physics

# Generate this report (outputs to console)
PHYSICS_REPORT=true npx vitest run tests/physics-validation.spec.ts
```

## Categories Tested

1. **Spreading Loss** (6 tests) - Geometric divergence per ISO 9613-2 (spherical + cylindrical)
2. **Diffraction Ray Tracing** (6 tests) - Issue #11 fix for coherent summation
3. **Atmospheric Absorption** (3 tests) - Air absorption per ISO 9613-1
4. **Barrier Diffraction** (6 tests) - Maekawa formula for thin and thick barriers
5. **Speed of Sound** (3 tests) - Temperature-dependent sound speed
6. **Combined Propagation** (3 tests) - End-to-end SPL calculations
7. **Phasor Arithmetic** (8 tests) - Coherent summation, interference, phase calculations
