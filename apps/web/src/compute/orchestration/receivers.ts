/**
 * Receiver Compute Module
 *
 * Functions for computing receiver results from engine.
 * Extracted from main.ts for modular architecture.
 */

import { engineCompute } from '@geonoise/engine-backends';
import type { EngineConfig } from '@geonoise/core';
import type { ComputeReceiversResponse } from '@geonoise/engine';
import type { ComputePreference } from '../../computePreference.js';
import type { Receiver } from '../../entities/index.js';
import type { SceneResults, ReceiverResult } from '../../export.js';
import { dbToEnergy, energyToDb } from '../../utils/index.js';
import { isStaleError } from './scene.js';
import type { ComputeCallbacks, DragContribution } from './types.js';

/**
 * Result of receiver computation
 */
export interface ComputeReceiversResult {
  /** Updated receiver results */
  receivers: ReceiverResult[];
  /** Per-receiver energy totals */
  energyTotals: Map<string, number>;
  /** Response metadata */
  response: ComputeReceiversResponse;
}

/**
 * Compute receiver results from engine
 *
 * @param engineScene - Engine scene for computation
 * @param engineConfig - Engine configuration
 * @param preference - Compute preference (cpu/gpu)
 * @param sceneReceivers - UI receivers for position data
 * @param callbacks - UI callbacks
 * @returns Computation result or null if stale
 */
export async function computeReceivers(
  engineScene: ReturnType<typeof import('./scene.js').buildEngineScene>,
  engineConfig: EngineConfig,
  preference: ComputePreference,
  sceneReceivers: Receiver[],
  callbacks: Pick<ComputeCallbacks, 'updateStatus' | 'showComputeError'>
): Promise<ComputeReceiversResult | null> {
  try {
    const response = (await engineCompute(
      { kind: 'receivers', scene: engineScene, payload: {}, engineConfig },
      preference,
      'receivers'
    )) as ComputeReceiversResponse;

    const receiverMap = new Map(sceneReceivers.map((receiver) => [receiver.id, receiver]));
    const receivers: ReceiverResult[] = response.results.map((result) => {
      const receiver = receiverMap.get(String(result.receiverId));
      return {
        id: receiver?.id ?? String(result.receiverId),
        x: receiver?.x ?? 0,
        y: receiver?.y ?? 0,
        z: receiver?.z ?? 0,
        LAeq: result.LAeq,
        LCeq: result.LCeq,
        LZeq: result.LZeq,
        Leq_spectrum: result.Leq_spectrum,
      };
    });

    const energyTotals = new Map(receivers.map((receiver) => [receiver.id, dbToEnergy(receiver.LAeq)]));
    callbacks.updateStatus(response);

    return { receivers, energyTotals, response };
  } catch (error) {
    if (isStaleError(error)) return null;
    callbacks.showComputeError('Receivers', error);
    return null;
  }
}

/**
 * Compute receiver energies for incremental update
 *
 * Used during drag operations to get single-source contribution.
 *
 * @param engineScene - Engine scene (single source)
 * @param engineConfig - Engine configuration
 * @param preference - Compute preference
 * @param sourceId - ID of source being computed
 * @param callbacks - UI callbacks
 * @returns Map of receiver ID to energy, or null if stale
 */
export async function computeReceiverEnergies(
  engineScene: ReturnType<typeof import('./scene.js').buildEngineScene>,
  engineConfig: EngineConfig,
  preference: ComputePreference,
  sourceId: string,
  callbacks: Pick<ComputeCallbacks, 'showComputeError'>
): Promise<Map<string, number> | null> {
  try {
    const response = (await engineCompute(
      { kind: 'receivers', scene: engineScene, payload: {}, engineConfig },
      preference,
      `drag:${sourceId}:receivers`
    )) as ComputeReceiversResponse;

    const energies = new Map<string, number>();
    for (const result of response.results) {
      energies.set(String(result.receiverId), dbToEnergy(result.LAeq));
    }

    return energies;
  } catch (error) {
    if (isStaleError(error)) return null;
    callbacks.showComputeError('Receivers', error);
    return null;
  }
}

/**
 * Apply receiver energy delta for incremental update
 *
 * Updates receiver results by replacing old source contribution with new.
 *
 * @param results - Scene results to update
 * @param sourceId - ID of source being updated
 * @param newEnergies - New energy values from source
 * @param dragContribution - Current drag contribution state
 * @param receiverEnergyTotals - Current energy totals
 * @returns true if update was applied
 */
export function applyReceiverDelta(
  results: SceneResults,
  sourceId: string,
  newEnergies: Map<string, number>,
  dragContribution: DragContribution | null,
  receiverEnergyTotals: Map<string, number>
): boolean {
  if (!dragContribution || dragContribution.sourceId !== sourceId) return false;

  for (const receiver of results.receivers) {
    const id = receiver.id;
    const totalEnergy = receiverEnergyTotals.get(id) ?? dbToEnergy(receiver.LAeq);
    const previousEnergy = dragContribution.receiverEnergy.get(id) ?? 0;
    const nextEnergy = newEnergies.get(id) ?? 0;
    const combined = totalEnergy + nextEnergy - previousEnergy;
    receiverEnergyTotals.set(id, combined);
    receiver.LAeq = energyToDb(combined);
    dragContribution.receiverEnergy.set(id, nextEnergy);
  }

  return true;
}
