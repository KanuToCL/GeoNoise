# GeoNoise Roadmap

This document contains planned features and enhancements for GeoNoise. For completed implementations, see [CHANGELOG.md](./CHANGELOG.md).

---

## Table of Contents

1. [Status Summary](#status-summary)
2. [High Priority - In Progress](#high-priority---in-progress)
3. [Planned This Cycle](#planned-this-cycle)
4. [Future Enhancements](#future-enhancements)
5. [Barrier Side Diffraction Toggle](#barrier-side-diffraction-toggle)
6. [Configurable Diffraction Models](#configurable-diffraction-models)
7. [Wall Reflections for Diffracted Paths](#wall-reflections-for-diffracted-paths)
8. [Phase 1 Remaining Tasks](#phase-1-remaining-tasks)

---

## Status Summary

### ✅ Recently Completed

- **Barrier side diffraction toggle** (v0.4.2) - See [CHANGELOG.md](./CHANGELOG.md)

### 🔨 In Progress / High Priority

- Visual indicator when probe is "calculating"

### 📅 Planned (This Cycle)

- Building diffraction models UI exposure
- Expose `maxReflections` setting in UI (currently hardcoded to 0)

### 🔮 Future Enhancements

- Configurable diffraction model selection (Maekawa / Kurze-Anderson / ISO 9613-2)
- Higher-order reflections (2nd, 3rd order bounces)
- Wall reflections for diffracted paths
- Ghost source visualization on canvas
- LOD system for performance modes
- Probe comparison mode
- WebAssembly/GPU acceleration
- Spatial caching for nearby positions
- Terrain/topography effects
- Expose `maxReflections` setting in UI (currently hardcoded to 0)

---

## High Priority - In Progress

### Visual Indicator When Probe is Calculating

Add a loading/calculating indicator to show when probe computation is in progress.

**Status:** In Progress
**Priority:** High

---

## Planned This Cycle

### Expose maxReflections Setting in UI

**Problem:** Currently hardcoded to 0 in `PropagationConfigSchema` (range: 0-3). This controls higher-order reflections and could significantly impact accuracy.

**Evaluation needed:**
1. Performance impact of 1st/2nd/3rd order reflections
2. Whether to expose as advanced setting or simple toggle
3. Interaction with existing wall reflection code in `probeWorker.ts`

---

## ~~Barrier Side Diffraction Toggle~~ ✅ COMPLETED

> **Status:** ✅ Completed in v0.4.2
> **Implemented:** 2026-01-07

See [CHANGELOG.md](./CHANGELOG.md#barrier-side-diffraction-toggle) for full implementation details.

---

## Configurable Diffraction Models

> **Status:** Future Enhancement
> **Priority:** Medium

### Overview

Different acoustic scenarios benefit from different diffraction models. A festival planner may prefer fast approximate models, while an environmental noise consultant may require ISO-compliant calculations.

### Proposed UI Configuration

```typescript
interface DiffractionConfig {
  // Barrier (thin screen) diffraction model
  barrierModel: 'maekawa' | 'kurze-anderson' | 'iso9613-2' | 'none';

  // Building (thick obstacle) diffraction model
  buildingModel: 'blocking-only' | 'double-edge-maekawa' | 'pierce' | 'shortest-path';

  // Whether to consider horizontal (around-corner) diffraction
  enableHorizontalDiffraction: boolean;

  // Maximum diffraction loss before path is considered "blocked"
  maxDiffractionLoss: number;  // default: 25 dB
}
```

### Barrier Diffraction Models

| Model | Description | Pros | Cons |
|-------|-------------|------|------|
| `maekawa` | Simplest, most widely used | Fast, validated | Less accurate at low N |
| `kurze-anderson` | Better low-frequency behavior | Smooth transition at N=0 | Marginally more complex |
| `iso9613-2` | Full ISO compliance with ground corrections | Standards-compliant | More complex geometry |
| `none` | Barriers block completely or ignored | Debugging | Unrealistic |

### Building Diffraction Models

| Model | Description | Max Loss |
|-------|-------------|----------|
| `blocking-only` | No diffraction, infinite attenuation | ∞ |
| `double-edge-maekawa` | Coefficient 40 for roof paths | 25-30 dB |
| `pierce` | Separate edge losses + coupling | 30-35 dB |
| `shortest-path` | Evaluates roof + both corners, takes minimum | Varies |

### Configuration Examples

**Festival Mode (Fast):**
```typescript
{
  barrierModel: 'maekawa',
  buildingModel: 'blocking-only',
  enableHorizontalDiffraction: false,
  maxDiffractionLoss: 20
}
```

**Standard Mode (Balanced):**
```typescript
{
  barrierModel: 'maekawa',
  buildingModel: 'double-edge-maekawa',
  enableHorizontalDiffraction: false,
  maxDiffractionLoss: 25
}
```

**Accurate Mode (Consulting):**
```typescript
{
  barrierModel: 'iso9613-2',
  buildingModel: 'shortest-path',
  enableHorizontalDiffraction: true,
  maxDiffractionLoss: 30
}
```

### Implementation Phases

| Phase | Task | Priority |
|-------|------|----------|
| 1 | Implement `blocking-only` for buildings | High |
| 2 | Add `double-edge-maekawa` for buildings | High |
| 3 | Add UI toggle for building model | Medium |
| 4 | Implement `pierce` thick barrier model | Medium |
| 5 | Add `shortest-path` with horizontal diffraction | Low |
| 6 | Add `kurze-anderson` and `iso9613-2` barrier models | Low |

---

## Wall Reflections for Diffracted Paths

> **Status:** Future Enhancement
> **Priority:** Low

### Problem Statement

Currently, when a direct path is blocked by a building:
1. We compute diffraction paths (over roof + around corners)
2. Each diffraction path creates a phasor with proper attenuation and phase
3. All paths are summed coherently

However, these diffracted paths are treated as **terminal** — they cannot undergo further wall reflections. In reality, a diffracted sound wave can reflect off nearby building walls.

### Current Behavior

```
        S                              R
         \                            /
          \      DIFFRACTED PATH     /
           A₁ ──→ ●────────● ←── A₂
                  │  ROOF  │
           ═══════╧════════╧═══════   Building A

                                       ┌─────────────┐
                                       │  Building B │
                                       └─────────────┘
                                             ↑
                             Currently: No reflection computed
```

**What we compute:**
- S → Roof → R (diffracted path) ✅

**What we DON'T compute:**
- S → Roof → Wall_B → R (diffracted + reflected path) ❌

### Proposed Enhancement

Add an option to trace wall reflections from diffracted paths:

```typescript
interface DiffractionConfig {
  // Enable wall reflections on diffracted paths
  enableDiffractedPathReflections: boolean;  // default: false

  // Maximum reflection order for diffracted paths
  maxDiffractedPathReflectionOrder: number;  // default: 1
}
```

### Performance Considerations

This enhancement significantly increases path count:
- Current: ~1-5 paths per source
- With diffracted reflections: 10-20+ paths per source

**Mitigation strategies:**
1. Default to OFF (user must opt-in)
2. Limit to first-order reflections only
3. Distance culling (skip reflections > 100m from receiver)
4. Amplitude culling (skip paths with estimated level < -80 dB)
5. Lazy evaluation (only compute if diffraction loss < 20 dB)

### When This Matters

**High Impact Scenarios:**
- Urban canyons with many reflective surfaces
- Source behind building, receiver in courtyard surrounded by walls
- Long diffraction paths with nearby reflective walls

**Low Impact Scenarios:**
- Open fields with isolated buildings
- Soft/absorptive building facades
- Short source-receiver distances

---

## Phase 1 Remaining Tasks

From the original project TODO:

- [ ] Save/load scene JSON with migrate/validate/normalize + tests `T6.1.1` and `T6.1.2`
- [ ] Test `T7.1.1`: incremental equals full recompute within tolerance
- [ ] DoD verification + integration tests
- [ ] SPEC docs (`SPEC.*.md`) for Phase 1 behavior
- [ ] Align UI compute with engine propagation config (mode/output metric)
- [ ] Add canonical scenes and golden snapshots through router for receivers + panels

---

## Future Enhancements Summary

| Feature | Priority | Effort | Status |
|---------|----------|--------|--------|
| Probe calculating indicator | High | Low | In Progress |
| Barrier side diffraction | Medium | Medium | Planned |
| Expose maxReflections UI | Medium | Low | Planned |
| Configurable diffraction models | Medium | High | Future |
| Ghost source visualization | Low | Medium | Future |
| LOD performance modes | Low | High | Future |
| Probe comparison mode | Low | Medium | Future |
| WebGPU acceleration | Low | Very High | Future |
| Spatial caching | Low | Medium | Future |
| Terrain/topography | Low | Very High | Future |
| Diffracted path reflections | Low | High | Future |
| Auralization/HRTF | Low | Very High | Future |

---

*See also: [ARCHITECTURE.md](./ARCHITECTURE.md) for system overview, [CHANGELOG.md](./CHANGELOG.md) for completed implementations.*
