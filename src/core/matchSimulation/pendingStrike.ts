import type {
  MatchAction,
  MatchPlayerState,
  PendingStrike,
  TacticalMatchState,
} from './matchState';
import { pendingStrikeSchema } from './matchState';
import { strikeResolutionSchema, type StrikeResolution } from './pendingStrikeState';
import { executePhysicalKick } from './kickExecution';
import {
  prepareTemporalStrike,
  temporalFootAt,
  temporalFootPath,
  TEMPORAL_STRIKE,
  ZERO_TEMPORAL_ERROR,
} from './temporalFootStrike';
import { activeStrikeCapability, executeFootContact, playerFootGeometry } from './footContact';
import { deriveLowerBodyGeometry } from './lowerBodyGeometry';
import { releaseContactReadiness } from './decisionReadiness';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { canParticipatePhysically } from './matchInjuries';
import { normalizeAngle } from './playerOrientation';
import { integrateBallFlight, BALL_PHYSICS } from './ballPhysics';
import type { FlightPoint } from './ballFlight';

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

/** Selection only; unsupported families stay on their historical path. */
export const selectsPendingPass = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  action: MatchAction,
) =>
  state.experimentalPendingStrike === 'low-pass-dev-v1' &&
  state.scenario === 'open_play' &&
  !state.restart &&
  !state.defensiveChallenge &&
  !isMatchGoalkeeper(actor) &&
  action.type === 'pass' &&
  !action.firstTime &&
  !action.distribution &&
  action.delivery !== 'lofted' &&
  state.ball.ownerId === actor.id &&
  !state.ball.travelKind &&
  (state.ball.height ?? 0.11) <= 0.24;

/** Nominal release metadata is prepared by the ordinary planner, never installed as a ball state.
 * Errors are sampled once from the existing action seed, with timing's duplicate patch/effort removed. */
export const commitPendingPass = (
  state: TacticalMatchState,
  prepared: TacticalMatchState,
  actor: MatchPlayerState,
  action: MatchAction,
  release: TacticalMatchState,
): TacticalMatchState => {
  if (!releaseContactReadiness(state, actor).ready || !release.lastPassDiagnostic) return state;
  const nominal = release.ball.launchVelocity!;
  const request = {
    family: 'pass' as const,
    surface: 'inside' as const,
    target: action.type === 'pass' ? action.target : actor.position,
    nominalVelocity: { ...nominal, z: 0 as const },
    ...(action.type === 'pass' && action.foot ? { foot: action.foot } : {}),
    // Current perceived contact point only. No future physical trajectory is consulted.
    plannedBallPoint: {
      x: state.ball.x,
      y: state.ball.y,
      z: Math.max(0.11, state.ball.height ?? 0.11),
    },
  };
  const plan = prepareTemporalStrike(state, actor, request);
  // Preparation clock remains live even when the selected instant was hurried.
  // The contact solver will still reject an insufficient physical preparation.
  const sample = executePhysicalKick(state, actor, request).perturbation;
  const perturbation = {
    lateralPatchMetres: sample.lateralPatchMetres - sample.timingSeconds * 0.12,
    verticalPatchMetres: 0,
    timingSeconds: Math.max(-0.02, Math.min(0.02, sample.timingSeconds)),
    effortError: sample.effortError - sample.timingSeconds * 1.5,
  };
  const pendingStrike = pendingStrikeSchema.parse({
    version: 'low-pass-dev-v1',
    id: `${state.seed}:pending-strike:${release.decisionIndex}:${actor.id}`,
    actorId: actor.id,
    ballEpisode: state.ballEpisode ?? 0,
    ...(state.ball.lastTouchPlayerId ? { initialLastTouch: state.ball.lastTouchPlayerId } : {}),
    action,
    source: release.latestActionSource,
    selectedAt: state.time,
    expiresAt: state.time + TEMPORAL_STRIKE.windowSeconds,
    phase: 'preparing',
    plan,
    path: temporalFootPath(plan, perturbation),
    perturbation,
    passDiagnostic: release.lastPassDiagnostic,
  });
  return {
    ...prepared,
    pendingStrike,
    currentAction: action,
    latestAction: action,
    currentActionSource: pendingStrike.source,
    latestActionSource: pendingStrike.source,
    currentActorId: actor.id,
    decisionIndex: release.decisionIndex,
    actionCooldown: TEMPORAL_STRIKE.windowSeconds,
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
  const next = { ...state };
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
        : state.defensiveChallenge
          ? 'challenge_timing_not_supported'
          : terminal || state.restart || state.scenario !== 'open_play' || state.postGoal
            ? 'terminal_or_restart'
            : (state.ballEpisode ?? 0) !== p.ballEpisode
              ? 'episode_changed'
              : state.ball.lastTouchPlayerId !== p.initialLastTouch ||
                  (state.ball.ownerId && state.ball.ownerId !== p.actorId)
                ? 'another_touch'
                : (state.ball.height ?? 0.11) > 0.24
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

const footAnchor = (actor: MatchPlayerState, foot: 'left' | 'right'): V => ({
  ...playerFootGeometry(actor)[foot === 'left' ? 'leftFoot' : 'rightFoot'],
  z: actor.lowerBodyPose ? deriveLowerBodyGeometry(actor)[foot].foot.z : 0.04,
});

/** Body/pose anchors come from this actual canonical interval, never a whole-swing extrapolation. */
export const canonicalStrikeFoot = (
  pending: PendingStrike | undefined,
  before: MatchPlayerState,
  after: MatchPlayerState,
  foot: 'left' | 'right',
  intervalAt: number,
  dt: number,
  local: number,
) => {
  const a = footAnchor(before, foot),
    b = footAnchor(after, foot);
  const anchorVelocity = scale(sub(b, a), 1 / dt);
  const position = add(a, scale(anchorVelocity, local));
  if (!pending) return { position, velocity: anchorVelocity, speedBound: norm(anchorVelocity) };
  const elapsed = intervalAt + local - pending.selectedAt;
  const nominal = temporalFootAt(pending.path, elapsed);
  const relative = sub(
    sub(nominal.position, pending.path.origin),
    scale(pending.path.bodyVelocity, elapsed),
  );
  const relativeVelocity = sub(nominal.velocity, pending.path.bodyVelocity);
  const turn = normalizeAngle(after.facingAngle - before.facingAngle);
  const angle = normalizeAngle(before.facingAngle - pending.plan.facingAngle) + (turn * local) / dt;
  const offset = rotate(relative, angle);
  const angular = { x: (offset.y * turn) / dt, y: (-offset.x * turn) / dt, z: 0 };
  return {
    position: add(position, offset),
    velocity: add(anchorVelocity, add(rotate(relativeVelocity, angle), angular)),
    speedBound:
      norm(anchorVelocity) +
      pending.path.speedBound +
      Math.abs(turn / dt) * pending.path.reachBound,
  };
};

/** Bounded conservative advancement of ONE canonical ball interval. No state/time/RNG mutation. */
export const findStrikeIntervalContact = (
  state: TacticalMatchState,
  seconds: number,
  footAt: (t: number) => ReturnType<typeof canonicalStrikeFoot>,
  radius = TEMPORAL_STRIKE.footRadius,
  maximumEvaluations: number = TEMPORAL_STRIKE.maximumEvaluationsPerStep,
) => {
  const initial = physicalStrikeBall(state);
  const speed =
    norm(initial.velocity) +
    Math.sqrt(2 / 3) * 0.11 * norm(initial.spin) +
    (BALL_PHYSICS.gravity + BALL_PHYSICS.maximumMagnusAcceleration) * seconds +
    Math.max(footAt(0).speedBound, footAt(seconds).speedBound);
  let local = 0;
  for (let evaluations = 1; evaluations <= maximumEvaluations; evaluations++) {
    const ball = local === 0 ? initial : integrateBallFlight(initial, local, state.ballEnvironment);
    const foot = footAt(local);
    const delta = sub(ball.position, foot.position),
      gap = norm(delta) - 0.11 - radius;
    if (gap <= TEMPORAL_STRIKE.distanceTolerance) {
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
    local = Math.min(seconds, local + Math.max(1e-12, (0.9 * gap) / Math.max(1e-12, speed)));
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
) => {
  const pending = state.pendingStrike!;
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
