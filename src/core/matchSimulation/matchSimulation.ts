import { deriveCanonicalCoachProfile } from '../coachProfiles';
import type { SingleMatchSession } from '../singleMatch';
import { RandomGenerator } from '../random/RandomGenerator';
import {
  chooseNpcRoutineAction,
  chooseIncomingShotAction,
  chooseRestartAction,
  enumerateRestartActions,
  evaluatePressure,
  resolveMatchAction,
} from './matchActions';
import { clampPitchPoint, distance, type TeamSide } from './matchSpace';
import type { MatchPlayerState, MatchPhase, TacticalMatchState } from './matchState';
import { deriveNeutralFormationAnchor, deriveTacticalTargets } from './tacticalPositioning';
import { applyRestartScenario } from './restartScenarios';
import { applyThrowInContact, canContactAfterThrowIn } from './throwIn';

/** Canonical safety net. Presentation normally resolves controlled choices long before this. */
export const RESTART_SETUP_WATCHDOG_SECONDS = 8;
import {
  goalkeeperIntervention,
  findAerialContactCandidates,
  resolveAerialDuel,
  secondBallPriority,
} from './aerialPlay';
import { findPitchBoundaryCrossing, type PitchBoundaryCrossing } from './pitchBoundary';
import { resolveContinuousGroundPassClaim, resolveGroundPassClaim } from './passClaimResolver';
import {
  deterministicRebound,
  findFirstBallContact,
  GOAL_HEIGHT,
  type BallContact,
  type ContactCandidate,
  type FlightPoint,
} from './ballFlight';
import { resolveFormationDuty } from '../footballerWorld';
import { deriveLooseBallAssignments, rollLooseBall } from './looseBallPhysics';
import { isOffsideOffence } from './offside';
import { countSemanticPlayerChoices, projectPlayerDecisionOpportunity } from './playerDecision';
import { projectLocomotion, projectSprintEpisode } from './locomotion';
import { isDefensiveEpisodeLocked, shouldCommitRoutinePress } from './defensiveChallenges';
import {
  classifyRelativeMovement,
  deriveOrientationTarget,
  integrateFacing,
  movementModeSpeedFactor,
  normalizeAngle,
  angleForVector,
} from './playerOrientation';
import { integrateBallFlight } from './ballPhysics';
import {
  GOALKEEPER_PHYSICS,
  projectGoalkeeperIntervention,
  resolveGoalkeeperContact,
} from './goalkeeperIntervention';
import { deriveOnBallPreparation } from './onBallPreparation';
import { toPitchPoint } from './matchSpace';
import { resolvePendingPlayerDecision } from './decisionOutcome';
import { resolveReceptionOutcome } from './passReception';
import { deriveCarryExecution, hasReachedCarryDecisionWaypoint } from './carryExecution';
import { hasActiveHumanPossession, reconcileHumanPossession } from './possessionAgency';
import { canExecuteCanonicalShot } from './shootingOptions';
import { createMatchStatistics, observePlayerMatchStats } from './playerMatchStats';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';
import {
  beginDefensiveChallenge,
  chooseNpcDefensiveChallengeAction,
  resolveDefensiveChallenge,
} from './defensiveChallenges';
import { advanceMatchRules, applyChallengeInfringement, enforceMinimumPlayers } from './matchRules';
import { emitCanonicalActionEvents } from './actionEvents';

const transitionPhase = (owns: boolean): MatchPhase =>
  owns ? 'attacking_transition' : 'defensive_transition';
const settledPhase = (owns: boolean): MatchPhase =>
  owns ? 'positional_attack' : 'defensive_block';

const withoutOffsideSnapshot = (state: TacticalMatchState): TacticalMatchState => {
  const { offsideSnapshot: _offsideSnapshot, ...remaining } = state;
  void _offsideSnapshot;
  return remaining;
};

const applyBoundaryRestart = (
  state: TacticalMatchState,
  crossing: PitchBoundaryCrossing,
  previous: { x: number; y: number },
) => {
  const last = state.players.find((p) => p.id === state.ball.lastTouchPlayerId);
  const restartTeam: TeamSide = crossing.boundary.startsWith('touchline')
    ? (last?.team ?? state.possessionTeam) === 'home'
      ? 'away'
      : 'home'
    : crossing.boundary === 'goal_line_home'
      ? last?.team === 'home'
        ? 'away'
        : 'home'
      : last?.team === 'away'
        ? 'home'
        : 'away';
  const scenario = crossing.boundary.startsWith('touchline')
    ? ('throw_in' as const)
    : last?.team === (crossing.boundary === 'goal_line_home' ? 'home' : 'away')
      ? ('corner' as const)
      : ('goal_kick' as const);
  return {
    ...applyRestartScenario(state, scenario, {
      restartTeam,
      ...(scenario === 'throw_in' ? { restartPoint: crossing.point } : {}),
    }),
    lastBoundaryRestart: scenario,
    lastBoundaryCrossing: {
      ...crossing,
      previous,
      ...(last ? { lastTouchPlayerId: last.id, lastTouchTeam: last.team } : {}),
      restartTeam,
    },
  };
};

export const FIXED_MATCH_DT = 0.025;

export const advanceTacticalMatch = (
  input: TacticalMatchState,
  simulatedSeconds: number,
): TacticalMatchState => {
  let state = enforceMinimumPlayers(input);
  const ticks = Math.floor((simulatedSeconds + 1e-9) / FIXED_MATCH_DT);
  for (let tick = 0; tick < ticks; tick += 1) {
    if (
      state.status === 'half_time' ||
      state.status === 'full_time' ||
      state.status === 'abandoned'
    )
      break;
    state = stepTacticalMatch(state, FIXED_MATCH_DT);
  }
  return state;
};

export const createTacticalMatch = (session: SingleMatchSession): TacticalMatchState => {
  const build = (side: TeamSide, team: SingleMatchSession['home']): MatchPlayerState[] =>
    team.players.map((player) => {
      const prototype = { slot: player.slot, team: side, profile: player.profile };
      const anchor = deriveNeutralFormationAnchor(prototype);
      return {
        id: player.footballerId,
        team: side,
        profile: player.profile,
        slotIndex: player.slotIndex,
        slot: player.slot,
        duty: resolveFormationDuty(player.slot),
        position: anchor,
        target: anchor,
        velocity: { x: 0, y: 0 },
        facingAngle: side === 'home' ? Math.PI / 2 : -Math.PI / 2,
        anchor,
        neutralAnchor: anchor,
        idealTarget: anchor,
        meanPosition: anchor,
        samples: 1,
      };
    });
  const players = [...build('home', session.home), ...build('away', session.away)];
  const owner = session.home.players.find((p) => p.profile.primaryPosition !== 'goalkeeper')!;
  const state: TacticalMatchState = {
    seed: session.setup.seed,
    time: 0,
    decisionIndex: 0,
    status: 'first_half',
    teams: {
      home: {
        side: 'home',
        clubId: session.home.club.id,
        formation: session.home.formation,
        style: deriveCanonicalCoachProfile(session.home.club.managerId ?? 'manager').tacticalStyle,
        phase: 'positional_attack',
        phaseElapsed: 0,
      },
      away: {
        side: 'away',
        clubId: session.away.club.id,
        formation: session.away.formation,
        style: deriveCanonicalCoachProfile(session.away.club.managerId ?? 'manager').tacticalStyle,
        phase: 'defensive_block',
        phaseElapsed: 0,
      },
    },
    players,
    ball: {
      ...players.find((p) => p.id === owner.footballerId)!.position,
      ownerId: owner.footballerId,
    },
    possessionTeam: 'home',
    timeSincePossessionChanged: 0,
    ballEpisode: 0,
    actionCooldown: 0.4,
    ballOwnershipStartedAt: 0,
    score: { home: 0, away: 0 },
    currentPressure: 0,
    scenario: 'open_play',
    ...(session.setup.control.mode === 'player'
      ? { controlledFootballerId: session.setup.control.footballerId }
      : {}),
  };
  const positioned = { ...state, players: deriveTacticalTargets(state) };
  return { ...positioned, statistics: createMatchStatistics(positioned) };
};

/** Executes only an actual incoming contact, before the reception resolver can settle it. */
const tryIncomingFinish = (
  state: TacticalMatchState,
  actorId: string,
): TacticalMatchState | undefined => {
  if (!canContactAfterThrowIn(state, actorId)) return;
  if (isOffsideOffence(state.offsideSnapshot, actorId)) return;
  const pending =
    state.pendingReceptionIntent?.actorId === actorId ? state.pendingReceptionIntent : undefined;
  const selected = pending?.action;
  const action = selected
    ? selected.type === 'shot' || selected.type === 'header'
      ? selected
      : undefined
    : actorId !== state.controlledFootballerId
      ? chooseIncomingShotAction(state, actorId)
      : undefined;
  if (
    !action ||
    (action.type !== 'shot' && action.type !== 'header') ||
    !canExecuteCanonicalShot(state, action)
  )
    return;
  const ready = { ...applyThrowInContact(state, actorId) };
  delete ready.pendingReceptionIntent;
  delete ready.receptionPreparation;
  if (ready.lastPassDiagnostic && !ready.lastPassDiagnostic.finalResult)
    ready.lastPassDiagnostic = {
      ...ready.lastPassDiagnostic,
      actualContactPoint: { x: state.ball.x, y: state.ball.y },
      resolvedAt: state.time,
      finalResult:
        actorId === ready.lastPassDiagnostic.intendedReceiverId ? 'completed' : 'unclaimed',
    };
  const resolved = resolveMatchAction(
    ready,
    action,
    pending?.actionSource ?? (pending ? 'human_selected' : 'autonomous_npc'),
  );
  return resolved !== ready ? resolved : undefined;
};

const changePossession = (
  state: TacticalMatchState,
  ownerId: string,
  cause: 'tackle' | 'interception' | 'claim' = 'claim',
) => {
  if (!canContactAfterThrowIn(state, ownerId)) return state;
  state = applyThrowInContact(state, ownerId);
  const owner = state.players.find((p) => p.id === ownerId)!;
  const controlledBall = { x: state.ball.x, y: state.ball.y, ownerId, lastTouchPlayerId: ownerId };
  const reception =
    state.receptionPreparation?.actorId === ownerId
      ? resolveReceptionOutcome(state, owner, { x: state.ball.x, y: state.ball.y })
      : undefined;
  const receptionPoint = reception?.resultingPoint ?? { x: state.ball.x, y: state.ball.y };
  if (owner.team === state.possessionTeam) {
    const next: TacticalMatchState = {
      ...state,
      ball: { ...controlledBall, ...receptionPoint },
      actionCooldown: Math.max(
        state.actionCooldown,
        reception?.kind === 'directional_control'
          ? 0.55
          : reception?.kind === 'heavy_touch'
            ? 1.65
            : reception?.kind === 'failed_control'
              ? 1.9
              : 0.95,
      ),
      ...(reception ? { lastReceptionOutcome: reception } : {}),
      onBallPreparation: deriveOnBallPreparation(
        state,
        owner,
        reception?.kind === 'failed_control' ? undefined : reception?.kind,
      ),
      ...(state.lastPassDiagnostic && !state.lastPassDiagnostic.finalResult
        ? {
            lastPassDiagnostic: {
              ...state.lastPassDiagnostic,
              actualContactPoint: { x: state.ball.x, y: state.ball.y },
              ...(reception ? { receptionOutcome: reception.kind } : {}),
              resolvedAt: state.time,
              finalResult:
                reception?.kind === 'failed_control'
                  ? 'technical_error'
                  : ownerId === state.lastPassDiagnostic.intendedReceiverId
                    ? 'completed'
                    : 'unclaimed',
            },
          }
        : {}),
      ...(state.ball.ownerId !== ownerId ? { ballOwnershipStartedAt: state.time } : {}),
    };
    if (reception?.kind === 'heavy_touch') {
      const dx =
        (reception.resultingPoint?.x ?? reception.contactPoint.x) - reception.contactPoint.x;
      const dy =
        (reception.resultingPoint?.y ?? reception.contactPoint.y) - reception.contactPoint.y;
      // Heavy means unstable control, not an immediate award to either team. The ordinary loose-
      // ball arrival race now decides whether the receiver, a teammate, or an opponent claims it.
      const { receptionPreparation: _resolvedReception, ...heavyTouchState } = next;
      void _resolvedReception;
      return makeLoose(
        {
          ...heavyTouchState,
          ball: { ...next.ball, secondBallPriorityIds: [ownerId] },
        },
        { x: dx * 1.35, y: dy * 1.35 },
      );
    }
    if (state.pendingReceptionIntent?.actorId === ownerId) {
      const { pendingReceptionIntent, ...ready } = next;
      void pendingReceptionIntent;
      delete ready.receptionPreparation;
      const receptionAction = state.pendingReceptionIntent.action;
      const selected = resolveMatchAction(
        ready,
        receptionAction,
        state.pendingReceptionIntent.actionSource ?? 'human_selected',
      );
      return receptionAction.type === 'hold' && selected.humanPossessionEpisode
        ? {
            ...selected,
            postActionAgencyCheckpoint: {
              actorId: ownerId,
              completedAction: 'hold' as const,
              at: state.time,
            },
          }
        : selected;
    }
    if (state.pendingReceptionIntent) delete next.pendingReceptionIntent;
    delete next.receptionPreparation;
    return next;
  }
  const teams = { ...state.teams };
  for (const side of ['home', 'away'] as const)
    teams[side] = { ...teams[side], phase: transitionPhase(side === owner.team), phaseElapsed: 0 };
  const next: TacticalMatchState = {
    ...state,
    teams,
    possessionTeam: owner.team,
    timeSincePossessionChanged: 0,
    ballEpisode: (state.ballEpisode ?? 0) + 1,
    actionCooldown: Math.max(state.actionCooldown, 0.85),
    ball: controlledBall,
    ballOwnershipStartedAt: state.time,
    onBallPreparation: deriveOnBallPreparation(state, owner),
    lastPossessionChange: { at: state.time, from: state.possessionTeam, to: owner.team, cause },
    ...(state.lastPassDiagnostic && !state.lastPassDiagnostic.finalResult
      ? {
          lastPassDiagnostic: {
            ...state.lastPassDiagnostic,
            actualContactPoint: { x: state.ball.x, y: state.ball.y },
            resolvedAt: state.time,
            finalResult: 'intercepted' as const,
          },
        }
      : {}),
  };
  if (state.pendingReceptionIntent?.actorId === ownerId) {
    delete next.pendingReceptionIntent;
    return resolveMatchAction(
      next,
      state.pendingReceptionIntent.action,
      state.pendingReceptionIntent.actionSource ?? 'human_selected',
    );
  }
  delete next.pendingReceptionIntent;
  delete next.receptionPreparation;
  return next;
};

const makeLoose = (state: TacticalMatchState, velocity = { x: 0, y: 0 }): TacticalMatchState => ({
  ...state,
  ballEpisode: (state.ballEpisode ?? 0) + 1,
  ball: {
    x: state.ball.x,
    y: state.ball.y,
    velocity,
    looseSince: state.time,
    ...(state.ball.lastTouchPlayerId ? { lastTouchPlayerId: state.ball.lastTouchPlayerId } : {}),
    ...(state.ball.secondBallPriorityIds
      ? { secondBallPriorityIds: state.ball.secondBallPriorityIds }
      : {}),
    ...(state.ball.shot ? { shot: state.ball.shot } : {}),
  },
});

/** An unclaimed delivery ends at physical rest, without an invented touch or energy loss. */
const finishUnclaimedDelivery = (state: TacticalMatchState): TacticalMatchState =>
  makeLoose(
    {
      ...state,
      ...(state.lastPassDiagnostic && !state.lastPassDiagnostic.finalResult
        ? {
            lastPassDiagnostic: {
              ...state.lastPassDiagnostic,
              resolvedAt: state.time,
              finalResult: 'unclaimed' as const,
            },
          }
        : {}),
    },
    { x: state.ball.velocity?.x ?? 0, y: state.ball.velocity?.y ?? 0 },
  );

const finishShotContact = (
  state: TacticalMatchState,
  contact: BallContact,
  incoming: { x: number; y: number },
  goalkeeperProjection = projectGoalkeeperIntervention(state),
): TacticalMatchState => {
  let shot = state.ball.shot!;
  const shooter = state.players.find((player) => player.id === shot.shooterId)!;
  const base = {
    ...state,
    lastBallContact: contact,
    lastShot: shot,
    ball: { x: contact.point.x, y: contact.point.y, height: contact.point.z },
  };
  if (contact.kind === 'goal_plane') {
    const score = { ...state.score, [shooter.team]: state.score[shooter.team] + 1 };
    return {
      ...base,
      lastShot: { ...shot, outcome: 'goal', classification: 'on_target' },
      score,
      lastShotResult: 'goal',
      goalCompletionUntil: state.time + 0.55,
      pendingKickoffTeam: shooter.team === 'home' ? 'away' : 'home',
      ball: {
        ...base.ball,
        velocity: { x: incoming.x * 0.28, y: incoming.y * 0.28 },
        looseSince: state.time,
      },
    };
  }
  if (contact.kind === 'out')
    return applyRestartScenario(
      {
        ...base,
        lastShotResult: 'miss',
        lastShot: {
          ...shot,
          outcome: 'miss',
          classification: contact.point.z > GOAL_HEIGHT ? 'over' : 'wide',
        },
      },
      'goal_kick',
      { restartTeam: shooter.team === 'home' ? 'away' : 'home' },
    );
  if (contact.kind === 'goalkeeper') {
    const projection = goalkeeperProjection;
    const keeper = state.players.find((player) => player.id === contact.playerId)!;
    const goalkeeperAction = projection
      ? resolveGoalkeeperContact(state, projection, contact.preContactSpeed)
      : 'failed_save';
    if (goalkeeperAction === 'catch')
      return changePossession(
        {
          ...base,
          lastShotResult: 'save',
          lastShot: {
            ...shot,
            keeperId: keeper.id,
            goalkeeperAction,
            outcome: 'save',
            classification: 'on_target',
          },
          ball: { ...keeper.position, height: 0 },
        },
        keeper.id,
        'claim',
      );
    shot = { ...shot, keeperId: keeper.id, goalkeeperAction };
  }
  const frameResult =
    contact.kind === 'crossbar'
      ? 'crossbar'
      : contact.kind === 'left_post' || contact.kind === 'right_post'
        ? 'post'
        : contact.kind === 'defender' || shot.goalkeeperAction === 'failed_save'
          ? 'block'
          : 'save';
  const local = state.players
    .filter((player) => distance(player.position, contact.point) < 18)
    .slice(0, 6);
  return makeLoose(
    {
      ...base,
      lastShotResult: frameResult,
      lastShot: {
        ...shot,
        outcome: frameResult,
        classification:
          frameResult === 'post' || frameResult === 'crossbar' ? frameResult : shot.classification,
      },
      ball: {
        ...base.ball,
        ...(contact.playerId ? { lastTouchPlayerId: contact.playerId } : {}),
        secondBallPriorityIds: secondBallPriority(state, local),
      },
    },
    deterministicRebound(contact.kind, incoming, shooter.team),
  );
};

const tacticalSemanticKey = (state: TacticalMatchState) =>
  [
    state.possessionTeam,
    state.ball.ownerId ?? 'loose',
    state.ballEpisode ?? 0,
    state.ball.travelKind ?? 'settled',
    state.scenario,
    state.teams.home.phase,
    state.teams.away.phase,
    state.restart?.phase ?? 'none',
  ].join('|');

const stepTacticalMatchCore = (
  input: TacticalMatchState,
  rawDelta = 0.1,
  decisionAlreadyProjected = false,
): TacticalMatchState => {
  input = reconcileHumanPossession(resolvePendingPlayerDecision(input));
  // Recover snapshots whose setup clock was already allowed to overrun (for example by a future
  // presentation/UI regression) before the normal human-opportunity freeze can hold them forever.
  if (
    input.restart?.phase === 'setup' &&
    input.restart.takerId === input.controlledFootballerId &&
    input.time - input.restart.startedAt >= RESTART_SETUP_WATCHDOG_SECONDS
  ) {
    const legalActions = enumerateRestartActions(input);
    const action = legalActions[0] ?? chooseRestartAction(input);
    if (action) {
      const recovered = resolveMatchAction(input, action, 'restart_liveness_watchdog');
      input = {
        ...recovered,
        lastRestartLivenessRecovery: {
          at: input.time,
          scenario: input.scenario,
          takerId: input.restart.takerId,
          controlled: true,
          legalActionCount: legalActions.length,
          setupSeconds: input.time - input.restart.startedAt,
          recovery: 'canonical_restart_fallback',
        },
      };
    }
  }
  // A human agency episode survives a transient loose/contact phase. It is consumed by the next
  // canonical action (including an opponent action), a restart, or the human's next choice; mere
  // ownerId discontinuity is not evidence that play genuinely moved on.
  // A surfaced human decision owns the snapshot: no clock, movement or RNG may advance.
  if (
    !decisionAlreadyProjected &&
    !input.periodEndPending &&
    projectPlayerDecisionOpportunity(input)
  )
    return input;
  const dt = Math.min(0.25, Math.max(0.01, rawDelta));
  let state = {
    ...input,
    time: input.time + dt,
    timeSincePossessionChanged: input.timeSincePossessionChanged + dt,
    actionCooldown: Math.max(0, input.actionCooldown - dt),
    teams: { ...input.teams },
  };
  if (state.restart) state.restartStalledSeconds = state.time - state.restart.startedAt;
  else delete state.restartStalledSeconds;
  if (
    state.scenario === 'open_play' &&
    !state.ball.ownerId &&
    (state.ball.x < 0 || state.ball.x > 105 || state.ball.y < 0 || state.ball.y > 68)
  ) {
    const outside = { x: state.ball.x, y: state.ball.y };
    const boundary =
      state.ball.y < 0
        ? ('touchline_top' as const)
        : state.ball.y > 68
          ? ('touchline_bottom' as const)
          : state.ball.x < 0
            ? ('goal_line_home' as const)
            : ('goal_line_away' as const);
    const point = clampPitchPoint({ x: state.ball.x, y: state.ball.y });
    return applyBoundaryRestart(
      {
        ...state,
        lastInvariantRecovery: { at: state.time, kind: 'outside_pitch', point: outside },
      },
      { boundary, point, segmentFraction: 0 },
      point,
    );
  }
  if (state.playerMovementIntent && state.time >= state.playerMovementIntent.expiresAt) {
    const { playerMovementIntent: _expired, ...withoutIntent } = state;
    void _expired;
    state = withoutIntent;
  }
  if (
    state.pendingReceptionIntent &&
    (state.time >= state.pendingReceptionIntent.expiresAt ||
      (state.scenario !== 'open_play' && state.restart?.phase !== 'release') ||
      (state.ball.ownerId && state.ball.ownerId !== state.pendingReceptionIntent.actorId))
  ) {
    const { pendingReceptionIntent: _cancelled, ...withoutIntent } = state;
    void _cancelled;
    state = withoutIntent;
  }
  if (
    state.receptionPreparation &&
    (!state.ball.intendedReceiverId ||
      state.ball.intendedReceiverId !== state.receptionPreparation.actorId ||
      state.ball.ownerId !== undefined ||
      state.scenario !== input.scenario)
  ) {
    const { receptionPreparation: _stale, ...withoutPreparation } = state;
    void _stale;
    state = withoutPreparation;
  }
  if (state.ballCarrierIntent) {
    const carrier = state.players.find((player) => player.id === state.ballCarrierIntent!.actorId);
    const intent = state.ballCarrierIntent;
    if (
      carrier &&
      distance(carrier.position, intent.target) <
        distance(intent.closestPointReached, intent.target)
    )
      state = {
        ...state,
        ballCarrierIntent: { ...intent, closestPointReached: { ...carrier.position } },
      };
    if (
      !carrier ||
      state.ball.ownerId !== carrier.id ||
      state.time >= intent.expiresAt ||
      (intent.humanSelected
        ? hasReachedCarryDecisionWaypoint(carrier, intent)
        : distance(carrier.position, intent.target) <= 0.75)
    ) {
      const reason =
        !carrier || state.ball.ownerId !== carrier.id
          ? state.recentDuel?.resolvedAt === state.time
            ? ('contact' as const)
            : ('ball_lost' as const)
          : intent.humanSelected && hasReachedCarryDecisionWaypoint(carrier, intent)
            ? ('decision_waypoint' as const)
            : distance(carrier.position, intent.target) <= 0.75
              ? ('target_reached' as const)
              : ('safety_timeout' as const);
      const { ballCarrierIntent: _ended, ...withoutIntent } = state;
      void _ended;
      state = {
        ...withoutIntent,
        ...(intent.humanSelected
          ? {
              lastCarryDiagnostic: {
                actorId: intent.actorId,
                requestedTarget: intent.target,
                startPosition: intent.startPosition,
                estimatedArrival: intent.estimatedArrival,
                closestPointReached: intent.closestPointReached,
                distanceRemaining: carrier
                  ? distance(carrier.position, intent.target)
                  : distance(intent.closestPointReached, intent.target),
                terminationReason: reason,
                actualDuration: state.time - intent.startedAt,
              },
            }
          : {}),
        ...(intent.humanSelected &&
        carrier &&
        carrier.id === state.controlledFootballerId &&
        state.ball.ownerId === carrier.id
          ? {
              postActionAgencyCheckpoint: {
                actorId: carrier.id,
                completedAction: 'carry' as const,
                at: state.time,
              },
            }
          : {}),
      };
    }
  }
  if (state.goalCompletionUntil !== undefined && state.time >= state.goalCompletionUntil) {
    const kickoffTeam = state.pendingKickoffTeam!;
    const { goalCompletionUntil: _freeze, pendingKickoffTeam: _team, ...completed } = state;
    void _freeze;
    void _team;
    return applyRestartScenario(completed, 'kick_off', { restartTeam: kickoffTeam });
  }
  if (
    !state.periodEndPending &&
    state.restart?.phase === 'setup' &&
    state.time - state.restart.startedAt >= 2.1
  ) {
    const controlledTaker = state.restart.takerId === state.controlledFootballerId;
    const restartActions = enumerateRestartActions(state);
    const restartOptions = restartActions.map((action, index) => ({
      id: `restart-${index}`,
      kind: 'action' as const,
      labelKey: action.type,
      action,
    }));
    const meaningfulChoices = countSemanticPlayerChoices(restartOptions, 'restart');
    // A controlled taker only waits for a genuine choice. One mandatory action, and the
    // deterministic zero-option fallback, preserve restart liveness without confirmation UI.
    const watchdogTriggered =
      controlledTaker &&
      meaningfulChoices > 1 &&
      state.time - state.restart.startedAt >= RESTART_SETUP_WATCHDOG_SECONDS;
    const action =
      controlledTaker && meaningfulChoices > 1 && !watchdogTriggered
        ? undefined
        : (restartActions[0] ?? chooseRestartAction(state));
    if (action) {
      state = resolveMatchAction(
        state,
        action,
        watchdogTriggered ? 'restart_liveness_watchdog' : 'autonomous_npc',
      );
      if (watchdogTriggered)
        state = {
          ...state,
          lastRestartLivenessRecovery: {
            at: state.time,
            scenario: state.scenario,
            takerId: action.actorId,
            controlled: true,
            legalActionCount: restartActions.length,
            setupSeconds: state.time - (state.restart?.startedAt ?? state.time),
            recovery: 'canonical_restart_fallback',
          },
        };
    }
  }
  if (
    state.restart?.phase === 'release' &&
    state.time - (state.restart.executedAt ?? state.time) >= 4
  ) {
    const { restart: _restart, ...openPlay } = state;
    void _restart;
    state = { ...openPlay, scenario: 'open_play' };
  }
  for (const side of ['home', 'away'] as const) {
    const team = state.teams[side],
      elapsed = team.phaseElapsed + dt;
    state.teams[side] = {
      ...team,
      phaseElapsed: elapsed,
      phase:
        elapsed > 2.8 &&
        (team.phase === 'attacking_transition' || team.phase === 'defensive_transition')
          ? settledPhase(side === state.possessionTeam)
          : team.phase,
    };
  }
  if (state.ball.shot) {
    const projection = projectGoalkeeperIntervention(state);
    if (projection) {
      state.keeperIntervention = {
        keeperId: projection.keeper.id,
        intention: projection.reachable ? 'attempt_interception' : 'stay',
        target: toPitchPoint(projection.contactPoint),
        distanceToContact: projection.requiredDisplacement,
      };
      if (projection.reachable && (state.ball.flightTime ?? 0) >= projection.reactionDelay) {
        state.players = state.players.map((player) =>
          player.id === projection.keeper.id
            ? { ...player, target: toPitchPoint(projection.contactPoint) }
            : player,
        );
      }
    }
  } else if (state.ball.travelKind && state.ball.airborne && !state.ball.shot) {
    const interceptionPoint = state.ball.target ?? state.ball;
    const choice = goalkeeperIntervention(state, interceptionPoint);
    if (choice.keeper) {
      state.keeperIntervention = {
        keeperId: choice.keeper.id,
        intention: choice.decision,
        target: toPitchPoint(interceptionPoint),
        distanceToContact: distance(choice.keeper.position, interceptionPoint),
      };
      if (choice.decision !== 'stay')
        state.players = state.players.map((player) =>
          player.id === choice.keeper!.id
            ? { ...player, target: toPitchPoint(interceptionPoint) }
            : player,
        );
    }
  } else if (state.keeperIntervention) {
    // Intervention targets belong to one live flight only. Tactical positioning can now recover
    // a sweeper or diving keeper toward the canonical base position.
    delete state.keeperIntervention;
  }
  const planningSpan = startPerformanceSpan('tactical_planning');
  const semanticKey = tacticalSemanticKey(state);
  const tacticalPlanDue =
    !state.planningSchedule ||
    state.planningSchedule.semanticKey !== semanticKey ||
    state.time - state.planningSchedule.lastTacticalPlanAt >= 0.1 - FIXED_MATCH_DT / 2;
  if (tacticalPlanDue) state.planningSchedule = { lastTacticalPlanAt: state.time, semanticKey };
  // Formation/pressure plans are stable intentions. Integrate bodies at 40 Hz, but only answer
  // the expensive tactical question at 10 Hz or immediately after a semantic football event.
  const plannedPlayers = tacticalPlanDue ? deriveTacticalTargets(state) : state.players;
  endPerformanceSpan('tactical_planning', planningSpan);
  const movementSpan = startPerformanceSpan('movement_physics');
  state.players = plannedPlayers.map((player) => {
    let movementTarget = player.target;
    if (state.ballCarrierIntent?.actorId === player.id) {
      const execution = deriveCarryExecution(state, player, state.ballCarrierIntent);
      const changed = execution.mode !== state.ballCarrierIntent.executionMode;
      state.ballCarrierIntent = {
        ...state.ballCarrierIntent,
        executionMode: execution.mode,
        modeSince: changed ? state.time : state.ballCarrierIntent.modeSince,
        localTarget: execution.localTarget,
        touchDistance: execution.touchDistance,
      };
      movementTarget = execution.localTarget;
      // The exposed target remains the committed human destination. Only locomotion consumes the
      // short-lived bypass waypoint.
      player = { ...player, target: state.ballCarrierIntent.target };
    }
    if (state.playerMovementIntent?.actorId === player.id) {
      player = { ...player, target: state.playerMovementIntent.target };
      movementTarget = player.target;
    }
    if (state.defensiveChallenge?.actorId === player.id) {
      player = { ...player, target: state.defensiveChallenge.target };
      movementTarget = player.target;
    }
    if (
      state.receptionPreparation?.actorId === player.id &&
      state.time >= state.receptionPreparation.awarenessAt
    )
      player = { ...player, target: state.receptionPreparation.expectedContactPoint };
    if (state.receptionPreparation?.actorId === player.id) movementTarget = player.target;
    if (state.restart?.phase === 'setup') return { ...player, velocity: { x: 0, y: 0 } };
    if (
      state.keeperIntervention?.keeperId === player.id &&
      state.keeperIntervention.intention !== 'stay'
    )
      player = { ...player, target: { ...state.keeperIntervention.target } };
    if (state.keeperIntervention?.keeperId === player.id) movementTarget = player.target;
    if (
      state.scenario === 'open_play' &&
      state.ball.ownerId === player.id &&
      state.ballCarrierIntent?.actorId !== player.id &&
      state.playerMovementIntent?.actorId !== player.id
    ) {
      // Owning/scanning/shielding is not a carry. A moving team block cannot walk the ball
      // across the pitch or re-arm a resolved duel without a deliberate movement intention.
      movementTarget = player.position;
    } else if (
      state.nearestChallengerId === player.id &&
      state.ball.ownerId &&
      state.defensiveChallenge?.actorId !== player.id &&
      state.playerMovementIntent?.actorId !== player.id &&
      (isDefensiveEpisodeLocked(state, player.id, state.ball.ownerId) ||
        !shouldCommitRoutinePress(state, player.id))
    ) {
      const owner = state.players.find((candidate) => candidate.id === state.ball.ownerId)!;
      const away = {
        x: player.position.x - owner.position.x,
        y: player.position.y - owner.position.y,
      };
      const separation = Math.hypot(away.x, away.y);
      const direction =
        separation > 0.001
          ? { x: away.x / separation, y: away.y / separation }
          : { x: player.team === 'home' ? -1 : 1, y: 0 };
      movementTarget = clampPitchPoint({
        x: owner.position.x + direction.x * 2.3,
        y: owner.position.y + direction.y * 2.3,
      });
    }
    const dx = movementTarget.x - player.position.x,
      dy = movementTarget.y - player.position.y,
      d = Math.max(0.001, Math.hypot(dx, dy));
    const locomotion = projectLocomotion(state, player, movementTarget);
    const desiredFacingAngle = deriveOrientationTarget(state, player);
    const facingAngle = integrateFacing(
      player.facingAngle,
      desiredFacingAngle,
      player.profile.attributes.agility,
      Math.hypot(player.velocity.x, player.velocity.y),
      dt,
    );
    const movementMode = classifyRelativeMovement(facingAngle, { x: dx, y: dy }, d);
    const maxSpeed = locomotion.targetSpeed * movementModeSpeedFactor(movementMode);
    const agility = player.profile.attributes.agility / 100;
    const accelerationRate = 3.2 + agility * 5.5;
    const structural = ['structural_adjustment', 'maintain_shape', 'support_run'].includes(
      locomotion.reason,
    );
    const remaining = Math.max(0, d - (structural ? 0.65 : 0.08));
    // Brake toward a resting target rather than overshooting and repeatedly accelerating back.
    const arrivalSpeed = Math.sqrt(2 * accelerationRate * remaining);
    const desiredSpeed = Math.min(maxSpeed, arrivalSpeed, remaining / dt);
    const desiredVelocity = {
      x: (dx / d) * desiredSpeed,
      y: (dy / d) * desiredSpeed,
    };
    const acceleration = accelerationRate * dt;
    const velocityDelta = {
      x: desiredVelocity.x - player.velocity.x,
      y: desiredVelocity.y - player.velocity.y,
    };
    const velocityDeltaLength = Math.hypot(velocityDelta.x, velocityDelta.y);
    const velocityScale =
      velocityDeltaLength > acceleration ? acceleration / velocityDeltaLength : 1;
    const velocity = {
      x: player.velocity.x + velocityDelta.x * velocityScale,
      y: player.velocity.y + velocityDelta.y * velocityScale,
    };
    const integratedPosition = clampPitchPoint({
      x: player.position.x + velocity.x * dt,
      y: player.position.y + velocity.y * dt,
    });
    let next = integratedPosition;
    const close = state.players.filter(
      (p) => p.id !== player.id && distance(p.position, next) < 1.15,
    );
    for (const other of close) {
      const ox = next.x - other.position.x,
        oy = next.y - other.position.y,
        od = Math.max(0.1, Math.hypot(ox, oy));
      // Body separation is a small constraint correction, not an extra 4.8 m/s motor whose
      // artificial velocity feeds the following tick or whose jitter earns running distance.
      const separation = Math.min(Math.max(0, 1.15 - od), 0.65 * dt);
      next = clampPitchPoint({
        x: next.x + (ox / od) * separation,
        y: next.y + (oy / od) * separation,
      });
    }
    const samples = player.samples + 1;
    const travelled = distance(player.position, integratedPosition);
    const speed = Math.hypot(velocity.x, velocity.y);
    const previousTelemetry = player.locomotionTelemetry ?? {
      distanceTotal: 0,
      distanceWalk: 0,
      distanceJog: 0,
      distanceRun: 0,
      distanceSprint: 0,
      sprintSeconds: 0,
      sprintBursts: 0,
      maxSpeed: 0,
    };
    const athleteMaximumSpeed = 6.2 + (player.profile.attributes.pace / 100) * 3.3;
    const speedRatio = speed / athleteMaximumSpeed;
    const sprint = projectSprintEpisode(player, speedRatio, state.time, dt);
    const actualSprinting = sprint.actualSprinting;
    const distanceKey = (
      {
        walk: 'distanceWalk',
        jog: 'distanceJog',
        run: 'distanceRun',
        sprint: 'distanceSprint',
      } as const
    )[actualSprinting ? 'sprint' : speed < 2.2 ? 'walk' : speed < 4.2 ? 'jog' : 'run'];
    const {
      sprintStartedAt: _oldSprint,
      sprintRecoveryStartedAt: _oldRecovery,
      sprintBurstCounted: _oldBurst,
      ...movingPlayer
    } = player;
    void [_oldSprint, _oldRecovery, _oldBurst];
    return {
      ...movingPlayer,
      position: next,
      velocity: {
        x: (integratedPosition.x - player.position.x) / dt,
        y: (integratedPosition.y - player.position.y) / dt,
      },
      facingAngle,
      desiredFacingAngle,
      movementMode,
      turnRate: Math.abs(normalizeAngle(facingAngle - player.facingAngle)) / dt,
      locomotionIntensity: locomotion.intensity,
      locomotionReason: locomotion.reason,
      targetSpeed: locomotion.targetSpeed,
      locomotionTelemetry: {
        ...previousTelemetry,
        distanceTotal: previousTelemetry.distanceTotal + travelled,
        [distanceKey]: (previousTelemetry[distanceKey] ?? 0) + (actualSprinting ? 0 : travelled),
        distanceSprint: previousTelemetry.distanceSprint + (actualSprinting ? travelled : 0),
        sprintSeconds: previousTelemetry.sprintSeconds + (actualSprinting ? dt : 0),
        sprintBursts: previousTelemetry.sprintBursts + (sprint.countBurst ? 1 : 0),
        maxSpeed: Math.max(previousTelemetry.maxSpeed, speed),
      },
      ...(sprint.sprintStartedAt !== undefined ? { sprintStartedAt: sprint.sprintStartedAt } : {}),
      ...(sprint.sprintRecoveryStartedAt !== undefined
        ? { sprintRecoveryStartedAt: sprint.sprintRecoveryStartedAt }
        : {}),
      sprintBurstCounted: sprint.sprintBurstCounted,
      samples,
      meanPosition: {
        x: (player.meanPosition.x * player.samples + next.x) / samples,
        y: (player.meanPosition.y * player.samples + next.y) / samples,
      },
    };
  });
  endPerformanceSpan('movement_physics', movementSpan);
  const ballSpan = startPerformanceSpan('ball_physics');
  try {
    if (state.goalCompletionUntil !== undefined) {
      const velocity = state.ball.velocity ?? { x: 0, y: 0 };
      state.ball = {
        ...state.ball,
        x: state.ball.x + velocity.x * dt,
        y: state.ball.y + velocity.y * dt,
        velocity: { x: velocity.x * 0.94, y: velocity.y * 0.94 },
      };
    } else if (
      state.ball.travelKind &&
      state.ball.from &&
      state.ball.target &&
      state.ball.velocity
    ) {
      // Project from the start of this integration segment. After integration the ball may already
      // be beyond the keeper plane, which used to remove the keeper from the CCD candidate set and
      // let the later goal-plane event win.
      const goalkeeperProjectionAtSegmentStart = state.ball.shot
        ? projectGoalkeeperIntervention(state)
        : undefined;
      const previous: FlightPoint = {
        x: state.ball.x,
        y: state.ball.y,
        z: state.ball.height ?? 0,
      };
      const elapsed = (state.ball.flightTime ?? 0) + dt,
        previousDistance = state.ball.distanceTravelled ?? 0;
      const integrated = integrateBallFlight(
        {
          position: previous,
          velocity: {
            x: state.ball.velocity?.x ?? 0,
            y: state.ball.velocity?.y ?? 0,
            z: state.ball.velocity?.z ?? 0,
          },
          airborne: state.ball.airborne ?? false,
          bounceCount: state.ball.bounceCount ?? 0,
        },
        dt,
      );
      const next: FlightPoint = integrated.position;
      const nextHeight = next.z;
      if (!state.ball.shot && integrated.bounceCount > (state.ball.bounceCount ?? 0))
        // A delivery which reaches grass unclaimed has an aerial outcome, but no player touch.
        state = { ...state, lastAerialResult: 'loose_ball', aerialContestantIds: [] };
      if (!state.ball.shot) {
        const crossing = findPitchBoundaryCrossing(previous, next);
        const contact =
          !integrated.airborne && nextHeight <= 0.2
            ? resolveContinuousGroundPassClaim(state, previous, next)
            : undefined;
        if (contact && (!crossing || contact.segmentFraction < crossing.segmentFraction)) {
          state = applyThrowInContact(state, contact.playerId!);
          const contactingPlayer = state.players.find((player) => player.id === contact.playerId)!;
          if (contact.cause !== 'interception') {
            const finish = tryIncomingFinish(
              {
                ...state,
                ball: {
                  ...state.ball,
                  ...contact.landingPosition,
                  height: previous.z + (next.z - previous.z) * contact.segmentFraction,
                },
              },
              contact.playerId!,
            );
            if (finish) return finish;
          }
          if (contact.cause !== 'interception')
            return changePossession(
              {
                ...state,
                ball: { ...contact.landingPosition, lastTouchPlayerId: contact.playerId! },
              },
              contact.playerId!,
              contact.cause,
            );
          // Geometry grants a contact, not ownership. Technique and composure decide whether that
          // contact is controlled; an unsuccessful control creates one new loose-ball episode.
          const attributes = contactingPlayer.profile.attributes;
          const controlQuality =
            (attributes.positioning +
              attributes.gameReading +
              attributes.technique +
              attributes.composure) /
            400;
          const rng = RandomGenerator.fromSeed(
            `${state.seed}:interception-contact:${state.ballEpisode ?? 0}:${contactingPlayer.id}`,
          );
          // A stretching edge contact should usually alter the pass, not magically secure it.
          // Early, square access through the centre of the envelope still rewards anticipation.
          const cleanControlChance = 0.12 + controlQuality * 0.4 + contact.contactMargin * 0.25;
          if (rng.float() < cleanControlChance)
            return changePossession(
              {
                ...state,
                ball: { ...contact.landingPosition, lastTouchPlayerId: contact.playerId! },
              },
              contact.playerId!,
              'interception',
            );
          const incoming = state.ball.velocity ?? { x: 0, y: 0 };
          return makeLoose(
            {
              ...state,
              ball: { ...contact.landingPosition, lastTouchPlayerId: contact.playerId! },
            },
            { x: -incoming.x * 0.22, y: incoming.y * 0.35 + (rng.float() - 0.5) * 3 },
          );
        }
        // Low airborne cut-backs/half-volleys sit above the ground-claim envelope but below the
        // aerial duel. Use the same real ball segment, rather than moving the ball to its target.
        if (state.ball.airborne) {
          const dx = next.x - previous.x,
            dy = next.y - previous.y;
          const segmentLengthSquared = dx * dx + dy * dy;
          const contacts = state.players
            .filter((player) => canContactAfterThrowIn(state, player.id))
            .map((player) => {
              const fraction =
                segmentLengthSquared > 0
                  ? Math.max(
                      0,
                      Math.min(
                        1,
                        ((player.position.x - previous.x) * dx +
                          (player.position.y - previous.y) * dy) /
                          segmentLengthSquared,
                      ),
                    )
                  : 0;
              const point = { x: previous.x + dx * fraction, y: previous.y + dy * fraction };
              const height = previous.z + (next.z - previous.z) * fraction;
              return { player, fraction, point, height, metres: distance(player.position, point) };
            })
            .filter(
              (candidate) =>
                candidate.height > 0.2 &&
                candidate.height < 0.65 &&
                candidate.metres <= 1.05 &&
                (!crossing || candidate.fraction < crossing.segmentFraction),
            )
            .sort(
              (a, b) =>
                a.fraction - b.fraction ||
                a.metres - b.metres ||
                a.player.id.localeCompare(b.player.id),
            );
          for (const candidate of contacts) {
            const finish = tryIncomingFinish(
              { ...state, ball: { ...state.ball, ...candidate.point, height: candidate.height } },
              candidate.player.id,
            );
            if (finish) return finish;
          }
        }
        if (crossing) return applyBoundaryRestart(state, crossing, previous);
      }
      state.ball = {
        ...state.ball,
        x: next.x,
        y: next.y,
        flightTime: elapsed,
        distanceTravelled:
          previousDistance +
          Math.hypot(next.x - previous.x, next.y - previous.y, next.z - previous.z),
        height: nextHeight,
        velocity: integrated.velocity,
        airborne: integrated.airborne,
        bounceCount: integrated.bounceCount,
      };
      if (state.ball.shot) {
        const shot = state.ball.shot;
        const shooter = state.players.find((player) => player.id === shot.shooterId)!;
        const candidates: ContactCandidate[] = state.players
          .filter(
            (player) =>
              player.team !== shooter.team && player.profile.primaryPosition !== 'goalkeeper',
          )
          .map((defender) => ({
            kind: 'defender' as const,
            playerId: defender.id,
            centre: { ...defender.position, z: 0.9 },
            radius: 0.72,
          }));
        const keeperProjection = goalkeeperProjectionAtSegmentStart;
        const defendingKeeper = state.players.find(
          (player) =>
            player.team !== shooter.team && player.profile.primaryPosition === 'goalkeeper',
        );
        // Reaction controls an active save, never whether a standing body physically exists.
        if (defendingKeeper)
          candidates.push({
            kind: 'goalkeeper',
            playerId: defendingKeeper.id,
            centre: { ...defendingKeeper.position, z: GOALKEEPER_PHYSICS.contactCentreHeight },
            radius: GOALKEEPER_PHYSICS.passiveBodyRadiusMetres,
          });
        if (keeperProjection?.reachable && keeperProjection.reactionRemaining === 0) {
          candidates.push({
            kind: 'goalkeeper' as const,
            playerId: keeperProjection.keeper.id,
            centre: {
              ...keeperProjection.keeper.position,
              z: GOALKEEPER_PHYSICS.contactCentreHeight,
            },
            // Locomotion moves the body; this bounded envelope represents body, arms and dive only.
            // Using the movement budget here as well would count the same reach twice.
            radius: GOALKEEPER_PHYSICS.contactReachMetres,
          });
        }
        const found = findFirstBallContact({
          previous,
          next,
          attackingTeam: shooter.team,
          candidates,
        });
        if (found) {
          const incoming = { x: (next.x - previous.x) / dt, y: (next.y - previous.y) / dt };
          const rebound = deterministicRebound(found.kind, incoming, shooter.team);
          const contact: BallContact = {
            ...found,
            at: state.time - dt + found.segmentFraction * dt,
            preContactSpeed: Math.hypot(incoming.x, incoming.y),
            postContactSpeed:
              found.kind === 'goal_plane' || found.kind === 'out'
                ? Math.hypot(incoming.x, incoming.y)
                : Math.hypot(rebound.x, rebound.y),
          };
          return finishShotContact(state, contact, incoming, keeperProjection);
        }
      }
      if (state.ball.airborne && !state.ball.shot) {
        const physical = findAerialContactCandidates(state, dt);
        if (physical.length) {
          const duel = resolveAerialDuel(
            state,
            physical.map(({ player }) => player),
          );
          const winner = duel.winner;
          const contactPoint = { x: state.ball.x, y: state.ball.y };
          const base = {
            ...state,
            aerialContestantIds: duel.contestants.map((p) => p.id),
            lastAerialResult: duel.outcome,
            lastAerialContact: {
              point: contactPoint,
              ballHeight: state.ball.height ?? 0,
              candidates: physical.map(({ contact }) => contact),
              contestantIds: duel.contestants.map((p) => p.id),
              ...(winner ? { winnerId: winner.id } : {}),
            },
          };
          if (duel.outcome === 'keeper_claim' && winner)
            return changePossession({ ...base, ball: { ...contactPoint } }, winner.id, 'claim');
          // A missed contest does not itself touch or flatten the ball.
          if (!winner) return base;
          if (duel.outcome === 'keeper_punch')
            return makeLoose(
              {
                ...(winner ? applyThrowInContact(base, winner.id) : base),
                ball: { ...contactPoint, ...(winner ? { lastTouchPlayerId: winner.id } : {}) },
              },
              { x: state.possessionTeam === 'home' ? -7 : 7, y: 2 },
            );
          const finish = tryIncomingFinish(base, winner.id);
          if (finish) return finish;
          const selectedReception =
            state.pendingReceptionIntent?.actorId === winner.id &&
            (state.pendingReceptionIntent.action.type === 'hold' ||
              state.pendingReceptionIntent.action.type === 'carry');
          if (
            selectedReception ||
            (state.ball.height ?? 0) < 1.45 ||
            duel.outcome === 'attacking_header'
          ) {
            // A selected receive waits for reachable foot control. A duel recommendation never
            // overrides human intent or manufactures a shooting action outside shared AI ranking.
            if ((state.ball.height ?? 0) > 1.45) return base;
            return changePossession(base, winner.id, 'claim');
          }
          const target =
            duel.outcome === 'clearance_header'
              ? clampPitchPoint({
                  x: contactPoint.x + (winner.team === 'home' ? 20 : -20),
                  y: contactPoint.y + (contactPoint.y < 34 ? 8 : -8),
                })
              : clampPitchPoint({
                  x: contactPoint.x + (winner.team === 'home' ? 9 : -9),
                  y: contactPoint.y,
                });
          return resolveMatchAction(
            {
              ...applyThrowInContact(base, winner.id),
              ball: {
                ...state.ball,
                ...contactPoint,
                ownerId: winner.id,
                lastTouchPlayerId: winner.id,
              },
            },
            {
              type: 'header',
              actorId: winner.id,
              target,
              intent:
                duel.outcome === 'clearance_header'
                  ? 'header_clearance'
                  : duel.outcome === 'flick_on'
                    ? 'flick'
                    : 'header_pass',
            },
          );
        }
      }
      // Ground interceptions are resolved once, by the continuous physical segment above. The old
      // proximity lottery sampled the same defender every 100 ms and caused repeated, non-physical
      // turnover opportunities during a single pass episode.
      if (!state.ball.shot && Math.hypot(integrated.velocity.x, integrated.velocity.y) < 0.25) {
        if (state.ball.airborne || (state.ball.bounceCount ?? 0) > 0) {
          const physical = findAerialContactCandidates(state, dt);
          if (!physical.length) {
            if (state.ball.airborne) return state;
            return finishUnclaimedDelivery({
              ...state,
              lastAerialResult: 'loose_ball',
              aerialContestantIds: [],
            });
          }
          const duel = resolveAerialDuel(state);
          const base = {
            ...state,
            aerialContestantIds: duel.contestants.map((p) => p.id),
            lastAerialResult: duel.outcome,
            ...(state.keeperIntervention
              ? {
                  keeperIntervention: {
                    ...state.keeperIntervention,
                    ...(duel.outcome.startsWith('keeper_')
                      ? {
                          finalOutcome: duel.outcome as
                            | 'keeper_claim'
                            | 'keeper_punch'
                            | 'keeper_miss',
                        }
                      : {}),
                  },
                }
              : {}),
          };
          if (duel.outcome === 'keeper_claim' && duel.winner)
            return changePossession(
              { ...base, ball: { ...duel.winner.position } },
              duel.winner.id,
              'claim',
            );
          const priority = secondBallPriority(state, duel.contestants);
          if (duel.outcome === 'keeper_punch')
            return makeLoose(
              {
                ...(duel.winner ? applyThrowInContact(base, duel.winner.id) : base),
                ball: {
                  ...state.ball,
                  secondBallPriorityIds: priority,
                  ...(duel.winner ? { lastTouchPlayerId: duel.winner.id } : {}),
                },
              },
              { x: state.possessionTeam === 'home' ? -7 : 7, y: 2 },
            );
          if (!duel.winner)
            return state.ball.airborne
              ? base
              : finishUnclaimedDelivery({
                  ...base,
                  ball: { ...state.ball, secondBallPriorityIds: priority },
                });
          const winner = duel.winner;
          const finish = tryIncomingFinish(base, winner.id);
          if (finish) return finish;
          const selectedReception =
            state.pendingReceptionIntent?.actorId === winner.id &&
            (state.pendingReceptionIntent.action.type === 'hold' ||
              state.pendingReceptionIntent.action.type === 'carry');
          if (
            selectedReception ||
            (state.ball.height ?? 0) < 1.45 ||
            duel.outcome === 'attacking_header'
          ) {
            if ((state.ball.height ?? 0) > 1.45) return base;
            return changePossession(base, winner.id, 'claim');
          }
          const target =
            duel.outcome === 'clearance_header'
              ? clampPitchPoint({
                  x: winner.position.x + (winner.team === 'home' ? 20 : -20),
                  y: winner.position.y + (winner.position.y < 34 ? 8 : -8),
                })
              : clampPitchPoint({
                  x: winner.position.x + (winner.team === 'home' ? 9 : -9),
                  y: winner.position.y,
                });
          return resolveMatchAction(
            {
              ...applyThrowInContact(base, winner.id),
              ball: { ...state.ball, ownerId: winner.id, lastTouchPlayerId: winner.id },
            },
            {
              type: 'header',
              actorId: winner.id,
              target,
              intent:
                duel.outcome === 'clearance_header'
                  ? 'header_clearance'
                  : duel.outcome === 'flick_on'
                    ? 'flick'
                    : 'header_pass',
            },
          );
        }
        const landing = { x: state.ball.x, y: state.ball.y };
        const claim = resolveGroundPassClaim(state, landing);
        if (claim.playerId) {
          if (isOffsideOffence(state.offsideSnapshot, claim.playerId)) {
            const offender = state.players.find((player) => player.id === claim.playerId)!;
            const opponent = state.players
              .filter((player) => player.team !== offender.team)
              .sort((a, b) => distance(a.position, landing) - distance(b.position, landing))[0];
            if (opponent) {
              const legalRestartState = withoutOffsideSnapshot({
                ...state,
                ball: landing,
                lastOffsideOffence: {
                  playerId: offender.id,
                  at: state.time,
                  reason: 'attempted_receive',
                },
              });
              state = changePossession(legalRestartState, opponent.id, 'claim');
              state.ball = { ...landing, ownerId: opponent.id };
            }
          } else {
            state = changePossession(
              withoutOffsideSnapshot({ ...state, ball: landing }),
              claim.playerId,
              claim.cause,
            );
            state.ball = { ...landing, ownerId: claim.playerId };
          }
        } else {
          state = finishUnclaimedDelivery(state);
        }
      }
    } else if (!state.ball.ownerId && state.ball.looseSince !== undefined) {
      const velocity = state.ball.velocity ?? { x: 0, y: 0 },
        looseSince = state.ball.looseSince;
      const projected = { x: state.ball.x + velocity.x * dt, y: state.ball.y + velocity.y * dt };
      const crossing = findPitchBoundaryCrossing(state.ball, projected);
      if (crossing) return applyBoundaryRestart(state, crossing, state.ball);
      const rolled = rollLooseBall(state.ball, velocity, dt);
      state.ball = {
        ...state.ball,
        ...rolled.position,
        velocity: rolled.velocity,
      };
      if (state.time - looseSince > 0.35) {
        const assignments = deriveLooseBallAssignments(state);
        const assignedIds = new Set(assignments.map((assignment) => assignment.playerId));
        const claimant = state.players
          .filter((p) => assignedIds.has(p.id))
          .map((p) => ({
            p,
            score:
              distance(p.position, state.ball) -
              (p.profile.attributes.pace +
                p.profile.attributes.agility +
                p.profile.attributes.gameReading) /
                90 -
              (state.ball.secondBallPriorityIds?.includes(p.id) ? 2.4 : 0),
          }))
          .sort((a, b) => a.score - b.score || a.p.id.localeCompare(b.p.id))[0];
        const controlRadius = Math.max(
          1.15,
          2.1 - Math.hypot(rolled.velocity.x, rolled.velocity.y) * 0.04,
        );
        if (claimant && distance(claimant.p.position, state.ball) <= controlRadius)
          state = changePossession(state, claimant.p.id, 'claim');
      }
    } else if (state.ball.ownerId && state.restart?.phase !== 'setup') {
      const owner = state.players.find((p) => p.id === state.ball.ownerId)!;
      const speed = Math.hypot(owner.velocity.x, owner.velocity.y),
        dirX = speed > 0.2 ? owner.velocity.x / speed : owner.team === 'home' ? 1 : -1,
        dirY = speed > 0.2 ? owner.velocity.y / speed : 0;
      // Scanning keeps the ball at the feet. Only deliberate movement pushes it into a stride;
      // a stationary receiver must not offer every nearby marker a permanently exposed ball.
      const deliberateMovement =
        state.ballCarrierIntent?.actorId === owner.id ||
        state.playerMovementIntent?.actorId === owner.id;
      const controlOffset = deliberateMovement ? 1.15 : 0.45;
      state.ball = {
        ...state.ball,
        x: owner.position.x + dirX * controlOffset,
        y: owner.position.y + dirY * controlOffset,
        ownerId: owner.id,
      };
    }
  } finally {
    endPerformanceSpan('ball_physics', ballSpan);
  }
  const actionSpan = startPerformanceSpan('action_resolution');
  try {
    if (state.ball.ownerId && !state.ball.travelKind && state.restart?.phase !== 'setup') {
      const owner = state.players.find((p) => p.id === state.ball.ownerId)!;
      const evaluated = evaluatePressure(state, owner);
      state.currentPressure = evaluated.value;
      if (evaluated.nearestChallengerId) state.nearestChallengerId = evaluated.nearestChallengerId;
      else delete state.nearestChallengerId;
      const challenger = state.players.find((p) => p.id === evaluated.nearestChallengerId);
      const duelDistance = challenger ? distance(challenger.position, owner.position) : Infinity;
      const ballDistance = challenger ? distance(challenger.position, state.ball) : Infinity;
      const challengerFacingError = challenger
        ? Math.abs(
            normalizeAngle(
              angleForVector({
                x: state.ball.x - challenger.position.x,
                y: state.ball.y - challenger.position.y,
              }) - challenger.facingAngle,
            ),
          )
        : Math.PI;
      const relativeSpeed = challenger
        ? Math.hypot(
            challenger.velocity.x - owner.velocity.x,
            challenger.velocity.y - owner.velocity.y,
          )
        : Infinity;
      const shielding =
        state.ballCarrierIntent?.actorId === owner.id &&
        state.ballCarrierIntent.executionMode === 'shield';
      const hasChallengeAccess =
        ballDistance <= (shielding ? 0.72 : 0.95) &&
        challengerFacingError <= (shielding ? Math.PI * 0.3 : Math.PI * 0.42) &&
        relativeSpeed <= 8.5;
      const sameDuel = Boolean(
        challenger &&
          state.recentDuel &&
          state.recentDuel.ballEpisode === (state.ballEpisode ?? 0) &&
          state.recentDuel.expiresAt > state.time &&
          state.recentDuel.participants.includes(owner.id) &&
          state.recentDuel.participants.includes(challenger.id),
      );
      if (
        !state.periodEndPending &&
        !state.defensiveChallenge &&
        challenger &&
        !sameDuel &&
        duelDistance < 3.2
      ) {
        const selected = chooseNpcDefensiveChallengeAction(state, challenger.id);
        // Ordinary autonomous contacts retain the old narrow access envelope. Only NPCs can
        // initiate a contextual high-risk approach; a controlled player needs explicit intent.
        if (
          selected &&
          (selected.technique !== 'standing' || (duelDistance < 1.65 && hasChallengeAccess))
        )
          state = beginDefensiveChallenge(
            state,
            selected,
            challenger.id === state.controlledFootballerId
              ? 'autonomous_routine'
              : 'autonomous_npc',
          );
      }
    } else {
      state.currentPressure = 0;
      delete state.nearestChallengerId;
    }
    if (state.defensiveChallenge) {
      const resolution = resolveDefensiveChallenge(state);
      state = resolution.state;
      if (resolution.diagnostic?.outcome === 'clean_win')
        state = changePossession(state, resolution.diagnostic.actorId, 'tackle');
      else if (resolution.diagnostic?.outcome === 'loose_ball')
        state = makeLoose(state, resolution.looseVelocity);
      else if (resolution.diagnostic?.outcome === 'foul')
        state = applyChallengeInfringement(state, resolution.diagnostic);
    }
    if (state.status === 'abandoned') return state;
    if (
      !state.periodEndPending &&
      state.actionCooldown <= 0 &&
      state.ball.ownerId &&
      state.restart?.phase !== 'setup'
    ) {
      const ownerId = state.ball.ownerId;
      if (!ownerId) return state;
      const awaitsPlayer = Boolean(projectPlayerDecisionOpportunity(state));
      // The agency evaluator owns the pause. A forced action uses the same autonomous resolver,
      // including high-impact actions when no genuinely playable alternative exists.
      const action =
        awaitsPlayer || hasActiveHumanPossession(state)
          ? undefined
          : chooseNpcRoutineAction(state, ownerId);
      const controlled = state.ball.ownerId === state.controlledFootballerId;
      if (action)
        state = resolveMatchAction(
          state,
          action,
          controlled ? 'autonomous_routine' : 'autonomous_npc',
        );
    }
    return state;
  } finally {
    endPerformanceSpan('action_resolution', actionSpan);
  }
};

const hasImmediateResolution = (state: TacticalMatchState) =>
  Boolean(
    state.ball.travelKind ||
      state.goalCompletionUntil ||
      state.ballCarrierIntent ||
      state.defensiveChallenge,
  );

const clearTransientPeriodState = (state: TacticalMatchState): TacticalMatchState => {
  const {
    currentAction: _action,
    currentActorId: _actor,
    currentActionSource: _source,
    pendingReceptionIntent: _reception,
    receptionPreparation: _preparation,
    ballCarrierIntent: _carry,
    playerMovementIntent: _movement,
    defensiveChallenge: _challenge,
    pendingPlayerDecision: _decision,
    postActionAgencyCheckpoint: _checkpoint,
    humanPossessionEpisode: _humanPossession,
    restart: _restart,
    periodEndPending: _pending,
    ...stable
  } = state;
  void [
    _action,
    _actor,
    _source,
    _reception,
    _preparation,
    _carry,
    _movement,
    _challenge,
    _decision,
    _checkpoint,
    _humanPossession,
    _restart,
    _pending,
  ];
  return stable;
};

/** Starts the prepared second-half kickoff; canonical directions remain team-relative and stable. */
export const startSecondHalf = (state: TacticalMatchState): TacticalMatchState => {
  state = enforceMinimumPlayers(state);
  if (state.status !== 'half_time') return state;
  const ready = { ...state, status: 'second_half' as const, actionCooldown: 0.4 };
  return applyRestartScenario(ready, 'kick_off', { restartTeam: 'away' });
};

/** Regulation wrapper. Thresholds stop new choices, while committed ball physics finish safely. */
export const stepTacticalMatch = (
  input: TacticalMatchState,
  rawDelta = 0.1,
): TacticalMatchState => {
  input = enforceMinimumPlayers(input);
  const status = input.status ?? (input.time >= 45 * 60 ? 'second_half' : 'first_half');
  if (status === 'full_time' || status === 'half_time' || status === 'abandoned') return input;
  const threshold = status === 'first_half' ? 45 * 60 : 90 * 60;
  let prepared = input;
  if (
    input.periodEndPending ||
    input.time + Math.min(0.25, Math.max(0.01, rawDelta)) >= threshold
  ) {
    prepared = { ...input, periodEndPending: true };
    delete prepared.pendingPlayerDecision;
  }
  let next = reconcileHumanPossession(stepTacticalMatchCore(prepared, rawDelta));
  if (next === input) return input;
  if (!next.status) next = { ...next, status };
  if (next.status !== 'abandoned' && next.periodEndPending && !hasImmediateResolution(next)) {
    next = {
      ...clearTransientPeriodState(next),
      // Ordinary threshold-only play stops exactly on regulation time. An accepted physical
      // commitment may finish just after it; never rewind its canonical contact/card evidence.
      time:
        input.periodEndPending || hasImmediateResolution(input) || input.time >= threshold
          ? Math.max(threshold, next.time)
          : threshold,
      status: status === 'first_half' ? 'half_time' : 'full_time',
      actionCooldown: 0,
      ball: {
        x: next.ball.x,
        y: next.ball.y,
        ...(next.ball.lastTouchPlayerId ? { lastTouchPlayerId: next.ball.lastTouchPlayerId } : {}),
      },
    };
  }
  next = advanceMatchRules(input, next);
  next = emitCanonicalActionEvents(input, next);
  next = {
    ...next,
    statistics: observePlayerMatchStats(
      input.statistics ?? createMatchStatistics(input),
      input,
      next,
    ),
  };
  return next;
};

/**
 * Canonical fast entry after an exact human-decision probe has returned no opportunity.
 * It skips only that duplicate pure projection; all physics and action resolution are identical.
 */
export const stepTacticalMatchAfterDecisionProbe = (
  input: TacticalMatchState,
  rawDelta = FIXED_MATCH_DT,
): TacticalMatchState => {
  input = enforceMinimumPlayers(input);
  const status = input.status ?? (input.time >= 45 * 60 ? 'second_half' : 'first_half');
  if (status === 'full_time' || status === 'half_time' || status === 'abandoned') return input;
  const threshold = status === 'first_half' ? 45 * 60 : 90 * 60;
  const prepared =
    input.periodEndPending || input.time + rawDelta >= threshold
      ? { ...input, periodEndPending: true }
      : input;
  let next = reconcileHumanPossession(stepTacticalMatchCore(prepared, rawDelta, true));
  if (next.status !== 'abandoned' && next.periodEndPending && !hasImmediateResolution(next)) {
    next = {
      ...clearTransientPeriodState(next),
      time:
        input.periodEndPending || hasImmediateResolution(input) || input.time >= threshold
          ? Math.max(threshold, next.time)
          : threshold,
      status: status === 'first_half' ? 'half_time' : 'full_time',
      actionCooldown: 0,
      ball: {
        x: next.ball.x,
        y: next.ball.y,
        ...(next.ball.lastTouchPlayerId ? { lastTouchPlayerId: next.ball.lastTouchPlayerId } : {}),
      },
    };
  }
  next = advanceMatchRules(input, next);
  next = emitCanonicalActionEvents(input, next);
  return {
    ...next,
    status: next.status ?? status,
    statistics: observePlayerMatchStats(
      input.statistics ?? createMatchStatistics(input),
      input,
      next,
    ),
  };
};

export const matchStateToFrame = (
  state: TacticalMatchState,
  options: { includeAiCarryTarget?: boolean } = {},
) => ({
  timestampMs: state.time * 1000,
  players: state.players.map((p) => {
    return {
      id: p.id,
      team: p.team,
      x: p.position.x,
      y: p.position.y,
      goalkeeper: p.profile.primaryPosition === 'goalkeeper',
      protagonist: p.id === state.controlledFootballerId,
      // Match Lab fallback. A registered career/club squad number should override this here later.
      displayNumber: p.slotIndex + 1,
      target: p.target,
      anchor: p.neutralAnchor,
      idealTarget: p.idealTarget,
      facing: p.facingAngle,
    };
  }),
  ball: {
    x: state.ball.x,
    y: state.ball.y,
    height: state.ball.height ?? 0,
    ownerId: state.ball.ownerId,
  },
  ...(state.ballCarrierIntent &&
  (state.ballCarrierIntent.humanSelected || options.includeAiCarryTarget)
    ? {
        carryTarget: state.ballCarrierIntent.target,
        carryMode: state.ballCarrierIntent.executionMode,
      }
    : {}),
});
