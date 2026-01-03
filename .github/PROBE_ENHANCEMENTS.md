# Probe Enhancements Roadmap

## Overview

This document outlines proposed enhancements to the probe system to upgrade it from a simplified real-time preview tool to a more acoustically accurate analysis instrument.

## Current Limitations (as of Jan 2026)

The probe worker currently uses a highly simplified model:

- **Simple spherical spreading only** (20*log10(r) + 11 dB)
- **No barrier diffraction** - walls parameter is ignored
- **No ground reflections** - no ground effect modeling
- **No building interactions** - no reflections or diffractions
- **Energetic summation only** - no phase information or interference patterns
- **No weighting display** - always shows unweighted spectrum
- **Single-threaded calculation** - all in the probe worker

## Proposed Enhancements

### 1. Advanced Ray-Tracing Propagation

**Goal:** Implement 2.5D ray-bounce calculations for more accurate acoustic modeling.

#### Features:
- **First-order reflections** from barriers and buildings
- **Ground reflections** using two-ray model or ISO 9613-2
- **Barrier diffraction** using Maekawa or ISO formulas
- **Building edge diffraction** for realistic shadow zones
- **Distance-dependent atmospheric absorption**

#### Implementation Notes:
```typescript
interface ProbeRayPath {
  sourceId: string;
  pathType: 'direct' | 'reflected' | 'diffracted';
  totalDistance: number;
  reflectionPoints?: Point3D[];
  diffractionEdges?: Edge3D[];
  attenuation: number;
  phase?: number; // For coherent summation
}
```

### 2. Complex Interference Modeling

**Goal:** Capture constructive and destructive interference between sources and paths.

#### Features:
- **Phase-coherent summation** per frequency band
- **Path length differences** → phase shifts
- **Ground reflection phase changes** (180° for hard ground)
- **Interference patterns** visualization in probe spectrum
- **Comb filtering effects** from ground reflections

#### Implementation Approach:
```typescript
// Instead of energetic sum:
// total = sum(10^(L/10))

// Use complex phasor addition:
interface Phasor {
  magnitude: number;  // Pressure amplitude
  phase: number;      // Phase in radians
}

function sumPhasors(phasors: Phasor[]): number {
  const real = phasors.reduce((sum, p) => 
    sum + p.magnitude * Math.cos(p.phase), 0);
  const imag = phasors.reduce((sum, p) => 
    sum + p.magnitude * Math.sin(p.phase), 0);
  return 20 * Math.log10(Math.sqrt(real*real + imag*imag));
}
```

### 3. Frequency Weighting Integration

**Goal:** Apply A/C/Z weighting to probe display based on user selection.

#### Features:
- **Respect displayWeighting setting** from UI
- **Show weighted overall level** in probe panel header
- **Option to toggle** between weighted/unweighted spectrum
- **Highlight selected band** when displayBand is not 'overall'
- **Match receiver display behavior** for consistency

#### UI Changes:
```typescript
// In renderProbeChartOn():
if (displayWeighting !== 'Z') {
  const weightedMagnitudes = applyWeightingToSpectrum(
    data.magnitudes as Spectrum9,
    displayWeighting
  );
  // Use weightedMagnitudes for display
}

// Add overall weighted level to probe panel:
const overallA = calculateOverallLevel(data.magnitudes, 'A');
const overallC = calculateOverallLevel(data.magnitudes, 'C');
```

### 4. Performance Optimization

**Goal:** Maintain real-time interactivity with complex calculations.

#### Strategies:
- **Level-of-detail (LOD)** system:
  - Simple mode: Current implementation (instant)
  - Medium mode: Add barriers + ground (< 50ms)
  - High mode: Full ray-tracing (< 200ms)
- **Incremental updates**: Calculate direct path first, then reflections
- **Spatial caching**: Reuse calculations for nearby probe positions
- **WebAssembly acceleration** for ray-tracing math
- **GPU compute** for multiple probe positions simultaneously

### 5. Ghost Source Visualization

**Goal:** Show virtual source positions for reflections.

#### Features:
- **Visualize image sources** on canvas
- **Draw reflection paths** with dotted lines
- **Color-code by contribution** level
- **Toggle ghost sources** visibility
- **interferenceDetails.ghostCount** actually populated

### 6. Probe Comparison Mode

**Goal:** Compare multiple probe positions simultaneously.

#### Features:
- **Pin multiple probes** with different colors
- **Overlay spectra** on same chart
- **Difference plot** between two probes
- **A/B switching** for quick comparison
- **Export probe data** to CSV

## Implementation Priority

1. **High Priority** (Phase 1):
   - Frequency weighting integration (easiest, high value)
   - Basic barrier diffraction (align with receiver calculations)

2. **Medium Priority** (Phase 2):
   - Ground reflections with phase
   - First-order wall reflections
   - Complex interference for direct + ground

3. **Low Priority** (Phase 3):
   - Full ray-tracing with multiple bounces
   - Ghost source visualization
   - Probe comparison mode
   - WebAssembly optimization

## Testing Requirements

- Unit tests for phasor arithmetic
- Validation against known acoustic scenarios:
  - Single source + hard ground (should show comb filtering)
  - Two coherent sources (should show interference pattern)
  - Source behind barrier (should match receiver calculation)
- Performance benchmarks for each LOD mode
- User study on interactivity thresholds

## Related Components

- `packages/engine/src/propagation/` - Reference implementation for propagation
- `packages/engine/src/propagation/ground.ts` - Two-ray ground reflection model
- `packages/shared/src/utils/index.ts` - Weighting functions
- `apps/web/src/probeWorker.ts` - Current probe implementation

## Open Questions

1. Should probes use the same engine backend as receivers for consistency?
2. How much accuracy to sacrifice for real-time updates?
3. Should phase information be band-specific or broadband?
4. How to visualize interference patterns effectively?
5. Should probe calculations be cached when scene doesn't change?

## References

- ISO 9613-2: Attenuation of sound during propagation outdoors
- Maekawa, Z. (1968). "Noise reduction by screens"
- Keller, J.B. (1962). "Geometrical theory of diffraction"
- Pierce, A.D. (1981). "Acoustics: An Introduction to Its Physical Principles and Applications"