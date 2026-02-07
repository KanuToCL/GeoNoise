/**
 * Probe Worker Types
 *
 * Type definitions for the probe worker's acoustic calculations.
 * Separated from the main worker file for better maintainability.
 */

// ============================================================================
// Geometry Types
// ============================================================================

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Segment2D {
  p1: Point2D;
  p2: Point2D;
}

export interface WallSegment extends Segment2D {
  height: number;
  type: 'barrier' | 'building';
  id: string;
}

// ============================================================================
// Acoustic Types
// ============================================================================

export interface Phasor {
  pressure: number; // Pa (linear)
  phase: number; // radians
}

export interface RayPath {
  type: 'direct' | 'ground' | 'wall' | 'diffracted';
  totalDistance: number;
  directDistance: number;
  pathDifference: number;
  reflectionPhaseChange: number;
  absorptionFactor: number;
  valid: boolean;
  /** Optional 2D reflection point for wall paths */
  reflectionPoint2D?: Point2D;
}

export type Spectrum9 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

// ============================================================================
// Configuration Types
// ============================================================================

export type BarrierSideDiffractionMode = 'off' | 'auto' | 'on';
export type AtmosphericAbsorptionModel = 'none' | 'simple' | 'iso9613';
export type GroundEffectModel = 'impedance' | 'iso9613';

export interface ProbeConfig {
  groundReflection: boolean;
  groundType: 'hard' | 'soft' | 'mixed';
  groundMixedFactor: number;
  /** Ground effect model: 'impedance' for full Delany-Bazley, 'iso9613' for simplified absorption */
  groundModel: GroundEffectModel;
  wallReflections: boolean;
  barrierDiffraction: boolean;
  barrierSideDiffraction: BarrierSideDiffractionMode;
  coherentSummation: boolean;
  atmosphericAbsorption: AtmosphericAbsorptionModel;
  temperature: number;
  humidity: number;
  pressure: number;
  speedOfSound: number;
}

// ============================================================================
// Building Types
// ============================================================================

/**
 * Building footprint data structure for occlusion and diffraction calculations.
 */
export interface BuildingFootprint {
  id: string;
  vertices: Point2D[];
  height: number;
  groundElevation: number;
}

/**
 * Result of building occlusion check with intersection details.
 */
export interface BuildingOcclusionResult {
  blocked: boolean;
  building: BuildingFootprint | null;
  entryPoint: Point2D | null;
  exitPoint: Point2D | null;
}

/**
 * Building diffraction path geometry.
 *
 * Represents a path that diffracts around or over a building:
 * - 'roof': Over-the-top path with TWO diffraction points (double-edge)
 * - 'corner-left'/'corner-right': Around-corner with ONE diffraction point (single-edge)
 */
export interface BuildingDiffractionPath {
  type: 'roof' | 'corner-left' | 'corner-right';
  waypoints: Point3D[];
  totalDistance: number;
  pathDifference: number;
  valid: boolean;
  diffractionPoints: number; // 1 for corner, 2 for roof
}

// ============================================================================
// Barrier Diffraction Types
// ============================================================================

/**
 * Result of barrier diffraction calculation with all path options.
 */
export interface BarrierDiffractionResult {
  /** Over-top diffraction path */
  topPath: RayPath | null;
  /** Around-left-edge diffraction path */
  leftPath: RayPath | null;
  /** Around-right-edge diffraction path */
  rightPath: RayPath | null;
}

/**
 * Barrier path with associated diffraction geometry for visualization.
 */
export interface BarrierPathWithGeometry {
  path: RayPath;
  diffractionPoint: Point2D;
  pathType: 'top' | 'left' | 'right';
}

// ============================================================================
// Ground Reflection Types
// ============================================================================

export interface Complex {
  re: number;
  im: number;
}

export type ImpedanceModel = 'delany-bazley' | 'miki' | 'auto';

export interface GroundReflectionCoeff {
  magnitude: number;
  phase: number;
}

// ============================================================================
// Traced Path Types (for visualization)
// ============================================================================

export interface TracedPath {
  type: 'direct' | 'ground' | 'wall' | 'diffraction';
  points: Point2D[];
  level_dB: number;
  phase_rad: number;
  sourceId: string;
  reflectionPoint?: Point2D;
  diffractionEdge?: Point2D;
}
