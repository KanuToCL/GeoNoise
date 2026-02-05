/**
 * Engine backends public entry
 */

import type {
  ComputeRequest,
  ComputeResponse,
  ComputeReceiversRequest,
  ComputePanelRequest,
  ComputeGridRequest,
  Engine,
} from '@geonoise/engine';
import type { ComputePreference, ComputeTimings, ComputeWarning, BackendId } from '@geonoise/shared';

export { BackendRouter } from './router.js';
export { CPUWorkerBackend } from './cpuWorkerBackend.js';

/**
 * Create a default router and register available backends (CPU worker, optional WebGPU)
 */
let defaultRouter: Promise<import('./router.js').BackendRouter> | null = null;

interface WebGPUModule {
  WebGPUBackend: new () => Engine;
}

export async function createDefaultRouter(options?: { defaultPreference?: ComputePreference }) {
  const router = new (await import('./router.js')).BackendRouter(options);

  // Register CPU worker backend
  const { CPUWorkerBackend } = await import('./cpuWorkerBackend.js');
  const cpu = new CPUWorkerBackend();
  router.registerBackend({ id: cpu.getBackendId(), engine: cpu });

  // Try to register WebGPU backend if available (optional dynamic import)
  // Skip dynamic import during test runs to avoid requiring built dist files
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  if (!isTest) {
    try {
      // Dynamic import to avoid hard dependency if package is not present
      // Use eval to prevent static bundlers (vite) from resolving the import at build time
      // eslint-disable-next-line no-eval
      const mod = await eval("import('@geonoise/engine-webgpu')") as WebGPUModule | null;
      if (mod && mod.WebGPUBackend) {
        const gpu = new mod.WebGPUBackend();
        if (await gpu.isAvailable()) {
          router.registerBackend({ id: gpu.getBackendId(), engine: gpu });
        }
      }
    } catch (err) {
      // Ignore - optional backend
    }
  }

  return router;
}

/**
 * Get or create the default router singleton
 */
export async function getDefaultRouter() {
  if (!defaultRouter) defaultRouter = createDefaultRouter();
  return defaultRouter;
}

/**
 * Simple workload estimator for routing decisions
 */
function estimateWorkload(req: ComputeRequest) {
  if (req.kind === 'receivers') {
    const sources = req.scene.sources?.length ?? 0;
    const receivers = req.scene.receivers?.length ?? 0;
    return sources * receivers;
  }
  if (req.kind === 'panel') {
    return 1_000; // panel sampling might be heavy
  }
  if (req.kind === 'grid') {
    return 10_000;
  }
  return 0;
}

const requestSeqMap = new Map<string, number>();

/**
 * Top-level compute entrypoint used by UI and clients.
 * Returns the ComputeResponse augmented with backendId, timings and warnings.
 * If `requestId` is provided and a newer request with same id is issued, stale
 * responses will be rejected with an Error('stale').
 */
export async function engineCompute(
  req: ComputeRequest,
  preference?: ComputePreference,
  requestId?: string
): Promise<ComputeResponse> {
  const router = await getDefaultRouter();
  const workload = estimateWorkload(req);
  let chosen = router.chooseBackend(preference, workload);
  if (!chosen && preference === 'gpu') {
    // Fallback to CPU if GPU was forced but not available
    chosen = router.chooseBackend('cpu', workload) ?? router.chooseBackend('auto', workload);
  }
  if (!chosen) throw new Error('No backend available');

  const seq = requestId ? (requestSeqMap.get(requestId) ?? 0) + 1 : 0;
  if (requestId) requestSeqMap.set(requestId, seq);

  const start = Date.now();
  const requestWithId = requestId ? ({ ...req, requestId } as typeof req) : req;

  let response: ComputeResponse;
  if (requestWithId.kind === 'receivers') {
    response = await chosen.engine.computeReceivers(requestWithId as ComputeReceiversRequest);
  } else if (requestWithId.kind === 'panel') {
    response = await chosen.engine.computePanel(requestWithId as ComputePanelRequest);
  } else {
    response = await chosen.engine.computeGrid(requestWithId as ComputeGridRequest);
  }

  // Check for staleness
  if (requestId && requestSeqMap.get(requestId) !== seq) {
    throw new Error('stale');
  }

  const end = Date.now();

  // Ensure timings and warnings present
  const existingTimings = response.timings ?? ({} as ComputeTimings);
  const timings: ComputeTimings = { ...existingTimings, totalMs: end - start };
  const warnings: ComputeWarning[] = response.warnings ?? [];

  // Return with backend metadata
  const result: ComputeResponse = {
    ...response,
    backendId: chosen.id as BackendId,
    timings,
    warnings,
  };

  return result;
}
