import { z } from 'zod';
import { pitchPointSchema, type PhysicalPoint, type PitchPoint } from './matchSpace';
import { BALL_RADIUS } from './ballFlight';

export const pitchBoundarySchema = z.enum([
  'touchline_top',
  'touchline_bottom',
  'goal_line_home',
  'goal_line_away',
]);
export type PitchBoundary = z.infer<typeof pitchBoundarySchema>;

export const pitchBoundaryCrossingSchema = z.object({
  point: pitchPointSchema,
  boundary: pitchBoundarySchema,
  segmentFraction: z.number().min(0).max(1),
});
export type PitchBoundaryCrossing = z.infer<typeof pitchBoundaryCrossingSchema>;

/** Wholly out means the ball's trailing edge crossed the line, not its centre.
 * The physical crossing fraction orders contacts; the point projects onto the legal line. */
export const findPitchBoundaryCrossing = (
  previous: PhysicalPoint,
  next: PhysicalPoint,
): PitchBoundaryCrossing | undefined => {
  const dx = next.x - previous.x;
  const dy = next.y - previous.y;
  const candidates: PitchBoundaryCrossing[] = [];
  const add = (fraction: number, boundary: PitchBoundary, point: PitchPoint) => {
    if (fraction >= 0 && fraction <= 1 && Number.isFinite(point.x) && Number.isFinite(point.y))
      candidates.push({
        point: { x: Math.max(0, Math.min(105, point.x)), y: Math.max(0, Math.min(68, point.y)) },
        boundary,
        segmentFraction: Math.max(0, fraction),
      });
  };
  if (dy < 0) {
    const t = (-BALL_RADIUS - previous.y) / dy;
    add(t, 'touchline_top', { x: previous.x + dx * t, y: 0 });
  }
  if (dy > 0) {
    const t = (68 + BALL_RADIUS - previous.y) / dy;
    add(t, 'touchline_bottom', { x: previous.x + dx * t, y: 68 });
  }
  if (dx < 0) {
    const t = (-BALL_RADIUS - previous.x) / dx;
    add(t, 'goal_line_home', { x: 0, y: previous.y + dy * t });
  }
  if (dx > 0) {
    const t = (105 + BALL_RADIUS - previous.x) / dx;
    add(t, 'goal_line_away', { x: 105, y: previous.y + dy * t });
  }
  return candidates.sort(
    (a, b) => a.segmentFraction - b.segmentFraction || a.boundary.localeCompare(b.boundary),
  )[0];
};
