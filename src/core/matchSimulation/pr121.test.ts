import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch, projectPlayerDecisionOpportunity, tacticalMatchStateSchema } from '.';

const world = createCanonicalWorldDatabase();
const stateFor = (seed = 'lab-mtyueajc') => {
  const home = world.clubs[0]!;
  return createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: home.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: {
        mode: 'player',
        clubId: home.id,
        footballerId: home.squadPlayerIds![0]!,
        forceIntoXI: true,
      },
    }),
  );
};

describe('PR121 spatial and goalkeeper agency', () => {
  it.each([
    { x: 107, y: 32.829 },
    { x: -2, y: 31.1 },
  ])('accepts a finite physical shot endpoint beyond either goal plane', (target) => {
    const state = stateFor();
    state.ball = {
      ...state.ball,
      x: target.x > 105 ? 101.883 : 3.1,
      y: 23.323,
      target,
      travelKind: 'shot',
      travelDuration: 0.4,
      travelElapsed: 0.1,
    };
    expect(tacticalMatchStateSchema.parse(state).ball.target).toEqual(target);
  });

  it('offers a pre-outcome goalkeeper commitment against a real breakaway', () => {
    const state = stateFor('keeper-breakaway');
    const keeper = state.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition === 'goalkeeper',
    )!;
    const attacker = state.players.find((player) => player.team === 'away')!;
    state.controlledFootballerId = keeper.id;
    keeper.position = { x: 3, y: 34 };
    attacker.position = { x: 22, y: 34 };
    state.ball = { ...attacker.position, ownerId: attacker.id };
    state.possessionTeam = 'away';
    const opportunity = projectPlayerDecisionOpportunity(state);
    expect(opportunity?.kind).toBe('goalkeeper_response');
    expect(opportunity?.options.map((option) => option.labelKey)).toEqual([
      'keeper_hold_position',
      'keeper_close_angle',
    ]);
    expect(state.lastShot).toBeUndefined();
  });
});
