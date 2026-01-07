# Per-Band Noise Map Display & Layers Popover UI Fixes

**Date:** 2026-01-07
**Author:** Devmate AI Assistant

---

## Overview

This document describes two features implemented in this commit:

1. **Per-band noise map display** - On-demand recomputation of noise maps for individual frequency bands
2. **Layers popover UI fixes** - Z-index and slide-down animation improvements

---

## Feature 1: Per-Band Noise Map Display

### Purpose

Allow users to view noise maps for individual octave frequency bands (63 Hz - 16 kHz) instead of only the overall weighted level. When a user selects a specific band from the "Display Band" dropdown, the grid is recomputed to show only that band's unweighted level.

### Design Approach

**On-Demand Recomputation (No Caching)**

Since noise maps are dynamically recalculated with every scene change, there's no benefit to caching per-band results. The implementation simply:
1. Accepts the target band selection from the UI
2. Passes it through to the compute engine
3. Returns either single-band level or weighted overall level based on selection

### Files Modified

#### 1. `packages/core/src/schema/index.ts`

Added new schema fields to `GridConfigSchema`:

```typescript
/** Frequency weighting type for grid display */
export const FrequencyWeightingSchema = z.enum(['A', 'C', 'Z']);

/** Extended GridConfigSchema with per-band options */
export const GridConfigSchema = z.object({
  // ... existing fields ...

  // Per-band noise map display options (on-demand recomputation)
  targetBand: z.number().int().min(0).max(8).optional(), // Band index 0-8 (63Hz-16kHz)
  weighting: FrequencyWeightingSchema.default('A'),       // Used when targetBand is undefined
});
```

- `targetBand`: Optional band index (0-8). When undefined, compute overall weighted level.
- `weighting`: Frequency weighting to apply ('A', 'C', or 'Z') when computing overall level.

#### 2. `packages/engine/src/compute/index.ts`

Modified `computeGrid()` to handle per-band display:

```typescript
// Per-band noise map display options
const targetBand = gridConfig.targetBand;
const weighting = gridConfig.weighting ?? 'A';

// When computing each grid point:
if (targetBand !== undefined) {
  // Return unweighted single-band level
  return totalSpectrum[targetBand];
} else {
  // Return weighted overall level (A, C, or Z weighting)
  return calculateOverallLevel(totalSpectrum, weighting);
}
```

#### 3. `apps/web/src/main.ts`

Updated UI wiring:

- `buildNoiseMapGridConfig()`: Now reads `displayBand` and `displayWeighting` state and passes them to the grid config
- `wireDisplaySettings()`: Added event listener on band selection change to trigger noise map recomputation

```typescript
displayBandSelect?.addEventListener('change', () => {
  // ... update display state ...

  // Recompute noise map with new band selection if visible
  if (layers.noiseMap) {
    void computeNoiseMapInternal({ ... });
  }
  requestRender();
});
```

### UI Controls

Located in the Layers popover under "Display Settings":

- **Frequency Weighting**: A/C/Z weighting (applies to overall level only)
- **Display Band**: "Overall (Sum)" or individual bands (63 Hz - 16 kHz)

---

## Feature 2: Layers Popover UI Fixes

### Issues Addressed

1. **Z-index problem**: Popover appeared behind the inspector panel
2. **No animation**: Popover appeared/disappeared abruptly without animation

### Root Cause Analysis

The `.topbar` element uses `backdrop-filter: blur(18px)` which creates a new **stacking context** in CSS. This traps all child elements within that stacking context, preventing z-index from working across different parts of the DOM tree.

### Solution

#### 1. HTML Structure Change (`apps/web/index.html`)

Moved `.layers-popover` outside of `.topbar` to escape the stacking context:

**Before:**
```html
<header class="topbar">
  <div class="layers-toggle">
    <button id="layersButton">Layers</button>
    <div class="layers-popover">...</div>  <!-- Trapped in topbar's stacking context -->
  </div>
</header>
```

**After:**
```html
<header class="topbar">
  <div class="layers-toggle" id="layersToggle">
    <button id="layersButton">Layers</button>
  </div>
</header>

<!-- Layers popover (outside topbar to escape stacking context) -->
<div class="layers-popover" id="layersPopover">...</div>
```

#### 2. CSS Animation (`apps/web/src/style.css`)

Added slide-down animation using CSS transitions:

```css
.layers-popover {
  position: fixed;
  top: 72px;
  right: 24px;
  z-index: 9999;
  isolation: isolate;
  pointer-events: none;

  /* Hidden state */
  opacity: 0;
  transform: translateY(-8px);
  visibility: hidden;
  transition: opacity 0.18s ease-out, transform 0.18s ease-out, visibility 0s linear 0.18s;
}

.layers-popover.is-open {
  opacity: 1;
  transform: translateY(0);
  visibility: visible;
  pointer-events: auto;
  transition: opacity 0.18s ease-out, transform 0.18s ease-out, visibility 0s linear 0s;
}
```

Key points:
- Uses `visibility` + `opacity` instead of `display` for animatable show/hide
- `transform: translateY(-8px)` creates the slide-down effect
- Delayed `visibility` transition prevents interaction during hide animation

#### 3. JavaScript Update (`apps/web/src/main.ts`)

Updated `wireLayersPopover()` to toggle `is-open` on the popover element itself:

```typescript
const toggle = () => {
  const isOpen = layersPopover.classList.toggle('is-open');
  layersButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  layersPopover.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
};

// Close on click outside (check both button and popover)
document.addEventListener('click', (event) => {
  if (!container.contains(event.target as Node) && !layersPopover.contains(event.target as Node)) {
    close();
  }
});
```

---

## Testing

### Per-Band Noise Map
1. Create a scene with at least one source
2. Click "Generate Map" to create noise map
3. Open Layers popover → Display Settings → Display Band
4. Select different bands (e.g., "500 Hz", "1000 Hz")
5. Verify the noise map updates to show single-band levels

### Layers Popover UI
1. Click "Layers" button in the top bar
2. Verify popover slides down smoothly
3. Open the inspector by selecting an object
4. Click "Layers" again
5. Verify popover appears **in front of** the inspector
6. Click outside the popover to close
7. Verify it animates out smoothly

---

## Technical Notes

### CSS Stacking Contexts

The following CSS properties create new stacking contexts:
- `backdrop-filter` / `-webkit-backdrop-filter`
- `transform` (any value other than none)
- `opacity` (less than 1)
- `position: fixed` or `position: sticky`
- `isolation: isolate`

When an element is in a stacking context, its z-index only competes with siblings in the same context, not with elements in other stacking contexts.

### Band Index Mapping

| Index | Frequency |
|-------|-----------|
| 0 | 63 Hz |
| 1 | 125 Hz |
| 2 | 250 Hz |
| 3 | 500 Hz |
| 4 | 1000 Hz |
| 5 | 2000 Hz |
| 6 | 4000 Hz |
| 7 | 8000 Hz |
| 8 | 16000 Hz |
