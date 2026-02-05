/**
 * CPU worker backend: wrapper around the reference CPU engine that simulates a worker process.
 * For Phase 0 this will delegate to the CPU engine directly but expose worker-like API.
 */

import type {
  Engine,
  EngineCapabilities,
  ComputeRequest,
  ComputeResponse,
  ComputeReceiversRequest,
  ComputeReceiversResponse,
  ComputePanelRequest,
  ComputePanelResponse,
  ComputeGridRequest,
  ComputeGridResponse,
} from '@geonoise/engine';
import type { ComputeTimings, BackendId } from '@geonoise/shared';

export class CPUWorkerBackend implements Engine {
  private _enginePromise: Promise<Engine> | null = null;
  private id: import('@geonoise/shared').BackendId = 'cpu-worker';
  private queue: WorkerJob[] = [];
  private flushScheduled = false;
  private requestSeqMap = new Map<string, number>();

  constructor(_opts?: { threadCount?: number }) {
    // Delayed engine instantiation to avoid bundler/test ordering issues
  }

  getBackendId(): import('@geonoise/shared').BackendId { return this.id; }
  async isAvailable(): Promise<boolean> { return true; }
  getCapabilities(): EngineCapabilities { return { maxReceivers: 10000, maxSources: 1000, maxGridPoints: 100000, supportsGPU: false, supportsBandedCalculation: true, supportsBarriers: true }; }
  dispose(): void { /* no-op for worker-backed CPU wrapper */ }

  private async getEngine(): Promise<Engine> {
    if (!this._enginePromise) {
      this._enginePromise = (async () => {
        const mod = await import('@geonoise/engine') as typeof import('@geonoise/engine');
        return new mod.CPUEngine() as Engine;
      })();
    }
    return this._enginePromise;
  }

  async computeReceivers(request: ComputeReceiversRequest) {
    return this.enqueue('receivers', request);
  }
  async computePanel(request: ComputePanelRequest) {
    return this.enqueue('panel', request);
  }
  async computeGrid(request: ComputeGridRequest) {
    return this.enqueue('grid', request);
  }

  private enqueue(kind: 'receivers', request: ComputeReceiversRequest): Promise<ComputeReceiversResponse>;
  private enqueue(kind: 'panel', request: ComputePanelRequest): Promise<ComputePanelResponse>;
  private enqueue(kind: 'grid', request: ComputeGridRequest): Promise<ComputeGridResponse>;
  private enqueue(kind: WorkerJob['kind'], request: ComputeRequest): Promise<ComputeResponse> {
    return new Promise((resolve, reject) => {
      const requestId = request.requestId;
      const seq = requestId ? (this.requestSeqMap.get(requestId) ?? 0) + 1 : 0;
      if (requestId) this.requestSeqMap.set(requestId, seq);

      this.queue.push({ kind, request, resolve, reject, requestId, seq });
      if (!this.flushScheduled) {
        this.flushScheduled = true;
        if (typeof queueMicrotask === 'function') {
          queueMicrotask(() => void this.flush());
        } else {
          Promise.resolve().then(() => void this.flush());
        }
      }
    });
  }

  private async flush(): Promise<void> {
    const batch = this.queue.splice(0);
    this.flushScheduled = false;
    if (batch.length === 0) return;

    const engine = await this.getEngine();
    for (const job of batch) {
      if (this.isStale(job)) {
        job.reject(new Error('stale'));
        continue;
      }

      try {
        const response = await this.computeJob(engine, job.kind, job.request);
        if (this.isStale(job)) {
          job.reject(new Error('stale'));
          continue;
        }
        job.resolve(response);
      } catch (err) {
        job.reject(err);
      }
    }
  }

  private isStale(job: WorkerJob): boolean {
    return !!(job.requestId && this.requestSeqMap.get(job.requestId) !== job.seq);
  }

  private clone<T>(value: T): T {
    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(value);
      }
    } catch {
      // Fallback below
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private async computeJob(engine: Engine, kind: WorkerJob['kind'], request: ComputeRequest): Promise<ComputeResponse> {
    const setupStart = performance.now();
    const clonedRequest = this.clone(request);
    const setupMs = performance.now() - setupStart;

    const computeStart = performance.now();
    let response: ComputeResponse;
    if (kind === 'receivers') {
      response = await engine.computeReceivers(clonedRequest as ComputeReceiversRequest);
    } else if (kind === 'panel') {
      response = await engine.computePanel(clonedRequest as ComputePanelRequest);
    } else {
      response = await engine.computeGrid(clonedRequest as ComputeGridRequest);
    }
    const computeMs = performance.now() - computeStart;

    const transferStart = performance.now();
    const clonedResponse = this.clone(response);
    const transferMs = performance.now() - transferStart;

    const existingTimings = clonedResponse.timings;
    const timings: ComputeTimings = {
      ...existingTimings,
      setupMs,
      computeMs,
      transferMs,
      totalMs: existingTimings.totalMs ?? (setupMs + computeMs + transferMs),
    };

    const result: ComputeResponse = {
      ...clonedResponse,
      backendId: this.id as BackendId,
      warnings: clonedResponse.warnings ?? [],
      timings,
    };

    return result;
  }
}

type WorkerJob = {
  kind: 'receivers' | 'panel' | 'grid';
  request: ComputeRequest;
  resolve: (response: ComputeResponse) => void;
  reject: (error: unknown) => void;
  requestId?: string;
  seq: number;
};
