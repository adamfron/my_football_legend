import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { estimatePlayerArrivalTime } from '../src/core/matchSimulation/playerArrival.ts';
import { hash, receipt, retainSource } from './pr196Evidence.mjs';
const f = createCalibrationFixture({ scenario: 'moving_defender' }),
  p = f.state.players.find((p) => p.id === f.defenderId),
  rows = [];
for (const corrected of [false, true]) {
  const values = [],
    start = performance.now(),
    cpu = process.cpuUsage();
  for (let i = 0; i < 600; i++)
    values.push(
      estimatePlayerArrivalTime(
        { ...f.state, experimentalCanonicalArrival: corrected },
        p,
        { x: p.position.x + 2 + (i % 20), y: p.position.y - 4 + (i % 9) },
        'intercept',
      ).estimatedTime,
    );
  rows.push({
    corrected,
    calls: values.length,
    signature: hash(values),
    wallMs: performance.now() - start,
    cpu: process.cpuUsage(cpu),
    maxRSSKiB: process.resourceUsage().maxRSS,
  });
}
receipt('docs/performance/pr196/arrival-profile-v2.json', {
  schema: 'pr196-arrival-profile-v2',
  sourceArchive: retainSource(),
  classification:
    'concurrent-host microprofile, not serial full-match speed or an independent football experiment',
  rows,
});
console.log(rows);
