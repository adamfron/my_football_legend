import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createKickFixture } from '../src/core/matchSimulation/physicalKickLaboratory.ts';
import { withHolisticDevelopment } from '../src/core/matchSimulation/holisticDevelopment.ts';
import {
  matchStateToFrame,
  stepTacticalMatch,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { projectReceiverReadiness } from '../src/core/matchSimulation/receiverReadiness.ts';
import { enumerateAvailableActions } from '../src/core/matchSimulation/matchActions.ts';
import { canReleaseControlledAction } from '../src/core/matchSimulation/decisionReadiness.ts';
import { normalizeAngle } from '../src/core/matchSimulation/playerOrientation.ts';
import { observedReceptionPlan } from '../src/core/matchSimulation/localReception.ts';

const editions = {
  A: undefined,
  B: 'observed-reception-dev-v1',
  C: 'adaptive-reception-dev-v1',
};
const step = 0.025;
const reload = (state) => tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(state)));
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const findPlayer = (s, id) => s.players.find((p) => p.id === id);
const speed = (v) => Math.hypot(v.x, v.y);
const delta = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

const scenes = [
  { id: 'frontal', speed: 4 },
  { id: 'side', angle: Math.PI / 2, speed: 4 },
  { id: 'side-away', angle: -Math.PI / 2, speed: 4 },
  { id: 'running', momentum: 2.5, speed: 4 },
  { id: 'pressure', challenge: true, speed: 4 },
  { id: 'fast', speed: 18 },
  { id: 'slow', start: 0.36, speed: 0.7, stable: true },
  { id: 'early-frontal', start: 1.85, speed: 4, stable: true },
  { id: 'early-lateral', start: 1.45, angle: -Math.PI / 2, speed: 3.8, stable: true },
  { id: 'weaker-foot', start: 1.25, foot: 'left', speed: 4, stable: true },
  { id: 'support-phase', start: 1.4, angle: -0.4, momentum: 1.2, speed: 4, stable: true },
  { id: 'progressive', start: 1.85, progressive: true, speed: 4, stable: true },
  { id: 'early-pressure', start: 1.85, progressive: true, challenge: true, speed: 4, stable: true },
  { id: 'changed-flight', start: 1.85, changed: true, speed: 4, stable: true },
  { id: 'blind-start', start: 3, blind: true, speed: 5, stable: true },
  { id: 'unreachable', start: 1.85, offset: 7, speed: 4, stable: true },
  { id: 'competing-foot', start: 1.85, competitor: true, speed: 4, stable: true },
];

const createTrial = (scene, seed, firstTouch) => {
  const { state, receiver, actor, opponent } = createKickFixture({ seed });
  receiver.position = { x: 41, y: 34 };
  receiver.target = receiver.position;
  receiver.velocity = { x: scene.momentum ?? 0, y: 0 };
  receiver.facingAngle = scene.blind ? Math.PI / 2 : -Math.PI / 2;
  receiver.profile.attributes.firstTouch = firstTouch;
  if (scene.foot === 'left') receiver.profile.dominantFoot = 'right';
  if (scene.stable) receiver.neutralAnchor = { ...receiver.position };
  if (scene.challenge) {
    opponent.position = { x: 40.4, y: 34.55 };
    opponent.facingAngle = Math.PI;
    opponent.velocity = { x: 0, y: -3 };
    if (scene.stable) {
      opponent.target = opponent.position;
      opponent.neutralAnchor = opponent.position;
    }
  }
  if (scene.competitor) {
    opponent.position = { x: 40, y: 34 };
    opponent.facingAngle = -Math.PI / 2;
    opponent.target = opponent.position;
    opponent.neutralAnchor = opponent.position;
  }
  if (scene.progressive) {
    const outlet = state.players.find(
      (p) =>
        p.team === receiver.team &&
        p.id !== receiver.id &&
        p.id !== actor.id &&
        p.slot.position !== 'goalkeeper',
    );
    outlet.position = { x: 47, y: 29 };
    outlet.target = outlet.position;
    outlet.neutralAnchor = outlet.position;
  }
  const input = withHolisticDevelopment(state, 'state-value-v1', 'holistic-stance-foot-dev-v2');
  const player = findPlayer(input, receiver.id);
  const boot = player.articulatedStance[scene.foot ?? 'right'];
  const incoming = { x: Math.cos(scene.angle ?? 0), y: Math.sin(scene.angle ?? 0) };
  const start = scene.start ?? 0.45;
  input.playerAgencyEnabled = false;
  input.actionCooldown = 1;
  input.ball = {
    x: boot.x - start * incoming.x,
    y: boot.y - start * incoming.y + (scene.offset ?? 0),
    height: 0.11,
    velocity: { x: scene.speed * incoming.x, y: scene.speed * incoming.y, z: 0 },
    travelKind: 'pass',
    lastTouchPlayerId: actor.id,
  };
  if (!scene.stable) {
    const point = { x: boot.x, y: boot.y };
    input.receptionPreparation = {
      actorId: receiver.id,
      sourceActorId: actor.id,
      releasedAt: input.time - 0.5,
      awarenessAt: input.time - 0.25,
      expectedContactPoint: point,
      expectedArrivalTime: input.time + start / scene.speed,
      movement: scene.momentum ? 'continue_run' : 'wait',
      ballEpisode: 'pr219',
      readiness: projectReceiverReadiness(input, player, point, start / scene.speed),
    };
  }
  return { input, receiver: receiver.id };
};

const run = (input, scene, receiver, roundTrip) => {
  let state = input;
  const start = input.time;
  const frames = [];
  const contacts = [];
  const plans = [];
  let firstControl;
  let feasible;
  let attempted;
  let completed;
  let afterFirst;
  let afterControl;
  for (let tick = 0; tick < (scene.stable ? 64 : 24) && !state.safetyHalt; tick++) {
    if (scene.changed && tick === 10 && !state.ball.ownerId)
      state = { ...state, ball: { ...state.ball, velocity: { x: 1, y: -4, z: 0 } } };
    const previous = state;
    state = stepTacticalMatch(roundTrip ? reload(state) : state, step);
    if (
      state.lastGroundContact?.executed &&
      (state.lastGroundContact.at !== previous.lastGroundContact?.at ||
        state.lastGroundContact.actorId !== previous.lastGroundContact?.actorId)
    ) {
      const contact = state.lastGroundContact;
      contacts.push(contact);
      if (contact.actorId === receiver) afterFirst ??= contact.at;
      if (attempted?.type === 'pass' || attempted?.type === 'shot') {
        if (
          contact.actorId === receiver &&
          contact.at >= attempted.at &&
          state.ball.lastTouchPlayerId === receiver &&
          state.ball.travelKind
        )
          completed ??= contact.at;
      }
    }
    const p = findPlayer(state, receiver);
    const plan = state.activePerceptionRuntime?.plans[receiver];
    if (plan?.reviewedAt !== previous.activePerceptionRuntime?.plans[receiver]?.reviewedAt)
      plans.push(plan ?? { cancelledAt: state.time });
    if (state.ball.ownerId === receiver) {
      firstControl ??= state.ballOwnershipStartedAt ?? state.time;
      if (!feasible) {
        const actions = enumerateAvailableActions(state, receiver).filter(
          (a) =>
            a.type === 'carry' ||
            ((a.type === 'pass' || a.type === 'shot') && canReleaseControlledAction(state, p)),
        );
        if (actions.length)
          feasible = { at: state.time, types: [...new Set(actions.map((a) => a.type))] };
      }
    }
    if (
      firstControl !== undefined &&
      state.currentAction?.actorId === receiver &&
      JSON.stringify(state.currentAction) !== JSON.stringify(previous.currentAction) &&
      ['pass', 'carry', 'shot'].includes(state.currentAction.type)
    )
      attempted ??= { at: state.time, type: state.currentAction.type };
    if (
      attempted?.type === 'carry' &&
      state.ball.ownerId === receiver &&
      state.lastGroundContact?.actorId === receiver &&
      state.lastGroundContact.at > attempted.at &&
      state.lastGroundContact.retained
    )
      completed ??= state.lastGroundContact.at;
    const frame = {
      at: state.time,
      owner: state.ball.ownerId ?? null,
      position: p.position,
      velocity: p.velocity,
      facing: p.facingAngle,
      target: p.target,
      stance: p.articulatedStance?.support ?? null,
      observedPlan: observedReceptionPlan(state, p)?.plan.reviewedAt ?? null,
      pressure: state.currentPressure,
      challenge:
        state.lastChallenge?.at !== previous.lastChallenge?.at ? state.lastChallenge : undefined,
    };
    frames.push(frame);
    if (firstControl !== undefined) afterControl ??= frame;
  }
  const first = contacts.find((c) => c.actorId === receiver);
  const ownershipAt = (time) => frames.find((frame) => frame.at >= time - 1e-8)?.owner === receiver;
  const contactFrame = frames.find((frame) => frame.at >= (afterFirst ?? Infinity));
  const motion = contactFrame ? frames.filter((frame) => frame.at <= contactFrame.at) : frames;
  const late = motion.filter((frame) => frame.at >= (afterFirst ?? motion.at(-1)?.at) - 0.15);
  const path = motion.reduce(
    (total, f, i) =>
      total +
      speed(delta(f.position, motion[i - 1]?.position ?? findPlayer(input, receiver).position)),
    0,
  );
  const changes = late.slice(1).map((f, i) => ({
    acceleration: (speed(f.velocity) - speed(late[i].velocity)) / step,
    turn: Math.abs(normalizeAngle(f.facing - late[i].facing)),
    targetChange: speed(delta(f.target, late[i].target)),
  }));
  return {
    contacts,
    first,
    firstControl,
    feasible,
    attempted,
    completed,
    plans,
    frames,
    afterControl,
    at200: ownershipAt(start + 0.2),
    at600: ownershipAt(start + 0.6),
    afterControl200: firstControl === undefined ? null : ownershipAt(firstControl + 0.2),
    afterControl600:
      firstControl === undefined || (frames.at(-1)?.at ?? 0) < firstControl + 0.6 - 1e-8
        ? null
        : ownershipAt(firstControl + 0.6),
    path,
    displacement: motion.length
      ? speed(delta(motion.at(-1).position, findPlayer(input, receiver).position))
      : 0,
    lateAcceleration: Math.max(0, ...changes.map((c) => c.acceleration)),
    lateTurn: changes.reduce((sum, c) => sum + c.turn, 0),
    lateCorrections: changes.filter((c) => c.targetChange > 0.05).length,
    halt: state.safetyHalt,
    terminal: digest(reload(state)),
    render: digest(matchStateToFrame(state)),
  };
};

const trials = [];
for (const scene of scenes) {
  for (const seed of ['pr219-a', 'pr219-b', 'pr219-c']) {
    for (const firstTouch of scene.stable ? [60] : [25, 60, 95]) {
      const { input, receiver } = createTrial(scene, seed, firstTouch);
      for (const [arm, edition] of Object.entries(editions)) {
        const start = reload({ ...input, experimentalReceptionPreparation: edition });
        const receipt = run(start, scene, receiver, false);
        if (
          seed === 'pr219-a' &&
          firstTouch === 60 &&
          arm === 'C' &&
          ['early-frontal', 'early-pressure', 'changed-flight', 'side'].includes(scene.id)
        ) {
          const replay = run(start, scene, receiver, true);
          assert.equal(digest(replay), digest(receipt), `${scene.id} native round-trip`);
          receipt.nativeRoundTrip = 'every_tick';
        }
        trials.push({ scene: scene.id, seed, firstTouch, arm, receiver, ...receipt });
      }
    }
  }
}
const summary = Object.fromEntries(
  scenes.map(({ id }) => [
    id,
    Object.fromEntries(
      Object.keys(editions).map((arm) => {
        const rows = trials.filter((t) => t.scene === id && t.arm === arm);
        const count = (predicate) => rows.filter(predicate).length;
        return [
          arm,
          {
            trials: rows.length,
            contact: count((r) => r.first),
            control: count((r) => r.firstControl),
            at600: count((r) => r.at600),
            afterControl600: count((r) => r.afterControl600),
            planned: count((r) => r.first?.preparedReception),
            feasible: count((r) => r.feasible),
            attempted: count((r) => r.attempted),
            completed: count((r) => r.completed),
            alternative: count(
              (r) =>
                r.first?.surfaceContact?.executed && r.first.surfaceContact.executed !== 'cushion',
            ),
            halt: count((r) => r.halt),
            averagePath: rows.reduce((sum, r) => sum + r.path, 0) / rows.length,
          },
        ];
      }),
    ),
  ]),
);
assert.equal(summary['side-away'].A.contact, 9);
assert.equal(summary['side-away'].A.at600, 9);
assert.equal(summary.pressure.A.contact, 9);
assert.equal(summary.pressure.A.at600, 0);
assert.equal(summary.side.A.halt, 9);
for (const arm of ['B', 'C']) {
  for (const [scene, result] of Object.entries(summary)) {
    assert.equal(result[arm].contact, result.A.contact, `${scene} contacts ${arm}`);
    assert.equal(result[arm].halt, result.A.halt, `${scene} safety ${arm}`);
  }
}
assert.ok(summary['early-frontal'].C.afterControl600 > summary['early-frontal'].B.afterControl600);
assert.ok(summary['early-lateral'].C.completed > summary['early-lateral'].A.completed);
assert.equal(summary['support-phase'].C.alternative, 3);
assert.equal(summary['competing-foot'].C.contact, 0);
const result = JSON.stringify({ summary, trials });
if (process.argv.includes('--check')) {
  assert.equal(
    digest(result),
    digest(gunzipSync(readFileSync('docs/performance/pr221/reception.json.gz')).toString('utf8')),
  );
} else {
  const folder = process.argv.includes('--record')
    ? 'docs/performance/pr221'
    : '.benchmark-artifacts/pr221';
  mkdirSync(folder, { recursive: true });
  writeFileSync(`${folder}/reception.json.gz`, gzipSync(result));
}
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
