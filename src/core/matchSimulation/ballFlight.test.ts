import { describe, expect, it } from 'vitest';
import {
  GOAL_CENTRE_Y,
  GOAL_HEIGHT,
  GOAL_WIDTH,
  deterministicRebound,
  findFirstBallContact,
  type FlightPoint,
} from './ballFlight';

const segment = (y: number, z: number, previousX = 100, nextX = 110) => ({
  previous: { x: previousX, y, z },
  next: { x: nextX, y, z },
  attackingTeam: 'home' as const,
});

describe('canonical ball-flight contacts', () => {
  it('classifies legal and illegal continuous goal-plane crossings', () => {
    expect(findFirstBallContact(segment(GOAL_CENTRE_Y, 0.7))?.kind).toBe('goal_plane');
    expect(findFirstBallContact(segment(GOAL_CENTRE_Y - GOAL_WIDTH, 0.7))?.kind).toBe('out');
    expect(findFirstBallContact(segment(GOAL_CENTRE_Y + GOAL_WIDTH, 0.7))?.kind).toBe('out');
    expect(findFirstBallContact(segment(GOAL_CENTRE_Y, GOAL_HEIGHT + 1))?.kind).toBe('out');
  });

  it('gives posts and crossbar priority over a simultaneous plane crossing', () => {
    expect(findFirstBallContact(segment(GOAL_CENTRE_Y - GOAL_WIDTH / 2, 0.8))?.kind).toBe(
      'left_post',
    );
    expect(findFirstBallContact(segment(GOAL_CENTRE_Y + GOAL_WIDTH / 2, 0.8))?.kind).toBe(
      'right_post',
    );
    expect(findFirstBallContact(segment(GOAL_CENTRE_Y, GOAL_HEIGHT))?.kind).toBe('crossbar');
  });

  it('cannot tunnel through a keeper between tick endpoints', () => {
    const contact = findFirstBallContact({
      ...segment(GOAL_CENTRE_Y, 1, 95, 110),
      candidates: [
        {
          kind: 'goalkeeper',
          playerId: 'keeper',
          centre: { x: 103, y: GOAL_CENTRE_Y, z: 1 },
          radius: 0.6,
        },
      ],
    });
    expect(contact).toMatchObject({ kind: 'goalkeeper', playerId: 'keeper' });
    expect(contact!.point.x).toBeLessThan(105);
  });

  it('rejects impossible keeper reach and uses the later goal plane', () => {
    expect(
      findFirstBallContact({
        ...segment(GOAL_CENTRE_Y, 1),
        candidates: [
          {
            kind: 'goalkeeper',
            playerId: 'keeper',
            centre: { x: 103, y: GOAL_CENTRE_Y + 5, z: 1 },
            radius: 0.6,
          },
        ],
      })?.kind,
    ).toBe('goal_plane');
  });

  it('resolves the geometrically first defender before keeper and goal', () => {
    const candidates = [
      { kind: 'goalkeeper' as const, playerId: 'gk', centre: { x: 103, y: 34, z: 1 }, radius: 0.6 },
      { kind: 'defender' as const, playerId: 'cb', centre: { x: 101, y: 34, z: 1 }, radius: 0.7 },
    ];
    const contact = findFirstBallContact({ ...segment(34, 1), candidates });
    expect(contact).toMatchObject({ kind: 'defender', playerId: 'cb' });
    const rebound = deterministicRebound('defender', { x: 30, y: 0 }, 'home');
    expect(rebound.x).toBeLessThan(0);
    expect(Math.hypot(rebound.x, rebound.y)).toBeGreaterThan(0);
  });

  it('does not let a ground defender block a high ball outside the corridor', () => {
    const defender = {
      kind: 'defender' as const,
      playerId: 'cb',
      centre: { x: 102, y: 38, z: 0.9 } satisfies FlightPoint,
      radius: 0.7,
    };
    expect(findFirstBallContact({ ...segment(34, 3), candidates: [defender] })?.kind).toBe('out');
  });
});
