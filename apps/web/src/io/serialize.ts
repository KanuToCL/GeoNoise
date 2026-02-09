/**
 * Scene Serialization
 *
 * Converts scene data to JSON format for saving to files.
 * Handles all entity types and propagation configuration.
 */

import type { Source, Receiver, Panel, Probe, Barrier } from '../entities/index.js';
import { type Building } from '../entities/index.js';
import type { ScenePayload, PropagationConfig } from './types.js';

/**
 * Scene data interface matching main.ts scene structure
 */
export type SceneData = {
  sources: Source[];
  receivers: Receiver[];
  panels: Panel[];
  probes: Probe[];
  buildings: Building[];
  barriers: Barrier[];
};

/**
 * Build a serializable payload from scene data
 *
 * @param scene - The current scene data
 * @param name - Scene name (from UI input)
 * @param propagation - Current propagation configuration
 * @returns ScenePayload ready for JSON.stringify
 */
export function buildScenePayload(
  scene: SceneData,
  name: string,
  propagation: PropagationConfig
): ScenePayload {
  return {
    version: 1,
    name,
    sources: scene.sources.map((source) => ({ ...source })),
    receivers: scene.receivers.map((receiver) => ({ ...receiver })),
    panels: scene.panels.map((panel) => ({
      ...panel,
      points: panel.points.map((point) => ({ ...point })),
      sampling: { ...panel.sampling },
    })),
    probes: scene.probes.map((probe) => ({ ...probe })),
    buildings: scene.buildings.map((building) => building.toData()),
    barriers: scene.barriers.map((barrier) => ({
      ...barrier,
      p1: { ...barrier.p1 },
      p2: { ...barrier.p2 },
      transmissionLoss: Number.isFinite(barrier.transmissionLoss ?? Infinity)
        ? barrier.transmissionLoss
        : undefined,
    })),
    propagation,
  };
}

/**
 * Serialize scene to JSON string
 *
 * @param scene - The current scene data
 * @param name - Scene name
 * @param propagation - Propagation configuration
 * @param pretty - Whether to format with indentation (default: true)
 * @returns JSON string representation
 */
export function serializeScene(
  scene: SceneData,
  name: string,
  propagation: PropagationConfig,
  pretty = true
): string {
  const payload = buildScenePayload(scene, name, propagation);
  return pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
}

/**
 * Generate a sanitized filename from scene name
 *
 * @param name - Scene name
 * @returns Safe filename with .json extension
 */
export function generateFilename(name: string): string {
  const sanitized = (name?.trim() || 'geonoise-scene')
    .replace(/\s+/g, '-')
    .toLowerCase();
  return `${sanitized}.json`;
}

/**
 * Download scene as a JSON file
 *
 * @param scene - The current scene data
 * @param name - Scene name
 * @param propagation - Propagation configuration
 */
export function downloadScene(
  scene: SceneData,
  name: string,
  propagation: PropagationConfig
): void {
  const json = serializeScene(scene, name, propagation);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = generateFilename(name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
