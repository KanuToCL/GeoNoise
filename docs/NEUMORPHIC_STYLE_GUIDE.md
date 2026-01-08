# GeoNoise Neumorphic Style Guide

This document defines the **solid opaque plastic neumorphism** design language used throughout GeoNoise.

---

## Design Philosophy

GeoNoise uses a "carved from the same material" aesthetic where UI elements appear to be pushed into or raised from a unified plastic surface. The design avoids gradients on interactive elements, favoring solid backgrounds with carefully crafted shadows to create depth.

---

## Core Shadow System

### Raised State (Default)
Elements appear to float above the surface:

```css
box-shadow: 3px 3px 6px rgba(100, 110, 130, 0.3), 
            -2px -2px 5px rgba(255, 255, 255, 0.7);
```

### Sunken State (Hover/Pressed)
Elements appear pushed into the surface:

```css
box-shadow: inset 3px 3px 6px rgba(100, 110, 130, 0.25), 
            inset -2px -2px 5px rgba(255, 255, 255, 0.6);
```

### Deeper Sunken (Active Press)
For the moment of click/tap:

```css
box-shadow: inset 4px 4px 8px rgba(100, 110, 130, 0.35), 
            inset -3px -3px 6px rgba(255, 255, 255, 0.5);
```

---

## Button States

All buttons follow a **raised-to-sunken** interaction pattern:

| State | Visual | Transform |
|-------|--------|-----------|
| Default | Raised shadows | `scale(1)` |
| Hover | Sunken shadows | `scale(0.98)` |
| Active/Press | Deeper sunken | `scale(0.96)` |
| Selected | Sunken + inset ring | `scale(0.98)` |

### Transition Timing
```css
transition: transform 160ms ease, 
            box-shadow 200ms ease, 
            background 160ms ease;
```

---

## Active/Selected State with Inset Ring

When a button is selected/active, it displays an **inset blue ring** that appears recessed inside the button surface, offset from the edge.

### Technique: Spacer Shadow
The ring is offset from the button edge using a background-colored "spacer" shadow:

```css
.button.is-active {
  box-shadow:
    /* Sunken shadows */
    inset 4px 4px 8px rgba(100, 110, 130, 0.3),
    inset -3px -3px 6px rgba(255, 255, 255, 0.5),
    /* Spacer - same color as background, creates gap */
    inset 0 0 0 5px var(--bg),
    /* Ring - appears inside the spacer */
    inset 0 0 0 7px var(--active-blue);
  color: var(--active-blue);
  transform: scale(0.98);
}
```

### Ring Sizing by Button Size

| Button Size | Spacer | Ring Width | Total Inset |
|-------------|--------|------------|-------------|
| Large (48px+) | 5px | 2px | 7px |
| Medium (36-48px) | 4px | 2px | 6px |
| Small (28px) | 3px | 2px | 5px |

---

## Button Size Reference

### Large Buttons (48px circular)
- `.dock-button` - Tool dock buttons

### Medium Buttons
- `.ui-button` - Generic UI buttons
- `button.primary` - Primary action buttons (pill shape)
- `button.ghost` - Ghost/secondary buttons
- `.tool-button` - Tool palette buttons
- `.modal-close` - Modal close button (42px circular)

### Small Buttons (28px circular)
- `.probe-freeze`, `.probe-pin`, `.probe-close` - Panel action buttons
- `.context-close` - Context panel close
- `.about-tab` - Tab buttons

---

## Toggle Switches

Toggle switches use an inset track with a raised thumb that extends beyond the track:

```
┌──────────────────────────────┐
│  ┌──────────────────────┐    │
│  │ ▓▓▓ inset track ▓▓▓ │●   │  ← Thumb extends 2px beyond track
│  └──────────────────────┘    │
└──────────────────────────────┘
```

### Track (OFF state)
```css
background: #d8dfe8;
box-shadow:
  inset 3px 3px 6px #b8c4d0,
  inset -2px -2px 4px #ffffff;
```

### Track (ON state)
```css
background: var(--active-blue);
box-shadow: none;
```

### Thumb
```css
width: 28px;  /* Larger than 24px track height */
height: 28px;
background: linear-gradient(145deg, #ffffff, #f0f4f8);
box-shadow:
  4px 4px 10px #a3b1c6,
  -3px -3px 8px #ffffff;
```

---

## Floating Containers

Containers that float over the map (topbar, dock, panels) use **hard-edge shadows** to avoid white glow bleeding onto colorful backgrounds:

```css
box-shadow: 0 8px 32px #8a95a8, 0 2px 8px #a0a8b8;
```

**Applied to:**
- `.topbar`
- `.dock-tools`, `.dock-fab`
- `.context-panel`, `.probe-panel`
- `.layers-popover`, `.settings-popover`
- `.db-legend`

---

## Color Variables

```css
--active-blue: #2d8cff;        /* Primary selection color */
--active-blue-soft: #d8e8ff;   /* Soft blue background */
--active-blue-glow: 0 0 10px rgba(45, 140, 255, 0.5);

--bg: #e0e5ec;                 /* Main surface color */
--shadow-dark: #a3b1c6;        /* Dark shadow (bottom-right) */
--shadow-light: #ffffff;       /* Light shadow (top-left) */
```

---

## Best Practices

1. **Consistency**: All interactive elements should follow raised→sunken interaction
2. **No gradients on buttons**: Use solid `var(--bg)` background
3. **Scale transforms**: Subtle scale reduction (0.98, 0.96) enhances pressed feeling
4. **Inset rings, not outlines**: Active states use inset shadow rings, not CSS outlines or borders
5. **Hard shadows on floating elements**: Prevents white glow on colorful backgrounds
6. **Match the material**: All elements should appear carved from the same plastic surface

---

## Reference Images

The design is inspired by classic neumorphic UI patterns where buttons appear as physical objects that can be pressed into a soft surface, with selection indicated by an inset ring inside the pressed area.

```
   Raised (default)          Sunken (hover)         Active (selected)
  ╭─────────────────╮       ╭─────────────────╮    ╭─────────────────╮
  │                 │       │ ░░░░░░░░░░░░░░░ │    │ ░░░░░░░░░░░░░░░ │
  │    ▲ raised     │  →    │    ▼ sunken     │    │  ┌───────────┐  │
  │     shadows     │       │     shadows     │    │  │ blue ring │  │
  ╰─────────────────╯       ╰─────────────────╯    │  └───────────┘  │
                                                   ╰─────────────────╯
```
