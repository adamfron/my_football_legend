import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch, projectGoalkeeperIntervention } from '.';

const world = createCanonicalWorldDatabase();
const shotState = (startX: number) => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: `keeper-${startX}`,
      control: { mode: 'spectator' },
    }),
  );
  const shooter = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
  )!;
  const keeper = state.players.find(
    (player) => player.team === 'away' && player.profile.primaryPosition === 'goalkeeper',
  )!;
  shooter.position = { x: startX, y: 34 };
  keeper.position = { x: 103, y: 34 };
  keeper.facingAngle = -Math.PI / 2;
  state.ball = {
    x: startX,
    y: 34,
    height: 0.11,
    airborne: true,
    velocity: { x: 27, y: 0.8, z: 3 },
    launchVelocity: { x: 27, y: 0.8, z: 3 },
    launchSpeed: 27.18,
    launchElevation: 0.11,
    flightTime: 0,
    distanceTravelled: 0,
    bounceCount: 0,
    travelKind: 'shot',
    shot: {
      shotId: `shot-${startX}`,
      shooterId: shooter.id,
      context: 'open_play',
      distance: 105 - startX,
      angle: 1,
      pressure: 0,
      blockingDefenders: 0,
      baseXg: 0.1,
      effectiveScoringExpectation: 0.1,
      shooterExecutionQuality: 0.8,
      intendedTarget: { horizontal: 0, vertical: 0.3 },
      actualTarget: { horizontal: 0, vertical: 0.3 },
      error: { horizontal: 0, vertical: 0 },
      speed: 27.18,
      classification: 'on_target',
    },
  };
  return state;
};

describe('physical goalkeeper intervention projection', () => {
  it('gives the keeper substantially more response time on the same distant trajectory', () => {
    const close = projectGoalkeeperIntervention(shotState(94))!;
    const distant = projectGoalkeeperIntervention(shotState(55))!;
    expect(distant.timeAvailable).toBeGreaterThan(close.timeAvailable + 1);
    expect(distant.reactionDelay).toBeCloseTo(close.reactionDelay);
  });

  it('penalizes facing away from the ball without changing the trajectory', () => {
    const squareState = shotState(75);
    const wrongState = structuredClone(squareState);
    const keeper = wrongState.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition === 'goalkeeper',
    )!;
    keeper.facingAngle += Math.PI;
    expect(projectGoalkeeperIntervention(wrongState)!.reactionDelay).toBeGreaterThan(
      projectGoalkeeperIntervention(squareState)!.reactionDelay,
    );
  });

  it('does not turn the last forecast sample into a fake off-pitch contact', () => {
    const state = shotState(75);
    state.ball.velocity = { x: -20, y: 30, z: 2 };
    expect(projectGoalkeeperIntervention(state)).toBeUndefined();
  });
});
