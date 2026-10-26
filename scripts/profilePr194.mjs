import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { cpus, platform } from 'node:os';
import process from 'node:process';
import console from 'node:console';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import {
  PerformanceProfiler,
  withPerformanceProfiler,
} from '../src/core/matchSimulation/performanceProfiling.ts';
import { readPr193Evidence } from './readPr193Evidence.mjs';
import {
  hash,
  manifest,
  canonicalKernelManifest,
  writeReceipt,
  retainPr194Source,
} from './pr194Evidence.mjs';
const prior = readPr193Evidence(
  'docs/performance/pr193/matches/ww-state-value-v1-combined-final-v2.json',
);
const input = JSON.parse(gunzipSync(readFileSync(prior.capture.path))),
  source = manifest(),
  rows = [];
for (let repeat = 0; repeat < 3; repeat++)
  for (const mode of ['baseline', 'perception', 'positions', 'tempo', 'combined'])
    for (const debug of [false, true]) {
      let s = globalThis.structuredClone(input);
      if (mode === 'perception' || mode === 'combined') s.experimentalActivePerception = true;
      if (mode === 'positions' || mode === 'combined') s.experimentalReceivingPositions = true;
      if (mode === 'tempo' || mode === 'combined') s.experimentalTeamTempo = true;
      const initialHash = hash(s),
        profiler = new PerformanceProfiler({ enabled: true, sampleEveryTicks: 1 });
      let debugBytes = 0;
      const wall = performance.now(),
        cpu = process.cpuUsage(),
        rssBefore = process.memoryUsage().rss;
      withPerformanceProfiler(profiler, () =>
        withBoundedObserver(
          debug
            ? (t) => {
                debugBytes += JSON.stringify(t).length;
              }
            : undefined,
          () => {
            for (let tick = 0; tick < 160; tick++) {
              profiler.beginTick(tick);
              s = step(s, 0.025);
            }
          },
        ),
      );
      rows.push({
        repeat,
        mode,
        debug,
        ticks: 160,
        requestedSeconds: 4,
        actualSeconds: s.time - input.time,
        initialHash,
        finalHash: hash(s),
        cpu: process.cpuUsage(cpu),
        wallMs: performance.now() - wall,
        rssBefore,
        rssAfter: process.memoryUsage().rss,
        debugBytes,
        profile: profiler.snapshot(),
      });
    }
for (const r of rows) {
  const twin = rows.find((t) => t.repeat === r.repeat && t.mode === r.mode && t.debug !== r.debug);
  if (twin.finalHash !== r.finalHash) throw Error('Profiler/debug changed state');
}
writeReceipt('docs/performance/pr194/profile-v4.json', {
  schema: 'mfl-pr194-profile-v1',
  classification: 'shared four-second checkpoint; not a full-match extrapolation',
  source,
  sourceHash: hash(source),
  kernelHash: hash(canonicalKernelManifest(source)),
  sourceArchive: retainPr194Source(source),
  checkpoint: {
    path: prior.capture.path,
    sha256: hash(readFileSync(prior.capture.path)),
    stateHash: hash(input),
  },
  host: {
    node: process.version,
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    platform: platform(),
  },
  rows,
});
console.log('PR194 shared-checkpoint profile recorded; observer-neutral 30 rows');
