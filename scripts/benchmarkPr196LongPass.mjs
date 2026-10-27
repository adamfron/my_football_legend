import process from 'node:process';
import console from 'node:console';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import {
  runCanonicalOutcomeTrial,
  sampleCanonicalOutcome,
  interpretCanonicalOutcome,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { derivePassLaunchPlan } from '../src/core/matchSimulation/passLaunchPlan.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { projectFutureBallTrajectory } from '../src/core/matchSimulation/ballPhysics.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { hash, receipt, sourceForReplay } from './pr196Evidence.mjs';
const skill = (p, n) => {
  for (const k of Object.keys(p.profile.attributes)) p.profile.attributes[k] = n;
};
const rows = [],
  original = [],
  frozen = [],
  sourceArchive = sourceForReplay(
    'docs/performance/pr196/long-pass-v4.json.gz',
    process.argv.includes('--check'),
  );
const trial = (f, label, factor) => {
  const a = f.state.players.find((p) => p.id === f.actorId),
    r = f.state.players.find((p) => p.id === f.receiverId);
  const plan = derivePassLaunchPlan(
    f.state,
    a,
    r,
    f.action.target,
    f.action.intent,
    f.action.delivery,
  );
  const released = resolveMatchAction(
    globalThis.structuredClone(f.state),
    f.action,
    'autonomous_npc',
  );
  const result = runCanonicalOutcomeTrial(f.state, f.action, 8),
    v = released.ball.velocity;
  const flight = v
    ? projectFutureBallTrajectory(
        {
          position: { x: released.ball.x, y: released.ball.y, z: released.ball.height ?? 0.11 },
          velocity: { ...v, z: v.z ?? 0 },
          airborne: !!released.ball.airborne,
          bounceCount: released.ball.bounceCount ?? 0,
        },
        8,
        0.025,
      )
    : [];
  const nearest = flight.length
    ? flight.reduce((a, b) =>
        distance(a.ball.position, f.action.target) < distance(b.ball.position, f.action.target)
          ? a
          : b,
      )
    : null;
  const xs = result.samples.map((x) => ({
    at: x.at,
    ball: x.ball,
    ownerId: x.ownerId,
    contacts: x.contacts,
  }));
  const row = {
    label,
    factor,
    config: f.config,
    designatedDefenderId: f.defenderId,
    designatedDefenderContact: result.samples.some(
      (s) =>
        s.at <= (result.outcome.terminalAt ?? Infinity) &&
        s.contacts.some((c) => c.actorId === f.defenderId && c.at > result.contract.releasedAt),
    ),
    inputHash: hash(f.state),
    action: f.action,
    plan,
    actualDiagnostic: released.lastPassDiagnostic,
    release: { ball: released.ball, receiver: r },
    freeFlightNearest: nearest,
    freeFlightMiss: nearest ? distance(nearest.ball.position, f.action.target) : null,
    outcome: result.outcome,
    bodies: result.bodies,
    finalHash: hash(result.final),
    samplesHash: hash(result.samples),
    samples: xs.filter((x, i) => i % 10 === 0 || x.contacts.length || i === xs.length - 1),
  };
  return { row, released, result };
};
// Exact 28 long-pass inputs from the frozen development pilot; independent inputs stay sealed.
for (const [attacker, defender] of [
  [20, 20],
  [40, 40],
  [60, 60],
  [80, 80],
  [100, 100],
  [40, 80],
  [80, 40],
])
  for (const seed of ['pr195-development-0', 'pr195-development-1'])
    for (const mirror of [false, true]) {
      const f = createCalibrationFixture({
        scenario: 'long_pass',
        attacker,
        defender,
        seed,
        mirror,
      });
      original.push(trial(f, 'original_pr195', { attacker, defender, seed, mirror }).row);
    }
const factors = {
  launcher: [20, 60, 100],
  receiver: [20, 60, 100],
  distance: [20, 30, 42, 55],
  receiverMovement: ['standing', 'toward', 'away', 'diagonal'],
  defenderPresence: ['original', 'lane', 'remote_primary', 'remote_all'],
  trajectory: ['ground', 'lofted'],
  preparation: ['ready', 'late'],
};
for (const [factor, values] of Object.entries(factors))
  for (const value of values) {
    const f = createCalibrationFixture({
        scenario: 'long_pass',
        attacker: 60,
        defender: 60,
        seed: 'pr195-development-0',
      }),
      a = f.state.players.find((p) => p.id === f.actorId),
      r = f.state.players.find((p) => p.id === f.receiverId),
      d = f.state.players.find((p) => p.id === f.defenderId);
    if (factor === 'launcher') skill(a, value);
    if (factor === 'receiver') skill(r, value);
    if (factor === 'distance') {
      r.position = { x: a.position.x + value, y: a.position.y };
      r.target = { ...r.position };
      f.action.target = { ...r.position };
    }
    if (factor === 'receiverMovement')
      r.velocity =
        value === 'toward'
          ? { x: -4, y: 0 }
          : value === 'away'
            ? { x: 4, y: 0 }
            : value === 'diagonal'
              ? { x: 3, y: -3 }
              : { x: 0, y: 0 };
    if (factor === 'defenderPresence') {
      if (value === 'lane') d.position = { x: 62, y: 29 };
      if (value === 'remote_primary') d.position = { x: 100, y: 65 };
      if (value === 'remote_all')
        for (const [i, p] of f.state.players.filter((p) => p.team !== a.team).entries()) {
          p.position = { x: 100, y: 3 + i * 5.5 };
          p.target = { ...p.position };
          p.anchor = { ...p.position };
          p.neutralAnchor = { ...p.position };
        }
      d.target = { ...d.position };
    }
    if (factor === 'trajectory') f.action.delivery = value;
    if (factor === 'preparation' && value === 'late') {
      r.facingAngle = -Math.PI / 2;
    }
    rows.push(trial(f, factor, value).row);
  }
const base = createCalibrationFixture({
    scenario: 'long_pass',
    attacker: 60,
    defender: 60,
    seed: 'pr195-development-0',
  }),
  ref = trial(base, 'frozen_release', 'original');
for (const receiverSkill of [20, 60, 100])
  for (const preparation of ['canonical', 'delayed_awareness']) {
    let s = globalThis.structuredClone(ref.released);
    skill(
      s.players.find((p) => p.id === base.receiverId),
      receiverSkill,
    );
    if (preparation === 'delayed_awareness' && s.receptionPreparation)
      s.receptionPreparation.awarenessAt += 1;
    const initialHash = hash(s),
      samples = [];
    for (let tick = 0; tick < 320; tick++) {
      const previous = s;
      s = step(s, 0.025);
      samples.push(sampleCanonicalOutcome(previous, s));
    }
    frozen.push({
      receiverSkill,
      preparation,
      initialHash,
      ballHash: hash(ref.released.ball),
      outcome: interpretCanonicalOutcome(ref.result.contract, samples),
      finalHash: hash(s),
      samplesHash: hash(samples),
    });
  }
receipt(
  'docs/performance/pr196/long-pass-v4.json.gz',
  {
    schema: 'pr196-long-pass-v4',
    sourceArchive,
    method:
      'Exact original inputs plus one factor at a time; frozen released-state branches preserve the identical real launched ball',
    limitations: [
      'preparation factor varies initial orientation; frozen release separately varies awareness',
      'remote defender geometry is an initial condition, not disabled defending',
      'one-factor development probes, not a fitted causal population model',
    ],
    original,
    rows,
    frozen,
  },
  process.argv.includes('--check'),
);
console.log(
  'long-pass decomposition',
  original.length,
  'original inputs',
  rows.length,
  'factor conditions',
  frozen.length,
  'same-ball branches',
);
