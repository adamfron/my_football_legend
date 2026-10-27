import process from 'node:process';
import console from 'node:console';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import {
  runCanonicalOutcomeTrial,
  sampleCanonicalOutcome,
  interpretCanonicalOutcome,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { evaluatePassDecision } from '../src/core/matchSimulation/passDecision.ts';
import { derivePassLaunchPlan } from '../src/core/matchSimulation/passLaunchPlan.ts';
import { projectFutureBallTrajectory } from '../src/core/matchSimulation/ballPhysics.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { angleForVector } from '../src/core/matchSimulation/playerOrientation.ts';
import { scoreCalibration } from '../src/core/matchSimulation/calibrationMetrics.ts';
import { hash, receipt, sourceForReplay } from './pr196Evidence.mjs';

const setSkill = (p, skill) => {
  for (const k of Object.keys(p.profile.attributes)) p.profile.attributes[k] = skill;
};
const names = [
  'safe_pass',
  'progressive_pass',
  'through_ball',
  'long_pass',
  'moving_defender',
  'wrong_direction',
  'bad_pass',
  'pressured_receiver',
  'diagonal_receiver',
  'full_speed_receiver',
  'closer_turning',
  'farther_accelerating',
  'two_defenders',
  'weak_receiver',
  'deflection_geometry',
  'diagonal_loft',
  'anticipating_defender',
  'early_offside',
  'unreachable_run',
  'late_delivery',
  'overhit_loft',
  'aerial_defender',
  'heavy_touch',
  'keeper_first',
];
const rows = [],
  frozen = [],
  sourceArchive = sourceForReplay(
    'docs/performance/pr196/passes-v5.json.gz',
    process.argv.includes('--check'),
  );
const compact = (samples) =>
  samples.filter(
    (s, i) =>
      i % 10 === 0 || s.contacts.length || s.ownerId || s.restart || i === samples.length - 1,
  );
for (const name of names)
  for (const [attacker, defender] of [
    [20, 20],
    [40, 40],
    [60, 60],
    [80, 80],
    [100, 100],
    [40, 80],
    [80, 40],
  ])
    for (const mirror of [false, true]) {
      const dynamic = names.indexOf(name) >= 15;
      const scenario = [
        'diagonal_receiver',
        'full_speed_receiver',
        'closer_turning',
        'farther_accelerating',
        'two_defenders',
        'weak_receiver',
        'deflection_geometry',
      ].includes(name)
        ? 'progressive_pass'
        : dynamic
          ? 'long_pass'
          : name;
      const f = createCalibrationFixture({
        scenario,
        attacker,
        defender,
        mirror,
        seed: `pr196-pass-${mirror ? 1 : 0}`,
      });
      const s = f.state,
        a = s.players.find((p) => p.id === f.actorId),
        r = s.players.find((p) => p.id === f.receiverId),
        d = s.players.find((p) => p.id === f.defenderId),
        sign = mirror ? -1 : 1;
      if (name === 'diagonal_receiver') r.velocity = { x: 4, y: -3 * sign };
      if (name === 'full_speed_receiver') r.velocity = { x: 8, y: 0 };
      if (name === 'closer_turning') {
        d.position = { x: 51, y: 34 };
        d.velocity = { x: -4, y: 0 };
        d.facingAngle = -Math.PI / 2;
      }
      if (name === 'farther_accelerating') {
        d.position = { x: 48, y: 34 + 3 * sign };
        d.velocity = { x: 4, y: 0 };
        d.facingAngle = Math.PI / 2;
      }
      if (name === 'two_defenders' || name === 'deflection_geometry') {
        d.position = { x: 48, y: 34 + 0.5 * sign };
        d.velocity = { x: 0, y: 2 * sign };
        const other = s.players.find(
          (p) => p.team === d.team && p.id !== d.id && p.slot.position !== 'goalkeeper',
        );
        other.position = { x: 55, y: 33 };
        other.target = { ...other.position };
      }
      if (name === 'weak_receiver') setSkill(r, 20);
      if (dynamic) {
        r.position = { x: 57, y: mirror ? 10 : 58 };
        r.velocity = { x: 5, y: -4 * sign };
        r.facingAngle = angleForVector(r.velocity);
        r.target = { x: 83, y: 34 - 5 * sign };
        r.anchor = { ...r.position };
        r.neutralAnchor = { ...r.position };
        f.action.target = { ...r.target };
        f.action.intent = 'through';
        f.action.requestedSpace = { ...r.target };
        d.position = { x: 68, y: 34 + 3 * sign };
        d.velocity = { x: -2, y: 0 };
        d.facingAngle = -Math.PI / 2;
        const second = s.players.find(
          (p) => p.team === d.team && p.id !== d.id && p.slot.position !== 'goalkeeper',
        );
        second.position = { x: 73, y: 34 - 7 * sign };
        second.target = { ...second.position };
        if (name === 'anticipating_defender') {
          d.velocity = { x: 4, y: 0 };
          d.facingAngle = Math.PI / 2;
          d.position.x = 76;
        }
        if (name === 'early_offside') {
          r.position = { x: 98, y: 34 };
          r.target = { x: 101, y: 34 };
          f.action.target = r.target;
        }
        if (name === 'unreachable_run') r.velocity = { x: -5, y: 0 };
        if (name === 'late_delivery') {
          r.velocity = { x: 7, y: -2 * sign };
          f.action.target = { x: 62, y: 50 };
        }
        if (name === 'overhit_loft') f.action.target = { x: 103, y: 3 };
        if (name === 'aerial_defender') {
          d.position = { x: 82, y: 30 };
          d.target = { ...d.position };
        }
        if (name === 'heavy_touch') setSkill(r, 20);
        if (name === 'keeper_first') {
          const k = s.players.find((p) => p.team === d.team && p.slot.position === 'goalkeeper');
          k.position = { x: 83, y: 29 };
          k.target = { ...k.position };
        }
      }
      const old = evaluatePassDecision(
          s,
          a,
          r,
          f.action.target,
          f.action.intent,
          f.action.delivery,
        ),
        corrected = evaluatePassDecision(
          { ...s, experimentalCanonicalArrival: true },
          a,
          r,
          f.action.target,
          f.action.intent,
          f.action.delivery,
        ),
        plan = derivePassLaunchPlan(s, a, r, f.action.target, f.action.intent, f.action.delivery),
        result = runCanonicalOutcomeTrial(s, f.action, 8);
      const released = resolveMatchAction(
        globalThis.structuredClone(s),
        f.action,
        'autonomous_npc',
      );
      const v = released.ball.velocity ?? { x: 0, y: 0, z: 0 };
      const trajectory = result.outcome.released
        ? projectFutureBallTrajectory(
            {
              position: {
                x: released.ball.x,
                y: released.ball.y,
                z: released.ball.height ?? 0.11,
              },
              velocity: { ...v, z: v.z ?? 0 },
              airborne: !!released.ball.airborne,
              bounceCount: released.ball.bounceCount ?? 0,
            },
            8,
            0.025,
          )
        : [];
      const nearest = trajectory.length
        ? trajectory.reduce((a, b) =>
            distance(a.ball.position, f.action.target) < distance(b.ball.position, f.action.target)
              ? a
              : b,
          )
        : null;
      rows.push({
        name,
        attacker,
        defender,
        mirror,
        seed: s.seed,
        inputHash: hash(s),
        action: f.action,
        actor: a,
        receiver: r,
        defenders: s.players
          .filter((p) => p.team !== a.team)
          .map((p) => ({
            id: p.id,
            position: p.position,
            velocity: p.velocity,
            facingAngle: p.facingAngle,
          })),
        old,
        corrected,
        plan,
        passDiagnostic: released.lastPassDiagnostic,
        release: {
          position: { x: released.ball.x, y: released.ball.y, z: released.ball.height ?? 0.11 },
          velocity: v,
        },
        freeFlightNearest: nearest,
        outcome: result.outcome,
        finalHash: hash(result.final),
        samplesHash: hash(result.samples),
        samples: compact(result.samples),
        bodies: result.bodies,
      });
      // Reuse one actual canonical release. Only reception capacity changes; the launched ball is identical.
      if (name === 'long_pass' && attacker === 60 && defender === 60 && !mirror)
        for (const receiverSkill of [20, 60, 100]) {
          let next = globalThis.structuredClone(released);
          setSkill(
            next.players.find((p) => p.id === r.id),
            receiverSkill,
          );
          const samples = [];
          for (let i = 0; i < 320; i++) {
            const before = next;
            next = step(next, 0.025);
            samples.push(sampleCanonicalOutcome(before, next));
          }
          frozen.push({
            receiverSkill,
            releasedBallHash: hash(released.ball),
            initialHash: hash({ ...released, players: next.players.map((p) => p.id) }),
            outcome: interpretCanonicalOutcome(result.contract, samples),
            finalHash: hash(next),
            samples: compact(samples),
          });
        }
      if (rows.length % 28 === 0) console.log('pass trials', rows.length, name);
    }
const scores = (xs, model, event, prediction) =>
  scoreCalibration(
    xs
      .filter((r) => r.outcome[event] !== null)
      .map((r) => ({ probability: r[model][prediction], outcome: r.outcome[event] })),
  );
const summary = Object.fromEntries(
  names.map((name) => {
    const xs = rows.filter((r) => r.name === name);
    return [
      name,
      {
        n: xs.length,
        released: xs.filter((r) => r.outcome.released).length,
        directTouch: xs.filter((r) => r.outcome.directReceiverTouch).length,
        deflectedTouch: xs.filter((r) => r.outcome.deflectedReceiverTouch).length,
        controlled: xs.filter((r) => r.outcome.receiverControl).length,
        retained: xs.filter((r) => r.outcome.teamPossessionAtOneSecond).length,
        defensiveContact: xs.filter((r) => r.outcome.defensiveContactAt !== null).length,
        defensiveControl: xs.filter((r) => r.outcome.defensiveControlAt !== null).length,
        completionDiagnostic: Object.fromEntries(
          ['old', 'corrected'].map((m) => [
            m,
            scores(xs, m, 'directReceiverTouch', 'expectedCompletion'),
          ]),
        ),
        retentionDiagnostic: Object.fromEntries(
          ['old', 'corrected'].map((m) => [
            m,
            scores(xs, m, 'teamPossessionAtOneSecond', 'expectedRetainedPossession'),
          ]),
        ),
      },
    ];
  }),
);
receipt(
  'docs/performance/pr196/passes-v5.json.gz',
  {
    schema: 'pr196-passes-v5',
    sourceArchive,
    eventContract:
      'original-delivery-v2; direct receiver touch and one-second endpoint separately; interrupted delivery never direct completion',
    probabilityQualification:
      'Unfitted historical probability claims compared as engineering diagnostics, not real-world calibration; no model fitting',
    limitations: [
      'dynamic labels describe initial geometry, not guaranteed behaviours or outcomes',
      'no lawful free-kick variant claimed',
      'frozen release factor isolates receiver capacity; full seven-factor decomposition remains open',
      'mirroring and seeds are paired/clustered; no independent confirmation',
    ],
    rows,
    frozen,
    summary,
  },
  process.argv.includes('--check'),
);
console.log(JSON.stringify(summary));
