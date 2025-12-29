/**
 * Engine backends public entry
 */

export { BackendRouter } from './router.js';
export { CPUWorkerBackend } from './cpuWorkerBackend.js';

/**
 * Create a default router and register available backends (CPU worker, optional WebGPU)
 */
export async function createDefaultRouter(options?: { defaultPreference?: import('@geonoise/shared').ComputePreference }) {
  const router = new (await import('./router.js')).BackendRouter(options);

  // Register CPU worker backend
  const { CPUWorkerBackend } = await import('./cpuWorkerBackend.js');
  const cpu = new CPUWorkerBackend();
  router.registerBackend({ id: cpu.getBackendId(), engine: cpu });

  // Try to register WebGPU backend if available (optional dynamic import)
  try {
    // Dynamic import to avoid hard dependency if package is not present
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = await import('@geonoise/engine-webgpu');
    if (mod && mod.WebGPUBackend) {
      const gpu = new mod.WebGPUBackend();
      if (await gpu.isAvailable()) {
        router.registerBackend({ id: gpu.getBackendId(), engine: gpu });
      }
    }
  } catch (err) {
    // Ignore - optional backend
  }

  return router;
}
