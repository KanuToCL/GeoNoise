import { describe, it, expect } from 'vitest';
import { CPUWorkerBackend } from '../src/cpuWorkerBackend.js';
import { createEmptyScene } from '@geonoise/core';
import { createFlatSpectrum, type Spectrum9 } from '@geonoise/shared';

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
      spectrum: createFlatSpectrum(100) as Spectrum9,
      enabled: true,
    } as any,
    {
      id: 's2',
      type: 'point',
      name: 'Source 2',
      position: { x: 20, y: 0, z: 1 },
      soundPowerLevel: 95,
      spectrum: createFlatSpectrum(95) as Spectrum9,
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
          },
          "sceneHash": "dlwtxg",
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
              "LAeq": 77.36358943255416,
              "LCeq": 78.77330323973055,
              "LZeq": 79.73278924233716,
              "Leq_spectrum": [
                70.19036802507706,
                70.19036801791356,
                70.19036798916993,
                70.19036787522163,
                70.19036743524867,
                70.19036589527,
                70.19036193480122,
                70.19035665300281,
                70.19035350576192,
              ],
              "contributions": [
                {
                  "LAeq": 76.17027895189321,
                  "Leq_spectrum": [
                    68.99705754441612,
                    68.9970575372526,
                    68.99705750850899,
                    68.99705739456067,
                    68.99705695458772,
                    68.99705541460906,
                    68.99705145414026,
                    68.99704617234185,
                    68.99704302510096,
                  ],
                  "attenuation": 31.002943045412284,
                  "attenuation_spectrum": [
                    31.002942455583884,
                    31.00294246274739,
                    31.002942491491012,
                    31.002942605439326,
                    31.002943045412284,
                    31.002944585390942,
                    31.00294854585974,
                    31.002953827658146,
                    31.00295697489904,
                  ],
                  "distance": 10.012492197250394,
                  "sourceId": "s1",
                },
                {
                  "LAeq": 71.17027895189321,
                  "Leq_spectrum": [
                    63.997057544416116,
                    63.99705753725261,
                    63.99705750850899,
                    63.99705739456067,
                    63.99705695458772,
                    63.99705541460906,
                    63.99705145414026,
                    63.997046172341854,
                    63.997043025100965,
                  ],
                  "attenuation": 31.002943045412284,
                  "attenuation_spectrum": [
                    31.002942455583884,
                    31.00294246274739,
                    31.002942491491012,
                    31.002942605439326,
                    31.002943045412284,
                    31.002944585390942,
                    31.00294854585974,
                    31.002953827658146,
                    31.00295697489904,
                  ],
                  "distance": 10.012492197250394,
                  "sourceId": "s2",
                },
              ],
              "receiverId": "r1",
            },
            {
              "LAeq": 70.79550233220706,
              "LCeq": 72.20521866288578,
              "LZeq": 73.16470276468407,
              "Leq_spectrum": [
                63.622285855282996,
                63.622285840160146,
                63.622285779479604,
                63.622285538923784,
                63.622284610098674,
                63.622281359056046,
                63.622272998126846,
                63.62226184774465,
                63.62225520361801,
              ],
              "contributions": [
                {
                  "LAeq": 70.15780492721048,
                  "Leq_spectrum": [
                    62.98458794898879,
                    62.984587934675176,
                    62.98458787724172,
                    62.984587649558314,
                    62.984586770435676,
                    62.984583693359966,
                    62.9845757798332,
                    62.984565226119685,
                    62.98455893752701,
                  ],
                  "attenuation": 37.015413229564324,
                  "attenuation_spectrum": [
                    37.01541205101121,
                    37.015412065324824,
                    37.01541212275828,
                    37.015412350441686,
                    37.015413229564324,
                    37.015416306640034,
                    37.0154242201668,
                    37.015434773880315,
                    37.01544106247299,
                  ],
                  "distance": 20.006249023742555,
                  "sourceId": "s1",
                },
                {
                  "LAeq": 62.14885783214987,
                  "Leq_spectrum": [
                    54.97564452472147,
                    54.975644504482126,
                    54.97564442327164,
                    54.97564410132896,
                    54.97564285825595,
                    54.975638507293326,
                    54.975627317624145,
                    54.97561239475015,
                    54.975603502725946,
                  ],
                  "attenuation": 40.02435714174405,
                  "attenuation_spectrum": [
                    40.02435547527853,
                    40.024355495517874,
                    40.02435557672836,
                    40.02435589867104,
                    40.02435714174405,
                    40.024361492706674,
                    40.024372682375855,
                    40.02438760524985,
                    40.024396497274054,
                  ],
                  "distance": 28.28869031963127,
                  "sourceId": "s2",
                },
              ],
              "receiverId": "r2",
            },
          ],
          "sceneHash": "povpbk",
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
