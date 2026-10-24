import { z } from 'zod';
import { createFormationBenchmarkSession } from './benchmarkFixtures';
import { createOpenPlayMatchFixture as createTacticalMatch } from './matchSimulation';
import type { MatchAction, TacticalMatchState } from './matchState';
import { deriveOnBallPreparation } from './onBallPreparation';

export const offensiveScenarioSchema = z.enum([
  'elite_winger',
  'average_winger',
  'recovering_fullback',
  'immediate_pressure',
  'directional_touch',
  'failed_control',
  'byline_sprint',
  'heavy_sprint',
  'push_and_run',
  'second_touch_recovery',
  'let_ball_run',
  'run_on_intercepted',
  'run_on_out',
  'central_through',
  'offside_striker',
  'central_vs_backward_switch',
  'accurate_switch',
  'pressed_switch',
  'cross_after_carry',
  'fatigued_winger',
  'human_winger',
  'npc_equivalent',
  'baran_equivalent',
  'kowalski_equivalent',
]);
export type OffensiveScenario = z.infer<typeof offensiveScenarioSchema>;

/** Canonical initial geometries, never scripted outcomes. Historical equivalents include the
 * observed position/ability but omit unknown body orientation and preparation history. */
export const createOffensiveScenario = (
  scenario: OffensiveScenario,
  seed: string,
  create: (
    session: ReturnType<typeof createFormationBenchmarkSession>,
  ) => TacticalMatchState = createTacticalMatch,
) => {
  const state = create(
    createFormationBenchmarkSession({ anchor: '4-3-3', opponent: '4-4-2', attributes: 70, seed }),
  );
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 20;
  state.actionCooldown = 0;
  state.playerAgencyEnabled = scenario === 'human_winger';
  state.timeSincePossessionChanged = 8;
  state.teams.home.phase = 'positional_attack';
  state.teams.away.phase = 'defensive_block';
  for (const p of state.players) {
    p.position = {
      x: p.team === 'home' ? 35 + (p.slotIndex % 3) * 5 : 78 + (p.slotIndex % 3) * 4,
      y: p.team === 'home' ? 20 + (p.slotIndex % 6) * 5 : 28 + (p.slotIndex % 5) * 4,
    };
    p.target = { ...p.position };
    p.velocity = { x: 0, y: 0 };
    p.facingAngle = p.team === 'home' ? Math.PI / 2 : -Math.PI / 2;
    if (p.slot.position === 'goalkeeper') p.position = { x: p.team === 'home' ? 3 : 102, y: 34 };
  }
  const winger = state.players.find(
    (p) =>
      p.team === 'home' &&
      p.slot.position === (scenario === 'baran_equivalent' ? 'right_winger' : 'left_winger'),
  )!;
  const passer = state.players.find(
    (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
  )!;
  const defender = state.players.find(
    (p) => p.team === 'away' && p.slot.position === 'right_back',
  )!;
  const striker = state.players.find((p) => p.team === 'home' && p.slot.position === 'striker')!;
  winger.position = { x: 64, y: scenario === 'baran_equivalent' ? 58 : 11 };
  winger.target = { x: 91, y: winger.position.y };
  winger.facingAngle = Math.PI / 4;
  passer.position = { x: 48, y: 15 };
  if (scenario === 'baran_equivalent') passer.position = { x: 34, y: 46 };
  passer.target = { ...passer.position };
  striker.position = { x: 78, y: 30 };
  striker.target = { x: 91, y: 30 };
  defender.position = { x: 64, y: 29 };
  if (['baran_equivalent', 'kowalski_equivalent'].includes(scenario))
    defender.position = { x: 68, y: winger.position.y + (winger.position.y < 34 ? 7 : -7) };
  defender.target = { ...defender.position };
  const attributes = winger.profile.attributes;
  Object.assign(attributes, {
    dribbling: 92,
    technique: 91,
    agility: 88,
    firstTouch: 85,
    gameReading: 85,
    composure: 86,
    pace: 86,
  });
  if (scenario === 'baran_equivalent')
    Object.assign(attributes, {
      dribbling: 96,
      agility: 91,
      technique: 91,
      pace: 79,
      firstTouch: 75,
      passing: 92,
      gameReading: 88,
      composure: 93,
      concentration: 75,
    });
  if (scenario === 'kowalski_equivalent')
    Object.assign(attributes, {
      dribbling: 86,
      agility: 80,
      technique: 90,
      pace: 86,
      firstTouch: 79,
      passing: 72,
      gameReading: 74,
      composure: 82,
      concentration: 58,
    });
  if (scenario === 'average_winger')
    for (const key of Object.keys(attributes) as (keyof typeof attributes)[]) attributes[key] = 55;
  if (['recovering_fullback', 'second_touch_recovery', 'run_on_intercepted'].includes(scenario)) {
    defender.position = { x: 70, y: 14 };
    defender.velocity = { x: -2, y: -3 };
  }
  if (scenario === 'immediate_pressure') defender.position = { x: 64.8, y: 11.8 };
  if (['failed_control', 'heavy_sprint'].includes(scenario))
    Object.assign(attributes, {
      firstTouch: 8,
      technique: 12,
      dribbling: 10,
      agility: 20,
      composure: 10,
    });
  if (scenario === 'fatigued_winger') {
    winger.fitness!.longTermCapacity = 0.35;
    winger.fitness!.burstReadiness = 0.15;
  }
  if (
    [
      'directional_touch',
      'let_ball_run',
      'run_on_intercepted',
      'run_on_out',
      'central_through',
    ].includes(scenario)
  )
    winger.velocity = { x: 5.5, y: 0 };
  if (scenario === 'run_on_out') {
    winger.position = { x: 98, y: 3 };
    winger.target = { x: 104.5, y: 1 };
    passer.position = { x: 82, y: 8 };
  }
  if (scenario === 'human_winger') state.controlledFootballerId = winger.id;
  let actor = passer;
  let action: MatchAction = {
    type: 'pass',
    actorId: passer.id,
    receiverId: winger.id,
    target: { ...winger.position },
    intent: 'progressive',
    ...(scenario === 'baran_equivalent' ? { delivery: 'lofted' as const } : {}),
  };
  if (
    [
      'byline_sprint',
      'heavy_sprint',
      'push_and_run',
      'second_touch_recovery',
      'cross_after_carry',
      'fatigued_winger',
      'npc_equivalent',
    ].includes(scenario)
  ) {
    actor = winger;
    winger.velocity = { x: 3.5, y: 0 };
    winger.facingAngle = Math.PI / 2;
    action = {
      type: 'carry',
      actorId: winger.id,
      target: { x: 94, y: 11 },
      movementMode: 'sprint',
    };
  }
  if (['central_through', 'offside_striker'].includes(scenario)) {
    striker.position = { x: scenario === 'offside_striker' ? 95 : 73, y: 34 };
    striker.velocity = { x: 5, y: 0 };
    striker.target = { x: 94, y: 34 };
    passer.position = { x: 58, y: 34 };
    action = { type: 'space_pass', actorId: passer.id, target: { x: 87, y: 34 } };
    if (scenario === 'offside_striker')
      action = {
        type: 'pass',
        actorId: passer.id,
        receiverId: striker.id,
        target: { ...striker.position },
        intent: 'through',
      };
  }
  if (['central_vs_backward_switch', 'accurate_switch', 'pressed_switch'].includes(scenario)) {
    actor = winger;
    winger.position = { x: 70, y: 11 };
    passer.position = { x: 48, y: 53 };
    action = {
      type: 'pass',
      actorId: winger.id,
      receiverId: passer.id,
      target: { ...passer.position },
      intent: 'support',
      delivery: 'lofted',
    };
    if (scenario === 'accurate_switch') {
      attributes.passing = 95;
      attributes.technique = 95;
      winger.facingAngle = Math.atan2(
        passer.position.x - winger.position.x,
        passer.position.y - winger.position.y,
      );
      defender.position = { x: 95, y: 5 };
    }
    if (scenario === 'pressed_switch') {
      attributes.passing = 30;
      defender.position = { x: 70.8, y: 11.5 };
    }
    if (scenario === 'central_vs_backward_switch') {
      const central = state.players.find(
        (p) => p.team === 'home' && p.slot.position === 'central_midfielder' && p.id !== passer.id,
      )!;
      central.position = { x: 76, y: 20 };
      central.target = { ...central.position };
    }
  }
  if (scenario === 'push_and_run' && action.type === 'carry') action.target = { x: 84, y: 11 };
  if (scenario === 'cross_after_carry' && action.type === 'carry') {
    winger.position = { x: 82, y: 11 };
    winger.velocity = { x: 4.5, y: 0 };
    action.target = { x: 96, y: 11 };
    striker.position = { x: 94, y: 30 };
    striker.target = { x: 97, y: 30 };
    passer.position = { x: 89, y: 38 };
    passer.target = { ...passer.position };
  }
  state.ball = { ...actor.position, ownerId: actor.id, height: 0.11, lastTouchPlayerId: actor.id };
  state.ballOwnershipStartedAt = state.time - 2;
  state.onBallPreparation = deriveOnBallPreparation(
    { ...state, time: state.time - 2 },
    actor,
    'clean_control',
  );
  state.currentActorId = actor.id;
  state.possessionTeam = actor.team;
  return { state, action, wingerId: winger.id, passerId: passer.id, defenderId: defender.id };
};
