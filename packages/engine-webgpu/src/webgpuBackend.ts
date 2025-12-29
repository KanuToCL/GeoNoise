/**
 * WebGPU backend stub - implements Engine interface but returns NotImplemented warnings for now
 */

import type { Engine } from '@geonoise/engine';
import type { EngineCapabilities } from '@geonoise/engine';
import { isWebGPUAvailable } from './capability.js';

export class WebGPUBackend implements Engine {
  private id: 'webgpu' = 'webgpu';
  private available = false;

  constructor() {
    const cap = isWebGPUAvailable();
    this.available = cap.ok;
  }

  getBackendId() { return this.id; }
  async isAvailable() { return this.available; }
  getCapabilities(): EngineCapabilities {
    return { maxReceivers: 1000000, maxSources: 10000, maxGridPoints: 10000000, supportsGPU: true, supportsBandedCalculation: false, supportsBarriers: false };
  }
  dispose() {}

  async computeReceivers(_request: any): Promise<any> { throw new Error('WebGPU backend not implemented'); }
  async computePanel(_request: any): Promise<any> { throw new Error('WebGPU backend not implemented'); }
  async computeGrid(_request: any): Promise<any> { throw new Error('WebGPU backend not implemented'); }
}
