import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch, projectGoalkeeperIntervention, stepTacticalMatch } from '.';
import { resolveGoalkeeperContact } from './goalkeeperIntervention';

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
    from: { x: startX, y: 34 },
    target: { x: 107, y: 34 },
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

  it('consumes reaction delay from release instead of restarting it on every tick', () => {
    const state = shotState(65);
    const initial = projectGoalkeeperIntervention(state)!;
    state.ball.flightTime = initial.reactionDelay + 0.05;
    state.ball.x += 27 * state.ball.flightTime;
    const later = projectGoalkeeperIntervention(state)!;
    expect(initial.reactionRemaining).toBeCloseTo(initial.reactionDelay);
    expect(later.reactionRemaining).toBe(0);
    expect(later.ballTotalFlightTime).toBeGreaterThan(initial.ballTotalFlightTime);
  });

  it('does not lose already-earned reaction time as a reachable shot approaches', () => {
    const state = shotState(65);
    state.ball.flightTime = 0.5;
    state.ball.x += 13.5;
    const first = projectGoalkeeperIntervention(state)!;
    state.ball.flightTime = 0.75;
    state.ball.x += 6.75;
    const second = projectGoalkeeperIntervention(state)!;
    expect(first.reactionRemaining).toBe(0);
    expect(second.reactionRemaining).toBe(0);
    expect(first.reachable).toBe(true);
    expect(second.reachable).toBe(true);
  });

  it('turns an ordinary central reachable shot into a live physical save contact', () => {
    let state = shotState(75);
    for (let tick = 0; tick < 400 && !state.lastShotResult; tick++)
      state = stepTacticalMatch(state, 0.025);
    expect(state.lastBallContact?.kind).toBe('goalkeeper');
    expect(state.lastShotResult).toBe('save');
    expect(['catch', 'parry', 'parry_away']).toContain(state.lastShot?.goalkeeperAction);
    const keeper = state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition === 'goalkeeper',
    )!;
    expect(state.statistics?.players.find((entry) => entry.playerId === keeper.id)?.saves).toBe(1);
  });
  it('gives a slower ordinary shot more intervention time than a powerful close attempt', () => {
    const powerful = shotState(94);
    const slower = structuredClone(powerful);
    slower.ball.velocity = { x: 19, y: 0.8, z: 3 };
    expect(projectGoalkeeperIntervention(slower)!.timeAvailable).toBeGreaterThan(
      projectGoalkeeperIntervention(powerful)!.timeAvailable,
    );
  });
  it('cannot save a physically unreachable shot and records goals without fake keeper contact', () => {
    let state = shotState(94);
    const keeper = state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition === 'goalkeeper',
    )!;
    keeper.position.y = 45;
    const projection = projectGoalkeeperIntervention(state)!;
    expect(projection.reachable).toBe(false);
    expect(resolveGoalkeeperContact(state, projection, 27)).toBe('failed_save');
    for (let tick = 0; tick < 80 && !state.lastShotResult; tick++)
      state = stepTacticalMatch(state, 0.025);
    expect(state.lastBallContact?.kind).toBe('goal_plane');
    expect(state.lastShotResult).toBe('goal');
    expect(state.lastShot?.goalkeeperAction).toBeUndefined();
  });

  it('physically deflects a close shot through the unreacted keeper body without inventing a save', () => {
    let state = shotState(101);
    for (const player of state.players) {
      player.position = { x: 30, y: 8 };
      player.target = { ...player.position };
      player.velocity = { x: 0, y: 0 };
    }
    const shooter = state.players.find((player) => player.id === state.ball.shot!.shooterId)!;
    const keeper = state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition === 'goalkeeper',
    )!;
    shooter.position = { x: 101, y: 34 };
    shooter.target = { ...shooter.position };
    keeper.position = { x: 103, y: 34 };
    keeper.target = { ...keeper.position };
    keeper.facingAngle = -Math.PI / 2;
    Object.assign(keeper.profile.attributes, { reflexes: 72, agility: 72, handling: 72 });
    state.ball.height = 1;
    state.ball.velocity = { x: 30, y: 0, z: 0 };
    const projection = projectGoalkeeperIntervention(state)!;
    expect(projection.reactionRemaining).toBeGreaterThan(projection.ballRemainingFlightTime);
    for (let tick = 0; tick < 20 && !state.lastShotResult; tick += 1)
      state = stepTacticalMatch(state, 0.025);
    expect(state.lastBallContact?.kind).toBe('goalkeeper');
    expect(state.lastBallContact?.playerId).toBe(keeper.id);
    expect(state.lastShotResult).toBe('block');
    expect(state.lastShot?.goalkeeperAction).toBe('failed_save');
    expect(state.ball.velocity!.x).toBeLessThan(0);
    expect(state.score.home).toBe(0);
    expect(state.statistics?.players.find((entry) => entry.playerId === keeper.id)).toMatchObject({
      touches: 0,
      saves: 0,
      catches: 0,
      parries: 0,
      possessionWon: 0,
    });
    expect(state.ball.ownerId).toBeUndefined();
    expect(state.statistics?.activeControlEpisode?.playerId).not.toBe(keeper.id);
    expect(state.statistics?.observedContactIds).toContain(
      `${state.seed}:contact:${keeper.id}:${state.lastBallContact!.at.toFixed(6)}`,
    );
    expect(state.pendingPossessionLoss).toMatchObject({
      actorId: shooter.id,
      cause: 'shot',
      team: 'home',
    });
    expect(state.lastPossessionLoss).toBeUndefined();
  });
});
