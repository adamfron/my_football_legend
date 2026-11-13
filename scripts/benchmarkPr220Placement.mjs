import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { gunzipSync, gzipSync } from 'node:zlib';
import { pr218Source } from './pr218Evidence.mjs';
import { createKickFixture } from '../src/core/matchSimulation/physicalKickLaboratory.ts';
import { withHolisticDevelopment } from '../src/core/matchSimulation/holisticDevelopment.ts';
import {
  advanceLiveBallFlight,
  observedFlight,
} from '../src/core/matchSimulation/liveBallFlight.ts';
import { deriveMovementCapability } from '../src/core/matchSimulation/locomotion.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import {
  stepTacticalMatch as step,
  stepTacticalMatchAfterDecisionProbe as stepWithoutMenu,
  matchStateToFrame,
} from '../src/core/matchSimulation/matchSimulation.ts';
import {
  applyPlayerDecision,
  projectPlayerAgency,
} from '../src/core/matchSimulation/playerDecision.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import {
  canonicalStrikeFoot,
  observedPassBall,
} from '../src/core/matchSimulation/pendingStrike.ts';
import { placeBodyForLowPass } from '../src/core/matchSimulation/passBodyPlacement.ts';
import { releaseContactReadiness } from '../src/core/matchSimulation/decisionReadiness.ts';
import { normalizeAngle } from '../src/core/matchSimulation/playerOrientation.ts';

const dt = 0.025;
const ticks = 7;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const reload = (state) => tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(state)));
const version = process.argv[2] ?? 'local';
assert.match(version, /^[a-z0-9-]+$/);
const source = pr218Source();
const baselinePath = 'docs/performance/pr218/full-stance-v2-attempt-6.json.gz';
const receipt = readFileSync(baselinePath);
const archive = JSON.parse(gunzipSync(receipt));
const reference = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr219/reconstructed-pr218-attempt-6.json.gz')),
);
const episodes = new Map();
const historical = [4, 7, 17, 24, 40, 50];
const selections = new Map();
let live = reload(archive.initial);
globalThis.__pr220 = {
  selection(state, action, source) {
    if (action.type === 'pass' && historical.includes(state.decisionIndex + 1))
      selections.set(state.decisionIndex + 1, { state: structuredClone(state), action, source });
  },
};
while (live.time < 104) {
  const { opportunity } = projectPlayerAgency(live);
  if (opportunity) {
    const choice =
      opportunity.options.find((o) => o.kind === 'action' && o.action.type === 'pass') ??
      opportunity.options[0];
    live = applyPlayerDecision(live, opportunity, choice.id);
  }
  const previous = live;
  live = step(live, dt);
  assert.ok(!live.safetyHalt && live !== previous);
  const pending = live.pendingStrike;
  if (!pending || pending.id === previous.pendingStrike?.id) continue;
  const decision = Number(pending.id.split(':').at(-2));
  const selected = selections.get(decision);
  assert.ok(selected, pending.id);
  const result = reference.records.find((r) => r.pending.id === pending.id)?.result;
  assert.ok(result, pending.id);
  episodes.set(decision, {
    ...selected,
    name: `native-${decision}`,
    reference: result,
  });
}
assert.deepEqual([...episodes.keys()], historical);
delete globalThis.__pr220;

const constructed = [];
for (const seed of ['pr219-a', 'pr219-b', 'pr219-c'])
  for (const [name, vx, vy, offset, extra] of [
    ['stationary', 0, 0, 0.42],
    ['approaching', -1.5, 0, 0.42],
    ['receding', 1.5, 0, 0.42],
    ['lateral', 0, 3, 0.42],
    ['fast-incoming', -8, 0, 0.42],
    ['misaligned', 0, 0, 0.63],
    ['unreachable', 0, 0, 3.5],
    ['late', 0, 0, 0.63, 'late'],
    ['stale', 0, 0, 0.63, 'stale'],
    ['opponent-first', 0, 0, 0.63, 'pressure'],
    ['velocity-change', 1.5, 0, 0.63, 'deflection'],
  ])
    for (const technique of name === 'misaligned' ? [25, 60, 95] : [70]) {
      const fixture = createKickFixture({
        seed,
        technique,
        context: extra === 'pressure' ? 'immediate' : 'open',
      });
      const actor = fixture.actor;
      actor.position = {
        x: fixture.state.ball.x - offset,
        y: fixture.state.ball.y + (offset > 0.42 ? 0.29 : 0.12),
      };
      actor.target = actor.position;
      const base = withHolisticDevelopment(
        fixture.state,
        'state-value-v1',
        'holistic-stance-foot-dev-v2',
      );
      base.playerAgencyEnabled = false;
      base.ball = { ...base.ball, velocity: { x: vx, y: vy, z: 0 } };
      base.playerMovementIntent = {
        actorId: actor.id,
        type: 'hold_shape',
        target: actor.position,
        startedAt: base.time,
        expiresAt: base.time + 1,
      };
      const previous = advanceLiveBallFlight({
        ...base,
        time: base.time - dt,
        ball: { ...base.ball, x: base.ball.x - vx * dt, y: base.ball.y - vy * dt },
      });
      const sensor = previous.liveBallFlightRuntime.sensors[actor.id];
      sensor.nextAcquisitionAt = base.time;
      let state = advanceLiveBallFlight({
        ...base,
        liveBallFlightRuntime: previous.liveBallFlightRuntime,
      });
      if (extra === 'stale') {
        const sensor = state.liveBallFlightRuntime.sensors[actor.id];
        delete sensor.optical;
        delete sensor.belief;
        sensor.nextAcquisitionAt = base.time + 1;
      }
      constructed.push({
        name,
        state,
        action: fixture.action,
        source: 'human_selected',
        extra,
        technique,
      });
    }

const frame = (state, id, pending, placement) => {
  const actor = state.players.find((p) => p.id === id);
  if (!actor) return { time: state.time, missingActor: true };
  const boot =
    pending && canonicalStrikeFoot(pending, actor, actor, pending.plan.foot, state.time, dt, 0);
  const stance = actor.articulatedStance;
  return {
    time: state.time,
    ball: state.ball,
    observed: observedFlight(state, actor),
    sighting: observedPassBall(state, actor),
    position: actor.position,
    velocity: actor.velocity,
    facing: actor.facingAngle,
    pelvisYaw: actor.facingAngle + (actor.lowerBodyPose?.hipYaw ?? 0),
    stance,
    placement,
    rootError:
      placement &&
      Math.hypot(actor.position.x - placement.root.x, actor.position.y - placement.root.y),
    facingError: placement && Math.abs(normalizeAngle(actor.facingAngle - placement.facing)),
    plantError:
      placement &&
      Math.hypot(
        stance[placement.supportFoot].x - placement.plant.x,
        stance[placement.supportFoot].y - placement.plant.y,
      ),
    boot,
    ground:
      state.lastGroundContact?.at > state.time - dt - 1e-8 ? state.lastGroundContact : undefined,
    interference: (state.playerBodyContacts ?? []).filter((impact) =>
      impact.participants.includes(id),
    ),
    challenge: state.defensiveChallenge,
    recovery: state.recoveringFeet?.filter((foot) => foot.actorId === id),
  };
};

const run = ({ name, state: initial, action, source, extra, technique, reference }, arm) => {
  const actorId = action.actorId;
  const ownsOriginal = (state) =>
    !state.safetyHalt &&
    !state.restart &&
    !state.postGoal &&
    state.ball.ownerId === actorId &&
    (state.ballEpisode ?? 0) === (initial.ballEpisode ?? 0) &&
    state.ball.lastTouchPlayerId === initial.ball.lastTouchPlayerId;
  const prepared = arm === 'B' || arm === 'C';
  const waitTicks = arm === 'A' ? 0 : extra === 'late' ? 1 : ticks;
  let state =
    arm === 'C'
      ? { ...initial, experimentalObservedStrikePreparation: 'observed-low-pass-dev-v1' }
      : initial;
  let placement;
  let preparationSeconds = 0;
  let blockedAt;
  const frames = [frame(state, actorId)];
  const advance = () => stepWithoutMenu(state, dt);
  try {
    globalThis.__pr220 = {
      waitingActor: actorId,
      command(snapshot, actor) {
        if (!prepared || actor.id !== actorId || !ownsOriginal(snapshot)) return;
        placement = placeBodyForLowPass(snapshot, actor, action.target, arm === 'C', action.foot);
        if (!placement) return;
        preparationSeconds += dt;
        return {
          target: placement.root,
          targetSpeed: deriveMovementCapability(actor).walkSpeed,
          desiredFacingAngle: placement.facing,
          dt,
          balance: 1,
          structural: false,
          receivingMomentum: false,
        };
      },
    };
    for (let tick = 0; tick < waitTicks && ownsOriginal(state); tick++) {
      placement = undefined;
      state = advance();
      frames.push(frame(state, actorId, undefined, placement));
      if (extra === 'deflection' && tick === 2 && ownsOriginal(state))
        // A prescribed apparatus disturbance with the same time and value in D/B/C.
        state = { ...state, ball: { ...state.ball, velocity: { x: -1, y: 2, z: 0 } } };
    }
    delete globalThis.__pr220.command;
    const opportunity = ownsOriginal(state);
    const actor = state.players.find((p) => p.id === actorId);
    const readiness = actor && releaseContactReadiness(state, actor);
    const commitAt = state.time;
    if (opportunity && (!prepared || placement)) {
      const placedAction =
        prepared && placement && !action.foot ? { ...action, foot: placement.activeFoot } : action;
      state = resolveMatchAction(state, placedAction, source);
    } else blockedAt = state.time;
    const pending = state.pendingStrike;
    frames.push(frame(state, actorId, pending, placement));
    for (let i = 0; pending && i < 16 && !state.safetyHalt; i++) {
      state = advance();
      frames.push(frame(state, actorId, state.pendingStrike ?? pending));
      if (i >= 9 && !state.pendingStrike) break;
    }
    const result =
      pending && state.lastStrikeResolution?.id === pending.id
        ? state.lastStrikeResolution
        : undefined;
    return {
      name,
      seed: initial.seed,
      actorId,
      arm,
      extra,
      technique,
      inputHash: sha(JSON.stringify(initial)),
      selection: { action, source, at: initial.time },
      windowSeconds: waitTicks * dt,
      preparationSeconds,
      commitAt,
      opportunity,
      readiness,
      blockedAt,
      pending,
      result,
      outcome:
        result?.outcome ??
        (state.safetyHalt
          ? 'halt'
          : pending
            ? 'pending'
            : !opportunity
              ? 'opportunity_lost'
              : blockedAt !== undefined
                ? 'no_observation'
                : 'declined'),
      reference,
      safetyHalt: state.safetyHalt,
      terminalBall: state.ball,
      terminalFrame: sha(JSON.stringify(matchStateToFrame(state))),
      frames,
    };
  } finally {
    delete globalThis.__pr220;
  }
};
const trials = [...episodes.values(), ...constructed].flatMap((episode) =>
  ['A', 'D', 'B', 'C'].map((arm) => run(episode, arm)),
);
for (const { pending, reference: expected, result, outcome } of trials.filter(
  (row) => row.reference && row.arm === 'A',
)) {
  assert.ok(pending && result, `native A ${expected.id}: ${outcome}`);
  assert.equal(result.id, expected.id);
  assert.equal(result.outcome, expected.outcome);
  assert.equal(result.reason, expected.reason);
  assert.ok(Math.abs(result.at - expected.at) < 1e-7);
}
const summary = Object.fromEntries(
  Object.entries(Object.groupBy(trials, (row) => row.name)).map(([name, rows]) => [
    name,
    Object.fromEntries(
      Object.entries(Object.groupBy(rows, (row) => row.arm)).map(([arm, group]) => [
        arm,
        Object.fromEntries(
          Object.entries(Object.groupBy(group, (row) => row.outcome)).map(([outcome, results]) => [
            outcome,
            results.length,
          ]),
        ),
      ]),
    ),
  ]),
);
assert.deepEqual(source, pr218Source(), 'source changed during measurement');
const directory = '.benchmark-artifacts/pr220';
mkdirSync(directory, { recursive: true });
writeFileSync(
  `${directory}/${version}.json.gz`,
  gzipSync(
    JSON.stringify({
      source,
      sourceFingerprint: sha(JSON.stringify(source)),
      nativeReference: { sha256: sha(receipt), source: archive.source },
      node: process.version,
      summary,
      trials,
    }),
    { level: 9 },
  ),
  { flag: 'wx' },
);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
