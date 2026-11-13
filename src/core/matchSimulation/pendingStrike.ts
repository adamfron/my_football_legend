import type {
  MatchAction,
  MatchPlayerState,
  PendingStrike,
  TacticalMatchState,
} from './matchState';
import { pendingStrikeSchema } from './matchState';
import { strikeResolutionSchema, type StrikeResolution } from './pendingStrikeState';
import { executePhysicalKick } from './kickExecution';
import { recordExecution } from './executionWitness';
import {
  prepareTemporalStrike,
  temporalFootPath,
  TEMPORAL_STRIKE,
  ZERO_TEMPORAL_ERROR,
} from './temporalFootStrike';
import { activeStrikeCapability, executeFootContact, playerFootGeometry } from './footContact';
import {
  deriveLowerBodyGeometry,
  interpolateLowerBodyPose,
  neutralLowerBodyPose,
} from './lowerBodyGeometry';
import { releaseContactReadiness } from './decisionReadiness';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { canParticipatePhysically } from './matchInjuries';
import { normalizeAngle } from './playerOrientation';
import { integrateBallFlight, BALL_PHYSICS } from './ballPhysics';
import type { FlightPoint } from './ballFlight';
import { relativeTemporalFootAt } from './temporalFootTrajectory';
import { constrainArticulatedFoot, type footJointWorkspaceSchema } from './articulatedFootLimit';
import { predictFlightBelief } from './ballFlightBelief';
import { forecastObservedBallStep } from './ballOrientedMovement';
import type { z } from 'zod';

type V = FlightPoint;
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const norm = (a: V) => Math.hypot(a.x, a.y, a.z);
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
const rotate = (a: V, angle: number): V => ({
  x: a.x * Math.cos(angle) + a.y * Math.sin(angle),
  y: -a.x * Math.sin(angle) + a.y * Math.cos(angle),
  z: a.z,
});
const strikePlanningStep = 0.025;

/** Family ownership is separate from instantaneous contact readiness. In cluster
 * mode an owned ground-pass intention cannot fall through to a teleporting legacy
 * release merely because the ball is currently above the low striking surface. */
export const selectsPendingPass = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  action: MatchAction,
) =>
  state.experimentalPendingStrike === 'low-pass-dev-v1' &&
  state.scenario === 'open_play' &&
  !state.restart &&
  (!state.defensiveChallenge || state.experimentalPlayerBodyImpulse === 'upright-cluster-dev-v1') &&
  !isMatchGoalkeeper(actor) &&
  action.type === 'pass' &&
  !action.firstTime &&
  !action.distribution &&
  action.delivery !== 'lofted' &&
  state.ball.ownerId === actor.id &&
  !state.ball.travelKind &&
  ((state.ball.height ?? 0.11) <= 0.24 ||
    state.experimentalPlayerBodyImpulse === 'upright-cluster-dev-v1');

export const observedPassBall = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const sensor = state.liveBallFlightRuntime?.sensors[actor.id];
  const belief = sensor?.belief;
  const estimate = predictFlightBelief(belief, state.time);
  const optical = sensor?.optical;
  const visible =
    optical && optical.at <= state.time && state.time - optical.at <= strikePlanningStep + 1e-8;
  if (!visible && (!estimate || (estimate.observationAge ?? Infinity) > 0.15)) return undefined;
  const position = visible ? optical.position : estimate!.position;
  const velocityAge = estimate?.velocityObservationAge ?? Infinity;
  const velocity =
    estimate && velocityAge >= 0 && velocityAge <= 0.15 ? estimate.velocity : { x: 0, y: 0, z: 0 };
  return { position, velocity, spin: { x: 0, y: 0, z: 0 }, owner: null };
};

/** Nominal release metadata is prepared by the ordinary planner, never installed as a ball state.
 * Errors are sampled once from the existing action seed, with timing's duplicate patch/effort removed. */
export const commitPendingPass = (
  state: TacticalMatchState,
  prepared: TacticalMatchState,
  actor: MatchPlayerState,
  action: MatchAction,
  release: TacticalMatchState,
): TacticalMatchState => {
  if (state.defensiveChallenge && !state.defensiveChallenge.physicalAttempt) return state;
  if (!releaseContactReadiness(state, actor).ready || !release.lastPassDiagnostic) return state;
  const nominal = release.ball.launchVelocity!;
  const request = {
    family: 'pass' as const,
    surface: 'inside' as const,
    target: action.type === 'pass' ? action.target : actor.position,
    nominalVelocity: { ...nominal, z: 0 as const },
    ...(action.type === 'pass' && action.foot ? { foot: action.foot } : {}),
    // Historical owned-ball snapshot. The observed edition replaces it below.
    plannedBallPoint: {
      x: state.ball.x,
      y: state.ball.y,
      z: Math.max(0.11, state.ball.height ?? 0.11),
    },
  };
  const observe = state.experimentalObservedStrikePreparation;
  const observed = observe ? observedPassBall(state, actor) : undefined;
  if (observe && !observed) return state;

  let selectedRequest = request;
  let duration: number = TEMPORAL_STRIKE.swingSeconds;
  let plan;
  if (observed) {
    const durations = [duration, duration + strikePlanningStep, duration + 2 * strikePlanningStep];
    let bestScale = -1;
    for (const swingSeconds of durations) {
      const forecast = forecastObservedBallStep(
        observed,
        TEMPORAL_STRIKE.nominalOnset + swingSeconds,
      );
      if (forecast.position.z > 0.24) continue;
      const candidate = {
        ...request,
        // Keep an established plant when a foot was not explicitly requested.
        ...(actor.articulatedStance?.support && !request.foot
          ? {
              foot:
                actor.articulatedStance.support === 'left' ? ('right' as const) : ('left' as const),
            }
          : {}),
        observedBall: { position: observed.position, velocity: forecast.velocity },
        plannedBallPoint: forecast.position,
      };
      const candidatePlan = prepareTemporalStrike(state, actor, candidate);
      const scale = temporalFootPath(
        candidatePlan,
        ZERO_TEMPORAL_ERROR,
        swingSeconds,
      ).capabilityScale;
      if (scale <= bestScale) continue;
      bestScale = scale;
      duration = swingSeconds;
      selectedRequest = candidate;
      plan = candidatePlan;
      if (scale === 1) break;
    }
  }
  if (observed && !plan) return state;
  plan ??= prepareTemporalStrike(state, actor, request);
  // Preparation clock remains live even when the selected instant was hurried.
  // The contact solver will still reject an insufficient physical preparation.
  const sample = executePhysicalKick(state, actor, selectedRequest).perturbation;
  const perturbation = {
    lateralPatchMetres: sample.lateralPatchMetres - sample.timingSeconds * 0.12,
    verticalPatchMetres: 0,
    timingSeconds: Math.max(-0.02, Math.min(0.02, sample.timingSeconds)),
    effortError: sample.effortError - sample.timingSeconds * 1.5,
  };
  const window = TEMPORAL_STRIKE.windowSeconds + (duration - TEMPORAL_STRIKE.swingSeconds);
  const pendingStrike = pendingStrikeSchema.parse({
    version: 'low-pass-dev-v1',
    id: `${state.seed}:pending-strike:${release.decisionIndex}:${actor.id}`,
    actorId: actor.id,
    ballEpisode: state.ballEpisode ?? 0,
    ...(state.ball.lastTouchPlayerId ? { initialLastTouch: state.ball.lastTouchPlayerId } : {}),
    action,
    source: release.latestActionSource,
    selectedAt: state.time,
    expiresAt: state.time + window,
    phase: 'preparing',
    plan,
    path: temporalFootPath(plan, perturbation, duration),
    perturbation,
    passDiagnostic: release.lastPassDiagnostic,
  });
  return {
    ...recordExecution(prepared, 'pending-low-pass', 'pendingStrike.commitPendingPass'),
    pendingStrike,
    currentAction: action,
    latestAction: action,
    currentActionSource: pendingStrike.source,
    latestActionSource: pendingStrike.source,
    currentActorId: actor.id,
    decisionIndex: release.decisionIndex,
    actionCooldown: window,
  };
};

export const beginFootRecovery = (
  state: TacticalMatchState,
  actorId: string,
  prepared: Pick<PendingStrike, 'path' | 'selectedAt' | 'plan'>,
  at = state.time,
): TacticalMatchState => {
  if (state.experimentalPlayerBodyImpulse !== 'upright-cluster-dev-v1') return state;
  const { relative } = relativeTemporalFootAt(prepared.path, at - prepared.selectedAt);
  return {
    ...state,
    recoveringFeet: [
      ...(state.recoveringFeet ?? []).filter(
        (f) => f.actorId !== actorId || f.foot !== prepared.plan.foot,
      ),
      {
        actorId,
        foot: prepared.plan.foot,
        facingAngle: prepared.plan.facingAngle,
        beganAt: at,
        seconds: Math.max(0.08, (1.5 * norm(relative)) / 18),
        displacement: relative,
      },
    ].slice(-44),
  };
};

export const finishPendingStrike = (
  state: TacticalMatchState,
  outcome: StrikeResolution['outcome'],
  reason: string,
  at = state.time,
  details: Partial<StrikeResolution> = {},
): TacticalMatchState => {
  const pending = state.pendingStrike;
  if (!pending) return state;
  const observed =
    outcome !== 'unresolved'
      ? recordExecution(
          state,
          outcome === 'contact'
            ? 'prepared-kick'
            : outcome === 'miss'
              ? 'missed-kick'
              : outcome === 'interrupted'
                ? 'interrupted-kick'
                : 'cancelled-kick',
          `pendingStrike.finish:${outcome}:${reason}`,
          1,
        )
      : state;
  const next = beginFootRecovery(observed, pending.actorId, pending, at);
  delete next.pendingStrike;
  delete next.controlledBallContact;
  next.lastStrikeResolution = strikeResolutionSchema.parse({
    version: pending.version,
    id: pending.id,
    actorId: pending.actorId,
    ballEpisode: pending.ballEpisode,
    selectedAt: pending.selectedAt,
    intendedContactAt: pending.selectedAt + pending.path.onset + pending.path.duration,
    at,
    outcome,
    reason,
    firstEvent: reason,
    evaluations: 0,
    ...details,
  });
  if (outcome !== 'contact') {
    delete next.humanPossessionEpisode;
    delete next.postActionAgencyCheckpoint;
    delete next.ballCarrierIntent;
    // A failed intention grants neither a release nor control. Continue the actual loose ball.
    if (next.ball.ownerId === pending.actorId) {
      next.ball = { ...next.ball, looseSince: at };
      delete next.ball.ownerId;
    }
  }
  return next;
};

export const reconcilePendingStrike = (state: TacticalMatchState): TacticalMatchState => {
  const p = state.pendingStrike;
  if (!p) return state;
  const actor = state.players.find((a) => a.id === p.actorId);
  const terminal = ['half_time', 'full_time', 'abandoned'].includes(state.status ?? '');
  const reason =
    !actor || !canParticipatePhysically(actor) || state.discipline?.[p.actorId]?.sentOff
      ? 'actor_ineligible'
      : state.time > p.expiresAt + 1e-9
        ? 'expired_snapshot'
        : state.defensiveChallenge && !state.defensiveChallenge.physicalAttempt
          ? 'challenge_timing_not_supported'
          : terminal || state.restart || state.scenario !== 'open_play' || state.postGoal
            ? 'terminal_or_restart'
            : (state.ballEpisode ?? 0) !== p.ballEpisode
              ? 'episode_changed'
              : state.ball.lastTouchPlayerId !== p.initialLastTouch ||
                  (state.ball.ownerId && state.ball.ownerId !== p.actorId)
                ? 'another_touch'
                : (state.ball.height ?? 0.11) >
                    (state.experimentalPlayerBodyImpulse === 'upright-cluster-dev-v1' ? 0.65 : 0.24)
                  ? 'unsupported_height'
                  : state.experimentalPendingStrike !== p.version
                    ? 'selection_changed'
                    : undefined;
  return reason ? finishPendingStrike(state, 'cancelled', reason) : state;
};

export const physicalStrikeBall = (state: TacticalMatchState) => ({
  position: { x: state.ball.x, y: state.ball.y, z: Math.max(0.11, state.ball.height ?? 0.11) },
  velocity: {
    x: state.ball.velocity?.x ?? 0,
    y: state.ball.velocity?.y ?? 0,
    z: state.ball.velocity?.z ?? 0,
  },
  spin: state.ball.spin ?? { x: 0, y: 0, z: 0 },
  airborne: state.ball.airborne ?? false,
  bounceCount: state.ball.bounceCount ?? 0,
});
export const withPhysicalStrikeBall = (
  state: TacticalMatchState,
  ball: ReturnType<typeof integrateBallFlight>,
): TacticalMatchState => ({
  ...state,
  ball: {
    ...state.ball,
    x: ball.position.x,
    y: ball.position.y,
    height: ball.position.z,
    velocity: ball.velocity,
    ...(ball.spin ? { spin: ball.spin } : {}),
    airborne: ball.airborne,
    bounceCount: ball.bounceCount,
  },
});

const footAnchor = (actor: MatchPlayerState, foot: 'left' | 'right'): V =>
  actor.articulatedStance
    ? actor.articulatedStance[foot]
    : {
        ...playerFootGeometry(actor)[foot === 'left' ? 'leftFoot' : 'rightFoot'],
        z: actor.lowerBodyPose ? deriveLowerBodyGeometry(actor)[foot].foot.z : 0.04,
      };

/** Body/pose anchors come from this actual canonical interval, never a whole-swing extrapolation. */
const canonicalStrikeFootTrajectory = (
  pending:
    | (Pick<PendingStrike, 'path' | 'selectedAt'> & {
        plan: Pick<PendingStrike['plan'], 'facingAngle'>;
      })
    | undefined,
  before: MatchPlayerState,
  after: MatchPlayerState,
  foot: 'left' | 'right',
  intervalAt: number,
  dt: number,
  local: number,
  recovery?: NonNullable<TacticalMatchState['recoveringFeet']>[number],
) => {
  const a = footAnchor(before, foot),
    b = footAnchor(after, foot);
  const turn = normalizeAngle(after.facingAngle - before.facingAngle);
  const bodyVelocity = scale(
    sub({ ...after.position, z: 0 }, { ...before.position, z: 0 }),
    1 / dt,
  );
  const angle = before.facingAngle + (turn * local) / dt;
  const rotated = rotate(sub(a, { ...before.position, z: 0 }), (turn * local) / dt);
  let position = add(add({ ...before.position, z: 0 }, scale(bodyVelocity, local)), rotated);
  // Follow the same rotating body geometry used at an impulse rebase. Interpolating
  // endpoint foot chords creates a discontinuity when a body event splits that chord.
  let anchorVelocity = add(bodyVelocity, {
    x: (rotated.y * turn) / dt,
    y: (-rotated.x * turn) / dt,
    z: (b.z - a.z) / dt,
  });
  position.z = a.z + ((b.z - a.z) * local) / dt;
  let baseSpeedBound =
    norm(bodyVelocity) +
    Math.abs(turn / dt) * Math.hypot(rotated.x, rotated.y) +
    Math.abs(anchorVelocity.z);
  let accelerationBound = (turn / dt) ** 2 * Math.hypot(rotated.x, rotated.y);
  if (before.lowerBodyPose?.reachOffset || after.lowerBodyPose?.reachOffset) {
    const from = before.lowerBodyPose ?? neutralLowerBodyPose(),
      to = after.lowerBodyPose ?? neutralLowerBodyPose();
    const pose = interpolateLowerBodyPose(from, to, local / dt)!;
    const side = foot === 'left' ? -1 : 1,
      alpha = angle + pose.hipYaw;
    const fwd = { x: Math.sin(alpha), y: Math.cos(alpha) },
      right = { x: fwd.y, y: -fwd.x };
    const ankle = (p: typeof pose) => ({
      x: (side * p.stanceWidth) / 2 + (p.activeLeg === foot ? (p.reachOffset?.x ?? 0) : 0),
      y: p.footLead + (p.activeLeg === foot ? (p.reachOffset?.y ?? 0) : 0),
    });
    const startAnkle = ankle(from),
      endAnkle = ankle(to),
      current = ankle(pose);
    const rate = { x: (endAnkle.x - startAnkle.x) / dt, y: (endAnkle.y - startAnkle.y) / dt };
    const omega = (turn + to.hipYaw - from.hipYaw) / dt;
    position = {
      x: before.position.x + bodyVelocity.x * local + right.x * current.x + fwd.x * current.y,
      y: before.position.y + bodyVelocity.y * local + right.y * current.x + fwd.y * current.y,
      z: position.z,
    };
    anchorVelocity = {
      x:
        bodyVelocity.x +
        right.x * rate.x +
        fwd.x * rate.y +
        omega * (right.x * current.y - fwd.x * current.x),
      y:
        bodyVelocity.y +
        right.y * rate.x +
        fwd.y * rate.y +
        omega * (right.y * current.y - fwd.y * current.x),
      z: anchorVelocity.z,
    };
    const radius = Math.max(
      Math.hypot(startAnkle.x, startAnkle.y),
      Math.hypot(endAnkle.x, endAnkle.y),
    );
    baseSpeedBound =
      norm(bodyVelocity) +
      Math.hypot(rate.x, rate.y) +
      Math.abs(omega) * radius +
      Math.abs(anchorVelocity.z);
    accelerationBound = omega * omega * radius + 2 * Math.abs(omega) * Math.hypot(rate.x, rate.y);
  }
  if (before.articulatedStance && after.articulatedStance) {
    const from = before.articulatedStance[foot],
      to = after.articulatedStance[foot];
    position = add(from, scale(sub(to, from), local / dt));
    anchorVelocity = scale(sub(to, from), 1 / dt);
    baseSpeedBound = norm(anchorVelocity);
    accelerationBound = 0;
  }
  if (recovery) {
    const u = Math.max(0, Math.min(1, (intervalAt + local - recovery.beganAt) / recovery.seconds));
    const offset = rotate(recovery.displacement, normalizeAngle(angle - recovery.facingAngle));
    const k = 1 - 3 * u * u + 2 * u * u * u,
      rate = (-6 * u + 6 * u * u) / recovery.seconds;
    return {
      position: add(position, scale(offset, k)),
      velocity: add(
        anchorVelocity,
        add(scale(offset, rate), {
          x: (offset.y * k * turn) / dt,
          y: (-offset.x * k * turn) / dt,
          z: 0,
        }),
      ),
      speedBound:
        baseSpeedBound +
        Math.abs(turn / dt) * norm(offset) +
        (1.5 * norm(offset)) / recovery.seconds,
    };
  }
  if (!pending)
    return {
      position,
      velocity: anchorVelocity,
      speedBound: baseSpeedBound,
      accelerationBound,
    };
  const elapsed = intervalAt + local - pending.selectedAt;
  const { relative, relativeVelocity } = relativeTemporalFootAt(pending.path, elapsed);
  const offset = rotate(relative, normalizeAngle(angle - pending.plan.facingAngle));
  const angular = { x: (offset.y * turn) / dt, y: (-offset.x * turn) / dt, z: 0 };
  // The whole motor segment precedes swing onset: the stroke contributes no
  // displacement or acceleration here. Bounding a later 20m/s swing during
  // this preparation phase can exhaust conservative advancement near contact.
  const preparing = intervalAt + dt <= pending.selectedAt + pending.path.onset;
  const completed =
    intervalAt >=
    pending.selectedAt +
      pending.path.onset +
      pending.path.duration +
      TEMPORAL_STRIKE.followThroughSeconds;
  const [, , c, d] = pending.path.controls;
  // A cubic's second derivative is a segment between its endpoint derivatives.
  // The following linear deceleration has its own finite acceleration bound.
  const strokeAcceleration = Math.max(
    (6 * norm(c)) / pending.path.duration ** 2,
    (6 * norm(sub(d, scale(c, 2)))) / pending.path.duration ** 2,
    norm(pending.path.finalVelocity) / TEMPORAL_STRIKE.followThroughSeconds,
  );
  return {
    position: add(position, offset),
    velocity: add(
      anchorVelocity,
      add(rotate(relativeVelocity, normalizeAngle(angle - pending.plan.facingAngle)), angular),
    ),
    speedBound:
      baseSpeedBound +
      (preparing
        ? 0
        : completed
          ? Math.abs(turn / dt) * norm(offset)
          : pending.path.speedBound + Math.abs(turn / dt) * pending.path.reachBound),
    accelerationBound:
      accelerationBound +
      (preparing
        ? 0
        : completed
          ? (turn / dt) ** 2 * norm(offset)
          : strokeAcceleration +
            2 * Math.abs(turn / dt) * pending.path.speedBound +
            (turn / dt) ** 2 * pending.path.reachBound),
  };
};

/** The same effective boot is consumed by contact and skeletal presentation.
 * Invalid anatomical configurations remain an explicit integration failure. */
export const canonicalStrikeFoot = (
  ...args: Parameters<typeof canonicalStrikeFootTrajectory>
): ReturnType<typeof canonicalStrikeFootTrajectory> & {
  reachable?: boolean;
  jointLimited?: boolean;
  jointWorkspace?: z.infer<typeof footJointWorkspaceSchema>;
} => {
  const value = canonicalStrikeFootTrajectory(...args);
  const [, before, after, foot, , dt, local] = args;
  if (!before.articulatedStance || !after.articulatedStance) return value;
  const t = local / dt;
  const player = {
    ...after,
    position: {
      x: before.position.x + (after.position.x - before.position.x) * t,
      y: before.position.y + (after.position.y - before.position.y) * t,
    },
    facingAngle: before.facingAngle + normalizeAngle(after.facingAngle - before.facingAngle) * t,
    lowerBodyPose: interpolateLowerBodyPose(before.lowerBodyPose, after.lowerBodyPose, t),
  };
  try {
    const other = foot === 'left' ? 'right' : 'left';
    const a = before.articulatedStance[other],
      b = after.articulatedStance[other];
    const base = add(
      before.articulatedStance[foot],
      scale(sub(after.articulatedStance[foot], before.articulatedStance[foot]), t),
    );
    const otherPoint = add(a, scale(sub(b, a), t));
    // Never repair an invalid native body by clipping an action command.
    deriveLowerBodyGeometry(player, { [foot]: base, [other]: otherPoint });
    const curve =
      args[0] || args[7]
        ? constrainArticulatedFoot(before, after, foot, dt, local, value, (at) => {
            const parameters = [...args] as Parameters<typeof canonicalStrikeFootTrajectory>;
            parameters[6] = at;
            return canonicalStrikeFootTrajectory(...parameters);
          })
        : value;
    if (
      'jointLimited' in curve &&
      curve.jointLimited &&
      before.articulatedStance.support === foot &&
      after.articulatedStance.support === foot
    )
      return { ...curve, reachable: false };
    deriveLowerBodyGeometry(player, { [foot]: curve.position, [other]: otherPoint });
    return { ...curve, reachable: true };
  } catch {
    return { ...value, reachable: false };
  }
};

/** Bounded conservative advancement of ONE canonical ball interval. No state/time/RNG mutation. */
export const findStrikeIntervalContact = (
  state: TacticalMatchState,
  seconds: number,
  footAt: (t: number) => ReturnType<typeof canonicalStrikeFoot>,
  radius = TEMPORAL_STRIKE.footRadius,
  maximumEvaluations: number = TEMPORAL_STRIKE.maximumEvaluationsPerStep,
  supportedFlight?: (t: number) => ReturnType<typeof integrateBallFlight>,
  supportSpeedBound = 0,
) => {
  const initial = physicalStrikeBall(state);
  const speed =
    norm(initial.velocity) +
    Math.sqrt(2 / 3) * 0.11 * norm(initial.spin) +
    (BALL_PHYSICS.gravity + BALL_PHYSICS.maximumMagnusAcceleration) * seconds +
    Math.max(footAt(0).speedBound, footAt(seconds).speedBound) +
    supportSpeedBound;
  const flightSpeed =
    norm(initial.velocity) +
    (BALL_PHYSICS.gravity + BALL_PHYSICS.maximumMagnusAcceleration) * seconds;
  const flightAcceleration =
    BALL_PHYSICS.gravity +
    BALL_PHYSICS.maximumMagnusAcceleration +
    BALL_PHYSICS.airDrag * flightSpeed ** 2;
  // A ground impulse is discontinuous. Use the smooth-flight bound only when
  // even the downward acceleration envelope cannot reach the grass this interval.
  const clearOfGround =
    initial.position.z +
      Math.min(0, initial.velocity.z) * seconds -
      0.5 * flightAcceleration * seconds ** 2 >
    0.11;
  let local = 0,
    previousLocal = 0;
  for (let evaluations = 1; evaluations <= maximumEvaluations; evaluations++) {
    let ball =
      local === 0
        ? initial
        : (supportedFlight?.(local) ?? integrateBallFlight(initial, local, state.ballEnvironment));
    let foot = footAt(local);
    if (foot.reachable === false)
      return {
        outcome: 'unresolved' as const,
        reason: 'unreachable_articulated_foot',
        local,
        evaluations,
      };
    let delta = sub(ball.position, foot.position),
      gap = norm(delta) - 0.11 - radius;
    if (supportedFlight && local > 0 && gap < -TEMPORAL_STRIKE.distanceTolerance) {
      // A projected support curve can close faster than its free-flight bound.
      // Refine the witnessed clear/intersecting bracket before competing events;
      // do not misreport a later sampled crossing as corrupt initial geometry.
      let low = previousLocal,
        high = local;
      while (high - low > 1e-10 && evaluations < maximumEvaluations) {
        const middle = (low + high) / 2,
          flight = supportedFlight(middle),
          surface = footAt(middle);
        evaluations++;
        if (norm(sub(flight.position, surface.position)) - 0.11 - radius > 0) low = middle;
        else high = middle;
      }
      local = high;
      ball = supportedFlight(local);
      foot = footAt(local);
      delta = sub(ball.position, foot.position);
      gap = norm(delta) - 0.11 - radius;
    }
    if (gap <= TEMPORAL_STRIKE.distanceTolerance) {
      if (foot.reachable === false)
        return {
          outcome: 'unresolved' as const,
          reason: 'unreachable_articulated_foot',
          local,
          evaluations,
        };
      const normal = scale(delta, 1 / Math.max(1e-12, norm(delta)));
      const closing = dot(sub(foot.velocity, ball.velocity), normal);
      return {
        outcome:
          closing > 1e-8 && gap >= -TEMPORAL_STRIKE.distanceTolerance
            ? ('contact' as const)
            : ('unresolved' as const),
        reason:
          gap < -TEMPORAL_STRIKE.distanceTolerance
            ? 'initial_penetration'
            : closing <= 1e-8
              ? 'grazing_or_separating'
              : 'intersection',
        local,
        evaluations,
        ball,
        foot,
        normal,
      };
    }
    if (local >= seconds) return { outcome: 'clear' as const, local, evaluations };
    let advance = gap / Math.max(1e-12, speed);
    if (
      !supportedFlight &&
      (clearOfGround || (!ball.airborne && ball.position.z <= 0.11 && ball.velocity.z === 0)) &&
      foot.accelerationBound !== undefined
    ) {
      // g'' >= -|relative acceleration|. Solve the conservative quadratic lower
      // bound instead of using the sum of two almost co-moving speeds. This also
      // certifies clear grazing paths without exhausting the search near a foot.
      const acceleration =
        (clearOfGround
          ? flightAcceleration
          : BALL_PHYSICS.rollingDeceleration *
            (state.ballEnvironment?.rollingResistanceMultiplier ?? 1)) + foot.accelerationBound;
      const closing = dot(sub(foot.velocity, ball.velocity), scale(delta, 1 / norm(delta)));
      const root = Math.sqrt(closing * closing + 2 * acceleration * gap);
      advance = closing >= 0 ? (2 * gap) / (root + closing) : (root - closing) / acceleration;
    }
    previousLocal = local;
    local = Math.min(seconds, local + Math.max(1e-12, 0.9 * advance));
  }
  return {
    outcome: 'unresolved' as const,
    reason: 'bounded_search_exhausted',
    local,
    evaluations: maximumEvaluations,
  };
};

export const executePendingContact = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  foot: ReturnType<typeof canonicalStrikeFoot>,
  normal: V,
  prepared?: Pick<PendingStrike, 'plan' | 'selectedAt'>,
) => {
  const pending = prepared ?? state.pendingStrike!;
  const preparationSeconds =
    pending.plan.preparationSeconds + Math.max(0, state.time - pending.selectedAt);
  const capability = activeStrikeCapability(
    actor,
    pending.plan.foot,
    actor.plantBalance?.balance ?? 1,
    preparationSeconds,
  );
  if (
    foot.position.z < TEMPORAL_STRIKE.footRadius - 1e-9 ||
    (state.ball.height ?? 0.11) > 0.24 ||
    norm(sub(foot.velocity, { ...actor.velocity, z: 0 })) > capability.maximumFootSpeed + 1e-7
  )
    return undefined;
  return executeFootContact(state, actor, {
    intended: 'inside',
    foot: pending.plan.foot,
    desiredVelocity: pending.plan.nominalVelocity,
    balance: actor.plantBalance?.balance ?? 1,
    preparationSeconds,
    contactSeconds: 0.025,
    pressure: 0,
    activeStrike: { normal, footVelocity: foot.velocity },
  });
};

// Explicit laboratory intervention; callers must never sample this on each frame.
export const zeroPendingStrikeError = ZERO_TEMPORAL_ERROR;
