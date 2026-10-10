import { z } from 'zod';
import { footballerProfileSchema, formationSlotSchema } from '../../schemas/domainSchemas';
import { getEffectivePositionOverall } from '../playerOverall';
import { isEligibleForNormalPosition, getTacticalDutyFit } from '../footballerWorld';
import type { SingleMatchSession } from '../singleMatch';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { physicalPointSchema, teamSideSchema, distance, type TeamSide } from './matchSpace';
import { deriveMovementCapability } from './locomotion';
import { deriveTeamTacticalPreferences } from './tacticalPreferences';
import { deriveRestartGeometry } from './restartGeometry';
import { replaceUnavailableRestartTaker } from './restartLifecycle';
import { isRestartSetup } from './restartPhase';
import { beginStoppage } from './stoppageLedger';
import {
  createMatchFitness,
  matchFitnessSchema,
  advanceMatchFitness,
  advanceMatchIntervalFitness,
} from './matchFitness';
import { matchInjurySchema } from './matchInjuries';

/** Compact competition contract. IFAB 2026/27 Law 3 and time-limited protocol. */
export const matchSubstitutionRulesSchema = z.object({
  maximumSubstitutions: z.number().int().min(0).max(30),
  maximumOpportunities: z.number().int().min(0).max(30).nullable(),
  namedBenchSize: z.number().int().min(0).max(15),
  returnSubstitutions: z.boolean(),
  exitTimeLimitSeconds: z.number().positive().max(60),
  delayedEntrySeconds: z.number().positive().max(300),
});
export type MatchSubstitutionRules = z.infer<typeof matchSubstitutionRulesSchema>;
export const DEFAULT_SUBSTITUTION_RULES: MatchSubstitutionRules = {
  maximumSubstitutions: 5,
  maximumOpportunities: 3,
  namedBenchSize: 9,
  returnSubstitutions: false,
  exitTimeLimitSeconds: 10,
  delayedEntrySeconds: 60,
};
export const matchBenchPlayerSchema = z.object({
  id: z.string().min(1),
  profile: footballerProfileSchema,
  condition: z.number().min(0).max(100),
  injury: matchInjurySchema.optional(),
  fitness: matchFitnessSchema.optional(),
});
export type MatchBenchPlayer = z.infer<typeof matchBenchPlayerSchema>;
/** Retain the actual departing body and profile; profile identities are never overwritten. */
export const departedMatchPlayerSchema = z
  .object({
    id: z.string(),
    team: teamSideSchema,
    profile: footballerProfileSchema,
    slotIndex: z.number().int().nonnegative(),
    slot: formationSlotSchema,
    duty: z.enum(['defend', 'support', 'attack']),
    position: physicalPointSchema,
    target: physicalPointSchema,
    velocity: physicalPointSchema,
    facingAngle: z.number().finite(),
    anchor: physicalPointSchema,
    neutralAnchor: physicalPointSchema,
    idealTarget: physicalPointSchema,
    meanPosition: physicalPointSchema,
    samples: z.number().int().nonnegative(),
    activeSince: z.number().nonnegative().optional(),
    goalkeeperRole: z.boolean().optional(),
    fitness: matchFitnessSchema.optional(),
    injury: matchInjurySchema.optional(),
  })
  .passthrough() as unknown as z.ZodType<MatchPlayerState>;
export const substitutionReasonSchema = z.enum(['injury', 'fatigue', 'tactical']);
export const substitutionRequestSchema = z.object({
  id: z.string(),
  team: teamSideSchema,
  opportunityId: z.string(),
  outgoing: departedMatchPlayerSchema,
  incoming: matchBenchPlayerSchema,
  requestedAt: z.number().nonnegative(),
  signalledAt: z.number().nonnegative(),
  reason: substitutionReasonSchema,
  exitTarget: physicalPointSchema,
  entryPosition: physicalPointSchema,
  entryVelocity: physicalPointSchema,
  entryFitness: matchFitnessSchema.optional(),
  injuryExitException: z.boolean(),
  leftAt: z.number().nonnegative().optional(),
  delayed: z.boolean(),
  resumedAt: z.number().nonnegative().optional(),
  eligibleEntryAt: z.number().nonnegative().optional(),
  refereeEntryAt: z.number().nonnegative().optional(),
});
export type SubstitutionRequest = z.infer<typeof substitutionRequestSchema>;
export const substitutionFactSchema = z.object({
  id: z.string(),
  team: teamSideSchema,
  outgoingId: z.string(),
  incomingId: z.string(),
  requestedAt: z.number().nonnegative(),
  leftAt: z.number().nonnegative(),
  enteredAt: z.number().nonnegative(),
  opportunityId: z.string(),
  reason: substitutionReasonSchema,
  delayed: z.boolean(),
});
export type SubstitutionFact = z.infer<typeof substitutionFactSchema>;
const sideCounts = z.object({
  home: z.number().int().nonnegative(),
  away: z.number().int().nonnegative(),
});
export const substitutionStateSchema = z.object({
  pending: z.array(substitutionRequestSchema).max(30),
  completed: z.array(substitutionFactSchema).max(60),
  used: sideCounts,
  opportunities: sideCounts,
  opportunityIds: z.object({
    home: z.array(z.string()).max(30),
    away: z.array(z.string()).max(30),
  }),
  lastCoachAt: z.number().nonnegative().optional(),
});
export type MatchSubstitutionState = z.infer<typeof substitutionStateSchema>;
export const emptySubstitutionState = (): MatchSubstitutionState => ({
  pending: [],
  completed: [],
  used: { home: 0, away: 0 },
  opportunities: { home: 0, away: 0 },
  opportunityIds: { home: [], away: [] },
});
export const initialiseMatchSubstitutions = (
  state: TacticalMatchState,
  session: SingleMatchSession,
): TacticalMatchState => ({
  ...state,
  substitutionRules: { ...(state.substitutionRules ?? DEFAULT_SUBSTITUTION_RULES) },
  substitutionState: emptySubstitutionState(),
  bench: Object.fromEntries(
    (['home', 'away'] as const).map((side) => [
      side,
      (session[side].bench ?? [])
        .slice(0, (state.substitutionRules ?? DEFAULT_SUBSTITUTION_RULES).namedBenchSize)
        .map((player) => ({
          id: player.footballerId,
          profile: player.profile,
          condition: player.condition,
          ...(player.injury ? { injury: player.injury } : {}),
        })),
    ]),
  ) as Record<TeamSide, MatchBenchPlayer[]>,
});
const rulesFor = (state: TacticalMatchState) =>
  state.substitutionRules ?? DEFAULT_SUBSTITUTION_RULES;
/** Return entries begin a new appearance. Fact order resolves equal halftime timestamps. */
const wasReplacedInCurrentAppearance = (state: TacticalMatchState, player: MatchPlayerState) => {
  let replaced = false;
  for (const fact of state.substitutionState?.completed ?? []) {
    if (fact.incomingId === player.id) replaced = false;
    if (fact.outgoingId === player.id && fact.leftAt >= (player.activeSince ?? 0)) replaced = true;
  }
  return replaced;
};
export const isLegalSubstitutionStoppage = (state: TacticalMatchState) =>
  state.status !== 'full_time' &&
  state.status !== 'abandoned' &&
  (state.status === 'half_time' ||
    isRestartSetup(state) ||
    Boolean(state.postGoal) ||
    Boolean(state.stoppageLedger?.active?.reasons.includes('injury')));
const opportunityId = (state: TacticalMatchState) =>
  state.status === 'half_time'
    ? `${state.seed}:half_time`
    : (state.stoppageLedger?.active?.id ??
      state.restart?.awardId ??
      `${state.seed}:stoppage:${state.restart?.startedAt ?? state.time}`);
const nearestExit = (player: MatchPlayerState) =>
  [
    { x: -0.35, y: player.position.y },
    { x: 105.35, y: player.position.y },
    { x: player.position.x, y: -0.35 },
    { x: player.position.x, y: 68.35 },
  ].sort((a, b) => distance(player.position, a) - distance(player.position, b))[0]!;
const outside = (player: MatchPlayerState) =>
  player.position.x < -0.2 ||
  player.position.x > 105.2 ||
  player.position.y < -0.2 ||
  player.position.y > 68.2;

/** Shared cleanup for a physical departure, serious injury and discipline. History is retained. */
export const clearUnavailableExecution = (
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
  if (involves(next.shotAgencyRequest)) delete next.shotAgencyRequest;
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
  if (next.controlledBallContact?.actorId === playerId) delete next.controlledBallContact;
  if (
    next.ballAcquisition?.candidateId === playerId ||
    next.ballAcquisition?.opponentId === playerId
  )
    delete next.ballAcquisition;
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
  if (next.statistics?.activeControlEpisode?.playerId === playerId) {
    next.statistics = { ...next.statistics };
    delete next.statistics.activeControlEpisode;
  }
  if (next.aerialContestantIds)
    next.aerialContestantIds = next.aerialContestantIds.filter((id) => id !== playerId);
  if (next.defensiveEpisodes)
    next.defensiveEpisodes = next.defensiveEpisodes.filter(
      (episode) => !episode.participants.includes(playerId),
    );
  if (next.recentDuel?.participants.includes(playerId)) delete next.recentDuel;
  delete next.planningSchedule;
  if (next.postGoal) {
    const targets = { ...next.postGoal.targets };
    delete targets[playerId];
    const retriever =
      next.postGoal.retrieverId === playerId
        ? next.players
            .filter((player) => player.team === next.postGoal!.scoringTeam)
            .sort(
              (a, b) =>
                distance(a.position, next.ball) - distance(b.position, next.ball) ||
                a.id.localeCompare(b.id),
            )[0]
        : undefined;
    next.postGoal = {
      ...next.postGoal,
      targets,
      ...(retriever ? { retrieverId: retriever.id } : {}),
    };
  }
  if (next.restart) {
    const restart = {
      ...next.restart,
      targets: { ...next.restart.targets },
      roles: { ...next.restart.roles },
    };
    delete restart.targets[playerId];
    delete restart.roles[playerId];
    if (involves(restart.selectedAction)) {
      delete restart.selectedAction;
      delete restart.selectedSource;
      delete restart.selectedAt;
      delete restart.preparationStartedAt;
      delete restart.executing;
      restart.phase = 'preparing';
    }
    if (restart.retrieval?.playerId === playerId) delete restart.retrieval;
    next.restart = restart;
  }
  return next;
};

export type SubstitutionSelection = {
  outgoingId: string;
  incomingId: string;
  reason?: z.infer<typeof substitutionReasonSchema>;
};
/** Requests are atomic: a duplicate, dismissed player or exhausted limit rejects the entire batch. */
export const requestSubstitutions = (
  state: TacticalMatchState,
  side: TeamSide,
  changes: readonly SubstitutionSelection[],
): TacticalMatchState => {
  if (!changes.length || !isLegalSubstitutionStoppage(state)) return state;
  const current = state.substitutionState ?? emptySubstitutionState(),
    rules = rulesFor(state),
    opportunity = opportunityId(state);
  const counted =
    state.status !== 'half_time' && !current.opportunityIds[side].includes(opportunity);
  if (
    current.used[side] + changes.length > rules.maximumSubstitutions ||
    (counted &&
      rules.maximumOpportunities !== null &&
      current.opportunities[side] >= rules.maximumOpportunities)
  )
    return state;
  const ids = changes.flatMap((change) => [change.outgoingId, change.incomingId]);
  if (new Set(ids).size !== ids.length) return state;
  const requests: SubstitutionRequest[] = [];
  for (const change of changes) {
    const outgoing =
      state.players.find((player) => player.id === change.outgoingId && player.team === side) ??
      state.departedPlayers?.find(
        (player) =>
          player.id === change.outgoingId &&
          player.team === side &&
          ['unable', 'absence'].includes(player.injury?.status ?? ''),
      );
    const incoming = state.bench?.[side]
      .slice(0, rules.namedBenchSize)
      .find((player) => player.id === change.incomingId);
    if (
      !outgoing ||
      !incoming ||
      (!state.players.some((player) => player.id === outgoing.id) &&
        wasReplacedInCurrentAppearance(state, outgoing)) ||
      ['unable', 'absence'].includes(incoming.injury?.status ?? '') ||
      incoming.id !== incoming.profile.id ||
      state.discipline?.[outgoing.id]?.sentOff ||
      state.discipline?.[incoming.id]?.sentOff ||
      current.pending.some(
        (pending) => pending.outgoing.id === outgoing.id || pending.incoming.id === incoming.id,
      ) ||
      state.players.some((player) => player.id === incoming.id) ||
      (!rules.returnSubstitutions &&
        current.completed.some(
          (fact) => fact.outgoingId === incoming.id || fact.incomingId === incoming.id,
        )) ||
      !isEligibleForNormalPosition(incoming.profile, outgoing.slot.position)
    )
      return state;
    const injuryExitException = ['unable', 'absence'].includes(outgoing.injury?.status ?? '');
    requests.push({
      id: `${state.seed}:substitution:${side}:${current.used[side] + requests.length}:${outgoing.id}:${incoming.id}`,
      team: side,
      opportunityId: opportunity,
      outgoing,
      incoming,
      requestedAt: state.time,
      signalledAt: state.time,
      reason: change.reason ?? (injuryExitException ? 'injury' : 'tactical'),
      exitTarget: nearestExit(outgoing),
      entryPosition: { x: 52.5, y: -0.35 },
      entryVelocity: { x: 0, y: 0 },
      injuryExitException,
      delayed: false,
      ...(outside(outgoing) ? { leftAt: state.time } : {}),
    });
  }
  let next: TacticalMatchState = {
    ...state,
    players: state.players.filter(
      (player) => !changes.some((change) => change.outgoingId === player.id),
    ),
    bench: {
      home: state.bench?.home ?? [],
      away: state.bench?.away ?? [],
      [side]: (state.bench?.[side] ?? []).filter(
        (player) => !changes.some((change) => change.incomingId === player.id),
      ),
    },
    substitutionState: {
      ...current,
      pending: [
        ...current.pending.map((request) =>
          request.opportunityId === opportunity && request.leftAt === undefined
            ? { ...request, signalledAt: state.time }
            : request,
        ),
        ...requests,
      ],
      used: { ...current.used, [side]: current.used[side] + changes.length },
      opportunities: {
        ...current.opportunities,
        [side]: current.opportunities[side] + Number(counted),
      },
      opportunityIds: {
        ...current.opportunityIds,
        [side]: current.opportunityIds[side].includes(opportunity)
          ? current.opportunityIds[side]
          : [...current.opportunityIds[side], opportunity],
      },
    },
  };
  for (const request of requests) next = clearUnavailableExecution(next, request.outgoing.id);
  return state.status === 'half_time' ? next : beginStoppage(next, requests[0]!.id, 'substitution');
};

/** The temporary protocol shortage is excluded from Law 3's minimum-player count. */
export const minimumEligiblePlayerCount = (state: TacticalMatchState, side: TeamSide) =>
  state.players.filter((player) => player.team === side).length +
  (state.substitutionState?.pending.filter(
    (request) => request.team === side && !state.discipline?.[request.outgoing.id]?.sentOff,
  ).length ?? 0);
/** Presentation projects departing bodies; football eligibility stays in state.players. */
export const projectMatchVisiblePlayers = (state: TacticalMatchState): MatchPlayerState[] => {
  const departing = (state.substitutionState?.pending ?? [])
    .filter((request) => request.leftAt === undefined)
    .map((request) => request.outgoing);
  return departing.length ? [...state.players, ...departing] : state.players;
};
export const substitutionBlocksRestart = (state: TacticalMatchState) =>
  (state.substitutionState?.pending ?? []).some(
    (request) => !request.delayed || request.refereeEntryAt !== undefined,
  );

/** Acceleration-limited transport across a real boundary, with the athlete's actual capability. */
export const moveSubstitutionBody = (
  player: MatchPlayerState,
  target: { x: number; y: number },
  dt: number,
  assisted = false,
): MatchPlayerState => {
  const capability = deriveMovementCapability(player),
    dx = target.x - player.position.x,
    dy = target.y - player.position.y;
  const d = Math.max(0.0001, Math.hypot(dx, dy));
  const acceleration = assisted ? 1.2 : capability.acceleration;
  const speed = Math.min(
    assisted ? 0.9 : capability.runSpeed,
    Math.sqrt(2 * acceleration * d),
    d / dt,
  );
  const desired = { x: (dx / d) * speed, y: (dy / d) * speed },
    delta = { x: desired.x - player.velocity.x, y: desired.y - player.velocity.y };
  const scale = Math.min(1, (acceleration * dt) / Math.max(0.0001, Math.hypot(delta.x, delta.y)));
  const velocity = {
    x: player.velocity.x + delta.x * scale,
    y: player.velocity.y + delta.y * scale,
  };
  const position = {
    x: player.position.x + velocity.x * dt,
    y: player.position.y + velocity.y * dt,
  };
  const travelled = distance(player.position, position),
    actualSpeed = Math.hypot(velocity.x, velocity.y);
  const running = player.locomotionTelemetry ?? {
    distanceTotal: 0,
    distanceWalk: 0,
    distanceJog: 0,
    distanceRun: 0,
    distanceSprint: 0,
    sprintSeconds: 0,
    sprintBursts: 0,
    maxSpeed: 0,
  };
  const previousSpeed = Math.hypot(player.velocity.x, player.velocity.y);
  return {
    ...player,
    position,
    velocity,
    target,
    facingAngle: actualSpeed > 0.01 ? Math.atan2(velocity.y, velocity.x) : player.facingAngle,
    ...(assisted
      ? {}
      : {
          fitness: advanceMatchFitness(player, {
            dt,
            distance: travelled,
            speed: actualSpeed,
            previousSpeed,
            turnRadians: 0,
          }),
          locomotionTelemetry: {
            ...running,
            distanceTotal: running.distanceTotal + travelled,
            distanceWalk: running.distanceWalk + (actualSpeed < 2.2 ? travelled : 0),
            distanceJog:
              running.distanceJog + (actualSpeed >= 2.2 && actualSpeed < 4.2 ? travelled : 0),
            distanceRun: running.distanceRun + (actualSpeed >= 4.2 ? travelled : 0),
            maxSpeed: Math.max(running.maxSpeed, actualSpeed),
          },
        }),
  };
};
const freezeOutgoingStatistics = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  leftAt: number,
): TacticalMatchState =>
  state.statistics
    ? {
        ...state,
        statistics: {
          ...state.statistics,
          playerActiveUntil: {
            ...state.statistics.playerActiveUntil,
            [player.id]: Math.min(
              leftAt,
              state.statistics.playerActiveUntil?.[player.id] ?? leftAt,
            ),
          },
          players: state.statistics.players.map((entry) =>
            entry.playerId === player.id
              ? {
                  ...entry,
                  minutesPlayed:
                    (state.statistics!.playerMinutesBeforeEntry?.[player.id] ?? 0) +
                    Math.max(
                      0,
                      Math.min(leftAt, state.statistics!.playerActiveUntil?.[player.id] ?? leftAt) -
                        (player.activeSince ?? 0),
                    ) /
                      60,
                  ...(player.locomotionTelemetry
                    ? {
                        distanceCovered: player.locomotionTelemetry.distanceTotal,
                        sprintDistance: player.locomotionTelemetry.distanceSprint,
                        sprintBursts: player.locomotionTelemetry.sprintBursts,
                        maxSpeed: player.locomotionTelemetry.maxSpeed,
                      }
                    : {}),
                }
              : entry,
          ),
        },
      }
    : state;

export const advanceMatchSubstitutions = (
  previous: TacticalMatchState,
  input: TacticalMatchState,
  dt: number,
): TacticalMatchState => {
  const current = input.substitutionState;
  if (!current?.pending.length || input.status === 'full_time' || input.status === 'abandoned')
    return input;
  let state = input;
  const pending: SubstitutionRequest[] = [],
    completed = current.completed.slice();
  for (const original of current.pending) {
    const request = { ...original };
    if (request.leftAt === undefined) {
      request.outgoing = moveSubstitutionBody(
        request.outgoing,
        request.exitTarget,
        dt,
        request.injuryExitException,
      );
      if (outside(request.outgoing)) {
        request.leftAt = state.time;
        state = freezeOutgoingStatistics(state, request.outgoing, request.leftAt);
        state = {
          ...state,
          departedPlayers: [
            ...(state.departedPlayers ?? []).filter((player) => player.id !== request.outgoing.id),
            request.outgoing,
          ],
        };
      }
    }
    // Close-to-boundary discretion is grounded in the actual crossing, not a generic timeout bypass.
    if (
      !request.injuryExitException &&
      request.leftAt === undefined &&
      state.status !== 'half_time' &&
      state.time - request.signalledAt > rulesFor(state).exitTimeLimitSeconds &&
      distance(request.outgoing.position, request.exitTarget) > 0.3
    )
      request.delayed = true;
    const resumedDrop =
      state.scenario === 'open_play' &&
      !state.restart &&
      !state.injuryAssessment &&
      !state.stoppageLedger?.active
        ? state.stoppageLedger?.intervals.at(-1)
        : undefined;
    if (
      request.delayed &&
      request.resumedAt === undefined &&
      resumedDrop?.endReason === 'execution' &&
      resumedDrop.reasons.includes('injury') &&
      resumedDrop.endedAt !== undefined &&
      resumedDrop.endedAt >= request.signalledAt
    ) {
      request.resumedAt = resumedDrop.endedAt;
      request.eligibleEntryAt = resumedDrop.endedAt + rulesFor(state).delayedEntrySeconds;
    }
    if (
      request.delayed &&
      request.resumedAt === undefined &&
      previous.restart?.phase !== 'release' &&
      state.restart?.phase === 'release'
    ) {
      request.resumedAt = state.time;
      request.eligibleEntryAt = state.time + rulesFor(state).delayedEntrySeconds;
    }
    if (
      request.leftAt !== undefined &&
      request.refereeEntryAt === undefined &&
      isLegalSubstitutionStoppage(state) &&
      (state.status === 'half_time' ||
        !request.delayed ||
        (request.eligibleEntryAt !== undefined &&
          state.time >= request.eligibleEntryAt &&
          (state.stoppageLedger?.active?.startedAt ?? state.restart?.startedAt ?? state.time) >=
            request.eligibleEntryAt &&
          opportunityId(state) !== request.opportunityId))
    )
      request.refereeEntryAt = state.time;
    if (request.refereeEntryAt !== undefined) {
      const previousAppearance = state.departedPlayers?.find(
        (player) => player.id === request.incoming.id,
      );
      const entrant: MatchPlayerState = {
        id: request.incoming.id,
        team: request.team,
        profile: request.incoming.profile,
        slotIndex: request.outgoing.slotIndex,
        slot: request.outgoing.slot,
        duty: request.outgoing.duty,
        anchor: request.outgoing.anchor,
        neutralAnchor: request.outgoing.neutralAnchor,
        target: request.outgoing.anchor,
        idealTarget: request.outgoing.anchor,
        fitness:
          request.entryFitness ??
          request.incoming.fitness ??
          createMatchFitness(request.incoming.condition),
        activeSince: state.time,
        position: request.entryPosition,
        velocity: request.entryVelocity,
        facingAngle: Math.PI / 2,
        meanPosition: request.entryPosition,
        samples: 1,
        ...(request.incoming.injury ? { injury: request.incoming.injury } : {}),
        ...(previousAppearance?.locomotionTelemetry
          ? { locomotionTelemetry: previousAppearance.locomotionTelemetry }
          : {}),
      };
      const moved = moveSubstitutionBody(entrant, { x: 52.5, y: 0.5 }, dt);
      request.entryPosition = moved.position;
      request.entryVelocity = moved.velocity;
      request.entryFitness = moved.fitness;
      if (request.entryPosition.y >= 0.2) {
        const fact: SubstitutionFact = {
          id: request.id,
          team: request.team,
          outgoingId: request.outgoing.id,
          incomingId: request.incoming.id,
          requestedAt: request.requestedAt,
          leftAt: request.leftAt!,
          enteredAt: state.time,
          opportunityId: request.opportunityId,
          reason: request.reason,
          delayed: request.delayed,
        };
        const incoming: MatchPlayerState = {
          ...moved,
          activeSince: state.time,
          target: moved.anchor,
          idealTarget: moved.anchor,
        };
        state = {
          ...state,
          players: [...state.players, incoming],
          departedPlayers: (state.departedPlayers ?? []).filter(
            (player) => player.id !== incoming.id,
          ),
        };
        if (rulesFor(state).returnSubstitutions)
          state = {
            ...state,
            bench: {
              home: state.bench?.home ?? [],
              away: state.bench?.away ?? [],
              [request.team]: [
                ...(state.bench?.[request.team] ?? []),
                {
                  id: request.outgoing.id,
                  profile: request.outgoing.profile,
                  condition: (request.outgoing.fitness?.longTermCapacity ?? 1) * 100,
                  ...(request.outgoing.fitness ? { fitness: request.outgoing.fitness } : {}),
                  ...(request.outgoing.injury ? { injury: request.outgoing.injury } : {}),
                },
              ],
            },
          };
        completed.push(fact);
        continue;
      }
    }
    pending.push(request);
  }
  state = { ...state, substitutionState: { ...current, pending, completed } };
  state = replaceUnavailableRestartTaker(state);
  if (
    completed.length !== current.completed.length &&
    state.restart &&
    state.restart.phase !== 'release'
  ) {
    const geometry = deriveRestartGeometry(
      state,
      state.scenario,
      state.restart.restartTeam,
      state.restart.spot ?? state.ball,
      { takerId: state.restart.takerId },
    );
    state = {
      ...state,
      restart: { ...state.restart, targets: geometry.targets, roles: geometry.roles },
    };
  }
  return state;
};
/** Core uses this during a referee-held substitution interval; the running clock is canonical. */
export const stepSubstitutionInterval = (
  state: TacticalMatchState,
  dt: number,
): TacticalMatchState =>
  advanceMatchIntervalFitness(
    state,
    advanceMatchSubstitutions(
      state,
      {
        ...state,
        time: state.time + dt,
        players: state.players.map((player) => moveSubstitutionBody(player, player.position, dt)),
      },
      dt,
    ),
    dt,
  );

/** Compare a replacement to keeping the player, including role, physical cost, quality and score. */
export const planCoachSubstitutions = (input: TacticalMatchState): TacticalMatchState => {
  const urgentInjury = [...input.players, ...(input.departedPlayers ?? [])].some(
    (player) =>
      ['unable', 'absence'].includes(player.injury?.status ?? '') &&
      !wasReplacedInCurrentAppearance(input, player),
  );
  if (
    !isLegalSubstitutionStoppage(input) ||
    !input.bench ||
    input.substitutionState?.pending.length ||
    (!urgentInjury &&
      input.substitutionState?.lastCoachAt !== undefined &&
      input.time - input.substitutionState.lastCoachAt < 15)
  )
    return input;
  let state = {
    ...input,
    substitutionState: {
      ...(input.substitutionState ?? emptySubstitutionState()),
      lastCoachAt: input.time,
    },
  };
  for (const side of ['home', 'away'] as const) {
    const preferences = deriveTeamTacticalPreferences(state, side),
      deficit = state.score[side === 'home' ? 'away' : 'home'] - state.score[side];
    const lateWeight = Math.max(0, Math.min(1, (state.time - 1200) / 3600));
    const candidates: { change: SubstitutionSelection; benefit: number }[] = [];
    const outgoingPlayers = [
      ...state.players,
      ...(state.departedPlayers ?? []).filter(
        (player) =>
          ['unable', 'absence'].includes(player.injury?.status ?? '') &&
          !wasReplacedInCurrentAppearance(state, player),
      ),
    ];
    for (const outgoing of outgoingPlayers.filter(
      (player) => player.team === side && !state.discipline?.[player.id]?.sentOff,
    )) {
      const capacity = outgoing.fitness?.longTermCapacity ?? 1,
        burst = outgoing.fitness?.burstReadiness ?? capacity;
      const injury = outgoing.injury?.status,
        unable = injury === 'unable' || injury === 'absence';
      const currentQuality = getEffectivePositionOverall(outgoing.profile, outgoing.slot.position),
        pressDemand = (preferences.organisedPress + preferences.counterpress) / 2;
      for (const incoming of state.bench?.[side] ?? []) {
        if (
          !isEligibleForNormalPosition(incoming.profile, outgoing.slot.position) ||
          state.discipline?.[incoming.id]?.sentOff
        )
          continue;
        const fit = getEffectivePositionOverall(incoming.profile, outgoing.slot.position),
          reserve = incoming.condition / 100;
        const fatigueBenefit =
          (reserve - capacity) * (20 + pressDemand * 12) + (reserve - burst) * pressDemand * 4;
        const abilityBenefit =
          (fit - currentQuality) * 0.65 +
          (getTacticalDutyFit(incoming.profile, outgoing.duty) -
            getTacticalDutyFit(outgoing.profile, outgoing.duty)) *
            0.18;
        const scoreBenefit =
          deficit > 0
            ? lateWeight *
              preferences.verticality *
              ((incoming.profile.attributes.pace - outgoing.profile.attributes.pace) * 0.06 +
                (incoming.profile.attributes.finishing - outgoing.profile.attributes.finishing) *
                  0.04)
            : deficit < 0
              ? lateWeight *
                preferences.compactness *
                ((incoming.profile.attributes.positioning -
                  outgoing.profile.attributes.positioning) *
                  0.06 +
                  (incoming.profile.attributes.tackling - outgoing.profile.attributes.tackling) *
                    0.04)
              : 0;
        const opportunityCost =
          5 +
          (1 - lateWeight) * 5 +
          (state.substitutionState!.opportunities[side] >= 2 ? 3 * (1 - lateWeight) : 0);
        const incomingInjuryCost =
          incoming.injury?.status === 'playable'
            ? 12
            : incoming.injury?.status === 'discomfort'
              ? 3
              : ['unable', 'absence'].includes(incoming.injury?.status ?? '')
                ? 1000
                : 0;
        const benefit =
          (unable ? 100 : injury === 'playable' ? 13 : injury === 'discomfort' ? 3 : 0) +
          fatigueBenefit +
          abilityBenefit +
          scoreBenefit -
          opportunityCost -
          incomingInjuryCost;
        if (benefit > 0)
          candidates.push({
            change: {
              outgoingId: outgoing.id,
              incomingId: incoming.id,
              reason:
                unable || injury === 'playable'
                  ? 'injury'
                  : fatigueBenefit > abilityBenefit
                    ? 'fatigue'
                    : 'tactical',
            },
            benefit,
          });
      }
    }
    candidates.sort(
      (a, b) =>
        b.benefit - a.benefit ||
        a.change.outgoingId.localeCompare(b.change.outgoingId) ||
        a.change.incomingId.localeCompare(b.change.incomingId),
    );
    const selected: SubstitutionSelection[] = [],
      used = new Set<string>();
    for (const candidate of candidates) {
      if (used.has(candidate.change.outgoingId) || used.has(candidate.change.incomingId)) continue;
      if (
        state.substitutionState!.used[side] + selected.length >=
        rulesFor(state).maximumSubstitutions
      )
        break;
      selected.push(candidate.change);
      used.add(candidate.change.outgoingId);
      used.add(candidate.change.incomingId);
    }
    state = requestSubstitutions(state, side, selected) as typeof state;
  }
  return state;
};

/** Completion represents the scheduled fifteen-minute interval, which also satisfies any
 * one-minute entry restriction. Body transport adds no player minutes or Law 7 loss. */
export const completeHalftimeSubstitutions = (input: TacticalMatchState): TacticalMatchState => {
  if (input.status !== 'half_time') return input;
  let state = planCoachSubstitutions(input);
  for (let tick = 0; tick < 120 / 0.025 && state.substitutionState?.pending.length; tick++)
    state = advanceMatchSubstitutions(state, state, 0.025);
  return state;
};
