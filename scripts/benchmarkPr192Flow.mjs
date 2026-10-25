import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import process from 'node:process';
import { readPr192Evidence } from './readPr192Evidence.mjs';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { awardNaturalRestart } from '../src/core/matchSimulation/restartScenarios.ts';
import { chooseFreeKickTaker } from '../src/core/matchSimulation/restartGeometry.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { NaturalMatchFlowDiagnostics } from '../src/core/matchSimulation/naturalMatchFlowDiagnostics.ts';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry.ts';
import {
  executeSurfaceContact,
  surfaceRequestSchema,
} from '../src/core/matchSimulation/ballSurfaceContact.ts';
const out =
  process.argv.find((a) => a.startsWith('--output='))?.slice(9) ??
  'docs/performance/pr192/natural-flow-laboratory-v5.json';
const check = process.argv.includes('--check');
if (!check && existsSync(out)) throw Error('Refusing to overwrite ' + out);
const old = JSON.parse(
  readFileSync('docs/performance/PR188-match-dev-ww-state-value-v1-full-observed-final-v1.json'),
);
const initial = JSON.parse(gunzipSync(readFileSync(old.archive))).input;
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const setup = (id) => {
  const s = globalThis.structuredClone(initial);
  s.seed = 'pr192:apparatus:' + id;
  s.time = 0;
  s.status = 'first_half';
  s.scenario = 'open_play';
  s.playerAgencyEnabled = false;
  s.actionCooldown = 10;
  for (const k of [
    'restart',
    'postGoal',
    'onBallPreparation',
    'receptionPreparation',
    'pendingPlayerDecision',
    'ballCarrierIntent',
    'playerMovementIntent',
    'lastBoundaryCrossing',
    'lastBoundaryRestart',
    'lastRestartAward',
    'stoppageLedger',
    'lastGroundContact',
    'lastBallContact',
    'timekeeping',
  ])
    delete s[k];
  for (const [i, p] of s.players.entries()) {
    p.position = { x: 10 + i * 3, y: 55 + (i % 3) * 3 };
    p.target = { ...p.position };
    p.velocity = { x: 0, y: 0 };
  }
  return s;
};
const home = initial.players.find((p) => p.team === 'home' && p.slot.position !== 'goalkeeper').id;
const away = initial.players.find((p) => p.team === 'away' && p.slot.position !== 'goalkeeper').id;
const rows = [];
const run = (id, s, seconds, contact = null) => {
  tacticalMatchStateSchema.parse(s);
  const input = globalThis.structuredClone(s),
    diagnostics = new NaturalMatchFlowDiagnostics();
  const execute = (observe) => {
    let state = globalThis.structuredClone(input);
    for (let i = 0; i < Math.ceil(seconds / 0.025); i++) {
      const before = state;
      state = step(state, 0.025);
      if (observe) diagnostics.observe(before, state);
      if (state.lastRestartAward || state.postGoal || state.status !== 'first_half') break;
    }
    return state;
  };
  const after = execute(true),
    bare = execute(false);
  if (hash(after) !== hash(bare)) throw Error('Flow observer changed state ' + id);
  const row = {
    id,
    provenance: 'prescribed apparatus; not a captured match replay',
    seed: s.seed,
    inputHash: hash(input),
    contact,
    finalHash: hash(after),
    observerNeutral: true,
    elapsed: after.time,
    award: after.lastRestartAward ?? null,
    crossing: after.lastBoundaryCrossing ?? null,
    lastContact: after.lastBallContact ?? null,
    ball: after.ball,
    diagnostics: diagnostics.snapshot(),
  };
  rows.push(row);
  console.log(
    id,
    after.lastBoundaryRestart ?? after.postGoal?.scoringTeam ?? 'in_play',
    after.lastBallContact?.kind ?? '',
    after.time.toFixed(3),
  );
};
for (const [id, position, velocity, last] of [
  ['ground-parallel', { x: 52, y: 0.2, z: 0.11 }, { x: 12, y: 0, z: 0 }, home],
  ['ground-angled', { x: 52, y: 0.2, z: 0.11 }, { x: 8, y: -4, z: 0 }, home],
  ['fast-aerial', { x: 52, y: 0.2, z: 2 }, { x: 10, y: -8, z: 2 }, home],
  ['inaccurate-cross-field', { x: 50, y: 67, z: 2 }, { x: 15, y: 10, z: 4 }, home],
  ['goal-line-attacker', { x: 104.5, y: 45, z: 0.11 }, { x: 12, y: 0, z: 0 }, home],
  ['goal-line-defender', { x: 104.5, y: 45, z: 0.11 }, { x: 12, y: 0, z: 0 }, away],
  ['loose-recovery-near-line', { x: 52, y: 0.3, z: 0.11 }, { x: 3, y: -2, z: 0 }, home],
]) {
  const s = setup(id);
  s.ball = {
    x: position.x,
    y: position.y,
    height: position.z,
    velocity,
    airborne: position.z > 0.11,
    bounceCount: 0,
    lastTouchPlayerId: last,
    looseSince: 0,
  };
  if (id === 'loose-recovery-near-line') {
    const p = s.players.find((p) => p.id === home);
    p.position = { x: 53, y: 0.4 };
    p.target = { x: 52, y: 0.3 };
  }
  run(id, s, id === 'ground-parallel' ? 0.5 : 1);
}
for (const [id, surface, impulse] of [
  ['standing-tackle-near-line', 'inside', { x: 0, y: -7, z: 0 }],
  ['clearance-near-line', 'instep', { x: 1, y: -12, z: 2 }],
  ['shin-deflection-near-line', 'lower_leg', { x: 0, y: 0, z: 0 }],
]) {
  const s = setup(id),
    p = s.players.find((p) => p.id === away);
  p.position = { x: 52, y: 0.6 };
  p.facingAngle = Math.PI;
  const foot = playerContactGeometry(p).rightFoot;
  s.ball = {
    ...foot,
    height: 0.11,
    velocity: { x: 2, y: 5, z: 0 },
    lastTouchPlayerId: home,
    looseSince: 0,
  };
  const receipt = executeSurfaceContact(
    s,
    p,
    surfaceRequestSchema.parse({
      objective: 'deflect',
      intendedSurface: surface,
      foot: 'right',
      desiredVelocity: impulse,
      preparationSeconds: 0.6,
      readyAt: 0,
    }),
  );
  if (receipt.executed) {
    s.ball.velocity = receipt.outgoingVelocity;
    s.ball.spin = receipt.outgoingSpin;
    s.ball.lastTouchPlayerId = p.id;
  }
  run(id, s, 1, receipt);
}
for (const [id, y, z, body] of [
  ['legal-goal', 34, 0.8, 'none'],
  ['post', 30.34, 0.8, 'none'],
  ['crossbar', 34, 2.44, 'none'],
  ['outfield-block', 34, 0.3, 'defender'],
  ['body-deflection', 34, 1.2, 'defender'],
  ['keeper-save', 34, 0.8, 'keeper'],
  ['keeper-parry', 36.5, 1.5, 'keeper'],
  ['keeper-fast-arrival', 34, 2, 'keeper'],
  ['cross-hits-defender', 36, 1.4, 'defender'],
  ['high-ball-across-area', 45, 5, 'none'],
]) {
  const s = setup(id);
  s.ball = {
    x: 101,
    y,
    height: z,
    airborne: true,
    bounceCount: 0,
    velocity: { x: 24, y: 0, z: 0 },
    lastTouchPlayerId: home,
    looseSince: 0,
  };
  if (body !== 'none') {
    const p = s.players.find(
      (p) =>
        p.team === 'away' && (body === 'keeper' ? p.slot.position === 'goalkeeper' : p.id === away),
    );
    p.position = { x: 103, y };
    p.target = { ...p.position };
    p.facingAngle = -Math.PI / 2;
  }
  if (!['cross-hits-defender', 'high-ball-across-area'].includes(id)) {
    delete s.ball.looseSince;
    s.ball = {
      ...s.ball,
      travelKind: 'shot',
      from: { x: 101, y },
      target: { x: 107, y },
      launchVelocity: { x: 24, y: 0, z: 0 },
      launchSpeed: 24,
      launchElevation: 0,
      flightTime: 0,
      distanceTravelled: 0,
      shot: {
        shotId: 'pr192:' + id,
        shooterId: home,
        releasedAt: 0,
        context: 'open_play',
        distance: 4,
        angle: 1,
        pressure: 0,
        blockingDefenders: body === 'defender' ? 1 : 0,
        baseXg: 0.1,
        effectiveScoringExpectation: 0.1,
        shooterExecutionQuality: 0.8,
        intendedTarget: { horizontal: 0, vertical: 0.3 },
        actualTarget: { horizontal: 0, vertical: 0.3 },
        error: { horizontal: 0, vertical: 0 },
        speed: 24,
        classification: 'on_target',
      },
    };
  }
  run(id, s, 0.5);
}
const restartRows = [];
for (const preparation of [false, true])
  for (const [scenario, ceremonial, indirect, nearby = false] of [
    ['throw_in', false, false],
    ['goal_kick', false, false],
    ['corner', true, false],
    ['free_kick', false, false],
    ['free_kick', true, false],
    ['free_kick', true, true],
    ['penalty', true, false],
    ['kick_off', true, false],
    ['throw_in', false, false, true],
    ['free_kick', false, false, true],
  ]) {
    let s = setup('restart-' + scenario + '-' + ceremonial + '-' + indirect + '-' + nearby);
    if (preparation) s.experimentalRestartPreparation = true;
    const point =
      scenario === 'throw_in'
        ? { x: 50, y: 0 }
        : scenario === 'corner'
          ? { x: 105, y: 0 }
          : scenario === 'goal_kick'
            ? { x: 0, y: 34 }
            : { x: 75, y: 34 };
    s.ball = { ...point, height: 0.11, velocity: { x: 0, y: 0, z: 0 }, lastTouchPlayerId: away };
    if (nearby) {
      const taker = scenario.startsWith('free_kick')
        ? chooseFreeKickTaker(s, 'home')
        : s.players.find((p) => p.id === home);
      taker.position = { ...point };
      taker.target = { ...point };
      const receiver = s.players.find(
        (p) => p.team === 'home' && p.id !== taker.id && p.slot.position !== 'goalkeeper',
      );
      receiver.position = { x: point.x + 6, y: point.y + 3 };
      receiver.target = { ...receiver.position };
    }
    // Restart apparatus begins with an explicitly prescribed lawful award, separate
    // from the boundary experiments above. It does not claim a generated infringement.
    s = awardNaturalRestart(s, scenario, {
      restartTeam: 'home',
      restartPoint: point,
      incidentId: s.seed,
      eventAt: 0,
      cause: 'bookkeeping',
      ceremonial,
      indirect,
    });
    tacticalMatchStateSchema.parse(s);
    const input = globalThis.structuredClone(s),
      d = new NaturalMatchFlowDiagnostics();
    const pickupTrace = [];
    let executedAt = null;
    for (let i = 0; i < 2400 && executedAt === null; i++) {
      const before = s;
      s = step(s, 0.025);
      d.observe(before, s);
      executedAt =
        s.restart?.executedAt ??
        s.stoppageLedger?.intervals.find((interval) => interval.awardId === input.restart.awardId)
          ?.executedAt ??
        null;
      if (scenario === 'throw_in' && (i % 4 === 0 || s.restart?.executedAt !== undefined))
        pickupTrace.push({
          at: s.time,
          height: s.ball.height ?? 0,
          stage: s.restart?.retrieval?.stage ?? null,
          executed: s.restart?.executedAt !== undefined,
        });
    }
    restartRows.push({
      scenario,
      ceremonial,
      indirect,
      nearby,
      preparation,
      pickupTrace,
      provenance: 'prescribed restart-preparation apparatus, not a generated incident',
      inputHash: hash(input),
      seed: input.seed,
      elapsed: s.time,
      executedAt,
      phase: s.restart?.phase ?? null,
      blockers: s.restart?.readiness?.blockers ?? [],
      report: d.report(s),
    });
  }
const result = {
  schema: 'mfl-pr192-natural-flow-v1',
  baseline: '9ea0e599f72800f4210092df2722e2ee16778ab7',
  baseInputArchive: old.archive,
  baseInputHash: hash(initial),
  scriptHash: hash(readFileSync('scripts/benchmarkPr192Flow.mjs', 'utf8').replaceAll('\r\n', '\n')),
  classification: 'development apparatus; no physics retuning or event injection',
  rows,
  restartRows,
};
if (check) {
  if (hash(readPr192Evidence(out)) !== hash(result)) throw Error('Flow evidence drift');
} else writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
