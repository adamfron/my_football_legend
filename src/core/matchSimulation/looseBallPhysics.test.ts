import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  evaluateGlobalBallRace,
  FIXED_MATCH_DT,
  deriveLooseBallAssignments,
  distance,
  rollLooseBall,
  projectPlayerDecisionOpportunity,
  stepTacticalMatch,
} from '.';

describe('loose ball physics', () => {
  it('keeps raw outward travel unbounded so a touchline can be crossed', () => {
    expect(rollLooseBall({ x: 50, y: 67.9 }, { x: 0, y: 8 }, 0.1).position.y).toBeGreaterThan(68);
  });
  it('slows over elapsed time, eventually stops, and is invariant to subdivision', () => {
    const start = { x: 20, y: 34 };
    const velocity = { x: 9, y: 1 };
    const whole = rollLooseBall(start, velocity, 2);
    const first = rollLooseBall(start, velocity, 0.8);
    const split = rollLooseBall(first.position, first.velocity, 1.2);
    expect(Math.hypot(whole.velocity.x, whole.velocity.y)).toBeLessThan(
      Math.hypot(velocity.x, velocity.y),
    );
    expect(split.position.x).toBeCloseTo(whole.position.x, 8);
    expect(split.velocity.x).toBeCloseTo(whole.velocity.x, 8);
    expect(Math.hypot(...Object.values(rollLooseBall(start, velocity, 30).velocity))).toBe(0);
  });

  it('selects a local race without collapsing either whole team', () => {
    const world = createCanonicalWorldDatabase();
    const session = createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'loose-race',
      control: { mode: 'spectator' },
    });
    const state = createTacticalMatch(session);
    state.ball = { x: 52.5, y: 34, velocity: { x: 7, y: 0 }, looseSince: state.time };
    const assignments = deriveLooseBallAssignments(state);
    expect(assignments.filter((candidate) => !candidate.goalkeeper)).toHaveLength(4);
    expect(new Set(assignments.map((candidate) => candidate.team))).toEqual(
      new Set(['home', 'away']),
    );
    expect(assignments.every((candidate) => distance(candidate.target, state.ball) > 0)).toBe(true);
    const before = new Map(
      state.players.map((player) => [player.id, distance(player.position, state.ball)]),
    );
    const next = stepTacticalMatch(state, 0.1);
    expect(
      assignments.some(
        ({ playerId }) =>
          distance(next.players.find((p) => p.id === playerId)!.position, next.ball) <
          before.get(playerId)!,
      ),
    ).toBe(true);
  });

  it('turns a natural loose-ball touchline crossing into the canonical throw-in', () => {
    const world = createCanonicalWorldDatabase();
    const session = createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'natural-throw-in',
      control: { mode: 'spectator' },
    });
    const state = createTacticalMatch(session);
    const lastTouch = state.players.find((player) => player.team === 'home')!;
    state.ball = {
      x: 50,
      y: 67.9,
      velocity: { x: 0, y: 8 },
      looseSince: state.time,
      lastTouchPlayerId: lastTouch.id,
    };
    const next = stepTacticalMatch(state, FIXED_MATCH_DT);
    expect(next.scenario).toBe('throw_in');
    expect(next.lastBoundaryRestart).toBe('throw_in');
    expect(next.lastBoundaryCrossing).toMatchObject({
      boundary: 'touchline_bottom',
      restartTeam: 'away',
    });
    expect(next.ball.ownerId).toBeTruthy();
  });

  it.each([
    ['top touchline', { x: 52, y: 0.2 }, { x: 0, y: -20 }],
    ['bottom touchline', { x: 52, y: 67.8 }, { x: 0, y: 20 }],
    ['home goal line', { x: 0.2, y: 20 }, { x: -20, y: 0 }],
    ['away goal line', { x: 104.8, y: 48 }, { x: 20, y: 0 }],
  ] as const)('stops the global race before the %s', (_label, position, velocity) => {
    const world = createCanonicalWorldDatabase();
    const state = createTacticalMatch(
      createSingleMatchSession(world, {
        homeClubId: world.clubs[0]!.id,
        awayClubId: world.clubs[1]!.id,
        seed: `boundary-race-${_label}`,
        control: { mode: 'spectator' },
      }),
    );
    for (const player of state.players) player.position = { x: 52.5, y: 34 };
    state.ball = { ...position, velocity: { ...velocity }, looseSince: state.time };
    expect(evaluateGlobalBallRace(state)).toEqual([]);
    expect(deriveLooseBallAssignments(state)).toEqual([]);
  });

  it('preserves a reachable interception before the line but rejects a late chase', () => {
    const world = createCanonicalWorldDatabase();
    const state = createTacticalMatch(
      createSingleMatchSession(world, {
        homeClubId: world.clubs[0]!.id,
        awayClubId: world.clubs[1]!.id,
        seed: 'near-line-race',
        control: { mode: 'spectator' },
      }),
    );
    for (const player of state.players) player.position = { x: 50, y: 40 };
    state.ball = { x: 50, y: 3, velocity: { x: 0, y: -3 }, looseSince: state.time };
    state.players[1]!.position = { x: 50, y: 2.4 };
    const race = evaluateGlobalBallRace(state);
    expect(race.some(({ playerId }) => playerId === state.players[1]!.id)).toBe(true);
    expect(race.every(({ interceptPoint }) => interceptPoint.y >= 0)).toBe(true);

    state.players[1]!.position = { x: 50, y: 20 };
    expect(evaluateGlobalBallRace(state)).toEqual([]);
  });

  it('keeps a naturally stopping ball inside the line reachable', () => {
    const world = createCanonicalWorldDatabase();
    const state = createTacticalMatch(
      createSingleMatchSession(world, {
        homeClubId: world.clubs[0]!.id,
        awayClubId: world.clubs[1]!.id,
        seed: 'stops-inside',
        control: { mode: 'spectator' },
      }),
    );
    for (const player of state.players) player.position = { x: 50, y: 30 };
    state.players[1]!.position = { x: 50, y: 0.8 };
    state.ball = { x: 50, y: 0.2, velocity: { x: 0, y: -0.5 }, looseSince: state.time };
    expect(evaluateGlobalBallRace(state)).not.toEqual([]);
    expect(deriveLooseBallAssignments(state).every(({ target }) => target.y >= 0)).toBe(true);
  });

  it('regresses lab-mtxzr4uq without an off-pitch decision or race candidate', () => {
    const world = createCanonicalWorldDatabase();
    let state = createTacticalMatch(
      createSingleMatchSession(world, {
        homeClubId: world.clubs[0]!.id,
        awayClubId: world.clubs[1]!.id,
        seed: 'lab-mtxzr4uq',
        control: { mode: 'spectator' },
      }),
    );
    for (const player of state.players) player.position = { x: 90, y: 60 };
    state.controlledFootballerId = state.players[1]!.id;
    state.ball = {
      x: 61.58780278666767,
      y: 7.973994692539205,
      velocity: { x: 3.420931499286378, y: -8.92400383915994 },
      looseSince: state.time,
      lastTouchPlayerId: state.players[0]!.id,
    };
    const snapshot = structuredClone(state);
    const first = evaluateGlobalBallRace(state);
    expect(first).toEqual([]);
    expect(evaluateGlobalBallRace(state)).toEqual(first);
    expect(state).toEqual(snapshot);
    expect(() => projectPlayerDecisionOpportunity(state)).not.toThrow();

    delete state.controlledFootballerId;
    state.ball.y = 0.1;
    state = stepTacticalMatch(state, FIXED_MATCH_DT);
    expect(state.scenario).toBe('throw_in');
    expect(state.lastBoundaryCrossing?.boundary).toBe('touchline_top');
  });
});
