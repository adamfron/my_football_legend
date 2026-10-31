import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { source, hash } from './pr199Evidence.mjs';
import {
  createTemporalStrikeFixture,
  sampleTemporalStrikeLabError,
} from '../src/core/matchSimulation/temporalStrikeLaboratory.ts';
import {
  executeTemporalStrike,
  ZERO_TEMPORAL_ERROR,
} from '../src/core/matchSimulation/temporalFootStrike.ts';
import { executePhysicalKick } from '../src/core/matchSimulation/kickExecution.ts';
import { createKickFixture } from '../src/core/matchSimulation/physicalKickLaboratory.ts';
import { createPr205Fixture } from '../src/core/matchSimulation/pr205Laboratory.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  sampleCanonicalOutcome,
  interpretCanonicalOutcome,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { integrateBallFlight } from '../src/core/matchSimulation/ballPhysics.ts';
import { advanceSurfaceBall } from '../src/core/matchSimulation/ballSurfaceContact.ts';
import { flight } from './pr207Experiments.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const mode = args.get('mode') ?? 'timing';
const version = args.get('version') ?? 'development-v1';
assert.match(version, /^[a-z0-9-]+$/);
assert.ok(['timing', 'retention', 'bounce'].includes(mode));
const root = args.get('output') ?? 'docs/performance/pr209';
const manifest = source(),
  started = performance.now(),
  cpu = process.cpuUsage();
const environment = { rollingResistanceMultiplier: 1, groundContact: 'event-v1' };
const read = (p) =>
  JSON.parse(p.endsWith('.gz') ? gunzipSync(readFileSync(p)) : readFileSync(p, 'utf8'));
const physical = (s) => ({
  position: { x: s.ball.x, y: s.ball.y, z: s.ball.height ?? 0.11 },
  velocity: { x: s.ball.velocity?.x ?? 0, y: s.ball.velocity?.y ?? 0, z: s.ball.velocity?.z ?? 0 },
  spin: s.ball.spin ?? { x: 0, y: 0, z: 0 },
  airborne: s.ball.airborne ?? false,
  bounceCount: s.ball.bounceCount ?? 0,
});
const body = (p) => ({
  position: p.position,
  velocity: p.velocity,
  facing: p.facingAngle,
  target: p.target,
  balance: p.plantBalance ?? null,
  locomotion: {
    reason: p.locomotionReason ?? null,
    intensity: p.locomotionIntensity ?? null,
    mode: p.movementMode ?? null,
    telemetry: p.locomotionTelemetry ?? null,
  },
  motorObservation: p.ballMotorObservation ?? null,
});
const receiverView = (s, id) => {
  const p = s.players.find((p) => p.id === id);
  return {
    ...body(p),
    optical: s.liveBallFlightRuntime?.sensors[id] ?? null,
    activeMemory: s.activePerceptionRuntime?.memory[id] ?? null,
    reception: s.receptionPreparation?.actorId === id ? s.receptionPreparation : null,
    onBall: s.onBallPreparation?.actorId === id ? s.onBallPreparation : null,
    continuation: s.ballCarrierIntent?.actorId === id ? s.ballCarrierIntent : null,
  };
};
const frame = (s, f, sample) => ({
  at: s.time,
  physical: physical(s),
  ball: s.ball,
  receiver: receiverView(s, f.receiver.id),
  opponents: s.players
    .filter((p) => p.team !== f.actor.team)
    .map((p) => ({ id: p.id, ...body(p) })),
  pressure: s.currentPressure,
  action: s.currentAction,
  decisionIndex: s.decisionIndex,
  contacts: sample?.contacts ?? [],
  foot: s.lastGroundContact ?? null,
  receptionOutcome: s.lastReceptionOutcome ?? null,
  possession: s.lastPossessionChange ?? null,
  loss: s.pendingPossessionLoss ?? null,
});
const finish = (result, extraCosts = {}) => {
  assert.deepEqual(source(), manifest, 'Source changed while measuring PR209');
  const receipt = { schema: 'pr209-measurement-v1', mode, version, source: hash(manifest), result };
  const costs = {
    wallSeconds: (performance.now() - started) / 1000,
    cpuSeconds: Object.values(process.cpuUsage(cpu)).reduce((a, b) => a + b, 0) / 1e6,
    peakRSSKiB: process.resourceUsage().maxRSS,
    node: process.version,
    platform: process.platform,
    ...extraCosts,
  };
  const output = `${root}/${mode}-${version}.json.gz`;
  if (args.has('check'))
    assert.equal(hash(read(output).receipt), hash(receipt), 'PR209 exact replay drift');
  else {
    mkdirSync(root, { recursive: true });
    writeFileSync(output, gzipSync(JSON.stringify({ receipt, costs }), { level: 9 }), {
      flag: 'wx',
    });
  }
  console.log(JSON.stringify({ output, source: receipt.source, costs }));
};

if (mode === 'timing') {
  const rows = [],
    skills = [],
    limits = [];
  for (const speed of [0, 1, 3, 5, 8])
    for (const direction of ['approaching', 'departing', 'crossing'])
      for (const mirror of [false, true]) {
        const f = createTemporalStrikeFixture({
          seed: 'pr209-zero-error',
          speed,
          direction,
          mirror,
        });
        const inputHash = hash(f.state),
          planHash = hash(f.plan);
        for (const timingSeconds of [-0.02, -0.01, -0.005, 0, 0.005, 0.01, 0.02]) {
          const result = executeTemporalStrike(f.state, f.actor, f.plan, {
            ...ZERO_TEMPORAL_ERROR,
            timingSeconds,
          });
          assert.equal(hash(f.state), inputHash, 'Contact solver mutated canonical state');
          assert.equal(hash(f.plan), planHash, 'Contact solver retargeted nominal plan');
          const tail = flight(
            {
              x: result.finalBall.position.x,
              y: result.finalBall.position.y,
              height: result.finalBall.position.z,
              velocity: result.finalBall.velocity,
              spin: result.finalBall.spin,
              airborne: result.finalBall.airborne,
            },
            { x: 50, y: 34 },
            f.actor,
            false,
            true,
            environment,
          );
          rows.push({ config: f.config, inputHash, plan: f.plan, timingSeconds, result, tail });
        }
      }
  for (const direction of ['approaching', 'departing', 'crossing'])
    for (const mirror of [false, true]) {
      const f = createTemporalStrikeFixture({
        seed: 'pr209-zero-error',
        speed: 1e-6,
        direction,
        mirror,
      });
      limits.push({ direction, mirror, result: executeTemporalStrike(f.state, f.actor, f.plan) });
    }
  for (const primary of [25, 90])
    for (const technique of [25, 90])
      for (const preparationSeconds of [0.04, 0.24])
        for (const pressure of ['open', 'immediate'])
          for (let seed = 0; seed < 16; seed++) {
            const f = createTemporalStrikeFixture({
              seed: `pr209-skill-${seed}`,
              speed: 3,
              direction: 'crossing',
              primary,
              technique,
              preparationSeconds,
              pressure,
            });
            const error = sampleTemporalStrikeLabError(f);
            const result = executeTemporalStrike(f.state, f.actor, f.plan, error.error);
            skills.push({
              config: f.config,
              inputHash: hash(f.state),
              plan: f.plan,
              error,
              result,
            });
          }
  const unexpected = [-2, 0, 2].map((delta) => {
    const f = createTemporalStrikeFixture({ seed: 'pr209-unexpected-motion', speed: 3 });
    const originalPlan = hash(f.plan);
    f.state.ball.velocity.y += delta;
    return {
      delta,
      originalPlan,
      actualInput: physical(f.state),
      plan: f.plan,
      result: executeTemporalStrike(f.state, f.actor, f.plan),
    };
  });
  const f = createTemporalStrikeFixture({ seed: 'pr209-cost', speed: 3 });
  const micro = {};
  for (const [name, run] of [
    [
      'instant-contact-v1',
      () => executePhysicalKick(f.state, f.actor, f.request, ZERO_TEMPORAL_ERROR),
    ],
    ['temporal-contact-dev-v1', () => executeTemporalStrike(f.state, f.actor, f.plan)],
  ]) {
    for (let i = 0; i < 50; i++) run();
    const begin = performance.now(),
      usage = process.cpuUsage(),
      calls = 1000;
    for (let i = 0; i < calls; i++) run();
    micro[name] = {
      calls,
      wallMicrosecondsPerCall: ((performance.now() - begin) * 1000) / calls,
      cpuMicrosecondsPerCall:
        Object.values(process.cpuUsage(usage)).reduce((a, b) => a + b, 0) / calls,
    };
  }
  finish(
    {
      rows,
      limits,
      skills,
      unexpected,
      scope:
        'Single low inside-foot contact; no production temporal selection, live motor handoff or calibrated distributions',
      saveStateAdditionalBytes: 0,
      maximumReceiptBytes: Math.max(
        ...rows.map((r) => Buffer.byteLength(JSON.stringify(r.result))),
      ),
    },
    { micro },
  );
} else if (mode === 'retention') {
  const frozen = read('docs/performance/pr208/live-development-v1.json.gz').receipt.result;
  const changes = frozen.rows
    .filter((r) => r.config.family === 'pass')
    .filter((r) => {
      const a = r.arms.find((a) => a.model === 'contact-v1');
      return (
        a.legacy.outcome.teamPossessionAtOneSecond !== a.corrected.outcome.teamPossessionAtOneSecond
      );
    });
  assert.equal(changes.length, 10);
  const rows = [];
  for (const original of changes) {
    const preserved = original.arms.find((a) => a.model === 'contact-v1');
    const f = createKickFixture(original.config);
    const released = resolveMatchAction(f.state, f.action, 'human_selected');
    assert.deepEqual(released.ball.velocity, preserved.initialVelocity);
    assert.deepEqual(released.ball.spin, preserved.initialSpin);
    const arms = [];
    for (const edition of ['legacy', 'corrected']) {
      let current = globalThis.structuredClone(released);
      if (edition === 'corrected') current.ballEnvironment = environment;
      const samples = [],
        frames = [],
        contacts = [],
        actions = [];
      for (let tick = 0; tick < 280; tick++) {
        const previous = current;
        current = step(current, 0.025);
        const sample = sampleCanonicalOutcome(previous, current, 'original-delivery-v3');
        samples.push(sample);
        const snapshot = globalThis.structuredClone(frame(current, f, sample));
        frames.push(snapshot);
        if (sample.contacts.length)
          contacts.push({
            ...snapshot,
            previousReceiverBody: body(previous.players.find((p) => p.id === f.receiver.id)),
          });
        if (current.decisionIndex !== previous.decisionIndex)
          actions.push({
            at: current.time,
            action: current.currentAction,
            ownerBefore: previous.ball.ownerId ?? null,
            ballAfter: globalThis.structuredClone(current.ball),
            passId: current.lastPassDiagnostic?.passId ?? null,
            shotId: current.ball.shot?.shotId ?? null,
          });
      }
      const outcome = interpretCanonicalOutcome(preserved[edition].outcome.contract, samples);
      assert.deepEqual(
        outcome,
        preserved[edition].outcome,
        'Preserved one-second observer changed',
      );
      assert.equal(
        hash(current),
        preserved.paired[`${edition}Final`],
        'Read-only observer changed PR208 paired autonomous football',
      );
      const check = frames.find(
        (r) => outcome.receiverControlAt !== null && r.at >= outcome.receiverControlAt + 1 - 1e-8,
      );
      const owner = check?.ball.ownerId;
      const own = f.state.players.filter((p) => p.team === f.actor.team).map((p) => p.id);
      const classification = !check
        ? 'no_control_or_censored'
        : owner
          ? own.includes(owner)
            ? 'own_team_control'
            : 'opponent_control'
          : check.ball.travelKind && own.includes(check.ball.lastTouchPlayerId)
            ? 'own_team_delivery_in_flight'
            : 'loose_ball_after_control';
      // Physical-only comparison: same fixed receiver and prescribed cushion; no autonomous movement or possession award.
      let ball = physical(released),
        fixedContact = null;
      const fixed = globalThis.structuredClone(f.receiver);
      fixed.velocity = { x: 0, y: 0 };
      for (let tick = 0; tick < 280; tick++) {
        const at = released.time + tick * 0.025;
        const result = advanceSurfaceBall(
          {
            ...released,
            time: at,
            ...(edition === 'corrected' ? { ballEnvironment: environment } : {}),
          },
          ball,
          0.025,
          [
            {
              player: fixed,
              request: {
                objective: 'settle',
                intendedSurface: 'cushion',
                foot: fixed.profile.dominantFoot,
                desiredVelocity: { x: 0, y: 0, z: 0 },
                preparationSeconds: 0.2,
                readyAt: released.time,
              },
            },
          ],
        );
        ball = result.ball;
        if (result.contacts.length) {
          fixedContact = result.contacts[0];
          break;
        }
      }
      arms.push({
        edition,
        outcome,
        classification,
        atOneSecond: check ?? null,
        firstReceiverContact:
          contacts.find((r) => r.contacts.some((c) => c.actorId === f.receiver.id)) ?? null,
        contacts,
        actions,
        onwardDeliveries: actions
          .filter(
            (a) =>
              a.action?.actorId === f.receiver.id &&
              a.action.type === 'pass' &&
              a.ballAfter.travelKind === 'pass',
          )
          .map((a) => ({
            releasedAt: a.at,
            action: a.action,
            passId: a.passId,
            outcome: interpretCanonicalOutcome(
              {
                version: 'original-delivery-v3',
                actorId: f.receiver.id,
                receiverId: a.action.receiverId ?? null,
                teamIds: own,
                opponentIds: f.state.players
                  .filter((p) => p.team !== f.actor.team)
                  .map((p) => p.id),
                requestedAt: a.at,
                releasedAt: a.at,
                horizonAt: released.time + 7,
                passId: a.passId,
                shotId: null,
                information: 'privileged_engineering_observer',
                conditionalOnRelease: true,
              },
              samples,
            ),
          })),
        frames,
        finalHash: hash(current),
        physicalOnly: {
          fixedBody: body(fixed),
          fixedRequest: 'prescribed cushion, 0.2s preparation; no possession grant',
          firstContact: fixedContact,
          finalBall: ball,
          freeFlight: edition === 'legacy' ? preserved.legacyFlight : preserved.correctedFlight,
        },
      });
    }
    const selectors = {
      ball: (r) => r.physical,
      perceivedBall: (r) => ({
        motor: r.receiver.motorObservation,
        optical: r.receiver.optical,
        memory: r.receiver.activeMemory,
      }),
      receiverIntention: (r) => ({
        target: r.receiver.target,
        locomotion: r.receiver.locomotion,
        continuation: r.receiver.continuation,
      }),
      receiverMovement: (r) => ({
        position: r.receiver.position,
        velocity: r.receiver.velocity,
        facing: r.receiver.facing,
      }),
      preparation: (r) => ({
        reception: r.receiver.reception,
        onBall: r.receiver.onBall,
        balance: r.receiver.balance,
      }),
      opponents: (r) => r.opponents,
      contact: (r) => ({ contacts: r.contacts, foot: r.foot, reception: r.receptionOutcome }),
      control: (r) => r.ball.ownerId ?? null,
      action: (r) => ({ action: r.action, index: r.decisionIndex }),
    };
    const first = Object.fromEntries(
      Object.entries(selectors).map(([name, select]) => {
        const index = arms[0].frames.findIndex(
          (r, i) => hash(select(r)) !== hash(select(arms[1].frames[i])),
        );
        return [
          name,
          index < 0
            ? null
            : {
                tick: index + 1,
                at: arms[0].frames[index].at,
                legacy: select(arms[0].frames[index]),
                corrected: select(arms[1].frames[index]),
              },
        ];
      }),
    );
    rows.push({
      config: original.config,
      releaseHash: hash(released),
      firstRecordedDivergence: first,
      arms,
      flags: Object.fromEntries(
        [
          'experimentalBoundedBallFlightBelief',
          'experimentalReceiverAnticipation',
          'experimentalActivePerception',
          'prospectiveMovement',
        ].map((k) => [k, released[k] ?? null]),
      ),
    });
  }
  finish({
    rows,
    preservedInputHash: hash(frozen),
    originalDiscordances: 10,
    definition:
      'First recorded divergence is exact at 40Hz, not proof of an isolated downstream cause. Full autonomous and physical-only fixed-receiver comparisons remain separate.',
  });
} else {
  const cases = [
    { name: 'rolling', vz: 0, height: 0.11 },
    { name: 'microscopic-hop', vz: 0.001, height: 0.11 },
    { name: 'one-centimetre-apex', vz: Math.sqrt(2 * 9.81 * 0.01), height: 0.11 },
    { name: 'low-repeated-bounce', vz: 1.2, height: 0.11 },
    { name: 'descending-to-roll', vz: -0.6, height: 0.2 },
    { name: 'spinning-impact', vz: -1, height: 0.2, spin: { x: 80, y: 40, z: 50 } },
  ];
  const rows = [];
  for (const c of cases) {
    let ball = {
      position: { x: 40, y: 34, z: c.height },
      velocity: { x: 7, y: 0, z: c.vz },
      spin: c.spin ?? { x: 0, y: 0, z: 0 },
      airborne: c.height > 0.11 || c.vz > 0,
      bounceCount: 0,
    };
    const initial = globalThis.structuredClone(ball),
      impacts = [],
      trajectory = [];
    for (let tick = 0; tick < 120; tick++) {
      ball = integrateBallFlight(ball, 0.025, environment, (event) =>
        impacts.push({ ...event, at: tick * 0.025 + event.at }),
      );
      trajectory.push({ at: (tick + 1) * 0.025, ball });
    }
    const f = createPr205Fixture('team', 7);
    let s = f.state;
    s.prospectiveMovement = 'observed-ball-contact-dev-v1';
    s.experimentalBoundedBallFlightBelief = true;
    s.experimentalReceiverAnticipation = true;
    s.experimentalReceiverSynchronisation = false;
    s.boundedReceiverRecovery = 'hold-local-v1';
    s.ballEnvironment = environment;
    s.actionCooldown = 1;
    s.ball = {
      ...s.ball,
      x: 40,
      y: 34,
      height: c.height,
      velocity: initial.velocity,
      spin: initial.spin,
      airborne: initial.airborne,
      bounceCount: 0,
      looseSince: s.time,
    };
    delete s.liveBallFlightRuntime;
    const initialHash = hash(s);
    const frames = [],
      samples = [],
      actions = [];
    const startAt = s.time;
    for (let tick = 0; tick < 240; tick++) {
      const previous = s;
      s = step(s, 0.025);
      const sample = sampleCanonicalOutcome(previous, s, 'original-delivery-v3');
      samples.push(sample);
      const actor = s.players.find((p) => p.id === f.actor.id);
      frames.push(
        globalThis.structuredClone({
          at: s.time,
          ball: s.ball,
          body: body(actor),
          sensor: s.liveBallFlightRuntime?.sensors[actor.id] ?? null,
          preparation: s.receptionPreparation ?? null,
          foot: s.lastGroundContact ?? null,
          reception: s.lastReceptionOutcome ?? null,
          contacts: sample.contacts,
        }),
      );
      if (s.decisionIndex !== previous.decisionIndex)
        actions.push({ at: s.time, action: s.currentAction, ball: s.ball });
    }
    const control = samples.find((r) => r.ownerId === f.actor.id);
    const one = control && samples.find((r) => r.at >= control.at + 1 - 1e-8);
    const team = s.players.filter((p) => p.team === f.actor.team).map((p) => p.id);
    rows.push({
      case: c,
      initial,
      impacts,
      trajectory,
      observedContinuation: {
        initialHash,
        startAt,
        receiverId: f.actor.id,
        firstMotionEvidenceAt: frames.find((r) => r.sensor?.belief?.velocity)?.at ?? null,
        firstTouchAt:
          samples.flatMap((r) => r.contacts).find((r) => r.actorId === f.actor.id)?.at ?? null,
        controlAt: control?.at ?? null,
        oneSecondSample: one ?? null,
        teamPossessionAtOneSecond: one ? team.includes(one.ownerId) : null,
        actions,
        frames,
        finalHash: hash(s),
      },
    });
  }
  finish({
    rows,
    environment,
    information:
      'Actual canonical optical acquisition only; no sighting, spin, future bounce or ownership injected. Initial trajectories are controlled engineering interventions.',
  });
}
