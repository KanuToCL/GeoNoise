/**
 * WebGPU capability detection stub
 */

const WEBGPU_BACKEND_IMPLEMENTED = false;

interface NavigatorWithGPU extends Navigator {
  gpu?: unknown;
}

export function isWebGPUAvailable(): { ok: boolean; reason?: string } {
  if (!WEBGPU_BACKEND_IMPLEMENTED) {
    return { ok: false, reason: 'WebGPU backend not implemented yet' };
  }

  if (typeof navigator !== 'undefined' && (navigator as NavigatorWithGPU).gpu) {
    return { ok: true };
  }

  return { ok: false, reason: 'WebGPU not available in this environment' };
}
