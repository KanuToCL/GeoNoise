import { isWebGPUAvailable } from '@geonoise/engine-webgpu';

export type ComputePreference = 'auto' | 'cpu' | 'gpu';

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type CapabilityStatus = { ok: boolean; reason?: string };
export type ResolveResult = { effective: 'cpu' | 'gpu'; warning?: string };

const STORAGE_KEY = 'geonoise.computePreference';

export function loadPreference(storage: StorageLike = window.localStorage): ComputePreference {
  const stored = storage.getItem(STORAGE_KEY);
  if (stored === 'cpu' || stored === 'gpu' || stored === 'auto') return stored;
  return 'auto';
}

export function savePreference(preference: ComputePreference, storage: StorageLike = window.localStorage): void {
  storage.setItem(STORAGE_KEY, preference);
}

export function detectWebGPU(env?: { navigator?: { gpu?: unknown } }): CapabilityStatus {
  if (!env) {
    return isWebGPUAvailable();
  }
  if (env.navigator && (env.navigator as { gpu?: unknown }).gpu) {
    return { ok: true };
  }
  return { ok: false, reason: 'WebGPU not available on this device' };
}

export function resolveBackend(preference: ComputePreference, capability: CapabilityStatus): ResolveResult {
  if (preference === 'cpu') {
    return { effective: 'cpu' };
  }

  if (preference === 'gpu') {
    if (capability.ok) return { effective: 'gpu' };
    return { effective: 'cpu', warning: capability.reason ?? 'GPU unavailable' };
  }

  if (capability.ok) {
    return { effective: 'gpu' };
  }

  return { effective: 'cpu', warning: capability.reason };
}
