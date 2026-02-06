/**
 * Probe Snapshots
 *
 * Creates frozen snapshots of probe data that persist until closed.
 */

import type { ProbeResult } from '@geonoise/engine';
import type { FrequencyWeighting } from '@geonoise/shared';
import type { ProbeSnapshot } from './types.js';
import {
  getProbeSnapshots,
  addProbeSnapshot,
  removeProbeSnapshot,
  nextSnapshotSeq,
} from './types.js';
import { renderProbeChartOn, type ReadCssVar } from './chart.js';
import { makePanelDraggable, bringPanelToFront, clampPanelToParent, getInspectorMinTop } from './panels.js';

// === Render Snapshots ===

export function renderProbeSnapshots(
  displayWeighting: FrequencyWeighting,
  readCssVar: ReadCssVar
): void {
  const snapshots = getProbeSnapshots();
  if (!snapshots.length) return;
  for (const snapshot of snapshots) {
    renderProbeChartOn(snapshot.canvas, snapshot.ctx, snapshot.data, displayWeighting, readCssVar);
  }
}

// === Create Snapshot ===

export interface CreateProbeSnapshotOptions {
  data: ProbeResult['data'];
  sourceProbeName?: string;
  coordinates?: { x: number; y: number };
  uiLayer: HTMLElement;
  probePanel: HTMLElement | null;
  displayWeighting: FrequencyWeighting;
  readCssVar: ReadCssVar;
}

export function createProbeSnapshot(options: CreateProbeSnapshotOptions): ProbeSnapshot | null {
  const { data, sourceProbeName, coordinates, uiLayer, probePanel, displayWeighting, readCssVar } = options;

  if (!uiLayer) return null;

  const snapshotIndex = nextSnapshotSeq();
  const snapshotId = `snapshot-${snapshotIndex}`;
  const panel = document.createElement('aside');
  panel.className = 'probe-panel probe-panel--snapshot is-open';
  panel.setAttribute('aria-hidden', 'false');
  panel.dataset.snapshotId = snapshotId;

  const header = document.createElement('div');
  header.className = 'probe-header';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'probe-title-wrap';
  const title = document.createElement('div');
  title.className = 'probe-title';
  // Show source probe name if provided
  const displayTitle = sourceProbeName ? `${sourceProbeName}` : `Snapshot ${snapshotIndex}`;
  title.textContent = displayTitle;
  title.title = 'Double-click to edit name';
  title.style.cursor = 'text';
  const badge = document.createElement('span');
  badge.className = 'probe-title-badge';
  badge.textContent = 'Frozen';
  titleWrap.appendChild(title);
  titleWrap.appendChild(badge);

  const actions = document.createElement('div');
  actions.className = 'probe-actions';
  const closeButton = document.createElement('button');
  closeButton.className = 'probe-close ui-button';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close snapshot');
  closeButton.textContent = 'x';
  actions.appendChild(closeButton);
  header.appendChild(titleWrap);
  header.appendChild(actions);

  const meta = document.createElement('div');
  meta.className = 'probe-meta';
  const metaLeft = document.createElement('span');
  metaLeft.textContent = 'Frequency Response';
  const metaRight = document.createElement('span');
  metaRight.textContent = 'Frozen';
  meta.appendChild(metaLeft);
  meta.appendChild(metaRight);

  // Add coordinates info if provided
  let coordsInfo: HTMLDivElement | null = null;
  if (coordinates) {
    coordsInfo = document.createElement('div');
    coordsInfo.className = 'probe-coords';
    coordsInfo.textContent = `Position: X: ${coordinates.x.toFixed(1)}m, Y: ${coordinates.y.toFixed(1)}m`;
  }

  const chart = document.createElement('div');
  chart.className = 'probe-chart';
  const canvas = document.createElement('canvas');
  chart.appendChild(canvas);

  const footer = document.createElement('div');
  footer.className = 'probe-footer';
  const footerLeft = document.createElement('span');
  footerLeft.textContent = 'Frequency (Hz)';
  const footerRight = document.createElement('span');
  footerRight.textContent = 'Amplitude (dB)';
  footer.appendChild(footerLeft);
  footer.appendChild(footerRight);

  panel.appendChild(header);
  panel.appendChild(meta);
  if (coordsInfo) panel.appendChild(coordsInfo);
  panel.appendChild(chart);
  panel.appendChild(footer);
  uiLayer.appendChild(panel);

  // Bring new panel to front of all inspector windows
  bringPanelToFront(panel);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    panel.remove();
    return null;
  }

  const snapshot: ProbeSnapshot = { id: snapshotId, data, panel, canvas, ctx };
  addProbeSnapshot(snapshot);

  const parent = uiLayer;
  const snapshots = getProbeSnapshots();
  requestAnimationFrame(() => {
    const parentRect = parent.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const anchorRect = probePanel?.getBoundingClientRect() ?? null;
    const stackOffset = 18 * ((snapshots.length - 1) % 4);
    const offset = 24 + stackOffset;
    const initialLeft = (anchorRect ? anchorRect.left - parentRect.left + offset : parentRect.width - panelRect.width - offset);
    const initialTop = (anchorRect ? anchorRect.top - parentRect.top + offset : parentRect.height - panelRect.height - offset);
    clampPanelToParent(panel, parent, initialLeft, initialTop, 12, getInspectorMinTop(parent, 12));
    renderProbeChartOn(canvas, ctx, data, displayWeighting, readCssVar);
  });

  // Add double-click to edit title
  title.addEventListener('dblclick', () => {
    const currentName = title.textContent || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'context-title-input';
    input.value = currentName;
    input.placeholder = `Snapshot ${snapshotIndex}`;

    title.style.display = 'none';
    title.parentElement?.insertBefore(input, title);
    input.focus();
    input.select();

    const finishEditing = () => {
      const newValue = input.value.trim() || `Snapshot ${snapshotIndex}`;
      title.textContent = newValue;
      input.remove();
      title.style.display = '';
    };

    input.addEventListener('blur', finishEditing);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finishEditing();
      } else if (e.key === 'Escape') {
        input.remove();
        title.style.display = '';
      }
    });
  });

  makePanelDraggable(panel, header, { parent, padding: 12, ignoreSelector: 'button' });
  closeButton.addEventListener('click', () => {
    removeProbeSnapshot(snapshotId);
    panel.remove();
  });

  return snapshot;
}
