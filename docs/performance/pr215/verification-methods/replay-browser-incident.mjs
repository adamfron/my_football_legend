import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { createSingleMatchSession } from '../../../../src/core/singleMatch.ts';
import { createTacticalMatch, stepTacticalMatch } from '../../../../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../../../../src/core/matchSimulation/matchState.ts';
import { fixtureIdentity } from '../../../../src/core/matchSimulation/roleExperiment.ts';
import { checkPr215Source } from '../../../../scripts/pr215Evidence.mjs';
const binding = checkPr215Source();
const expected = JSON.parse(readFileSync('docs/performance/pr215/browser/incident-session.json'));
const world = JSON.parse(readFileSync('.generated-public/data/world/pl-2026-v2.json'));
const session = createSingleMatchSession(world, { homeClubId: world.clubs[0].id,
  awayClubId: world.clubs[1].id, seed: expected.metadata.seed,
  control: { mode: 'spectator' }, decisionPolicy: 'state-value-v1', physicalPreset: 'holistic-physical-dev-v1' });
assert.equal(fixtureIdentity(session), expected.metadata.fixtureId);
const initial = createTacticalMatch(session);
let state = initial, beforeIncident;
const history = [];
for (let tick = 0; tick < 2400 && !state.executionWitnesses.unresolved; tick++) {
  beforeIncident = state;
  state = stepTacticalMatch(state, 0.025);
  history.push({ time: state.time, ball: state.ball, pending: state.pendingStrike,
    ground: state.lastGroundContact, clusters: state.multiBodyResolutions,
    players: state.players.map((p) => ({ id: p.id, position: p.position, velocity: p.velocity })) });
  if (history.length > 80) history.shift();
}
const json = (x) => JSON.parse(JSON.stringify(x));
const actual = json(state), browserState = expected.canonicalPhysicalCheckpoint;
const differences = [], summary = { leaves: 0, maximumAbsoluteNumericDifference: 0 };
const compare = (a, b, path = '') => {
  if (isDeepStrictEqual(a, b)) return;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) compare(a[key], b[key], path + '/' + key);
  } else {
    summary.leaves++;
    if (typeof a === 'number' && typeof b === 'number')
      summary.maximumAbsoluteNumericDifference = Math.max(summary.maximumAbsoluteNumericDifference, Math.abs(a - b));
    if (differences.length < 64) differences.push({ path, node: a, browser: b });
  }
};
compare(actual, browserState);
assert.equal(state.executionWitnesses.unresolved.source, browserState.executionWitnesses.unresolved.source);
assert.equal(state.time, browserState.time);
const saved = tacticalMatchStateSchema.parse(json(beforeIncident));
const reloadedAfter = stepTacticalMatch(saved, 0.025);
const normalize = (s) => json(tacticalMatchStateSchema.parse(json(s)));
assert.deepEqual(normalize(reloadedAfter), normalize(state));
writeFileSync('docs/performance/pr215/browser/incident-native-replay.json.gz', gzipSync(JSON.stringify({
  source: binding.fingerprint, initial, beforeIncident, terminal: state, history,
  result: 'NATIVE_SAVE_PASS / SAME_INCIDENT / BROWSER_NODE_EXACT_IDENTITY_NOT_ESTABLISHED',
  exactBrowserCheckpoint: isDeepStrictEqual(actual, browserState), savedBeforeIncidentReplay: true,
  nativeComparison: 'exact normal-schema JSON values, no numeric rounding',
  rawShapeIdentical: isDeepStrictEqual(json(reloadedAfter), json(state)),
  rawShapeLimit: 'ordinary point-schema parsing strips surplus ball metadata copied into player targets; physical/state-schema fields are compared exactly',
  crossRuntimeDifferences: { ...summary, samples: differences },
  scope: 'normal 22-player browser-incident reproduction; not a successful holistic smoke',
}), { level: 9 }));
writeFileSync('docs/performance/pr215/browser/incident-native-replay-summary.json', JSON.stringify({
  source: binding.fingerprint, time: state.time, reason: state.executionWitnesses.unresolved.source,
  nativeSaveReplay: 'PASS', browserNodeExactIdentity: isDeepStrictEqual(actual, browserState) ? 'PASS' : 'NOT_ESTABLISHED',
  crossRuntimeDifferences: summary,
}, null, 2) + '\n');
