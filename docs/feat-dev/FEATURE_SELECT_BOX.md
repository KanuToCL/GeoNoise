# Feature: Select Box Multi-Selection Tool

> **Status:** ✅ Implemented (v0.4.5) - with known issue
> **Priority:** Medium
> **Effort:** 8-10 hours
> **Related:** [ARCHITECTURE.md](./ARCHITECTURE.md), [ROADMAP.md](./ROADMAP.md)

---

## Known Issues

⚠️ **Multi-Move Bug:** Clicking to drag a multi-selection currently resets to single selection instead of moving the group together. The `move-multi` drag state is implemented but the condition check to enter this branch appears to not be triggering correctly. Further debugging needed.

**Workaround:** Use duplicate (Ctrl+D or button) to create copies, which become selected for repositioning.

---

## Table of Contents

1. [Overview](#overview)
2. [Motivation](#motivation)
3. [Current State](#current-state)
4. [Proposed Design](#proposed-design)
5. [Type System Changes](#type-system-changes)
6. [Implementation Plan](#implementation-plan)
7. [Rendering](#rendering)
8. [Multi-Selection Actions](#multi-selection-actions)
9. [UX Enhancements](#ux-enhancements)
10. [Inspector Panel](#inspector-panel)
11. [Keyboard Shortcuts](#keyboard-shortcuts)
12. [Undo/Redo Integration](#undoredo-integration)
13. [Testing Strategy](#testing-strategy)
14. [File Locations](#file-locations)
15. [Open Questions](#open-questions)

---

## Overview

A **select box (rectangular marquee) tool** that allows users to draw a selection rectangle on the canvas to select multiple elements simultaneously. Selected elements can then be deleted, moved, duplicated, or managed as a batch.

### Key Features

- **Rectangular select box** - Ctrl/Cmd+click drag on empty canvas to draw selection rectangle
- **Multi-element selection** - Select sources, receivers, barriers, buildings, panels, probes
- **Batch operations** - Delete, duplicate multiple elements; move is supported via drag
- **Visual feedback** - Selection halos on all selected elements
- **Additive selection** - Shift+click to add/remove individual elements from selection
- **Keyboard shortcuts** - Ctrl+A (select all), Ctrl+D (duplicate), Escape (deselect)
- **Inspector panel** - Shows count of selected items with action buttons

---

## Motivation

### Current Pain Points

1. **Repetitive deletion** - Removing multiple elements requires clicking each one individually
2. **No group operations** - Cannot move or duplicate multiple elements at once
3. **Scene reorganization** - Adjusting layouts is tedious without multi-select
4. **Large scenes** - Managing 20+ elements becomes cumbersome

### Use Cases

| Scenario | Current Workflow | With Lasso |
|----------|------------------|------------|
| Delete 5 sources | Click → Delete × 5 | Lasso → Delete |
| Move speaker cluster | Drag each source | Lasso → Drag once |
| Duplicate receiver grid | Duplicate × N | Lasso → Duplicate |
| Disable test elements | Toggle each | Lasso → Disable All |

---

## Current State

### Selection System (`main.ts` ~line 350)

```typescript
type Selection =
  | { type: 'none' }
  | { type: 'source'; id: string }
  | { type: 'probe'; id: string }
  | { type: 'receiver'; id: string }
  | { type: 'panel'; id: string }
  | { type: 'barrier'; id: string }
  | { type: 'building'; id: string };
```

**Limitations:**
- Single element only
- Type-specific (cannot mix sources and receivers)
- No batch operations

### Tool System (`main.ts` ~line 339)

```typescript
type Tool = 'select' | 'add-source' | 'add-receiver' | 'add-probe'
          | 'add-panel' | 'add-barrier' | 'add-building' | 'measure' | 'delete';
```

### Existing Infrastructure

| Component | Status | Notes |
|-----------|--------|-------|
| `pointInPolygon()` | ✅ Ready | Line ~1295, can be reused |
| `worldToCanvas()` / `canvasToWorld()` | ✅ Ready | Coordinate transforms |
| Event handlers | ✅ Ready | Centralized in `handlePointer*()` |
| Hit testing | ✅ Ready | Per-element type, ~line 4895 |
| Undo/redo | ✅ Ready | `history[]` + `historyIndex` |

---

## Proposed Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Interaction                             │
├─────────────────────────────────────────────────────────────────────┤
│  1. User activates lasso tool (keyboard 'L' or toolbar button)      │
│  2. User clicks and drags to draw polygon                           │
│  3. On release, hit-test all elements against polygon               │
│  4. Set selection = { type: 'multi', items: [...] }                 │
│  5. Render selection halos on all selected elements                 │
│  6. Show multi-selection inspector panel                            │
│  7. User performs batch operation (delete/move/duplicate)           │
└─────────────────────────────────────────────────────────────────────┘
```

### State Machine

```
                    ┌──────────────────┐
                    │   Lasso Tool     │
                    │     Active       │
                    └────────┬─────────┘
                             │ pointerdown
                             ▼
                    ┌──────────────────┐
                    │  Drawing Lasso   │◄────┐
                    │   (dragState)    │     │ pointermove
                    └────────┬─────────┘─────┘
                             │ pointerup
                             ▼
                    ┌──────────────────┐
                    │   Hit Testing    │
                    │   All Elements   │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ 0 items  │  │ 1 item   │  │ N items  │
        │ selected │  │ selected │  │ selected │
        └────┬─────┘  └────┬─────┘  └────┬─────┘
             │             │             │
             ▼             ▼             ▼
        selection =   selection =   selection =
        { none }      { source/... } { multi }
```

---

## Type System Changes

### Extended Selection Type

```typescript
// Element type discriminator
type SelectableElementType = 'source' | 'receiver' | 'probe' | 'panel' | 'barrier' | 'building';

// Single selected item
interface SelectionItem {
  elementType: SelectableElementType;
  id: string;
}

// Updated Selection union
type Selection =
  | { type: 'none' }
  | { type: 'source'; id: string }
  | { type: 'receiver'; id: string }
  | { type: 'probe'; id: string }
  | { type: 'panel'; id: string }
  | { type: 'barrier'; id: string }
  | { type: 'building'; id: string }
  | { type: 'multi'; items: SelectionItem[] };  // ← NEW
```

### Extended Tool Type

```typescript
type Tool =
  | 'select'
  | 'lasso'      // ← NEW
  | 'add-source'
  | 'add-receiver'
  | 'add-probe'
  | 'add-panel'
  | 'add-barrier'
  | 'add-building'
  | 'measure'
  | 'delete';
```

### Lasso DragState

```typescript
interface LassoDragState {
  type: 'lasso';
  points: Point2D[];           // Canvas-space polygon vertices
  startCanvasPoint: Point2D;   // Initial click position
  boundingBox: {               // For fast culling during hit test
    min: Point2D;
    max: Point2D;
  };
}

// Add to DragState union (~line 359)
type DragState =
  | { type: 'pan'; ... }
  | { type: 'move-source'; ... }
  // ... existing states ...
  | LassoDragState;            // ← NEW
```

### Multi-Move DragState

```typescript
interface MultiMoveDragState {
  type: 'move-multi';
  items: SelectionItem[];
  startWorld: Point2D;
  offsets: Map<string, Point2D>;  // id → offset from drag start
}
```

---

## Implementation Plan

### Phase 1: Core Selection System (2-3 hours)

1. **Extend `Selection` type** with `{ type: 'multi'; items: SelectionItem[] }`
2. **Add helper functions:**
   ```typescript
   function isElementSelected(sel: Selection, type: string, id: string): boolean;
   function selectionToItems(sel: Selection): SelectionItem[];
   function itemsToSelection(items: SelectionItem[]): Selection;
   function getSelectedCount(sel: Selection): number;
   function getSelectedByType(sel: Selection, type: string): string[];
   ```
3. **Update all selection checks** throughout codebase to handle `'multi'`

### Phase 2: Lasso Tool & Drawing (2 hours)

1. **Add `'lasso'` to Tool enum**
2. **Add toolbar button** in HTML dock
3. **Add keyboard shortcut** `L` in `wireKeyboard()`
4. **Implement `handlePointerDown`** for lasso tool:
   ```typescript
   if (activeTool === 'lasso') {
     dragState = {
       type: 'lasso',
       points: [canvasPoint],
       startCanvasPoint: canvasPoint,
       boundingBox: { min: canvasPoint, max: canvasPoint }
     };
   }
   ```
5. **Implement `handlePointerMove`** for lasso drag:
   ```typescript
   if (dragState?.type === 'lasso') {
     dragState.points.push(canvasPoint);
     updateBoundingBox(dragState.boundingBox, canvasPoint);
     requestRedraw();
   }
   ```
6. **Implement `handlePointerUp`** for lasso completion:
   ```typescript
   if (dragState?.type === 'lasso') {
     const selected = getElementsInLasso(dragState.points);
     setSelection(selected.length > 0
       ? { type: 'multi', items: selected }
       : { type: 'none' });
     dragState = null;
   }
   ```

### Phase 3: Hit Testing (1.5 hours)

```typescript
function getElementsInLasso(canvasPoints: Point2D[]): SelectionItem[] {
  const worldPoly = canvasPoints.map(canvasToWorld);
  const selected: SelectionItem[] = [];

  // Test point elements (sources, receivers, probes)
  for (const source of scene.sources) {
    if (source.enabled && pointInPolygon(source.position, worldPoly)) {
      selected.push({ elementType: 'source', id: source.id });
    }
  }

  for (const receiver of scene.receivers) {
    if (receiver.enabled && pointInPolygon(receiver.position, worldPoly)) {
      selected.push({ elementType: 'receiver', id: receiver.id });
    }
  }

  for (const probe of scene.probes) {
    if (probe.enabled && pointInPolygon(probe.position, worldPoly)) {
      selected.push({ elementType: 'probe', id: probe.id });
    }
  }

  // Test polygon elements (panels, buildings) - use centroid or any vertex
  for (const panel of scene.panels) {
    if (panel.enabled) {
      const centroid = getPanelCentroid(panel);
      if (pointInPolygon(centroid, worldPoly)) {
        selected.push({ elementType: 'panel', id: panel.id });
      }
    }
  }

  for (const building of scene.buildings) {
    if (building.enabled) {
      const centroid = getPolygonCentroid(building.vertices);
      if (pointInPolygon(centroid, worldPoly) ||
          building.vertices.some(v => pointInPolygon(v, worldPoly))) {
        selected.push({ elementType: 'building', id: building.id });
      }
    }
  }

  // Test line elements (barriers) - use midpoint
  for (const barrier of scene.barriers) {
    if (barrier.enabled) {
      const midpoint = {
        x: (barrier.p1.x + barrier.p2.x) / 2,
        y: (barrier.p1.y + barrier.p2.y) / 2
      };
      if (pointInPolygon(midpoint, worldPoly)) {
        selected.push({ elementType: 'barrier', id: barrier.id });
      }
    }
  }

  return selected;
}
```

### Phase 4: Multi-Selection Rendering (1 hour)

Update draw functions to render halos for all selected elements:

```typescript
function isElementSelected(sel: Selection, elementType: string, id: string): boolean {
  if (sel.type === elementType && (sel as any).id === id) return true;
  if (sel.type === 'multi') {
    return sel.items.some(item => item.elementType === elementType && item.id === id);
  }
  return false;
}

// In drawSources():
for (const source of scene.sources) {
  const isSelected = isElementSelected(selection, 'source', source.id);
  if (isSelected) {
    // Draw selection halo
    ctx.fillStyle = canvasTheme.selectionHalo;
    ctx.beginPath();
    ctx.arc(canvasPos.x, canvasPos.y, 18, 0, Math.PI * 2);
    ctx.fill();

    // Draw accent ring
    ctx.strokeStyle = canvasTheme.sourceRing;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // ... rest of source rendering
}
```

### Phase 5: Batch Operations (2 hours)

#### Delete Multiple

```typescript
function deleteSelection(): void {
  if (selection.type === 'none') return;

  pushHistory();

  const items = selectionToItems(selection);

  for (const item of items) {
    switch (item.elementType) {
      case 'source':
        scene.sources = scene.sources.filter(s => s.id !== item.id);
        break;
      case 'receiver':
        scene.receivers = scene.receivers.filter(r => r.id !== item.id);
        break;
      case 'probe':
        scene.probes = scene.probes.filter(p => p.id !== item.id);
        break;
      case 'panel':
        scene.panels = scene.panels.filter(p => p.id !== item.id);
        break;
      case 'barrier':
        scene.barriers = scene.barriers.filter(b => b.id !== item.id);
        break;
      case 'building':
        scene.buildings = scene.buildings.filter(b => b.id !== item.id);
        break;
    }
  }

  setSelection({ type: 'none' });
  scheduleCompute();
  requestRedraw();
}
```

#### Move Multiple

```typescript
// On drag start (when clicking a selected element with multi-selection active):
function startMultiMove(worldPoint: Point2D): void {
  const items = selectionToItems(selection);
  const offsets = new Map<string, Point2D>();

  for (const item of items) {
    const element = findElement(item.elementType, item.id);
    if (element?.position) {
      offsets.set(item.id, {
        x: element.position.x - worldPoint.x,
        y: element.position.y - worldPoint.y
      });
    }
  }

  dragState = {
    type: 'move-multi',
    items,
    startWorld: worldPoint,
    offsets
  };
}

// During drag:
function applyMultiMove(worldPoint: Point2D): void {
  if (dragState?.type !== 'move-multi') return;

  for (const item of dragState.items) {
    const offset = dragState.offsets.get(item.id);
    if (!offset) continue;

    const element = findElement(item.elementType, item.id);
    if (element?.position) {
      element.position.x = worldPoint.x + offset.x;
      element.position.y = worldPoint.y + offset.y;
    }
  }

  requestRedraw();
}
```

#### Duplicate Multiple

```typescript
function duplicateSelection(offset: Point2D = { x: 2, y: 2 }): void {
  if (selection.type === 'none') return;

  pushHistory();

  const items = selectionToItems(selection);
  const newItems: SelectionItem[] = [];

  for (const item of items) {
    const original = findElement(item.elementType, item.id);
    if (!original) continue;

    const copy = structuredClone(original);
    copy.id = generateId();

    // Offset position
    if (copy.position) {
      copy.position.x += offset.x;
      copy.position.y += offset.y;
    } else if (copy.vertices) {
      copy.vertices = copy.vertices.map(v => ({
        x: v.x + offset.x,
        y: v.y + offset.y
      }));
    } else if (copy.p1 && copy.p2) {
      copy.p1 = { x: copy.p1.x + offset.x, y: copy.p1.y + offset.y };
      copy.p2 = { x: copy.p2.x + offset.x, y: copy.p2.y + offset.y };
    }

    addToScene(item.elementType, copy);
    newItems.push({ elementType: item.elementType, id: copy.id });
  }

  // Select the new copies
  setSelection({ type: 'multi', items: newItems });
  scheduleCompute();
  requestRedraw();
}
```

#### Enable/Disable Multiple

```typescript
function setSelectionEnabled(enabled: boolean): void {
  if (selection.type === 'none') return;

  pushHistory();

  const items = selectionToItems(selection);

  for (const item of items) {
    const element = findElement(item.elementType, item.id);
    if (element) {
      element.enabled = enabled;
    }
  }

  scheduleCompute();
  requestRedraw();
}
```

---

## Rendering

### Lasso Polygon

```typescript
function drawLasso(ctx: CanvasRenderingContext2D): void {
  if (dragState?.type !== 'lasso') return;

  const { points } = dragState;
  if (points.length < 2) return;

  ctx.save();

  // Semi-transparent fill
  ctx.fillStyle = 'rgba(100, 149, 237, 0.15)';  // cornflowerblue
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fill();

  // Dashed outline
  ctx.strokeStyle = '#6495ED';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.restore();
}
```

### Selection Halos

Existing halo rendering should be extended to iterate over multi-selection items. Use the same visual style as single selection to maintain consistency.

---

## UX Enhancements

### Shift+Click Additive Selection

```typescript
// In handlePointerDown for select tool:
if (event.shiftKey && selection.type !== 'none') {
  const hitElement = hitTestAll(worldPoint);
  if (hitElement) {
    const currentItems = selectionToItems(selection);
    const existingIndex = currentItems.findIndex(
      item => item.elementType === hitElement.elementType && item.id === hitElement.id
    );

    if (existingIndex >= 0) {
      // Remove from selection (toggle off)
      currentItems.splice(existingIndex, 1);
    } else {
      // Add to selection
      currentItems.push(hitElement);
    }

    setSelection(
      currentItems.length === 0
        ? { type: 'none' }
        : currentItems.length === 1
          ? { type: currentItems[0].elementType, id: currentItems[0].id }
          : { type: 'multi', items: currentItems }
    );
    return;
  }
}
```

### Ctrl/Cmd+A Select All

```typescript
function selectAll(): void {
  const items: SelectionItem[] = [];

  for (const source of scene.sources) {
    if (source.enabled) items.push({ elementType: 'source', id: source.id });
  }
  for (const receiver of scene.receivers) {
    if (receiver.enabled) items.push({ elementType: 'receiver', id: receiver.id });
  }
  for (const probe of scene.probes) {
    if (probe.enabled) items.push({ elementType: 'probe', id: probe.id });
  }
  for (const panel of scene.panels) {
    if (panel.enabled) items.push({ elementType: 'panel', id: panel.id });
  }
  for (const barrier of scene.barriers) {
    if (barrier.enabled) items.push({ elementType: 'barrier', id: barrier.id });
  }
  for (const building of scene.buildings) {
    if (building.enabled) items.push({ elementType: 'building', id: building.id });
  }

  setSelection(items.length > 0 ? { type: 'multi', items } : { type: 'none' });
}
```

### Escape to Deselect

```typescript
// In wireKeyboard():
case 'Escape':
  if (dragState) {
    dragState = null;  // Cancel current operation
  } else if (selection.type !== 'none') {
    setSelection({ type: 'none' });
  }
  requestRedraw();
  break;
```

---

## Inspector Panel

### Multi-Selection Panel Design

```
┌─────────────────────────────────────────────────┐
│  🔲  5 Elements Selected                        │
├─────────────────────────────────────────────────┤
│                                                 │
│  ● 2 Sources                                    │
│  ● 1 Receiver                                   │
│  ● 2 Barriers                                   │
│                                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ Delete  │  │  Move   │  │Duplicate│         │
│  └─────────┘  └─────────┘  └─────────┘         │
│                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ Enable  │  │ Disable │  │ Deselect│         │
│  └─────────┘  └─────────┘  └─────────┘         │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Implementation

```typescript
function renderMultiSelectionPanel(): void {
  if (selection.type !== 'multi') return;

  const counts = new Map<string, number>();
  for (const item of selection.items) {
    counts.set(item.elementType, (counts.get(item.elementType) ?? 0) + 1);
  }

  // Update panel content
  const countList = Array.from(counts.entries())
    .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
    .join(', ');

  // ... render panel with buttons
}
```

---

## Keyboard Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| `L` | Activate lasso tool | Global |
| `Escape` | Cancel lasso / Deselect all | During lasso / With selection |
| `Delete` / `Backspace` | Delete selection | With selection |
| `Ctrl/Cmd+D` | Duplicate selection | With selection |
| `Ctrl/Cmd+A` | Select all elements | Global |
| `Shift+Click` | Add/remove from selection | Select tool active |

---

## Undo/Redo Integration

All batch operations should call `pushHistory()` before making changes:

```typescript
function pushHistory(): void {
  // Truncate redo history
  history.length = historyIndex + 1;

  // Save current state
  history.push({
    scene: structuredClone(scene),
    selection: structuredClone(selection)
  });

  historyIndex++;

  // Limit history size
  if (history.length > MAX_HISTORY) {
    history.shift();
    historyIndex--;
  }
}
```

**Note:** Selection state should also be saved in history so undo restores both scene AND selection.

---

## Testing Strategy

### Unit Tests

| Test Case | Description |
|-----------|-------------|
| `lasso-empty` | Lasso with no elements inside returns empty selection |
| `lasso-single` | Lasso containing one element selects it |
| `lasso-multi-type` | Lasso containing mixed types (source + receiver) selects all |
| `lasso-partial-polygon` | Element partially inside lasso (centroid-based) |
| `lasso-disabled` | Disabled elements are not selected |
| `shift-add` | Shift+click adds to existing selection |
| `shift-remove` | Shift+click on selected element removes it |
| `delete-multi` | Delete removes all selected elements |
| `duplicate-multi` | Duplicate creates copies with offset |
| `move-multi` | Move updates all element positions |
| `undo-multi-delete` | Undo restores deleted elements |
| `select-all` | Ctrl+A selects all enabled elements |

### Integration Tests

| Scenario | Steps |
|----------|-------|
| Full workflow | Lasso → Delete → Undo → Verify restored |
| Mixed selection | Lasso sources → Shift+click receiver → Verify count |
| Drag multi | Select 3 → Drag → Verify relative positions preserved |

### Visual Tests

- Lasso polygon renders correctly during drag
- All selected elements show halos
- Inspector panel updates with correct counts

---

## File Locations

| Component | File | Lines (approx) |
|-----------|------|----------------|
| `Selection` type | `/apps/web/src/main.ts` | ~350 |
| `Tool` type | `/apps/web/src/main.ts` | ~339 |
| `DragState` type | `/apps/web/src/main.ts` | ~359 |
| `handlePointerDown` | `/apps/web/src/main.ts` | ~5762 |
| `handlePointerMove` | `/apps/web/src/main.ts` | ~5702 |
| `handlePointerUp` | `/apps/web/src/main.ts` | ~6055 |
| `wireKeyboard` | `/apps/web/src/main.ts` | ~6127 |
| `pointInPolygon` | `/apps/web/src/main.ts` | ~1295 |
| Draw functions | `/apps/web/src/main.ts` | ~5307-5404 |
| Dock HTML | `/apps/web/index.html` | Toolbar section |
| Styles | `/apps/web/src/style.css` | Buttons section |

---

## Open Questions

1. **Polygon vs Rectangle lasso?**
   - Freeform polygon is more flexible
   - Rectangle (marquee) would be simpler to implement
   - Could support both: drag = rectangle, hold Alt = freeform?

2. **Selection across element types?**
   - Should sources and receivers be selectable together?
   - Current proposal: Yes, mixed selection supported

3. **Disabled elements?**
   - Should lasso select disabled elements?
   - Current proposal: No, only enabled elements

4. **Click-through on selected elements?**
   - Clicking inside lasso-selected group: start move or re-lasso?
   - Current proposal: Click on selected element starts move

5. **Probe selection in multi?**
   - Only one probe can be "active" for computation
   - Multi-selection could still include probes for delete/move

6. **Panel vertex editing in multi?**
   - Individual vertex dragging conflicts with group move
   - Current proposal: Multi-select moves centroid only

---

## Summary

The lasso multi-selection tool adds significant usability improvements for managing complex scenes. The implementation leverages existing infrastructure (`pointInPolygon`, event handlers, undo system) while extending the type system to support multi-element selection.

**Key deliverables:**
- Extended `Selection` type with `'multi'` variant
- Lasso tool with freeform polygon drawing
- Batch operations: delete, move, duplicate, enable/disable
- Multi-selection inspector panel
- Keyboard shortcuts for efficient workflow

---

*See also: [ARCHITECTURE.md](./ARCHITECTURE.md) for system overview, [ROADMAP.md](./ROADMAP.md) for project timeline.*
