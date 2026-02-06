/**
 * Scene Building Module
 *
 * Functions for building engine scenes from UI scene data.
 * Extracted from main.ts for modular architecture.
 */

import { createEmptyScene } from '@geonoise/core';
import { calculateOverallLevel } from '@geonoise/shared';
import type { Source, Panel } from '../../entities/index.js';
import type { UIScene, Bounds, BuildEngineSceneConfig } from './types.js';
import { panelId } from '@geonoise/shared';

/**
 * Build an engine scene from UI scene data
 *
 * Converts UI entities (sources, receivers, panels, barriers, buildings)
 * into engine-compatible format for computation.
 *
 * @param config - Configuration with origin, scene data, and source filter
 * @returns Engine scene ready for computation
 */
export function buildEngineScene(config: BuildEngineSceneConfig) {
  const { origin, scene, isSourceEnabled } = config;
  const engineScene = createEmptyScene(origin, 'UI Scene');

  engineScene.sources = scene.sources.map((source) => ({
    id: source.id,
    type: 'point' as const,
    name: source.name.trim() || `Source ${source.id.toUpperCase()}`,
    position: { x: source.x, y: source.y, z: source.z },
    spectrum: source.spectrum,
    gain: source.gain,
    soundPowerLevel: calculateOverallLevel(source.spectrum, 'Z'),
    enabled: isSourceEnabled(source),
  }));

  engineScene.receivers = scene.receivers.map((receiver) => ({
    id: receiver.id,
    type: 'point',
    name: `Receiver ${receiver.id.toUpperCase()}`,
    position: { x: receiver.x, y: receiver.y, z: receiver.z },
    enabled: true,
  }));

  engineScene.panels = scene.panels.map((panel) => ({
    id: panel.id,
    type: 'polygon',
    name: `Panel ${panel.id.toUpperCase()}`,
    vertices: panel.points.map((pt) => ({ x: pt.x, y: pt.y })),
    elevation: panel.elevation,
    sampling: { type: 'grid', resolution: panel.sampling.resolution, pointCount: panel.sampling.pointCap },
    enabled: true,
  }));

  // Map UI barriers + buildings to engine obstacles for propagation.
  //
  // The engine stores:
  // - barriers as ObstacleSchema(type='barrier') with a list of vertices (polyline).
  // - buildings as ObstacleSchema(type='building') with a polygon footprint.
  //
  // The CPU engine then:
  // 1) checks if each source->receiver segment intersects obstacle edges in 2D, and if so
  // 2) computes a 3D top-edge path difference delta using obstacle.height (hb) and source/receiver z (hs/hr).
  // That delta is turned into insertion loss (Abar) by the propagation model and replaces ground effect when blocked.
  const barrierObstacles = scene.barriers.map((barrier) => ({
    id: barrier.id,
    type: 'barrier' as const,
    name: `Barrier ${barrier.id.toUpperCase()}`,
    vertices: [
      { x: barrier.p1.x, y: barrier.p1.y },
      { x: barrier.p2.x, y: barrier.p2.y },
    ],
    height: barrier.height,
    groundElevation: 0,
    attenuationDb: Number.isFinite(barrier.transmissionLoss ?? Infinity) ? barrier.transmissionLoss ?? 20 : 20,
    enabled: true,
  }));

  const buildingObstacles = scene.buildings.map((building) => ({
    id: building.id,
    type: 'building' as const,
    name: `Building ${building.id.toUpperCase()}`,
    footprint: building.getVertices().map((pt) => ({ x: pt.x, y: pt.y })),
    height: building.z_height,
    groundElevation: 0,
    attenuationDb: 25,
    enabled: true,
  }));

  engineScene.obstacles = [...barrierObstacles, ...buildingObstacles];

  return engineScene;
}

/**
 * Build an engine scene with only a single source
 *
 * Used for incremental computation during dragging.
 *
 * @param config - Build config
 * @param sourceId - ID of the source to include
 * @returns Engine scene with only the specified source
 */
export function buildSingleSourceScene(config: BuildEngineSceneConfig, sourceId: string) {
  const engineScene = buildEngineScene(config);
  engineScene.sources = engineScene.sources.filter((source) => source.id === sourceId);
  return engineScene;
}

/**
 * Get scene bounds from active geometry
 *
 * Scene bounds for "Generate Map" are based on *active* geometry primitives.
 * Notes:
 * - sources are filtered through solo/mute so the map reflects what will be computed.
 * - barriers contribute their endpoints; buildings contribute footprint vertices.
 *
 * @param scene - UI scene
 * @param isSourceEnabled - Function to check if source is enabled
 * @returns Bounds rectangle or null if no geometry
 */
export function getSceneBounds(
  scene: UIScene,
  isSourceEnabled: (source: Source) => boolean
): Bounds | null {
  const points: Array<{ x: number; y: number }> = [];

  for (const source of scene.sources) {
    if (!isSourceEnabled(source)) continue;
    points.push({ x: source.x, y: source.y });
  }
  for (const receiver of scene.receivers) {
    points.push({ x: receiver.x, y: receiver.y });
  }
  for (const barrier of scene.barriers) {
    points.push({ x: barrier.p1.x, y: barrier.p1.y });
    points.push({ x: barrier.p2.x, y: barrier.p2.y });
  }
  for (const building of scene.buildings) {
    for (const vertex of building.getVertices()) {
      points.push({ x: vertex.x, y: vertex.y });
    }
  }

  if (!points.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Build panel payload for engine compute
 *
 * @param panel - Panel entity
 * @returns Panel payload for engine
 */
export function buildPanelPayload(panel: Panel) {
  return {
    panelId: panelId(panel.id),
    sampling: { type: 'grid' as const, resolution: panel.sampling.resolution, pointCount: panel.sampling.pointCap },
  };
}

/**
 * Check if an error is a stale computation error
 *
 * Stale errors occur when a computation is superseded by a newer request.
 *
 * @param error - Error to check
 * @returns true if this is a stale error
 */
export function isStaleError(error: unknown): boolean {
  return error instanceof Error && error.message === 'stale';
}
