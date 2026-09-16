import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  FIXED_MATCH_DT,
  applyRestartScenario,
  createTacticalMatch,
  derivePassLaunchPlan,
  projectContextualInteractions,
  stepTacticalMatch,
  tacticalMatchStateSchema,
} from '.';

const world = createCanonicalWorldDatabase();
const stateFor = (seed: string) =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );

describe('PR131 receiver-aware passing', () => {
  it('gives an oriented receiver preparation margin and a controllable support arrival', () => {
    const state = stateFor('readiness');
    const passer = state.players.find((player) => player.id === state.ball.ownerId)!;
    const receiver = state.players.find(
      (player) => player.team === passer.team && player.id !== passer.id,
    )!;
    receiver.position = { x: passer.position.x + 8, y: passer.position.y };
    receiver.facingAngle = Math.PI;
    const plan = derivePassLaunchPlan(state, passer, receiver, receiver.position, 'support');
    expect(plan.receiverReadiness.awareAt).toBeGreaterThan(0);
    expect(plan.predictedArrivalTime).toBeGreaterThan(plan.receiverReadiness.awareAt);
    expect(plan.predictedArrivalSpeed).toBeLessThanOrEqual(
      plan.receiverReadiness.maximumComfortableArrivalSpeed + 0.5,
    );
  });

  it('never turns a ball-carrier space click into an off-ball run, including beyond 15 m', () => {
    const state = stateFor('carry-ownership');
    const actor = state.players.find((player) => player.id === state.ball.ownerId)!;
    state.controlledFootballerId = actor.id;
    const opportunity = {
      id: 'test',
      actorId: actor.id,
      kind: 'on_ball',
      options: [],
      openedAt: state.time,
    } as unknown as Parameters<typeof projectContextualInteractions>[1];
    const interactions = projectContextualInteractions(state, opportunity, {
      kind: 'space',
      point: { x: Math.min(104, actor.position.x + 30), y: actor.position.y },
    });
    expect(
      interactions.some(
        (item) => item.resolution.kind === 'action' && item.resolution.action.type === 'carry',
      ),
    ).toBe(true);
    expect(interactions.some((item) => item.resolution.kind === 'movement')).toBe(false);
  });
});

describe('PR131 restart and geometry hardening', () => {
  it.each(['throw_in', 'goal_kick', 'corner', 'kick_off'] as const)(
    'returns %s to open play deterministically',
    (scenario) => {
      let state = applyRestartScenario(stateFor(`live-${scenario}`), scenario);
      for (let tick = 0; tick < 400 && state.scenario !== 'open_play'; tick += 1)
        state = stepTacticalMatch(state, FIXED_MATCH_DT);
      expect(state.scenario).toBe('open_play');
      expect(tacticalMatchStateSchema.safeParse(state).success).toBe(true);
    },
  );

  it('recovers an already-outside loose ball into a restart instead of clamping it', () => {
    const state = stateFor('outside-recovery');
    state.ball = { x: 40, y: -0.2, velocity: { x: 0, y: -2 }, looseSince: 0 };
    const next = stepTacticalMatch(state, FIXED_MATCH_DT);
    expect(next.scenario).toBe('throw_in');
    expect(next.lastInvariantRecovery?.point.y).toBe(-0.2);
  });
});
