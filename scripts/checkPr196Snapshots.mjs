import process from 'node:process';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { readDevelopmentInput } from './pr193Evidence.mjs';
import { finalMatchPaths } from './checkPr196Evidence.mjs';
import { files, read, hash, receipt } from './pr196Evidence.mjs';
const root = 'docs/performance/pr196';
const paths = [
  ...finalMatchPaths(),
  ...files(root + '/harvest').filter((p) => /-baseline-v1\.json\.gz$/.test(p)),
];
const rows = [];
for (const path of paths) {
  const run = read(path);
  for (const c of run.captures) {
    const snapshot = read(c.path);
    if (hash(tacticalMatchStateSchema.parse(snapshot.state)) !== hash(snapshot.state))
      throw Error('Noncanonical serialized snapshot ' + c.path);
    if (snapshot.state.time !== c.at || snapshot.state.ball.ownerId !== c.actorId)
      throw Error('Snapshot metadata drift ' + c.path);
  }
  const c = run.captures[0];
  if (!c) throw Error('No first snapshot ' + path);
  let { input: s } = readDevelopmentInput(run.design, run.policy);
  s = globalThis.structuredClone(s);
  Object.assign(s, {
    experimentalBallRecovery: true,
    experimentalRestartPreparation: true,
    experimentalTransitionIntelligence: true,
    experimentalStrategicClearances: true,
    experimentalActivePerception: true,
    experimentalReceivingPositions: true,
    experimentalTeamTempo: true,
    experimentalCanonicalArrival: run.corrected,
  });
  while (s.time < c.at - 1e-8) s = step(s, 0.025);
  if (hash(s) !== c.inputHash) throw Error('Live first-snapshot hash drift ' + path);
  if (hash(tacticalMatchStateSchema.parse(s)) !== hash(read(c.path).state))
    throw Error('Parsed first-snapshot replay drift ' + path);
  rows.push({
    run: path,
    firstRawStateHash: c.inputHash,
    firstParsedStateHash: hash(read(c.path).state),
    snapshots: run.captures.map((x) => ({
      path: x.path,
      sha256: hash(readFileSync(x.path)),
      parsedStateHash: hash(read(x.path).state),
      rawStateHash: x.inputHash,
    })),
  });
}
receipt(
  root + '/snapshot-integrity-v1.json',
  {
    schema: 'pr196-snapshot-integrity-v1',
    method:
      'Replay first live snapshot of all 29 runs, then compare its raw hash and schema-parsed state. Check schema/metadata and seal serialized bytes for every capture. Later raw pre-schema hashes remain provenance; they are not reconstructed by parsing a saved snapshot.',
    rows,
  },
  process.argv.includes('--check'),
);
console.log('PR196 snapshot integrity PASS', rows.length, 'first-snapshot replays');
