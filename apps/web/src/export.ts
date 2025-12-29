import { formatLevel, formatMeters } from './format.js';

export type ReceiverResult = {
  id: string;
  x: number;
  y: number;
  z: number;
  LAeq: number;
};

export type PanelSample = { x: number; y: number; z: number; LAeq: number };

export type PanelResult = {
  panelId: string;
  sampleCount: number;
  LAeq_min: number;
  LAeq_max: number;
  LAeq_avg: number;
  LAeq_p50: number;
  LAeq_p95: number;
  samples: PanelSample[];
};

export type SceneResults = {
  receivers: ReceiverResult[];
  panels: PanelResult[];
};

export function buildCsv(results: SceneResults) {
  const header = [
    'section',
    'id',
    'x',
    'y',
    'z',
    'LAeq',
    'sampleCount',
    'LAeq_min',
    'LAeq_max',
    'LAeq_avg',
    'LAeq_p50',
    'LAeq_p95',
  ];
  const rows = [header.join(',')];

  for (const receiver of results.receivers) {
    rows.push([
      'receiver',
      receiver.id,
      formatMeters(receiver.x),
      formatMeters(receiver.y),
      formatMeters(receiver.z),
      formatLevel(receiver.LAeq),
      '',
      '',
      '',
      '',
      '',
    ].join(','));
  }

  for (const panel of results.panels) {
    for (const sample of panel.samples) {
      rows.push([
        'panel_sample',
        panel.panelId,
        formatMeters(sample.x),
        formatMeters(sample.y),
        formatMeters(sample.z),
        formatLevel(sample.LAeq),
        '',
        '',
        '',
        '',
        '',
      ].join(','));
    }

    rows.push([
      'panel_stats',
      panel.panelId,
      '',
      '',
      '',
      '',
      panel.sampleCount.toString(),
      formatLevel(panel.LAeq_min),
      formatLevel(panel.LAeq_max),
      formatLevel(panel.LAeq_avg),
      formatLevel(panel.LAeq_p50),
      formatLevel(panel.LAeq_p95),
    ].join(','));
  }

  return rows.join('\n');
}
