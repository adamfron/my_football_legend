import { z } from 'zod';
import { createDynamicFixture } from '../src/core/matchSimulation/pr173Fixtures';
import { isMatchGoalkeeper } from '../src/core/matchSimulation/matchGoalkeeper';

export const reformScenarioSchema = z.enum([
  'safe-defender-v-midfield', 'central-moderate-pressure', 'stationary-winger', 'long-switch',
  'high-line-through', 'first-time', 'carry-v-recycle', 'moderate-shot', 'clearance',
  'corner-counter', 'blocked-shot-counter', 'weak-v-strong', 'overlap-cover', 'failed-counter',
  'conservative-possession', 'free-kick-counter', 'press-escape', 'diagonal-run', 'covering-defender',
]);
export type ReformScenario = z.infer<typeof reformScenarioSchema>;

/** Prescribed geometry, never prescribed success. All 22 bodies, ordinary attributes, ball physics,
 * laws, challenges and goalkeeper interventions remain active during continuations. */
export const createReformFixture = (scenario: ReformScenario) => {
  const fixture = createDynamicFixture({ scenario: 'pr173-winger-cut-1b', seed: `pr177:${scenario}` });
  const state = fixture.state;
  const actor = state.players.find((p) => p.id === fixture.supportId)!;
  const runner = state.players.find((p) => p.id === fixture.actorId)!;
  const opponents = state.players.filter((p) => p.team !== actor.team && !isMatchGoalkeeper(p));
  state.decisionPolicy = 'state-value-v1'; state.playerAgencyEnabled = false;
  state.time = 30; state.timeSincePossessionChanged = 10;
  state.ballOwnershipStartedAt = 28; state.actionCooldown = 0; state.currentPressure = 0;
  state.possessionTeam = actor.team; state.scenario = 'open_play';
  for (const key of ['restart', 'onBallPreparation', 'receptionPreparation', 'controlledBallContact', 'ballCarrierIntent', 'playerMovementIntent', 'lastGroundContact', 'lastPassDiagnostic', 'lastResolvedPass', 'decisionReadiness', 'combinationIntent'] as const) delete state[key];
  state.players.forEach((p, i) => {
    p.position = isMatchGoalkeeper(p) ? { x: p.team === actor.team ? 5 : 100, y: 34 } :
      p.team === actor.team ? { x: 18 + i % 3 * 4, y: 5 + i % 9 * 6 } : { x: 66 + i % 2 * 2, y: 5 + i % 9 * 6 };
    p.velocity = { x: 0, y: 0 }; p.target = { ...p.position }; p.facingAngle = Math.PI / 2;
    Object.assign(p.profile.attributes, { passing: 80, technique: 80, firstTouch: 80, composure: 80, gameReading: 80, concentration: 80 });
  });
  actor.position = { x: 38, y: 34 }; actor.target = { ...actor.position };
  runner.position = { x: 61, y: 12 }; runner.target = { ...runner.position };
  runner.duty = 'attack'; runner.profile.attributes.pace = 95;
  const counter = ['corner-counter', 'blocked-shot-counter', 'weak-v-strong', 'failed-counter', 'free-kick-counter', 'press-escape'].includes(scenario);
  if (counter) {
    state.timeSincePossessionChanged = 0.25;
    state.lastPossessionChange = { at: 29.75, from: 'away', to: actor.team, cause: 'interception', winnerId: actor.id };
    state.teams[actor.team].phase = 'attacking_transition'; state.teams[opponents[0]!.team].phase = 'defensive_transition';
    opponents.forEach((p, i) => { p.position = { x: i < 8 ? 24 + i % 3 * 3 : 67, y: 8 + i * 5 }; p.velocity = { x: -1.5, y: 0 }; });
  }
  if (['long-switch', 'stationary-winger', 'high-line-through', 'diagonal-run', 'covering-defender'].includes(scenario)) {
    actor.position.y = scenario === 'long-switch' ? 55 : 34;
    runner.velocity = scenario === 'diagonal-run' ? { x: 2, y: 2 } : { x: 0, y: 0 };
  }
  if (scenario === 'covering-defender' || scenario === 'failed-counter') {
    opponents[0]!.position = { x: 65, y: 12 }; opponents[0]!.velocity = { x: 5, y: 0 };
  }
  if (scenario === 'central-moderate-pressure' || scenario === 'press-escape') {
    runner.position = { x: 55, y: 34 };
    opponents[0]!.position = { x: 44, y: 37 }; state.currentPressure = 0.45;
  }
  if (scenario === 'moderate-shot') {
    actor.position = { x: 80, y: 34 }; actor.profile.attributes.finishing = 85;
    opponents.forEach((p) => { p.position.y = p.position.y < 34 ? 5 : 63; });
  }
  if (scenario === 'safe-defender-v-midfield') runner.position = { x: 51, y: 30 };
  if (scenario === 'conservative-possession' || scenario === 'clearance') {
    actor.position = { x: 18, y: 34 }; runner.position = { x: 33, y: 34 };
    opponents.forEach((p, i) => { p.position = { x: 25 + i % 3 * 3, y: 23 + i % 4 * 6 }; });
    if (scenario === 'conservative-possession') { state.time = 5000; state.ballOwnershipStartedAt = 4998; state.score[actor.team] = 1; }
    else state.currentPressure = 0.8;
  }
  if (scenario === 'weak-v-strong') state.players.filter((p) => p.team === actor.team && p.id !== runner.id).forEach((p) => Object.assign(p.profile.attributes, { technique: 45, passing: 45, firstTouch: 45 }));
  state.ball = { ...actor.position, ownerId: actor.id, height: 0, velocity: { x: 0, y: 0 } };
  if (scenario === 'first-time') {
    state.ball = { x: actor.position.x - 0.5, y: actor.position.y, height: 0.11, velocity: { x: 7, y: 0, z: 0 }, travelKind: 'pass', intendedReceiverId: actor.id };
  }
  return { state, actor, runner, opponents, scenario };
};
