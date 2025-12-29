import { describe, it, expect } from 'vitest';
import { CPUEngine } from '../src/compute/index.js';
import { createEmptyScene } from '@geonoise/core';

function createScene() {
  const scene = createEmptyScene({ latLon: { lat: 0, lon: 0 }, altitude: 0 }, 'panel');
  scene.sources.push(
    {
      id: 's1',
      type: 'point',
      position: { x: 0, y: 0, z: 1 },
      soundPowerLevel: 100,
      enabled: true,
    } as any,
    {
      id: 's2',
      type: 'point',
      position: { x: 20, y: 0, z: 1 },
      soundPowerLevel: 95,
      enabled: true,
    } as any
  );

  scene.panels.push({
    id: 'p1',
    type: 'rectangular',
    center: { x: 10, y: 10, z: 0 },
    width: 10,
    height: 10,
    rotation: 0,
    elevation: 1.5,
    sampling: { type: 'grid', resolution: 5 },
    enabled: true,
  } as any);

  return scene;
}

describe('Panel sampling + stats', () => {
  it('computes expected sample count for grid resolution', async () => {
    const engine = new CPUEngine();
    const scene = createScene();
    const response = await engine.computePanel({
      kind: 'panel',
      scene,
      payload: { panelId: 'p1' },
    } as any);

    expect(response.result.sampleCount).toBe(9);
  });

  it('caps sample count when pointCount is provided', async () => {
    const engine = new CPUEngine();
    const scene = createScene();
    const response = await engine.computePanel({
      kind: 'panel',
      scene,
      payload: { panelId: 'p1', sampling: { type: 'grid', resolution: 5, pointCount: 4 } },
    } as any);

    expect(response.result.sampleCount).toBeLessThanOrEqual(4);
  });

  it('matches panel stats snapshot', async () => {
    const engine = new CPUEngine();
    const scene = createScene();
    const response = await engine.computePanel({
      kind: 'panel',
      scene,
      payload: { panelId: 'p1' },
    } as any);

    expect(response.result).toMatchInlineSnapshot(`
      {
        "LAeq_avg": 68.22669956338883,
        "LAeq_max": 72.25600681842305,
        "LAeq_min": 64.42157274747662,
        "LAeq_p95": 72.25600681842305,
        "panelId": "p1",
        "sampleCount": 9,
        "samples": [
          {
            "LAeq": 72.25600681842305,
            "x": 5,
            "y": 5,
            "z": 1.5,
          },
          {
            "LAeq": 68.52128200620658,
            "x": 5,
            "y": 10,
            "z": 1.5,
          },
          {
            "LAeq": 65.71944544613226,
            "x": 5,
            "y": 15,
            "z": 1.5,
          },
          {
            "LAeq": 69.21553247325625,
            "x": 10,
            "y": 5,
            "z": 1.5,
          },
          {
            "LAeq": 67.17758439602554,
            "x": 10,
            "y": 10,
            "z": 1.5,
          },
          {
            "LAeq": 65.07113636151846,
            "x": 10,
            "y": 15,
            "z": 1.5,
          },
          {
            "LAeq": 69.1237706730246,
            "x": 15,
            "y": 5,
            "z": 1.5,
          },
          {
            "LAeq": 66.48136022956825,
            "x": 15,
            "y": 10,
            "z": 1.5,
          },
          {
            "LAeq": 64.42157274747662,
            "x": 15,
            "y": 15,
            "z": 1.5,
          },
        ],
      }
    `);
  });
});
