/**
 * Scene Schema v1 - GeoNoise2
 * Runtime validation with Zod + TypeScript types
 */

import { z } from 'zod';
import { SCENE_SCHEMA_VERSION } from '@geonoise/shared';

// ============================================================================
// Base Schemas
// ============================================================================

/** Lat/Lon coordinate schema */
export const LatLonSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

/** Local meters (ENU) coordinate schema */
export const LocalMetersSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().default(0),
});

/** 2D Point schema */
export const Point2DSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/** RGB Color schema */
export const ColorSchema = z.object({
  r: z.number().min(0).max(255),
  g: z.number().min(0).max(255),
  b: z.number().min(0).max(255),
  a: z.number().min(0).max(1).default(1),
});

// ============================================================================
// Source Schemas
// ============================================================================

/**
 * 9-band sound power spectrum schema
 * Array of 9 dB values for octave bands: [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] Hz
 * This is the PRIMARY data source for sound power - the overall level is computed from this.
 */
export const Spectrum9Schema = z.tuple([
  z.number(), // 63 Hz
  z.number(), // 125 Hz
  z.number(), // 250 Hz
  z.number(), // 500 Hz
  z.number(), // 1000 Hz
  z.number(), // 2000 Hz
  z.number(), // 4000 Hz
  z.number(), // 8000 Hz
  z.number(), // 16000 Hz
]);

/** Legacy spectrum schema (for migration) - keyed by frequency string */
export const LegacySpectrumSchema = z.object({
  '63': z.number().optional(),
  '125': z.number().optional(),
  '250': z.number().optional(),
  '500': z.number().optional(),
  '1000': z.number().optional(),
  '2000': z.number().optional(),
  '4000': z.number().optional(),
  '8000': z.number().optional(),
  '16000': z.number().optional(),
  overall: z.number().optional(),
});

/** Directivity pattern stub */
export const DirectivitySchema = z.object({
  type: z.enum(['omnidirectional', 'cardioid', 'custom']).default('omnidirectional'),
  orientation: z.number().default(0), // degrees from north
  data: z.record(z.number()).optional(), // custom directivity data
});

/**
 * Point source schema
 *
 * SPECTRAL ENGINE: The `spectrum` array is the primary data source.
 * The `soundPowerLevel` is computed from the spectrum and is kept for backward compatibility.
 * The `gain` field acts as a master volume fader applied on top of the spectrum.
 */
export const PointSourceSchema = z.object({
  id: z.string(),
  type: z.literal('point'),
  name: z.string().default('Source'),
  position: LocalMetersSchema,

  // PRIMARY: 9-band spectrum [63Hz - 16kHz] in dB Lw
  spectrum: Spectrum9Schema,

  // COMPUTED: Overall sound power level (derived from spectrum, kept for compatibility)
  soundPowerLevel: z.number().optional(),

  // OPTIONAL: Gain offset in dB (master volume fader, applied on top of spectrum)
  gain: z.number().default(0),

  directivity: DirectivitySchema.optional(),
  enabled: z.boolean().default(true),
  color: ColorSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

/** Source union - extensible for future source types */
export const SourceSchema = z.discriminatedUnion('type', [PointSourceSchema]);

// ============================================================================
// Receiver Schemas
// ============================================================================

/** Point receiver schema */
export const PointReceiverSchema = z.object({
  id: z.string(),
  type: z.literal('point'),
  name: z.string().default('Receiver'),
  position: LocalMetersSchema,
  enabled: z.boolean().default(true),
  color: ColorSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

/** Receiver union */
export const ReceiverSchema = z.discriminatedUnion('type', [PointReceiverSchema]);

// ============================================================================
// Panel Schemas (Listening Panels/Areas)
// ============================================================================

/** Panel sampling strategy */
export const PanelSamplingSchema = z.object({
  type: z.enum(['grid', 'random', 'adaptive']).default('grid'),
  resolution: z.number().positive().default(5), // meters
  pointCount: z.number().int().positive().optional(),
});

/** Rectangular panel schema */
export const RectangularPanelSchema = z.object({
  id: z.string(),
  type: z.literal('rectangular'),
  name: z.string().default('Panel'),
  center: LocalMetersSchema,
  width: z.number().positive(), // meters (along x)
  height: z.number().positive(), // meters (along y)
  rotation: z.number().default(0), // degrees
  elevation: z.number().default(1.5), // height above ground
  sampling: PanelSamplingSchema.optional(),
  enabled: z.boolean().default(true),
  color: ColorSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

/** Polygon panel schema */
export const PolygonPanelSchema = z.object({
  id: z.string(),
  type: z.literal('polygon'),
  name: z.string().default('Panel'),
  vertices: z.array(Point2DSchema).min(3),
  elevation: z.number().default(1.5),
  sampling: PanelSamplingSchema.optional(),
  enabled: z.boolean().default(true),
  color: ColorSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

/** Panel union */
export const PanelSchema = z.discriminatedUnion('type', [
  RectangularPanelSchema,
  PolygonPanelSchema,
]);

// ============================================================================
// Obstacle Schemas (Buildings/Barriers) - Stub for v1
// ============================================================================

/** Building/obstacle schema */
export const BuildingSchema = z.object({
  id: z.string(),
  type: z.literal('building'),
  name: z.string().default('Building'),
  footprint: z.array(Point2DSchema).min(3),
  height: z.number().positive().default(10),
  groundElevation: z.number().default(0),
  attenuationDb: z.number().default(25), // Barrier attenuation
  enabled: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

/** Barrier schema */
export const BarrierSchema = z.object({
  id: z.string(),
  type: z.literal('barrier'),
  name: z.string().default('Barrier'),
  vertices: z.array(Point2DSchema).min(2),
  height: z.number().positive().default(3),
  groundElevation: z.number().default(0),
  attenuationDb: z.number().default(20),
  enabled: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

/** Obstacle union */
export const ObstacleSchema = z.discriminatedUnion('type', [BuildingSchema, BarrierSchema]);

// ============================================================================
// Grid Configuration
// ============================================================================

/** Frequency weighting type for grid display */
export const FrequencyWeightingSchema = z.enum(['A', 'C', 'Z']);

/** Noise map grid configuration */
export const GridConfigSchema = z.object({
  enabled: z.boolean().default(false),
  bounds: z
    .object({
      minX: z.number(),
      minY: z.number(),
      maxX: z.number(),
      maxY: z.number(),
    })
    .optional(),
  resolution: z.number().positive().default(10), // meters
  elevation: z.number().default(1.5), // height above ground
  maxPoints: z.number().int().positive().optional(),

  // Per-band noise map display options (on-demand recomputation)
  // If targetBand is set, compute and return single-band levels (unweighted)
  // If targetBand is undefined, compute overall weighted level using `weighting`
  targetBand: z.number().int().min(0).max(8).optional(), // Band index 0-8 (63Hz-16kHz)
  weighting: FrequencyWeightingSchema.default('A'), // Used when targetBand is undefined
});

// ============================================================================
// Meteorological Conditions - Stub for v1
// ============================================================================

/** Meteo conditions schema */
export const MeteoSchema = z.object({
  temperature: z.number().default(20), // Celsius
  relativeHumidity: z.number().min(0).max(100).default(50),
  pressure: z.number().positive().default(101.325), // kPa
  windSpeed: z.number().min(0).default(0), // m/s (stub)
  windDirection: z.number().min(0).max(360).default(0), // degrees from north (stub)
});

// ============================================================================
// Engine Configuration
// ============================================================================

/**
 * Barrier side diffraction mode.
 * Controls whether horizontal diffraction around barrier ends is computed.
 *
 * - 'off': Over-top diffraction only (ISO 9613 assumption of infinite barriers)
 * - 'auto': Enable for barriers shorter than 50m (recommended default)
 * - 'on': Enable for all barriers
 */
export const BarrierSideDiffractionSchema = z.enum(['off', 'auto', 'on']);

/**
 * Mixed ground sigma interpolation model.
 * Controls how flow resistivity is interpolated for mixed ground types.
 *
 * - 'iso9613': ISO 9613-2 compliant linear G-factor interpolation
 *              Uses area-weighted average: σ = σ_soft when G=1, σ → ∞ when G=0
 * - 'logarithmic': Physically accurate logarithmic interpolation
 *                  log(σ) = G·log(σ_soft) + (1-G)·log(σ_hard)
 *                  More realistic for impedance calculations
 */
export const GroundMixedSigmaModelSchema = z.enum(['iso9613', 'logarithmic']);

/** Propagation model configuration */
export const PropagationConfigSchema = z.object({
  spreading: z.enum(['spherical', 'cylindrical']).default('spherical'),
  atmosphericAbsorption: z.enum(['none', 'simple', 'iso9613']).default('simple'),
  groundReflection: z.boolean().default(false),
  groundModel: z.enum(['legacy', 'twoRayPhasor']).default('legacy'),
  groundType: z.enum(['hard', 'mixed', 'soft']).default('mixed'),
  groundSigmaSoft: z.number().positive().default(20000),
  groundMixedFactor: z.number().min(0).max(1).default(0.5),

  /**
   * Mixed ground sigma interpolation model.
   * - 'iso9613': ISO 9613-2 compliant linear interpolation (default)
   * - 'logarithmic': Physically accurate log-space interpolation (ray tracing mode)
   */
  groundMixedSigmaModel: GroundMixedSigmaModelSchema.default('iso9613'),

  maxReflections: z.number().int().min(0).max(3).default(0),
  maxDistance: z.number().positive().default(2000), // meters
  includeBarriers: z.boolean().default(true),

  /**
   * Enable horizontal diffraction around barrier ends.
   * - 'off': Over-top only (ISO 9613-2 infinite barrier assumption)
   * - 'auto': Enable for barriers < 50m (default, most realistic)
   * - 'on': Enable for all barriers
   */
  barrierSideDiffraction: BarrierSideDiffractionSchema.default('auto'),
});

/** Engine configuration schema */
export const EngineConfigSchema = z.object({
  mode: z.enum(['festival_fast', 'standards_strict']).default('festival_fast'),
  outputMetric: z.enum(['LAeq', 'LCeq', 'Leq_bands']).default('LAeq'),
  propagation: PropagationConfigSchema.optional(),
  meteo: MeteoSchema.optional(),
});

// ============================================================================
// Coordinate System Configuration
// ============================================================================

/** Scene origin definition */
export const OriginSchema = z.object({
  latLon: LatLonSchema,
  altitude: z.number().default(0),
});

// ============================================================================
// Complete Scene Schema
// ============================================================================

/** Complete scene schema v1 */
export const SceneSchemaV1 = z.object({
  version: z.literal(SCENE_SCHEMA_VERSION),
  name: z.string().default('Untitled Scene'),
  description: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  modifiedAt: z.string().datetime().optional(),

  // Coordinate system
  origin: OriginSchema,

  // Scene elements
  sources: z.array(SourceSchema).default([]),
  receivers: z.array(ReceiverSchema).default([]),
  panels: z.array(PanelSchema).default([]),
  obstacles: z.array(ObstacleSchema).default([]),

  // Configuration
  grid: GridConfigSchema.optional(),
  engineConfig: EngineConfigSchema.optional(),

  // Metadata
  metadata: z.record(z.unknown()).optional(),
});

/** Type alias for latest scene schema */
export const SceneSchema = SceneSchemaV1;

// ============================================================================
// TypeScript Type Exports
// ============================================================================

export type LatLon = z.infer<typeof LatLonSchema>;
export type LocalMeters = z.infer<typeof LocalMetersSchema>;
export type Point2D = z.infer<typeof Point2DSchema>;
export type Color = z.infer<typeof ColorSchema>;
export type Spectrum9 = z.infer<typeof Spectrum9Schema>;
export type LegacySpectrum = z.infer<typeof LegacySpectrumSchema>;
export type Directivity = z.infer<typeof DirectivitySchema>;
export type PointSource = z.infer<typeof PointSourceSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type PointReceiver = z.infer<typeof PointReceiverSchema>;
export type Receiver = z.infer<typeof ReceiverSchema>;
export type PanelSampling = z.infer<typeof PanelSamplingSchema>;
export type RectangularPanel = z.infer<typeof RectangularPanelSchema>;
export type PolygonPanel = z.infer<typeof PolygonPanelSchema>;
export type Panel = z.infer<typeof PanelSchema>;
export type Building = z.infer<typeof BuildingSchema>;
export type Barrier = z.infer<typeof BarrierSchema>;
export type Obstacle = z.infer<typeof ObstacleSchema>;
export type GridConfig = z.infer<typeof GridConfigSchema>;
export type Meteo = z.infer<typeof MeteoSchema>;
export type PropagationConfig = z.infer<typeof PropagationConfigSchema>;
export type BarrierSideDiffraction = z.infer<typeof BarrierSideDiffractionSchema>;
export type EngineConfig = z.infer<typeof EngineConfigSchema>;
export type Origin = z.infer<typeof OriginSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type SceneV1 = z.infer<typeof SceneSchemaV1>;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a scene object against the schema
 */
export function validateScene(data: unknown): { success: true; data: Scene } | { success: false; errors: z.ZodError } {
  const result = SceneSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Parse and validate a scene, throwing on error
 */
export function parseScene(data: unknown): Scene {
  return SceneSchema.parse(data);
}

/**
 * Create an empty scene with defaults
 */
export function createEmptyScene(origin: Origin, name = 'Untitled Scene'): Scene {
  return {
    version: SCENE_SCHEMA_VERSION,
    name,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    origin,
    sources: [],
    receivers: [],
    panels: [],
    obstacles: [],
  };
}
