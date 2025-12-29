/**
 * CPU worker backend: wrapper around the reference CPU engine that simulates a worker process.
 * For Phase 0 this will delegate to the CPU engine directly but expose worker-like API.
 */

import type { Engine } from '@geonoise/engine';
import type { EngineCapabilities } from '@geonoise/engine';
import { CPUEngine } from '@geonoise/engine';

export class CPUWorkerBackend implements Engine {
  private engine: Engine;
  private id: 'cpu-worker' = 'cpu-worker';

  constructor(opts?: { threadCount?: number }) {
    // In Phase 0 we keep it simple and reuse the main CPU implementation
    this.engine = new CPUEngine();
  }

  getBackendId() { return this.id; }
  async isAvailable() { return true; }
  getCapabilities(): EngineCapabilities { return this.engine.getCapabilities(); }
  dispose() { this.engine.dispose(); }

  computeReceivers(request) { return this.engine.computeReceivers(request); }
  computePanel(request) { return this.engine.computePanel(request); }
  computeGrid(request) { return this.engine.computeGrid(request); }
}
