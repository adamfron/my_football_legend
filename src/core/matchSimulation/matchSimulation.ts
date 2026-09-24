import { deriveCanonicalCoachProfile } from '../coachProfiles';
import type { SingleMatchSession } from '../singleMatch';
import { RandomGenerator } from '../random/RandomGenerator';
import {
  chooseNpcAction,
  chooseRestartAction,
  enumerateRestartActions,
  evaluatePressure,
  resolveMatchAction,
} from './matchActions';
import { clampPitchPoint, distance, type TeamSide } from './matchSpace';
import type { MatchPlayerState, MatchPhase, TacticalMatchState } from './matchState';
import { deriveNeutralFormationAnchor, deriveTacticalTargets } from './tacticalPositioning';
import { applyRestartScenario } from './restartScenarios';

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
import { projectLocomotion } from './locomotion';
import {
  classifyRelativeMovement,
  deriveOrientationTarget,
  integrateFacing,
  movementModeSpeedFactor,
  normalizeAngle,
} from './playerOrientation';
import { integrateBallFlight } from './ballPhysics';
import { projectGoalkeeperIntervention, resolveGoalkeeperContact } from './goalkeeperIntervention';
import { deriveOnBallPreparation } from './onBallPreparation';
import { toPitchPoint } from './matchSpace';
import { resolvePendingPlayerDecision } from './decisionOutcome';
import { resolveReceptionOutcome } from './passReception';
import { deriveCarryExecution } from './carryExecution';
import { createMatchStatistics, observePlayerMatchStats } from './playerMatchStats';

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
  let state = input;
  const ticks = Math.floor((simulatedSeconds + 1e-9) / FIXED_MATCH_DT);
  for (let tick = 0; tick < ticks; tick += 1) state = stepTacticalMatch(state, FIXED_MATCH_DT);
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

const changePossession = (
  state: TacticalMatchState,
  ownerId: string,
  cause: 'tackle' | 'interception' | 'claim' = 'claim',
) => {
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
              finalResult: reception?.kind === 'failed_control' ? 'technical_error' : 'completed',
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
      return resolveMatchAction(ready, state.pendingReceptionIntent.action, 'human_selected');
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
    ballEpisode: 0,
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
    return resolveMatchAction(next, state.pendingReceptionIntent.action, 'human_selected');
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
        : contact.kind === 'defender'
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

const stepTacticalMatchCore = (input: TacticalMatchState, rawDelta = 0.1): TacticalMatchState => {
  input = resolvePendingPlayerDecision(input);
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
  if (!input.periodEndPending && projectPlayerDecisionOpportunity(input)) return input;
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
      state.scenario !== 'open_play' ||
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
      distance(carrier.position, intent.target) <= 0.75
    ) {
      const reason =
        !carrier || state.ball.ownerId !== carrier.id
          ? state.recentDuel?.resolvedAt === state.time
            ? ('contact' as const)
            : ('ball_lost' as const)
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
  if (state.ball.travelKind === 'shot' && state.ball.shot) {
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
  state.players = deriveTacticalTargets(state).map((player) => {
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
    const desiredVelocity = {
      x: (dx / d) * Math.min(maxSpeed, d / dt),
      y: (dy / d) * Math.min(maxSpeed, d / dt),
    };
    const agility = player.profile.attributes.agility / 100;
    const acceleration = (3.2 + agility * 5.5) * dt;
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
    let next = clampPitchPoint({
      x: player.position.x + velocity.x * dt,
      y: player.position.y + velocity.y * dt,
    });
    const close = state.players.filter(
      (p) => p.id !== player.id && distance(p.position, next) < 1.15,
    );
    for (const other of close) {
      const ox = next.x - other.position.x,
        oy = next.y - other.position.y,
        od = Math.max(0.1, Math.hypot(ox, oy));
      next = clampPitchPoint({ x: next.x + (ox / od) * 0.12, y: next.y + (oy / od) * 0.12 });
    }
    const samples = player.samples + 1;
    const travelled = distance(player.position, next);
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
    const wasActualSprint = player.sprintStartedAt !== undefined;
    const aboveSprintEntry = speedRatio >= 0.82;
    const belowSprintExit = speedRatio <= 0.7;
    const sprintRecoveryStartedAt = !belowSprintExit
      ? undefined
      : (player.sprintRecoveryStartedAt ?? state.time);
    const sprintEpisodeEnded =
      sprintRecoveryStartedAt !== undefined && state.time + dt - sprintRecoveryStartedAt >= 0.75;
    const sprintStartedAt =
      aboveSprintEntry || (wasActualSprint && !sprintEpisodeEnded)
        ? (player.sprintStartedAt ?? state.time)
        : sprintEpisodeEnded
          ? undefined
          : player.sprintStartedAt;
    const burstMatured = sprintStartedAt !== undefined && state.time + dt - sprintStartedAt >= 0.35;
    const countBurst = burstMatured && !player.sprintBurstCounted;
    const actualSprinting = burstMatured;
    const distanceKey = (
      {
        walk: 'distanceWalk',
        jog: 'distanceJog',
        run: 'distanceRun',
        sprint: 'distanceSprint',
      } as const
    )[locomotion.intensity];
    return {
      ...player,
      position: next,
      velocity: { x: (next.x - player.position.x) / dt, y: (next.y - player.position.y) / dt },
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
        sprintBursts: previousTelemetry.sprintBursts + (countBurst ? 1 : 0),
        maxSpeed: Math.max(previousTelemetry.maxSpeed, speed),
      },
      ...(sprintStartedAt !== undefined
        ? {
            sprintStartedAt,
            sprintBurstCounted: player.sprintBurstCounted || countBurst,
            ...(sprintRecoveryStartedAt !== undefined ? { sprintRecoveryStartedAt } : {}),
          }
        : { sprintBurstCounted: false }),
      samples,
      meanPosition: {
        x: (player.meanPosition.x * player.samples + next.x) / samples,
        y: (player.meanPosition.y * player.samples + next.y) / samples,
      },
    };
  });
  if (state.goalCompletionUntil !== undefined) {
    const velocity = state.ball.velocity ?? { x: 0, y: 0 };
    state.ball = {
      ...state.ball,
      x: state.ball.x + velocity.x * dt,
      y: state.ball.y + velocity.y * dt,
      velocity: { x: velocity.x * 0.94, y: velocity.y * 0.94 },
    };
  } else if (state.ball.travelKind && state.ball.from && state.ball.target && state.ball.velocity) {
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
    if (!state.ball.shot) {
      const crossing = findPitchBoundaryCrossing(previous, next);
      const contact =
        !integrated.airborne && nextHeight <= 0.2
          ? resolveContinuousGroundPassClaim(state, previous, next)
          : undefined;
      if (contact && (!crossing || contact.segmentFraction < crossing.segmentFraction)) {
        const contactingPlayer = state.players.find((player) => player.id === contact.playerId)!;
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
      if (keeperProjection?.reachable && keeperProjection.reactionRemaining <= dt) {
        candidates.push({
          kind: 'goalkeeper' as const,
          playerId: keeperProjection.keeper.id,
          centre: { ...keeperProjection.keeper.position, z: 1.05 },
          // Locomotion moves the body; this bounded envelope represents body, arms and dive only.
          // Using the movement budget here as well would count the same reach twice.
          radius: 1.15,
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
    if (state.ball.airborne && state.ball.travelKind !== 'shot') {
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
        if (!winner || duel.outcome === 'keeper_punch')
          return makeLoose(
            {
              ...base,
              ball: { ...contactPoint, ...(winner ? { lastTouchPlayerId: winner.id } : {}) },
            },
            { x: state.possessionTeam === 'home' ? -7 : 7, y: 2 },
          );
        const target =
          duel.outcome === 'attacking_header'
            ? { x: winner.team === 'home' ? 105 : 0, y: 34 }
            : duel.outcome === 'clearance_header'
              ? clampPitchPoint({
                  x: contactPoint.x + (winner.team === 'home' ? 20 : -20),
                  y: contactPoint.y + (contactPoint.y < 34 ? 8 : -8),
                })
              : clampPitchPoint({
                  x: contactPoint.x + (winner.team === 'home' ? 9 : -9),
                  y: contactPoint.y,
                });
        return resolveMatchAction(
          { ...base, ball: { ...contactPoint, ownerId: winner.id, lastTouchPlayerId: winner.id } },
          {
            type: 'header',
            actorId: winner.id,
            target,
            intent:
              duel.outcome === 'attacking_header'
                ? 'header_shot'
                : duel.outcome === 'clearance_header'
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
    if (
      state.ball.travelKind !== 'shot' &&
      (distance(state.ball, state.ball.target!) < 0.8 ||
        Math.hypot(integrated.velocity.x, integrated.velocity.y) < 0.25)
    ) {
      if (state.ball.airborne || (state.ball.bounceCount ?? 0) > 0) {
        const physical = findAerialContactCandidates(state, dt);
        if (!physical.length) {
          const velocity = state.ball.velocity ?? { x: 0, y: 0 };
          return makeLoose(
            {
              ...state,
              lastAerialResult: 'loose_ball',
              aerialContestantIds: [],
              ball: { x: state.ball.x, y: state.ball.y },
            },
            { x: velocity.x * 0.42, y: velocity.y * 0.42 },
          );
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
              ...base,
              ball: {
                ...state.ball,
                secondBallPriorityIds: priority,
                ...(duel.winner ? { lastTouchPlayerId: duel.winner.id } : {}),
              },
            },
            { x: state.possessionTeam === 'home' ? -7 : 7, y: 2 },
          );
        if (!duel.winner)
          return makeLoose(
            { ...base, ball: { ...state.ball, secondBallPriorityIds: priority } },
            { x: state.possessionTeam === 'home' ? -7 : 7, y: 2 },
          );
        const winner = duel.winner;
        const target =
          duel.outcome === 'attacking_header'
            ? { x: winner.team === 'home' ? 105 : 0, y: 34 }
            : duel.outcome === 'clearance_header'
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
            ...base,
            ball: { ...winner.position, ownerId: winner.id, lastTouchPlayerId: winner.id },
          },
          {
            type: 'header',
            actorId: winner.id,
            target,
            intent:
              duel.outcome === 'attacking_header'
                ? 'header_shot'
                : duel.outcome === 'clearance_header'
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
        const target = state.ball.target!;
        const from = state.ball.from!;
        const canonicalVelocity = state.ball.velocity ?? {
          x: target.x - from.x,
          y: target.y - from.y,
        };
        state = makeLoose(
          {
            ...state,
            ball: landing,
            ...(state.lastPassDiagnostic && !state.lastPassDiagnostic.finalResult
              ? {
                  lastPassDiagnostic: {
                    ...state.lastPassDiagnostic,
                    actualContactPoint: landing,
                    resolvedAt: state.time,
                    finalResult: 'unclaimed' as const,
                  },
                }
              : {}),
          },
          { x: canonicalVelocity.x * 0.42, y: canonicalVelocity.y * 0.42 },
        );
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
    state.ball = {
      x: owner.position.x + dirX * 1.15,
      y: owner.position.y + dirY * 1.15,
      ownerId: owner.id,
    };
  }
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
            Math.atan2(state.ball.y - challenger.position.y, state.ball.x - challenger.position.x) -
              challenger.facingAngle,
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
    if (challenger && duelDistance < 1.65 && hasChallengeAccess && !sameDuel) {
      const rng = RandomGenerator.fromSeed(
        `${state.seed}:challenge:${state.decisionIndex}:${challenger.id}`,
      );
      const defence =
        (challenger.profile.attributes.tackling +
          challenger.profile.attributes.strength +
          challenger.profile.attributes.positioning +
          challenger.profile.attributes.aggression +
          challenger.profile.attributes.gameReading) /
        500;
      const attack =
        (owner.profile.attributes.dribbling +
          owner.profile.attributes.technique +
          owner.profile.attributes.agility +
          owner.profile.attributes.strength +
          owner.profile.attributes.composure) /
        500;
      const orientationAdvantage = (1 - challengerFacingError / Math.PI) * 0.08;
      const shieldProtection = shielding ? 0.16 : 0;
      const roll =
        rng.float() + (defence - attack) * 0.35 + orientationAdvantage - shieldProtection;
      if (roll > 0.58) {
        state = changePossession(state, challenger.id, 'tackle');
        state.recentDuel = {
          participants: [owner.id, challenger.id].sort() as [string, string],
          winnerId: challenger.id,
          resolvedAt: state.time,
          expiresAt: state.time + 0.8,
          ballEpisode: state.ballEpisode ?? 0,
        };
      } else if (roll > 0.42)
        state = makeLoose(state, { x: (rng.float() - 0.5) * 5, y: (rng.float() - 0.5) * 5 });
    }
  } else {
    state.currentPressure = 0;
    delete state.nearestChallengerId;
  }
  if (
    !state.periodEndPending &&
    state.actionCooldown <= 0 &&
    state.ball.ownerId &&
    state.restart?.phase !== 'setup'
  ) {
    const ownerId = state.ball.ownerId;
    if (!ownerId) return state;
    const awaitsPlayer = Boolean(projectPlayerDecisionOpportunity(state));
    const agencyHandoff =
      state.postActionAgencyCheckpoint?.actorId === state.controlledFootballerId &&
      state.ball.ownerId === state.controlledFootballerId;
    const action = awaitsPlayer || agencyHandoff ? undefined : chooseNpcAction(state, ownerId);
    const controlled = state.ball.ownerId === state.controlledFootballerId;
    // A pending handoff makes every next controlled-player action human-owned. Outside a handoff,
    // controlled open-play shots and crosses remain absolutely human-owned.
    if (action && !(controlled && (action.type === 'shot' || action.type === 'cross')))
      state = resolveMatchAction(
        state,
        action,
        controlled ? 'autonomous_routine' : 'autonomous_npc',
      );
  }
  return state;
};

const hasImmediateResolution = (state: TacticalMatchState) =>
  Boolean(state.ball.travelKind || state.goalCompletionUntil || state.ballCarrierIntent);

const clearTransientPeriodState = (state: TacticalMatchState): TacticalMatchState => {
  const {
    currentAction: _action,
    currentActorId: _actor,
    currentActionSource: _source,
    pendingReceptionIntent: _reception,
    receptionPreparation: _preparation,
    ballCarrierIntent: _carry,
    playerMovementIntent: _movement,
    pendingPlayerDecision: _decision,
    postActionAgencyCheckpoint: _checkpoint,
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
    _decision,
    _checkpoint,
    _restart,
    _pending,
  ];
  return stable;
};

/** Starts the prepared second-half kickoff; canonical directions remain team-relative and stable. */
export const startSecondHalf = (state: TacticalMatchState): TacticalMatchState => {
  if (state.status !== 'half_time') return state;
  const ready = { ...state, status: 'second_half' as const, actionCooldown: 0.4 };
  return applyRestartScenario(ready, 'kick_off', { restartTeam: 'away' });
};

/** Regulation wrapper. Thresholds stop new choices, while committed ball physics finish safely. */
export const stepTacticalMatch = (
  input: TacticalMatchState,
  rawDelta = 0.1,
): TacticalMatchState => {
  const status = input.status ?? (input.time >= 45 * 60 ? 'second_half' : 'first_half');
  if (status === 'full_time' || status === 'half_time') return input;
  const threshold = status === 'first_half' ? 45 * 60 : 90 * 60;
  let prepared = input;
  if (
    input.periodEndPending ||
    input.time + Math.min(0.25, Math.max(0.01, rawDelta)) >= threshold
  ) {
    prepared = { ...input, periodEndPending: true };
    delete prepared.pendingPlayerDecision;
  }
  let next = stepTacticalMatchCore(prepared, rawDelta);
  if (next === input) return input;
  if (!next.status) next = { ...next, status };
  if (next.periodEndPending && !hasImmediateResolution(next)) {
    next = {
      ...clearTransientPeriodState(next),
      time: threshold,
      status: status === 'first_half' ? 'half_time' : 'full_time',
      actionCooldown: 0,
      ball: {
        x: next.ball.x,
        y: next.ball.y,
        ...(next.ball.lastTouchPlayerId ? { lastTouchPlayerId: next.ball.lastTouchPlayerId } : {}),
      },
    };
  }
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
