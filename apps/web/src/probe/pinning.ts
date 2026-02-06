/**
 * Probe Pinning
 *
 * Manages pinned probe panels that show live frequency response monitors.
 */

import type { FrequencyWeighting } from '@geonoise/shared';
import type { Probe } from '../entities/index.js';
import type { PinnedProbePanel } from './types.js';
import {
  getPinnedProbePanels,
  getPinnedProbePanel,
  setPinnedProbePanel,
  deletePinnedProbePanel,
  getProbeResult,
  isProbePending,
} from './types.js';
import { renderProbeChartOn, type ReadCssVar } from './chart.js';
import { makePanelDraggable, bringPanelToFront, clampPanelToParent, getInspectorMinTop } from './panels.js';

// === Probe Status ===

export function getProbeStatusLabel(probeId: string): string {
  if (isProbePending(probeId)) return 'Updating';
  if (getProbeResult(probeId)) return 'Live';
  return 'Idle';
}

// === Render Pinned Panels ===

export function renderPinnedProbePanel(
  probeId: string,
  displayWeighting: FrequencyWeighting,
  readCssVar: ReadCssVar
): void {
  const pinned = getPinnedProbePanel(probeId);
  if (!pinned) return;
  pinned.status.textContent = getProbeStatusLabel(probeId);
  renderProbeChartOn(pinned.canvas, pinned.ctx, getProbeResult(probeId) ?? null, displayWeighting, readCssVar);
}

export function renderPinnedProbePanels(
  displayWeighting: FrequencyWeighting,
  readCssVar: ReadCssVar
): void {
  for (const id of getPinnedProbePanels().keys()) {
    renderPinnedProbePanel(id, displayWeighting, readCssVar);
  }
}

// === Create Pinned Panel ===

export interface CreatePinnedProbePanelOptions {
  probeId: string;
  probe: Probe | null;
  uiLayer: HTMLElement;
  probePanel: HTMLElement | null;
  displayWeighting: FrequencyWeighting;
  readCssVar: ReadCssVar;
  onUnpin?: (probeId: string) => void;
}

export function createPinnedProbePanel(options: CreatePinnedProbePanelOptions): PinnedProbePanel | null {
  const { probeId, probe, uiLayer, probePanel, displayWeighting, readCssVar, onUnpin } = options;

  if (!uiLayer) return null;

  // Pinned panels are live monitors that stay on-screen until explicitly closed.
  const panel = document.createElement('aside');
  panel.className = 'probe-panel probe-panel--pinned is-open';
  panel.setAttribute('aria-hidden', 'false');
  panel.dataset.probeId = probeId;

  // Get the probe to check for custom name
  const defaultName = `Probe ${probeId.toUpperCase()}`;
  const displayName = probe?.name || defaultName;

  const header = document.createElement('div');
  header.className = 'probe-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'probe-title-wrap';
  const title = document.createElement('div');
  title.className = 'probe-title';
  title.textContent = displayName;
  const badge = document.createElement('span');
  badge.className = 'probe-title-badge';
  badge.textContent = 'Pinned';
  titleWrap.appendChild(title);
  titleWrap.appendChild(badge);

  const actions = document.createElement('div');
  actions.className = 'probe-actions';
  const closeButton = document.createElement('button');
  closeButton.className = 'probe-close ui-button';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Unpin probe monitor');
  closeButton.title = 'Unpin probe monitor';
  closeButton.textContent = 'x';
  closeButton.addEventListener('click', () => {
    if (onUnpin) {
      onUnpin(probeId);
    } else {
      removePinnedProbe(probeId);
    }
  });
  actions.appendChild(closeButton);

  header.appendChild(titleWrap);
  header.appendChild(actions);

  const meta = document.createElement('div');
  meta.className = 'probe-meta';
  const metaLeft = document.createElement('span');
  metaLeft.textContent = 'Frequency Response';
  const metaRight = document.createElement('span');
  metaRight.textContent = getProbeStatusLabel(probeId);
  meta.appendChild(metaLeft);
  meta.appendChild(metaRight);

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

  const pinned: PinnedProbePanel = { id: probeId, panel, canvas, ctx, status: metaRight };
  setPinnedProbePanel(probeId, pinned);

  const parent = uiLayer;
  requestAnimationFrame(() => {
    const parentRect = parent.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const anchorRect = probePanel?.getBoundingClientRect() ?? null;
    const stackOffset = 18 * ((getPinnedProbePanels().size - 1) % 4);
    const offset = 12 + stackOffset;
    const initialLeft = anchorRect
      ? anchorRect.left - parentRect.left + offset
      : parentRect.width - panelRect.width - offset;
    const initialTop = anchorRect
      ? anchorRect.top - parentRect.top + offset
      : parentRect.height - panelRect.height - offset;
    clampPanelToParent(panel, parent, initialLeft, initialTop, 12, getInspectorMinTop(parent, 12));
    renderProbeChartOn(canvas, ctx, getProbeResult(probeId) ?? null, displayWeighting, readCssVar);
  });

  makePanelDraggable(panel, header, { parent, padding: 12, ignoreSelector: 'button' });

  return pinned;
}

// === Pin/Unpin Operations ===

export function removePinnedProbe(probeId: string): boolean {
  const pinned = getPinnedProbePanel(probeId);
  if (!pinned) return false;
  deletePinnedProbePanel(probeId);
  pinned.panel.remove();
  return true;
}

export function clearPinnedProbes(): void {
  for (const id of Array.from(getPinnedProbePanels().keys())) {
    removePinnedProbe(id);
  }
}

export function prunePinnedProbes(validProbeIds: Set<string>): void {
  for (const id of Array.from(getPinnedProbePanels().keys())) {
    if (!validProbeIds.has(id)) {
      removePinnedProbe(id);
    }
  }
}
