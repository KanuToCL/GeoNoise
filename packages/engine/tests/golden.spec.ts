import { describe, it, expect } from 'vitest';
import { CPUEngine } from '../src/compute/index.js';
import { createEmptyScene } from '@geonoise/core';

describe('Golden case harness', () => {
  it('computes a simple point source to single receiver', async () => {
    const engine = new CPUEngine();
    const scene = createEmptyScene({ latLon: { lat: 0, lon: 0 }, altitude: 0 }, 'golden');

    scene.sources.push({
      id: 'src1',
      type: 'point',
      name: 'Test Source',
      position: { x: 0, y: 0, z: 1 },
      soundPowerLevel: 100,
      enabled: true,
    } as any);

    scene.receivers.push({
      id: 'rec1',
      type: 'point',
      name: 'Test Receiver',
      position: { x: 10, y: 0, z: 1 },
      enabled: true,
    } as any);

    const resp = await engine.computeReceivers({ kind: 'receivers', scene, payload: {} } as any);
    expect(resp.results.length).toBe(1);
    const laeq = resp.results[0].LAeq;
    expect(Number.isFinite(laeq)).toBe(true);
    expect(laeq).toBeGreaterThan(-100);
  });
});
