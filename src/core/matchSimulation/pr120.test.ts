import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createMatchFlowTelemetry,
  createTacticalMatch,
  enumerateAvailableActions,
  evaluateShootingOpportunity,
  observeMatchFlow,
  projectMatchSummary,
  projectPlayerMatchSummary,
  resolveMatchAction,
  startSecondHalf,
  stepTacticalMatch,
} from '.';

const world = createCanonicalWorldDatabase();
const makeState = (controlled = false) => {
  const home = world.clubs[0]!;
  return createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: home.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr120-regression',
      control: controlled
        ? {
            mode: 'player',
            clubId: home.id,
            footballerId: home.squadPlayerIds![0]!,
            forceIntoXI: true,
          }
        : { mode: 'spectator' },
    }),
  );
};

describe('PR120 match foundations', () => {
  it('offers a physical shot at sixty metres and values an exposed keeper continuously', () => {
    const state = makeState();
    const shooter = state.players.find((player) => player.id === state.ball.ownerId)!;
    shooter.position = { x: 45, y: 34 };
    state.ball = { ...shooter.position, ownerId: shooter.id };
    const keeper = state.players.find(
      (player) => player.team !== shooter.team && player.profile.primaryPosition === 'goalkeeper',
    )!;
    keeper.position = { x: 104, y: 34 };
    const covered = evaluateShootingOpportunity(state, shooter);
    keeper.position = { x: 65, y: 34 };
    const exposed = evaluateShootingOpportunity(state, shooter);
    expect(
      enumerateAvailableActions(state, shooter.id).some((action) => action.type === 'shot'),
    ).toBe(true);
    expect(covered.effectiveScoringExpectation).toBeLessThan(0.002);
    expect(exposed.effectiveScoringExpectation).toBeGreaterThan(
      covered.effectiveScoringExpectation,
    );
  });

  it('enters half time safely, starts the alternate kickoff, and makes full time terminal', () => {
    let state = { ...makeState(), time: 45 * 60 - 0.01, actionCooldown: 5 };
    state = stepTacticalMatch(state, 0.1);
    expect(state.status).toBe('half_time');
    expect(state.time).toBe(45 * 60);
    state = startSecondHalf(state);
    expect(state.status).toBe('second_half');
    expect(state.restart?.restartTeam).toBe('away');
    state = stepTacticalMatch({ ...state, time: 90 * 60 - 0.01, actionCooldown: 5 }, 0.1);
    expect(state.status).toBe('full_time');
    expect(stepTacticalMatch(state, 10)).toEqual(state);
    expect(projectMatchSummary(state)?.finalScore).toEqual(state.score);
  });

  it('counts a human-selected shot once from its exact action episode', () => {
    const state = makeState(true);
    const actor = state.players.find((player) => player.id === state.ball.ownerId)!;
    state.controlledFootballerId = actor.id;
    const shot = enumerateAvailableActions(state, actor.id).find(
      (action) => action.type === 'shot',
    )!;
    const committed = resolveMatchAction(state, shot, 'human_selected');
    const once = observeMatchFlow(createMatchFlowTelemetry(), committed, committed);
    const twice = observeMatchFlow(once, committed, committed);
    expect(once.controlled.majorActionSources.shots.human).toBe(1);
    expect(twice.controlled.majorActionSources.shots.human).toBe(1);
    expect(projectPlayerMatchSummary(committed.statistics!, actor.id)).not.toHaveProperty('rating');
  });
});
