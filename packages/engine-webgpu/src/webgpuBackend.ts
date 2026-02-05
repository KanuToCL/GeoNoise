/**
 * WebGPU backend stub - implements Engine interface but returns NotImplemented warnings for now
 */

import type {
  Engine,
  EngineCapabilities,
  ComputeReceiversRequest,
  ComputeReceiversResponse,
  ComputePanelRequest,
  ComputePanelResponse,
  ComputeGridRequest,
  ComputeGridResponse,
} from '@geonoise/engine';
import { isWebGPUAvailable } from './capability.js';

export class WebGPUBackend implements Engine {
  private id = 'webgpu' as const;
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

  async computeReceivers(_request: ComputeReceiversRequest): Promise<ComputeReceiversResponse> { throw new Error('WebGPU backend not implemented'); }
  async computePanel(_request: ComputePanelRequest): Promise<ComputePanelResponse> { throw new Error('WebGPU backend not implemented'); }
  async computeGrid(_request: ComputeGridRequest): Promise<ComputeGridResponse> { throw new Error('WebGPU backend not implemented'); }
}
