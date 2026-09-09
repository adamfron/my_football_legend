import { z } from 'zod';
import { pitchPointSchema, type PitchPoint } from './matchSpace';

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

/** Returns the first intersection of a directed ball segment with the pitch rectangle. */
export const findPitchBoundaryCrossing = (
  previous: PitchPoint,
  next: PitchPoint,
): PitchBoundaryCrossing | undefined => {
  const dx = next.x - previous.x;
  const dy = next.y - previous.y;
  const candidates: PitchBoundaryCrossing[] = [];
  const add = (fraction: number, boundary: PitchBoundary, point: PitchPoint) => {
    if (
      fraction > 0 &&
      fraction <= 1 &&
      point.x >= 0 &&
      point.x <= 105 &&
      point.y >= 0 &&
      point.y <= 68
    )
      candidates.push({ point, boundary, segmentFraction: fraction });
  };
  if (dy < 0) {
    const t = (0 - previous.y) / dy;
    add(t, 'touchline_top', { x: previous.x + dx * t, y: 0 });
  }
  if (dy > 0) {
    const t = (68 - previous.y) / dy;
    add(t, 'touchline_bottom', { x: previous.x + dx * t, y: 68 });
  }
  if (dx < 0) {
    const t = (0 - previous.x) / dx;
    add(t, 'goal_line_home', { x: 0, y: previous.y + dy * t });
  }
  if (dx > 0) {
    const t = (105 - previous.x) / dx;
    add(t, 'goal_line_away', { x: 105, y: previous.y + dy * t });
  }
  return candidates.sort(
    (a, b) => a.segmentFraction - b.segmentFraction || a.boundary.localeCompare(b.boundary),
  )[0];
};
