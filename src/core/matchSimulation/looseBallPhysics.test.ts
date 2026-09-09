import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  deriveLooseBallAssignments,
  distance,
  rollLooseBall,
  stepTacticalMatch,
} from '.';

describe('loose ball physics', () => {
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
});
