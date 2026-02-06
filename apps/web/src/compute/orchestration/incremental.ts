/**
 * Incremental Compute Module
 *
 * Functions for incremental computation during drag operations.
 * Uses energy-domain math to avoid full scene recomputation.
 * Extracted from main.ts for modular architecture.
 */

import type { EngineConfig } from '@geonoise/core';
import type { ComputePreference } from '../../computePreference.js';
import type { Panel } from '../../entities/index.js';
import type { SceneResults } from '../../export.js';
import type { DragContribution, ComputeCallbacks, BuildEngineSceneConfig } from './types.js';
import { buildSingleSourceScene } from './scene.js';
import { computeReceiverEnergies, applyReceiverDelta } from './receivers.js';
import { computePanelEnergies, applyPanelDelta } from './panels.js';

/**
 * Create a new drag contribution for a source
 *
 * @param sourceId - ID of source being dragged
 * @returns New drag contribution object
 */
export function createDragContribution(sourceId: string): DragContribution {
  return {
    sourceId,
    receiverEnergy: new Map(),
    panelEnergy: new Map(),
  };
}

/**
 * Check if receiver baseline is ready for incremental updates
 *
 * @param dragContribution - Current drag contribution
 * @param sourceId - Source being checked
 * @param receiverCount - Number of receivers in scene
 * @returns true if baseline is ready
 */
export function receiverBaselineReady(
  dragContribution: DragContribution | null,
  sourceId: string,
  receiverCount: number
): boolean {
  if (!dragContribution || dragContribution.sourceId !== sourceId) return false;
  if (receiverCount === 0) return true;
  return dragContribution.receiverEnergy.size >= receiverCount;
}

/**
 * Check if panel baseline is ready for incremental updates
 *
 * @param dragContribution - Current drag contribution
 * @param sourceId - Source being checked
 * @param panelId - Panel being checked
 * @returns true if baseline is ready
 */
export function panelBaselineReady(
  dragContribution: DragContribution | null,
  sourceId: string,
  panelId: string
): boolean {
  if (!dragContribution || dragContribution.sourceId !== sourceId) return false;
  return dragContribution.panelEnergy.has(panelId);
}

/**
 * Prime receiver contribution for a source
 *
 * Computes and caches the energy contribution from a single source
 * to all receivers, enabling incremental updates during drag.
 *
 * @param config - Build config
 * @param engineConfig - Engine configuration
 * @param preference - Compute preference
 * @param sourceId - Source to prime
 * @param dragContribution - Drag contribution to update
 * @param callbacks - UI callbacks
 */
export async function primeReceiverContribution(
  config: BuildEngineSceneConfig,
  engineConfig: EngineConfig,
  preference: ComputePreference,
  sourceId: string,
  dragContribution: DragContribution,
  callbacks: Pick<ComputeCallbacks, 'showComputeError'>
): Promise<void> {
  const engineScene = buildSingleSourceScene(config, sourceId);
  const energies = await computeReceiverEnergies(
    engineScene,
    engineConfig,
    preference,
    sourceId,
    callbacks
  );

  if (energies && dragContribution.sourceId === sourceId) {
    dragContribution.receiverEnergy = energies;
  }
}

/**
 * Prime panel contribution for a source
 *
 * Computes and caches the energy contribution from a single source
 * to a panel, enabling incremental updates during drag.
 *
 * @param config - Build config
 * @param engineConfig - Engine configuration
 * @param preference - Compute preference
 * @param sourceId - Source to prime
 * @param panel - Panel to prime
 * @param dragContribution - Drag contribution to update
 * @param callbacks - UI callbacks
 */
export async function primePanelContribution(
  config: BuildEngineSceneConfig,
  engineConfig: EngineConfig,
  preference: ComputePreference,
  sourceId: string,
  panel: Panel,
  dragContribution: DragContribution,
  callbacks: Pick<ComputeCallbacks, 'showComputeError'>
): Promise<void> {
  const engineScene = buildSingleSourceScene(config, sourceId);
  const energies = await computePanelEnergies(
    engineScene,
    engineConfig,
    preference,
    sourceId,
    panel,
    callbacks
  );

  if (energies && dragContribution.sourceId === sourceId) {
    dragContribution.panelEnergy.set(panel.id, energies);
  }
}

/**
 * Compute receivers incrementally during drag
 *
 * @param config - Build config
 * @param engineConfig - Engine configuration
 * @param preference - Compute preference
 * @param sourceId - Source being dragged
 * @param results - Scene results to update
 * @param dragContribution - Current drag contribution
 * @param receiverEnergyTotals - Current energy totals
 * @param callbacks - UI callbacks
 * @returns true if update was applied
 */
export async function computeReceiversIncremental(
  config: BuildEngineSceneConfig,
  engineConfig: EngineConfig,
  preference: ComputePreference,
  sourceId: string,
  results: SceneResults,
  dragContribution: DragContribution | null,
  receiverEnergyTotals: Map<string, number>,
  callbacks: Pick<ComputeCallbacks, 'updateStatus' | 'showComputeError' | 'renderResults' | 'requestRender'>
): Promise<boolean> {
  if (!receiverBaselineReady(dragContribution, sourceId, results.receivers.length)) {
    return false;
  }

  const engineScene = buildSingleSourceScene(config, sourceId);
  const energies = await computeReceiverEnergies(
    engineScene,
    engineConfig,
    preference,
    sourceId,
    callbacks
  );

  if (!energies) return false;

  if (applyReceiverDelta(results, sourceId, energies, dragContribution, receiverEnergyTotals)) {
    callbacks.renderResults();
    callbacks.requestRender();
    return true;
  }

  return false;
}

/**
 * Compute panel incrementally during drag
 *
 * @param config - Build config
 * @param engineConfig - Engine configuration
 * @param preference - Compute preference
 * @param sourceId - Source being dragged
 * @param panel - Panel to update
 * @param results - Scene results to update
 * @param dragContribution - Current drag contribution
 * @param panelEnergyTotals - Current energy totals
 * @param callbacks - UI callbacks
 * @returns true if update was applied
 */
export async function computePanelIncremental(
  config: BuildEngineSceneConfig,
  engineConfig: EngineConfig,
  preference: ComputePreference,
  sourceId: string,
  panel: Panel,
  results: SceneResults,
  dragContribution: DragContribution | null,
  panelEnergyTotals: Map<string, Float64Array>,
  callbacks: Pick<ComputeCallbacks, 'showComputeError' | 'renderResults' | 'requestRender'>
): Promise<boolean> {
  if (!panelBaselineReady(dragContribution, sourceId, panel.id)) {
    return false;
  }

  const engineScene = buildSingleSourceScene(config, sourceId);
  const energies = await computePanelEnergies(
    engineScene,
    engineConfig,
    preference,
    sourceId,
    panel,
    callbacks
  );

  if (!energies) return false;

  if (applyPanelDelta(results, sourceId, panel.id, energies, dragContribution, panelEnergyTotals)) {
    callbacks.renderResults();
    callbacks.requestRender();
    return true;
  }

  return false;
}
