import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { gunzipSync } from 'node:zlib';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { deriveRestartLegalReadiness } from '../src/core/matchSimulation/restartLaws.ts';
import { prepareRestartMovement } from '../src/core/matchSimulation/restartLifecycle.ts';

const dt = 0.025;
const load = (path) => {
  const bytes = readFileSync(path);
  return {
    source: { path, sha256: createHash('sha256').update(bytes).digest('hex') },
    state: tacticalMatchStateSchema.parse(JSON.parse(gunzipSync(bytes))),
  };
};
const original = JSON.parse(
  readFileSync('docs/performance/pr227-independent-contact-match-windows.json'),
).cases.find((c) => c.fixture === 'native-a').longerAttempt;
const beforeHalt = load(original.snapshot.path);
const { state: input, source } = load(
  'docs/performance/pr227-native-a-endline-throw-award.json.gz',
);
assert.equal(beforeHalt.source.sha256, original.snapshot.sha256);
const award = input.restart;
assert.equal(award.awardId, beforeHalt.state.restart.awardId);
const opponents = (state) =>
  state.players.filter((p) => p.team !== award.restartTeam && !state.discipline?.[p.id]?.sentOff);
const marks = (state) =>
  opponents(state)
    .filter((p) => state.restart.roles[p.id]?.intent === 'mark_opponent')
    .map((p) => ({ id: p.id, marked: state.restart.roles[p.id].markerId, target: p.target }));
const distances = (state) =>
  opponents(state)
    .map((p) => ({
      id: p.id,
      distance: distance(p.position, award.spot),
      balance: p.articulatedStance?.dynamicBalance?.phase,
    }))
    .sort((a, b) => a.distance - b.distance);
const retargeted = prepareRestartMovement(beforeHalt.state);
assert.deepEqual(retargeted.ball, beforeHalt.state.ball);
assert.deepEqual(
  retargeted.players.map((p) => p.position),
  beforeHalt.state.players.map((p) => p.position),
);
const oldReadiness = deriveRestartLegalReadiness(retargeted);
assert.deepEqual(oldReadiness.blockers, ['opponent_restriction']);
let state = input;
let placedAt;
for (
  let tick = 0;
  tick < 30 / dt && !state.safetyHalt && state.restart.phase !== 'release';
  tick++
) {
  state = stepTacticalMatch(state, dt);
  assert.equal(state.restart.awardId, award.awardId);
  if (state.restart.retrieval?.stage === 'placed') placedAt ??= state.time;
}
assert.equal(state.safetyHalt, undefined);
assert.equal(state.restart.phase, 'release');
assert.equal(state.restart.readiness.legalReady, true);
assert.equal(state.ball.travelKind, 'throw_in');
assert.equal(state.throwInRestriction.throwerId, state.restart.takerId);
assert.equal(state.throwInRestriction.releasedAt, state.restart.executedAt);
const closest = distances(state);
assert.ok(closest[0].distance >= 2);
let after = state;
for (
  let tick = 0;
  tick < 1 / dt && !after.safetyHalt && distance(state.ball, after.ball) < 0.3;
  tick++
)
  after = stepTacticalMatch(after, dt);
assert.equal(after.safetyHalt, undefined);
const displacement = distance(state.ball, after.ball);
assert.ok(displacement >= 0.3);
const receipt = {
  source,
  award: { id: award.awardId, spot: award.spot, team: award.restartTeam, at: input.time },
  previous: {
    source: beforeHalt.source,
    haltAt: original.safetyHalt.at,
    readiness: oldReadiness,
    markers: marks(beforeHalt.state),
    encroaching: distances(beforeHalt.state).filter((p) => p.distance < 2),
  },
  current: {
    initialTargets: marks(prepareRestartMovement(input)),
    placedAt,
    readiness: state.restart.readiness,
    releasedAt: state.restart.executedAt,
    elapsed: state.time - input.time,
    closestOpponent: closest[0],
    previousEncroachers: closest.filter((p) =>
      original.restrictedOpponents.some((old) => old.id === p.id),
    ),
    throw: state.lastThrowInDiagnostic,
    moved: { metres: displacement, at: after.time },
  },
};
const archive = 'docs/performance/pr227-native-a-endline-throw.json';
const serialized = JSON.stringify(receipt, null, 2) + '\n';
if (process.argv.includes('--record')) writeFileSync(archive, serialized);
else if (process.argv.includes('--check'))
  assert.deepEqual(JSON.parse(serialized), JSON.parse(readFileSync(archive)));
else process.stdout.write(serialized);
