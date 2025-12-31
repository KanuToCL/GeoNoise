# GeoNoise

GeoNoise is an interactive sound propagation sandbox for quick site planning and "what-if" exploration. It lets you place sources, receivers, barriers, and buildings, then compute receiver levels, panel grids, and whole-scene noise maps in seconds.

## Motivation

Acoustic planning often starts with fast feedback: "What happens if I move this source?" or "Does a barrier help here?" GeoNoise focuses on the early design phase where responsiveness and clear visuals matter more than exhaustive modeling. The goal is to make the physics legible while keeping the UI fast enough to iterate live.

## What It Does

- Place sources, receivers, barriers, buildings, and measure grids on a canvas.
- Compute receiver levels and panel statistics (min/max/avg/percentiles).
- Generate a full-scene noise map (heatmap overlay).
- Drag geometry with live, throttled updates for preview-quality maps that snap to full quality on release.
- Toggle propagation options such as spreading, atmospheric absorption, ground reflections, and barriers.

## Physics Model (v1)

The propagation model is implemented in `packages/engine/src/propagation/index.ts` and applies these components per source-receiver path:

### 1) Geometric spreading

Point source (spherical):

```
A_div = 20 * log10(r) + 11
```

Line source (cylindrical):

```
A_div = 10 * log10(r) + 8
```

`r` is distance in meters and is clamped to a minimum distance for stability.

### 2) Atmospheric absorption

Absorption is computed per octave band using either a simplified model or ISO 9613. The total absorption is:

```
A_atm = alpha(f, T, RH, p) * r
```

where `alpha` is frequency-dependent attenuation (dB/m) and `r` is distance.

### 3) Ground effect

Legacy ISO 9613-2 Eq. (10) baseline (soft ground only):

```
h_m = (h_s + h_r) / 2
A_gr = max(0, 4.8 - (2 * h_m / d) * (17 + 300 / d))
```

`h_s` is source height, `h_r` is receiver height, and `d` is source-receiver distance. A two-ray phasor model is also available for ground reflection when enabled.

### 4) Barrier insertion loss

Maekawa/Kurze-Anderson-style single-screen approximation:

```
N = 2 * delta / lambda
A_bar = 10 * log10(3 + 20 * N)
```

- `delta = A + B - d` is the path length difference between the diffracted path and direct path.
- `lambda = c / f` is wavelength.
- If `N < -0.1`, insertion loss is clamped to 0 dB.
- `A_bar` is capped at 20 dB (single-screen limit).

### 5) Total attenuation and SPL

Unblocked path:

```
A_total = A_div + A_atm + A_gr
```

Blocked path:

```
A_total = A_div + A_atm + max(A_bar, A_gr)
```

The max term prevents a barrier from making results louder than the unblocked case.

Sound pressure level at the receiver:

```
SPL = L_w - A_total
```

### 6) A-weighted overall level (LAeq)

Octave-band levels are A-weighted and summed logarithmically:

```
LAeq = 10 * log10( sum(10^( (L_i + A_i) / 10 )) )
```

`L_i` is the band level and `A_i` is the A-weighting for that band.

## Noise Map Rendering

The noise map computes SPL on a grid over scene bounds (merged with the viewport), then maps values to a color ramp and draws the result as a textured heatmap. During live drags, the grid resolution is intentionally lowered for responsiveness, then recomputed at higher resolution on release.

## How To Use

## Installation

1. Install Node.js (>= 18) and npm.
2. Install dependencies:

```
npm install
```

### Run the web app

```
./run-web.command
```

Or run directly with npm:

```
npm -w @geonoise/web run dev
```

Then open `http://localhost:5173` (or your `PORT` value if set).

### Quick workflow

1. Add sources (`S`) and receivers (`R`).
2. Click `Compute` to update receiver/panel results.
3. Click `Generate Map` to create the full noise map.
4. Drag sources or barriers to preview live updates.
5. Use map settings to switch between smooth and contour render styles.

## Project Layout

- `apps/web` - Web UI and canvas renderer.
- `packages/engine` - Propagation engine and compute pipeline.
- `packages/core` - Shared schemas, config, and domain types.
- `packages/shared` - Constants, math helpers, and shared utilities.

## Notes

- This is a planning-grade model intended for fast iteration, not a certified compliance tool.
- The physics model is explicit and readable in the engine source; contributions that improve accuracy or validation are welcome.
