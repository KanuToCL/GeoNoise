import { describe, it, expect } from 'vitest';
import { CPUEngine } from '../src/compute/index.js';
import { createEmptyScene } from '@geonoise/core';
import { createFlatSpectrum, type Spectrum9 } from '@geonoise/shared';

function createScene() {
  const scene = createEmptyScene({ latLon: { lat: 0, lon: 0 }, altitude: 0 }, 'panel');
  scene.sources.push(
    {
      id: 's1',
      type: 'point',
      position: { x: 0, y: 0, z: 1 },
      soundPowerLevel: 100,
      spectrum: createFlatSpectrum(100) as Spectrum9,
      gain: 0,
      enabled: true,
    } as any,
    {
      id: 's2',
      type: 'point',
      position: { x: 20, y: 0, z: 1 },
      soundPowerLevel: 95,
      spectrum: createFlatSpectrum(95) as Spectrum9,
      gain: 0,
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
        "LAeq_avg": 75.138832563414,
        "LAeq_max": 79.25709943488431,
        "LAeq_min": 71.17962559716335,
        "LAeq_p95": 79.25709943488431,
        "panelId": "p1",
        "sampleCount": 9,
        "samples": [
          {
            "LAeq": 79.25709943488431,
            "Leq_spectrum": [
              72.2631476333408,
              72.26162567286283,
              72.2562991213179,
              72.24869059788341,
              72.23347649486806,
              72.20306001568852,
              72.11190340112114,
              71.80902090368448,
              70.75945951547,
            ],
            "x": 5,
            "y": 5,
            "z": 1.5,
          },
          {
            "LAeq": 75.4278543847651,
            "Leq_spectrum": [
              68.52799063883077,
              68.52560380391043,
              68.51725021019257,
              68.50531739062654,
              68.48145487289857,
              68.4337422871312,
              68.29070339123119,
              67.81495356884639,
              66.1615338851968,
            ],
            "x": 5,
            "y": 10,
            "z": 1.5,
          },
          {
            "LAeq": 72.529029594279,
            "Leq_spectrum": [
              65.72568514477962,
              65.72235988110732,
              65.71072172702897,
              65.69409651749594,
              65.66084865402473,
              65.59436312866241,
              65.39498773820844,
              64.7312683138375,
              62.418152276620475,
            ],
            "x": 5,
            "y": 15,
            "z": 1.5,
          },
          {
            "LAeq": 76.13715068408635,
            "Leq_spectrum": [
              69.22231534358288,
              69.22007704065432,
              69.21224298040434,
              69.20105146576155,
              69.17866843647596,
              69.13390237790476,
              68.99960420219115,
              68.55194361647916,
              66.98513156648721,
            ],
            "x": 10,
            "y": 5,
            "z": 1.5,
          },
          {
            "LAeq": 74.03693835743768,
            "Leq_spectrum": [
              67.18407149570743,
              67.1812413013678,
              67.17133562117914,
              67.15718464948107,
              67.1288827060849,
              67.07227881929255,
              66.90246715891553,
              66.33642829099215,
              64.35529225326025,
            ],
            "x": 10,
            "y": 10,
            "z": 1.5,
          },
          {
            "LAeq": 71.85214290153382,
            "Leq_spectrum": [
              65.07723531922407,
              65.07362838146469,
              65.06100409930687,
              65.04296941051001,
              65.00690003291626,
              64.93476127772878,
              64.71834501216632,
              63.99695746029147,
              61.47210102872946,
            ],
            "x": 10,
            "y": 15,
            "z": 1.5,
          },
          {
            "LAeq": 76.06420669693294,
            "Leq_spectrum": [
              69.13062472967533,
              69.12852900870173,
              69.12119529826722,
              69.11072211100779,
              69.08978823045652,
              69.04797039208476,
              68.92291514632493,
              68.51033947659383,
              67.11623400721638,
            ],
            "x": 15,
            "y": 5,
            "z": 1.5,
          },
          {
            "LAeq": 73.32633359979539,
            "Leq_spectrum": [
              66.487767581026,
              66.48477787591234,
              66.47431474903281,
              66.45936969455461,
              66.42948759758252,
              66.36975546280243,
              66.19081575388357,
              65.59713749472812,
              63.55317688748759,
            ],
            "x": 15,
            "y": 10,
            "z": 1.5,
          },
          {
            "LAeq": 71.17962559716335,
            "Leq_spectrum": [
              64.42754916006395,
              64.42369703355016,
              64.41021507963916,
              64.39095646498508,
              64.35244389470648,
              64.27543740501181,
              64.04456744357051,
              63.27663043892492,
              60.60896337628358,
            ],
            "x": 15,
            "y": 15,
            "z": 1.5,
          },
        ],
      }
    `);
  });
});
