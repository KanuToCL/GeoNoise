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
| `apps/web/src/probeWorker.ts` | Fixed atmospheric absorption, fixed ground reflection double-counting, added comprehensive docs |
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
- Delany, M.E. & Bazley, E.N. (1970). "Acoustical properties of fibrous absorbent materials"
