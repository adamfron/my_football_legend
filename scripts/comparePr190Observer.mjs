import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import {
  stepTacticalMatchAfterDecisionProbe as step,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
const output = 'docs/performance/pr190/full-match-observer-spin-final.json';
if (existsSync(output)) throw Error('Preserve observer comparison');
const receipt = JSON.parse(
  readFileSync('docs/performance/pr190/ww-opportunity-driven-v1-spin-final.json'),
);
const source = JSON.parse(
  readFileSync(
    'docs/performance/PR188-match-dev-ww-opportunity-driven-v1-full-observed-final-v1.json',
  ),
);
const input = JSON.parse(gunzipSync(readFileSync(source.archive))).input;
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
if (sha(input) !== receipt.inputSha256) throw Error('Observer input differs');
let state = input,
  ticks = 0;
while (!['full_time', 'abandoned'].includes(state.status) && state.time < 7200) {
  if (state.status === 'half_time') state = startSecondHalf(state);
  const before = state;
  state = step(state, 0.025);
  if (state === before) throw Error('Bare continuation stalled');
  ticks++;
}
if (
  state.status !== 'full_time' ||
  sha(state) !== receipt.finalStateSha256 ||
  ticks !== receipt.ticks
)
  throw Error('Full match observer changed canonical state');
const result = {
  schemaVersion: 1,
  classification:
    'complete WW/A with all lifecycle and match-flow observers disabled against the observed final engine',
  sourceSha256: receipt.sourceSha256,
  inputSha256: receipt.inputSha256,
  ticks,
  stateSha256: sha(state),
  observerNeutral: true,
};
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
