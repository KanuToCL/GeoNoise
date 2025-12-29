import { describe, it, expect } from 'vitest';
import { createDefaultRouter } from '../src/index.js';

describe('BackendRouter (integration)', () => {
  it('registers at least the CPU backend and can choose CPU', async () => {
    const router = await createDefaultRouter();
    const chosen = router.chooseBackend('cpu', 10);
    expect(chosen).toBeTruthy();
    expect(['cpu-worker', 'cpu-main']).toContain(chosen?.id);
  });

  it('auto chooses a backend for small workload', async () => {
    const router = await createDefaultRouter();
    const chosen = router.chooseBackend('auto', 1);
    expect(chosen).toBeTruthy();
  });
});
