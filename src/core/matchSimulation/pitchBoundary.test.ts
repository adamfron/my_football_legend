import { describe, expect, it } from 'vitest';
import { findPitchBoundaryCrossing } from './pitchBoundary';

describe('canonical pitch boundary crossing', () => {
  it('preserves the exact first touchline intersection', () => {
    expect(findPitchBoundaryCrossing({ x: 20, y: 4 }, { x: 30, y: -4 })).toEqual({
      point: { x: 25.1375, y: 0 },
      boundary: 'touchline_top',
      segmentFraction: 0.51375,
    });
  });

  it('selects the first boundary when a segment passes a corner', () => {
    expect(findPitchBoundaryCrossing({ x: 100, y: 60 }, { x: 110, y: 90 })).toEqual({
      point: { x: 102.70333333333333, y: 68 },
      boundary: 'touchline_bottom',
      segmentFraction: 8.11 / 30,
    });
  });

  it('is pure and deterministic', () => {
    const previous = { x: 4, y: 30 },
      next = { x: -3, y: 37 };
    expect(findPitchBoundaryCrossing(previous, next)).toEqual(
      findPitchBoundaryCrossing(previous, next),
    );
    expect(previous).toEqual({ x: 4, y: 30 });
  });

  it.each([
    [{ x: 20, y: 0 }, { x: 20, y: -1 }, 'touchline_top'],
    [{ x: 20, y: 68 }, { x: 20, y: 69 }, 'touchline_bottom'],
    [{ x: 0, y: 20 }, { x: -1, y: 20 }, 'goal_line_home'],
    [{ x: 105, y: 20 }, { x: 106, y: 20 }, 'goal_line_away'],
  ] as const)('detects an outward departure from the painted line', (previous, next, boundary) => {
    expect(findPitchBoundaryCrossing(previous, next)).toMatchObject({
      boundary,
      segmentFraction: expect.closeTo(0.11, 12),
    });
  });

  it('does not report an inward movement from the line', () => {
    expect(findPitchBoundaryCrossing({ x: 20, y: 0 }, { x: 20, y: 1 })).toBeUndefined();
  });
  it('keeps a ball touching the painted line in play until its trailing edge crosses', () => {
    expect(findPitchBoundaryCrossing({ x: 20, y: 0.02 }, { x: 20, y: -0.1 })).toBeUndefined();
    expect(findPitchBoundaryCrossing({ x: 105, y: 20 }, { x: 105.1, y: 20 })).toBeUndefined();
    const crossing = findPitchBoundaryCrossing({ x: 104.9, y: 20 }, { x: 105.3, y: 22 });
    expect(crossing).toMatchObject({
      boundary: 'goal_line_away',
      point: { x: 105, y: expect.closeTo(21.05, 10) },
      segmentFraction: expect.closeTo(0.525, 10),
    });
  });
  it('projects a near-corner whole-ball crossing onto the legal boundary', () => {
    expect(
      findPitchBoundaryCrossing({ x: 104.99, y: 67.99 }, { x: 105.08, y: 68.15 }),
    ).toMatchObject({ point: { x: 105, y: 68 }, boundary: 'touchline_bottom' });
  });
});
