import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { readPr193Evidence } from './readPr193Evidence.mjs';
import { hash, manifest, retainSourceVersion, writeReceipt } from './pr193Evidence.mjs';
const capture = readPr193Evidence(
  'docs/performance/pr193/matches/ww-state-value-v1-combined-final-v2.json',
).capture;
const initial = JSON.parse(gunzipSync(readFileSync(capture.path)));
if (hash(initial) !== capture.sha256) throw Error('Performance capture drift');
const modes = ['baseline', 'transition', 'clearance', 'combined'],
  rows = [];
for (let repeat = -1; repeat < 5; repeat++)
  for (const mode of modes) {
    let s = globalThis.structuredClone(initial);
    delete s.experimentalTransitionIntelligence;
    delete s.experimentalStrategicClearances;
    if (mode === 'transition' || mode === 'combined') s.experimentalTransitionIntelligence = true;
    if (mode === 'clearance' || mode === 'combined') s.experimentalStrategicClearances = true;
    const inputHash = hash(s),
      started = performance.now(),
      cpu = process.cpuUsage();
    for (let tick = 0; tick < 160; tick++) s = step(s, 0.025);
    const used = process.cpuUsage(cpu),
      wallMs = performance.now() - started;
    if (repeat >= 0)
      rows.push({
        mode,
        repeat,
        inputHash,
        finalHash: hash(s),
        ticks: 160,
        wallMs,
        cpuMs: (used.user + used.system) / 1000,
      });
  }
for (const mode of modes)
  if (new Set(rows.filter((r) => r.mode === mode).map((r) => r.finalHash)).size !== 1)
    throw Error('Non-deterministic cost workload');
const source = manifest();
writeReceipt('docs/performance/pr193/cost-prefix-v1.json', {
  schema: 'mfl-pr193-cost-prefix-v1',
  source,
  sourceHash: hash(source),
  sourceArchive: retainSourceVersion(source),
  capture,
  rows,
  limits:
    'One genuine shared checkpoint, 160 ticks, one warm-up plus five repetitions/mode; flags alter ensuing football. Shared-machine timings are observations, not speedup or league-scale calibration.',
});
console.log('PR193 shared checkpoint cost/determinism recorded');
