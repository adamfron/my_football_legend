import console from 'node:console';
import {
  stepTacticalMatchAfterDecisionProbe as step,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { read, receipt, hash, sourceIdentity, argumentsMap } from './pr197Evidence.mjs';
const args = argumentsMap(),
  path =
    args.get('input') ??
    'docs/performance/pr197/matches/ww-opportunity-driven-v1-baseline-v1-prefix.json.gz';
const input = read(path),
  source = sourceIdentity();
let s = input.state,
  ticks = 0;
try {
  withBoundedObserver(
    () => {},
    () => {
      while (s.time < 7200 && !['full_time', 'abandoned'].includes(s.status)) {
        if (s.status === 'half_time') s = startSecondHalf(s);
        const next = step(s, 0.025);
        s = next;
        ticks++;
        if (ticks % 40000 === 0) console.log('failure reproduction', s.time);
      }
    },
  );
  console.log('No failure reproduced', s.time, s.status);
} catch (e) {
  receipt(`docs/performance/pr197/failure-${args.get('version') ?? 'v1'}.json.gz`, {
    source,
    inputPath: path,
    ticks,
    inputHash: hash(input.state),
    state: s,
    stateHash: hash(s),
    stack: e.stack,
  });
  console.log(e.stack);
}
