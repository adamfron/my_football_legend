import assert from 'node:assert/strict';
import console from 'node:console';
import { createFreshReleases } from './pr201Fixtures.mjs';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { locallyPreparedFirstTimeAction } from '../src/core/matchSimulation/localReception.ts';
import { incomingBallIntentKey } from '../src/core/matchSimulation/playerDecision.ts';

// Find a real released-ball episode in which the existing bounded plan produces
// an autonomous first-time pass, then perturb only the higher authority at the
// immediately preceding 40 Hz checkpoint. This is a development intervention.
const entry = createFreshReleases(200).entries.find((e) =>
  e.skill === 55 && e.family === 'short_ground' && e.sample === 1 && e.factor === 'immediate_pressure');
assert.ok(entry);
let state = globalThis.structuredClone(entry.state);
Object.assign(state, { experimentalDefensiveReception: true, experimentalHeightAwarePassing: true,
  experimentalReceiverAnticipation: true, experimentalReceiverSynchronisation: false,
  experimentalBoundedBallFlightBelief: true, boundedReceiverRecovery: 'hold-local-v1',
  experimentalActivePerception: true, experimentalReceivingPositions: true,
  situationalAwareness: 'bounded-v1', prospectiveMovement: 'two-pass-continuity-dev-v1' });
delete state.integrationProfile;
const id = entry.contract.receiverId;
const receiver = state.players.find((p) => p.id === id);
receiver.profile.attributes.gameReading = 85;
receiver.profile.attributes.firstTouch = 85;
let checkpoint, firstAction;
for (let i = 0; i < 320; i++) {
  const before = state;
  const actor = before.players.find((p) => p.id === id);
  const action = locallyPreparedFirstTimeAction(before, actor);
  state = step(before, 0.025);
  if (action?.type === 'pass' && state.lastPassDiagnostic?.passId !== before.lastPassDiagnostic?.passId &&
      state.lastPassDiagnostic?.passerId === id && state.lastPassDiagnostic?.executionType === 'first_time') {
    checkpoint = before;
    firstAction = action;
    break;
  }
  if (state.restart || state.postGoal || ['half_time', 'full_time', 'abandoned'].includes(state.status)) break;
}
assert.ok(checkpoint && firstAction, 'No canonical first-time checkpoint found');
const run = (kind) => {
  const s = globalThis.structuredClone(checkpoint);
  const player = s.players.find((p) => p.id === id);
  const opponent = s.players.find((p) => p.team !== player.team && p.slot.position !== 'goalkeeper');
  const target = { x: player.position.x, y: player.position.y + 8 };
  if (kind === 'challenge') s.defensiveChallenge = { id: 'pr204-authority', actorId: id,
    opponentId: opponent.id, technique: 'standing', source: 'autonomous_npc', startedAt: s.time,
    expiresAt: s.time + 2, target };
  if (kind === 'human_move' || kind === 'human_selected') {
    s.playerAgencyEnabled = true;
    s.controlledFootballerId = id;
  }
  if (kind === 'human_move') s.playerMovementIntent = { actorId: id, type: 'attack_space',
    target, startedAt: s.time, expiresAt: s.time + 2 };
  if (kind === 'human_selected') s.pendingReceptionIntent = { actorId: id, action: firstAction,
    actionSource: 'human_selected', createdAt: s.time, expiresAt: s.time + 2,
    ballEpisode: incomingBallIntentKey(s) };
  if (kind === 'restart') s.restart = { phase: 'setup', startedAt: s.time,
    restartTeam: player.team, takerId: id, targets: {}, executionChoices: [], roles: {} };
  const next = step(s, 0.025);
  const pass = next.lastPassDiagnostic?.passId !== s.lastPassDiagnostic?.passId ? next.lastPassDiagnostic : null;
  return { state: next, pass, target };
};
const normal = run('normal');
assert.equal(normal.pass?.executionType, 'first_time');
assert.equal(normal.pass?.actionSource, 'autonomous_npc');
assert.equal(normal.state.lastGroundContact?.executed, true);
assert.equal(normal.state.lastGroundContact?.actorId, id);
assert.equal(normal.state.lastGroundContact?.at, normal.state.time);
const challenge = run('challenge');
assert.equal(challenge.pass, null, 'defensive commitment must preempt autonomous first-time');
assert.deepEqual(challenge.state.players.find((p) => p.id === id).target, challenge.target);
const humanMove = run('human_move');
assert.equal(humanMove.pass, null);
assert.deepEqual(humanMove.state.players.find((p) => p.id === id).target, humanMove.target);
const selected = run('human_selected');
assert.equal(selected.pass?.executionType, 'first_time');
assert.equal(selected.pass?.actionSource, 'human_selected');
assert.equal(run('restart').pass, null);
console.log(JSON.stringify({
  result: 'PASS', fixture: { seed: entry.seed, receiver: id, releasedAt: entry.contract.releasedAt },
  checkpointAt: checkpoint.time,
  normal: { execution: normal.pass.executionType, actionSource: normal.pass.actionSource,
    contact: normal.state.lastGroundContact },
  challenge: { pass: challenge.pass, target: challenge.target },
  humanMove: { pass: humanMove.pass, target: humanMove.target },
  humanSelected: { execution: selected.pass.executionType, actionSource: selected.pass.actionSource },
  restart: { pass: null },
}));
