/**
 * Probe Inspector
 *
 * The main probe inspector panel that shows the active probe's frequency response.
 */

import type { Probe } from '../entities/index.js';
import type { FrequencyWeighting } from '@geonoise/shared';
import type { ProbeResult } from '@geonoise/engine';
import {
  getActiveProbeId,
  setActiveProbeId,
  getProbeResult,
  hasPinnedProbePanel,
} from './types.js';
import { getProbeStatusLabel } from './pinning.js';
import { renderProbeChartOn, resizeProbeCanvas, type ReadCssVar } from './chart.js';
import { renderRayVisualizationPanel, type RayVizElements } from './rays.js';
import { bringPanelToFront } from './panels.js';

// === Inspector Elements ===

export interface ProbeInspectorElements {
  panel: HTMLElement | null;
  title: HTMLElement | null;
  close: HTMLButtonElement | null;
  freeze: HTMLButtonElement | null;
  pin: HTMLButtonElement | null;
  status: HTMLElement | null;
  chart: HTMLCanvasElement | null;
  chartCtx: CanvasRenderingContext2D | null;
}

// === Active Probe Management ===

export function setActiveProbe(
  nextId: string | null,
  getProbeById: (id: string) => Probe | null,
  requestProbeUpdate: (probeId: string, options?: { immediate?: boolean }) => void,
  renderProbeInspector: () => void,
  requestRender: () => void
): void {
  const probes = nextId ? getProbeById(nextId) : null;
  const resolved = probes ? nextId : null;
  const currentId = getActiveProbeId();
  const didChange = resolved !== currentId;
  setActiveProbeId(resolved);
  renderProbeInspector();
  if (resolved && didChange) {
    requestProbeUpdate(resolved, { immediate: true });
  }
  requestRender();
}

export function getActiveProbe(getProbeById: (id: string) => Probe | null): Probe | null {
  const activeId = getActiveProbeId();
  if (!activeId) return null;
  return getProbeById(activeId);
}

// === Inspector Rendering ===

export interface RenderProbeInspectorOptions {
  elements: ProbeInspectorElements;
  rayVizElements: RayVizElements;
  getProbeById: (id: string) => Probe | null;
  displayWeighting: FrequencyWeighting;
  readCssVar: ReadCssVar;
  requestRender: () => void;
}

export function renderProbeInspector(options: RenderProbeInspectorOptions): void {
  const { elements, rayVizElements, getProbeById, displayWeighting, readCssVar, requestRender } = options;
  const { panel, title, freeze, pin, status, chart, chartCtx } = elements;

  if (!panel) return;

  const activeId = getActiveProbeId();
  const probe = activeId ? getProbeById(activeId) : null;
  const isPinned = probe ? hasPinnedProbePanel(probe.id) : false;

  // Hide the inspector if its probe is now showing as a pinned monitor.
  const isOpen = !!probe && !isPinned;
  panel.classList.toggle('is-open', isOpen);
  panel.classList.toggle('probe-panel--active', isOpen);
  panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

  // Bring probe panel to front when opening so it appears above pinned panels
  if (isOpen) {
    bringPanelToFront(panel);
  }

  if (pin) {
    const pinActive = !!probe && hasPinnedProbePanel(probe.id);
    pin.disabled = !probe;
    pin.classList.toggle('is-active', pinActive);
    pin.setAttribute('aria-pressed', pinActive ? 'true' : 'false');
    pin.title = probe ? (pinActive ? 'Unpin monitoring window' : 'Pin monitoring window') : 'Pin monitoring window';
  }

  if (!probe || isPinned) {
    if (freeze) {
      freeze.disabled = true;
      freeze.title = 'Freeze probe snapshot';
    }
    return;
  }

  if (title) {
    const defaultName = `Probe ${probe.id.toUpperCase()}`;
    title.textContent = probe.name || defaultName;
  }

  if (status) {
    status.textContent = getProbeStatusLabel(probe.id);
  }

  if (freeze) {
    const hasData = !!getProbeResult(probe.id);
    freeze.disabled = !hasData;
    freeze.title = hasData ? 'Freeze probe snapshot' : 'Probe data not ready yet';
  }

  if (chart && chartCtx) {
    renderProbeChartOn(chart, chartCtx, getProbeResult(probe.id) ?? null, displayWeighting, readCssVar);
  }

  // Render ray visualization panel
  const probeData = getProbeResult(probe.id);
  renderRayVisualizationPanel(rayVizElements, probeData ?? null, requestRender);
}

// === Chart Resize ===

export function resizeProbeChart(
  chart: HTMLCanvasElement | null,
  chartCtx: CanvasRenderingContext2D | null
): void {
  if (!chart || !chartCtx) return;
  resizeProbeCanvas(chart, chartCtx);
}

// === Render Chart Only ===

export function renderProbeChart(
  chart: HTMLCanvasElement | null,
  chartCtx: CanvasRenderingContext2D | null,
  data: ProbeResult['data'] | null,
  displayWeighting: FrequencyWeighting,
  readCssVar: ReadCssVar
): void {
  if (!chart || !chartCtx) return;
  renderProbeChartOn(chart, chartCtx, data, displayWeighting, readCssVar);
}

// === Get Live Probe IDs ===

/** Get probe IDs that should receive live updates (active + pinned) */
export function getLiveProbeIds(): string[] {
  const ids = new Set<string>();
  const activeId = getActiveProbeId();
  if (activeId) {
    ids.add(activeId);
  }
  // Note: Pinned panels are tracked separately in pinning.ts
  // The caller should add pinned IDs
  return Array.from(ids);
}
