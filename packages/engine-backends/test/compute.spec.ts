import { describe, it, expect } from 'vitest';
import { getDefaultRouter, engineCompute } from '../src/index.js';
import { createEmptyScene } from '@geonoise/core';

function sampleScene() {
  const origin = { latLon: { lat: 0, lon: 0 }, altitude: 0 } as any;
  const scene = createEmptyScene(origin as any, 'test');
  scene.sources.push({ id: 's1', type: 'point', position: { x: 0, y: 0, z: 0 }, soundPowerLevel: 100 });
  scene.receivers.push({ id: 'r1', type: 'point', position: { x: 10, y: 0, z: 1.5 } });
  return scene;
}

describe('engineCompute routing', () => {
  it('uses CPU when preference=cpu', async () => {
    const router = await getDefaultRouter();
    const scene = sampleScene();
    const req = { kind: 'receivers', scene, payload: {} } as any;

    const res = await engineCompute(req, 'cpu');
    expect(res).toBeTruthy();
    expect((res as any).backendId).toBeTruthy();
    expect(['cpu-worker', 'cpu-main']).toContain((res as any).backendId);
    expect((res as any).warnings).toBeDefined();
    expect((res as any).timings).toBeDefined();
  });

  it('falls back to CPU when GPU forced but unavailable', async () => {
    const scene = sampleScene();
    const req = { kind: 'receivers', scene, payload: {} } as any;

    const res = await engineCompute(req, 'gpu');
    expect(res).toBeTruthy();
    expect((res as any).backendId).toBeTruthy();
    // No webgpu in CI, so should be cpu
    expect((res as any).backendId.startsWith('cpu')).toBe(true);
  });
});
