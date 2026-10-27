import process from 'node:process';
import console from 'node:console';
import { runCanonicalOutcomeTrial } from '../src/core/matchSimulation/canonicalOutcome.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { hash, read, receipt } from './pr196Evidence.mjs';
const counter = read('docs/performance/pr196/counterfactuals-v2.json.gz'),
  rows = [];
// Every policy/design contributes its first selected state; observations are intentionally mutated.
const seen = new Set();
for (const r of counter.rows) {
  const id = `${r.design}:${r.policy}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const input = read(r.capture.path).state;
  for (const corrected of [false, true]) {
    const initial = { ...input, experimentalCanonicalArrival: corrected },
      snapshots = [];
    for (const observed of [false, true]) {
      let s = globalThis.structuredClone(initial);
      withBoundedObserver(
        observed
          ? (t) => {
              t.candidates?.splice(0);
              if (t.scene) t.scene.visible.length = 0;
            }
          : undefined,
        () => {
          for (let tick = 0; tick < 40; tick++) s = step(s, 0.025);
        },
      );
      snapshots.push(hash(s));
    }
    if (snapshots[0] !== snapshots[1]) throw Error('Canonical observer drift ' + id);
    rows.push({
      id,
      corrected,
      inputHash: hash(initial),
      ticks: 40,
      finalHash: snapshots[0],
      observerNeutral: true,
    });
  }
  const selected = r.trials.find((t) => t.label === 'selected');
  if (selected) {
    const replay = runCanonicalOutcomeTrial(input, selected.action, 8);
    const legacySamples = replay.samples.map(({ restartReleased: _releasedContext, ...legacy }) => {
      void _releasedContext;
      return legacy;
    });
    if (hash(replay.final) !== selected.finalHash || hash(legacySamples) !== selected.samplesHash)
      throw Error('Saved counterfactual replay drift ' + id);
  }
}
receipt(
  'docs/performance/pr196/replay-v1.json',
  { schema: 'pr196-replay-v1', rows },
  process.argv.includes('--check'),
);
console.log(
  'PR196 deterministic saved states / mutating observers PASS',
  rows.length,
  'paired continuations',
);
