/**
 * Probe Worker Management
 *
 * Handles communication with the probe Web Worker for acoustic calculations.
 */

import type { ProbeRequest, ProbeResult } from '@geonoise/engine';
import type { Probe } from '../entities/index.js';
import type { Barrier, Source, Building } from '../entities/index.js';
import type { PropagationConfig } from '@geonoise/core';
import { throttle } from '../utils/index.js';
import { PROBE_UPDATE_MS, PROBE_DEFAULT_Z } from '../constants.js';
import {
  addProbePending,
  setProbeResult,
  deleteProbePending,
} from './types.js';

// === Worker Instance ===

let probeWorker: Worker | null = null;

// === Result Handler ===

type ProbeResultHandler = (result: ProbeResult) => void;
let onProbeResult: ProbeResultHandler | null = null;

export function setProbeResultHandler(handler: ProbeResultHandler): void {
  onProbeResult = handler;
}

// === Worker Initialization ===

export function initProbeWorker(): void {
  if (probeWorker) return;
  try {
    probeWorker = new Worker(new URL('../probeWorker.js', import.meta.url), { type: 'module' });
    probeWorker.addEventListener('message', (event: MessageEvent<ProbeResult>) => {
      handleProbeResultInternal(event.data);
    });
    probeWorker.addEventListener('error', (err) => {
      console.error('[ProbeWorker] Worker error:', err);
      probeWorker = null;
    });
  } catch (err) {
    console.error('[ProbeWorker] Failed to create worker:', err);
    probeWorker = null;
  }
}

// === Probe Request Building ===

export interface ProbeSceneData {
  sources: Source[];
  barriers: Barrier[];
  buildings: Building[];
}

export interface ProbeConfig {
  barrierSideDiffraction: PropagationConfig['barrierSideDiffraction'];
  groundType: PropagationConfig['groundType'];
  groundMixedFactor: number;
  groundModel?: 'impedance' | 'iso9613';
  atmosphericAbsorption: PropagationConfig['atmosphericAbsorption'];
  temperature?: number;
  humidity?: number;
}

export function buildProbeRequest(
  probe: Probe,
  sceneData: ProbeSceneData,
  config: ProbeConfig,
  isSourceEnabled: (source: Source) => boolean,
  includePathGeometry: boolean
): ProbeRequest {
  const sources = sceneData.sources
    .filter((source) => isSourceEnabled(source))
    .map((source) => ({
      id: source.id,
      position: { x: source.x, y: source.y, z: source.z },
      spectrum: source.spectrum,
      gain: source.gain,
    }));

  const walls = [
    ...sceneData.barriers.map((barrier) => ({
      id: barrier.id,
      type: 'barrier' as const,
      vertices: [{ ...barrier.p1 }, { ...barrier.p2 }],
      height: barrier.height,
    })),
    ...sceneData.buildings.map((building) => ({
      id: building.id,
      type: 'building' as const,
      vertices: building.getVertices().map((point) => ({ ...point })),
      height: building.z_height,
    })),
  ];

  return {
    type: 'CALCULATE_PROBE',
    probeId: probe.id,
    position: { x: probe.x, y: probe.y, z: probe.z ?? PROBE_DEFAULT_Z },
    sources,
    walls,
    config: {
      barrierSideDiffraction: config.barrierSideDiffraction ?? 'auto',
      groundType: config.groundType ?? 'mixed',
      groundMixedFactor: config.groundMixedFactor ?? 0.5,
      groundModel: config.groundModel ?? 'impedance',
      atmosphericAbsorption: config.atmosphericAbsorption ?? 'simple',
      temperature: config.temperature,
      humidity: config.humidity,
    },
    includePathGeometry,
  };
}

// === Fallback Stub Calculation ===

export function calculateProbeStub(req: ProbeRequest): ProbeResult {
  const freqs = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  let minDist = Number.POSITIVE_INFINITY;
  for (const source of req.sources) {
    const dx = req.position.x - source.position.x;
    const dy = req.position.y - source.position.y;
    const dz = (req.position.z ?? 0) - (source.position.z ?? 0);
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < minDist) minDist = dist;
  }
  const hasSources = req.sources.length > 0;
  const dist = hasSources ? Math.max(minDist, 1) : 100;
  const base = hasSources ? 100 - 20 * Math.log10(dist) : 35;

  const magnitudes = freqs.map((freq) => {
    const tilt = -2.5 * Math.log2(freq / 1000);
    const jitter = (Math.random() - 0.5) * 2;
    return base + tilt + jitter;
  });

  return {
    type: 'PROBE_UPDATE',
    probeId: req.probeId,
    data: {
      frequencies: freqs,
      magnitudes,
    },
  };
}

// === Send Request to Worker ===

export function sendProbeRequest(
  probe: Probe,
  sceneData: ProbeSceneData,
  config: ProbeConfig,
  isSourceEnabled: (source: Source) => boolean,
  includePathGeometry: boolean,
  onPending?: () => void
): void {
  // Ensure worker is initialized
  if (!probeWorker) {
    initProbeWorker();
  }

  const request = buildProbeRequest(probe, sceneData, config, isSourceEnabled, includePathGeometry);
  addProbePending(probe.id);
  onPending?.();

  if (!probeWorker) {
    window.setTimeout(() => {
      handleProbeResultInternal(calculateProbeStub(request));
    }, 0);
    return;
  }
  probeWorker.postMessage(request);
}

// === Internal Result Handler ===

function handleProbeResultInternal(result: ProbeResult): void {
  if (!result || result.type !== 'PROBE_UPDATE') return;
  setProbeResult(result.probeId, result.data);
  deleteProbePending(result.probeId);
  onProbeResult?.(result);
}

// === Throttled Update Helpers ===

type GetProbeById = (probeId: string) => Probe | null;
type SendRequest = (probe: Probe) => void;

export function createThrottledProbeUpdate(
  getProbeById: GetProbeById,
  sendRequest: SendRequest
): (probeIds: string[]) => void {
  return throttle((probeIds: string[]) => {
    for (const probeId of probeIds) {
      const probe = getProbeById(probeId);
      if (!probe) continue;
      sendRequest(probe);
    }
  }, PROBE_UPDATE_MS);
}

export function requestProbeUpdates(
  probeIds: string[],
  getProbeById: GetProbeById,
  sendRequest: SendRequest,
  throttledUpdate: (probeIds: string[]) => void,
  options?: { immediate?: boolean }
): void {
  const uniqueIds = Array.from(new Set(probeIds)).filter((id) => id);
  if (!uniqueIds.length) return;
  if (!probeWorker) initProbeWorker();

  if (options?.immediate) {
    for (const probeId of uniqueIds) {
      const probe = getProbeById(probeId);
      if (probe) {
        sendRequest(probe);
      }
    }
    return;
  }
  throttledUpdate(uniqueIds);
}
