import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import console from 'node:console';
import { pushedTouchFixture } from './pr168Fixtures.ts';
import { createSpatialFixture } from './pr181SpatialFixtures.ts';
import { createFormationBenchmarkMatch } from '../src/core/matchSimulation/benchmarkFixtures.ts';
import { deriveCarryPursuit } from '../src/core/matchSimulation/carryPursuit.ts';
import {
  projectCarryOpportunity,
  enumerateCarryChoices,
} from '../src/core/matchSimulation/carryOpportunity.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  rankAvailableActionsForAI,
  resolveMatchAction,
} from '../src/core/matchSimulation/matchActions.ts';
import {
  deriveGoalkeeperApproach,
  deriveGoalkeeperBasePosition,
} from '../src/core/matchSimulation/goalkeeperPositioning.ts';
import { isMatchGoalkeeper } from '../src/core/matchSimulation/matchGoalkeeper.ts';
import { arbitrateGoalkeeperClaim } from '../src/core/matchSimulation/goalkeeperClaim.ts';
import { goalkeeperIntervention } from '../src/core/matchSimulation/aerialPlay.ts';
import { changeTacticalRole } from '../src/core/matchSimulation/tacticalRoles.ts';
import { deriveTacticalTargets } from '../src/core/matchSimulation/tacticalPositioning.ts';
import { runShotParityBenchmark } from '../src/core/matchSimulation/shotParityBenchmark.ts';
import { digest, pr183SourceHash } from './pr183Evidence.mjs';

const sourceHash = pr183SourceHash(),
  carry = [];
for (const name of [
  'fast-open',
  'fast-v-slow',
  'technical-pressure',
  'strong-burst',
  'poor-dribbler',
  'too-far',
  'defender-recovery',
  'human-sprint',
  'collision',
]) {
  const f = pushedTouchFixture({ loose: true, gap: name === 'too-far' ? 20 : 2.6 }),
    actor = f.state.players.find((p) => p.id === f.actorId);
  let state = f.state;
  state.playerAgencyEnabled = name === 'human-sprint';
  state.ballCarrierIntent.humanSelected = name === 'human-sprint';
  const defender = state.players.find((p) => p.team !== actor.team && !isMatchGoalkeeper(p));
  if (['fast-open', 'fast-v-slow'].includes(name))
    Object.assign(actor.profile.attributes, {
      pace: 95,
      agility: 90,
      dribbling: 85,
      technique: 85,
    });
  if (name === 'fast-v-slow') {
    defender.position = { x: actor.position.x + 6, y: actor.position.y + 1.2 };
    defender.facingAngle = -Math.PI / 2;
    defender.profile.attributes.pace = 35;
  }
  if (name === 'technical-pressure') {
    Object.assign(actor.profile.attributes, { dribbling: 95, technique: 95, agility: 90 });
    defender.position = { x: actor.position.x + 3, y: actor.position.y + 1.4 };
  }
  if (name === 'strong-burst') {
    Object.assign(actor.profile.attributes, { strength: 95, pace: 85 });
    defender.position = { x: actor.position.x - 1.5, y: actor.position.y + 1 };
  }
  if (name === 'poor-dribbler')
    Object.assign(actor.profile.attributes, {
      dribbling: 20,
      technique: 20,
      firstTouch: 20,
      agility: 35,
    });
  if (name === 'defender-recovery') {
    defender.position = { x: actor.position.x - 1, y: actor.position.y + 1 };
    defender.velocity = { x: 8, y: 0 };
    defender.profile.attributes.pace = 95;
  }
  if (name === 'collision') {
    defender.position = { x: state.ball.x + 0.3, y: state.ball.y };
    defender.velocity = { x: -4, y: 0 };
  }
  const initialHash = digest(state),
    start = state.time,
    origin = { ...actor.position },
    pursuit = deriveCarryPursuit(state, actor),
    forecast = projectCarryOpportunity(state, actor, { x: 85, y: 34 }, 'sprint');
  let recoveredAt, contactAt;
  const trajectory = [];
  for (let tick = 0; tick < 320; tick++) {
    state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    if (state.ball.ownerId === actor.id && recoveredAt === undefined) recoveredAt = state.time;
    if (
      state.lastGroundContact?.actorId === actor.id &&
      state.lastGroundContact.executed &&
      state.lastGroundContact.at >= start &&
      contactAt === undefined
    )
      contactAt = state.lastGroundContact.at;
    if (tick % 10 === 0) {
      const body = state.players.find((p) => p.id === actor.id);
      trajectory.push({
        at: state.time,
        body: body.position,
        velocity: body.velocity,
        ball: { x: state.ball.x, y: state.ball.y, ownerId: state.ball.ownerId },
        pursuing: state.ballCarrierIntent?.pursuingBall,
      });
    }
  }
  const end = state.players.find((p) => p.id === actor.id);
  carry.push({
    name,
    initialHash,
    initialPursuit: pursuit,
    forecast,
    recoveredAfter: recoveredAt === undefined ? null : recoveredAt - start,
    contactAfter: contactAt === undefined ? null : contactAt - start,
    finalOwner: state.ball.ownerId ?? null,
    playerProgress: end.position.x - origin.x,
    lastLoss: state.lastPossessionLoss,
    trajectory,
  });
}
writeFileSync(
  'docs/performance/PR183-closure-carry-recovery.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-carry-v1',
      sourceHash,
      scope:
        'nine prescribed physical continuations, eight seconds each; human-sprint is a mechanics probe, browser human gameplay is separate',
      rows: carry,
    },
    null,
    2,
  ) + '\n',
);

const wings = [];
for (const [name, role, blocked] of [
  ['traditional-open', 'traditional_winger', false],
  ['inside-open', 'inside_forward', false],
  ['playmaker-support', 'wide_playmaker', false],
  ['defensive-fullback', 'defensive_fullback', false],
  ['overlap', 'attacking_fullback', false],
  ['byline-covered', 'traditional_winger', true],
  ['byline-exposed', 'traditional_winger', false],
]) {
  const f = createSpatialFixture(name === 'overlap' ? 'overlap' : 'wing-backward');
  let state = f.state;
  const actor =
    name.includes('fullback') || name === 'overlap'
      ? state.players.find((p) => p.team === 'home' && p.slot.position === 'left_back')
      : f.runner;
  state = changeTacticalRole(state, actor.id, role);
  state.decisionPolicy = 'phase-role-hybrid-v1';
  if (blocked) f.defender.position = { x: actor.position.x + 8, y: 3 };
  state.ball = {
    x: actor.position.x + 0.35,
    y: actor.position.y,
    ownerId: actor.id,
    lastTouchPlayerId: actor.id,
  };
  const choices = enumerateCarryChoices(state, actor),
    ranked = rankAvailableActionsForAI(state, actor.id);
  wings.push({
    name,
    role,
    position: actor.position,
    choices,
    ranked: ranked
      .slice(0, 6)
      .map((r) => ({ type: r.action.type, target: r.action.target, score: r.score })),
    movement: deriveTacticalTargets(state)
      .filter((p) => p.team === actor.team)
      .map((p) => ({ id: p.id, target: p.target, spatial: p.spatialMovement })),
  });
}
writeFileSync(
  'docs/performance/PR183-closure-wing-routes.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-wing-v1',
      sourceHash,
      scope: 'seven role/coverage screens; candidate availability is not a completed byline run',
      rows: wings,
    },
    null,
    2,
  ) + '\n',
);

const template = createFormationBenchmarkMatch({
  anchor: '4-3-3',
  opponent: '4-4-2',
  seed: 'pr183-shots',
  attributes: 72,
}).state;
const shots = [];
for (const metres of [12, 22, 30])
  for (const lateral of [0, 14])
    for (const skill of [40, 85])
      for (const keeperSkill of [40, 85])
        for (const pressure of [false, true])
          for (let repeat = 0; repeat < 4; repeat++) {
            let state = globalThis.structuredClone(template);
            delete state.restart;
            delete state.onBallPreparation;
            state.scenario = 'open_play';
            state.time = 600;
            state.actionCooldown = 60;
            state.playerAgencyEnabled = false;
            state.seed = `pr183-equivalent-shot:${repeat}`;
            for (const p of state.players) {
              p.position = { x: p.team === 'home' ? 20 : 40, y: 7 };
              p.target = { ...p.position };
              p.velocity = { x: 0, y: 0 };
            }
            const shooter = state.players.find(
                (p) => p.team === 'home' && p.slot.position === 'striker',
              ),
              keeper = state.players.find((p) => p.team === 'away' && isMatchGoalkeeper(p)),
              defender = state.players.find((p) => p.team === 'away' && !isMatchGoalkeeper(p));
            shooter.position = { x: 105 - metres, y: 34 + lateral };
            shooter.target = { ...shooter.position };
            shooter.facingAngle = Math.PI / 2;
            Object.assign(shooter.profile.attributes, {
              finishing: skill,
              technique: skill,
              composure: skill,
              agility: skill,
            });
            keeper.position = { x: 101, y: 34 };
            keeper.target = { ...keeper.position };
            keeper.facingAngle = -Math.PI / 2;
            Object.assign(keeper.profile.attributes, {
              reflexes: keeperSkill,
              agility: keeperSkill,
              handling: keeperSkill,
              concentration: keeperSkill,
              positioning: keeperSkill,
              oneOnOnes: keeperSkill,
            });
            if (pressure)
              defender.position = { x: shooter.position.x - 1.3, y: shooter.position.y + 0.7 };
            state.ball = {
              ...shooter.position,
              ownerId: shooter.id,
              lastTouchPlayerId: shooter.id,
              height: 0.11,
            };
            state.possessionTeam = 'home';
            const keeperStart = { ...keeper.position };
            state = resolveMatchAction(
              state,
              {
                type: 'shot',
                actorId: shooter.id,
                target: { x: 105, y: 34 },
                intent: 'placed',
                goalTarget: { horizontal: repeat % 2 ? -0.55 : 0.55, vertical: 0.3 },
              },
              'autonomous_npc',
            );
            const launch = state.ball.shot;
            if (!launch) throw Error('Prescribed equivalent shot did not release physically');
            for (
              let tick = 0;
              tick < 240 && (!state.lastShot?.outcome || state.lastShot.shotId !== launch.shotId);
              tick++
            )
              state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
            shots.push({
              metres,
              lateral,
              skill,
              keeperSkill,
              pressure,
              repeat,
              shot: launch,
              outcome:
                state.lastShot?.shotId === launch.shotId
                  ? (state.lastShot.outcome ?? 'censored')
                  : 'censored',
              keeperStart,
              keeperEnd: state.players.find((p) => p.id === keeper.id)?.position,
              contact: state.lastBallContact,
            });
          }
writeFileSync(
  'docs/performance/pr183-evidence/closure-controlled-shots.json.gz',
  gzipSync(JSON.stringify(shots)),
);
const grouped = (key) =>
  [...new Set(shots.map((s) => s[key]))].map((value) => {
    const rows = shots.filter((s) => s[key] === value);
    return {
      value,
      attempts: rows.length,
      outcomes: Object.fromEntries(
        [...new Set(rows.map((s) => s.outcome))].map((outcome) => [
          outcome,
          rows.filter((s) => s.outcome === outcome).length,
        ]),
      ),
      meanHorizontalSigma:
        rows.reduce((n, s) => n + s.shot.executionErrorProfile.horizontalSigmaMetres, 0) /
        rows.length,
    };
  });
const parity = runShotParityBenchmark(template, {
  seedFamily: 'pr183-human-npc-parity',
  repeats: 2,
});
writeFileSync(
  'docs/performance/PR183-closure-controlled-shooting.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-shooting-v1',
      sourceHash,
      attempts: shots.length,
      scope:
        '192 paired-noise prescribed shots; finite canonical releases and first physical outcome, not a league conversion estimate',
      byDistance: grouped('metres'),
      byAngle: grouped('lateral'),
      bySkill: grouped('skill'),
      byKeeper: grouped('keeperSkill'),
      byPressure: grouped('pressure'),
      humanNpcParity: parity,
    },
    null,
    2,
  ) + '\n',
);

const keepers = [];
for (const name of [
  'central',
  'diagonal',
  'pushed-ball',
  'last-defender-beaten',
  'close-preparation',
  'six-yard-cross',
  'deep-aerial',
  'second-ball',
  'covered',
  'human-attacker',
]) {
  let state = globalThis.structuredClone(template);
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 600;
  state.playerAgencyEnabled = false;
  const keeper = state.players.find((p) => p.team === 'away' && isMatchGoalkeeper(p)),
    attacker = state.players.find((p) => p.team === 'home' && p.slot.position === 'striker');
  for (const p of state.players) {
    p.position = { x: 40, y: 8 };
    p.target = { ...p.position };
    p.velocity = { x: 0, y: 0 };
  }
  keeper.position = { x: 102, y: 34 };
  keeper.target = { ...keeper.position };
  keeper.facingAngle = -Math.PI / 2;
  attacker.position = {
    x: name === 'close-preparation' ? 94 : 83,
    y: name === 'diagonal' ? 47 : 34,
  };
  attacker.velocity = { x: 5, y: 0 };
  attacker.facingAngle = Math.PI / 2;
  state.ball = {
    x: attacker.position.x + 0.5,
    y: attacker.position.y,
    ownerId: attacker.id,
    lastTouchPlayerId: attacker.id,
  };
  state.possessionTeam = 'home';
  if (name === 'covered')
    state.players.find((p) => p.team === 'away' && !isMatchGoalkeeper(p)).position = {
      x: attacker.position.x + 0.5,
      y: attacker.position.y,
    };
  if (name === 'human-attacker') {
    state.playerAgencyEnabled = true;
    state.controlledFootballerId = attacker.id;
  }
  if (['pushed-ball', 'second-ball'].includes(name)) {
    delete state.ball.ownerId;
    state.ball.x = 96;
    state.ball.velocity = { x: 3, y: 0 };
    state.ball.looseSince = state.time;
  }
  if (['six-yard-cross', 'deep-aerial'].includes(name)) {
    delete state.ball.ownerId;
    state.ball.x = 96;
    state.ball.y = 34;
    state.ball.height = 2;
    state.ball.airborne = true;
    state.ball.travelKind = 'cross';
    state.ball.target = { x: 98, y: 34 };
    state.ball.velocity = { x: 3, y: 0, z: -1 };
  }
  const approach = deriveGoalkeeperApproach(state, keeper),
    arbitration = arbitrateGoalkeeperClaim(state, keeper, state.ball),
    aerial = state.ball.airborne ? goalkeeperIntervention(state, state.ball.target) : undefined;
  const before = { ...keeper.position };
  for (let tick = 0; tick < 40; tick++) state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
  const end = state.players.find((p) => p.id === keeper.id);
  keepers.push({
    name,
    base: deriveGoalkeeperBasePosition(state.ball, keeper),
    approach,
    arbitration,
    aerial,
    initial: before,
    end: end.position,
    velocity: end.velocity,
    shot: state.ball.shot ?? state.lastShot,
  });
}
writeFileSync(
  'docs/performance/PR183-closure-goalkeeper-1v1.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-keeper-v1',
      sourceHash,
      scope:
        'ten prescribed one-second canonical continuations, advisory geometry never grants possession',
      rows: keepers,
    },
    null,
    2,
  ) + '\n',
);
if (pr183SourceHash() !== sourceHash) throw Error('Production changed during football probes');
console.log(
  JSON.stringify({
    carry: carry.length,
    wings: wings.length,
    shots: shots.length,
    keeperSituations: keepers.length,
    parityPairs: parity.pairs,
  }),
);
