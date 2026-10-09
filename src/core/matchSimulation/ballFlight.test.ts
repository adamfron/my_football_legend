import { describe, expect, it } from 'vitest';
import {
  GOAL_CENTRE_Y,
  GOAL_HEIGHT,
  GOAL_WIDTH,
  BALL_RADIUS,
  deterministicRebound,
  deriveWallContactCandidate,
  resolveBallRebound,
  findFirstBallContact,
  type FlightPoint,
} from './ballFlight';

const segment = (y: number, z: number, previousX = 100, nextX = 110) => ({
  previous: { x: previousX, y, z },
  next: { x: nextX, y, z },
  attackingTeam: 'home' as const,
});

describe('PR159 finite wall and rebound physics', () => {
  it('recognises an existing overlap with a stationary rounded capsule end', () => {
    const wall = deriveWallContactCandidate('wall', { x: 5, y: 34 }, 1.8);
    const point = { x: 5, y: 34, z: 1.7 };
    const contact = findFirstBallContact({
      previous: point,
      next: point,
      attackingTeam: 'home',
      candidates: [wall],
    });
    expect(contact?.kind).toBe('defender');
    expect(contact?.segmentFraction).toBe(0);
  });
  const low = () => segment(34, 0.11, 0, 10);
  it('blocks a low strike when grounded and permits it only above the actual lifted feet', () => {
    const standing = deriveWallContactCandidate('wall', { x: 5, y: 34 }, 1.8);
    expect(findFirstBallContact({ ...low(), candidates: [standing] })?.kind).toBe('defender');
    const jumping = deriveWallContactCandidate('wall', { x: 5, y: 34 }, 1.8, 0.45);
    expect(findFirstBallContact({ ...low(), candidates: [jumping] })).toBeUndefined();
    const smallLift = deriveWallContactCandidate('wall', { x: 5, y: 34 }, 1.8, 0.12);
    expect(findFirstBallContact({ ...low(), candidates: [smallLift] })?.kind).toBe('defender');
  });
  it('uses the ball diameter and finite body volumes for genuine and impossible wall gaps', () => {
    const wall = (spacing: number) =>
      [-1, 1].map((side) =>
        deriveWallContactCandidate(`wall-${side}`, { x: 5, y: 34 + (side * spacing) / 2 }, 1.8),
      );
    expect(findFirstBallContact({ ...low(), candidates: wall(1.2) })).toBeUndefined();
    expect(findFirstBallContact({ ...low(), candidates: wall(0.6) })?.kind).toBe('defender');
  });
  it('detects a body moving across the ball between two endpoint positions', () => {
    const moving = deriveWallContactCandidate('wall', { x: 5, y: 38 }, 1.8, 0, { x: 5, y: 30 }, 0);
    expect(findFirstBallContact({ ...segment(34, 0.9, 0, 10), candidates: [moving] })?.kind).toBe(
      'defender',
    );
    const endpointOnly = { ...moving };
    delete endpointOnly.previousCentre;
    expect(
      findFirstBallContact({ ...segment(34, 0.9, 0, 10), candidates: [endpointOnly] }),
    ).toBeUndefined();
  });
  it('retains finite vertical motion and damped spin after keeper and frame contacts', () => {
    const incoming = { x: 28, y: 3, z: 7 };
    const spin = { x: 5, y: 60, z: 80 };
    for (const kind of ['goalkeeper', 'defender', 'left_post', 'right_post', 'crossbar'] as const) {
      const rebound = resolveBallRebound(kind, incoming, 'home', spin);
      expect(rebound.velocity.x).toBeLessThan(0);
      expect(Number.isFinite(rebound.velocity.z)).toBe(true);
      expect(Math.abs(rebound.spin!.z)).toBeLessThan(spin.z);
      expect(rebound.airborne).toBe(true);
    }
    expect(resolveBallRebound('crossbar', incoming, 'home', spin).velocity.z).toBeLessThan(0);
  });
});

describe('canonical ball-flight contacts', () => {
  it('requires the whole ball to cross either goal line, preserving earlier frame and keeper contacts', () => {
    expect(findFirstBallContact(segment(34, 1, 104.8, 105.05))).toBeUndefined();
    const goal = findFirstBallContact(segment(34, 1, 104.8, 105.3))!;
    expect(goal.kind).toBe('goal_plane');
    expect(goal.point.x).toBeCloseTo(105 + BALL_RADIUS, 12);
    expect(
      findFirstBallContact({
        previous: { x: 0.2, y: 34, z: 1 },
        next: { x: -0.05, y: 34, z: 1 },
        attackingTeam: 'away',
      }),
    ).toBeUndefined();
    const awayGoal = findFirstBallContact({
      previous: { x: 0.2, y: 34, z: 1 },
      next: { x: -0.3, y: 34, z: 1 },
      attackingTeam: 'away',
    })!;
    expect(awayGoal.point.x).toBeCloseTo(-BALL_RADIUS, 12);
    expect(awayGoal.kind).toBe('goal_plane');
    const saved = findFirstBallContact({
      ...segment(34, 1, 104.8, 105.3),
      candidates: [
        {
          kind: 'goalkeeper',
          playerId: 'keeper',
          centre: { x: 105.18, y: 34, z: 1 },
          radius: 0.01,
        },
      ],
    })!;
    expect(saved.kind).toBe('goalkeeper');
    expect(saved.point.x).toBeGreaterThan(105);
    expect(saved.point.x).toBeLessThan(105 + BALL_RADIUS);
    expect(
      findFirstBallContact(segment(GOAL_CENTRE_Y - GOAL_WIDTH / 2, 1, 104.8, 105.05))?.kind,
    ).toBe('left_post');
    expect(findFirstBallContact(segment(34, 1, 105.3, 104.8))).toBeUndefined();
  });
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
