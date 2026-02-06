/**
 * Ray Visualization
 *
 * Renders traced ray paths on the canvas for acoustic path analysis.
 */

import type { TracedPath } from '@geonoise/engine';
import type { Point } from '../types/index.js';

// === Ray State ===

/** Current traced paths for canvas rendering */
let currentTracedPaths: TracedPath[] | null = null;

export function getCurrentTracedPaths(): TracedPath[] | null {
  return currentTracedPaths;
}

export function setCurrentTracedPaths(paths: TracedPath[] | null): void {
  currentTracedPaths = paths;
}

export function clearTracedPaths(): void {
  currentTracedPaths = null;
}

// === Path Type Labels ===

const pathIcons: Record<string, string> = {
  direct: '━━━',
  ground: '┅┅┅',
  wall: '•••',
  diffraction: '━•━',
};

const pathLabels: Record<string, string> = {
  direct: 'Direct',
  ground: 'Ground Bounce',
  wall: 'Wall Reflection',
  diffraction: 'Diffraction',
};

export function getPathIcon(type: string): string {
  return pathIcons[type] ?? '---';
}

export function getPathLabel(type: string): string {
  return pathLabels[type] ?? type;
}

// === Ray Visualization Panel ===

export interface RayVizElements {
  card: HTMLElement | null;
  toggle: HTMLInputElement | null;
  paths: HTMLElement | null;
  phaseInfo: HTMLElement | null;
  dominant: HTMLElement | null;
}

export interface RayVizData {
  tracedPaths?: TracedPath[];
  phaseRelationships?: Array<{
    path1Type: string;
    path2Type: string;
    phaseDelta_deg: number;
    isConstructive: boolean;
  }>;
}

/** Render the ray visualization panel content */
export function renderRayVisualizationPanel(
  elements: RayVizElements,
  data: RayVizData | null,
  requestRender: () => void
): void {
  const { card, toggle, paths: rayVizPaths, phaseInfo: rayVizPhaseInfo, dominant: rayVizDominant } = elements;

  if (!rayVizPaths || !rayVizPhaseInfo || !rayVizDominant) return;

  // Update card active state based on toggle
  if (card) {
    card.classList.toggle('is-active', toggle?.checked ?? false);
  }

  if (!data || !toggle?.checked) {
    rayVizPaths.innerHTML = '';
    rayVizPhaseInfo.innerHTML = '';
    rayVizDominant.innerHTML = '';
    currentTracedPaths = null;
    requestRender();
    return;
  }

  const paths = data.tracedPaths ?? [];
  const phaseRels = data.phaseRelationships ?? [];

  // Store for canvas rendering
  currentTracedPaths = paths.length > 0 ? paths : null;

  if (paths.length === 0) {
    rayVizPaths.innerHTML = '<div class="ray-viz-empty">No traced paths available</div>';
    rayVizPhaseInfo.innerHTML = '';
    rayVizDominant.innerHTML = '';
    requestRender();
    return;
  }

  // Find max level for normalization
  const maxLevel = Math.max(...paths.map(p => p.level_dB));
  const minLevel = maxLevel - 40; // 40 dB range

  // Render path rows
  rayVizPaths.innerHTML = paths.map(path => {
    const barPercent = Math.max(0, Math.min(100, ((path.level_dB - minLevel) / 40) * 100));
    return `
      <div class="ray-viz-path-row">
        <span class="ray-viz-path-icon">${getPathIcon(path.type)}</span>
        <span class="ray-viz-path-type">${getPathLabel(path.type)}</span>
        <span class="ray-viz-path-level">${path.level_dB.toFixed(1)} dB</span>
        <div class="ray-viz-path-bar">
          <div class="ray-viz-path-bar-fill" style="width: ${barPercent}%"></div>
        </div>
      </div>
    `;
  }).join('');

  // Render phase relationships
  if (phaseRels.length > 0) {
    rayVizPhaseInfo.innerHTML = phaseRels.slice(0, 4).map(rel => {
      const indicator = rel.isConstructive ? '🔵' : '🔴';
      const indicatorClass = rel.isConstructive ? 'constructive' : 'destructive';
      const label = rel.isConstructive ? 'Constructive' : 'Destructive';
      return `
        <div class="ray-viz-phase-row">
          <span class="ray-viz-phase-indicator ${indicatorClass}">${indicator}</span>
          <span class="ray-viz-phase-text">${label}: ${getPathLabel(rel.path1Type)} + ${getPathLabel(rel.path2Type)}</span>
          <span class="ray-viz-phase-delta">(Δφ=${rel.phaseDelta_deg.toFixed(0)}°)</span>
        </div>
      `;
    }).join('');
  } else {
    rayVizPhaseInfo.innerHTML = '';
  }

  // Render dominant path
  if (paths.length > 0) {
    const dominant = paths.reduce((a, b) => a.level_dB > b.level_dB ? a : b);
    rayVizDominant.innerHTML = `Dominant: ${getPathLabel(dominant.type)} (${dominant.level_dB.toFixed(1)} dB)`;
  } else {
    rayVizDominant.innerHTML = '';
  }

  requestRender();
}

/** Disable ray visualization toggle (called on scene changes) */
export function disableRayVisualization(elements: RayVizElements, requestRender: () => void): void {
  const { toggle, card, paths: rayVizPaths, phaseInfo: rayVizPhaseInfo, dominant: rayVizDominant } = elements;

  if (toggle && toggle.checked) {
    toggle.checked = false;
    if (card) {
      card.classList.remove('is-active');
    }
    currentTracedPaths = null;
    if (rayVizPaths) rayVizPaths.innerHTML = '';
    if (rayVizPhaseInfo) rayVizPhaseInfo.innerHTML = '';
    if (rayVizDominant) rayVizDominant.innerHTML = '';
    requestRender();
  }
}

// === Canvas Ray Drawing ===

export type WorldToCanvas = (point: Point) => Point;

/** Draw traced rays on the map canvas */
export function drawTracedRays(
  ctx: CanvasRenderingContext2D,
  worldToCanvas: WorldToCanvas
): void {
  if (!currentTracedPaths || currentTracedPaths.length === 0) return;

  // Find max level for opacity calculation
  const maxLevel = Math.max(...currentTracedPaths.map(p => p.level_dB));

  for (const path of currentTracedPaths) {
    if (path.points.length < 2) continue;

    // Calculate opacity based on relative level (brighter = louder)
    const relativeLevel = path.level_dB - maxLevel;
    const opacity = Math.max(0.3, 1 + relativeLevel / 40);

    // Set line style based on path type
    ctx.save();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (path.type) {
      case 'direct':
        ctx.strokeStyle = `rgba(45, 140, 255, ${opacity})`;
        ctx.setLineDash([]);
        break;
      case 'ground':
        ctx.strokeStyle = `rgba(76, 175, 80, ${opacity})`;
        ctx.setLineDash([6, 4]);
        break;
      case 'wall':
        ctx.strokeStyle = `rgba(255, 152, 0, ${opacity})`;
        ctx.setLineDash([2, 3]);
        break;
      case 'diffraction':
        ctx.strokeStyle = `rgba(156, 39, 176, ${opacity})`;
        ctx.setLineDash([8, 3, 2, 3]);
        break;
      default:
        ctx.strokeStyle = `rgba(100, 100, 100, ${opacity})`;
        ctx.setLineDash([]);
    }

    // Draw the path
    ctx.beginPath();
    const firstPoint = worldToCanvas(path.points[0]);
    ctx.moveTo(firstPoint.x, firstPoint.y);

    for (let i = 1; i < path.points.length; i++) {
      const point = worldToCanvas(path.points[i]);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();

    // Draw reflection/diffraction point marker if present
    const markerPoint = path.reflectionPoint ?? path.diffractionEdge;
    if (markerPoint) {
      const mp = worldToCanvas(markerPoint);
      ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
