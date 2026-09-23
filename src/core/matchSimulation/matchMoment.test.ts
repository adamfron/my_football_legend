import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  MATCH_PRESENTATION_POLICIES,
  createTacticalMatch,
  projectMatchMoment,
  shouldSurfaceMatchMoment,
} from '.';

const world = createCanonicalWorldDatabase();
const createState = () =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'match-moment-foundation',
      control: { mode: 'spectator' },
    }),
  );

describe('pure match moment projection', () => {
  it('keeps routine midfield circulation low and is side-effect free', () => {
    const state = createState();
    const before = structuredClone(state);
    const first = projectMatchMoment(state);
    const second = projectMatchMoment(state);
    expect(first).toEqual(second);
    expect(first.kind).toBe('routine');
    expect(first.importance).toBeLessThan(0.2);
    expect(state).toEqual(before);
  });

  it('surfaces a shot without requiring controlled-player involvement', () => {
    const state = createState();
    const shooter = state.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
    )!;
    const { ownerId: _ownerId, ...releasedBall } = state.ball;
    void _ownerId;
    state.ball = {
      ...releasedBall,
      travelKind: 'shot',
      velocity: { x: 20, y: 0, z: 1 },
      shot: {
        shotId: 'moment-shot',
        shooterId: shooter.id,
        context: 'open_play',
        distance: 25,
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
        classification: 'on_target',
      },
    };
    const moment = projectMatchMoment(state);
    expect(moment.kind).toBe('shot');
    expect(moment.importance).toBeGreaterThanOrEqual(0.9);
    expect(shouldSurfaceMatchMoment(moment, MATCH_PRESENTATION_POLICIES.key_match)).toBe(true);
  });

  it('treats penalties as very important and ordinary throw-ins as routine', () => {
    const penalty = createState();
    penalty.scenario = 'penalty';
    expect(projectMatchMoment(penalty)).toMatchObject({ kind: 'penalty', importance: 0.98 });
    const throwIn = createState();
    throwIn.scenario = 'throw_in';
    expect(projectMatchMoment(throwIn).kind).toBe('routine');
  });
});
