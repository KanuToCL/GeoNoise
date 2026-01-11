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
              "LAeq": 77.12955749286435,
              "LCeq": 78.6581658777139,
              "LZeq": 79.44403887550395,
              "Leq_spectrum": [
                70.18936677829805,
                70.1873642798586,
                70.18035553532054,
                70.1703430431233,
                70.15031805872879,
                70.11026808993978,
                69.99011818357278,
                69.58961849568277,
                68.18786958806771,
              ],
              "contributions": [
                {
                  "LAeq": 75.93624701220338,
                  "Leq_spectrum": [
                    68.99605629763711,
                    68.99405379919766,
                    68.98704505465959,
                    68.97703256246234,
                    68.95700757806783,
                    68.91695760927884,
                    68.79680770291182,
                    68.39630801502182,
                    66.99455910740676,
                  ],
                  "attenuation": 31.042992421932166,
                  "attenuation_spectrum": [
                    31.00394370236289,
                    31.005946200802338,
                    31.012954945340415,
                    31.022967437537663,
                    31.042992421932166,
                    31.083042390721165,
                    31.203192297088172,
                    31.603691984978187,
                    33.00544089259324,
                  ],
                  "distance": 10.012492197250394,
                  "sourceId": "s1",
                },
                {
                  "LAeq": 70.93624701220338,
                  "Leq_spectrum": [
                    63.99605629763711,
                    63.99405379919766,
                    63.98704505465959,
                    63.97703256246234,
                    63.95700757806783,
                    63.91695760927884,
                    63.79680770291183,
                    63.396308015021816,
                    61.99455910740676,
                  ],
                  "attenuation": 31.042992421932166,
                  "attenuation_spectrum": [
                    31.00394370236289,
                    31.005946200802338,
                    31.012954945340415,
                    31.022967437537663,
                    31.042992421932166,
                    31.083042390721165,
                    31.203192297088172,
                    31.603691984978187,
                    33.00544089259324,
                  ],
                  "distance": 10.012492197250394,
                  "sourceId": "s2",
                },
              ],
              "receiverId": "r1",
            },
            {
              "LAeq": 70.33640217163827,
              "LCeq": 71.98089173339075,
              "LZeq": 72.6322102933539,
              "Leq_spectrum": [
                63.62017213660825,
                63.61594474481851,
                63.60114945986548,
                63.5800149192242,
                63.53775140741459,
                63.45324658960432,
                63.19990830529256,
                62.357306641244236,
                59.428767994654834,
              ],
              "contributions": [
                {
                  "LAeq": 69.71925939791349,
                  "Leq_spectrum": [
                    62.98258732896329,
                    62.97858607915854,
                    62.96458170484192,
                    62.944575455818175,
                    62.90456295777069,
                    62.82453796167572,
                    62.58446297339081,
                    61.78421301244111,
                    58.98333814911715,
                  ],
                  "attenuation": 37.09543704222931,
                  "attenuation_spectrum": [
                    37.01741267103671,
                    37.02141392084146,
                    37.03541829515808,
                    37.055424544181825,
                    37.09543704222931,
                    37.17546203832428,
                    37.41553702660919,
                    38.21578698755889,
                    41.01666185088285,
                  ],
                  "distance": 20.006249023742555,
                  "sourceId": "s1",
                },
                {
                  "LAeq": 61.557497598636544,
                  "Leq_spectrum": [
                    54.97281566258537,
                    54.967157924521445,
                    54.9473558412977,
                    54.91906715097807,
                    54.86248977033881,
                    54.74933500906028,
                    54.40987072522471,
                    53.27832311243946,
                    49.31790646769108,
                  ],
                  "attenuation": 40.13751022966119,
                  "attenuation_spectrum": [
                    40.02718433741463,
                    40.032842075478555,
                    40.0526441587023,
                    40.08093284902193,
                    40.13751022966119,
                    40.25066499093972,
                    40.59012927477529,
                    41.72167688756054,
                    45.68209353230892,
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
