# Testing Roadmap

> **Created:** 2025-01-09
> **Status:** Active
> **Current Coverage:** 80 tests passing (61 engine + 19 shared/backends/web)

This document outlines recommended unit tests for GeoNoise, organized by priority. Tests are linked to physics audit issues where applicable.

---

## 📊 Current Test Coverage

| Package | Test File | Tests | Description |
|---------|-----------|-------|-------------|
| `packages/shared` | `phasor/index.spec.ts` | 26 | Complex arithmetic, pressure/dB conversion, phasor summation |
| `packages/engine` | `propagation.spec.ts` | 38 | Spreading loss, speed of sound, weighting curves, edge cases |
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
| **Total** | **12 files** | **96** | |

---

## 🔴 High Priority Tests

Critical physics issues from the audit that need test coverage.

### Barrier + Ground Interaction (Issue #3)
**Location:** `packages/engine/src/propagation/index.ts`

```typescript
describe('Barrier + Ground Interaction', () => {
  it('partitions ground effect into source and receiver regions when barrier present');
  it('uses source-to-barrier ground effect for source region');
  it('uses barrier-to-receiver ground effect for receiver region');
  it('sums barrier attenuation with partitioned ground effects');
  it('falls back to full ground effect when no barrier');
});
```

### Atmospheric Absorption Path Length (Issue #4)
**Location:** `packages/engine/src/propagation/index.ts`

```typescript
describe('Atmospheric Absorption - Actual Path Length', () => {
  it('uses direct distance for unblocked paths');
  it('uses A+B distance for diffracted paths over barrier');
  it('uses reflected path length for wall reflections');
  it('shows measurable difference at 16kHz for 10m+ detour');
});
```

### Side Diffraction Geometry (Issue #5)
**Location:** `packages/engine/src/compute/index.ts`

```typescript
describe('Side Diffraction Geometry', () => {
  it('uses ground level for horizontal around-the-end diffraction');
  it('computes minimum of over-top, around-left, around-right');
  it('handles finite barriers shorter than source-receiver line');
  it('produces positive path difference for valid side paths');
});
```

### Two-Ray Ground Sign Consistency (Issue #2)
**Location:** `packages/engine/src/propagation/ground.ts`

```typescript
describe('Two-Ray Ground Model - Sign Handling', () => {
  it('returns negative A_gr for constructive interference');
  it('returns positive A_gr for destructive interference');
  it('matches legacy model behavior when clamped to >= 0');
  it('produces frequency-dependent comb filtering pattern');
});
```

---

## 🟠 Medium Priority Tests

Moderate physics issues that affect accuracy.

### Delany-Bazley Range (Issue #6)
```typescript
describe('Delany-Bazley Impedance Model', () => {
  it('returns hard ground impedance when f/σ < 0.01');
  it('uses Miki extension when f/σ > 1.0');
  it('produces smooth transition at range boundaries');
  it('handles very high flow resistivity (hard asphalt)');
  it('handles very low flow resistivity (fresh snow)');
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

### Thick vs Thin Barriers (Issue #16)
```typescript
describe('Barrier Type - Thick vs Thin', () => {
  it('uses coefficient 20 for thin barriers/screens');
  it('uses coefficient 40 for buildings (double diffraction)');
  it('caps thin barriers at 20 dB');
  it('caps thick barriers at 25 dB');
});
```

### Simple Atmospheric Model (Issue #10)
```typescript
describe('Atmospheric Absorption - ISO 9613-1', () => {
  it('matches ISO 9613-1 Table 1 at 20°C, 70% RH');
  it('increases with frequency squared');
  it('applies temperature correction correctly');
  it('applies humidity correction correctly');
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

### Diffraction Phase (Issue #14)
```typescript
describe('Diffraction Phase Shift', () => {
  it('applies -π/4 phase shift for knife-edge');
  it('includes phase in coherent summation');
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
