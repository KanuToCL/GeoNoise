/**
 * Backend router selects an appropriate backend based on preference, capability, and workload
 */

import type { ComputePreference } from '@geonoise/shared';
import type { BackendEntry } from './types.js';

export class BackendRouter {
  private backends: BackendEntry[] = [];
  private defaultPreference: ComputePreference = 'auto';

  constructor(options?: { defaultPreference?: ComputePreference }) {
    if (options?.defaultPreference) this.defaultPreference = options.defaultPreference;
  }

  registerBackend(backend: BackendEntry): void {
    this.backends.push(backend);
  }

  unregisterBackend(id: BackendEntry['id']): void {
    this.backends = this.backends.filter((b) => b.id !== id);
  }

  /**
   * Choose backend by preference and simple heuristics
   */
  chooseBackend(preference: ComputePreference = this.defaultPreference, workloadSize = 0) {
    // If preference explicitly 'cpu' or 'gpu', try to respect it
    if (preference === 'cpu') {
      return this.backends.find((b) => b.id === 'cpu-worker' || b.id === 'cpu-main');
    }
    if (preference === 'gpu') {
      return this.backends.find((b) => b.id === 'webgpu');
    }

    // Auto: heuristics
    // Prefer GPU if available and workload is large
    const gpu = this.backends.find((b) => b.id === 'webgpu');
    if (gpu && workloadSize >= 1000) return gpu;

    // Otherwise prefer cpu-worker if available
    const cpuWorker = this.backends.find((b) => b.id === 'cpu-worker');
    if (cpuWorker) return cpuWorker;

    // Fallback to any CPU backend
    return this.backends.find((b) => b.id === 'cpu-main') || this.backends[0] || null;
  }
}