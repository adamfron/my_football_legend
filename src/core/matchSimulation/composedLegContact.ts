import { BALL_RADIUS, type BallContact, type FlightPoint } from './ballFlight';
import type { PhysicalBall } from './ballPhysics';
import type { composeArticulatedLegs } from './articulatedBody';
import { composedJointAcceleration, type JointMotion } from './composedLegCurvature';
import { TEMPORAL_STRIKE } from './temporalFootTrajectory';

type Geometry = NonNullable<ReturnType<typeof composeArticulatedLegs>>;
type Capsule = Geometry['capsules'][number];
type TaperedCapsule = Capsule & { distalRadius: number };
type Foot = 'left' | 'right';
export type LegContact = NonNullable<BallContact['leg']>;
const FEET = ['left', 'right'] as const;
const { distanceTolerance } = TEMPORAL_STRIKE;
const TIME_TOLERANCE = 1e-10;
const MAXIMUM_SAMPLES = 192;
const norm = (a: FlightPoint) => Math.hypot(a.x, a.y, a.z);
const minus = (a: FlightPoint, b: FlightPoint) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: FlightPoint, b: FlightPoint) => a.x * b.x + a.y * b.y + a.z * b.z;
const mix = (a: FlightPoint, b: FlightPoint, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

type Motion = JointMotion & {
  ballSpeed: number;
  tightenIndividualKneeBound?: boolean;
  /** Set only for a bounded free ball curve and affine boot anchors. */
  ballAcceleration?: number;
};

/** Bounds exact IK motion around the sampled pose. The square roots are enclosed
 * directly so the search also works near a straight knee, where a fixed knee
 * speed estimate would let the ball tunnel. */
const jointTravel = (g: Geometry, movement: Motion, half: number, at: number) => {
  const hipXY = movement.horizontalHipSpeed * half;
  const boot = { left: movement.bootSpeed.left * half, right: movement.bootSpeed.right * half };
  const total = g.left.thighLength + g.left.shinLength;
  const pelvisLimit = (r: number) => Math.sqrt(Math.max(0, (total * 0.995) ** 2 - r ** 2));
  const nominal = movement.unconstrainedPelvisAt(at);
  let low = nominal - movement.unconstrainedPelvisSpeed * half;
  let high = nominal + movement.unconstrainedPelvisSpeed * half;
  for (const side of FEET) {
    const sideTotal = g.individualMorphology ? g[side].thighLength + g[side].shinLength : total;
    const sideLimit = g.individualMorphology
      ? (r: number) => Math.sqrt(Math.max(0, (sideTotal * 0.995) ** 2 - r ** 2))
      : pelvisLimit;
    const d = minus(g[side].ankle, g[side].hip);
    const r = Math.hypot(d.x, d.y),
      dr = hipXY + boot[side];
    low = Math.min(low, g[side].ankle.z - boot[side] + sideLimit(r + dr));
    high = Math.min(high, g[side].ankle.z + boot[side] + sideLimit(Math.max(0, r - dr)));
  }
  const hip = Math.hypot(hipXY, Math.max(g.pelvis.z - low, high - g.pelvis.z));
  const knee = (side: Foot) => {
    const leg = g[side];
    const axis = minus(leg.ankle, leg.hip),
      length = norm(axis),
      travel = hip + boot[side];
    if (g.individualMorphology) {
      const broad = hip + 2 * leg.thighLength;
      const short = length - travel;
      if (
        !movement.tightenIndividualKneeBound ||
        short <= Math.abs(leg.thighLength - leg.shinLength)
      )
        return broad;
      const long = Math.min(leg.thighLength + leg.shinLength, length + travel);
      const difference = leg.thighLength ** 2 - leg.shinLength ** 2;
      const along = (l: number) => (l + difference / l) / 2;
      const a = along(length);
      // Unequal bones can give the axial projection an interior minimum.
      const critical = Math.max(short, Math.min(long, Math.sqrt(Math.max(0, difference))));
      const minAlong = Math.min(along(short), along(long), along(critical));
      const maxAlong = Math.max(along(short), along(long));
      const bend = (offset: number) => Math.sqrt(Math.max(0, leg.thighLength ** 2 - offset ** 2));
      const closestToZero = Math.max(minAlong, Math.min(0, maxAlong));
      const bendTravel = Math.max(
        bend(closestToZero) - bend(a),
        bend(a) - Math.min(bend(minAlong), bend(maxAlong)),
      );
      const directionTravel = Math.min(2, (2 * travel) / length);
      const planeLength = Math.abs(axis.z) / length;
      if (planeLength < 1e-12) return broad;
      const planeTravel = Math.min(
        2,
        (2 * (2 * directionTravel + movement.yawSpeed * half)) / planeLength,
      );
      // Authored knee alignment rotates the bend direction around the moving
      // leg axis. Bound the change of both the projected direction and its cross product.
      const alignedTravel = Math.min(2, 2 * planeTravel + directionTravel);
      return Math.min(
        broad,
        hip +
          Math.max(a - minAlong, maxAlong - a) +
          Math.abs(a) * directionTravel +
          bendTravel +
          bend(a) * alignedTravel,
      );
    }
    const short = Math.max(leg.shinLength - leg.thighLength, length - travel),
      long = Math.min(total, length + travel);
    const along = (l: number) => (l + (leg.thighLength ** 2 - leg.shinLength ** 2) / l) / 2;
    const bend = (a: number) => Math.sqrt(Math.max(0, leg.thighLength ** 2 - a ** 2));
    const a = along(length),
      a0 = along(short),
      a1 = along(long),
      b = bend(a);
    const bendTravel = Math.max(
      bend(Math.max(a0, Math.min(0, a1))) - b,
      b - Math.min(bend(a0), bend(a1)),
    );
    const directionTravel = Math.min(2, (2 * travel) / length);
    // The forward axis is horizontal, so its projection onto the knee plane
    // has length >= |axis.z| / length regardless of current facing.
    const planeLength = Math.abs(axis.z) / length;
    const planeTravel = Math.min(
      2,
      (2 * (2 * directionTravel + movement.yawSpeed * half)) / Math.max(1e-12, planeLength),
    );
    return Math.min(
      hip + 2 * leg.thighLength,
      hip + Math.max(a - a0, a1 - a) + Math.abs(a) * directionTravel + bendTravel + b * planeTravel,
    );
  };
  return { hip, ankle: boot, knee: { left: knee('left'), right: knee('right') } };
};

const sampleCapsule = (shape: TaperedCapsule, ball: FlightPoint) => {
  const axis = minus(shape.to, shape.from);
  const offset = minus(ball, shape.from);
  const length = norm(axis);
  const axial = dot(offset, axis) / length;
  const radial = Math.sqrt(Math.max(0, dot(offset, offset) - axial ** 2));
  const taper = (shape.distalRadius - shape.radius) / length;
  const along = Math.max(
    0,
    Math.min(1, (axial + (taper * radial) / Math.sqrt(1 - taper ** 2)) / length),
  );
  const nearest = mix(shape.from, shape.to, along);
  const delta = minus(ball, nearest);
  const distance = norm(delta);
  const radius = shape.radius + along * (shape.distalRadius - shape.radius);
  return { along, nearest, delta, distance, radius, gap: distance - radius - BALL_RADIUS };
};

export const composedLegContactCapsule = (g: Geometry, index: number): TaperedCapsule => {
  const shape = g.capsules[index]!;
  if (shape.region.endsWith('thigh')) return { ...shape, distalRadius: shape.radius };
  // The calf tapers to the exposed ankle above the boot. The narrow distal
  // cap ends at the ankle plane so the broad proximal radius cannot occupy
  // the boot's approach envelope. The boot retains its own radius and sweep.
  const distalRadius = TEMPORAL_STRIKE.footRadius / 2;
  const length = norm(minus(shape.to, shape.from));
  return { ...shape, distalRadius, to: mix(shape.to, shape.from, distalRadius / length) };
};
const contactCapsule = composedLegContactCapsule;

/** The canonical thigh has equal end radii. The shin tapers, including when
 * its proximal cap is reported as the knee. Use the proxy behind the label. */
export const composedContactSurface = (leg: LegContact): Capsule['region'] =>
  `${leg.foot}_${leg.radius === leg.distalRadius ? 'thigh' : 'shin'}`;

export const touchingComposedLeg = (
  surface: Capsule['region'],
  ball: FlightPoint,
  geometryAt: (at: number) => Geometry | undefined,
  seconds: number,
  includeKnee: boolean,
) => {
  const current = geometryAt(0);
  const index = current?.capsules.findIndex((shape) => shape.region === surface) ?? -1;
  if (!current || index < 0) return;
  const shape = contactCapsule(current, index);
  const contact = sampleCapsule(shape, ball);
  if (Math.abs(contact.gap) > distanceTolerance || (!includeKnee && contact.along === 0)) return;
  const t = Math.min(seconds, 1e-6);
  const next = t > 0 ? geometryAt(t) : undefined;
  if (!next) return;
  const future = contactCapsule(next, index);
  const delta = minus(
    mix(future.from, future.to, contact.along),
    mix(shape.from, shape.to, contact.along),
  );
  const velocity = mix({ x: 0, y: 0, z: 0 }, delta, 1 / t);
  const normal = mix({ x: 0, y: 0, z: 0 }, contact.delta, 1 / contact.distance);
  const thigh = surface.endsWith('thigh');
  const leg: LegContact = {
    foot: surface.startsWith('left') ? 'left' : 'right',
    region: (thigh ? contact.along === 1 : contact.along === 0) ? 'knee' : thigh ? 'thigh' : 'shin',
    point: mix(contact.nearest, ball, contact.radius / contact.distance),
    from: shape.from,
    to: shape.to,
    radius: shape.radius,
    distalRadius: shape.distalRadius,
  };
  return { normal, velocity, leg };
};

type Hit =
  | { kind: 'unresolved'; at: number; reason: 'geometry' | 'budget' }
  | {
      kind: 'contact';
      at: number;
      leg: LegContact;
      normal: FlightPoint;
      velocity: FlightPoint;
    };

/** Race the actual moving capsule against the same ball time function as the
 * boot solver. A rejected branch is outside a bound for the entire interval.
 * Search budgets and unsupported IK produce an explicit unresolved result. */
export const firstComposedLegContact = (
  seconds: number,
  geometryAt: (at: number) => Geometry | undefined,
  ballAt: (at: number) => PhysicalBall,
  movement: Motion,
  continued: readonly Foot[],
): Hit | undefined => {
  const cache = new Map<number, { g: Geometry; ball: PhysicalBall } | undefined>();
  const sample = (at: number) => {
    if (!cache.has(at) && cache.size < MAXIMUM_SAMPLES) {
      const g = geometryAt(at);
      cache.set(at, g && { g, ball: ballAt(at) });
    }
    return cache.get(at);
  };
  const unresolved = (at: number): Hit => ({
    kind: 'unresolved',
    at,
    reason: cache.size >= MAXIMUM_SAMPLES ? 'budget' : 'geometry',
  });
  const initial = sample(0);
  if (!initial) return unresolved(0);
  const hitAt = (
    at: number,
    current: NonNullable<ReturnType<typeof sample>>,
    index: number,
    foot: Foot,
    thigh: boolean,
  ): Hit | undefined => {
    const shape = contactCapsule(current.g, index);
    const contact = sampleCapsule(shape, current.ball.position);
    if (Math.abs(contact.gap) > distanceTolerance) return;
    const before = Math.max(0, at - 1e-6),
      after = Math.min(seconds, at + 1e-6);
    const a = sample(before)?.g,
      b = sample(after)?.g;
    if (!a || !b || after <= before) return unresolved(at);
    const from = contactCapsule(a, index),
      to = contactCapsule(b, index);
    const delta = minus(mix(to.from, to.to, contact.along), mix(from.from, from.to, contact.along));
    const velocity = mix({ x: 0, y: 0, z: 0 }, delta, 1 / (after - before));
    const normal = mix({ x: 0, y: 0, z: 0 }, contact.delta, 1 / contact.distance);
    if (dot(minus(velocity, current.ball.velocity), normal) <= 1e-8) return;
    const point = mix(contact.nearest, current.ball.position, contact.radius / contact.distance);
    return {
      kind: 'contact',
      at,
      normal,
      velocity,
      leg: {
        foot,
        region: (thigh ? contact.along === 1 : contact.along === 0)
          ? 'knee'
          : thigh
            ? 'thigh'
            : 'shin',
        point,
        from: shape.from,
        to: shape.to,
        radius: shape.radius,
        distalRadius: shape.distalRadius,
      },
    };
  };
  const candidates: { index: number; foot: Foot; thigh: boolean }[] = [];
  for (const [index, capsule] of initial.g.capsules.entries()) {
    const foot = capsule.region.startsWith('left') ? 'left' : 'right';
    const thigh = capsule.region.endsWith('thigh');
    const first = sampleCapsule(contactCapsule(initial.g, index), initial.ball.position);
    if (first.gap <= distanceTolerance) {
      // An existing overlap or a separating surface has no fresh entry.
      if (first.gap >= -distanceTolerance && !continued.includes(foot)) {
        const contact = hitAt(0, initial, index, foot, thigh);
        if (contact) return contact;
      }
      continue;
    }
    candidates.push({ index, foot, thigh });
  }

  // Advance a single time prefix for the union of the capsules. An exhausted
  // search can then report the same certified frontier for every surface.
  const search = (a: number, b: number, possible: typeof candidates): Hit | undefined => {
    if (!possible.length) return;
    const t = (a + b) / 2,
      half = (b - a) / 2;
    const current = sample(t);
    if (!current) return unresolved(a);
    if (half <= TIME_TOLERANCE) {
      for (const { index, foot, thigh } of possible) {
        const hit = hitAt(t, current, index, foot, thigh);
        if (hit) return hit;
      }
      return;
    }
    const travel = jointTravel(current.g, movement, half, t);
    const ballTravel = movement.ballSpeed * half;
    let remaining = possible.filter(({ index, foot, thigh }) => {
      const shape = contactCapsule(current.g, index);
      const contact = sampleCapsule(shape, current.ball.position);
      const distalFraction = thigh ? 0 : shape.distalRadius / current.g[foot].shinLength;
      const fromTravel = thigh ? travel.hip : travel.knee[foot];
      const toTravel = thigh
        ? travel.knee[foot]
        : (1 - distalFraction) * travel.ankle[foot] + distalFraction * travel.knee[foot];
      if (contact.gap > Math.max(fromTravel, toTravel) + ballTravel) return false;

      // The tapered capsule is the convex hull of its two endpoint spheres.
      // Its supporting plane bounds each endpoint independently, so a fast
      // knee cannot keep a distant proximal cap in the distal contact search.
      if (contact.distance === 0) return true;
      const separation = (endpoint: FlightPoint) =>
        dot(minus(current.ball.position, endpoint), contact.delta) / contact.distance;
      return (
        Math.min(
          separation(shape.from) - shape.radius - fromTravel,
          separation(shape.to) - shape.distalRadius - toTravel,
        ) <=
        BALL_RADIUS + ballTravel
      );
    });
    const ballAcceleration = movement.ballAcceleration;
    const acceleration =
      remaining.length && ballAcceleration !== undefined
        ? composedJointAcceleration(current.g, movement, t, half)
        : undefined;
    if (acceleration && ballAcceleration !== undefined) {
      const begin = sample(a),
        end = sample(b);
      if (begin && end)
        remaining = remaining.filter(({ index, foot, thigh }) => {
          const mid = contactCapsule(current.g, index);
          const { delta, distance } = sampleCapsule(mid, current.ball.position);
          if (distance === 0) return true;
          const from = contactCapsule(begin.g, index),
            to = contactCapsule(end.g, index);
          const distalFraction = mid.distalRadius / current.g[foot].shinLength;
          const fromAcceleration = thigh ? acceleration.hip : acceleration.knee[foot];
          const toAcceleration = thigh
            ? acceleration.knee[foot]
            : distalFraction * acceleration.knee[foot];
          const chordError = (bound: number) => ((bound + ballAcceleration) * half ** 2) / 2;
          const projected = (point: FlightPoint, endpoint: FlightPoint) =>
            dot(minus(point, endpoint), delta) / distance;
          // A relative endpoint deviates from its chord by at most A*dt²/8,
          // including along the fixed separating normal.
          return (
            Math.min(
              Math.min(
                projected(begin.ball.position, from.from),
                projected(end.ball.position, to.from),
              ) -
                mid.radius -
                chordError(fromAcceleration),
              Math.min(
                projected(begin.ball.position, from.to),
                projected(end.ball.position, to.to),
              ) -
                mid.distalRadius -
                chordError(toAcceleration),
            ) <= BALL_RADIUS
          );
        });
    }
    return search(a, t, remaining) ?? search(t, b, remaining);
  };
  return search(0, seconds, candidates);
};
