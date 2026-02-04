# Drawing Tools UX Improvements

## Overview

Enhance the Building (H) and Barrier (B) drawing tools with more intuitive drawing modes, accessible via a submenu on double-click of the tool button.

---

## 🎯 Goals

1. **Faster building creation** - Multiple drawing modes for different workflows
2. **Intuitive barrier placement** - Center-out and edge-drag modes
3. **Immediate selection** - Auto-select newly created elements
4. **Discoverability** - Submenu appears on double-click of tool button

---

## 🏢 Building Tool (H) Improvements

### Current Behavior
- Click to place building corner
- Click again to place opposite corner
- Fixed rectangular shape

### Proposed: Drawing Modes Submenu

**Trigger**: Double-click on H button (single click still selects tool)

```
┌─────────────────────────────────────────┐
│ 🏢 Building Drawing Mode                │
├─────────────────────────────────────────┤
│ ◉ Diagonal Drag (current)               │
│   Click corner, drag to opposite        │
│                                         │
│ ○ Corner-to-Corner                      │
│   Click 4 corners sequentially          │
│                                         │
│ ○ Center Outward                        │
│   Click center, drag to corner          │
│                                         │
│ ─────────────────────────────────────── │
│ ☑ Auto-select after creation            │
│ ☑ Show dimensions while drawing         │
└─────────────────────────────────────────┘
```

### Mode 1: Diagonal Drag (Default)

```
     Click here (anchor)
         ●─────────────────┐
         │                 │
         │                 │
         │                 │
         └─────────────────●
                     Drag to here
```

**Behavior**:
- Click to anchor first corner
- Drag (or click again) to set opposite corner
- Release/click creates rectangle
- **NEW**: Building auto-selects after creation

### Mode 2: Corner-to-Corner (Polygon)

```
    ●───────────────●
   /                 \
  /                   \
 ●                     ●
  \                   /
   \                 /
    ●───────────────●

Click points 1, 2, 3, 4... then Enter/double-click to close
```

**Behavior**:
- Click to place each corner
- Double-click or press Enter to close polygon
- Must be convex or simple polygon (for physics)
- Minimum 3 points, maximum 12 points

**Physics Audit Required**:
- [ ] Verify shadow calculation works with non-rectangular buildings
- [ ] Verify reflection/diffraction handles arbitrary polygons
- [ ] Test performance with complex geometries

### Mode 3: Center Outward

```
                  ┌─────────────────┐
                  │                 │
                  │        ●        │  ← Click center
                  │     (anchor)    │
                  │                 │
                  └─────────────────●
                               Drag to corner
```

**Behavior**:
- Click to set building center
- Drag outward to any corner
- Building expands symmetrically from center
- Release creates rectangle

---

## 🚧 Barrier Tool (B) Improvements

### Current Behavior
- Click to place one end
- Click again to place other end
- Line segment barrier

### Proposed: Drawing Modes Submenu

**Trigger**: Double-click on B button

```
┌─────────────────────────────────────────┐
│ 🚧 Barrier Drawing Mode                 │
├─────────────────────────────────────────┤
│ ◉ End-to-End (current)                  │
│   Click start, click end                │
│                                         │
│ ○ Center Outward                        │
│   Click center, drag to expand both     │
│                                         │
│ ○ Anchor + Drag                         │
│   Click to anchor one end, drag other   │
│                                         │
│ ─────────────────────────────────────── │
│ ☑ Auto-select after creation            │
│ ☑ Show length while drawing             │
│ Height: [3.0] m (default for new)       │
└─────────────────────────────────────────┘
```

### Mode 1: End-to-End (Default)

```
●────────────────────────────●
Click                      Click
```

**Behavior**: Current behavior, no change

### Mode 2: Center Outward

```
←────────────●────────────→
             ↑
          Click center
          Drag outward
```

**Behavior**:
- Click to set barrier center point
- Drag outward - barrier expands equally in both directions
- Angle determined by drag direction
- Release creates barrier

**Use case**: When you know where the barrier CENTER should be (e.g., centered on a property line)

### Mode 3: Anchor + Drag

```
●────────────────────────────→
↑                         Drag
Anchored                  freely
(first click)
```

**Behavior**:
- Click to anchor one end (fixed)
- Move mouse to position other end
- Shows length and angle in real-time
- Click again to confirm
- Like measurement tool, but creates barrier

---

## 🎨 UI Implementation

### Submenu Trigger

```typescript
// Detect double-click on tool button
let lastClickTime = 0;
const DOUBLE_CLICK_THRESHOLD = 300; // ms

toolButton.addEventListener('click', (e) => {
  const now = Date.now();
  if (now - lastClickTime < DOUBLE_CLICK_THRESHOLD) {
    // Double-click: show submenu
    showDrawingModeSubmenu(tool);
  } else {
    // Single click: select tool
    setActiveTool(tool);
  }
  lastClickTime = now;
});
```

### Submenu Positioning

```
┌──────────┐
│ Sources  │
├──────────┤
│ Receivers│
├──────────┤
│ Barriers │◄─────────┐
├──────────┤          │
│ Buildings│     ┌────┴────────────────────┐
├──────────┤     │ 🏢 Building Drawing Mode│
│ ...      │     │ ◉ Diagonal Drag         │
└──────────┘     │ ○ Corner-to-Corner      │
                 │ ○ Center Outward        │
                 └─────────────────────────┘

Submenu appears to the right of toolbar
```

### Visual Feedback While Drawing

```
           ┌─────────────────┐
           │                 │
           │   W: 25.4m      │  ← Dimension labels
           │   H: 18.2m      │
           │   A: 462 m²     │
           │                 │
           └─────────────────┘
                    ↑
            Dashed outline while dragging
```

---

## 📁 Implementation Files

### Modified Files

```
apps/web/src/
├── main.ts              # Drawing mode state, canvas event handlers
├── index.html           # Submenu HTML for each tool
└── style.css            # Submenu styling

apps/web/src/
├── drawingModes/
│   ├── index.ts         # Mode definitions, exports
│   ├── building.ts      # Building drawing mode handlers
│   ├── barrier.ts       # Barrier drawing mode handlers
│   └── ui.ts            # Submenu show/hide logic
```

### State Management

```typescript
// Drawing mode state
interface DrawingModeState {
  tool: 'building' | 'barrier' | 'source' | 'receiver' | null;
  mode: string;  // 'diagonal' | 'corner' | 'center' for buildings
  isDrawing: boolean;
  anchor: Point | null;
  points: Point[];  // For polygon mode
  previewShape: Shape | null;
}

const drawingState: DrawingModeState = {
  tool: null,
  mode: 'diagonal',
  isDrawing: false,
  anchor: null,
  points: [],
  previewShape: null,
};
```

---

## 📋 Implementation Roadmap

### Phase 1: Auto-Select After Creation (Quick Win) - 0.5 day

- [ ] After creating building, auto-select it
- [ ] After creating barrier, auto-select it
- [ ] Show properties panel immediately

### Phase 2: Building Diagonal Drag Enhancement - 0.5 day

- [ ] Show dimensions while drawing (width, height, area)
- [ ] Dashed preview outline
- [ ] Snap to grid while drawing

### Phase 3: Submenu Infrastructure - 0.5 day

- [ ] Double-click detection on tool buttons
- [ ] Submenu component (show/hide/position)
- [ ] Mode selection persistence

### Phase 4: Center Outward Modes - 0.5 day

- [ ] Building: center outward
- [ ] Barrier: center outward
- [ ] Barrier: anchor + drag

### Phase 5: Polygon Buildings (Requires Audit) - 1 day

- [ ] Audit physics engine for non-rectangular support
- [ ] Click-to-place corners mode
- [ ] Close polygon on double-click/Enter
- [ ] Validate convex/simple polygon

---

## ⚠️ Physics Audit: Non-Rectangular Buildings

**Current Implementation Questions**:

1. **Shadow Calculation**: Does `calculateBuildingShadow()` assume rectangles?
2. **Reflection**: Does specular reflection work on arbitrary polygon edges?
3. **Diffraction**: Is building diffraction edge-based or corner-based?
4. **Occlusion**: Does line-of-sight check work with any polygon?

**Files to Audit**:
- `packages/core/src/acoustics/` - Shadow and reflection logic
- `apps/web/src/probeWorker.ts` - Building occlusion
- `packages/engine/src/` - Noise map calculation

---

## 🧪 Test Scenarios

1. **Quick rectangle**: Click-drag should feel instant
2. **Precise placement**: Should snap to grid
3. **Cancel drawing**: Escape key cancels in-progress drawing
4. **Polygon building**: Create L-shaped building, verify shadows
5. **Barrier from center**: Create barrier centered on known point
6. **Auto-select**: After creation, properties panel shows immediately

---

## 📊 Success Metrics

- **Time to create building**: Target <2 seconds for simple rectangle
- **Discoverability**: 50%+ users discover submenu within first session
- **Error rate**: <5% accidental mode changes

---

*Last updated: 2026-02-04*
