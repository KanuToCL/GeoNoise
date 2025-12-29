/**
 * CPU compute implementation - Reference implementation
 */

import { sumDecibels, receiverId, MIN_LEVEL } from '@geonoise/shared';
import type { Scene, EngineConfig, Point3D } from '@geonoise/core';
import { distance3D } from '@geonoise/core';
import { generateRectangleSamples, generatePolygonSamples, generateGrid } from '@geonoise/geo';
import type {
  Engine, EngineCapabilities, ComputeReceiversRequest, ComputeReceiversResponse,
  ComputePanelRequest, ComputePanelResponse, ComputeGridRequest, ComputeGridResponse,
  ReceiverResult, PanelResult, GridResult, SourceContribution,
} from '../api/index.js';
import { getDefaultEngineConfig, createRequestHash } from '../api/index.js';
import { calculatePropagation, calculateSPL } from '../propagation/index.js';

/** CPU Engine implementation */
export class CPUEngine implements Engine {
  getBackendId() { return 'cpu-main' as const; }
  async isAvailable() { return true; }
  getCapabilities(): EngineCapabilities {
    return { maxReceivers: 10000, maxSources: 1000, maxGridPoints: 100000, supportsGPU: false, supportsBandedCalculation: true, supportsBarriers: true };
  }
  dispose() {}

  async computeReceivers(request: ComputeReceiversRequest): Promise<ComputeReceiversResponse> {
    const start = performance.now();
    const { scene } = request;
    const config = request.engineConfig ?? getDefaultEngineConfig('festival_fast');
    const meteo = config.meteo ?? { temperature: 20, relativeHumidity: 50, pressure: 101.325, windSpeed: 0, windDirection: 0 };
    const propConfig = config.propagation ?? getDefaultEngineConfig('festival_fast').propagation!;

    const enabledSources = scene.sources.filter(s => s.enabled);
    let receivers = scene.receivers.filter(r => r.enabled);
    if (request.payload.receiverIds?.length) {
      const idSet = new Set(request.payload.receiverIds);
      receivers = receivers.filter(r => idSet.has(receiverId(r.id)));
    }

    const results: ReceiverResult[] = receivers.map(recv => {
      const contributions: SourceContribution[] = [];
      const levels: number[] = [];

      for (const src of enabledSources) {
        const dist = distance3D(src.position, recv.position);
        const prop = calculatePropagation(dist, src.position.z, recv.position.z, propConfig, meteo);
        const spl = calculateSPL(src.soundPowerLevel, prop);
        if (spl > MIN_LEVEL) {
          levels.push(spl);
          contributions.push({ sourceId: src.id, LAeq: spl, distance: dist, attenuation: prop.totalAttenuation });
        }
      }

      return { receiverId: receiverId(recv.id), LAeq: levels.length ? sumDecibels(levels) : MIN_LEVEL, contributions };
    });

    return {
      kind: 'receivers', results, sceneHash: createRequestHash(request),
      backendId: 'cpu-main', timings: { totalMs: performance.now() - start, pathCount: enabledSources.length * receivers.length },
      warnings: []
    };
  }

  async computePanel(request: ComputePanelRequest): Promise<ComputePanelResponse> {
    const start = performance.now();
    const { scene } = request;
    const config = request.engineConfig ?? getDefaultEngineConfig('festival_fast');
    const meteo = config.meteo ?? { temperature: 20, relativeHumidity: 50, pressure: 101.325, windSpeed: 0, windDirection: 0 };
    const propConfig = config.propagation ?? getDefaultEngineConfig('festival_fast').propagation!;

    const panel = scene.panels.find(p => p.id === request.payload.panelId);
    if (!panel || !panel.enabled) {
      return { kind: 'panel', result: { panelId: request.payload.panelId as any, sampleCount: 0, LAeq_min: MIN_LEVEL, LAeq_max: MIN_LEVEL, LAeq_avg: MIN_LEVEL }, sceneHash: createRequestHash(request), backendId: 'cpu-main', timings: { totalMs: performance.now() - start }, warnings: [{ code: 'PANEL_NOT_FOUND', message: 'Panel not found or disabled', severity: 'warning' }] };
    }

    const sampling = request.payload.sampling ?? panel.sampling ?? { type: 'grid', resolution: 5 };
    const elevation = panel.elevation ?? 1.5;
    
    let samples: Point3D[];
    if (panel.type === 'rectangular') {
      samples = generateRectangleSamples({ x: panel.center.x, y: panel.center.y }, panel.width, panel.height, panel.rotation ?? 0, sampling.resolution, elevation);
    } else {
      samples = generatePolygonSamples(panel.vertices, sampling.resolution, elevation);
    }

    const enabledSources = scene.sources.filter(s => s.enabled);
    const sampleResults = samples.map(pt => {
      const levels = enabledSources.map(src => {
        const dist = distance3D(src.position, pt);
        return calculateSPL(src.soundPowerLevel, calculatePropagation(dist, src.position.z, pt.z, propConfig, meteo));
      }).filter(l => l > MIN_LEVEL);
      return { x: pt.x, y: pt.y, z: pt.z, LAeq: levels.length ? sumDecibels(levels) : MIN_LEVEL };
    });

    const laeqs = sampleResults.map(s => s.LAeq).filter(l => l > MIN_LEVEL);
    const result: PanelResult = {
      panelId: request.payload.panelId as any, sampleCount: samples.length,
      LAeq_min: laeqs.length ? Math.min(...laeqs) : MIN_LEVEL,
      LAeq_max: laeqs.length ? Math.max(...laeqs) : MIN_LEVEL,
      LAeq_avg: laeqs.length ? sumDecibels(laeqs) - 10 * Math.log10(laeqs.length) : MIN_LEVEL,
      samples: sampleResults
    };

    return { kind: 'panel', result, sceneHash: createRequestHash(request), backendId: 'cpu-main', timings: { totalMs: performance.now() - start, pathCount: enabledSources.length * samples.length }, warnings: [] };
  }

  async computeGrid(request: ComputeGridRequest): Promise<ComputeGridResponse> {
    const start = performance.now();
    const { scene } = request;
    const config = request.engineConfig ?? getDefaultEngineConfig('festival_fast');
    const meteo = config.meteo ?? { temperature: 20, relativeHumidity: 50, pressure: 101.325, windSpeed: 0, windDirection: 0 };
    const propConfig = config.propagation ?? getDefaultEngineConfig('festival_fast').propagation!;
    const gridConfig = request.payload.gridConfig;

    if (!gridConfig.bounds) {
      return { kind: 'grid', result: { bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, resolution: gridConfig.resolution, elevation: gridConfig.elevation ?? 1.5, cols: 0, rows: 0, values: [], min: MIN_LEVEL, max: MIN_LEVEL }, sceneHash: createRequestHash(request), backendId: 'cpu-main', timings: { totalMs: performance.now() - start }, warnings: [{ code: 'NO_BOUNDS', message: 'Grid bounds not specified', severity: 'warning' }] };
    }

    const points = generateGrid(gridConfig.bounds, gridConfig.resolution, gridConfig.elevation ?? 1.5);
    const enabledSources = scene.sources.filter(s => s.enabled);
    
    const values = points.map(pt => {
      const levels = enabledSources.map(src => {
        const dist = distance3D(src.position, pt);
        return calculateSPL(src.soundPowerLevel, calculatePropagation(dist, src.position.z, pt.z, propConfig, meteo));
      }).filter(l => l > MIN_LEVEL);
      return levels.length ? sumDecibels(levels) : MIN_LEVEL;
    });

    const validValues = values.filter(v => v > MIN_LEVEL);
    const cols = Math.ceil((gridConfig.bounds.maxX - gridConfig.bounds.minX) / gridConfig.resolution) + 1;
    const rows = Math.ceil((gridConfig.bounds.maxY - gridConfig.bounds.minY) / gridConfig.resolution) + 1;

    const result: GridResult = {
      bounds: gridConfig.bounds, resolution: gridConfig.resolution, elevation: gridConfig.elevation ?? 1.5,
      cols, rows, values, min: validValues.length ? Math.min(...validValues) : MIN_LEVEL, max: validValues.length ? Math.max(...validValues) : MIN_LEVEL
    };

    return { kind: 'grid', result, sceneHash: createRequestHash(request), backendId: 'cpu-main', timings: { totalMs: performance.now() - start, pathCount: enabledSources.length * points.length }, warnings: [] };
  }
}
