/**
 * Scene migration utilities
 * Handles version upgrades for scene data
 */

import { SCENE_SCHEMA_VERSION } from '@geonoise/shared';
import { Scene, SceneSchema } from '../schema/index.js';

// ============================================================================
// Migration Types
// ============================================================================

/** Migration function type */
type MigrationFn = (scene: unknown) => unknown;

/** Migration registry */
const migrations: Map<number, MigrationFn> = new Map();

// ============================================================================
// Migration Functions
// ============================================================================

/**
 * Register a migration from one version to the next
 */
export function registerMigration(fromVersion: number, fn: MigrationFn): void {
  migrations.set(fromVersion, fn);
}

/**
 * Get the version of a scene object
 */
export function getSceneVersion(scene: unknown): number {
  if (typeof scene !== 'object' || scene === null) {
    return 0;
  }
  const version = (scene as Record<string, unknown>).version;
  if (typeof version === 'number') {
    return version;
  }
  return 0;
}

/**
 * Migrate a scene to the latest version
 */
export function migrateScene(scene: unknown): Scene {
  let currentVersion = getSceneVersion(scene);
  let currentScene = scene;

  // Apply migrations in sequence
  while (currentVersion < SCENE_SCHEMA_VERSION) {
    const migration = migrations.get(currentVersion);
    if (migration) {
      currentScene = migration(currentScene);
      currentVersion++;
    } else {
      // No migration found, try to parse as-is
      break;
    }
  }

  // Validate and return
  return SceneSchema.parse(currentScene);
}

/**
 * Check if a scene needs migration
 */
export function needsMigration(scene: unknown): boolean {
  return getSceneVersion(scene) < SCENE_SCHEMA_VERSION;
}

// ============================================================================
// Version 0 to 1 Migration (initial/legacy format)
// ============================================================================

registerMigration(0, (scene: unknown) => {
  const obj = scene as Record<string, unknown>;
  
  return {
    version: 1,
    name: obj.name ?? 'Imported Scene',
    createdAt: obj.createdAt ?? new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    origin: obj.origin ?? {
      latLon: { lat: 0, lon: 0 },
      altitude: 0,
    },
    sources: obj.sources ?? [],
    receivers: obj.receivers ?? [],
    panels: obj.panels ?? [],
    obstacles: obj.obstacles ?? [],
    grid: obj.grid,
    engineConfig: obj.engineConfig,
    metadata: obj.metadata,
  };
});

// ============================================================================
// Scene Normalization
// ============================================================================

/**
 * Normalize a scene for hashing (deterministic JSON)
 */
export function normalizeScene(scene: Scene): string {
  const sortedKeys = (obj: Record<string, unknown>): Record<string, unknown> => {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      const value = obj[key];
      if (Array.isArray(value)) {
        sorted[key] = value.map((item) =>
          typeof item === 'object' && item !== null
            ? sortedKeys(item as Record<string, unknown>)
            : item
        );
      } else if (typeof value === 'object' && value !== null) {
        sorted[key] = sortedKeys(value as Record<string, unknown>);
      } else {
        sorted[key] = value;
      }
    }
    return sorted;
  };

  return JSON.stringify(sortedKeys(scene as unknown as Record<string, unknown>));
}
