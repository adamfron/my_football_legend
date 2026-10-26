import { isMatchGoalkeeper } from './matchGoalkeeper';
import { RandomGenerator } from '../random/RandomGenerator';
import type { MatchAction, TacticalMatchState } from './matchState';
import { attacksRight, clampPitchPoint, distance, type PitchPoint } from './matchSpace';
import {
  deriveRestartGeometry,
  deriveRestartMovementTargets,
  reconcileRestartWallTargets,
} from './restartGeometry';
import {
  deriveRestartLegalReadiness,
  legalizeRestartPlayerTarget,
  areKickoffGoalkeepersReady,
} from './restartLaws';
import { isLiveRestartSetup, isRestartSetup } from './restartPhase';
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
  // Released physics owns the episode. Menu eligibility only describes an unexecuted choice.
  if (!restart || !action || restart.phase === 'release' || restart.executedAt !== undefined)
    return true;
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
  if (
    !restart ||
    !isRestartSetup(state) ||
    !restart.selectedAction ||
    isRestartSelectionAvailable(state)
  )
    return state;
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
      ceremonial: restart.ceremonial,
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
    !isRestartSetup(state) ||
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
  const preserveWall =
    state.scenario.startsWith('free_kick') &&
    (restart.ceremonial === false ||
      restart.humanPreparation === 'ready' ||
      (restart.ceremonial && action.type === 'shot'));
  const geometry = preserveWall
    ? restart
    : deriveRestartGeometry(state, state.scenario, restart.restartTeam, spot, {
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
      ceremonial: restart.ceremonial,
      targets: geometry.targets,
      roles: geometry.roles,
      ...(geometry.landingZone ? { landingZone: geometry.landingZone } : {}),
    },
  };
};

/** Human chooses preparation, not an action. Time resumes until bodies actually arrive. */
export const requestHumanFreeKickPreparation = (state: TacticalMatchState): TacticalMatchState => {
  const restart = state.restart;
  if (
    !restart ||
    !isRestartSetup(state) ||
    !state.scenario.startsWith('free_kick') ||
    !isHumanControlled(state, restart.takerId) ||
    restart.selectedAction ||
    restart.humanPreparation
  )
    return state;
  const next: TacticalMatchState = {
    ...state,
    restart: {
      ...restart,
      origin: 'live_event',
      phase: 'preparing',
      ceremonial: true,
      humanPreparation: 'waiting_team',
      authorisedAt: undefined,
      readiness: {
        ballReady: false,
        takerReady: false,
        legalReady: false,
        tacticalReady: false,
        blockers: ['teammates_moving_to_positions'],
      },
      ...(deriveRestartLegalReadiness(state).ballReady
        ? { retrieval: { playerId: restart.takerId, stage: 'placed' } }
        : {}),
    },
  };
  delete next.pendingPlayerDecision;
  delete next.playerDecisionGate;
  delete next.shotAgencyRequest;
  return next;
};

/** Explicit human recovery from slow/blocked preparation. Referee restrictions remain. */
export const chooseCurrentFreeKickPositions = (state: TacticalMatchState): TacticalMatchState => {
  const r = state.restart;
  if (
    !r ||
    r.humanPreparation !== 'waiting_team' ||
    !isHumanControlled(state, r.takerId) ||
    !deriveRestartLegalReadiness(state).ready
  )
    return state;
  const next: TacticalMatchState = {
    ...state,
    restart: {
      ...r,
      humanPreparation: 'available_now',
      phase: 'awaiting_decision',
      readiness: {
        ballReady: true,
        takerReady: true,
        legalReady: true,
        tacticalReady: true,
        blockers: [],
      },
    },
  };
  delete next.playerDecisionGate;
  return next;
};

export const prepareRestartMovement = (input: TacticalMatchState): TacticalMatchState => {
  let state = reconcileRestartWallTargets(
    invalidateObsoleteRestartSelection(replaceUnavailableRestartTaker(input)),
  );
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
      .filter(
        (p) =>
          state.experimentalRestartPreparation !== true ||
          state.scenario !== 'throw_in' ||
          p.id === restart.takerId,
      )
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
    retrieval.stage === 'handoff' || retrieval.stage === 'transfer'
      ? state.players.find((p) => p.id === retrieval.playerId)!.position
      : retrieval.stage === 'approach'
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
      let proposed = stagingTaker
        ? clampPitchPoint({
            x: spot.x - (attacksRight(current.restartTeam, state) ? 1 : -1) * 2.5,
            y: spot.y,
          })
        : (targets[player.id] ?? current.targets[player.id] ?? player.target);
      // Every teammate must leave room for the transporting body, not only the taker.
      // A short-option receiver can otherwise occupy the placement endpoint and keep
      // the retriever moving indefinitely through physical body separation.
      if (
        retrieval.stage !== 'placed' &&
        player.id !== retrieval.playerId &&
        player.team === current.restartTeam &&
        (distance(proposed, retrievalTarget) < 2.5 ||
          distance(player.position, retrievalTarget) < 2.5)
      ) {
        const dx = proposed.x - retrievalTarget.x;
        const dy = proposed.y - retrievalTarget.y;
        const length = Math.hypot(dx, dy);
        proposed = clampPitchPoint({
          x: retrievalTarget.x + (length > 0.2 ? dx / length : 0) * 3,
          y: retrievalTarget.y + (length > 0.2 ? dy / length : spot.y < 34 ? 1 : -1) * 3,
        });
        // Clamping an outward staging direction at a goal/touch line can put the
        // teammate back inside the body corridor. Choose a reachable inward target.
        if (distance(proposed, retrievalTarget) < 2.5)
          proposed = clampPitchPoint({
            x: retrievalTarget.x + (retrievalTarget.x <= 52.5 ? 1 : -1) * 3,
            y: retrievalTarget.y,
          });
      }
      const target =
        (retrieval.stage === 'handoff' || retrieval.stage === 'transfer') &&
        player.id === retrieval.recipientId
          ? retrieval.handoffPoint!
          : retrieval.stage !== 'placed' && player.id === retrieval.playerId
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
    const preparingThrow =
      state.experimentalRestartPreparation === true && state.scenario === 'throw_in';
    // Dead-ball handling already follows a real retriever. A throw also needs the
    // ball lifted from its observed height to the existing 1.9m release envelope.
    // This finite 1.6m/s hand lift is an engineering assumption, not a target delay.
    const height = preparingThrow
      ? Math.min(1.9, (state.ball.height ?? 0) + 1.6 * dt)
      : Math.max(0, Math.min(0.9, (state.ball.height ?? 0) + (nearSpot ? -1 : 1) * dt));
    next = {
      ...state,
      ball: {
        ...state.ball,
        x,
        y,
        height,
        airborne: false,
        velocity: {
          ...retriever.velocity,
          z: preparingThrow ? (height - (state.ball.height ?? 0)) / dt : 0,
        },
      },
    };
    // A keeper can fetch the scored ball, but an outfielder owns a long return to midfield.
    // Plan a short, visible dead-ball handoff; the keeper stops at the retrieval point.
    if (
      state.scenario === 'kick_off' &&
      isMatchGoalkeeper(retriever) &&
      distance(next.ball, spot) > 20
    ) {
      const direction = spot.x >= next.ball.x ? 1 : -1;
      const handoffPoint = clampPitchPoint({ x: next.ball.x + direction * 6, y: next.ball.y });
      const recipient = state.players
        .filter(
          (p) =>
            p.team === retriever.team &&
            !isMatchGoalkeeper(p) &&
            !state.discipline?.[p.id]?.sentOff,
        )
        .sort(
          (a, b) =>
            distance(a.position, handoffPoint) - distance(b.position, handoffPoint) ||
            a.id.localeCompare(b.id),
        )[0];
      if (recipient)
        return {
          ...next,
          restart: {
            ...restart,
            retrieval: { ...retrieval, stage: 'handoff', recipientId: recipient.id, handoffPoint },
          },
        };
    }
    if (
      distance(next.ball, spot) <= 0.15 &&
      (preparingThrow ? height >= 1.9 : height <= 0.1) &&
      Math.hypot(retriever.velocity.x, retriever.velocity.y) <= 0.15
    )
      next = {
        ...next,
        ball: { ...next.ball, velocity: { x: 0, y: 0, z: 0 } },
        restart: { ...restart, retrieval: { ...retrieval, stage: 'placed' } },
      };
  } else if (retrieval.stage === 'handoff' || retrieval.stage === 'transfer') {
    const recipient = state.players.find(
      (p) => p.id === retrieval.recipientId && !state.discipline?.[p.id]?.sentOff,
    );
    if (!recipient || !retrieval.handoffPoint) {
      // A substituted/dismissed recipient invalidates preparation, never the canonical ball.
      return {
        ...state,
        restart: { ...restart, retrieval: { playerId: retriever.id, stage: 'approach' } },
      };
    }
    if (retrieval.stage === 'handoff') {
      next = { ...state, ball: { ...state.ball, velocity: { x: 0, y: 0, z: 0 }, airborne: false } };
      if (
        distance(recipient.position, retrieval.handoffPoint) <= 0.4 &&
        Math.hypot(recipient.velocity.x, recipient.velocity.y) <= 0.5
      ) {
        const length = distance(state.ball, retrieval.handoffPoint);
        next = {
          ...next,
          restart: {
            ...restart,
            retrieval: {
              ...retrieval,
              stage: 'transfer',
              transfer: {
                method: length <= 1.5 ? 'hand' : 'roll',
                from: { x: state.ball.x, y: state.ball.y },
                to: { ...retrieval.handoffPoint },
                fromHeight: state.ball.height ?? 0,
                elapsed: 0,
                duration: Math.max(0.3, length / 4),
              },
            },
          },
        };
      }
    } else if (retrieval.transfer) {
      // Explicit stoppage logistics path at 4 m/s. No competitive action, possession, touch,
      // duel or RNG draw exists on this path; the normal match ball moves every physical tick.
      const transfer = retrieval.transfer;
      const elapsed = Math.min(transfer.duration, transfer.elapsed + dt);
      const progress = elapsed / transfer.duration;
      const x = transfer.from.x + (transfer.to.x - transfer.from.x) * progress;
      const y = transfer.from.y + (transfer.to.y - transfer.from.y) * progress;
      const height = transfer.fromHeight + (0.12 - transfer.fromHeight) * Math.min(1, progress * 4);
      next = {
        ...state,
        ball: {
          ...state.ball,
          x,
          y,
          height,
          airborne: false,
          velocity: {
            x: (transfer.to.x - transfer.from.x) / transfer.duration,
            y: (transfer.to.y - transfer.from.y) / transfer.duration,
            z: 0,
          },
        },
        restart: { ...restart, retrieval: { ...retrieval, transfer: { ...transfer, elapsed } } },
      };
      if (elapsed >= transfer.duration) {
        next = { ...next, ball: { ...next.ball, velocity: { x: 0, y: 0, z: 0 } } };
        if (distance(recipient.position, next.ball) <= 1.1)
          next = {
            ...next,
            restart: {
              ...restart,
              retrieval: {
                playerId: recipient.id,
                stage: 'transport',
                attachedOffset: {
                  x: next.ball.x - recipient.position.x,
                  y: next.ball.y - recipient.position.y,
                },
              },
            },
          };
      }
    }
  }
  const legal = deriveRestartLegalReadiness(next);
  const action = next.restart!.selectedAction;
  const receivingId = action?.type === 'cross' ? action.intendedTargetId : undefined;
  const receiver = receivingId && next.players.find((p) => p.id === receivingId);
  const receiverReady =
    !receiver ||
    !action ||
    !('target' in action) ||
    distance(receiver.position, action.target) <= 9;
  const keepersReady = areKickoffGoalkeepersReady(next);
  const needsTeam =
    next.restart!.humanPreparation === 'waiting_team' ||
    (next.restart!.ceremonial &&
      isHumanControlled(next, next.restart!.takerId) &&
      !next.restart!.humanPreparation);
  const teamReady =
    !needsTeam ||
    next.players.every(
      (p) =>
        p.team !== next.restart!.restartTeam ||
        p.id === next.restart!.takerId ||
        next.discipline?.[p.id]?.sentOff ||
        (distance(p.position, p.target) <= 2 && Math.hypot(p.velocity.x, p.velocity.y) <= 0.8),
    );
  const tacticalReady = receiverReady && keepersReady && teamReady;
  const blockers = [
    ...legal.blockers,
    ...(!receiverReady ? ['delivery_receiver_developing'] : []),
    ...(!keepersReady ? ['kickoff_goalkeeper_developing'] : []),
    ...(!teamReady ? ['teammates_moving_to_positions'] : []),
  ];
  let phase = next.restart!.phase;
  if (
    !action &&
    legal.ready &&
    tacticalReady &&
    isHumanControlled(next, next.restart!.takerId) &&
    next.scenario !== 'throw_in'
  )
    phase = 'awaiting_decision';
  next = {
    ...next,
    restart: {
      ...next.restart!,
      phase,
      ...(needsTeam && legal.ready && tacticalReady ? { humanPreparation: 'ready' as const } : {}),
      readiness: {
        ballReady: legal.ballReady,
        takerReady: legal.takerReady,
        legalReady: legal.ready,
        tacticalReady,
        blockers,
      },
      // The first legally established configuration authorises this award. The ledger stays open.
      authorisedAt:
        legal.ready && tacticalReady ? (next.restart!.authorisedAt ?? next.time) : undefined,
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
    !isRestartSetup(state) ||
    restart.executedAt !== undefined ||
    !action ||
    !restart.readiness?.legalReady ||
    !restart.readiness.tacticalReady ||
    (restart.ceremonial && restart.authorisedAt === undefined) ||
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
