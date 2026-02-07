# Building Import Feature

## Overview

Automatically import building footprints and heights from Mapbox map data into GeoNoise for accurate acoustic modeling of building reflections, occlusion, and diffraction.

---

## 🎯 Goals

1. **One-click import** of visible buildings from Mapbox Streets
2. **Height data** extraction where available (OSM data)
3. **Manual height editing** for buildings without height data
4. **Seamless integration** with existing `BuildingFootprint` interface

---

## 📊 Data Sources

### Primary: Mapbox Streets v12 (Built-in)

```
Source: mapbox.mapbox-streets-v8 (composite source)
Layer: building
Available Properties:
├── height (number) - Building height in meters
├── min_height (number) - Base height (for buildings on podiums)
├── extrude (boolean) - Whether building should be extruded
├── type (string) - Building type classification
└── underground (boolean) - Is it underground
```

**Coverage Quality**:
| Region | Footprints | Heights |
|--------|------------|---------|
| Major cities (NYC, SF, London) | ✅ Excellent | ✅ Most have heights |
| Urban areas | ✅ Good | ⚠️ Partial |
| Suburban | ⚠️ Partial | ❌ Rare |
| Rural | ❌ Limited | ❌ None |

### Future: Alternative Sources

| Source | Use Case | Integration Effort |
|--------|----------|-------------------|
| Microsoft Building Footprints | Fill gaps in OSM coverage | Medium |
| Overture Maps | Open alternative to OSM | Medium |
| Google Open Buildings | Developing regions | Medium |
| LiDAR/Photogrammetry | Precise heights | Complex |
| CNN Detection | Satellite image analysis | Complex |

---

## 🏗️ Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Interface                             │
├─────────────────────────────────────────────────────────────────┤
│  [Import Buildings] button in Map Control Panel                 │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  Options Dialog                                      │       │
│  │  • Import visible area / Draw region                 │       │
│  │  • Default height for missing data: [10] m           │       │
│  │  • Min building area filter: [25] m²                 │       │
│  │  • Building types: ☑ All ☐ Residential ☐ Commercial │       │
│  └─────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Mapbox Query Layer                            │
├─────────────────────────────────────────────────────────────────┤
│  map.queryRenderedFeatures(bbox, {                              │
│    layers: ['building'],                                        │
│    filter: ['>', ['get', 'area'], minArea]                      │
│  })                                                             │
│           │                                                     │
│           ▼                                                     │
│  Returns: Feature[] with geometry + properties                  │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Coordinate Transform                           │
├─────────────────────────────────────────────────────────────────┤
│  For each building:                                             │
│  • Convert lng/lat polygon → GeoNoise world meters              │
│  • Use map center as origin                                     │
│  • Extract height or apply default                              │
│  • Generate unique ID                                           │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│               GeoNoise Building Integration                     │
├─────────────────────────────────────────────────────────────────┤
│  interface BuildingFootprint {                                  │
│    id: string;                                                  │
│    polygon: Point[];     // Converted to meters                 │
│    height: number;       // From Mapbox or default              │
│    properties?: {                                               │
│      source: 'mapbox' | 'manual';                               │
│      osmId?: string;                                            │
│      hasVerifiedHeight: boolean;                                │
│    }                                                            │
│  }                                                              │
│           │                                                     │
│           ▼                                                     │
│  scene.buildings.push(...importedBuildings)                     │
│  computeScene()  // Recalculate acoustics                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Implementation Files

### New Files

```
apps/web/src/
├── buildingImport/
│   ├── index.ts              # Main export, public API
│   ├── mapboxQuery.ts        # Query buildings from Mapbox
│   ├── coordinateTransform.ts # Lng/lat to meters conversion
│   ├── buildingFilter.ts     # Size, type, overlap filtering
│   └── ui.ts                 # Import dialog UI
```

### Modified Files

```
apps/web/src/
├── mapbox.ts          # Add queryRenderedFeatures to interface
├── mapboxUI.ts        # Add "Import Buildings" button
├── main.ts            # Wire up import functionality
└── index.html         # Add import dialog HTML

apps/web/src/style.css  # Dialog styling
```

---

## 🔧 TypeScript Interfaces

### Mapbox Extension

```typescript
// mapbox.ts - Extend MapboxMap interface

export interface MapboxMap {
  // ... existing methods

  queryRenderedFeatures(
    geometry?: PointLike | [PointLike, PointLike],
    options?: {
      layers?: string[];
      filter?: any[];
      validate?: boolean;
    }
  ): MapboxGeoJSONFeature[];

  querySourceFeatures(
    sourceId: string,
    parameters?: {
      sourceLayer?: string;
      filter?: any[];
      validate?: boolean;
    }
  ): MapboxGeoJSONFeature[];
}

export interface MapboxGeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  properties: {
    height?: number;
    min_height?: number;
    extrude?: boolean;
    type?: string;
    underground?: boolean;
  };
  id?: string | number;
  layer: { id: string };
  source: string;
  sourceLayer: string;
}
```

### Building Import Types

```typescript
// buildingImport/index.ts

export interface ImportOptions {
  /** Bounding box in screen pixels, or undefined for visible area */
  bounds?: { topLeft: Point; bottomRight: Point };

  /** Default height for buildings without height data (meters) */
  defaultHeight: number;

  /** Minimum building footprint area (m²) */
  minArea: number;

  /** Maximum number of buildings to import */
  maxBuildings: number;

  /** Whether to merge with existing buildings or replace */
  mergeMode: 'add' | 'replace' | 'smart-merge';
}

export interface ImportResult {
  success: boolean;
  buildingsImported: number;
  buildingsWithHeight: number;
  buildingsWithDefaultHeight: number;
  skippedDuplicates: number;
  errors: string[];
}

export interface ImportedBuilding extends BuildingFootprint {
  properties: {
    source: 'mapbox';
    osmId?: string;
    originalHeight?: number;
    heightSource: 'osm' | 'default' | 'manual';
    importedAt: Date;
  };
}
```

---

## 🎨 UI Design

### Import Button Location

```
┌─────────────────────────────────────────┐
│ 🗺️ Map Overlay                    [ON] │
├─────────────────────────────────────────┤
│ [Load Map]                              │
│ [🔒 Lock Map (Edit Mode)]               │
│                                         │
│ Style: [Streets] [Satellite] [Dark]     │
│                                         │
│ Opacity: ━━━━━━━━━●━━ 70%               │
│                                         │
│ ─────────────────────────────────────── │
│ 🏢 Buildings                            │
│ [Import from Map]  ← NEW BUTTON         │
│ Imported: 47 buildings                  │
│ └─ 32 with heights, 15 default (10m)    │
└─────────────────────────────────────────┘
```

### Import Options Dialog

```
┌─────────────────────────────────────────────────┐
│ 🏢 Import Buildings from Map             [✕]   │
├─────────────────────────────────────────────────┤
│                                                 │
│ Region:  ○ Visible area                         │
│          ● Draw selection box                   │
│                                                 │
│ Default height for buildings without data:      │
│ [  10  ] meters                                 │
│                                                 │
│ Minimum building size:                          │
│ [  25  ] m²   (skip small sheds)               │
│                                                 │
│ Maximum buildings:                              │
│ [  200 ] buildings                              │
│                                                 │
│ If buildings already exist:                     │
│ ○ Add new (keep existing)                       │
│ ● Replace all                                   │
│ ○ Smart merge (skip duplicates)                 │
│                                                 │
│ ─────────────────────────────────────────────── │
│ Preview: ~127 buildings found                   │
│          • 89 with height data                  │
│          • 38 will use default (10m)            │
│                                                 │
│        [Cancel]    [Import Buildings]           │
└─────────────────────────────────────────────────┘
```

---

## 🔄 Coordinate Transformation

### Lng/Lat to GeoNoise Meters

```typescript
// buildingImport/coordinateTransform.ts

import { lngLatToWorldMeters } from '../mapbox.js';

/**
 * Convert a Mapbox building polygon to GeoNoise world coordinates
 * Uses the current map center as the origin (0, 0)
 */
export function convertBuildingToMeters(
  map: MapboxMap,
  coordinates: number[][]  // [[lng, lat], [lng, lat], ...]
): Point[] {
  return coordinates.map(([lng, lat]) => {
    return lngLatToWorldMeters(map, lng, lat);
  });
}

/**
 * Calculate polygon area in square meters
 * Uses Shoelace formula
 */
export function calculatePolygonArea(points: Point[]): number {
  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }

  return Math.abs(area / 2);
}
```

---

## 📋 Implementation Roadmap

### Phase 1: Basic Import (MVP) - 1 day

- [ ] Add `queryRenderedFeatures` to MapboxMap interface
- [ ] Create `buildingImport/mapboxQuery.ts`
- [ ] Basic coordinate transformation
- [ ] Simple "Import All Visible" button
- [ ] Convert to BuildingFootprint format
- [ ] Add to scene and recompute

### Phase 2: UI Polish - 0.5 day

- [ ] Import options dialog
- [ ] Preview count before import
- [ ] Progress indicator for large imports
- [ ] Success/failure toast notification

### Phase 3: Smart Features - 0.5 day

- [ ] Draw region selection
- [ ] Duplicate detection
- [ ] Height editing after import
- [ ] Undo support

### Phase 4: Future Enhancements

- [ ] Import from GeoJSON file
- [ ] Microsoft Building Footprints API
- [ ] Save/load imported buildings
- [ ] Building type classification
- [ ] Automatic height estimation from shadows (ML)

---

## ⚠️ Edge Cases & Challenges

### 1. Missing Height Data

**Problem**: Many buildings don't have height in OSM
**Solution**:
- Apply configurable default height (10m recommended)
- Visual indicator for buildings with estimated heights
- Easy manual height editing

### 2. Complex Geometries

**Problem**: MultiPolygons, buildings with holes (courtyards)
**Solution**:
- For MVP: Use outer ring only
- Future: Support holes in polygon representation

### 3. Coordinate Precision

**Problem**: Lng/lat to meters conversion accumulates error
**Solution**:
- Use map center as origin (error minimal near center)
- Re-center if user pans significantly

### 4. Large Import Performance

**Problem**: Importing 500+ buildings could be slow
**Solution**:
- Batch processing with progress
- Limit default to 200 buildings
- Spatial indexing for duplicate detection

### 5. Building Already Exists

**Problem**: User imports, edits, then imports again
**Solution**:
- Track OSM ID for deduplication
- Offer merge modes: add/replace/smart-merge

---

## 🧪 Testing Scenarios

1. **Urban area (NYC)**: Expect 50+ buildings with heights
2. **Suburban area**: Expect footprints, some without heights
3. **Empty area**: Handle gracefully with "No buildings found"
4. **Pan and import again**: Verify no duplicates in smart-merge mode
5. **Very large buildings**: Test stadium/warehouse footprints
6. **Tiny structures**: Verify filter excludes small sheds

---

## 📊 Success Metrics

- **Import success rate**: >95% of attempts complete
- **Height data availability**: Track % of buildings with OSM heights
- **User edits**: How many buildings need manual height adjustment
- **Performance**: <3s for 200 buildings

---

## 🔗 Related Features

- **Map Integration** (prerequisite) - [COMPLETE]
- **Building Tool** (existing) - Manual building drawing
- **Monetization** - Building import as Pro feature?

---

## 📝 Notes

- Mapbox Streets v12 is already loaded in current implementation
- Building layer ID may be `building` or `building-extrusion` depending on style
- Consider caching imported buildings to localStorage
- OSM building data is community-contributed - quality varies

---

*Last updated: 2026-02-03*
