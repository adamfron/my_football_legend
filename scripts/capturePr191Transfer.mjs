import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import {
  stepTacticalMatchAfterDecisionProbe as step,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { capturePathologicalState } from '../src/core/matchSimulation/pathologicalReplay.ts';
const design = process.argv.find((a) => a.startsWith('--design='))?.slice(9) ?? 'ss';
if (!['ss', 'sw'].includes(design)) throw Error('Select a recorded design');
const output = `docs/performance/pr191/capture-${design}-body.json.gz`;
if (existsSync(output)) throw Error('Preserve ' + output);
const receipt = JSON.parse(
  readFileSync(`docs/performance/pr191/${design}-state-value-v1-body.json`),
);
const source = JSON.parse(
  readFileSync(
    `docs/performance/PR188-match-dev-${design}-state-value-v1-full-observed-final-v1.json`,
  ),
);
let state = JSON.parse(gunzipSync(readFileSync(source.archive))).input;
state.experimentalBodyContacts = { version: 'body-v1', readyAt: {}, locks: [] };
const expected = receipt.surfaces[0];
if (!expected) throw Error('No recorded body contact');
while (state.time < expected.at + 0.025) {
  if (state.status === 'half_time') state = startSecondHalf(state);
  const before = state;
  state = step(state, 0.025);
  const c = state.experimentalBodyContacts?.last;
  if (c) {
    if (JSON.stringify(c) !== JSON.stringify(expected))
      throw Error('Contact differs from complete recorded match');
    const capture = capturePathologicalState(
      before,
      '251ec9f88f212f7a93d26ebc7491b1176e5a25ef',
      `Actual PR191 body-v1 development state; reproduces ${design} receipt ${receipt.sourceHash}; no physical state edit`,
    );
    const bytes = gzipSync(JSON.stringify(capture));
    writeFileSync(output, bytes);
    console.log(
      JSON.stringify({
        output,
        at: before.time,
        contact: c.actualSurface,
        sourceHash: receipt.sourceHash,
        archiveHash: createHash('sha256').update(bytes).digest('hex'),
      }),
    );
    break;
  }
}
if (!existsSync(output)) throw Error('Recorded contact not reproduced');
