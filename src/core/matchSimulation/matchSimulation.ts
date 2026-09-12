import { deriveCanonicalCoachProfile } from '../coachProfiles';
import type { SingleMatchSession } from '../singleMatch';
import { RandomGenerator } from '../random/RandomGenerator';
import {
  chooseNpcAction,
  chooseRestartAction,
  evaluatePressure,
  resolveMatchAction,
} from './matchActions';
import { clampPitchPoint, distance, type TeamSide } from './matchSpace';
import type { MatchPlayerState, MatchPhase, TacticalMatchState } from './matchState';
import { deriveNeutralFormationAnchor, deriveTacticalTargets } from './tacticalPositioning';
import { applyRestartScenario } from './restartScenarios';
import {
  goalkeeperIntervention,
  findAerialContactCandidates,
  resolveAerialDuel,
  secondBallPriority,
} from './aerialPlay';
import { findPitchBoundaryCrossing, type PitchBoundaryCrossing } from './pitchBoundary';
import { resolveCanonicalShot } from './shotResolver';
import { resolveGroundPassClaim } from './passClaimResolver';
import {
  deterministicRebound,
  findFirstBallContact,
  GOAL_HEIGHT,
  type BallContact,
  type FlightPoint,
} from './ballFlight';
import { resolveFormationDuty } from '../footballerWorld';
import { deriveLooseBallAssignments, rollLooseBall } from './looseBallPhysics';
import { isOffsideOffence } from './offside';
import { projectPlayerDecisionOpportunity } from './playerDecision';
import { projectLocomotion } from './locomotion';
import { resolvePendingPlayerDecision } from './decisionOutcome';
import { resolveReceptionOutcome } from './passReception';

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
    actionCooldown: 0.4,
    ballOwnershipStartedAt: 0,
    score: { home: 0, away: 0 },
    currentPressure: 0,
    scenario: 'open_play',
    ...(session.setup.control.mode === 'player'
      ? { controlledFootballerId: session.setup.control.footballerId }
      : {}),
  };
  return { ...state, players: deriveTacticalTargets(state) };
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
      ...(reception ? { lastReceptionOutcome: reception } : {}),
      ...(state.lastPassDiagnostic
        ? {
            lastPassDiagnostic: {
              ...state.lastPassDiagnostic,
              actualContactPoint: { x: state.ball.x, y: state.ball.y },
              ...(reception ? { receptionOutcome: reception.kind } : {}),
              finalResult: reception?.kind === 'failed_control' ? 'technical_error' : 'completed',
            },
          }
        : {}),
      ...(state.ball.ownerId !== ownerId ? { ballOwnershipStartedAt: state.time } : {}),
    };
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
    ball: controlledBall,
    ballOwnershipStartedAt: state.time,
    lastPossessionChange: { at: state.time, from: state.possessionTeam, to: owner.team, cause },
    ...(state.lastPassDiagnostic
      ? {
          lastPassDiagnostic: {
            ...state.lastPassDiagnostic,
            actualContactPoint: { x: state.ball.x, y: state.ball.y },
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
): TacticalMatchState => {
  const shot = state.ball.shot!;
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
  if (contact.kind === 'goalkeeper' && shot.goalkeeperAction === 'catch') {
    const keeper = state.players.find((player) => player.id === contact.playerId)!;
    return changePossession(
      {
        ...base,
        lastShotResult: 'save',
        lastShot: { ...shot, outcome: 'save', classification: 'on_target' },
        ball: { ...keeper.position, height: 0 },
      },
      keeper.id,
      'claim',
    );
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

const resolveShot = (state: TacticalMatchState): TacticalMatchState => {
  const action = state.currentAction;
  if (action?.type !== 'shot' && !(action?.type === 'header' && action.intent === 'header_shot'))
    return state;
  const shooter = state.players.find((p) => p.id === action.actorId)!;
  const shot = resolveCanonicalShot(state, action);
  if (shot.outcome === 'goal') {
    const score = { ...state.score, [shooter.team]: state.score[shooter.team] + 1 };
    return applyRestartScenario(
      { ...state, score, lastShotResult: 'goal', lastShot: shot },
      'kick_off',
      { restartTeam: shooter.team === 'home' ? 'away' : 'home' },
    );
  }
  if (shot.outcome === 'miss')
    return applyRestartScenario({ ...state, lastShotResult: 'miss', lastShot: shot }, 'goal_kick', {
      restartTeam: shooter.team === 'home' ? 'away' : 'home',
    });
  const keeper = shot.keeperId && state.players.find((p) => p.id === shot.keeperId);
  if (shot.goalkeeperAction === 'catch' && keeper)
    return changePossession(
      { ...state, lastShotResult: 'save', lastShot: shot, ball: { ...keeper.position } },
      keeper.id,
      'claim',
    );
  const local = state.players
    .filter((p) => p.id !== shooter.id && distance(p.position, shot.goalPoint) < 18)
    .sort((a, b) => distance(a.position, shot.goalPoint) - distance(b.position, shot.goalPoint))
    .slice(0, 6);
  return makeLoose(
    {
      ...state,
      lastShotResult: shot.outcome,
      lastShot: shot,
      ball: {
        ...state.ball,
        x: Math.max(
          0.2,
          Math.min(104.8, shot.goalPoint.x + (shooter.team === 'home' ? -0.2 : 0.2)),
        ),
        y: Math.max(0.2, Math.min(67.8, shot.goalPoint.y)),
        secondBallPriorityIds: secondBallPriority(state, local),
        ...((shot.blockerId ?? shot.keeperId)
          ? { lastTouchPlayerId: (shot.blockerId ?? shot.keeperId)! }
          : {}),
      },
    },
    shot.reboundVelocity ?? { x: shooter.team === 'home' ? -5 : 5, y: 0 },
  );
};

export const stepTacticalMatch = (
  input: TacticalMatchState,
  rawDelta = 0.1,
): TacticalMatchState => {
  input = resolvePendingPlayerDecision(input);
  // A surfaced human decision owns the snapshot: no clock, movement or RNG may advance.
  if (projectPlayerDecisionOpportunity(input)) return input;
  const dt = Math.min(0.25, Math.max(0.01, rawDelta));
  let state = {
    ...input,
    time: input.time + dt,
    timeSincePossessionChanged: input.timeSincePossessionChanged + dt,
    actionCooldown: Math.max(0, input.actionCooldown - dt),
    teams: { ...input.teams },
  };
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
    if (
      !carrier ||
      state.ball.ownerId !== carrier.id ||
      state.time >= state.ballCarrierIntent.expiresAt ||
      distance(carrier.position, state.ballCarrierIntent.target) <= 0.75
    ) {
      const { ballCarrierIntent: _ended, ...withoutIntent } = state;
      void _ended;
      state = {
        ...withoutIntent,
        ...(carrier &&
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
  if (state.restart?.phase === 'setup' && state.time - state.restart.startedAt >= 2.1) {
    const action = chooseRestartAction(state);
    if (action) state = resolveMatchAction(state, action);
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
  if (state.ball.travelDuration && (state.ball.peakHeight ?? 0) > 0) {
    const interceptionPoint = state.ball.target ?? state.ball;
    const choice = goalkeeperIntervention(state, interceptionPoint);
    if (choice.keeper) {
      state.keeperIntervention = {
        keeperId: choice.keeper.id,
        intention: choice.decision,
        target: { ...interceptionPoint },
        distanceToContact: distance(choice.keeper.position, interceptionPoint),
      };
      if (choice.decision !== 'stay')
        state.players = state.players.map((player) =>
          player.id === choice.keeper!.id
            ? { ...player, target: { ...interceptionPoint } }
            : player,
        );
    }
  }
  state.players = deriveTacticalTargets(state).map((player) => {
    if (state.ballCarrierIntent?.actorId === player.id)
      player = { ...player, target: state.ballCarrierIntent.target };
    if (state.playerMovementIntent?.actorId === player.id)
      player = { ...player, target: state.playerMovementIntent.target };
    if (
      state.receptionPreparation?.actorId === player.id &&
      state.time >= state.receptionPreparation.awarenessAt
    )
      player = { ...player, target: state.receptionPreparation.expectedContactPoint };
    if (state.restart?.phase === 'setup') return { ...player, velocity: { x: 0, y: 0 } };
    if (
      state.keeperIntervention?.keeperId === player.id &&
      state.keeperIntervention.intention !== 'stay'
    )
      player = { ...player, target: { ...state.keeperIntervention.target } };
    const dx = player.target.x - player.position.x,
      dy = player.target.y - player.position.y,
      d = Math.max(0.001, Math.hypot(dx, dy));
    const locomotion = projectLocomotion(state, player, player.target);
    const maxSpeed = locomotion.targetSpeed;
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
    const sprintStartedAt =
      locomotion.intensity === 'sprint' ? (player.sprintStartedAt ?? state.time) : undefined;
    const burstMatured = sprintStartedAt !== undefined && state.time + dt - sprintStartedAt >= 0.5;
    const countBurst = burstMatured && !player.sprintBurstCounted;
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
      locomotionIntensity: locomotion.intensity,
      locomotionReason: locomotion.reason,
      targetSpeed: locomotion.targetSpeed,
      locomotionTelemetry: {
        ...previousTelemetry,
        distanceTotal: previousTelemetry.distanceTotal + travelled,
        [distanceKey]: (previousTelemetry[distanceKey] ?? 0) + travelled,
        sprintSeconds:
          previousTelemetry.sprintSeconds + (locomotion.intensity === 'sprint' ? dt : 0),
        sprintBursts: previousTelemetry.sprintBursts + (countBurst ? 1 : 0),
        maxSpeed: Math.max(previousTelemetry.maxSpeed, speed),
      },
      ...(sprintStartedAt !== undefined
        ? { sprintStartedAt, sprintBurstCounted: player.sprintBurstCounted || countBurst }
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
  } else if (state.ball.travelDuration && state.ball.from && state.ball.target) {
    const previous: FlightPoint = {
      x: state.ball.x,
      y: state.ball.y,
      z: state.ball.height ?? 0,
    };
    const elapsed = (state.ball.travelElapsed ?? 0) + dt,
      t = Math.min(1, elapsed / state.ball.travelDuration);
    const nextHeight =
      (state.ball.targetHeight ?? 0) * t + (state.ball.peakHeight ?? 0) * 4 * t * (1 - t);
    const next: FlightPoint = {
      x: state.ball.from.x + (state.ball.target.x - state.ball.from.x) * t,
      y: state.ball.from.y + (state.ball.target.y - state.ball.from.y) * t,
      z: nextHeight,
    };
    if (!state.ball.shot) {
      const crossing = findPitchBoundaryCrossing(previous, next);
      if (crossing) return applyBoundaryRestart(state, crossing, previous);
    }
    state.ball = {
      ...state.ball,
      x: next.x,
      y: next.y,
      travelElapsed: elapsed,
      flightProgress: t,
      height: nextHeight,
      airborne: (state.ball.peakHeight ?? 0) > 0 && t < 1,
      velocity: {
        x: (state.ball.target.x - state.ball.from.x) / state.ball.travelDuration,
        y: (state.ball.target.y - state.ball.from.y) / state.ball.travelDuration,
      },
    };
    if (state.ball.shot) {
      const shot = state.ball.shot;
      const shooter = state.players.find((player) => player.id === shot.shooterId)!;
      const candidates = [];
      if (shot.blockerId) {
        const defender = state.players.find((player) => player.id === shot.blockerId);
        if (defender)
          candidates.push({
            kind: 'defender' as const,
            playerId: defender.id,
            centre: { ...defender.position, z: 0.9 },
            radius: 0.72,
          });
      }
      if (
        shot.keeperId &&
        (shot.goalkeeperAction === 'catch' ||
          shot.goalkeeperAction === 'parry' ||
          shot.goalkeeperAction === 'parry_away')
      ) {
        const keeper = state.players.find((player) => player.id === shot.keeperId);
        if (keeper && state.ball.from && state.ball.target) {
          const denominator = state.ball.target.x - state.ball.from.x;
          const keeperT =
            denominator === 0 ? 1 : (keeper.position.x - state.ball.from.x) / denominator;
          const interventionT = Math.max(0, Math.min(1, keeperT));
          candidates.push({
            kind: 'goalkeeper' as const,
            playerId: keeper.id,
            centre: {
              x: state.ball.from.x + denominator * interventionT,
              y: state.ball.from.y + (state.ball.target.y - state.ball.from.y) * interventionT,
              z:
                (state.ball.targetHeight ?? 0) * interventionT +
                (state.ball.peakHeight ?? 0) * 4 * interventionT * (1 - interventionT),
            },
            radius: 0.62,
          });
        }
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
              : shot.goalkeeperAction === 'catch'
                ? 0
                : Math.hypot(rebound.x, rebound.y),
        };
        return finishShotContact(state, contact, incoming);
      }
    }
    if ((state.ball.peakHeight ?? 0) > 0 && state.ball.travelKind !== 'shot') {
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
    if (!state.ball.peakHeight && state.ball.travelKind !== 'shot') {
      const passer = state.players.find((p) => p.id === state.currentActorId);
      const candidate =
        passer &&
        state.players
          .filter(
            (p) =>
              p.team !== passer.team &&
              p.profile.primaryPosition !== 'goalkeeper' &&
              distance(p.position, state.ball) < 2.2,
          )
          .sort((a, b) => distance(a.position, state.ball) - distance(b.position, state.ball))[0];
      if (candidate && (state.ball.travelElapsed ?? 0) < (state.ball.travelDuration ?? 0)) {
        const rng = RandomGenerator.fromSeed(
          `${state.seed}:flight:${state.decisionIndex}:${Math.floor(elapsed * 10)}:${candidate.id}`,
        );
        const reading =
          (candidate.profile.attributes.gameReading +
            candidate.profile.attributes.positioning +
            candidate.profile.attributes.pace) /
          300;
        if (rng.bool(0.12 + reading * 0.42))
          return changePossession(
            { ...state, ball: { ...candidate.position } },
            candidate.id,
            'interception',
          );
      }
    }
    if (t >= 1) {
      if (
        state.ball.travelKind === 'shot' ||
        (state.ball.travelKind === 'header' &&
          state.currentAction?.type === 'header' &&
          state.currentAction.intent === 'header_shot')
      )
        return resolveShot(state);
      if ((state.ball.peakHeight ?? 0) > 0) {
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
        const duration = state.ball.travelDuration!;
        const canonicalVelocity = state.ball.velocity ?? {
          x: (target.x - from.x) / duration,
          y: (target.y - from.y) / duration,
        };
        state = makeLoose(
          {
            ...state,
            ball: landing,
            ...(state.lastPassDiagnostic
              ? {
                  lastPassDiagnostic: {
                    ...state.lastPassDiagnostic,
                    actualContactPoint: landing,
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
  if (state.ball.ownerId && !state.ball.travelDuration && state.restart?.phase !== 'setup') {
    const owner = state.players.find((p) => p.id === state.ball.ownerId)!;
    const evaluated = evaluatePressure(state, owner);
    state.currentPressure = evaluated.value;
    if (evaluated.nearestChallengerId) state.nearestChallengerId = evaluated.nearestChallengerId;
    else delete state.nearestChallengerId;
    const challenger = state.players.find((p) => p.id === evaluated.nearestChallengerId);
    if (challenger && distance(challenger.position, owner.position) < 1.65) {
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
      const roll = rng.float() + (defence - attack) * 0.35;
      if (roll > 0.58) state = changePossession(state, challenger.id, 'tackle');
      else if (roll > 0.42)
        state = makeLoose(state, { x: (rng.float() - 0.5) * 5, y: (rng.float() - 0.5) * 5 });
    }
  } else {
    state.currentPressure = 0;
    delete state.nearestChallengerId;
  }
  if (state.actionCooldown <= 0 && state.ball.ownerId && state.restart?.phase !== 'setup') {
    const awaitsPlayer = Boolean(projectPlayerDecisionOpportunity(state));
    const action = awaitsPlayer ? undefined : chooseNpcAction(state, state.ball.ownerId);
    const controlled = state.ball.ownerId === state.controlledFootballerId;
    // A controlled open-play shot/cross is absolutely human-owned, including immediately after a
    // carry. Routine autoplay may continue only with a low-impact action.
    if (action && !(controlled && (action.type === 'shot' || action.type === 'cross')))
      state = resolveMatchAction(
        state,
        action,
        controlled ? 'autonomous_routine' : 'autonomous_npc',
      );
  }
  return state;
};

export const matchStateToFrame = (state: TacticalMatchState) => ({
  timestampMs: state.time * 1000,
  players: state.players.map((p) => {
    const facingVector =
      Math.hypot(p.velocity.x, p.velocity.y) > 0.2
        ? p.velocity
        : { x: p.target.x - p.position.x, y: p.target.y - p.position.y };
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
      facing: Math.atan2(facingVector.x, facingVector.y),
    };
  }),
  ball: {
    x: state.ball.x,
    y: state.ball.y,
    height: state.ball.height ?? 0,
    ownerId: state.ball.ownerId,
  },
});
