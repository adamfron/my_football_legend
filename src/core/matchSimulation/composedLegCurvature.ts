import type { composeArticulatedLegs } from './articulatedBody';
import type { BodyPoint } from './articulatedBodyState';
import { BALL_RADIUS } from './ballFlight';
import type { PhysicalBall } from './ballPhysics';
import { TEMPORAL_STRIKE } from './temporalFootTrajectory';

type Geometry = NonNullable<ReturnType<typeof composeArticulatedLegs>>;
type Foot = 'left' | 'right';
const FEET = ['left', 'right'] as const;

export const minimumQuadratic = (
  constant: number,
  linear: number,
  quadratic: number,
  seconds: number,
) => {
  const t = quadratic > 0 ? Math.max(0, Math.min(seconds, -linear / (2 * quadratic))) : seconds;
  return Math.min(constant, constant + t * (linear + quadratic * t));
};

/** A latched affine boot cannot project the freely flying ball if the
 * squared centre distance stays above the expanded sphere. The acceleration
 * is constant on this event-v1 interval. Drop the nonnegative quartic term
 * and bound the cubic coefficient over the entire interval. */
export const affineBootClearOfBallFlight = (
  ball: PhysicalBall,
  acceleration: BodyPoint,
  boot: { position: BodyPoint; velocity: BodyPoint },
  seconds: number,
) => {
  const subtract = (a: BodyPoint, b: BodyPoint) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const dot = (a: BodyPoint, b: BodyPoint) => a.x * b.x + a.y * b.y + a.z * b.z;
  const offset = subtract(ball.position, boot.position);
  const velocity = subtract(ball.velocity, boot.velocity);
  return (
    minimumQuadratic(
      dot(offset, offset) - (BALL_RADIUS + TEMPORAL_STRIKE.footRadius) ** 2,
      2 * dot(offset, velocity),
      dot(velocity, velocity) +
        dot(offset, acceleration) +
        Math.min(0, dot(velocity, acceleration)) * seconds,
      seconds,
    ) > 0
  );
};

export type JointMotion = {
  horizontalHipSpeed: number;
  yawSpeed: number;
  unconstrainedPelvisAt: (at: number) => number;
  unconstrainedPelvisSpeed: number;
  bootSpeed: Record<Foot, number>;
};

/** Bounds the exact joint curves when both boots move on affine segments.
 * A possible pelvis-cap switch or knee singularity falls back to the
 * displacement enclosure. */
export const composedJointAcceleration = (
  g: Geometry,
  motion: JointMotion,
  at: number,
  half: number,
) => {
  const hipRadius = (g.left.thighLength / 0.245) * 0.055;
  const hipHorizontalAcceleration = hipRadius * motion.yawSpeed ** 2;
  const nominal = motion.unconstrainedPelvisAt(at);
  const nominalTravel = motion.unconstrainedPelvisSpeed * half;
  const branches = [
    {
      low: nominal - nominalTravel,
      high: nominal + nominalTravel,
      speed: motion.unconstrainedPelvisSpeed,
      acceleration: 0,
    },
  ];
  const reach = (g.left.thighLength + g.left.shinLength) * 0.995;
  const ceiling = (r: number) => Math.sqrt(Math.max(0, reach ** 2 - r ** 2));
  for (const side of FEET) {
    const { hip, ankle } = g[side];
    const radius = Math.hypot(hip.x - ankle.x, hip.y - ankle.y);
    const speed = motion.horizontalHipSpeed + motion.bootSpeed[side];
    const upperRadius = radius + speed * half;
    const rise = ceiling(upperRadius);
    const ankleTravel = motion.bootSpeed[side] * half;
    branches.push({
      low: ankle.z - ankleTravel + rise,
      high: ankle.z + ankleTravel + ceiling(Math.max(0, radius - speed * half)),
      speed: rise > 0 ? motion.bootSpeed[side] + (upperRadius * speed) / rise : Infinity,
      acceleration:
        rise > 0
          ? (speed ** 2 + upperRadius * hipHorizontalAcceleration) / rise +
            (upperRadius * speed) ** 2 / rise ** 3
          : Infinity,
    });
  }
  const pelvis = branches.find((p) => branches.every((q) => p === q || p.high <= q.low));
  if (!pelvis || !Number.isFinite(pelvis.acceleration)) return;
  const hipSpeed = Math.hypot(motion.horizontalHipSpeed, pelvis.speed);
  const hipAcceleration = Math.hypot(hipHorizontalAcceleration, pelvis.acceleration);

  const knee = (side: Foot) => {
    const { hip, ankle, thighLength, shinLength } = g[side];
    const z = ankle.z - hip.z;
    const length = Math.hypot(ankle.x - hip.x, ankle.y - hip.y, z);
    const axisSpeed = hipSpeed + motion.bootSpeed[side];
    const short = length - axisSpeed * half;
    const long = length + axisSpeed * half;
    const plane = (Math.abs(z) - axisSpeed * half) / long;
    if (short <= Math.abs(shinLength - thighLength) || plane <= 0) return Infinity;

    // The knee is hip + along * unitAxis + bend * unitPlane.
    const difference = thighLength ** 2 - shinLength ** 2;
    const along = (l: number) => (l + difference / l) / 2;
    const alongMax = Math.max(Math.abs(along(short)), Math.abs(along(long)));
    const bendMin = Math.sqrt(Math.max(0, thighLength ** 2 - alongMax ** 2));
    if (bendMin <= 0) return Infinity;
    const alongSlope = (1 + Math.abs(difference) / short ** 2) / 2;
    const alongSpeed = alongSlope * axisSpeed;
    const alongAcceleration =
      alongSlope * (hipAcceleration + axisSpeed ** 2 / short) +
      (Math.abs(difference) / short ** 3) * axisSpeed ** 2;
    const bendSpeed = (alongMax * alongSpeed) / bendMin;
    const bendAcceleration =
      (alongSpeed ** 2 + alongMax * alongAcceleration) / bendMin +
      (alongMax * alongSpeed) ** 2 / bendMin ** 3;

    // For u = x/|x|, |u''| <= |x''|/|x| + 3(|x'|/|x|)^2.
    const axisUnitSpeed = axisSpeed / short;
    const axisUnitAcceleration = hipAcceleration / short + 3 * axisUnitSpeed ** 2;
    const planeSpeed = 2 * axisUnitSpeed + motion.yawSpeed;
    const planeAcceleration =
      2 * axisUnitAcceleration +
      2 * axisUnitSpeed ** 2 +
      4 * axisUnitSpeed * motion.yawSpeed +
      motion.yawSpeed ** 2;
    const planeUnitSpeed = planeSpeed / plane;
    const planeUnitAcceleration = planeAcceleration / plane + 3 * planeUnitSpeed ** 2;

    return (
      hipAcceleration +
      alongAcceleration +
      2 * alongSpeed * axisUnitSpeed +
      alongMax * axisUnitAcceleration +
      bendAcceleration +
      2 * bendSpeed * planeUnitSpeed +
      thighLength * planeUnitAcceleration
    );
  };
  return { hip: hipAcceleration, knee: { left: knee('left'), right: knee('right') } };
};
