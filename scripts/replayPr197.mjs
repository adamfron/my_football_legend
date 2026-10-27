import process from 'node:process';
import console from 'node:console';
import { basename } from 'node:path';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { read, hash, receipt } from './pr197Evidence.mjs';
const checks = [];
for (const selected of read('docs/performance/pr197/summary.json').fullMatches) {
  const path = 'docs/performance/pr197/matches/' + basename(selected.path),
    row = read(path);
  if (row.status !== 'full_time' || row.failure) continue;
  for (const capture of row.captures) {
    if (!capture.nextTick) throw Error('Missing prefix witness ' + path);
    const saved = read(capture.path),
      initial = saved.state;
    if (hash(initial) !== saved.inputHash) throw Error('Saved prefix drift');
    const plain = step(globalThis.structuredClone(initial), 0.025);
    const observed = withBoundedObserver(
      (t) => {
        t.reason = 'mutating observer';
        if (t.action && 'target' in t.action) t.action.target.x = 999;
      },
      () => step(globalThis.structuredClone(initial), 0.025),
    );
    if (hash(plain) !== capture.nextTick.stateHash || hash(plain) !== hash(observed))
      throw Error('PR197 replay drift ' + path);
    checks.push({
      path: capture.path,
      inputHash: hash(initial),
      outputHash: hash(plain),
      observerNeutral: true,
    });
  }
}
const failed = read('docs/performance/pr197/failure-v1.json.gz').state;
let state = globalThis.structuredClone(failed);
for (let i = 0; i < 80; i++) state = step(state, 0.025);
const result = {
  schema: 'pr197-replay-v2',
  checks,
  boundaryFailure: {
    inputHash: hash(failed),
    outputHash: hash(state),
    seconds: state.time - failed.time,
    originalPhysicalSighting:
      failed.activePerceptionRuntime.memory['geometry:anchor:1'].ball.position.x,
  },
};
const path = 'docs/performance/pr197/replay-v2.json';
if (process.argv.includes('--check')) {
  if (hash(read(path)) !== hash(result)) throw Error('PR197 replay receipt drift');
} else if (!process.argv.includes('--probe')) receipt(path, result);
console.log(
  'PR197 current saved-state / mutating-observer replay PASS',
  checks.length,
  'prefixes; boundary continuation PASS',
);
