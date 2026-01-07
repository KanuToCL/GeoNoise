/**
 * Engine backends public entry
 */

export { BackendRouter } from './router.js';
export { CPUWorkerBackend } from './cpuWorkerBackend.js';

/**
 * Create a default router and register available backends (CPU worker, optional WebGPU)
 */
let defaultRouter: Promise<import('./router.js').BackendRouter> | null = null;

export async function createDefaultRouter(options?: { defaultPreference?: import('@geonoise/shared').ComputePreference }) {
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
      const mod = await eval("import('@geonoise/engine-webgpu')");
      if (mod && (mod as any).WebGPUBackend) {
        const gpu = new (mod as any).WebGPUBackend();
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
function estimateWorkload(req: import('@geonoise/engine').ComputeRequest) {
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
  req: import('@geonoise/engine').ComputeRequest,
  preference?: import('@geonoise/shared').ComputePreference,
  requestId?: string
): Promise<import('@geonoise/engine').ComputeResponse> {
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

  let response: import('@geonoise/engine').ComputeResponse;
  if (requestWithId.kind === 'receivers') {
    response = await chosen.engine.computeReceivers(requestWithId as any);
  } else if (requestWithId.kind === 'panel') {
    response = await chosen.engine.computePanel(requestWithId as any);
  } else {
    response = await chosen.engine.computeGrid(requestWithId as any);
  }

  // Check for staleness
  if (requestId && requestSeqMap.get(requestId) !== seq) {
    throw new Error('stale');
  }

  const end = Date.now();

  // Ensure timings and warnings present
  const existingTimings = (response as any).timings ?? {};
  const timings = { ...existingTimings, totalMs: end - start } as import('@geonoise/shared').ComputeTimings;
  const warnings = (response as any).warnings ?? [];

  // Attach backend metadata
  (response as any).backendId = chosen.id;
  (response as any).timings = timings;
  (response as any).warnings = warnings;

  return response;
}
