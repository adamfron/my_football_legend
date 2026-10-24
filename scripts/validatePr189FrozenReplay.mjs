import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
const engineRoot = process.argv.find((v) => v.startsWith('--engine-root='))?.slice(14);
if (!engineRoot) throw Error('Explicit frozen source directory required');
const { stepTacticalMatchAfterDecisionProbe: step } = await import(
  pathToFileURL(resolve(engineRoot, 'src/core/matchSimulation/matchSimulation.ts'))
);
const { withBoundedObserver } = await import(
  pathToFileURL(resolve(engineRoot, 'src/core/matchSimulation/boundedIntelligence.ts'))
);
const capture = JSON.parse(gunzipSync(readFileSync('docs/performance/pr189/baseline-20s.json.gz')));
const expected = JSON.parse(readFileSync('docs/performance/pr189/baseline-replay.json'));
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
for (const observed of [true, false]) {
  let state = JSON.parse(JSON.stringify(capture.state));
  const events = [];
  state = withBoundedObserver(
    observed
      ? (t) => {
          events.push(t);
        }
      : undefined,
    () => {
      for (let i = 0; i < expected.ticks; i++) state = step(state, 0.025);
      return state;
    },
  );
  if (sha(state) !== expected.direct || (observed && sha(events) !== expected.eventHashes[0]))
    throw Error('Frozen baseline replay differs');
}
console.log(
  JSON.stringify({ baselineReplay: 'PASS', ticks: expected.ticks, observerNeutral: true }),
);
