import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { deriveLowerBodyGeometry, neutralLowerBodyPose } from './lowerBodyGeometry';
import { activeArticulatedFoot, type ArticulatedStance } from './articulatedBodyState';

/** PR216 engineering reference, not measured cleat calibration. Stance duration
 * is bounded by seven ticks and shortened against anticipated root travel. */
export const ARTICULATED_SURFACES = Object.freeze({
  'firm-grass-dev-v1': { mu: 1, rotationalLimit: 35 },
  'reduced-grip-dev-v1': { mu: 0.25, rotationalLimit: 12 },
});
export const STANCE_SECONDS = 0.175;
/** Explicit edition removal also covers bodies temporarily owned by a handover. */
export const withoutArticulatedBody = (state: TacticalMatchState): TacticalMatchState => {
  const {
    experimentalArticulatedBody: _selection,
    experimentalObservedStrikePreparation: _preparation,
    ...rest
  } = state;
  void _selection;
  void _preparation;
  const clear = (p: MatchPlayerState) => {
    const { articulatedStance: _stance, ...body } = p;
    void _stance;
    return body;
  };
  return {
    ...rest,
    players: state.players.map(clear),
    ...(state.departedPlayers ? { departedPlayers: state.departedPlayers.map(clear) } : {}),
    ...(state.substitutionState
      ? {
          substitutionState: {
            ...state.substitutionState,
            pending: state.substitutionState.pending.map((r) => {
              const {
                entryArticulatedStance: _stance,
                entryLowerBodyPose: _pose,
                entryFacingAngle: _angle,
                ...request
              } = r;
              void _stance;
              void _pose;
              void _angle;
              return { ...request, outgoing: clear(r.outgoing) };
            }),
          },
        }
      : {}),
  };
};
// Finite engineering motor bound, not an empirical sprint calibration. A swing
// foot must cover a complete stride while the other foot remains planted.
export const SWING_METRES_PER_SECOND = 24;
const stepSeconds = (actor: MatchPlayerState) => {
  const stance = actor.articulatedStance!;
  if (!stance.support) return STANCE_SECONDS;
  const speed = Math.hypot(actor.velocity.x, actor.velocity.y);
  if (speed < 0.1) return STANCE_SECONDS;
  const acceleration = ARTICULATED_SURFACES[stance.surface].mu * 9.81;
  const height = Math.max(1.4, Math.min(2.2, actor.profile.heightCm / 100));
  const side = stance.support === 'left' ? -1 : 1;
  const angle = actor.facingAngle + (actor.lowerBodyPose?.hipYaw ?? 0);
  const hip = {
    x: actor.position.x + Math.cos(angle) * side * height * 0.055,
    y: actor.position.y - Math.sin(angle) * side * height * 0.055,
  };
  const offset = { x: stance[stance.support].x - hip.x, y: stance[stance.support].y - hip.y };
  const along = (offset.x * actor.velocity.x + offset.y * actor.velocity.y) / speed;
  const across = (offset.x * actor.velocity.y - offset.y * actor.velocity.x) / speed;
  const reachableTravel = Math.max(
    0,
    along + Math.sqrt(Math.max(0, (height * 0.43) ** 2 - across ** 2)),
  );
  const seconds =
    (2 * reachableTravel) / (speed + Math.sqrt(speed * speed + 2 * acceleration * reachableTravel));
  return Math.max(0.05, Math.min(STANCE_SECONDS, Math.floor(seconds * 40 + 1e-10) / 40));
};

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
  const initialized: MatchPlayerState = {
    ...player,
    articulatedStance: {
      version: 'stance-foot-dev-v2',
      surface,
      support: actor.verticalJump?.height
        ? null
        : player.lowerBodyPose.activeLeg === 'left'
          ? 'right'
          : 'left',
      left: geometry.left.foot,
      right: geometry.right.foot,
      elapsed: 0,
      stepSeconds: STANCE_SECONDS,
      angularVelocity: 0,
      supportYaw: actor.facingAngle,
    },
  };
  initialized.articulatedStance!.stepSeconds = stepSeconds(initialized);
  return initialized;
};

/** A new kickoff or an explicit developer fixture sets its initial root first. */
export const reanchorArticulatedSpawn = (player: MatchPlayerState): MatchPlayerState => {
  const { articulatedStance, ...positioned } = player;
  return articulatedStance
    ? initializeArticulatedPlayer(positioned, articulatedStance.surface)
    : player;
};

/** Explicit opt-in only. Applying it to an old save is a new physical edition. */
export const withArticulatedBody = (
  state: TacticalMatchState,
  surface: ArticulatedStance['surface'] = 'firm-grass-dev-v1',
): TacticalMatchState => {
  if (state.integrationProfile || state.experimentalPlayerBodyImpulse !== 'upright-cluster-dev-v1')
    throw Error('Articulated development requires the unprofiled upright-cluster recipe');
  if (
    state.experimentalArticulatedBody &&
    state.experimentalArticulatedBody !== 'stance-foot-dev-v2'
  )
    throw Error('An older articulated edition requires its archived runtime');
  if (
    state.experimentalArticulatedBody &&
    state.players.every((p) => p.articulatedStance) &&
    (state.substitutionState?.pending ?? []).every((r) => r.outgoing.articulatedStance)
  )
    return state;
  return {
    ...state,
    experimentalArticulatedBody: 'stance-foot-dev-v2',
    ...(state.substitutionState
      ? {
          substitutionState: {
            ...state.substitutionState,
            pending: state.substitutionState.pending.map((r) => ({
              ...r,
              outgoing: initializeArticulatedPlayer(r.outgoing, surface),
            })),
          },
        }
      : {}),
    players: state.players.map((p) => {
      if (state.experimentalArticulatedBody && p.articulatedStance) return p;
      const player = initializeArticulatedPlayer(p, surface);
      const active = activeArticulatedFoot(state, p.id);
      const selected = active
        ? {
            ...player,
            articulatedStance: {
              ...player.articulatedStance!,
              support: active === 'left' ? ('right' as const) : ('left' as const),
            },
          }
        : player;
      return {
        ...selected,
        articulatedStance: {
          ...selected.articulatedStance!,
          stepSeconds: stepSeconds(selected),
        },
      };
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
  if (
    speed < 0.1 &&
    Math.abs(yaw) < 0.2 &&
    !activeFoot &&
    !after.verticalJump?.height &&
    old.support &&
    old.left.z <= 0.04 + 1e-8 &&
    old.right.z <= 0.04 + 1e-8
  )
    return { ...old, elapsed: 0, angularVelocity };
  const nominal = deriveLowerBodyGeometry({ ...after, articulatedStance: undefined });
  let duration = Math.min(old.stepSeconds, old.elapsed + stepSeconds(before));
  const next: ArticulatedStance = {
    ...old,
    elapsed: Math.min(duration, old.elapsed + dt),
    stepSeconds: duration,
    angularVelocity,
  };
  if ((after.verticalJump?.height ?? 0) > 0) next.support = null;
  if (next.support === activeFoot) {
    next.support = null;
    duration = 0.05;
    next.stepSeconds = duration;
    next.elapsed = Math.min(duration, dt);
  }
  const swing =
    next.support === 'left'
      ? 'right'
      : next.support === 'right'
        ? 'left'
        : activeFoot === 'left'
          ? 'right'
          : 'left';
  let d = 0;
  // With no ground support in a real jump, both finite legs follow the existing
  // ballistic root. This supplies no additional ground or COM impulse.
  for (const foot of after.verticalJump?.height
    ? (['left', 'right'] as const)
    : ([swing] as const)) {
    const destination = {
      ...nominal[foot].foot,
      x: nominal[foot].foot.x + after.velocity.x * 0.05,
      y: nominal[foot].foot.y + after.velocity.y * 0.05,
      z: nominal[foot].foot.z + 0.08 * Math.sin((Math.PI * next.elapsed) / duration),
    };
    const hip = nominal[foot].hip;
    const horizontal = Math.hypot(destination.x - hip.x, destination.y - hip.y);
    const reach = Math.max(1.4, Math.min(2.2, after.profile.heightCm / 100)) * 0.43;
    if (horizontal > reach) {
      destination.x = hip.x + ((destination.x - hip.x) * reach) / horizontal;
      destination.y = hip.y + ((destination.y - hip.y) * reach) / horizontal;
    }
    const from = old[foot];
    const length = Math.hypot(
      destination.x - from.x,
      destination.y - from.y,
      destination.z - from.z,
    );
    if (foot === swing) d = length;
    const fraction = Math.min(1, (SWING_METRES_PER_SECOND * dt) / Math.max(1e-12, length));
    next[foot] = {
      x: from.x + (destination.x - from.x) * fraction,
      y: from.y + (destination.y - from.y) * fraction,
      z: from.z + (destination.z - from.z) * fraction,
    };
  }
  if (
    next.elapsed + 1e-10 >= duration &&
    d <= SWING_METRES_PER_SECOND * dt &&
    swing !== activeFoot &&
    !after.verticalJump?.height
  ) {
    next.support = swing;
    next.supportYaw = after.facingAngle;
    next.elapsed = 0;
    next.stepSeconds = stepSeconds({ ...after, articulatedStance: next });
  } else if (
    next.support &&
    swing === activeFoot &&
    next.elapsed + 1e-10 >= duration &&
    !after.verticalJump?.height
  ) {
    // A moving kick cannot pin the other leg indefinitely. Release it at the
    // support boundary, then swing/replant that non-action leg at finite speed.
    // The root receives no ground actuator until a boot has actually landed.
    next.support = null;
    next.elapsed = 0;
    next.stepSeconds = 0.05;
  }
  // Never project an unreachable boot or translate the root to fake support.
  try {
    deriveLowerBodyGeometry({ ...after, articulatedStance: next });
  } catch {
    next.support = null;
  }
  return next;
};
