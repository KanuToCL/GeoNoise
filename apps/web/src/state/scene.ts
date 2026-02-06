/**
 * Scene State Module
 *
 * Manages the core scene data: sources, receivers, panels, probes, buildings, barriers.
 * Also handles entity ID sequences and results data.
 */

import { createFlatSpectrum, type Spectrum9 } from '@geonoise/shared';
import {
  Building,
  type Barrier,
  type Source,
  type Receiver,
  type Panel,
  type Probe,
} from '../entities/index.js';
import type { ProbeResult } from '@geonoise/engine';
import type { SceneResults } from '../export.js';

// =============================================================================
// SCENE DATA
// =============================================================================

/**
 * The main scene object containing all entities.
 * Initialized with a demo scene of a source surrounded by buildings.
 */
export const scene = {
  sources: [
    {
      id: 's1',
      name: 'Source S1',
      x: 0,
      y: 0,
      z: 1.5,
      power: 100,
      spectrum: createFlatSpectrum(100) as Spectrum9,
      gain: 0,
      enabled: true,
    },
  ] as Source[],
  receivers: [
    { id: 'r1', x: 25, y: 15, z: 1.5 },
    { id: 'r2', x: -50, y: -30, z: 1.5 },
  ] as Receiver[],
  panels: [
    {
      id: 'p1',
      points: [
        { x: -20, y: 55 },
        { x: 55, y: 55 },
        { x: 55, y: -35 },
        { x: -20, y: -35 },
      ],
      elevation: 1.5,
      sampling: { resolution: 6, pointCap: 400 },
    },
  ] as Panel[],
  probes: [{ id: 'pr1', x: 20, y: 10, z: 1.7 }] as Probe[],
  buildings: [
    new Building({ id: 'bd1', x: 0, y: 40, width: 25, height: 10, rotation: 0, z_height: 12 }),
    new Building({ id: 'bd2', x: 40, y: 10, width: 10, height: 30, rotation: 0, z_height: 10 }),
    new Building({ id: 'bd3', x: 5, y: -25, width: 20, height: 8, rotation: 0.1, z_height: 8 }),
    new Building({ id: 'bd4', x: -30, y: 5, width: 8, height: 25, rotation: 0, z_height: 14 }),
    new Building({ id: 'bd5', x: 60, y: 30, width: 12, height: 10, rotation: -0.15, z_height: 6 }),
  ] as Building[],
  barriers: [
    {
      id: 'bar1',
      p1: { x: -15, y: 15 },
      p2: { x: -15, y: -15 },
      height: 3,
    },
  ] as Barrier[],
};

// =============================================================================
// ENTITY ID SEQUENCES
// =============================================================================

let sourceSeq = 3;
let receiverSeq = 3;
let panelSeq = 2;
let probeSeq = 1;
let buildingSeq = 2;
let barrierSeq = 1;

export function getSourceSeq(): number {
  return sourceSeq;
}
export function setSourceSeq(val: number): void {
  sourceSeq = val;
}
export function nextSourceId(): string {
  return `s${++sourceSeq}`;
}

export function getReceiverSeq(): number {
  return receiverSeq;
}
export function setReceiverSeq(val: number): void {
  receiverSeq = val;
}
export function nextReceiverId(): string {
  return `r${++receiverSeq}`;
}

export function getPanelSeq(): number {
  return panelSeq;
}
export function setPanelSeq(val: number): void {
  panelSeq = val;
}
export function nextPanelId(): string {
  return `p${++panelSeq}`;
}

export function getProbeSeq(): number {
  return probeSeq;
}
export function setProbeSeq(val: number): void {
  probeSeq = val;
}
export function nextProbeId(): string {
  return `pr${++probeSeq}`;
}

export function getBuildingSeq(): number {
  return buildingSeq;
}
export function setBuildingSeq(val: number): void {
  buildingSeq = val;
}
export function nextBuildingId(): string {
  return `bd${++buildingSeq}`;
}

export function getBarrierSeq(): number {
  return barrierSeq;
}
export function setBarrierSeq(val: number): void {
  barrierSeq = val;
}
export function nextBarrierId(): string {
  return `bar${++barrierSeq}`;
}

// =============================================================================
// LAYER VISIBILITY
// =============================================================================

export const layers = {
  sources: true,
  receivers: true,
  panels: true,
  noiseMap: false,
  grid: false,
};

// =============================================================================
// COMPUTATION RESULTS
// =============================================================================

/** Results from receiver and panel computations */
export const results: SceneResults = { receivers: [], panels: [] };

/** Per-probe results from the probe worker */
export const probeResults = new Map<string, ProbeResult['data']>();

/** Set of probe IDs currently being computed */
export const probePending = new Set<string>();

/** Energy totals for receivers (used for display) */
export const receiverEnergyTotals = new Map<string, number>();

/** Energy totals for panels (used for display) */
export const panelEnergyTotals = new Map<string, Float64Array>();

// =============================================================================
// SOURCE STATE
// =============================================================================

/** Collapsed sources in the UI */
export const collapsedSources = new Set<string>();

/** ID of the soloed source (only this source contributes to calculations) */
let soloSourceId: string | null = null;

export function getSoloSourceId(): string | null {
  return soloSourceId;
}

export function setSoloSourceId(id: string | null): void {
  soloSourceId = id;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Find a source by ID */
export function findSource(id: string): Source | undefined {
  return scene.sources.find((s) => s.id === id);
}

/** Find a receiver by ID */
export function findReceiver(id: string): Receiver | undefined {
  return scene.receivers.find((r) => r.id === id);
}

/** Find a panel by ID */
export function findPanel(id: string): Panel | undefined {
  return scene.panels.find((p) => p.id === id);
}

/** Find a probe by ID */
export function findProbe(id: string): Probe | undefined {
  return scene.probes.find((p) => p.id === id);
}

/** Find a building by ID */
export function findBuilding(id: string): Building | undefined {
  return scene.buildings.find((b) => b.id === id);
}

/** Find a barrier by ID */
export function findBarrier(id: string): Barrier | undefined {
  return scene.barriers.find((b) => b.id === id);
}

/** Get enabled sources (respecting solo mode) */
export function getEnabledSources(): Source[] {
  if (soloSourceId) {
    const solo = scene.sources.find((s) => s.id === soloSourceId);
    return solo && solo.enabled ? [solo] : [];
  }
  return scene.sources.filter((s) => s.enabled);
}

/** Check if a source is currently enabled (respecting solo mode) */
export function isSourceEnabled(source: Source): boolean {
  if (!source.enabled) return false;
  if (soloSourceId) return source.id === soloSourceId;
  return true;
}
