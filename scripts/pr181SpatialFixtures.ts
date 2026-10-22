import { z } from 'zod';
import { createReformFixture } from './pr177Fixtures';
import { isMatchGoalkeeper } from '../src/core/matchSimulation/matchGoalkeeper';
import { assignTacticalRoles, changeTacticalRole } from '../src/core/matchSimulation/tacticalRoles';
import { createMatchFitness } from '../src/core/matchSimulation/matchFitness';

export const spatialScenarioSchema = z.enum([
  'depth',
  'false-nine',
  'no-threat',
  'wing-forward',
  'wing-backward',
  'skilled-slow',
  'equal-pace',
  'covered',
  'isolated',
  'overlap',
  'low-block',
  'counter',
  'tired',
  'cross-target',
  'cross-false-nine',
  'empty-box',
  'marked-box',
  'late-midfielder',
  'aerial',
  'aerial-defending-recovery',
  'aerial-shoulder',
]);
export type SpatialScenario = z.infer<typeof spatialScenarioSchema>;

/** Prescribed frozen development geometry. Outcomes are always canonical continuations. */
export const createSpatialFixture = (scenario: SpatialScenario) => {
  const fixture = createReformFixture('high-line-through');
  let state = fixture.state;
  state.seed = `pr181:spatial:${scenario}`;
  const passer = fixture.actor,
    winger = fixture.runner,
    defender = fixture.opponents[0]!;
  const striker = state.players.find(
    (p) => p.team === passer.team && p.slot.position === 'striker',
  )!;
  state.rolePlan = assignTacticalRoles(state);
  state = changeTacticalRole(state, striker.id, 'advanced_forward');
  state = changeTacticalRole(state, winger.id, 'traditional_winger');
  // Role changes preserve physical objects; reacquire below after immutable updates.
  const get = (id: string) => state.players.find((p) => p.id === id)!;
  const actor = get(passer.id),
    runner = get(winger.id),
    marker = get(defender.id),
    forward = get(striker.id);
  for (const p of state.players) {
    if (isMatchGoalkeeper(p)) continue;
    if (p.team !== actor.team) {
      p.position = {
        x: p.slot.position.includes('back') ? 66 : 49,
        y: 18 + (state.players.indexOf(p) % 4) * 12,
      };
      p.facingAngle = -Math.PI / 2;
    } else
      p.position = {
        x: 30 + (state.players.indexOf(p) % 3) * 4,
        y: 18 + (state.players.indexOf(p) % 4) * 10,
      };
    p.velocity = { x: 0, y: 0 };
    p.target = { ...p.position };
    delete p.spatialMovement;
  }
  actor.position = { x: 43, y: 34 };
  actor.target = { ...actor.position };
  forward.position = { x: 61, y: 28 };
  forward.target = { x: 75, y: 24 };
  runner.position = { x: 58, y: 10 };
  runner.target = { x: 76, y: 14 };
  forward.velocity = { x: scenario === 'no-threat' ? 0 : 3.5, y: 0 };
  if (scenario === 'false-nine') {
    state = changeTacticalRole(state, forward.id, 'false_nine');
    forward.position = { x: 47, y: 30 };
    state = changeTacticalRole(state, runner.id, 'inside_forward');
  }
  const wing =
    !['depth', 'false-nine', 'no-threat'].includes(scenario) && !scenario.startsWith('aerial');
  if (wing) {
    actor.position = { x: 43, y: 34 };
    runner.position = { x: 56, y: 10 };
    runner.velocity = { x: 4.5, y: 0 };
    runner.facingAngle = Math.PI / 2;
    Object.assign(runner.profile.attributes, { pace: 96, agility: 82, dribbling: 80 });
    for (const p of state.players.filter((p) => p.team !== runner.team && !isMatchGoalkeeper(p)))
      p.position = { x: 70, y: 38 + (state.players.indexOf(p) % 4) * 5 };
    marker.position = { x: 59.5, y: 11.5 };
    marker.velocity = { x: 0, y: 0 };
    Object.assign(marker.profile.attributes, { pace: 38, agility: 45 });
    marker.facingAngle = scenario === 'wing-forward' ? Math.PI / 2 : -Math.PI / 2;
    if (scenario === 'equal-pace') marker.profile.attributes.pace = 96;
    if (scenario === 'skilled-slow') {
      runner.profile.attributes.pace = 42;
      runner.profile.attributes.dribbling = 95;
      marker.profile.attributes.pace = 96;
    }
    if (scenario === 'covered') fixture.opponents[1]!.position = { x: 64, y: 11 };
    if (scenario === 'tired') runner.fitness = { ...createMatchFitness(60), burstReadiness: 0.08 };
    if (scenario === 'low-block')
      for (const [i, p] of fixture.opponents.entries())
        p.position = { x: 62 + (i % 3) * 5, y: 5 + (i % 5) * 8 };
    if (scenario === 'counter') {
      state.timeSincePossessionChanged = 0.25;
      state.lastPossessionChange = {
        at: state.time - 0.25,
        from: marker.team,
        to: runner.team,
        cause: 'interception',
        winnerId: runner.id,
      };
      state.teams[runner.team].phase = 'attacking_transition';
    }
    if (scenario === 'overlap') {
      const fullback = state.players.find(
        (p) => p.team === runner.team && p.slot.position === 'left_back',
      )!;
      fullback.position = { x: 51, y: 8 };
      fullback.duty = 'attack';
      state = changeTacticalRole(state, fullback.id, 'attacking_fullback');
    }
  }
  const owner = wing ? runner : actor;
  state.possessionTeam = owner.team;
  state.ball = {
    x: owner.position.x + 0.35,
    y: owner.position.y,
    height: 0.11,
    velocity: { ...owner.velocity },
    ownerId: owner.id,
  };
  if (
    scenario.includes('cross') ||
    ['empty-box', 'marked-box', 'late-midfielder'].includes(scenario)
  ) {
    runner.position = { x: 88, y: 8 };
    runner.velocity = { x: 2, y: 0 };
    forward.position = { x: 91, y: 30 };
    forward.velocity = { x: 2, y: 1 };
    marker.position = { x: 90, y: 20 };
    fixture.opponents[2]!.position = { x: 96, y: 43 };
    fixture.opponents[3]!.position = { x: 94, y: 50 };
    state.ball = {
      ...runner.position,
      x: 88.4,
      ownerId: runner.id,
      height: 0.11,
      velocity: { ...runner.velocity },
    };
    if (scenario === 'cross-target')
      state = changeTacticalRole(state, forward.id, 'target_forward');
    if (scenario === 'cross-false-nine') {
      state = changeTacticalRole(state, forward.id, 'false_nine');
      forward.position = { x: 79, y: 30 };
      const weakSide = state.players.find(
        (p) => p.team === runner.team && p.slot.position === 'right_winger',
      )!;
      weakSide.position = { x: 89, y: 40 };
      weakSide.velocity = { x: 4, y: -1 };
      state = changeTacticalRole(state, weakSide.id, 'inside_forward');
    }
    if (scenario === 'empty-box')
      for (const p of state.players.filter((p) => p.team === runner.team && p.id !== runner.id)) {
        p.position.x = 40;
        p.duty = 'defend';
      }
    if (scenario === 'marked-box') fixture.opponents[1]!.position = { x: 92, y: 31 };
    if (scenario === 'late-midfielder') {
      const midfielder = state.players.find(
        (p) => p.team === runner.team && p.slot.position === 'central_midfielder',
      )!;
      midfielder.position = { x: 82, y: 35 };
      midfielder.velocity = { x: 5, y: 0 };
      midfielder.duty = 'attack';
      state = changeTacticalRole(state, midfielder.id, 'box_to_box');
    }
  }
  if (scenario.startsWith('aerial')) {
    forward.position = { x: 70, y: 30.55 };
    marker.position = { x: 70, y: 31.45 };
    if (scenario === 'aerial-defending-recovery') fixture.opponents[1]!.position = { x: 53, y: 31 };
    state.ball = {
      x: 64,
      y: 31,
      height: 5,
      airborne: true,
      velocity: { x: 8, y: 0, z: -2 },
      travelKind: 'pass',
      from: { x: 43, y: 31 },
      target: { x: 76, y: 31 },
      flightTime: 1,
      distanceTravelled: 21,
      sourceAction: 'pass',
      intendedReceiverId: forward.id,
      lastTouchPlayerId: actor.id,
    };
    if (scenario === 'aerial-shoulder') {
      forward.position = { x: 70, y: 30.7 };
      marker.position = { x: 71.2, y: 31 };
      state.ball = { ...state.ball, x: 70, y: 31, height: 2, velocity: { x: 6, y: 0, z: -2 } };
    }
  }
  return {
    state,
    actor: get(owner.id),
    passer: get(actor.id),
    runner: get(runner.id),
    striker: get(forward.id),
    defender: get(marker.id),
  };
};
