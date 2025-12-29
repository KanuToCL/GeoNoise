import { describe, it, expect } from 'vitest';
import { loadPreference, savePreference, resolveBackend, detectWebGPU } from './computePreference.js';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

describe('compute preference persistence', () => {
  it('persists and reloads preference', () => {
    const storage = new MemoryStorage();
    expect(loadPreference(storage)).toBe('auto');
    savePreference('gpu', storage);
    expect(loadPreference(storage)).toBe('gpu');
  });

  it('falls back to auto for invalid values', () => {
    const storage = new MemoryStorage();
    storage.setItem('geonoise.computePreference', 'invalid');
    expect(loadPreference(storage)).toBe('auto');
  });
});

describe('capability fallback', () => {
  it('falls back to CPU with warning when GPU forced but unavailable', () => {
    const result = resolveBackend('gpu', { ok: false, reason: 'No WebGPU' });
    expect(result.effective).toBe('cpu');
    expect(result.warning).toContain('No WebGPU');
  });

  it('detectWebGPU reports unavailable without navigator', () => {
    const result = detectWebGPU({});
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});
