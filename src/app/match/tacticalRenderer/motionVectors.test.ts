import { describe, expect, it } from 'vitest';
import { projectMotionVectors } from './motionVectors';
import type { TacticalFrame } from './model';

const frame: TacticalFrame = {
  timestampMs: 1000,
  ball: { x: 50, y: 34 },
  showMotionVectors: true,
  players: [
    {
      id: 'controlled',
      team: 'home',
      protagonist: true,
      x: 50,
      y: 34,
      velocity: { x: 7, y: 0 },
      target: { x: 0, y: 0 },
    },
    { id: 'near', team: 'away', x: 55, y: 34, velocity: { x: 0, y: -3 } },
    { id: 'standing', team: 'home', x: 52, y: 34, velocity: { x: 0, y: 0 } },
    { id: 'far', team: 'away', x: 100, y: 60, velocity: { x: 4, y: 0 } },
  ],
};

describe('decision motion information', () => {
  it('shows relevant current velocity, including controlled momentum, without planned targets or mutations', () => {
    const before = JSON.stringify(frame);
    const vectors = projectMotionVectors(frame);
    expect(vectors.map((vector) => vector.playerId)).toEqual(['controlled', 'near']);
    expect(vectors[0]!.end.x).toBeCloseTo(54.2);
    expect(vectors[1]!.end.y).toBeCloseTo(32.2);
    expect(JSON.stringify(frame)).toBe(before);
    expect(projectMotionVectors({ ...frame, showMotionVectors: false })).toEqual([]);
  });
});
