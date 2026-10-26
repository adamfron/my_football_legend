import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import {
  PerformanceProfiler,
  withPerformanceProfiler,
} from '../src/core/matchSimulation/performanceProfiling.ts';
import { hash, files, manifest, canonicalKernelManifest, writeReceipt } from './pr194Evidence.mjs';
import { readPr194Evidence } from './readPr194Evidence.mjs';
const check = process.argv.includes('--check'),
  path = 'docs/performance/pr194/replay-v4.json',
  rows = [];
for (const file of files('docs/performance/pr194/matches')
  .filter((p) => p.endsWith('-combined-v4.json'))
  .sort()) {
  const r = readPr194Evidence(file),
    a = r.capture;
  if (!a || hash(readFileSync(a.path)) !== a.sha256) throw Error('Missing capture ' + file);
  const input = JSON.parse(gunzipSync(readFileSync(a.path)));
  tacticalMatchStateSchema.parse(input);
  if (hash(input) !== a.stateHash) throw Error('Capture state drift');
  const hashes = [];
  for (const observed of [true, false, false]) {
    let s = globalThis.structuredClone(input);
    const profiler = new PerformanceProfiler({ enabled: observed, sampleEveryTicks: 1 });
    withPerformanceProfiler(profiler, () =>
      withBoundedObserver(
        observed
          ? (t) => {
              if (t.scene) t.scene.visible.length = 0;
              t.candidates?.splice(0);
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
    hashes.push(hash(s));
  }
  if (new Set(hashes).size !== 1) throw Error('Observer/repeated replay drift ' + file);
  rows.push({
    file,
    capture: a,
    inputHash: hash(input),
    ticks: 160,
    finalHash: hashes[0],
    observerNeutral: true,
    repeated: true,
  });
  console.log(file, 'replay PASS');
}
if (rows.length !== 15) throw Error('Expected fifteen genuine combined captures');
const result = {
  schema: 'mfl-pr194-captured-replay-v1',
  kernelHash: hash(canonicalKernelManifest(manifest())),
  rows,
};
if (check) {
  const old = JSON.parse(readFileSync(path));
  if (hash(result) !== hash(old)) throw Error('PR194 replay receipt drift');
} else writeReceipt(path, result);
