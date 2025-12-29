import { describe, it, expect } from 'vitest';
import { buildCsv } from './export.js';

describe('CSV export schema', () => {
  it('emits receiver, panel sample, and panel stats rows', () => {
    const results = {
      receivers: [
        { id: 'r1', x: 1.234, y: -2.345, z: 1.5, LAeq: 65.678 },
      ],
      panels: [
        {
          panelId: 'p1',
          sampleCount: 2,
          LAeq_min: 60.111,
          LAeq_max: 70.999,
          LAeq_avg: 66.666,
          LAeq_p95: 69.2,
          samples: [
            { x: 0, y: 0, z: 1.5, LAeq: 64.444 },
            { x: 1, y: 1, z: 1.5, LAeq: 67.777 },
          ],
        },
      ],
    };

    const csv = buildCsv(results);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('section,id,x,y,z,LAeq,sampleCount,LAeq_min,LAeq_max,LAeq_avg,LAeq_p95');
    expect(lines[1]).toBe('receiver,r1,1.2,-2.3,1.5,65.7,,,,,');
    expect(lines[2]).toBe('panel_sample,p1,0.0,0.0,1.5,64.4,,,,,');
    expect(lines[3]).toBe('panel_sample,p1,1.0,1.0,1.5,67.8,,,,,');
    expect(lines[4]).toBe('panel_stats,p1,,,,,2,60.1,71.0,66.7,69.2');
  });
});
