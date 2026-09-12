import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch, estimatePlayerArrivalTime } from '.';

const fixture = () => {
  const world = createCanonicalWorldDatabase();
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'physical-arrival',
      control: { mode: 'spectator' },
    }),
  );
  const player = state.players.find(
    (candidate) => candidate.profile.primaryPosition !== 'goalkeeper',
  )!;
  player.position = { x: 50, y: 20 };
  return { state, player, target: { x: 59.6, y: 20 } };
};

describe('canonical player arrival estimate', () => {
  it('ranks existing momentum toward, stationary, and away from the target', () => {
    const { state, player, target } = fixture();
    player.velocity = { x: 5, y: 0 };
    const toward = estimatePlayerArrivalTime(state, player, target, 'intercept');
    player.velocity = { x: 0, y: 0 };
    const stationary = estimatePlayerArrivalTime(state, player, target, 'intercept');
    player.velocity = { x: -5, y: 0 };
    const away = estimatePlayerArrivalTime(state, player, target, 'intercept');
    expect(toward.estimatedTime).toBeLessThan(stationary.estimatedTime);
    expect(stationary.estimatedTime).toBeLessThan(away.estimatedTime);
    expect(away.turnAngle).toBeCloseTo(Math.PI);
  });

  it('lets agility reduce the cost of a large direction change without consuming RNG', () => {
    const { state, player, target } = fixture();
    player.velocity = { x: -5, y: 0 };
    const slowTurner = {
      ...player,
      profile: {
        ...player.profile,
        attributes: { ...player.profile.attributes, agility: 20 },
      },
    };
    const agile = {
      ...player,
      profile: {
        ...player.profile,
        attributes: { ...player.profile.attributes, agility: 95 },
      },
    };
    const snapshot = structuredClone(state);
    expect(estimatePlayerArrivalTime(state, agile, target, 'intercept').estimatedTime).toBeLessThan(
      estimatePlayerArrivalTime(state, slowTurner, target, 'intercept').estimatedTime,
    );
    expect(state).toEqual(snapshot);
  });
});
