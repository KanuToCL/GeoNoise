import { describe, it, expect } from 'vitest';
import { getDefaultEngineConfig, mergeEngineConfig } from '../src/api/index.js';
import { PropagationConfigSchema, MeteoSchema } from '@geonoise/core';

describe('Engine default config', () => {
  it('getDefaultEngineConfig returns complete propagation and meteo', () => {
    const cfg = getDefaultEngineConfig('festival_fast');
    expect(cfg.propagation).toBeDefined();
    expect(cfg.meteo).toBeDefined();

    const parsedProp = PropagationConfigSchema.parse(cfg.propagation);
    const parsedMeteo = MeteoSchema.parse(cfg.meteo);

    expect(parsedProp.maxDistance).toBeGreaterThan(0);
    expect(parsedMeteo.temperature).toBe(20);
  });

  it('mergeEngineConfig merges and fills defaults', () => {
    const defaults = getDefaultEngineConfig('festival_fast');
    const merged = mergeEngineConfig(defaults, { propagation: { maxReflections: 2 } as any });
    expect(merged.propagation).toBeDefined();
    expect(merged.propagation!.maxReflections).toBe(2);
    expect(merged.propagation!.spreading).toBe(defaults.propagation!.spreading);
  });
});
