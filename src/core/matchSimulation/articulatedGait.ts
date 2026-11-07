import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { deriveLowerBodyGeometry, neutralLowerBodyPose } from './lowerBodyGeometry';
import type { ArticulatedStance } from './articulatedBodyState';

/** PR216 engineering reference, not measured cleat calibration. Stance duration is
 * seven canonical intervals: support changes occur exactly on a 40Hz boundary. */
export const ARTICULATED_SURFACES = Object.freeze({
  'firm-grass-dev-v1': { mu: 1, rotationalLimit: 35 },
  'reduced-grip-dev-v1': { mu: 0.25, rotationalLimit: 12 },
});
export const STANCE_SECONDS = 0.175;

export const initializeArticulatedPlayer = (
  actor: MatchPlayerState,
  surface: ArticulatedStance['surface'] = 'firm-grass-dev-v1',
): MatchPlayerState => {
  if (actor.articulatedStance && actor.lowerBodyPose) return actor;
  const player = {
    ...actor,
    lowerBodyPose: actor.lowerBodyPose ?? {
      ...neutralLowerBodyPose(),
      activeLeg: actor.profile.dominantFoot,
    },
  };
  if (actor.articulatedStance) return player;
  const geometry = deriveLowerBodyGeometry(player);
  return {
    ...player,
    articulatedStance: {
      version: 'stance-foot-dev-v1',
      surface,
      support: actor.verticalJump?.height
        ? null
        : player.lowerBodyPose.activeLeg === 'left'
          ? 'right'
          : 'left',
      left: geometry.left.foot,
      right: geometry.right.foot,
      elapsed: 0,
      angularVelocity: 0,
      supportYaw: actor.facingAngle,
    },
  };
};

/** Explicit opt-in only. Applying it to an old save is a new physical edition. */
export const withArticulatedBody = (
  state: TacticalMatchState,
  surface: ArticulatedStance['surface'] = 'firm-grass-dev-v1',
): TacticalMatchState => {
  if (state.integrationProfile || state.experimentalPlayerBodyImpulse !== 'upright-cluster-dev-v1')
    throw Error('Articulated development requires the unprofiled upright-cluster recipe');
  return {
    ...state,
    experimentalArticulatedBody: 'stance-foot-dev-v1',
    players: state.players.map((p) => {
      const player = initializeArticulatedPlayer(p, surface);
      const active =
        state.pendingStrike?.actorId === p.id
          ? state.pendingStrike.plan.foot
          : state.defensiveChallenge?.actorId === p.id
            ? state.defensiveChallenge.physicalAttempt?.plan.foot
            : undefined;
      return active
        ? {
            ...player,
            articulatedStance: {
              ...player.articulatedStance!,
              support: active === 'left' ? ('right' as const) : ('left' as const),
            },
          }
        : player;
    }),
  };
};

/** Limit only the earned motor delta-v. An external impulse is never removed or
 * charged a second time. This is PR216's finite translational grip projection. */
export const constrainArticulatedMotor = (
  actor: MatchPlayerState,
  velocity: MatchPlayerState['velocity'],
  facingAngle: number,
  dt: number,
) => {
  const stance = actor.articulatedStance!;
  const surface = ARTICULATED_SURFACES[stance.surface];
  const airborne = (actor.verticalJump?.height ?? 0) > 0;
  const delta = { x: velocity.x - actor.velocity.x, y: velocity.y - actor.velocity.y };
  const requested = Math.hypot(delta.x, delta.y);
  const available = airborne || !stance.support ? 0 : surface.mu * 9.81 * dt;
  const fraction = Math.min(1, available / Math.max(1e-12, requested));
  const inertia = (actor.profile.weightKg * (actor.profile.heightCm / 100) ** 2) / 12;
  const turn = Math.atan2(
    Math.sin(facingAngle - actor.facingAngle),
    Math.cos(facingAngle - actor.facingAngle),
  );
  const desiredOmega = turn / dt;
  // Rotational resistance and translational grip are different constraints.
  const omegaDelta = airborne || !stance.support ? 0 : (surface.rotationalLimit / inertia) * dt;
  const omega =
    stance.angularVelocity +
    Math.max(-omegaDelta, Math.min(omegaDelta, desiredOmega - stance.angularVelocity));
  return {
    velocity: {
      x: actor.velocity.x + delta.x * fraction,
      y: actor.velocity.y + delta.y * fraction,
    },
    facingAngle: actor.facingAngle + omega * dt,
    angularVelocity: omega,
    requestedForce: (actor.profile.weightKg * requested) / dt,
    availableForce: (actor.profile.weightKg * available) / dt,
    // Rejected motor power is not invented foot slip. Reduced grip reduces acceleration.
  };
};

/** Finite world-space swing. No position or velocity integration is performed here.
 * The existing motor and collision timeline retain sole root-motion ownership. */
export const advanceArticulatedStance = (
  before: MatchPlayerState,
  after: MatchPlayerState,
  dt: number,
  activeFoot?: 'left' | 'right',
  angularVelocity = before.articulatedStance?.angularVelocity ?? 0,
): ArticulatedStance => {
  const old = before.articulatedStance!;
  const speed = Math.hypot(after.velocity.x, after.velocity.y);
  const yaw = Math.atan2(
    Math.sin(after.facingAngle - old.supportYaw),
    Math.cos(after.facingAngle - old.supportYaw),
  );
  if (speed < 0.1 && Math.abs(yaw) < 0.2 && !activeFoot && !after.verticalJump?.height)
    return { ...old, elapsed: 0, angularVelocity };
  const nominal = deriveLowerBodyGeometry({ ...after, articulatedStance: undefined });
  const next: ArticulatedStance = {
    ...old,
    elapsed: Math.min(STANCE_SECONDS, old.elapsed + dt),
    angularVelocity,
  };
  if ((after.verticalJump?.height ?? 0) > 0) next.support = null;
  if (next.support === activeFoot) next.support = null;
  const swing =
    next.support === 'left'
      ? 'right'
      : next.support === 'right'
        ? 'left'
        : activeFoot === 'left'
          ? 'right'
          : 'left';
  const destination = {
    ...nominal[swing].foot,
    x: nominal[swing].foot.x + after.velocity.x * 0.06,
    y: nominal[swing].foot.y + after.velocity.y * 0.06,
    z: nominal[swing].foot.z + 0.08 * Math.sin((Math.PI * next.elapsed) / STANCE_SECONDS),
  };
  const from = old[swing],
    d = Math.hypot(destination.x - from.x, destination.y - from.y, destination.z - from.z);
  const fraction = Math.min(1, (16 * dt) / Math.max(1e-12, d));
  next[swing] = {
    x: from.x + (destination.x - from.x) * fraction,
    y: from.y + (destination.y - from.y) * fraction,
    z: from.z + (destination.z - from.z) * fraction,
  };
  if (
    next.elapsed >= STANCE_SECONDS &&
    d <= 16 * dt &&
    swing !== activeFoot &&
    !after.verticalJump?.height
  ) {
    next.support = swing;
    next.supportYaw = after.facingAngle;
    next.elapsed = 0;
  }
  // Never project an unreachable boot or translate the root to fake support.
  try {
    deriveLowerBodyGeometry({ ...after, articulatedStance: next });
  } catch {
    next.support = null;
  }
  return next;
};
