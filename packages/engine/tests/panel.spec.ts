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
        "LAeq_avg": 75.40782223591877,
        "LAeq_max": 79.43713109876951,
        "LAeq_min": 71.60269255044652,
        "LAeq_p95": 79.43713109876951,
        "panelId": "p1",
        "sampleCount": 9,
        "samples": [
          {
            "LAeq": 79.43713109876951,
            "Leq_spectrum": [
              72.26390862650143,
              72.2639086210568,
              72.2639085992102,
              72.26390851260373,
              72.26390817820209,
              72.2639070077406,
              72.26390399758456,
              72.26389998315165,
              72.26389759109013,
            ],
            "x": 5,
            "y": 5,
            "z": 1.5,
          },
          {
            "LAeq": 75.70240462472172,
            "Leq_spectrum": [
              68.52918406903117,
              68.52918406049264,
              68.52918402623172,
              68.52918389041109,
              68.52918336598563,
              68.52918153040913,
              68.52917680973121,
              68.52917051409568,
              68.52916676274445,
            ],
            "x": 5,
            "y": 10,
            "z": 1.5,
          },
          {
            "LAeq": 72.90056626150383,
            "Leq_spectrum": [
              65.72734778536527,
              65.72734777346972,
              65.72734772573881,
              65.72734753651915,
              65.72734680591128,
              65.72734424866204,
              65.72733767200874,
              65.72732890118947,
              65.7273236749619,
            ],
            "x": 5,
            "y": 15,
            "z": 1.5,
          },
          {
            "LAeq": 76.3966553772505,
            "Leq_spectrum": [
              69.22343449231902,
              69.22343448431198,
              69.22343445218365,
              69.22343432481733,
              69.2234338330353,
              69.22343211171622,
              69.22342768488187,
              69.22342178112454,
              69.22341826327985,
            ],
            "x": 10,
            "y": 5,
            "z": 1.5,
          },
          {
            "LAeq": 74.35870616272088,
            "Leq_spectrum": [
              67.18548658942768,
              67.18548657930326,
              67.18548653867902,
              67.18548637763226,
              67.18548575580455,
              67.18548357930405,
              67.18547798184832,
              67.18547051691569,
              67.18546606882066,
            ],
            "x": 10,
            "y": 10,
            "z": 1.5,
          },
          {
            "LAeq": 72.25225663572874,
            "Leq_spectrum": [
              65.07903878370749,
              65.07903877080443,
              65.07903871903088,
              65.07903851378504,
              65.0790377212975,
              65.07903494745905,
              65.07902781378833,
              65.07901830011396,
              65.07901263124462,
            ],
            "x": 10,
            "y": 15,
            "z": 1.5,
          },
          {
            "LAeq": 76.30489385066556,
            "Leq_spectrum": [
              69.13167265013948,
              69.13167264264189,
              69.13167261255776,
              69.13167249329531,
              69.13167203280364,
              69.13167042100602,
              69.13166627583594,
              69.13166074771547,
              69.13165745370034,
            ],
            "x": 15,
            "y": 5,
            "z": 1.5,
          },
          {
            "LAeq": 73.66248168956454,
            "Leq_spectrum": [
              66.48926246998516,
              66.48926245928975,
              66.48926241637436,
              66.48926224624488,
              66.4892615893473,
              66.48925929009636,
              66.48925337695522,
              66.48924549101585,
              66.48924079205783,
            ],
            "x": 15,
            "y": 10,
            "z": 1.5,
          },
          {
            "LAeq": 71.60269255044652,
            "Leq_spectrum": [
              64.42947524190333,
              64.42947522812295,
              64.42947517282911,
              64.42947495362775,
              64.42947410725566,
              64.42947114481233,
              64.42946352609367,
              64.42945336554538,
              64.42944731122645,
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
