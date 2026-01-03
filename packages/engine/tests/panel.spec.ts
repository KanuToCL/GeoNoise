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
        "LAeq_avg": 75.39992087613973,
        "LAeq_max": 79.42922973899047,
        "LAeq_min": 71.59479119066746,
        "LAeq_p95": 79.42922973899047,
        "panelId": "p1",
        "sampleCount": 9,
        "samples": [
          {
            "LAeq": 79.42922973899047,
            "Leq_spectrum": [
              72.25600726672239,
              72.25600726127776,
              72.25600723943116,
              72.2560071528247,
              72.25600681842305,
              72.25600564796156,
              72.25600263780552,
              72.2559986233726,
              72.25599623131109,
            ],
            "x": 5,
            "y": 5,
            "z": 1.5,
          },
          {
            "LAeq": 75.69450326494268,
            "Leq_spectrum": [
              68.52128270925215,
              68.5212827007136,
              68.52128266645268,
              68.52128253063205,
              68.52128200620658,
              68.52128017063009,
              68.52127544995218,
              68.52126915431663,
              68.52126540296541,
            ],
            "x": 5,
            "y": 10,
            "z": 1.5,
          },
          {
            "LAeq": 72.89266490172481,
            "Leq_spectrum": [
              65.71944642558624,
              65.7194464136907,
              65.71944636595978,
              65.7194461767401,
              65.71944544613226,
              65.71944288888301,
              65.71943631222972,
              65.71942754141045,
              65.71942231518287,
            ],
            "x": 5,
            "y": 15,
            "z": 1.5,
          },
          {
            "LAeq": 76.38875401747146,
            "Leq_spectrum": [
              69.21553313253997,
              69.21553312453294,
              69.21553309240461,
              69.21553296503829,
              69.21553247325625,
              69.2155307519372,
              69.21552632510283,
              69.21552042134549,
              69.21551690350081,
            ],
            "x": 10,
            "y": 5,
            "z": 1.5,
          },
          {
            "LAeq": 74.35080480294184,
            "Leq_spectrum": [
              67.17758522964866,
              67.17758521952425,
              67.17758517889997,
              67.17758501785322,
              67.17758439602554,
              67.17758221952502,
              67.17757662206928,
              67.17756915713663,
              67.17756470904162,
            ],
            "x": 10,
            "y": 10,
            "z": 1.5,
          },
          {
            "LAeq": 72.2443552759497,
            "Leq_spectrum": [
              65.07113742392845,
              65.07113741102539,
              65.07113735925185,
              65.07113715400601,
              65.07113636151846,
              65.07113358768001,
              65.0711264540093,
              65.07111694033492,
              65.07111127146557,
            ],
            "x": 10,
            "y": 15,
            "z": 1.5,
          },
          {
            "LAeq": 76.29699249088652,
            "Leq_spectrum": [
              69.12377129036044,
              69.12377128286285,
              69.12377125277872,
              69.12377113351627,
              69.1237706730246,
              69.12376906122697,
              69.1237649160569,
              69.12375938793643,
              69.1237560939213,
            ],
            "x": 15,
            "y": 5,
            "z": 1.5,
          },
          {
            "LAeq": 73.6545803297855,
            "Leq_spectrum": [
              66.48136111020612,
              66.4813610995107,
              66.48136105659532,
              66.48136088646584,
              66.48136022956825,
              66.48135793031733,
              66.48135201717619,
              66.48134413123682,
              66.48133943227879,
            ],
            "x": 15,
            "y": 10,
            "z": 1.5,
          },
          {
            "LAeq": 71.59479119066746,
            "Leq_spectrum": [
              64.4215738821243,
              64.42157386834393,
              64.42157381305007,
              64.4215735938487,
              64.42157274747662,
              64.42156978503328,
              64.42156216631463,
              64.42155200576634,
              64.42154595144743,
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
