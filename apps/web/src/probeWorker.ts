import type { ProbeRequest, ProbeResult } from '@geonoise/engine';

const freqs = [63, 125, 250, 500, 1000, 2000, 4000, 8000];

function nearestDistance(position: ProbeRequest['position'], sources: ProbeRequest['sources']) {
  let best = Number.POSITIVE_INFINITY;
  for (const source of sources) {
    const dx = position.x - source.position.x;
    const dy = position.y - source.position.y;
    const dz = (position.z ?? 0) - (source.position.z ?? 0);
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < best) best = dist;
  }
  return best;
}

function calculateProbe(req: ProbeRequest): ProbeResult {
  const hasSources = req.sources.length > 0;
  const dist = hasSources ? Math.max(nearestDistance(req.position, req.sources), 1) : 100;
  const base = hasSources ? 100 - 20 * Math.log10(dist) : 35;

  const magnitudes = freqs.map((freq) => {
    const tilt = -2.5 * Math.log2(freq / 1000);
    const jitter = (Math.random() - 0.5) * 2;
    return base + tilt + jitter;
  });

  return {
    type: 'PROBE_UPDATE',
    probeId: req.probeId,
    data: {
      frequencies: freqs,
      magnitudes,
    },
  };
}

type ProbeWorkerScope = {
  postMessage: (message: ProbeResult) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<ProbeRequest>) => void) => void;
};

const workerContext = self as unknown as ProbeWorkerScope;

workerContext.addEventListener('message', (event) => {
  const req = event.data;
  if (!req || req.type !== 'CALCULATE_PROBE') return;
  const result = calculateProbe(req);
  workerContext.postMessage(result);
});
