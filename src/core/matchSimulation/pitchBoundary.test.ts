import { describe, expect, it } from 'vitest';
import { findPitchBoundaryCrossing } from './pitchBoundary';

describe('canonical pitch boundary crossing', () => {
  it('preserves the exact first touchline intersection', () => {
    expect(findPitchBoundaryCrossing({ x: 20, y: 4 }, { x: 30, y: -4 })).toEqual({
      point: { x: 25, y: 0 },
      boundary: 'touchline_top',
      segmentFraction: 0.5,
    });
  });

  it('selects the first boundary when a segment passes a corner', () => {
    expect(findPitchBoundaryCrossing({ x: 100, y: 60 }, { x: 110, y: 90 })).toEqual({
      point: { x: 102.66666666666667, y: 68 },
      boundary: 'touchline_bottom',
      segmentFraction: 8 / 30,
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
});
