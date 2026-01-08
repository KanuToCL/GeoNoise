/**
 * Export utilities and types for scene results
 *
 * Spectral Source Migration (Jan 2026):
 * - Added Spectrum9 type for 9-band octave spectra
 * - ReceiverResult now includes LCeq, LZeq, and Leq_spectrum
 */

import { formatLevel, formatMeters } from './format.js';

/** 9-element tuple for octave bands: 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz */
export type Spectrum9 = [number, number, number, number, number, number, number, number, number];

/**
 * Result for a single receiver point
 *
 * Spectral Source Migration (Jan 2026):
 * - Added LCeq and LZeq for C and Z weighted totals
 * - Added Leq_spectrum for full 9-band spectrum at receiver
 */
export type ReceiverResult = {
  id: string;
  x: number;
  y: number;
  z: number;
  /** A-weighted overall level */
  LAeq: number;
  /** C-weighted overall level (optional) */
  LCeq?: number;
  /** Z-weighted (linear) overall level (optional) */
  LZeq?: number;
  /** Full 9-band spectrum at receiver [63Hz - 16kHz] in dB SPL */
  Leq_spectrum?: Spectrum9;
};

export type PanelSample = { x: number; y: number; z: number; LAeq: number };

export type PanelResult = {
  panelId: string;
  sampleCount: number;
  LAeq_min: number;
  LAeq_max: number;
  LAeq_avg: number;
  LAeq_p25: number;
  LAeq_p50: number;
  LAeq_p75: number;
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
