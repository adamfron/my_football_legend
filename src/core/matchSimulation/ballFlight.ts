import { z } from 'zod';
import type { PhysicalPoint, PitchPoint, TeamSide } from './matchSpace';
import type { BallSpin3d, BallVelocity3d } from './ballPhysics';

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
  /** A vertical capsule; omitted keeps the existing spherical body envelope. */
  halfHeight?: number;
  /** Previous body centre, for continuous collision with a moving/jumping wall. */
  previousCentre?: FlightPoint;
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

/** A grounded wall has no artificial hole beneath its body; lift moves the whole finite volume. */
export const deriveWallContactCandidate = (
  playerId: string,
  position: PhysicalPoint,
  heightMetres: number,
  jumpHeight = 0,
  previousPosition?: PhysicalPoint,
  previousJumpHeight = jumpHeight,
): ContactCandidate => {
  const height = Math.max(1.4, Math.min(2.2, heightMetres));
  const radius = 0.28;
  return {
    kind: 'defender',
    playerId,
    centre: { ...position, z: height / 2 + Math.max(0, jumpHeight) },
    radius,
    halfHeight: height / 2 - radius,
    ...(previousPosition
      ? { previousCentre: { ...previousPosition, z: height / 2 + Math.max(0, previousJumpHeight) } }
      : {}),
  };
};

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
  // An existing overlap is already a contact, including a stationary rounded capsule end.
  if (cc <= 0) return 0;
  const discriminant = bb * bb - 4 * aa * cc;
  if (aa === 0 || discriminant < 0) return undefined;
  const root = Math.sqrt(discriminant);
  const values = [(-bb - root) / (2 * aa), (-bb + root) / (2 * aa)].filter(
    (value) => value >= 0 && value <= 1,
  );
  return values.length ? Math.min(...values) : undefined;
};

/** Sweeps against a finite vertical capsule, including the two rounded ends. */
const capsuleIntersection = (
  a: FlightPoint,
  b: FlightPoint,
  centre: FlightPoint,
  radius: number,
  halfHeight: number,
): number | undefined => {
  const low = centre.z - halfHeight;
  const high = centre.z + halfHeight;
  const values = [
    sphereIntersection(a, b, { ...centre, z: low }, radius),
    sphereIntersection(a, b, { ...centre, z: high }, radius),
  ].filter((value): value is number => value !== undefined);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - centre.x;
  const fy = a.y - centre.y;
  const aa = dx * dx + dy * dy;
  const bb = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - radius * radius;
  if (cc <= 0 && a.z >= low && a.z <= high) values.push(0);
  const discriminant = bb * bb - 4 * aa * cc;
  if (aa > 0 && discriminant >= 0) {
    const root = Math.sqrt(discriminant);
    for (const t of [(-bb - root) / (2 * aa), (-bb + root) / (2 * aa)]) {
      const height = a.z + (b.z - a.z) * t;
      if (t >= 0 && t <= 1 && height >= low && height <= high) values.push(t);
    }
  }
  return values.length ? Math.min(...values) : undefined;
};

/** Returns the earliest continuous contact along a fixed-step segment, preventing tunnelling. */
export const findFirstBallContact = (query: FlightContactQuery): Intersection | undefined => {
  const { previous, next } = query;
  const intersections: Intersection[] = [];
  for (const candidate of query.candidates ?? []) {
    const a = candidate.previousCentre
      ? {
          x: previous.x - candidate.previousCentre.x,
          y: previous.y - candidate.previousCentre.y,
          z: previous.z - candidate.previousCentre.z,
        }
      : previous;
    const b = candidate.previousCentre
      ? {
          x: next.x - candidate.centre.x,
          y: next.y - candidate.centre.y,
          z: next.z - candidate.centre.z,
        }
      : next;
    const centre = candidate.previousCentre ? { x: 0, y: 0, z: 0 } : candidate.centre;
    const t =
      candidate.halfHeight !== undefined
        ? capsuleIntersection(a, b, centre, candidate.radius + BALL_RADIUS, candidate.halfHeight)
        : sphereIntersection(a, b, centre, candidate.radius + BALL_RADIUS);
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
  }
  // Frame contact is at its own geometry; scoring/out occurs only after the trailing edge
  // passes the goal line. A return from the net toward the pitch cannot score a second goal.
  const direction = query.attackingTeam === 'home' ? 1 : -1;
  const scoringT =
    dx * direction > 0 ? (goalX + direction * BALL_RADIUS - previous.x) / dx : undefined;
  if (scoringT !== undefined && scoringT >= 0 && scoringT <= 1) {
    const point = interpolate(previous, next, scoringT);
    const legal =
      point.y > GOAL_CENTRE_Y - GOAL_WIDTH / 2 + BALL_RADIUS &&
      point.y < GOAL_CENTRE_Y + GOAL_WIDTH / 2 - BALL_RADIUS &&
      point.z >= BALL_RADIUS &&
      point.z < GOAL_HEIGHT - BALL_RADIUS;
    intersections.push({ kind: legal ? 'goal_plane' : 'out', point, segmentFraction: scoringT });
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

/** A finite 3D continuation. Sporting outcomes remain in the shared contact resolver. */
export const resolveBallRebound = (
  kind: BallContactKind,
  incoming: BallVelocity3d,
  attackingTeam: TeamSide,
  spin?: BallSpin3d,
): { velocity: BallVelocity3d; spin?: BallSpin3d; airborne: boolean } => {
  const horizontal = deterministicRebound(kind, incoming, attackingTeam);
  const vertical =
    kind === 'crossbar'
      ? -Math.abs(incoming.z) * 0.46
      : incoming.z * (kind === 'left_post' || kind === 'right_post' ? 0.7 : 0.42);
  const retention =
    kind === 'left_post' || kind === 'right_post' || kind === 'crossbar' ? 0.62 : 0.3;
  return {
    velocity: { ...horizontal, z: vertical },
    ...(spin
      ? { spin: { x: spin.x * retention, y: spin.y * retention, z: -spin.z * retention } }
      : {}),
    airborne: vertical !== 0,
  };
};
