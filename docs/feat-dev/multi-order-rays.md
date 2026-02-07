# Multi-Order Reflections

> Feature development planning for adding 2nd and 3rd order reflections to GeoNoise.

---

## Overview

Currently, the engine computes **direct path only** (source → receiver). Multi-order reflections add:

- **2nd order (1 bounce):** source → wall → receiver
- **3rd order (2 bounces):** source → wall → wall → receiver
- **Higher orders:** for probe/advanced users

### Target Use Cases

| Use Case | Reflection Order | Priority |
|----------|------------------|----------|
| Colormap grid (40k points) | 2nd order | **Primary** |
| Colormap grid (advanced) | 3rd order | Secondary |
| Probe (interactive) | 2nd-4th+ order | Secondary |

---

## Computational Scaling

The problem: reflection paths grow multiplicatively with wall count.

| Scenario | Grid Points | Walls | Paths per Point | Total Calculations |
|----------|-------------|-------|-----------------|-------------------|
| Current (direct only) | 40k | - | 1 | 40k |
| 2nd order, 10 walls | 40k | 10 | 1 + 10 = 11 | 440k |
| 2nd order, 50 walls | 40k | 50 | 1 + 50 = 51 | **2M** |
| 3rd order, 50 walls | 40k | 50 | 1 + 50 + 2500 = 2551 | **102M** |

**Current grid compute:** 0.5-3s
**Projected with 2nd order + 50 walls (naive):** 25-75s ❌

---

## Image Source Method

For specular reflections, use the **image source method**:

1. For each wall, compute a **virtual source** by mirroring the real source across the wall plane
2. Each receiver "sees" energy from the real source + all valid virtual sources
3. A virtual source is valid if:
   - The reflection point lies within the wall bounds
   - The path (source → wall → receiver) is not occluded

### 2nd Order

```
Real source S at (x, y)
Wall W with normal n

Virtual source S' = S - 2 * dot(S - wall_point, n) * n

For each grid point P:
  - Direct: S → P
  - Reflected: S' → P (if valid)
```

### 3rd Order

Each 1st-order virtual source spawns N more virtual sources (one per wall), creating a tree:

```
S (real)
├── S'₁ (reflected in wall 1)
│   ├── S'₁₁ (S'₁ reflected in wall 1) — skip, same wall
│   ├── S'₁₂ (S'₁ reflected in wall 2)
│   └── ...
├── S'₂ (reflected in wall 2)
│   └── ...
└── ...
```

---

## Spatial Culling (Required Optimization)

**Spatial culling** = skipping calculations for walls that can't possibly contribute to the result.

Without culling, every grid point checks every wall. With culling, we eliminate impossible paths.

### Culling Strategies

#### 1. Distance Culling

A reflection path is: `source → wall → receiver`

```typescript
const pathLength = distance(source, wall) + distance(wall, receiver);
if (pathLength > MAX_AUDIBLE_RANGE) skip;
```

Sound below -60 dB from geometric spreading (~1km) is inaudible. Most walls won't contribute to distant grid points.

#### 2. Backface Culling

A wall only reflects sound if both source and receiver are on the "front" side:

```typescript
const sourceVisible = dot(wallNormal, source - wallCenter) > 0;
const receiverVisible = dot(wallNormal, receiver - wallCenter) > 0;
if (!sourceVisible || !receiverVisible) skip;
```

#### 3. Spatial Index (Acceleration Structure)

Instead of checking all walls, use a grid or BVH:

```typescript
// Naive: O(points × walls)
for (const point of gridPoints) {
  for (const wall of allWalls) {
    addReflection(point, wall);  // 2M iterations
  }
}

// Culled: O(points × nearby walls)
for (const point of gridPoints) {
  const nearbyWalls = spatialIndex.query(point, maxRange);
  for (const wall of nearbyWalls) {
    if (facesSource(wall, source) && facesPoint(wall, point)) {
      addReflection(point, wall);  // ~200k iterations
    }
  }
}
```

**Expected reduction:** 5-10x fewer path calculations.

#### 4. Shadow Culling (Optional)

Skip walls where the path is blocked by other geometry. Expensive—may defer to GPU or approximate.

---

## Compute Backend Options

### Current State

- **CPU reference engine** in `packages/engine/`
- **Web Worker** wrapper in `packages/engine-backends/`
- **WebGPU stub** in `packages/engine-webgpu/` (not implemented)

### Options Ranked by ROI

#### 1. Spatial Culling (Do First)

- Required regardless of compute backend
- 5-10x reduction in path calculations
- **Effort:** 1-2 weeks
- **Coverage:** 100%

#### 2. Wasm + SIMD

- Port reflection math to Rust, compile to Wasm
- SIMD: compute 4-8 paths per instruction
- **Effort:** 2-3 weeks
- **Coverage:** 95%+ browsers
- **Speedup:** 3-8x

#### 3. WebGPU Compute

- Grid points are embarrassingly parallel
- Each thread: accumulate energy from source + virtual sources
- Wall occlusion via GPU ray-segment tests
- **Effort:** 3-4 weeks
- **Coverage:** ~75% (no Safari < 18, no Firefox ESR, limited mobile)
- **Speedup:** 20-100x on supported browsers

#### 4. Hybrid Approach (Recommended)

```
┌─────────────────────────────────────────┐
│          Compute Backend Router         │
├─────────────────────────────────────────┤
│  WebGPU available? ──yes──► WebGPU      │
│         │                   (20-100x)   │
│         no                              │
│         ▼                               │
│  Wasm+SIMD available? ─yes─► Wasm+SIMD  │
│         │                   (3-8x)      │
│         no                              │
│         ▼                               │
│  CPU fallback                           │
│  (with spatial culling)                 │
└─────────────────────────────────────────┘
```

---

## Vercel Deployment Considerations

This is a client-side web app deployed on Vercel (static hosting). All compute runs in the browser.

| Factor | Implication |
|--------|-------------|
| No server GPU | All acceleration must be client-side |
| Varied browsers | Need fallback for non-WebGPU browsers |
| Mobile users | WebGPU support is limited; Wasm works well |
| Cold start | No serverless compute latency concerns |

**Recommendation:** Wasm+SIMD as default, WebGPU as optional "turbo mode".

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Add wall normal vectors to barrier/building data
- [ ] Implement image source computation (mirror source across wall)
- [ ] Add reflection validity check (point within wall bounds)
- [ ] Basic 2nd order for single receiver (probe)

### Phase 2: Spatial Culling
- [ ] Implement spatial index (grid or BVH) for walls
- [ ] Add distance culling with configurable max range
- [ ] Add backface culling using wall normals
- [ ] Benchmark culling effectiveness

### Phase 3: Grid Integration
- [ ] Extend grid compute to include 2nd order reflections
- [ ] Update colormap texture generation
- [ ] Add UI toggle for reflection order
- [ ] Performance profiling

### Phase 4: Compute Acceleration (Choose Path)

**Option A: Wasm+SIMD**
- [ ] Create Rust crate for reflection math
- [ ] Compile to Wasm with SIMD target
- [ ] Integrate with engine-backends router
- [ ] Benchmark vs CPU

**Option B: WebGPU**
- [ ] Implement `WebGPUBackend.computeGrid()` with reflection support
- [ ] Write WGSL compute shaders for image source method
- [ ] GPU-side spatial index or brute-force with early exit
- [ ] Benchmark vs CPU/Wasm

### Phase 5: 3rd Order (Advanced)
- [ ] Extend image source tree to 2 bounces
- [ ] Aggressive culling (prune branches early)
- [ ] Consider probe-only (not grid) for 3rd order

---

## Open Questions

1. **Reflection coefficient:** Fixed value or frequency-dependent per material?
2. **Diffuse vs specular:** Image source is specular only—add diffuse scattering?
3. **Ground reflections:** Currently handled separately—unify with wall reflections?
4. **Max reflection distance:** User-configurable or auto-derived from noise floor?

---

## References

- [Image Source Method (Allen & Berkley, 1979)](https://asa.scitation.org/doi/10.1121/1.382599)
- [Beam Tracing for Acoustics](https://www.cs.princeton.edu/~funk/beam.pdf)
- [WebGPU Specification](https://www.w3.org/TR/webgpu/)
- [wasm-bindgen SIMD](https://rustwasm.github.io/docs/wasm-bindgen/)

---

*Created: 2025-02-06*
