import { describe, it, expect } from 'vitest';
import { CPUWorkerBackend } from '../src/cpuWorkerBackend.js';
import { createEmptyScene } from '@geonoise/core';

function canonicalScene() {
  const scene = createEmptyScene({ latLon: { lat: 0, lon: 0 }, altitude: 0 }, 'canonical');
  scene.createdAt = '2024-01-01T00:00:00.000Z';
  scene.modifiedAt = '2024-01-01T00:00:00.000Z';

  scene.sources.push(
    {
      id: 's1',
      type: 'point',
      name: 'Source 1',
      position: { x: 0, y: 0, z: 1 },
      soundPowerLevel: 100,
      enabled: true,
    } as any,
    {
      id: 's2',
      type: 'point',
      name: 'Source 2',
      position: { x: 20, y: 0, z: 1 },
      soundPowerLevel: 95,
      enabled: true,
    } as any
  );

  scene.receivers.push(
    {
      id: 'r1',
      type: 'point',
      name: 'Receiver 1',
      position: { x: 10, y: 0, z: 1.5 },
      enabled: true,
    } as any,
    {
      id: 'r2',
      type: 'point',
      name: 'Receiver 2',
      position: { x: 0, y: 20, z: 1.5 },
      enabled: true,
    } as any
  );

  scene.panels.push({
    id: 'p1',
    type: 'rectangular',
    name: 'Panel 1',
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

function scrubTimings<T extends { timings: Record<string, number> }>(response: T) {
  return {
    ...response,
    timings: {
      ...response.timings,
      totalMs: 0,
      setupMs: 0,
      computeMs: 0,
      transferMs: 0,
    },
  };
}

describe('CPUWorkerBackend', () => {
  it('produces deterministic snapshots for canonical scenes', async () => {
    const backend = new CPUWorkerBackend();
    const scene = canonicalScene();

    const receivers = await backend.computeReceivers({ kind: 'receivers', scene, payload: {} } as any);
    const panel = await backend.computePanel({ kind: 'panel', scene, payload: { panelId: 'p1' } } as any);

    expect(receivers.timings).toEqual(
      expect.objectContaining({
        setupMs: expect.any(Number),
        computeMs: expect.any(Number),
        transferMs: expect.any(Number),
      })
    );
    expect(panel.timings).toEqual(
      expect.objectContaining({
        setupMs: expect.any(Number),
        computeMs: expect.any(Number),
        transferMs: expect.any(Number),
      })
    );

    expect({
      receivers: scrubTimings(receivers),
      panel: scrubTimings(panel),
    }).toMatchInlineSnapshot(`
      {
        "panel": {
          "backendId": "cpu-worker",
          "kind": "panel",
          "result": {
            "LAeq_avg": 68.22669956338883,
            "LAeq_max": 72.25600681842305,
            "LAeq_min": 64.42157274747662,
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
          },
          "sceneHash": "9kqg67",
          "timings": {
            "computeMs": 0,
            "pathCount": 18,
            "setupMs": 0,
            "totalMs": 0,
            "transferMs": 0,
          },
          "warnings": [],
        },
        "receivers": {
          "backendId": "cpu-worker",
          "kind": "receivers",
          "results": [
            {
              "LAeq": 70.18246607546962,
              "contributions": [
                {
                  "LAeq": 68.98915559480868,
                  "attenuation": 31.01084440519132,
                  "distance": 10.012492197250394,
                  "sourceId": "s1",
                },
                {
                  "LAeq": 63.98915559480868,
                  "attenuation": 31.01084440519132,
                  "distance": 10.012492197250394,
                  "sourceId": "s2",
                },
              ],
              "receiverId": "r1",
            },
            {
              "LAeq": 63.614383250319634,
              "contributions": [
                {
                  "LAeq": 62.97668541065664,
                  "attenuation": 37.02331458934336,
                  "distance": 20.006249023742555,
                  "sourceId": "s1",
                },
                {
                  "LAeq": 54.96774149847692,
                  "attenuation": 40.03225850152308,
                  "distance": 28.28869031963127,
                  "sourceId": "s2",
                },
              ],
              "receiverId": "r2",
            },
          ],
          "sceneHash": "r1ctil",
          "timings": {
            "computeMs": 0,
            "pathCount": 4,
            "setupMs": 0,
            "totalMs": 0,
            "transferMs": 0,
          },
          "warnings": [],
        },
      }
    `);
  });
});
