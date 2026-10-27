import console from 'node:console';
import { basename } from 'node:path';
import { readdirSync } from 'node:fs';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import {
  createDisruptionLedger,
  observeDisruption,
} from '../src/core/matchSimulation/disruptionLedger.ts';
import { read, hash } from './pr198Evidence.mjs';
let count = 0;
for (const name of readdirSync('docs/performance/pr198/matches').filter(
  (n) => n.endsWith('.json.gz') && !n.endsWith('-prefix.json.gz'),
)) {
  const row = read('docs/performance/pr198/matches/' + name);
  if (row.status !== 'full_time' || row.failure) continue;
  for (const capture of row.captures) {
    if (!capture.nextTick) throw Error('Missing PR198 next tick');
    const saved = read(capture.path),
      initial = saved.state;
    if (hash(initial) !== saved.inputHash) throw Error('PR198 saved prefix drift');
    const parsed = tacticalMatchStateSchema.parse(initial);
    for (const key of ['experimentalReceiverSynchronisation', 'experimentalObservedLoftedPasses'])
      if (parsed[key] !== initial[key]) throw Error('Experiment lost during schema persistence');
    const plain = step(globalThis.structuredClone(initial), 0.025);
    const observed = withBoundedObserver(
      (t) => {
        t.reason = 'mutating observer';
        if (t.action && 'target' in t.action) t.action.target.x = 999;
      },
      () => step(globalThis.structuredClone(initial), 0.025),
    );
    const ledger = createDisruptionLedger(initial),
      before = globalThis.structuredClone(initial);
    const ledgerState = step(before, 0.025);
    observeDisruption(ledger, initial, before, ledgerState, 'home');
    if (
      hash(plain) !== capture.nextTick.stateHash ||
      hash(plain) !== hash(observed) ||
      hash(plain) !== hash(ledgerState)
    )
      throw Error('PR198 current prefix/observer drift: ' + basename(name));
    count++;
  }
}
if (count < 14) throw Error('Fourteen complete-match prefixes required');
console.log(
  'PR198 saved-state/experiment-schema/bare/hostile-observer/disruption neutrality PASS',
  count,
);
