import { isMatchGoalkeeper } from './matchGoalkeeper';
import { RandomGenerator } from '../random/RandomGenerator';
import type { MatchAction, TacticalMatchState } from './matchState';
import { clampPitchPoint, distance, type PitchPoint } from './matchSpace';
import { deriveRestartGeometry, deriveRestartMovementTargets } from './restartGeometry';
import { deriveRestartLegalReadiness, legalizeRestartPlayerTarget } from './restartLaws';
import { isLiveRestartSetup } from './restartPhase';
import { isHumanControlled } from './actionAgency';
import { integrateBallFlight } from './ballPhysics';
import { markStoppageReady } from './stoppageLedger';
import { shotPreparationSeconds } from './shotIntent';
import { resolveDeadBallPerimeter } from './deadBallEnclosure';
import { canExecuteCanonicalShot } from './shootingOptions';

/** Context may change while bodies assemble; an obsolete selection cannot reserve the clock. */
export const isRestartSelectionAvailable = (state: TacticalMatchState) => {
  const restart = state.restart,
    action = restart?.selectedAction;
  if (!restart || !action) return true;
  const available = (id: string) =>
    state.players.some((player) => player.id === id && !state.discipline?.[id]?.sentOff);
  if (!available(action.actorId) || action.actorId !== restart.takerId) return false;
  if (action.type === 'pass' && !available(action.receiverId)) return false;
  if (action.type === 'cross' && action.intendedTargetId && !available(action.intendedTargetId))
    return false;
  if (action.type !== 'shot') return true;
  const spot = restart.spot ?? state.ball;
  const projected: TacticalMatchState = {
    ...state,
    players: state.players.map((player) =>
      player.id === action.actorId ? { ...player, position: spot } : player,
    ),
    ball: {
      ...state.ball,
      ...spot,
      ownerId: action.actorId,
      height: 0,
      velocity: { x: 0, y: 0, z: 0 },
    },
  };
  return canExecuteCanonicalShot(projected, action);
};

const invalidateObsoleteRestartSelection = (state: TacticalMatchState): TacticalMatchState => {
  const restart = state.restart;
  if (!restart || !restart.selectedAction || isRestartSelectionAvailable(state)) return state;
  const {
    selectedAction: _action,
    selectedSource: _source,
    selectedAt: _at,
    preparationStartedAt: _preparation,
    executing: _executing,
    readiness: _readiness,
    ...unselected
  } = restart;
  void [_action, _source, _at, _preparation, _executing, _readiness];
  const geometry = deriveRestartGeometry(
    state,
    state.scenario,
    restart.restartTeam,
    restart.spot ?? state.ball,
    { takerId: restart.takerId },
  );
  const next: TacticalMatchState = {
    ...state,
    restart: {
      ...unselected,
      phase: 'preparing',
      ceremonial: state.scenario === 'penalty' || state.scenario === 'kick_off',
      targets: geometry.targets,
      roles: geometry.roles,
    },
  };
  delete next.pendingPlayerDecision;
  return next;
};

export const replaceUnavailableRestartTaker = (state: TacticalMatchState): TacticalMatchState => {
  const restart = state.restart;
  if (
    !restart ||
    state.players.some((p) => p.id === restart.takerId && !state.discipline?.[p.id]?.sentOff)
  )
    return state;
  const candidates = state.players.filter(
    (p) => p.team === restart.restartTeam && !state.discipline?.[p.id]?.sentOff,
  );
  const keeperRestart = state.scenario === 'goal_kick' || state.scenario === 'gk_short';
  const spot = restart.spot ?? state.ball;
  candidates.sort(
    (a, b) =>
      (keeperRestart ? Number(isMatchGoalkeeper(b)) - Number(isMatchGoalkeeper(a)) : 0) ||
      b.profile.attributes.setPieces - a.profile.attributes.setPieces ||
      distance(a.position, spot) - distance(b.position, spot) ||
      a.id.localeCompare(b.id),
  );
  const taker = candidates[0];
  if (!taker) return state;
  const geometry = deriveRestartGeometry(state, state.scenario, restart.restartTeam, spot, {
    takerId: taker.id,
  });
  const {
    selectedAction: _action,
    selectedSource: _source,
    selectedAt: _at,
    preparationStartedAt: _preparation,
    executing: _execute,
    ...unselected
  } = restart;
  void [_action, _source, _at, _preparation, _execute];
  const next = {
    ...state,
    restart: {
      ...unselected,
      phase: restart.origin === 'live_event' ? ('preparing' as const) : ('setup' as const),
      takerId: taker.id,
      targets: geometry.targets,
      roles: geometry.roles,
    },
    ...(state.lastRestartAward
      ? { lastRestartAward: { ...state.lastRestartAward, takerId: taker.id } }
      : {}),
  };
  delete next.pendingPlayerDecision;
  delete next.shotAgencyRequest;
  return next;
};

/** Select once, without invoking a physical kick or drawing execution RNG. */
export const selectRestartAction = (
  state: TacticalMatchState,
  action: MatchAction,
  source: NonNullable<TacticalMatchState['restart']>['selectedSource'],
): TacticalMatchState => {
  const restart = state.restart;
  if (!restart || restart.selectedAction || action.actorId !== restart.takerId) return state;
  const spot = restart.spot ?? state.ball;
  const geometry = deriveRestartGeometry(state, state.scenario, restart.restartTeam, spot, {
    takerId: restart.takerId,
    selectedAction: action,
  });
  return {
    ...state,
    restart: {
      ...restart,
      phase: 'kick_preparation',
      selectedAction: action,
      selectedSource: source,
      selectedAt: state.time,
      ceremonial: action.type === 'shot' || action.type === 'cross' || restart.ceremonial,
      targets: geometry.targets,
      roles: geometry.roles,
      ...(geometry.landingZone ? { landingZone: geometry.landingZone } : {}),
    },
  };
};

export const prepareRestartMovement = (input: TacticalMatchState): TacticalMatchState => {
  let state = invalidateObsoleteRestartSelection(replaceUnavailableRestartTaker(input));
  const restart = state.restart;
  if (!restart || !isLiveRestartSetup(state)) return state;
  if (
    !restart.retrieval ||
    !state.players.some(
      (p) => p.id === restart.retrieval!.playerId && !state.discipline?.[p.id]?.sentOff,
    )
  ) {
    const retriever = state.players
      .filter((p) => p.team === restart.restartTeam && !state.discipline?.[p.id]?.sentOff)
      .sort(
        (a, b) =>
          distance(a.position, state.ball) - distance(b.position, state.ball) ||
          a.id.localeCompare(b.id),
      )[0];
    if (!retriever) return state;
    state = {
      ...state,
      restart: { ...restart, retrieval: { playerId: retriever.id, stage: 'approach' } },
    };
  }
  const current = state.restart!;
  const targets = deriveRestartMovementTargets(state);
  const retrieval = current.retrieval!;
  const spot = current.spot ?? state.ball;
  const retrievalTarget: PitchPoint =
    retrieval.stage === 'approach'
      ? state.ball
      : {
          x: spot.x - (retrieval.attachedOffset?.x ?? 0),
          y: spot.y - (retrieval.attachedOffset?.y ?? 0),
        };
  return {
    ...state,
    players: state.players.map((player) => {
      // Leave a real placement corridor. Body separation otherwise keeps a different taker
      // pushing the carrier away from the spot forever, even though both targets are legal.
      const stagingTaker =
        retrieval.stage !== 'placed' &&
        retrieval.playerId !== current.takerId &&
        player.id === current.takerId;
      const proposed = stagingTaker
        ? clampPitchPoint({
            x: spot.x - (current.restartTeam === 'home' ? 1 : -1) * 2.5,
            y: spot.y,
          })
        : (targets[player.id] ?? current.targets[player.id] ?? player.target);
      const target =
        retrieval.stage !== 'placed' && player.id === retrieval.playerId
          ? retrievalTarget
          : stagingTaker
            ? proposed
            : legalizeRestartPlayerTarget(state, player, proposed);
      return {
        ...player,
        target: { x: target.x, y: target.y },
        idealTarget: { x: target.x, y: target.y },
      };
    }),
  };
};

/** Physical retrieval/transport uses the displacement of a real body, never a centre-spot snap. */
export const advanceRestartPlacement = (
  state: TacticalMatchState,
  dt: number,
): TacticalMatchState => {
  state = invalidateObsoleteRestartSelection(state);
  const restart = state.restart;
  if (!restart || !isLiveRestartSetup(state) || !restart.retrieval) return state;
  const retrieval = restart.retrieval;
  const retriever = state.players.find((p) => p.id === retrieval.playerId);
  const spot = restart.spot ?? state.ball;
  if (!retriever) return state;
  let next = state;
  if (retrieval.stage === 'approach') {
    const integrated = resolveDeadBallPerimeter(
      integrateBallFlight(
        {
          position: { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? 0 },
          velocity: {
            x: state.ball.velocity?.x ?? 0,
            y: state.ball.velocity?.y ?? 0,
            z: state.ball.velocity?.z ?? 0,
          },
          airborne: state.ball.airborne ?? false,
          bounceCount: state.ball.bounceCount ?? 0,
          ...(state.ball.spin ? { spin: state.ball.spin } : {}),
        },
        dt,
      ),
    );
    next = {
      ...state,
      ball: {
        ...state.ball,
        x: integrated.position.x,
        y: integrated.position.y,
        height: integrated.position.z,
        velocity: integrated.velocity,
        airborne: integrated.airborne,
        bounceCount: integrated.bounceCount,
        ...(integrated.spin ? { spin: integrated.spin } : {}),
      },
    };
    if (
      distance(retriever.position, next.ball) <= 1.1 &&
      (next.ball.height ?? 0) <= 1.6 &&
      Math.hypot(integrated.velocity.x, integrated.velocity.y) <= 3
    ) {
      next = {
        ...next,
        restart: {
          ...restart,
          retrieval: {
            ...retrieval,
            stage: 'transport',
            attachedOffset: {
              x: next.ball.x - retriever.position.x,
              y: next.ball.y - retriever.position.y,
            },
          },
        },
      };
    }
  } else if (retrieval.stage === 'transport') {
    const x = retriever.position.x + (retrieval.attachedOffset?.x ?? 0);
    const y = retriever.position.y + (retrieval.attachedOffset?.y ?? 0);
    const nearSpot = distance({ x, y }, spot) <= 0.35;
    const height = Math.max(0, Math.min(0.9, (state.ball.height ?? 0) + (nearSpot ? -1 : 1) * dt));
    next = {
      ...state,
      ball: {
        ...state.ball,
        x,
        y,
        height,
        airborne: false,
        velocity: { ...retriever.velocity, z: 0 },
      },
    };
    if (
      distance(next.ball, spot) <= 0.15 &&
      height <= 0.1 &&
      Math.hypot(retriever.velocity.x, retriever.velocity.y) <= 0.15
    )
      next = {
        ...next,
        ball: { ...next.ball, velocity: { x: 0, y: 0, z: 0 } },
        restart: { ...restart, retrieval: { ...retrieval, stage: 'placed' } },
      };
  }
  const legal = deriveRestartLegalReadiness(next);
  const action = next.restart!.selectedAction;
  const receivingId = action?.type === 'cross' ? action.intendedTargetId : undefined;
  const receiver = receivingId && next.players.find((p) => p.id === receivingId);
  const tacticalReady =
    !receiver ||
    !action ||
    !('target' in action) ||
    distance(receiver.position, action.target) <= 9;
  const blockers = [...legal.blockers, ...(!tacticalReady ? ['delivery_receiver_developing'] : [])];
  let phase = next.restart!.phase;
  if (
    !action &&
    legal.ready &&
    isHumanControlled(next, next.restart!.takerId) &&
    next.scenario !== 'throw_in'
  )
    phase = 'awaiting_decision';
  next = {
    ...next,
    restart: {
      ...next.restart!,
      phase,
      readiness: {
        ballReady: legal.ballReady,
        takerReady: legal.takerReady,
        legalReady: legal.ready,
        tacticalReady,
        blockers,
      },
      preparationStartedAt:
        action && legal.ready && tacticalReady
          ? (next.restart!.preparationStartedAt ?? next.time)
          : undefined,
      ...(blockers.length
        ? { blockedSince: next.restart!.blockedSince ?? next.time }
        : { blockedSince: undefined }),
    },
  };
  return markStoppageReady(next, legal.ballReady, legal.ready);
};

export const canExecutePreparedRestart = (state: TacticalMatchState) => {
  const restart = state.restart,
    action = restart?.selectedAction;
  if (
    !restart ||
    !action ||
    !restart.readiness?.legalReady ||
    !restart.readiness.tacticalReady ||
    !isRestartSelectionAvailable(state) ||
    !deriveRestartLegalReadiness(state).ready ||
    state.periodEndPending ||
    state.status === 'full_time' ||
    state.status === 'half_time' ||
    state.status === 'abandoned'
  )
    return false;
  const preparation =
    action.type === 'shot' ? shotPreparationSeconds(action.intent, 'settled') : 0.15;
  return (
    state.time -
      (restart.preparationStartedAt ??
        (restart.origin === 'live_event' ? state.time : (restart.selectedAt ?? state.time))) >=
    preparation
  );
};

export const advanceRestartWallResponses = (state: TacticalMatchState): TacticalMatchState => {
  const restart = state.restart;
  if (!restart || restart.phase !== 'release' || !state.ball.shot) return state;
  return {
    ...state,
    players: state.players.map((player) => {
      if (!restart.roles[player.id]?.key.includes('wall')) return player;
      let response = player.restartWallResponse;
      if (!response || response.awardId !== (restart.awardId ?? `${restart.startedAt}`)) {
        const rng = RandomGenerator.fromSeed(`${state.seed}:wall:${restart.awardId}:${player.id}`);
        const anticipation =
          (player.profile.attributes.gameReading + player.profile.attributes.positioning) / 200;
        const jump = rng.float() < 0.35 + anticipation * 0.4;
        response = {
          awardId: restart.awardId ?? `${restart.startedAt}`,
          choice: jump ? 'jump' : 'hold',
          startedAt: state.time,
          reactionAt:
            (restart.executedAt ?? state.time) + 0.11 + rng.float() * (0.32 - anticipation * 0.12),
          jumpHeight: 0,
          previousJumpHeight: 0,
        };
      }
      const t = state.time - response.reactionAt;
      const height =
        response.choice === 'jump' && t >= 0 && t <= 0.65
          ? Math.sin((t / 0.65) * Math.PI) *
            (0.25 + (player.profile.attributes.jumping / 100) * 0.35)
          : 0;
      return {
        ...player,
        restartWallResponse: {
          ...response,
          previousJumpHeight: response.jumpHeight,
          jumpHeight: height,
        },
      };
    }),
  };
};
