/**
 * Panel Compute Module
 *
 * Functions for computing panel (measure grid) results from engine.
 * Extracted from main.ts for modular architecture.
 */

import { engineCompute } from '@geonoise/engine-backends';
import { MIN_LEVEL } from '@geonoise/shared';
import type { EngineConfig } from '@geonoise/core';
import type { ComputePanelResponse } from '@geonoise/engine';
import type { ComputePreference } from '../../computePreference.js';
import type { Panel } from '../../entities/index.js';
import type { PanelResult, SceneResults } from '../../export.js';
import { energyToDb } from '../../utils/index.js';
import { isStaleError, buildPanelPayload } from './scene.js';
import type { ComputeCallbacks, DragContribution } from './types.js';

// Import panel stats computation from results module
import { panelSamplesToEnergy, recomputePanelStats } from '../../results/index.js';

/**
 * Result of panel computation
 */
export interface ComputePanelResult {
  /** Updated panel result */
  panelResult: PanelResult;
  /** Energy values for samples */
  energies: Float64Array;
}

/**
 * Compute panel results from engine
 *
 * @param engineScene - Engine scene for computation
 * @param engineConfig - Engine configuration
 * @param preference - Compute preference (cpu/gpu)
 * @param panel - Panel to compute
 * @param callbacks - UI callbacks
 * @returns Computation result or null if stale
 */
export async function computePanel(
  engineScene: ReturnType<typeof import('./scene.js').buildEngineScene>,
  engineConfig: EngineConfig,
  preference: ComputePreference,
  panel: Panel,
  callbacks: Pick<ComputeCallbacks, 'showComputeError'>
): Promise<ComputePanelResult | null> {
  try {
    const response = (await engineCompute(
      {
        kind: 'panel',
        scene: engineScene,
        engineConfig,
        payload: buildPanelPayload(panel),
      },
      preference,
      `panel:${panel.id}`
    )) as ComputePanelResponse;

    const result = response.result;
    const panelResult: PanelResult = {
      panelId: String(result.panelId),
      sampleCount: result.sampleCount,
      LAeq_min: result.LAeq_min,
      LAeq_max: result.LAeq_max,
      LAeq_avg: result.LAeq_avg,
      LAeq_p25: MIN_LEVEL,
      LAeq_p50: MIN_LEVEL,
      LAeq_p75: MIN_LEVEL,
      LAeq_p95: result.LAeq_p95,
      samples: (result.samples ?? []).map((sample) => ({
        x: sample.x,
        y: sample.y,
        z: sample.z,
        LAeq: sample.LAeq,
      })),
    };

    recomputePanelStats(panelResult);
    const energies = panelSamplesToEnergy(panelResult.samples);

    return { panelResult, energies };
  } catch (error) {
    if (isStaleError(error)) return null;
    callbacks.showComputeError(`Panel ${panel.id}`, error);
    return null;
  }
}

/**
 * Compute panel energies for incremental update
 *
 * Used during drag operations to get single-source contribution.
 *
 * @param engineScene - Engine scene (single source)
 * @param engineConfig - Engine configuration
 * @param preference - Compute preference
 * @param sourceId - ID of source being computed
 * @param panel - Panel to compute
 * @param callbacks - UI callbacks
 * @returns Energy array or null if stale
 */
export async function computePanelEnergies(
  engineScene: ReturnType<typeof import('./scene.js').buildEngineScene>,
  engineConfig: EngineConfig,
  preference: ComputePreference,
  sourceId: string,
  panel: Panel,
  callbacks: Pick<ComputeCallbacks, 'showComputeError'>
): Promise<Float64Array | null> {
  try {
    const response = (await engineCompute(
      { kind: 'panel', scene: engineScene, payload: buildPanelPayload(panel), engineConfig },
      preference,
      `drag:${sourceId}:panel:${panel.id}`
    )) as ComputePanelResponse;

    return panelSamplesToEnergy(response.result.samples ?? []);
  } catch (error) {
    if (isStaleError(error)) return null;
    callbacks.showComputeError(`Panel ${panel.id}`, error);
    return null;
  }
}

/**
 * Apply panel energy delta for incremental update
 *
 * Updates panel results by replacing old source contribution with new.
 *
 * @param results - Scene results containing panels
 * @param sourceId - ID of source being updated
 * @param panelIdValue - ID of panel to update
 * @param newEnergies - New energy values from source
 * @param dragContribution - Current drag contribution state
 * @param panelEnergyTotals - Current energy totals
 * @returns true if update was applied
 */
export function applyPanelDelta(
  results: SceneResults,
  sourceId: string,
  panelIdValue: string,
  newEnergies: Float64Array,
  dragContribution: DragContribution | null,
  panelEnergyTotals: Map<string, Float64Array>
): boolean {
  if (!dragContribution || dragContribution.sourceId !== sourceId) return false;

  const previous = dragContribution.panelEnergy.get(panelIdValue);
  const panelResult = results.panels.find((panel) => panel.panelId === panelIdValue);
  if (!previous || !panelResult) return false;

  let totals = panelEnergyTotals.get(panelIdValue);
  if (!totals) {
    totals = panelSamplesToEnergy(panelResult.samples);
    panelEnergyTotals.set(panelIdValue, totals);
  }

  if (
    totals.length !== newEnergies.length ||
    previous.length !== newEnergies.length ||
    panelResult.samples.length !== newEnergies.length
  ) {
    return false;
  }

  for (let i = 0; i < newEnergies.length; i += 1) {
    const combined = totals[i] + newEnergies[i] - previous[i];
    totals[i] = combined;
    panelResult.samples[i].LAeq = energyToDb(combined);
    previous[i] = newEnergies[i];
  }

  recomputePanelStats(panelResult);
  return true;
}

/**
 * Update panel result in results array
 *
 * @param results - Scene results to update
 * @param panelResult - Panel result to add/update
 * @param panelEnergyTotals - Energy totals to update
 */
export function updatePanelResult(
  results: SceneResults,
  panelResult: PanelResult,
  panelEnergyTotals: Map<string, Float64Array>
): void {
  const idx = results.panels.findIndex((panel) => panel.panelId === panelResult.panelId);
  if (idx >= 0) {
    results.panels[idx] = panelResult;
  } else {
    results.panels.push(panelResult);
  }
  panelEnergyTotals.set(panelResult.panelId, panelSamplesToEnergy(panelResult.samples));
}
