import { z } from 'zod';
import type { PhysicalPoint, PitchPoint, TeamSide } from './matchSpace';

/** Law-sized goal geometry in pitch metres. Renderers project this geometry; they do not own it. */
export const BALL_RADIUS = 0.11;
export const GOAL_WIDTH = 7.32;
export const GOAL_HEIGHT = 2.44;
export const GOAL_POST_RADIUS = 0.06;
export const GOAL_CENTRE_Y = 34;

export const ballContactKindSchema = z.enum([
  'goalkeeper',
  'defender',
  'left_post',
  'right_post',
  'crossbar',
  'goal_plane',
  'out',
]);
export type BallContactKind = z.infer<typeof ballContactKindSchema>;
export const ballContactSchema = z.object({
  kind: ballContactKindSchema,
  point: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  segmentFraction: z.number().min(0).max(1),
  at: z.number().nonnegative(),
  playerId: z.string().optional(),
  preContactSpeed: z.number().nonnegative(),
  postContactSpeed: z.number().nonnegative(),
});
export type BallContact = z.infer<typeof ballContactSchema>;

export interface FlightPoint extends PhysicalPoint {
  z: number;
}

export interface ContactCandidate {
  kind: 'goalkeeper' | 'defender';
  playerId: string;
  centre: FlightPoint;
  radius: number;
}

export interface FlightContactQuery {
  previous: FlightPoint;
  next: FlightPoint;
  attackingTeam: TeamSide;
  candidates?: ContactCandidate[];
}

interface Intersection {
  kind: BallContactKind;
  point: FlightPoint;
  segmentFraction: number;
  playerId?: string;
}

const interpolate = (a: FlightPoint, b: FlightPoint, t: number): FlightPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

const sphereIntersection = (
  a: FlightPoint,
  b: FlightPoint,
  centre: FlightPoint,
  radius: number,
): number | undefined => {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const f = { x: a.x - centre.x, y: a.y - centre.y, z: a.z - centre.z };
  const aa = d.x * d.x + d.y * d.y + d.z * d.z;
  const bb = 2 * (f.x * d.x + f.y * d.y + f.z * d.z);
  const cc = f.x * f.x + f.y * f.y + f.z * f.z - radius * radius;
  const discriminant = bb * bb - 4 * aa * cc;
  if (aa === 0 || discriminant < 0) return undefined;
  const root = Math.sqrt(discriminant);
  const values = [(-bb - root) / (2 * aa), (-bb + root) / (2 * aa)].filter(
    (value) => value >= 0 && value <= 1,
  );
  return values.length ? Math.min(...values) : undefined;
};

/** Returns the earliest continuous contact along a fixed-step segment, preventing tunnelling. */
export const findFirstBallContact = (query: FlightContactQuery): Intersection | undefined => {
  const { previous, next } = query;
  const intersections: Intersection[] = [];
  for (const candidate of query.candidates ?? []) {
    const t = sphereIntersection(previous, next, candidate.centre, candidate.radius + BALL_RADIUS);
    if (t !== undefined)
      intersections.push({
        kind: candidate.kind,
        playerId: candidate.playerId,
        point: interpolate(previous, next, t),
        segmentFraction: t,
      });
  }

  const goalX = query.attackingTeam === 'home' ? 105 : 0;
  const dx = next.x - previous.x;
  const planeT = dx === 0 ? undefined : (goalX - previous.x) / dx;
  if (planeT !== undefined && planeT >= 0 && planeT <= 1) {
    const point = interpolate(previous, next, planeT);
    const halfWidth = GOAL_WIDTH / 2;
    const leftY = GOAL_CENTRE_Y - halfWidth;
    const rightY = GOAL_CENTRE_Y + halfWidth;
    const postReach = BALL_RADIUS + GOAL_POST_RADIUS;
    const leftDistance = Math.hypot(point.y - leftY, Math.max(0, point.z - GOAL_HEIGHT));
    const rightDistance = Math.hypot(point.y - rightY, Math.max(0, point.z - GOAL_HEIGHT));
    if (point.z >= 0 && point.z <= GOAL_HEIGHT + postReach && leftDistance <= postReach)
      intersections.push({ kind: 'left_post', point, segmentFraction: planeT });
    if (point.z >= 0 && point.z <= GOAL_HEIGHT + postReach && rightDistance <= postReach)
      intersections.push({ kind: 'right_post', point, segmentFraction: planeT });
    if (
      point.y >= leftY - BALL_RADIUS &&
      point.y <= rightY + BALL_RADIUS &&
      Math.abs(point.z - GOAL_HEIGHT) <= postReach
    )
      intersections.push({ kind: 'crossbar', point, segmentFraction: planeT });
    const legal =
      point.y > leftY + BALL_RADIUS &&
      point.y < rightY - BALL_RADIUS &&
      point.z >= BALL_RADIUS &&
      point.z < GOAL_HEIGHT - BALL_RADIUS;
    intersections.push({ kind: legal ? 'goal_plane' : 'out', point, segmentFraction: planeT });
  }
  return intersections.sort((a, b) => a.segmentFraction - b.segmentFraction)[0];
};

export const deterministicRebound = (
  kind: BallContactKind,
  incoming: PitchPoint,
  attackingTeam: TeamSide,
): PitchPoint => {
  const speed = Math.max(5, Math.hypot(incoming.x, incoming.y));
  const away = attackingTeam === 'home' ? -1 : 1;
  if (kind === 'left_post') return { x: away * speed * 0.48, y: speed * 0.42 };
  if (kind === 'right_post') return { x: away * speed * 0.48, y: -speed * 0.42 };
  if (kind === 'crossbar') return { x: away * speed * 0.55, y: incoming.y * 0.25 };
  if (kind === 'defender') return { x: away * speed * 0.38, y: -incoming.y * 0.5 };
  return { x: away * speed * 0.32, y: incoming.y * 0.65 };
};
