/**
 * Probe Worker - Real-time spectral analysis for probe positions
 * 
 * This worker calculates the 9-band frequency spectrum at a probe position
 * by summing contributions from all sources. It uses a simplified propagation
 * model (spherical spreading only) for fast interactive updates.
 * 
 * Spectral Source Migration (Jan 2026):
 * - Now uses actual source spectrum instead of stub calculation
 * - Returns full 9-band spectrum matching engine output format
 * - Applies source gain offset to each band
 */

import type { ProbeRequest, ProbeResult } from '@geonoise/engine';

// 9-band octave frequencies matching the source spectrum and engine output
const PROBE_BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/**
 * Calculate spherical spreading loss for point source
 * Adiv = 20*log10(r) + 11 dB (for r in meters)
 */
function calculateDivergence(distance: number): number {
  return 20 * Math.log10(Math.max(distance, 1)) + 11;
}

/**
 * Energetically sum multiple dB levels
 * L_total = 10*log10(sum(10^(Li/10)))
 */
function sumEnergies(levels: number[]): number {
  if (levels.length === 0) return -Infinity;
  const total = levels.reduce((sum, level) => sum + Math.pow(10, level / 10), 0);
  return 10 * Math.log10(total);
}

/**
 * Calculate the 9-band spectrum at a probe position
 * 
 * For each source:
 * 1. Calculate 3D distance to probe
 * 2. Apply spreading loss (same for all bands in this simplified model)
 * 3. Apply source gain offset
 * 4. Accumulate per-band energy
 * 
 * Note: This is a simplified model for fast interactive updates.
 * For accurate results, use the full engine computation.
 */
function calculateProbe(req: ProbeRequest): ProbeResult {
  const hasSources = req.sources.length > 0;
  
  // Per-band energy accumulation
  const bandEnergies = PROBE_BANDS.map(() => [] as number[]);
  
  if (hasSources) {
    for (const source of req.sources) {
      const dx = req.position.x - source.position.x;
      const dy = req.position.y - source.position.y;
      const dz = (req.position.z ?? 0) - (source.position.z ?? 0);
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const divLoss = calculateDivergence(dist);
      const gain = source.gain ?? 0;
      
      // Apply spectrum from source for each band
      PROBE_BANDS.forEach((_, bandIdx) => {
        // Use source spectrum if available, otherwise assume flat 100 dB
        const sourcePower = source.spectrum?.[bandIdx] ?? 100;
        const levelAtProbe = sourcePower + gain - divLoss;
        bandEnergies[bandIdx].push(levelAtProbe);
      });
    }
  }
  
  // Sum all contributions per band
  const magnitudes = bandEnergies.map((bandLevels) => {
    if (bandLevels.length === 0) return 35; // ambient floor
    return sumEnergies(bandLevels);
  });

  return {
    type: 'PROBE_UPDATE',
    probeId: req.probeId,
    data: {
      frequencies: PROBE_BANDS,
      magnitudes,
    },
  };
}

type ProbeWorkerScope = {
  postMessage: (message: ProbeResult) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<ProbeRequest>) => void) => void;
};

const workerContext = self as unknown as ProbeWorkerScope;

workerContext.addEventListener('message', (event) => {
  const req = event.data;
  if (!req || req.type !== 'CALCULATE_PROBE') return;
  const result = calculateProbe(req);
  workerContext.postMessage(result);
});
