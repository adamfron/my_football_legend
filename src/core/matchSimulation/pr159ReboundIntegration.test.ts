import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch, stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { integrateBallFlight } from './ballPhysics';
import { BALL_RADIUS, GOAL_CENTRE_Y, GOAL_WIDTH } from './ballFlight';
import { shotDiagnosticSchema, type TacticalMatchState } from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = () => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr159-rebound-runtime',
      control: { mode: 'spectator' },
    }),
  );
  state.time = 20;
  state.playerAgencyEnabled = false;
  state.actionCooldown = 10;
  for (const player of state.players) {
    player.position = { x: 20, y: 65 };
    player.target = { ...player.position };
    player.velocity = { x: 0, y: 0 };
  }
  return state;
};
const recordShotSource = (state: TacticalMatchState) => {
  const shooter = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
  )!;
  state.lastShot = shotDiagnosticSchema.parse({
    shotId: 'original-shot',
    shooterId: shooter.id,
    releasedAt: 19.5,
    context: 'open_play',
    distance: 20,
    angle: 1,
    pressure: 0,
    blockingDefenders: 0,
    baseXg: 0.1,
    effectiveScoringExpectation: 0.1,
    shooterExecutionQuality: 0.8,
    intendedTarget: { horizontal: 0, vertical: 0.3 },
    actualTarget: { horizontal: 0, vertical: 0.3 },
    error: { horizontal: 0, vertical: 0 },
    speed: 20,
    classification: 'crossbar',
    outcome: 'crossbar',
  });
  state.pendingPossessionLoss = {
    id: `${state.seed}:shot-rebound:original-shot`,
    at: state.time,
    team: 'home',
    actorId: shooter.id,
    cause: 'shot',
  };
};

describe('PR159 physical loose-ball continuations', () => {
  it('continues loose spin and vertical motion through the next ticks and a real grass bounce', () => {
    let state = fixture();
    state.ball = {
      x: 50,
      y: 34,
      height: 2,
      velocity: { x: 16, y: 0, z: -3 },
      airborne: true,
      bounceCount: 0,
      spin: { x: 0, y: 0, z: 70 },
      looseSince: state.time,
    };
    const forecast = integrateBallFlight(
      {
        position: { x: 50, y: 34, z: 2 },
        velocity: { x: 16, y: 0, z: -3 },
        airborne: true,
        bounceCount: 0,
        spin: { x: 0, y: 0, z: 70 },
      },
      0.025,
    );
    state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    expect(state.ball.x).toBe(forecast.position.x);
    expect(state.ball.y).toBe(forecast.position.y);
    expect(state.ball.height).toBe(forecast.position.z);
    expect(state.ball.spin).toEqual(forecast.spin);
    for (let tick = 0; tick < 20; tick++) state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    expect(state.ball.bounceCount).toBeGreaterThan(0);
    expect(state.ball.height).toBeGreaterThanOrEqual(BALL_RADIUS);
    expect(state.ball.spin!.z).toBeGreaterThan(0);
    expect(state.ball.shot).toBeUndefined();
  });
  it('collides with a finite moving defender once, without repeated zero-time impacts', () => {
    const state = fixture();
    const defender = state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    defender.position = { x: 81.1, y: 34 };
    defender.target = { ...defender.position };
    state.ball = {
      x: 80,
      y: 34,
      height: 1,
      velocity: { x: 30, y: 0, z: 2 },
      airborne: true,
      spin: { x: 0, y: 20, z: 70 },
      bounceCount: 0,
      looseSince: state.time,
    };
    const contact = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    expect(contact.lastBallContact?.playerId).toBe(defender.id);
    expect(contact.ball.lastTouchPlayerId).toBe(defender.id);
    expect(contact.ball.velocity!.x).toBeLessThan(0);
    expect(contact.ball.height).toBeGreaterThan(0.9);
    expect(contact.ball.spin!.z).not.toBe(0);
    const next = stepTacticalMatchAfterDecisionProbe(contact, 0.025);
    expect(next.lastBallContact).toEqual(contact.lastBallContact);
    expect(next.ball.x).toBeLessThan(contact.ball.x);
    expect(next.ball.shot).toBeUndefined();
  });
  it('keeps an ended shot ended while its frame rebound retains height, spin and source identity', () => {
    let state = fixture();
    recordShotSource(state);
    state.ball = {
      x: 104.5,
      y: GOAL_CENTRE_Y - GOAL_WIDTH / 2,
      height: 1,
      velocity: { x: 20, y: 0, z: 0 },
      airborne: true,
      bounceCount: 0,
      spin: { x: 0, y: 10, z: 20 },
      looseSince: state.time,
    };
    for (let tick = 0; tick < 4 && state.lastBallContact?.kind !== 'left_post'; tick++)
      state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    expect(state.lastBallContact?.kind).toBe('left_post');
    expect(state.ball.shot).toBeUndefined();
    expect(state.lastShot?.shotId).toBe('original-shot');
    expect(state.ball.height).toBeGreaterThan(0.9);
    expect(state.ball.spin!.z).not.toBe(0);
    const next = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    expect(next.ball.x).toBeLessThan(state.ball.x);
    expect(next.ball.height).not.toBe(state.ball.height);
    expect(next.ball.shot).toBeUndefined();
  });
  it('counts a real goal after an inward continuation without manufacturing another shot', () => {
    let state = fixture();
    recordShotSource(state);
    state.ball = {
      x: 104.4,
      y: 34,
      height: 1,
      velocity: { x: 12, y: 0, z: 0 },
      airborne: true,
      bounceCount: 0,
      looseSince: state.time,
    };
    state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    const originalId = state.lastShot!.shotId;
    const shooterId = state.lastShot!.shooterId;
    const initialStats = state.statistics!.players.find((player) => player.playerId === shooterId)!;
    expect(initialStats.shots).toBe(1);
    for (let tick = 0; tick < 5 && state.score.home === 0; tick++)
      state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    expect(state.score.home).toBe(1);
    expect(state.lastShot!.shotId).toBe(originalId);
    expect(state.ball.shot).toBeUndefined();
    const scoredStats = state.statistics!.players.find((player) => player.playerId === shooterId)!;
    expect(scoredStats.shots).toBe(1);
    expect(scoredStats.goals).toBe(1);
    expect(scoredStats.shotsOnTarget).toBe(1);
  });
});
