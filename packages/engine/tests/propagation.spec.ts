import { describe, it, expect } from 'vitest';
import { agrIsoEq10Db, calculatePropagation, calculateSPL, groundEffect } from '../src/propagation/index.js';
import { GroundType } from '@geonoise/core';
import { getDefaultEngineConfig } from '../src/api/index.js';
import { CPUEngine } from '../src/compute/index.js';
import { createEmptyScene } from '@geonoise/core';

function createScene(sourceCount: number) {
  const scene = createEmptyScene({ latLon: { lat: 0, lon: 0 }, altitude: 0 }, 'prop');
  for (let i = 0; i < sourceCount; i += 1) {
    scene.sources.push({
      id: `s${i + 1}`,
      type: 'point',
      position: { x: 0, y: 0, z: 1 },
      soundPowerLevel: 100,
      enabled: true,
    } as any);
  }
  scene.receivers.push({
    id: 'r1',
    type: 'point',
    position: { x: 10, y: 0, z: 1.5 },
    enabled: true,
  } as any);
  return scene;
}

describe('Propagation v1 behavior', () => {
  it('monotonic decrease with distance under default config', () => {
    const config = getDefaultEngineConfig('festival_fast');
    const distances = [5, 10, 20, 40, 80];
    const levels = distances.map((distance) => {
      const prop = calculatePropagation(
        distance,
        1,
        1.5,
        config.propagation!,
        config.meteo!,
        0,
        false,
        1000
      );
      return calculateSPL(100, prop);
    });

    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]).toBeLessThanOrEqual(levels[i - 1]);
    }
  });

  it('adds about +3.01 dB for two equal sources', async () => {
    const engine = new CPUEngine();
    const single = createScene(1);
    const double = createScene(2);

    const singleResult = await engine.computeReceivers({
      kind: 'receivers',
      scene: single,
      payload: {},
    } as any);

    const doubleResult = await engine.computeReceivers({
      kind: 'receivers',
      scene: double,
      payload: {},
    } as any);

    const singleLevel = singleResult.results[0].LAeq;
    const doubleLevel = doubleResult.results[0].LAeq;
    const diff = doubleLevel - singleLevel;

    expect(diff).toBeGreaterThan(2.9);
    expect(diff).toBeLessThan(3.2);
  });

  it('does not produce NaN or Inf outputs', async () => {
    const engine = new CPUEngine();
    const scene = createEmptyScene({ latLon: { lat: 0, lon: 0 }, altitude: 0 }, 'bounds');
    scene.sources.push({
      id: 's1',
      type: 'point',
      position: { x: 0, y: 0, z: 1 },
      soundPowerLevel: 100,
      enabled: true,
    } as any);
    scene.receivers.push(
      { id: 'r1', type: 'point', position: { x: 1, y: 0, z: 1 }, enabled: true } as any,
      { id: 'r2', type: 'point', position: { x: 50, y: 0, z: 1 }, enabled: true } as any,
      { id: 'r3', type: 'point', position: { x: 200, y: 0, z: 1 }, enabled: true } as any
    );

    const response = await engine.computeReceivers({ kind: 'receivers', scene, payload: {} } as any);

    for (const result of response.results) {
      expect(Number.isFinite(result.LAeq)).toBe(true);
      if (result.contributions) {
        for (const contrib of result.contributions) {
          expect(Number.isFinite(contrib.LAeq)).toBe(true);
          expect(Number.isFinite(contrib.distance)).toBe(true);
          expect(Number.isFinite(contrib.attenuation)).toBe(true);
        }
      }
    }
  });

  it('legacy ISO Eq.10 Agr is non-negative and matches expected values', () => {
    expect(agrIsoEq10Db(0.5, 1.5, 1.5)).toBe(0);
    expect(agrIsoEq10Db(20, 1.5, 1.5)).toBeCloseTo(0, 4);
    const far = agrIsoEq10Db(200, 1.5, 1.5);
    expect(far).toBeGreaterThan(4.4);
    expect(far).toBeLessThan(4.8);
  });

  it('legacy ground effect applies only to soft ground', () => {
    const hard = groundEffect(20, 1.5, 1.5, GroundType.Hard, 1000);
    const mixed = groundEffect(20, 1.5, 1.5, GroundType.Mixed, 1000);
    const soft = groundEffect(20, 1.5, 1.5, GroundType.Soft, 1000);
    expect(hard).toBe(0);
    expect(mixed).toBe(0);
    expect(soft).toBeGreaterThanOrEqual(0);
  });
});
