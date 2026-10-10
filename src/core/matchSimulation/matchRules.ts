import { findMatchParticipant } from './matchParticipants';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { z } from 'zod';
import { pitchPointSchema, teamSideSchema, type PitchPoint, type TeamSide } from './matchSpace';
import type { TacticalMatchState } from './matchState';
import { awardNaturalRestart } from './restartScenarios';
import { replaceUnavailableRestartTaker } from './restartLifecycle';
import { isRestartSetup } from './restartPhase';
import { beginStoppage, endStoppage } from './stoppageLedger';
import { minimumEligiblePlayerCount } from './substitutions';
import {
  countDefensiveEvent,
  defensiveTechniqueSchema,
  deriveDefensiveContext,
  type ChallengeDiagnostic,
} from './defensiveChallenges';

export const ADVANTAGE_WINDOW_SECONDS = 3;
export const foulFactSchema = z.object({
  id: z.string(),
  challengeId: z.string(),
  technique: defensiveTechniqueSchema.optional(),
  at: z.number().nonnegative(),
  actorId: z.string(),
  team: teamSideSchema,
  opponentId: z.string(),
  awardedTeam: teamSideSchema,
  position: pitchPointSchema,
  severity: z.enum(['ordinary', 'reckless', 'excessive_force']),
  tactical: z.boolean(),
  promisingAttack: z.boolean(),
  dogso: z.boolean(),
  penalty: z.boolean(),
  card: z.enum(['none', 'yellow', 'red']),
});
export type FoulFact = z.infer<typeof foulFactSchema>;
export const cardFactSchema = z.object({
  id: z.string(),
  foulId: z.string(),
  at: z.number().nonnegative(),
  foulAt: z.number().nonnegative(),
  actorId: z.string(),
  team: teamSideSchema,
  position: pitchPointSchema,
  kind: z.enum(['yellow', 'second_yellow_red', 'red']),
  reason: z.string(),
  delayed: z.boolean(),
});
export type CardFact = z.infer<typeof cardFactSchema>;
export const disciplineSchema = z.record(
  z.string(),
  z.object({
    yellowCards: z.number().int().min(0).max(2),
    sentOff: z.boolean(),
    sentOffAt: z.number().nonnegative().optional(),
    team: teamSideSchema,
  }),
);
export const pendingAdvantageSchema = z.object({
  foul: foulFactSchema,
  expiresAt: z.number().nonnegative(),
  startProgress: z.number(),
  looseSince: z.number().nonnegative().optional(),
});
export const advantageFactSchema = z.object({
  id: z.string(),
  foulId: z.string(),
  at: z.number().nonnegative(),
  actorId: z.string(),
  team: teamSideSchema,
  position: pitchPointSchema,
  outcome: z.enum(['played', 'realized', 'recalled']),
});
export type AdvantageFact = z.infer<typeof advantageFactSchema>;
const progress = (point: PitchPoint, side: TeamSide) => (side === 'home' ? point.x : 105 - point.x);

/** No competition result is inferred: preserve the score and the actual canonical whistle time. */
export const enforceMinimumPlayers = (
  state: TacticalMatchState,
  afterDismissal = false,
): TacticalMatchState => {
  if (state.status === 'abandoned' || (state.status === 'full_time' && !afterDismissal))
    return state;
  const home = minimumEligiblePlayerCount(state, 'home');
  const away = minimumEligiblePlayerCount(state, 'away');
  const team = home < 7 ? 'home' : away < 7 ? 'away' : undefined;
  if (!team) return state;
  const next: TacticalMatchState = {
    ...state,
    status: 'abandoned',
    termination: {
      reason: 'insufficient_players',
      at: state.time,
      team,
      activePlayers: team === 'home' ? home : away,
    },
    ball: { x: state.ball.x, y: state.ball.y },
    actionCooldown: 0,
    currentPressure: 0,
  };
  delete next.currentAction;
  delete next.currentActorId;
  delete next.currentActionSource;
  delete next.restart;
  delete next.restartAction;
  delete next.throwInRestriction;
  delete next.restartTouchRestriction;
  delete next.droppedBallTouchRestriction;
  delete next.postGoal;
  delete next.pendingPlayerDecision;
  delete next.nearestChallengerId;
  delete next.aerialContestantIds;
  delete next.pendingCards;
  delete next.periodEndPending;
  return clearFoulExecution(endStoppage(next, 'abandoned'));
};

/** A defending team's own rectangle, independent of camera or restart orientation. */
export const isOwnPenaltyArea = (point: PitchPoint, defendingTeam: TeamSide): boolean =>
  point.y >= 13.84 &&
  point.y <= 54.16 &&
  (defendingTeam === 'home' ? point.x <= 16.5 : point.x >= 88.5);

export const classifyChallengeFoul = (
  state: TacticalMatchState,
  challenge: ChallengeDiagnostic,
): FoulFact | undefined => {
  if (challenge.outcome !== 'foul' || !challenge.opponentContact) return;
  const c = deriveDefensiveContext(state, challenge.actorId, challenge.opponentId);
  if (!c) return;
  const severity =
    challenge.force > 9.5 ||
    (challenge.technique === 'slide' && challenge.fromBehind && challenge.force > 6.2)
      ? 'excessive_force'
      : challenge.force > 4.2 ||
          // Distance outside ball reach is a timing error, not proof of reckless
          // physical danger. Low-speed standing contact remains an ordinary foul.
          (challenge.lateness > 0.4 && challenge.force > 2.5) ||
          (challenge.technique === 'slide' && challenge.fromBehind && challenge.force > 2.5)
        ? 'reckless'
        : 'ordinary';
  const tactical = challenge.technique === 'tactical';
  const penalty = isOwnPenaltyArea(challenge.position, challenge.team);
  const card: FoulFact['card'] =
    severity === 'excessive_force' || (c.dogso && (tactical || !penalty))
      ? 'red'
      : severity === 'reckless' || c.dogso || (tactical && c.promisingAttack)
        ? 'yellow'
        : 'none';
  return {
    id: `${challenge.id}:foul`,
    challengeId: challenge.id,
    technique: challenge.technique,
    at: challenge.at,
    actorId: challenge.actorId,
    team: challenge.team,
    opponentId: challenge.opponentId,
    awardedTeam: c.opponent.team,
    position: challenge.position,
    severity,
    tactical,
    promisingAttack: c.promisingAttack,
    dogso: c.dogso,
    penalty,
    card,
  };
};

const cardReason = (foul: FoulFact) =>
  foul.severity === 'excessive_force'
    ? 'excessive_force'
    : foul.dogso
      ? 'denial_of_obvious_goal_scoring_opportunity'
      : foul.severity === 'reckless'
        ? 'reckless_challenge'
        : 'stopping_promising_attack';

/** Dismissed identities stay in discipline/statistics; only the active canonical roster shrinks. */
const showCard = (state: TacticalMatchState, foul: FoulFact): TacticalMatchState => {
  if (
    state.status === 'abandoned' ||
    foul.card === 'none' ||
    state.discipline?.[foul.actorId]?.sentOff ||
    state.lastCard?.foulId === foul.id
  )
    return state;
  const previous = state.discipline?.[foul.actorId] ?? {
    yellowCards: 0,
    sentOff: false,
    team: foul.team,
  };
  const yellowCards = Math.min(2, previous.yellowCards + (foul.card === 'yellow' ? 1 : 0));
  const kind: CardFact['kind'] =
    foul.card === 'red' ? 'red' : yellowCards === 2 ? 'second_yellow_red' : 'yellow';
  const sentOff = kind !== 'yellow';
  const dismissedPlayer = sentOff
    ? state.players.find((player) => player.id === foul.actorId)
    : undefined;
  const finalRunning = sentOff
    ? state.players.find((player) => player.id === foul.actorId)?.locomotionTelemetry
    : undefined;
  const card: CardFact = {
    id: `${foul.id}:card`,
    foulId: foul.id,
    at: state.time,
    foulAt: foul.at,
    actorId: foul.actorId,
    team: foul.team,
    position: foul.position,
    kind,
    reason: cardReason(foul),
    delayed: state.time > foul.at + 1e-6,
  };
  let next: TacticalMatchState = {
    ...state,
    discipline: {
      ...state.discipline,
      [foul.actorId]: {
        ...previous,
        yellowCards,
        sentOff,
        team: foul.team,
        ...(sentOff ? { sentOffAt: state.time } : {}),
      },
    },
    lastCard: card,
    recentCards: [
      ...(state.recentCards?.[0]?.at === state.time ? state.recentCards : []),
      card,
    ].slice(-22),
    ...(sentOff
      ? {
          players: state.players.filter((p) => p.id !== foul.actorId),
          departedPlayers: dismissedPlayer
            ? [
                ...(state.departedPlayers ?? []).filter(
                  (player) => player.id !== dismissedPlayer.id,
                ),
                dismissedPlayer,
              ]
            : (state.departedPlayers ?? []),
        }
      : {}),
    ...(sentOff && state.statistics
      ? {
          statistics: {
            ...state.statistics,
            playerActiveUntil: {
              ...state.statistics.playerActiveUntil,
              [foul.actorId]: state.time,
            },
            players: state.statistics.players.map((entry) =>
              entry.playerId === foul.actorId
                ? {
                    ...entry,
                    minutesPlayed:
                      (state.statistics!.playerMinutesBeforeEntry?.[foul.actorId] ?? 0) +
                      Math.max(
                        0,
                        state.time - (state.statistics!.playerActiveSince?.[foul.actorId] ?? 0),
                      ) /
                        60,
                    ...(finalRunning
                      ? {
                          distanceCovered: finalRunning.distanceTotal,
                          sprintDistance: finalRunning.distanceSprint,
                          sprintBursts: finalRunning.sprintBursts,
                          maxSpeed: finalRunning.maxSpeed,
                        }
                      : {}),
                  }
                : entry,
            ),
          },
        }
      : {}),
  };
  if (foul.card === 'yellow')
    next = countDefensiveEvent(next, foul.actorId, 'yellowCards', foul.technique);
  if (sentOff) {
    next = countDefensiveEvent(next, foul.actorId, 'redCards', foul.technique);
    next = countDefensiveEvent(
      next,
      foul.actorId,
      kind === 'second_yellow_red' ? 'secondYellowDismissals' : 'straightReds',
      foul.technique,
    );
    next = removeDismissedExecution(next, foul.actorId);
    // A surviving teammate fills the goalkeeper role until a legal replacement can enter.
    if (!next.players.some((p) => p.team === foul.team && isMatchGoalkeeper(p))) {
      const replacement = next.players
        .filter((p) => p.team === foul.team)
        .sort(
          (a, b) =>
            b.profile.attributes.reflexes - a.profile.attributes.reflexes ||
            a.id.localeCompare(b.id),
        )[0];
      if (replacement)
        next = {
          ...next,
          players: next.players.map((p) =>
            p.id === replacement.id ? { ...p, goalkeeperRole: true } : p,
          ),
        };
    }
  }
  if (next.stoppageLedger?.active) next = beginStoppage(next, foul.id, 'discipline', foul.at);
  return sentOff ? enforceMinimumPlayers(next, true) : next;
};

/** Remove live references while retaining historical actions, contacts and statistics. */
const removeDismissedExecution = (
  state: TacticalMatchState,
  playerId: string,
): TacticalMatchState => {
  const next = { ...state, ball: { ...state.ball } };
  const involves = (action: TacticalMatchState['currentAction']) =>
    action &&
    (action.actorId === playerId ||
      (action.type === 'pass' && action.receiverId === playerId) ||
      (action.type === 'challenge' && action.opponentId === playerId) ||
      ((action.type === 'cross' || action.type === 'header') &&
        action.intendedTargetId === playerId));
  if (involves(next.currentAction) || next.currentActorId === playerId) {
    delete next.currentAction;
    delete next.currentActorId;
    delete next.currentActionSource;
  }
  if (involves(next.restartAction)) delete next.restartAction;
  if (next.ball.ownerId === playerId) delete next.ball.ownerId;
  if (next.ball.intendedReceiverId === playerId) delete next.ball.intendedReceiverId;
  if (next.ball.secondBallPriorityIds)
    next.ball.secondBallPriorityIds = next.ball.secondBallPriorityIds.filter(
      (id) => id !== playerId,
    );
  if (
    next.defensiveChallenge?.actorId === playerId ||
    next.defensiveChallenge?.opponentId === playerId
  )
    delete next.defensiveChallenge;
  if (next.playerMovementIntent?.actorId === playerId) delete next.playerMovementIntent;
  if (next.ballCarrierIntent?.actorId === playerId) delete next.ballCarrierIntent;
  if (next.humanPossessionEpisode?.actorId === playerId) delete next.humanPossessionEpisode;
  if (next.postActionAgencyCheckpoint?.actorId === playerId) delete next.postActionAgencyCheckpoint;
  if (
    next.pendingReceptionIntent?.actorId === playerId ||
    involves(next.pendingReceptionIntent?.action)
  )
    delete next.pendingReceptionIntent;
  if (
    next.receptionPreparation?.actorId === playerId ||
    next.receptionPreparation?.sourceActorId === playerId
  )
    delete next.receptionPreparation;
  if (next.onBallPreparation?.actorId === playerId) delete next.onBallPreparation;
  if (next.keeperIntervention?.keeperId === playerId) delete next.keeperIntervention;
  if (next.nearestChallengerId === playerId) delete next.nearestChallengerId;
  if (next.pendingPlayerDecision?.actorId === playerId) delete next.pendingPlayerDecision;
  if (next.aerialContestantIds)
    next.aerialContestantIds = next.aerialContestantIds.filter((id) => id !== playerId);
  if (next.defensiveEpisodes)
    next.defensiveEpisodes = next.defensiveEpisodes.filter(
      (episode) => !episode.participants.includes(playerId),
    );
  return next;
};

const clearFoulExecution = (state: TacticalMatchState): TacticalMatchState => {
  const next = { ...state };
  delete next.defensiveChallenge;
  delete next.playerMovementIntent;
  delete next.ballCarrierIntent;
  delete next.humanPossessionEpisode;
  delete next.postActionAgencyCheckpoint;
  delete next.pendingReceptionIntent;
  delete next.receptionPreparation;
  delete next.onBallPreparation;
  delete next.offsideSnapshot;
  delete next.keeperIntervention;
  delete next.pendingAdvantage;
  delete next.goalCompletionUntil;
  delete next.pendingKickoffTeam;
  delete next.postGoal;
  return next;
};

export const awardFoulRestart = (state: TacticalMatchState, foul: FoulFact): TacticalMatchState => {
  if (state.status === 'abandoned' || state.status === 'full_time') return state;
  let prepared = clearFoulExecution(state);
  if (foul.penalty && prepared.lastPenaltyAwardId !== foul.id) {
    prepared = countDefensiveEvent(prepared, foul.actorId, 'penalties', foul.technique);
    prepared = { ...prepared, lastPenaltyAwardId: foul.id };
  }
  const attackingProgress = progress(foul.position, foul.awardedTeam);
  const scenario = foul.penalty
    ? 'penalty'
    : attackingProgress >= 76
      ? Math.abs(foul.position.y - 34) < 15
        ? 'free_kick_close'
        : 'free_kick_wide'
      : 'free_kick_far';
  const point = foul.penalty ? { x: foul.awardedTeam === 'home' ? 94 : 11, y: 34 } : foul.position;
  return awardNaturalRestart(prepared, scenario, {
    restartTeam: foul.awardedTeam,
    restartPoint: point,
    incidentPoint: foul.position,
    incidentId: foul.id,
    eventAt: foul.at,
    cause: 'foul',
    loserId: foul.actorId,
  });
};

const advanceFact = (
  state: TacticalMatchState,
  foul: FoulFact,
  outcome: AdvantageFact['outcome'],
): AdvantageFact => ({
  id: `${foul.id}:advantage:${outcome}`,
  foulId: foul.id,
  at: state.time,
  actorId: foul.opponentId,
  team: foul.awardedTeam,
  position: foul.position,
  outcome,
});

export const applyChallengeInfringement = (
  state: TacticalMatchState,
  challenge: ChallengeDiagnostic,
): TacticalMatchState => {
  if (state.status === 'abandoned' || state.status === 'full_time') return state;
  const foul = classifyChallengeFoul(state, challenge);
  if (!foul) return state;
  if (state.lastFoul?.id === foul.id) return state;
  let next: TacticalMatchState = { ...state, lastFoul: foul };
  const owner = next.players.find((p) => p.id === next.ball.ownerId);
  const useful =
    !next.periodEndPending &&
    owner?.team === foul.awardedTeam &&
    progress(next.ball, foul.awardedTeam) >= 65 &&
    next.currentPressure < 0.82 &&
    foul.card !== 'red' &&
    !foul.penalty;
  if (useful && !next.pendingAdvantage) {
    next = {
      ...next,
      pendingAdvantage: {
        foul,
        expiresAt: next.time + ADVANTAGE_WINDOW_SECONDS,
        startProgress: progress(next.ball, foul.awardedTeam),
      },
      lastAdvantage: advanceFact(next, foul, 'played'),
      ...(foul.card !== 'none'
        ? { pendingCards: [...(next.pendingCards ?? []), foul].slice(-22) }
        : {}),
    };
    return countDefensiveEvent(next, foul.actorId, 'advantagePlayed', foul.technique);
  }
  if (next.pendingAdvantage) {
    const interrupted = next.pendingAdvantage.foul;
    next = countDefensiveEvent(
      next,
      interrupted.actorId,
      'advantageRecalled',
      interrupted.technique,
    );
    next = { ...next, lastAdvantage: advanceFact(next, interrupted, 'recalled') };
  }
  next = showCard(next, foul);
  return awardFoulRestart(next, foul);
};

/** Referee decisions use the observed forward timeline once; there is no rollback or resimulation. */
export const advanceMatchRules = (
  previous: TacticalMatchState,
  input: TacticalMatchState,
): TacticalMatchState => {
  if (input.status === 'abandoned') return input;
  if (input === previous) return input;
  let next = input;
  const advantage = next.pendingAdvantage;
  if (advantage) {
    const foul = advantage.foul;
    const owner = next.players.find((p) => p.id === next.ball.ownerId);
    const attackingRelease =
      next.ball.travelKind &&
      next.players.find((p) => p.id === next.ball.lastTouchPlayerId)?.team === foul.awardedTeam;
    const useful = owner?.team === foul.awardedTeam || attackingRelease;
    const progressed = progress(next.ball, foul.awardedTeam) >= advantage.startProgress + 5;
    const shot = next.ball.shot ?? next.lastShot;
    const attemptedShot = Boolean(
      shot &&
        shot.shooterId &&
        (shot.releasedAt ?? -1) >= foul.at &&
        findMatchParticipant(next, shot.shooterId)?.team === foul.awardedTeam,
    );
    const goal = next.score[foul.awardedTeam] > previous.score[foul.awardedTeam];
    const stoppage =
      isRestartSetup(next) || next.status === 'half_time' || next.status === 'full_time';
    const lost =
      Boolean(owner && owner.team !== foul.awardedTeam) ||
      progress(next.ball, foul.awardedTeam) < advantage.startProgress - 3;
    const looseSince = useful ? undefined : (advantage.looseSince ?? next.time);
    const failed = lost || (looseSince !== undefined && next.time - looseSince >= 0.6);
    if (
      goal ||
      attemptedShot ||
      (progressed && useful) ||
      (next.time >= advantage.expiresAt && useful)
    ) {
      next = { ...next, lastAdvantage: advanceFact(next, foul, 'realized') };
      delete next.pendingAdvantage;
    } else if (failed || stoppage || next.time >= advantage.expiresAt) {
      next = countDefensiveEvent(next, foul.actorId, 'advantageRecalled', foul.technique);
      next = { ...next, lastAdvantage: advanceFact(next, foul, 'recalled') };
      next = awardFoulRestart(next, foul);
    } else if (looseSince !== advantage.looseSince) {
      next = {
        ...next,
        pendingAdvantage: { ...advantage, ...(looseSince === undefined ? {} : { looseSince }) },
      };
      if (looseSince === undefined) delete next.pendingAdvantage!.looseSince;
    }
  }
  const stopped =
    isRestartSetup(next) ||
    next.postGoal !== undefined ||
    next.goalCompletionUntil !== undefined ||
    next.status === 'half_time' ||
    next.status === 'full_time';
  if (stopped && next.pendingCards?.length) {
    const pending = next.pendingCards;
    next = { ...next };
    delete next.pendingCards;
    for (const foul of pending) next = showCard(next, foul);
    // A card can remove a restart taker (e.g. another infringement at the same stoppage).
    if (
      next.status !== 'abandoned' &&
      next.restart &&
      !next.players.some((p) => p.id === next.restart!.takerId)
    )
      next = replaceUnavailableRestartTaker(clearFoulExecution(next));
  }
  return next;
};
