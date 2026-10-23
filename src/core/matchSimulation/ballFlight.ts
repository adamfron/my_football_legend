import { attacksRight } from './matchSpace';
import { z } from 'zod';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';
import type { PhysicalPoint, PitchPoint, TeamOrientation } from './matchSpace';
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
  surfaceVelocity: z
    .object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() })
    .optional(),
  surfaceNormal: z
    .object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() })
    .optional(),
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
  attackingTeam: TeamOrientation;
  candidates?: ContactCandidate[];
  /** Optional apparatus opening; ordinary matches retain law-sized defaults. */
  goal?: { width: number; height: number; postRadius: number };
}

interface Intersection {
  kind: BallContactKind;
  point: FlightPoint;
  segmentFraction: number;
  playerId?: string;
  surfaceNormal?: FlightPoint;
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
const findFirstBallContactGeometry = (query: FlightContactQuery): Intersection | undefined => {
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
    if (t !== undefined) {
      const point = interpolate(previous, next, t);
      const body = candidate.previousCentre
        ? interpolate(candidate.previousCentre, candidate.centre, t)
        : candidate.centre;
      // The closest point on the same swept capsule/sphere used by CCD is the available
      // collision surface. No extra body geometry or random deflection angle is invented.
      const axisZ = Math.max(
        body.z - (candidate.halfHeight ?? 0),
        Math.min(body.z + (candidate.halfHeight ?? 0), point.z),
      );
      const normal = { x: point.x - body.x, y: point.y - body.y, z: point.z - axisZ };
      const magnitude = Math.hypot(normal.x, normal.y, normal.z);
      intersections.push({
        kind: candidate.kind,
        playerId: candidate.playerId,
        point,
        segmentFraction: t,
        ...(magnitude > 0.000001
          ? {
              surfaceNormal: {
                x: normal.x / magnitude,
                y: normal.y / magnitude,
                z: normal.z / magnitude,
              },
            }
          : {}),
      });
    }
  }

  const goalWidth = query.goal?.width ?? GOAL_WIDTH;
  const goalHeight = query.goal?.height ?? GOAL_HEIGHT;
  const postRadius = query.goal?.postRadius ?? GOAL_POST_RADIUS;
  const goalX = attacksRight(query.attackingTeam) ? 105 : 0;
  const dx = next.x - previous.x;
  const planeT = dx === 0 ? undefined : (goalX - previous.x) / dx;
  if (planeT !== undefined && planeT >= 0 && planeT <= 1) {
    const point = interpolate(previous, next, planeT);
    const halfWidth = goalWidth / 2;
    const leftY = GOAL_CENTRE_Y - halfWidth;
    const rightY = GOAL_CENTRE_Y + halfWidth;
    const postReach = BALL_RADIUS + postRadius;
    const leftDistance = Math.hypot(point.y - leftY, Math.max(0, point.z - goalHeight));
    const rightDistance = Math.hypot(point.y - rightY, Math.max(0, point.z - goalHeight));
    if (point.z >= 0 && point.z <= goalHeight + postReach && leftDistance <= postReach)
      intersections.push({ kind: 'left_post', point, segmentFraction: planeT });
    if (point.z >= 0 && point.z <= goalHeight + postReach && rightDistance <= postReach)
      intersections.push({ kind: 'right_post', point, segmentFraction: planeT });
    if (
      point.y >= leftY - BALL_RADIUS &&
      point.y <= rightY + BALL_RADIUS &&
      Math.abs(point.z - goalHeight) <= postReach
    )
      intersections.push({ kind: 'crossbar', point, segmentFraction: planeT });
  }
  // Frame contact is at its own geometry; scoring/out occurs only after the trailing edge
  // passes the goal line. A return from the net toward the pitch cannot score a second goal.
  const direction = attacksRight(query.attackingTeam) ? 1 : -1;
  const scoringT =
    dx * direction > 0 ? (goalX + direction * BALL_RADIUS - previous.x) / dx : undefined;
  if (scoringT !== undefined && scoringT >= 0 && scoringT <= 1) {
    const point = interpolate(previous, next, scoringT);
    const legal =
      point.y > GOAL_CENTRE_Y - goalWidth / 2 + BALL_RADIUS &&
      point.y < GOAL_CENTRE_Y + goalWidth / 2 - BALL_RADIUS &&
      point.z >= BALL_RADIUS &&
      point.z < goalHeight - BALL_RADIUS;
    intersections.push({ kind: legal ? 'goal_plane' : 'out', point, segmentFraction: scoringT });
  }
  return intersections.sort((a, b) => a.segmentFraction - b.segmentFraction)[0];
};

export const findFirstBallContact = (query: FlightContactQuery): Intersection | undefined => {
  const span = startPerformanceSpan('ball_contact_detection');
  try {
    return findFirstBallContactGeometry(query);
  } finally {
    endPerformanceSpan('ball_contact_detection', span);
  }
};

export const deterministicRebound = (
  kind: BallContactKind,
  incoming: PitchPoint,
  attackingTeam: TeamOrientation,
): PitchPoint => {
  if (kind === 'defender' || kind === 'goalkeeper') {
    const velocity = playerDeflection(kind, { ...incoming, z: 0 });
    return { x: velocity.x, y: velocity.y };
  }
  const speed = Math.hypot(incoming.x, incoming.y);
  const away = attacksRight(attackingTeam) ? -1 : 1;
  if (kind === 'left_post') return { x: away * speed * 0.48, y: speed * 0.42 };
  if (kind === 'right_post') return { x: away * speed * 0.48, y: -speed * 0.42 };
  if (kind === 'crossbar') return { x: away * speed * 0.55, y: incoming.y * 0.25 };
  return { x: away * speed * 0.32, y: incoming.y * 0.65 };
};

export const reboundContextSchema = z.object({
  restitution: z.number().min(0).max(1).optional(),
  tangentRetention: z.number().min(0).max(1).optional(),
  surfaceVelocity: z
    .object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() })
    .optional(),
  surfaceNormal: z
    .object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() })
    .optional(),
  point: z
    .object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() })
    .optional(),
  goalkeeperAction: z.enum(['parry', 'parry_away', 'failed_save', 'no_chance']).optional(),
});
export type ReboundContext = z.infer<typeof reboundContextSchema>;

/** Dissipative normal/tangent response. A glancing block preserves some forward travel;
 * a head-on block reflects it. Legacy contacts without a normal use an opposing horizontal
 * surface, rather than a fixed pitch direction. The keeper's reach envelope is not a hand:
 * parry-away approximates a slightly outward-oriented hand plane, bounded by the incoming
 * energy. It can still leave a dangerous second ball or travel behind the goal line. */
const playerDeflection = (
  kind: 'defender' | 'goalkeeper',
  incoming: BallVelocity3d,
  context: ReboundContext = {},
): BallVelocity3d => {
  const horizontal = Math.hypot(incoming.x, incoming.y);
  const fallback = {
    x: horizontal > 0.000001 ? -incoming.x / horizontal : 0,
    y: horizontal > 0.000001 ? -incoming.y / horizontal : 0,
    z: horizontal > 0.000001 ? 0 : -Math.sign(incoming.z),
  };
  let normal = context.surfaceNormal ?? fallback;
  if (kind === 'goalkeeper' && context.goalkeeperAction === 'parry_away') {
    const outward = Math.sign((context.point?.y ?? 34) - 34) || Math.sign(incoming.y);
    normal = {
      x: normal.x * 0.7 + fallback.x * 0.3,
      y: normal.y * 0.7 + outward * 0.45,
      z: normal.z * 0.7,
    };
  }
  const magnitude = Math.hypot(normal.x, normal.y, normal.z);
  normal =
    magnitude > 0.000001
      ? { x: normal.x / magnitude, y: normal.y / magnitude, z: normal.z / magnitude }
      : fallback;
  const dot = incoming.x * normal.x + incoming.y * normal.y + incoming.z * normal.z;
  // An overlap already moving away must not reflect back into the same body.
  if (dot >= 0) return { ...incoming };
  const partial =
    kind === 'goalkeeper' &&
    (context.goalkeeperAction === 'failed_save' || context.goalkeeperAction === 'no_chance');
  const away = kind === 'goalkeeper' && context.goalkeeperAction === 'parry_away';
  const tangent =
    context.tangentRetention ?? (partial ? 0.86 : away ? 0.74 : kind === 'defender' ? 0.72 : 0.6);
  const restitution =
    context.restitution ?? (partial ? 0.12 : away ? 0.52 : kind === 'defender' ? 0.38 : 0.3);
  const impulse = (tangent + restitution) * dot;
  return {
    x: incoming.x * tangent - impulse * normal.x,
    y: incoming.y * tangent - impulse * normal.y,
    z: incoming.z * tangent - impulse * normal.z,
  };
};

/** A finite 3D continuation. Sporting outcomes remain in the shared contact resolver. */
export const resolveBallRebound = (
  kind: BallContactKind,
  incoming: BallVelocity3d,
  attackingTeam: TeamOrientation,
  spin?: BallSpin3d,
  context?: ReboundContext,
): { velocity: BallVelocity3d; spin?: BallSpin3d; airborne: boolean } => {
  const surface = context?.surfaceVelocity ?? { x: 0, y: 0, z: 0 };
  const relative = {
    x: incoming.x - surface.x,
    y: incoming.y - surface.y,
    z: incoming.z - surface.z,
  };
  const response =
    kind === 'defender' || kind === 'goalkeeper'
      ? playerDeflection(kind, relative, context)
      : undefined;
  const deflection = response
    ? { x: response.x + surface.x, y: response.y + surface.y, z: response.z + surface.z }
    : undefined;
  const horizontal = deflection ?? deterministicRebound(kind, incoming, attackingTeam);
  const vertical =
    kind === 'crossbar'
      ? -Math.abs(incoming.z) * 0.46
      : incoming.z * (kind === 'left_post' || kind === 'right_post' ? 0.7 : 0.42);
  const retention =
    kind === 'left_post' || kind === 'right_post' || kind === 'crossbar' ? 0.62 : 0.3;
  return {
    velocity: { ...horizontal, z: deflection?.z ?? vertical },
    ...(spin
      ? { spin: { x: spin.x * retention, y: spin.y * retention, z: -spin.z * retention } }
      : {}),
    airborne: (deflection?.z ?? vertical) !== 0,
  };
};
