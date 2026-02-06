/**
 * Scene Deserialization
 *
 * Parses and validates JSON scene data, converting it back to runtime objects.
 * Handles backward compatibility with legacy file formats.
 */

import type { Source, Receiver, Panel, Probe, Barrier, Point } from '../entities/index.js';
import { Building, type BuildingData } from '../entities/index.js';
import type { ScenePayload, ValidationResult, PropagationConfig } from './types.js';

/** Default Z height for probes if not specified */
export const PROBE_DEFAULT_Z = 1.5;

/**
 * Scene data structure for deserialized scenes
 */
export type DeserializedScene = {
  sources: Source[];
  receivers: Receiver[];
  panels: Panel[];
  probes: Probe[];
  buildings: Building[];
  barriers: Barrier[];
};

/**
 * Result of parsing a scene file
 */
export type ParseResult = {
  success: true;
  scene: DeserializedScene;
  name: string;
  propagation?: PropagationConfig;
} | {
  success: false;
  error: string;
};

/**
 * Validate a scene payload structure
 *
 * @param payload - The parsed JSON data
 * @returns Validation result with error messages if invalid
 */
export function validatePayload(payload: unknown): ValidationResult {
  const errors: string[] = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Invalid payload: not an object'] };
  }

  const p = payload as Record<string, unknown>;

  if (!Array.isArray(p.sources)) {
    errors.push('Missing or invalid sources array');
  }
  if (!Array.isArray(p.receivers)) {
    errors.push('Missing or invalid receivers array');
  }
  if (!Array.isArray(p.panels)) {
    errors.push('Missing or invalid panels array');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Calculate the next sequence number for ID generation
 *
 * @param prefix - ID prefix (e.g., 's' for sources)
 * @param items - Array of items with id property
 * @returns Next sequence number
 */
export function nextSequence(prefix: string, items: Array<{ id: string }>): number {
  let max = 0;
  for (const item of items) {
    if (!item.id.startsWith(prefix)) continue;
    const value = Number.parseInt(item.id.slice(prefix.length), 10);
    if (!Number.isNaN(value)) {
      max = Math.max(max, value);
    }
  }
  return Math.max(max + 1, items.length + 1);
}

/**
 * Deserialize a source from payload
 */
function deserializeSource(data: Record<string, unknown>): Source {
  return { ...data } as Source;
}

/**
 * Deserialize a receiver from payload
 */
function deserializeReceiver(data: Record<string, unknown>): Receiver {
  return { ...data } as Receiver;
}

/**
 * Deserialize a panel from payload
 */
function deserializePanel(data: Record<string, unknown>): Panel {
  const panel = data as unknown as Panel;
  return {
    ...panel,
    points: panel.points.map((point: Point) => ({ ...point })),
    sampling: { ...panel.sampling },
  };
}

/**
 * Deserialize a probe from payload with default Z handling
 */
function deserializeProbe(data: Record<string, unknown>): Probe {
  const probe = data as unknown as Probe;
  return {
    ...probe,
    z: probe.z ?? PROBE_DEFAULT_Z,
  };
}

/**
 * Deserialize a building from payload
 */
function deserializeBuilding(data: Record<string, unknown>): Building {
  return new Building(data as unknown as BuildingData);
}

/**
 * Deserialize a barrier from payload
 */
function deserializeBarrier(data: Record<string, unknown>): Barrier {
  const barrier = data as unknown as Barrier;
  return {
    ...barrier,
    p1: { ...barrier.p1 },
    p2: { ...barrier.p2 },
  };
}

/**
 * Parse and deserialize a scene payload
 *
 * @param payload - The scene payload object
 * @returns ParseResult with deserialized scene or error
 */
export function deserializeScene(payload: ScenePayload): ParseResult {
  const validation = validatePayload(payload);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join('; ') };
  }

  try {
    const scene: DeserializedScene = {
      sources: payload.sources.map((s) => deserializeSource(s as Record<string, unknown>)),
      receivers: payload.receivers.map((r) => deserializeReceiver(r as Record<string, unknown>)),
      panels: payload.panels.map((p) => deserializePanel(p as Record<string, unknown>)),
      probes: (payload.probes ?? []).map((p) => deserializeProbe(p as Record<string, unknown>)),
      buildings: (payload.buildings ?? []).map((b) => deserializeBuilding(b as Record<string, unknown>)),
      barriers: (payload.barriers ?? []).map((b) => deserializeBarrier(b as Record<string, unknown>)),
    };

    return {
      success: true,
      scene,
      name: payload.name || 'Untitled',
      propagation: payload.propagation,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown deserialization error';
    return { success: false, error: message };
  }
}

/**
 * Parse JSON text into a scene payload
 *
 * @param jsonText - Raw JSON string
 * @returns ParseResult with deserialized scene or error
 */
export function parseSceneJson(jsonText: string): ParseResult {
  try {
    const payload = JSON.parse(jsonText) as ScenePayload;
    return deserializeScene(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';
    return { success: false, error: `Failed to parse JSON: ${message}` };
  }
}

/**
 * Calculate sequence numbers for all entity types after loading
 *
 * @param scene - The deserialized scene
 * @returns Object with sequence numbers for each entity type
 */
export function calculateSequences(scene: DeserializedScene): {
  sourceSeq: number;
  receiverSeq: number;
  panelSeq: number;
  probeSeq: number;
  buildingSeq: number;
  barrierSeq: number;
} {
  return {
    sourceSeq: nextSequence('s', scene.sources),
    receiverSeq: nextSequence('r', scene.receivers),
    panelSeq: nextSequence('p', scene.panels),
    probeSeq: nextSequence('pr', scene.probes),
    buildingSeq: nextSequence('bd', scene.buildings),
    barrierSeq: nextSequence('b', scene.barriers),
  };
}
