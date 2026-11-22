import { projectArticulatedBody } from './articulatedBody';
import { ARTICULATED_SURFACES, SWING_METRES_PER_SECOND } from './articulatedGait';
import {
  activeArticulatedFoot,
  groundedSupportFoot,
  MAX_GROUNDED_SUPPORT_HEIGHT,
  type BodyPoint,
} from './articulatedBodyState';
import { defaultBodyMorphology } from './bodyMorphology';
import { GROUNDED_RECOVERY_BALANCE, type DynamicBalance } from './dynamicBalanceState';
import {
  projectFullBodySkeleton,
  type FullBodySkeleton,
  type SkeletonSegmentId,
} from './fullBodySkeleton';
import { deriveLowerBodyGeometry } from './lowerBodyGeometry';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { endPerformanceSpan, startPerformanceSpan } from './performanceProfiling';

const GRAVITY = 9.81;
const MAX_TILT = 0.5;
const zero = { x: 0, y: 0 };
const zero3 = { ...zero, z: 0 };
const feet = ['left', 'right'] as const;
const defaultMorphology = defaultBodyMorphology();

// Rounded adult reference fractions, grouped to the model's 19 segments.
// Girdles are part of thorax mass. These coefficients are independent of skill.
const massFraction: Record<SkeletonSegmentId, number> = {
  pelvis: 0.14,
  lower_trunk: 0.13,
  thorax: 0.164,
  neck: 0.012,
  head: 0.057,
  left_girdle: 0,
  left_upper_arm: 0.027,
  left_forearm: 0.016,
  left_hand: 0.006,
  right_girdle: 0,
  right_upper_arm: 0.027,
  right_forearm: 0.016,
  right_hand: 0.006,
  left_thigh: 0.142,
  left_shank: 0.043,
  left_foot: 0.0145,
  right_thigh: 0.142,
  right_shank: 0.043,
  right_foot: 0.0145,
};

export const swingShankAndFootMass = (player: MatchPlayerState, foot: 'left' | 'right') =>
  player.profile.weightKg * (massFraction[`${foot}_shank`] + massFraction[`${foot}_foot`]);

export const measureBalanceMass = (segments: FullBodySkeleton['segments'], mass: number) => {
  const centre = { ...zero3 };
  for (const { id, world, end } of segments) {
    const halfFraction = massFraction[id] / 2;
    centre.x += halfFraction * (world.position.x + end.x);
    centre.y += halfFraction * (world.position.y + end.y);
    centre.z += halfFraction * (world.position.z + end.z);
  }
  const inertia = { ...zero };
  for (const {
    id,
    world: { position },
    end,
    dimensions,
  } of segments) {
    const m = mass * massFraction[id];
    const x = (position.x + end.x) / 2 - centre.x;
    const y = (position.y + end.y) / 2 - centre.y;
    const z = (position.z + end.z) / 2 - centre.z;
    const width = dimensions.width ** 2 + dimensions.depth ** 2;
    inertia.x +=
      m * (y * y + z * z + ((end.y - position.y) ** 2 + (end.z - position.z) ** 2 + width) / 12);
    inertia.y +=
      m * (x * x + z * z + ((end.x - position.x) ** 2 + (end.z - position.z) ** 2 + width) / 12);
  }
  return { centre, inertia };
};

const sampleMass = (state: TacticalMatchState, player: MatchPlayerState) => {
  const body = projectArticulatedBody(state, player);
  if (!body) return;
  const pose = projectFullBodySkeleton(state, player, body);
  return pose && measureBalanceMass(pose.segments, body.mass);
};

const initialBalance = (
  state: TacticalMatchState,
  player: MatchPlayerState,
): DynamicBalance | undefined => {
  const mass = sampleMass(state, player);
  if (!mass) return;
  return {
    ...mass,
    version: state.experimentalDynamicBalance ?? 'dynamic-balance-dev-v1',
    velocity: { ...player.velocity, z: player.verticalJump?.velocity ?? 0 },
    tilt: zero,
    angularVelocity: zero,
    angularMomentum: zero,
    phase: 'upright',
  };
};

const withBalance = (player: MatchPlayerState, balance: DynamicBalance): MatchPlayerState => ({
  ...player,
  articulatedStance: { ...player.articulatedStance!, dynamicBalance: balance },
});

/** Inverse mass of the reduced body, evaluated between two application points.
 * Only horizontal root translation and pitch/roll are degrees of freedom here. */
export const dynamicContactMobility = (state: TacticalMatchState, player: MatchPlayerState) => {
  const balance = player.articulatedStance?.dynamicBalance ?? initialBalance(state, player);
  if (!balance) return;
  const { centre, inertia } = balance;
  const mass = player.profile.weightKg;
  return (at: BodyPoint, appliedAt: BodyPoint, impulse: BodyPoint): BodyPoint => {
    const dx = appliedAt.x - centre.x,
      dy = appliedAt.y - centre.y,
      dz = appliedAt.z - centre.z;
    const wx = (dy * impulse.z - dz * impulse.y) / inertia.x;
    const wy = (dz * impulse.x - dx * impulse.z) / inertia.y;
    return {
      x: impulse.x / mass + wy * (at.z - centre.z),
      y: impulse.y / mass - wx * (at.z - centre.z),
      z: wx * (at.y - centre.y) - wy * (at.x - centre.x),
    };
  };
};

export const interpolateDynamicBalance = (
  a: DynamicBalance | undefined,
  b: DynamicBalance | undefined,
  fraction: number,
) => {
  if (!a || !b || fraction <= 0) return a;
  if (fraction >= 1) return b;
  const mix = (from: number, to: number) => from + (to - from) * fraction;
  const horizontal = (from: typeof zero, to: typeof zero) => ({
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
  });
  return {
    ...a,
    centre: { ...horizontal(a.centre, b.centre), z: mix(a.centre.z, b.centre.z) },
    tilt: horizontal(a.tilt, b.tilt),
    angularMomentum: horizontal(a.angularMomentum, b.angularMomentum),
    angularVelocity: horizontal(a.angularVelocity, b.angularVelocity),
  };
};

/** Apply a committed impulse at its witnessed point. The upright body solver
 * already changed translation for opponent contact. Ball events own their reaction.
 * Vertical translation remains in the existing constrained locomotion model. */
export const loadDynamicBalance = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  point: BodyPoint,
  impulse: BodyPoint,
  source: 'ball' | 'opponent',
) => {
  if (!player.articulatedStance || Math.hypot(impulse.x, impulse.y, impulse.z) === 0) return player;
  const previous = player.articulatedStance.dynamicBalance ?? initialBalance(state, player);
  if (!previous) return player;
  const dx = point.x - previous.centre.x;
  const dy = point.y - previous.centre.y;
  const dz = point.z - previous.centre.z;
  const angularMomentum = {
    x: previous.angularMomentum.x + dy * impulse.z - dz * impulse.y,
    y: previous.angularMomentum.y + dz * impulse.x - dx * impulse.z,
  };
  const mass = player.profile.weightKg;
  const velocity =
    source === 'ball'
      ? { x: player.velocity.x + impulse.x / mass, y: player.velocity.y + impulse.y / mass }
      : player.velocity;
  return withBalance(
    { ...player, velocity },
    {
      ...previous,
      velocity: { ...previous.velocity, ...velocity },
      angularMomentum,
      angularVelocity: {
        x: angularMomentum.x / previous.inertia.x,
        y: angularMomentum.y / previous.inertia.y,
      },
      phase: previous.phase === 'upright' ? 'perturbed' : previous.phase,
      lastLoad: { at: state.time, source, point, impulse },
    },
  );
};

const planRecovery = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  disturbance: BodyPoint,
) => {
  const stance = player.articulatedStance!;
  const foot = feet.find(
    (f) => f !== stance.support && f !== activeArticulatedFoot(state, player.id),
  );
  if (!stance.support || !foot) return;
  const remaining = Math.max(0.05, stance.stepSeconds - stance.elapsed);
  const distance = Math.hypot(disturbance.x, disturbance.y);
  const reachFraction = Math.min(1, 0.23 / distance);
  const target = {
    x: stance[foot].x + disturbance.x * reachFraction,
    y: stance[foot].y + disturbance.y * reachFraction,
    z: 0.04,
  };
  if (
    Math.hypot(target.x - stance[foot].x, target.y - stance[foot].y, target.z - stance[foot].z) >
    SWING_METRES_PER_SECOND * remaining
  )
    return;
  try {
    deriveLowerBodyGeometry(
      {
        ...player,
        position: {
          x: player.position.x + player.velocity.x * remaining,
          y: player.position.y + player.velocity.y * remaining,
        },
      },
      { [stance.support]: stance[stance.support], [foot]: target },
    );
    return { foot, target };
  } catch {
    return;
  }
};

/** Advance the reduced angular body over the same segment as its canonical root.
 * One planted foot can spend only the friction left after the ordinary motor. */
export const advanceDynamicBalance = (
  state: TacticalMatchState,
  before: MatchPlayerState,
  after: MatchPlayerState,
  seconds: number,
  motorAlreadySpent = false,
) => {
  if (
    !state.experimentalDynamicBalance ||
    !after.articulatedStance ||
    !before.articulatedStance ||
    seconds <= 0
  )
    return after;
  const previous = before.articulatedStance.dynamicBalance ?? initialBalance(state, before);
  if (!previous) return after;
  const span = startPerformanceSpan('dynamic_balance');
  try {
    const stance = before.articulatedStance;
    const foot = stance.support;
    const mass = after.profile.weightKg;
    const lost = previous.phase === 'lost';
    const recovering = lost && state.experimentalDynamicBalance === GROUNDED_RECOVERY_BALANCE;
    const onGround =
      (!lost || recovering) && groundedSupportFoot(stance, before.verticalJump?.height);
    const normalForce = onGround ? mass * GRAVITY : 0;
    const tangent = motorAlreadySpent
      ? zero
      : {
          x: mass * (after.velocity.x - before.velocity.x),
          y: mass * (after.velocity.y - before.velocity.y),
        };
    const traction = ARTICULATED_SURFACES[stance.surface].mu * normalForce * seconds;
    const footLength =
      ((foot ? (after.bodyMorphology ?? defaultMorphology)[foot].footLength : 0) *
        after.profile.heightCm) /
      100;
    const cap = motorAlreadySpent
      ? 0
      : Math.min(
          normalForce * footLength * 0.25 * seconds,
          Math.max(0, traction - Math.hypot(tangent.x, tangent.y)) * previous.centre.z,
        );
    const requested = {
      x: -previous.inertia.x * (14 * previous.tilt.x + 5 * previous.angularVelocity.x) * seconds,
      y: -previous.inertia.y * (14 * previous.tilt.y + 5 * previous.angularVelocity.y) * seconds,
    };
    // A bounded centre-of-pressure moment opposes the angular disturbance.
    const fraction = Math.min(1, cap / Math.max(1e-12, Math.hypot(requested.x, requested.y)));
    const angularMomentum = {
      x: previous.angularMomentum.x + requested.x * fraction,
      y: previous.angularMomentum.y + requested.y * fraction,
    };
    const tilt = {
      x: previous.tilt.x + (angularMomentum.x * seconds) / previous.inertia.x,
      y: previous.tilt.y + (angularMomentum.y * seconds) / previous.inertia.y,
    };
    const norm = Math.hypot(tilt.x, tilt.y);
    const angleLimit = Math.min(1, MAX_TILT / Math.max(1e-12, norm));
    const phase = lost || norm >= MAX_TILT ? 'lost' : 'upright';
    const slip =
      foot && after.articulatedStance.support === foot
        ? {
            x: after.articulatedStance[foot].x - stance[foot].x,
            y: after.articulatedStance[foot].y - stance[foot].y,
          }
        : undefined;
    const next: DynamicBalance = {
      ...previous,
      version: state.experimentalDynamicBalance,
      phase,
      tilt: { x: tilt.x * angleLimit, y: tilt.y * angleLimit },
      angularMomentum,
      ...(onGround && foot
        ? {
            support: {
              foot,
              point: { ...stance[foot], z: 0 },
              normalForce,
              tangentImpulse: tangent,
              ...(slip && (slip.x !== 0 || slip.y !== 0) ? { slip } : {}),
            },
          }
        : { support: undefined }),
      recovery: undefined,
    };
    const sample = sampleMass(state, withBalance(after, next));
    if (sample) {
      next.centre = sample.centre;
      next.inertia = sample.inertia;
      next.velocity = {
        x: (sample.centre.x - previous.centre.x) / seconds,
        y: (sample.centre.y - previous.centre.y) / seconds,
        z: (sample.centre.z - previous.centre.z) / seconds,
      };
    }
    next.angularVelocity = {
      x: angularMomentum.x / next.inertia.x,
      y: angularMomentum.y / next.inertia.y,
    };
    if (recovering) {
      const endpoint = after.articulatedStance;
      // Keep the ordinary motor unavailable until the measured feet, trunk and
      // root have settled. The same finite support moment straightens the trunk.
      if (
        onGround &&
        groundedSupportFoot(endpoint, after.verticalJump?.height) &&
        feet.every((f) => endpoint[f].z <= MAX_GROUNDED_SUPPORT_HEIGHT) &&
        !activeArticulatedFoot(state, after.id) &&
        Math.hypot(after.velocity.x, after.velocity.y) < 0.1 &&
        norm <= 0.025 &&
        Math.hypot(next.angularVelocity.x, next.angularVelocity.y) <= 0.12
      )
        next.phase = 'upright';
    } else if (phase !== 'lost') {
      const predicted = {
        x: next.tilt.y + 0.12 * next.angularVelocity.y,
        y: -next.tilt.x - 0.12 * next.angularVelocity.x,
        z: 0,
      };
      const plan = previous.recovery;
      const landed = Boolean(plan && after.articulatedStance.support === plan.foot);
      if (!motorAlreadySpent && !landed && Math.hypot(predicted.x, predicted.y) > 0.16) {
        next.recovery =
          plan && plan.foot !== activeArticulatedFoot(state, after.id)
            ? plan
            : planRecovery(state, after, predicted);
      } else if (motorAlreadySpent && !landed) next.recovery = plan;
      if (next.recovery) next.phase = 'stepping';
      else if (norm > 0.025 || Math.hypot(next.angularVelocity.x, next.angularVelocity.y) > 0.12)
        next.phase = 'perturbed';
    }
    return withBalance(after, next);
  } finally {
    endPerformanceSpan('dynamic_balance', span);
  }
};
