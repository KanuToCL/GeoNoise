/**
 * Worker Pool Management
 *
 * Manages web worker lifecycle for background computations.
 * Currently handles probe worker, but designed for extensibility.
 */

/**
 * Worker state
 */
export type WorkerState = 'idle' | 'busy' | 'error' | 'terminated';

/**
 * Message handler type
 */
export type MessageHandler<T> = (data: T) => void;

/**
 * Error handler type
 */
export type ErrorHandler = (error: ErrorEvent) => void;

/**
 * Managed worker instance
 */
export type ManagedWorker<TRequest> = {
  /** Underlying Worker instance */
  worker: Worker | null;
  /** Current state */
  state: WorkerState;
  /** Send a message to the worker */
  postMessage: (message: TRequest) => boolean;
  /** Terminate the worker */
  terminate: () => void;
  /** Check if worker is ready */
  isReady: () => boolean;
};

/**
 * Worker creation options
 */
export type WorkerOptions<TResponse> = {
  /** URL or path to worker script */
  url: URL | string;
  /** Worker type (module for ES modules) */
  type?: 'classic' | 'module';
  /** Message handler */
  onMessage: MessageHandler<TResponse>;
  /** Error handler */
  onError?: ErrorHandler;
};

/**
 * Create a managed worker instance
 *
 * @param options - Worker configuration
 * @returns ManagedWorker instance
 */
export function createWorker<TRequest, TResponse>(
  options: WorkerOptions<TResponse>
): ManagedWorker<TRequest> {
  let worker: Worker | null = null;
  let state: WorkerState = 'idle';

  const { url, type = 'module', onMessage, onError } = options;

  // Try to create the worker
  try {
    worker = new Worker(url, { type });

    worker.addEventListener('message', (event: MessageEvent<TResponse>) => {
      onMessage(event.data);
    });

    worker.addEventListener('error', (event: ErrorEvent) => {
      state = 'error';
      onError?.(event);
    });
  } catch {
    worker = null;
    state = 'error';
  }

  return {
    get worker() {
      return worker;
    },
    get state() {
      return state;
    },
    postMessage(message: TRequest): boolean {
      if (!worker || state === 'terminated' || state === 'error') {
        return false;
      }
      try {
        worker.postMessage(message);
        state = 'busy';
        return true;
      } catch {
        state = 'error';
        return false;
      }
    },
    terminate(): void {
      if (worker) {
        worker.terminate();
        worker = null;
      }
      state = 'terminated';
    },
    isReady(): boolean {
      return worker !== null && state !== 'terminated' && state !== 'error';
    },
  };
}

/**
 * Probe worker request type
 */
export type ProbeRequest = {
  type: 'CALCULATE_PROBE';
  probeId: string;
  position: { x: number; y: number; z?: number };
  sources: Array<{
    id: string;
    position: { x: number; y: number; z?: number };
    spectrum: number[];
    gain: number;
  }>;
  walls: Array<{
    id: string;
    type: 'barrier' | 'building';
    vertices: Array<{ x: number; y: number }>;
    height: number;
  }>;
  config: {
    barrierSideDiffraction?: 'none' | 'auto' | 'always';
    groundType?: 'hard' | 'soft' | 'mixed';
    groundMixedFactor?: number;
    atmosphericAbsorption?: 'none' | 'simple' | 'iso9613';
    temperature?: number;
    humidity?: number;
    pressure?: number;
  };
  includePathGeometry?: boolean;
};

/**
 * Probe worker result type
 */
export type ProbeResult = {
  type: 'PROBE_UPDATE';
  probeId: string;
  data: {
    frequencies: number[];
    magnitudes: number[];
    interferenceDetails?: { ghostCount: number };
    tracedPaths?: Array<{
      type: 'direct' | 'ground' | 'wall' | 'diffraction';
      points: Array<{ x: number; y: number }>;
      level_dB: number;
      phase_rad: number;
      sourceId: string;
    }>;
    phaseRelationships?: Array<{
      path1Type: string;
      path2Type: string;
      phaseDelta_deg: number;
      isConstructive: boolean;
    }>;
  };
};

/**
 * Create a probe worker instance
 *
 * @param workerUrl - URL to probe worker script
 * @param onResult - Handler for probe results
 * @param onError - Optional error handler
 * @returns ManagedWorker for probe calculations
 */
export function createProbeWorker(
  workerUrl: URL | string,
  onResult: MessageHandler<ProbeResult>,
  onError?: ErrorHandler
): ManagedWorker<ProbeRequest> {
  return createWorker<ProbeRequest, ProbeResult>({
    url: workerUrl,
    type: 'module',
    onMessage: onResult,
    onError,
  });
}

/**
 * Simple request tracking for pending operations
 */
export function createPendingTracker<T extends string>() {
  const pending = new Set<T>();

  return {
    /** Add an ID to pending set */
    add(id: T): void {
      pending.add(id);
    },
    /** Remove an ID from pending set */
    remove(id: T): void {
      pending.delete(id);
    },
    /** Check if an ID is pending */
    has(id: T): boolean {
      return pending.has(id);
    },
    /** Get count of pending items */
    get size(): number {
      return pending.size;
    },
    /** Clear all pending items */
    clear(): void {
      pending.clear();
    },
    /** Get all pending IDs */
    getAll(): T[] {
      return Array.from(pending);
    },
  };
}

/**
 * Stub calculation for when worker is unavailable
 * Returns approximate values based on distance attenuation
 */
export function calculateProbeStub(request: ProbeRequest): ProbeResult {
  const freqs = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  let minDist = Number.POSITIVE_INFINITY;

  for (const source of request.sources) {
    const dx = request.position.x - source.position.x;
    const dy = request.position.y - source.position.y;
    const dz = (request.position.z ?? 0) - (source.position.z ?? 0);
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < minDist) minDist = dist;
  }

  const hasSources = request.sources.length > 0;
  const dist = hasSources ? Math.max(minDist, 1) : 100;
  const base = hasSources ? 100 - 20 * Math.log10(dist) : 35;

  const magnitudes = freqs.map((freq) => {
    const tilt = -2.5 * Math.log2(freq / 1000);
    const jitter = (Math.random() - 0.5) * 2;
    return base + tilt + jitter;
  });

  return {
    type: 'PROBE_UPDATE',
    probeId: request.probeId,
    data: {
      frequencies: freqs,
      magnitudes,
    },
  };
}
