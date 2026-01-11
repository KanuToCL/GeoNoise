# Testing Roadmap

> **Created:** 2025-01-09 (Updated: 2025-01-11)
> **Status:** Active
> **Current Coverage:** 248 tests passing across engine, shared, backends, web

This document outlines recommended unit tests for GeoNoise, organized by priority. Tests are linked to physics audit issues where applicable.

---

## 📊 Current Test Coverage

| Package | Test File | Tests | Description |
|---------|-----------|-------|-------------|
| `packages/shared` | `phasor/index.spec.ts` | 26 | Complex arithmetic, pressure/dB conversion, phasor summation |
| `packages/engine` | `propagation.spec.ts` | 60+ | Spreading loss, atm absorption, speed of sound, weighting, barriers (Issue #16) |
| `packages/engine` | `physics-validation.spec.ts` | 118 | Comprehensive physics validation with CSV report (Issues #2, #3, #5, #6, #11, #12, #14) |
| `packages/engine` | `probe-diffraction.spec.ts` | 11 | Probe computation (Issue #2b), simple/coherent modes |
| `packages/engine` | `ground-two-ray.spec.ts` | 6 | Two-ray ground reflection model |
| `packages/engine` | `panel.spec.ts` | 3 | Panel sampling and statistics |
| `packages/engine` | `default-config.spec.ts` | 2 | Engine configuration |
| `packages/engine` | `golden.spec.ts` | 1 | Golden/regression test harness |
| `packages/engine-backends` | `cpuWorkerBackend.spec.ts` | 1 | CPU backend deterministic snapshots |
| `packages/engine-backends` | `compute.spec.ts` | 2 | Compute routing |
| `packages/engine-backends` | `router.spec.ts` | 2 | Backend router |
| `apps/web` | `export.test.ts` | 1 | CSV export schema |
| `apps/web` | `computePreference.test.ts` | 4 | GPU/CPU preference persistence |
| **Total** | **13 files** | **248** | |

---

## 🔴 High Priority Tests

Critical physics issues from the audit that need test coverage.

### Barrier + Ground Interaction (Issue #3) ✅ IMPLEMENTED
**Location:** `packages/engine/tests/physics-validation.spec.ts`

```typescript
describe('Barrier + Ground Interaction - Issue #3', () => {
  it('with barrierInfo: barrier and ground are ADDITIVE'); // ✅
  it('ground effect partitioned into source and receiver regions'); // ✅
  it('without barrierInfo: legacy max(A_bar, A_gr) behavior'); // ✅
  it('additive formula produces more attenuation than max()'); // ✅
  it('barrier height affects ground partitioning'); // ✅
  it('asymmetric barrier position affects ground regions'); // ✅
});
```

### Atmospheric Absorption Path Length (Issue #4) ✅ IMPLEMENTED
**Location:** `packages/engine/src/propagation/index.ts`

```typescript
describe('Atmospheric Absorption Path Length - Issue #4 Fix', () => {
  it('uses direct distance when actualPathLength is not provided');
  it('uses actualPathLength when provided (diffracted path)');
  it('actualPathLength produces higher absorption than direct distance');
  it('difference is significant at high frequencies');
  it('difference is minimal at low frequencies');
  it('spreading loss is based on direct distance, not actual path');
});
```

### Side Diffraction Geometry (Issue #5) ✅ IMPLEMENTED
**Location:** `packages/engine/tests/physics-validation.spec.ts`

```typescript
describe('Issue #5: Side Diffraction Geometry (RESOLVED)', () => {
  it('horizontal diffraction should go around at ground level'); // ✅
  it('finite barrier should consider over-top AND around-ends paths'); // ✅
  it('side diffraction path should be computed correctly at ground level'); // ✅
  it('short barriers should use side diffraction in auto mode'); // ✅
  it('minimum path difference should be selected among all diffraction paths'); // ✅
});
```

### Diffraction Ray Tracing (Issue #11) ✅ IMPLEMENTED
**Location:** `packages/engine/tests/physics-validation.spec.ts`

```typescript
describe('Diffraction Ray Tracing - Issue #11', () => {
  it('default config has maxDiffractionDeltaForUnblockedPath = 5.0m'); // ✅
  it('diffraction traced when direct path blocked'); // ✅
  it('no diffraction when disabled and direct unblocked'); // ✅
  it('diffraction traced for nearby barrier (δ < threshold)'); // ✅
  it('path difference geometry is correct'); // ✅
  it('threshold ~1 wavelength at 63 Hz'); // ✅
  it('multiple barriers generate multiple diffraction paths'); // ✅
  it('null for non-intersecting barrier'); // ✅
});
```

### Two-Ray Ground Sign Consistency (Issue #2) ✅ IMPLEMENTED
**Location:** `packages/engine/tests/physics-validation.spec.ts`

```typescript
describe('Issue #2: Two-Ray Ground Model Sign Consistency', () => {
  it('two-ray model can produce negative A_gr (constructive interference)'); // ✅
  it('two-ray model can produce positive A_gr (destructive interference)'); // ✅
  it('produces frequency-dependent comb filtering pattern'); // ✅
  it('hard ground produces higher magnitude variations than soft ground'); // ✅
  it('near-field has minimal ground effect'); // ✅
  it('returns 0 for zero distance (edge case)'); // ✅
  it('remains finite across wide parameter range'); // ✅
});
```

---

## 🟠 Medium Priority Tests

Moderate physics issues that affect accuracy.

### Delany-Bazley Range (Issue #6) ✅ IMPLEMENTED
**Location:** `packages/engine/tests/physics-validation.spec.ts`

```typescript
describe('Issue #6: Delany-Bazley Range (RESOLVED)', () => {
  it('should return high impedance for very low f/σ ratio (hard surface)'); // ✅
  it('should use Miki extension for high f/σ ratio'); // ✅
  it('should use standard Delany-Bazley within valid range'); // ✅
  it('impedance should be finite for all valid inputs'); // ✅
  it('reflection coefficient should approach 1 for very hard surfaces'); // ✅
});
```

### Terrain Elevation (Issue #7)
```typescript
describe('Ground Reflection - Terrain', () => {
  it('finds correct reflection point on flat ground');
  it('finds correct reflection point on sloped terrain');
  it('handles source or receiver below terrain gracefully');
  it('converges iteratively for non-flat terrain');
});
```

### Wall Reflection Z-Coordinate (Issue #9)
```typescript
describe('Wall Reflection Geometry', () => {
  it('calculates correct Z from image source interpolation');
  it('rejects reflections above wall height');
  it('rejects reflections below ground level');
  it('handles vertical walls correctly');
});
```

### Thick vs Thin Barriers (Issue #16) ✅ IMPLEMENTED
**Location:** `packages/engine/tests/propagation.spec.ts`

```typescript
describe('Barrier Attenuation - Issue #16 Fix', () => {
  it('thin barrier uses coefficient 20'); // ✅
  it('thick barrier uses coefficient 40'); // ✅
  it('thick barrier produces higher attenuation than thin for same geometry'); // ✅
  it('thin barrier caps at 20 dB'); // ✅
  it('thick barrier caps at 25 dB'); // ✅
  it('difference between thin and thick increases with frequency'); // ✅
  it('returns 0 for negative Fresnel number below threshold'); // ✅
  it('default barrier type is thin'); // ✅
  // + 6 more tests for calculatePropagation with barrier type
});
```

### Mixed Ground Sigma Interpolation (Issue #12) ✅ IMPLEMENTED
**Location:** `packages/engine/tests/physics-validation.spec.ts`

```typescript
describe('Issue #12: Mixed Ground Interpolation (RESOLVED)', () => {
  it('soft ground returns sigmaSoft directly'); // ✅
  it('hard ground returns very high sigma'); // ✅
  it('ISO model uses linear admittance interpolation (σ = σ_soft / G)'); // ✅
  it('logarithmic model uses geometric mean'); // ✅
  it('logarithmic model produces different result than ISO'); // ✅
  it('G=1 gives soft ground for both models'); // ✅
  it('G near 0 gives very high sigma for both models'); // ✅
});
```

### Simple Atmospheric Model (Issue #10) ✅ IMPLEMENTED
**Location:** `packages/engine/tests/physics-validation.spec.ts`

```typescript
describe('Atmospheric Absorption - ISO 9613-1', () => {
  it('A_atm = 0 when mode is none'); // ✅
  it('A_atm > 0 for iso9613 mode at high frequency'); // ✅
  it('A_atm increases with frequency'); // ✅
  it('diffracted path uses actual path length'); // ✅
  it('extra path difference at 8kHz ~6 dB for 50m'); // ✅
  it('minimal difference at low frequency'); // ✅
});
```

---

## 🟡 Lower Priority Tests

Minor issues and edge cases.

### Sommerfeld Continuity (Issue #13)
```typescript
describe('Sommerfeld Ground Wave Function', () => {
  it('smoothly transitions at |w| = 4 threshold');
  it('uses series form for small |w|');
  it('uses asymptotic form for large |w|');
});
```

### Diffraction Phase (Issue #14) ✅ IMPLEMENTED
**Location:** `packages/engine/tests/physics-validation.spec.ts`

```typescript
describe('Issue #14: Diffraction Phase Shift', () => {
  it('diffraction path has -π/4 phase shift'); // ✅
  it('phase shift is consistent regardless of barrier height'); // ✅
  it('phase shift is consistent regardless of path difference'); // ✅
  it('-π/4 is approximately -45 degrees'); // ✅
  it('phase affects coherent summation correctly'); // ✅
  it('documents limitation: phase does not vary with shadow angle'); // ✅
});
```

### Spectral Ground Absorption (Issue #17)
```typescript
describe('Ground Absorption - Per-Band', () => {
  it('uses frequency-dependent absorption for soft ground');
  it('increases absorption with frequency');
  it('interpolates for mixed ground');
});
```

### Speed of Sound Consistency (Issue #18) ✅ IMPLEMENTED
```typescript
describe('Speed of Sound Consistency - Issue #18', () => {
  it('formula at 20°C is close to constant (within 0.5%)');
  it('formula increases with temperature');
  it('formula gives expected values at standard temperatures');
});
```

---

## 🔗 Integration Tests

Multi-component tests that verify system behavior.

### Full Scene Golden Test
```typescript
describe('Golden Test - Full Scene', () => {
  it('computes expected level: source + barrier + soft ground + receiver');
  it('matches hand-calculated reference values');
  it('produces deterministic results across runs');
});
```

### Multi-Building Diffraction
```typescript
describe('Multi-Building Diffraction', () => {
  it('selects shortest diffraction path among multiple buildings');
  it('handles overlapping building shadows');
  it('computes correct path for L-shaped buildings');
});
```

### Ground + Wall Combination
```typescript
describe('Ground + Wall Combination Paths', () => {
  it('traces wall-ground combination path');
  it('traces ground-wall combination path');
  it('correctly phases second-order reflections');
});
```

### High Frequency Propagation
```typescript
describe('High Frequency Propagation', () => {
  it('atmospheric absorption dominates at 8kHz, 100m+');
  it('produces realistic HF rolloff at distance');
});
```

---

## 🔁 Regression Tests

Ensure consistency between components.

### Probe vs Receiver Consistency
```typescript
describe('Probe vs Receiver Consistency', () => {
  it('probe and receiver at same location give similar LAeq');
  it('difference is within expected tolerance (< 3 dB)');
});
```

### Panel Statistics
```typescript
describe('Panel Statistics', () => {
  it('LAeq_avg equals mean of sample LAeq values');
  it('LAeq_max equals maximum sample LAeq');
  it('LAeq_min equals minimum sample LAeq');
  it('LAeq_p95 equals 95th percentile');
});
```

### A/C/Z Weighting ✅ IMPLEMENTED
```typescript
describe('Frequency Weighting Curves', () => {
  it('A-weighting is 0 dB at 1000 Hz reference');
  it('A-weighting heavily attenuates low frequencies');
  it('A-weighting has slight boost at 2-4 kHz');
  it('C-weighting is relatively flat');
  it('C-weighting is 0 dB at 250-1000 Hz');
  it('Z-weighting is flat (all zeros)');
  it('A-weighting matches IEC 61672-1 standard values');
});
```

---

## ⚠️ Edge Case Tests

Handle unusual inputs gracefully.

### Co-located Source/Receiver ✅ IMPLEMENTED
```typescript
describe('Edge Cases - Robustness', () => {
  it('spreadingLoss handles distance = 0');
  it('spreadingLoss handles negative distance');
  it('spreadingLoss handles very small distance (0.001m)');
  it('all clamped distances produce same result');
});
```

### Source Below Ground
```typescript
describe('Edge Case - Negative Z', () => {
  it('handles source.z < 0 gracefully');
  it('handles receiver.z < 0 gracefully');
  it('skips ground reflection when invalid');
});
```

### Very Large Distances ✅ IMPLEMENTED
```typescript
describe('Edge Cases - Robustness', () => {
  it('spreadingLoss handles 1km distance');
  it('spreadingLoss handles 10km distance');
  it('calculatePropagation respects MAX_DISTANCE');
});
```

### Empty Scene
```typescript
describe('Edge Case - Empty Scene', () => {
  it('no sources returns empty/ambient spectrum');
  it('no receivers returns empty results array');
  it('no panels returns empty panel results');
});
```

---

## 🧪 Running Tests

```bash
# Run all tests
npm test

# Run specific package tests
cd packages/engine && npm test

# Run with verbose output
npx vitest run --reporter=verbose

# Run specific test file
npx vitest run packages/engine/tests/propagation.spec.ts

# Update snapshots
npx vitest run --update

# Watch mode (re-run on changes)
npx vitest watch
```

---

## 📈 Test Quality Guidelines

1. **Each test should verify ONE specific behavior**
2. **Use descriptive test names** that explain what's being tested
3. **Include expected values with mathematical derivation** in comments
4. **Use `toBeCloseTo()` for floating-point comparisons** with appropriate precision
5. **Test edge cases** (zero, negative, very large values)
6. **Add regression tests** when fixing bugs

---

## Changelog

| Date | Change |
|------|--------|
| 2025-01-09 | Initial document created |
| 2025-01-09 | Added 13 spreading loss tests (Issue #1) |
| 2025-01-09 | Added 3 coherent probe tests (Issue #2b) |
| 2025-01-09 | Fixed cpuWorkerBackend test (missing spectrum) |
| 2025-01-09 | Added 19 low-hanging tests: speed of sound, weighting curves, edge cases |
| 2025-01-09 | Added 6 Issue #4 tests: atmospheric absorption path length |
| 2025-01-11 | Cross-checked with physics_audit.md - marked implemented tests |
| 2025-01-11 | Added physics-validation.spec.ts (80+ tests for Issues #3, #5, #6, #11, #12) |
| 2025-01-11 | Marked Issue #16 tests as implemented in propagation.spec.ts |
| 2025-01-11 | Updated test count: 248 tests across 13 files |
| 2025-01-11 | Added Issue #2 tests (7 tests for Two-Ray Ground Sign Consistency) |
| 2025-01-11 | Added Issue #14 tests (6 tests for Diffraction Phase Shift) |
