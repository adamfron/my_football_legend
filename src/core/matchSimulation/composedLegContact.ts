import { BALL_RADIUS, type BallContact, type FlightPoint } from './ballFlight';
import type { PhysicalBall } from './ballPhysics';
import type { composeArticulatedLegs } from './articulatedBody';
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

type Motion = {
  horizontalHipSpeed: number;
  yawSpeed: number;
  unconstrainedPelvisAt: (at: number) => number;
  unconstrainedPelvisSpeed: number;
  bootSpeed: Record<Foot, number>;
  ballSpeed: number;
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
    const d = minus(g[side].ankle, g[side].hip);
    const r = Math.hypot(d.x, d.y),
      dr = hipXY + boot[side];
    low = Math.min(low, g[side].ankle.z - boot[side] + pelvisLimit(r + dr));
    high = Math.min(high, g[side].ankle.z + boot[side] + pelvisLimit(Math.max(0, r - dr)));
  }
  const hip = Math.hypot(hipXY, Math.max(g.pelvis.z - low, high - g.pelvis.z));
  const knee = (side: Foot) => {
    const leg = g[side];
    const axis = minus(leg.ankle, leg.hip),
      length = norm(axis),
      travel = hip + boot[side],
      short = Math.max(leg.shinLength - leg.thighLength, length - travel),
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

const contactCapsule = (g: Geometry, index: number): TaperedCapsule => {
  const shape = g.capsules[index]!;
  if (shape.region.endsWith('thigh')) return { ...shape, distalRadius: shape.radius };
  // The calf tapers to the exposed ankle above the boot. The narrow distal
  // cap ends at the ankle plane so the broad proximal radius cannot occupy
  // the boot's approach envelope. The boot retains its own radius and sweep.
  const distalRadius = TEMPORAL_STRIKE.footRadius / 2;
  const length = norm(minus(shape.to, shape.from));
  return { ...shape, distalRadius, to: mix(shape.to, shape.from, distalRadius / length) };
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
  let earliest: Hit | undefined;
  for (const [index, capsule] of initial.g.capsules.entries()) {
    const foot = capsule.region.startsWith('left') ? 'left' : 'right';
    const thigh = capsule.region.endsWith('thigh');
    const first = sampleCapsule(contactCapsule(initial.g, index), initial.ball.position);
    if (
      first.gap < -distanceTolerance ||
      (first.gap <= distanceTolerance && continued.includes(foot))
    )
      continue;
    const hitAt = (
      at: number,
      current: NonNullable<ReturnType<typeof sample>>,
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
      const delta = minus(
        mix(to.from, to.to, contact.along),
        mix(from.from, from.to, contact.along),
      );
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
    // Existing overlap from a separating contact is not a fresh impact.
    if (first.gap <= distanceTolerance) {
      const contact = hitAt(0, initial);
      if (contact) return contact;
      continue;
    }
    const search = (a: number, b: number): Hit | undefined => {
      const t = (a + b) / 2,
        half = (b - a) / 2;
      const current = sample(t);
      if (!current) return unresolved(a);
      const shape = contactCapsule(current.g, index);
      const contact = sampleCapsule(shape, current.ball.position);
      if (half <= TIME_TOLERANCE) return hitAt(t, current);
      const travel = jointTravel(current.g, movement, half, t);
      const surfaceTravel = Math.max(travel.knee[foot], thigh ? travel.hip : travel.ankle[foot]);
      if (contact.gap > surfaceTravel + movement.ballSpeed * half) return;
      return search(a, t) ?? search(t, b);
    };
    const hit = search(0, earliest?.at ?? seconds);
    if (hit && (!earliest || hit.at < earliest.at)) earliest = hit;
  }
  return earliest;
};
