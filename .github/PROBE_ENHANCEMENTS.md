# Probe Enhancements Roadmap

## Overview

This document outlines proposed enhancements to the probe system to upgrade it from a simplified real-time preview tool to a more acoustically accurate analysis instrument.

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
| **Ground reflection** | ✅ Done | Two-ray phasor model with Delany-Bazley impedance |
| **Wall reflections** | ✅ Done | Image source method for buildings |
| **Barrier diffraction** | ✅ Done | Maekawa model (`maekawaDiffraction()`) |
| **Atmospheric absorption** | ✅ Done | Simplified ISO 9613-1 (fixed Jan 6, 2026) |
| **Frequency weighting display** | ✅ Done | A/C/Z weighting in probe chart |
| **Overall weighted level** | ✅ Done | Shows "72 dB(A)" on probe chart |
| **Ghost source count** | ✅ Done | `interferenceDetails.ghostCount` populated |
| **Unit tests** | ✅ Done | 26 tests in `phasor/index.spec.ts` |

---

## ✅ RESOLVED: Probe Not Updating Dynamically (Jan 6, 2026)

### Root Cause

The `atmosphericAbsorptionCoeff()` function had a **broken ISO 9613-1 formula** that was producing astronomically wrong values:

```
EXPECTED: ~0.0001 dB/m at 63 Hz
ACTUAL:   ~104,000 dB/m at 63 Hz (!!!)
```

This caused the level calculation to produce values like `-3,683,673 dB` instead of the expected `~58 dB`, which when clamped to the pressure floor resulted in the constant 35 dB ambient floor being shown for all bands.

### Debug Session Output

```
[ProbeWorker] Direct path calc: {
  sourceLevel: 100,
  atten: '42.0',
  atm: '3683731.747',     // ← WRONG! Should be ~0.004
  level: '-3683673.7',    // ← Results in floor clamping
  pressure: '1.00e-12'
}
```

### Fix Applied

Replaced the broken formula with a correct, simplified atmospheric absorption model:

```typescript
// OLD (BROKEN): Produced millions of dB/m
const alpha = 8.686 * f2 * (
  1.84e-11 * Math.pow(t / 293.15, 0.5) + ...
);

// NEW (FIXED): Correct frequency-dependent coefficients
function atmosphericAbsorptionCoeff(frequency, temp, humidity) {
  const tempFactor = 1 + 0.01 * (temp - 20);
  const humidityFactor = 1 + 0.005 * (50 - humidity);

  let baseAlpha;
  if (frequency <= 63) baseAlpha = 0.0001;      // dB/m
  else if (frequency <= 125) baseAlpha = 0.0003;
  else if (frequency <= 250) baseAlpha = 0.001;
  else if (frequency <= 500) baseAlpha = 0.002;
  else if (frequency <= 1000) baseAlpha = 0.004;
  else if (frequency <= 2000) baseAlpha = 0.008;
  else if (frequency <= 4000) baseAlpha = 0.02;
  else if (frequency <= 8000) baseAlpha = 0.06;
  else baseAlpha = 0.2;  // 16 kHz

  return baseAlpha * tempFactor * humidityFactor;
}
```

### Verification

After fix, probe now shows realistic values:
- 35m distance: ~55-60 dB (previously: 35 dB floor)
- Values update correctly when moving sources or probes
- Frequency-dependent roll-off visible in spectrum

---

## Current Capabilities (as of Jan 6, 2026)

### ✅ IMPLEMENTED

| Feature | Description |
|---------|-------------|
| **Barrier occlusion** | Direct path blocked when intersecting barriers |
| **Barrier diffraction** | Maekawa model for sound bending over barriers |
| **Ground reflection** | Two-ray model with frequency-dependent phase |
| **First-order wall reflections** | Image source method for building walls |
| **Coherent summation** | Phase-accurate phasor addition within single source |
| **Atmospheric absorption** | Frequency-dependent (simplified ISO 9613-1) |
| **Multi-source support** | Energetic (incoherent) sum across sources |

### ❌ NOT IMPLEMENTED

| Feature | Notes |
|---------|-------|
| **Building occlusion** | Buildings do NOT block line-of-sight paths |
| **Higher-order reflections** | Only first-order (single bounce) supported |
| **Building diffraction** | No edge diffraction around buildings |
| **Terrain effects** | Flat ground assumed |
| **Weather gradients** | No refraction modeling |

---

## Physics Model Summary

For each source-receiver pair, we trace:

1. **DIRECT PATH**: Line-of-sight with barrier blocking check
   - If blocked by barrier → path invalid, try diffraction instead
   - Attenuation: spherical spreading + atmospheric absorption

2. **GROUND REFLECTION**: Two-ray interference model
   - Reflects off ground plane at z=0
   - Phase shift depends on ground impedance (hard/soft/mixed)
   - Creates comb filtering at certain frequencies

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

- [ ] Add building occlusion (check buildings in `isPathBlocked`)
- [ ] Remove debug logging (console.log statements) for production
- [ ] Add visual indicator when probe is "calculating"

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

## Files Modified (Jan 6, 2026)

| File | Changes |
|------|---------|
| `apps/web/src/probeWorker.ts` | Fixed `atmosphericAbsorptionCoeff()`, added comprehensive header docs |
| `apps/web/src/main.ts` | Debug logging for probe request/response flow |
| `.github/PROBE_ENHANCEMENTS.md` | Updated with fix details and current state |

---

## Previous Debug Sessions (Archived)

### Jan 5, 2026: Stale Build Cache

Application appeared completely non-functional. Root cause was stale `dist/` folder missing compiled JS files. Added `npm run rebuild` command.

### Jan 6, 2026: Early Return Issue

Added `requestLiveProbeUpdates()` call before early return in `computeSceneIncremental()` to ensure probe updates happen during drag operations.

---

## References

- ISO 9613-2: Attenuation of sound during propagation outdoors
- Maekawa, Z. (1968). "Noise reduction by screens"
- Keller, J.B. (1962). "Geometrical theory of diffraction"
- Pierce, A.D. (1981). "Acoustics: An Introduction to Its Physical Principles and Applications"
