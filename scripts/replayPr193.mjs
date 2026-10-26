import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import console from 'node:console';
import process from 'node:process';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { hash, files, writeReceipt } from './pr193Evidence.mjs';
import { readPr193Evidence } from './readPr193Evidence.mjs';
const root = 'docs/performance/pr193',
  rows = [];
const paths = files(root + '/matches').filter(
  (p) => p.endsWith('.json') && p.includes('-combined-final-v2'),
);
for (const path of paths) {
  const receipt = readPr193Evidence(path);
  if (!receipt.observed) continue;
  const initial = JSON.parse(gunzipSync(readFileSync(receipt.capture.path)));
  if (hash(initial) !== receipt.capture.sha256) throw Error('Capture drift ' + path);
  const run = (observe) => {
    let s = globalThis.structuredClone(initial);
    withBoundedObserver(
      observe
        ? (t) => {
            if (t.scene) t.scene.visible.length = 0;
            if (t.candidates) t.candidates.length = 0;
            if (t.decision) t.decision.reasons.length = 0;
          }
        : undefined,
      () => {
        for (let tick = 0; tick < 480; tick++) s = step(s, 0.025);
      },
    );
    return hash(s);
  };
  const first = run(true),
    second = run(true),
    bare = run(false);
  if (first !== second || first !== bare) throw Error('Observer divergence ' + path);
  rows.push({
    path,
    captureHash: hash(initial),
    at: initial.time,
    ticks: 480,
    first,
    second,
    bare,
  });
}
const audit = JSON.parse(readFileSync(root + '/foul-audit-v1.json'));
for (const c of audit.captures) {
  const value = JSON.parse(gunzipSync(readFileSync(c.path))),
    actual = hash(step(value.state, 0.025));
  if (actual !== value.expectedNextHash) throw Error('Foul physical replay drift ' + c.path);
}
if (rows.length !== 15) throw Error('Missing representative canonical captures');
const result = {
  schema: 'mfl-pr193-observer-replay-v1',
  rows,
  foulCaptures: audit.captures.length,
  neutral: true,
};
if (process.argv.includes('--check')) {
  const recorded = JSON.parse(readFileSync(root + '/observer-replay-v1.json'));
  if (hash(recorded) !== hash(result)) throw Error('Recorded replay drift');
} else writeReceipt(root + '/observer-replay-v1.json', result);
console.log('PR193 mutating observer / repeated observer / bare canonical replay PASS');
