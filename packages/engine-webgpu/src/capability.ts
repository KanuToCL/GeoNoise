/**
 * WebGPU capability detection stub
 */

export function isWebGPUAvailable(): { ok: boolean; reason?: string } {
  if (typeof navigator !== 'undefined' && (navigator as any).gpu) {
    return { ok: true };
  }

  return { ok: false, reason: 'WebGPU not available in this environment' };
}
