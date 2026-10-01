import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import { collectContactEvidence } from './contactEvidence';

export const playerMatchStatsSchema = z.object({
  playerId: z.string(),
  minutesPlayed: z.number().nonnegative(),
  touches: z.number().int().nonnegative(),
  passesAttempted: z.number().int().nonnegative(),
  passesCompleted: z.number().int().nonnegative(),
  passesReceived: z.number().int().nonnegative(),
  shots: z.number().int().nonnegative(),
  shotsOnTarget: z.number().int().nonnegative(),
  goals: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  carries: z.number().int().nonnegative(),
  tacklesAttempted: z.number().int().nonnegative(),
  tacklesWon: z.number().int().nonnegative(),
  interceptions: z.number().int().nonnegative(),
  possessionWon: z.number().int().nonnegative(),
  possessionLost: z.number().int().nonnegative(),
  distanceCovered: z.number().nonnegative(),
  sprintDistance: z.number().nonnegative(),
  sprintBursts: z.number().int().nonnegative(),
  maxSpeed: z.number().nonnegative(),
  saves: z.number().int().nonnegative(),
  goalsConceded: z.number().int().nonnegative(),
  catches: z.number().int().nonnegative(),
  parries: z.number().int().nonnegative(),
});
export type PlayerMatchStats = z.infer<typeof playerMatchStatsSchema>;

export const matchStatisticsSchema = z.object({
  players: z.array(playerMatchStatsSchema),
  observedPassAttemptIds: z.array(z.string()),
  observedPassResultIds: z.array(z.string()),
  observedShotIds: z.array(z.string()),
  observedShotResultIds: z.array(z.string()),
  observedContactIds: z.array(z.string()),
  observedCarryIds: z.array(z.string()),
  passingNetwork: z.array(
    z.object({
      passerId: z.string(),
      receiverId: z.string(),
      attempted: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
    }),
  ),
  observedAssistGoalIds: z.array(z.string()),
  observedPossessionEvents: z.array(z.string()),
  assistCandidate: z
    .object({ passerId: z.string(), scorerId: z.string(), passId: z.string() })
    .optional(),
});
export type MatchStatistics = z.infer<typeof matchStatisticsSchema>;

export const createMatchStatistics = (state: TacticalMatchState): MatchStatistics => ({
  players: state.players.map((player) => ({
    playerId: player.id,
    minutesPlayed: 0,
    touches: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    passesReceived: 0,
    shots: 0,
    shotsOnTarget: 0,
    goals: 0,
    assists: 0,
    carries: 0,
    tacklesAttempted: 0,
    tacklesWon: 0,
    interceptions: 0,
    possessionWon: 0,
    possessionLost: 0,
    distanceCovered: 0,
    sprintDistance: 0,
    sprintBursts: 0,
    maxSpeed: 0,
    saves: 0,
    goalsConceded: 0,
    catches: 0,
    parries: 0,
  })),
  observedPassAttemptIds: [],
  observedPassResultIds: [],
  observedShotIds: [],
  observedShotResultIds: [],
  observedContactIds: [],
  observedCarryIds: [],
  passingNetwork: [],
  observedAssistGoalIds: [],
  observedPossessionEvents: [],
});

/** Immutable observer: event ids provide exactly-once counting; locomotion is projected, not copied. */
export const observePlayerMatchStats = (
  statistics: MatchStatistics,
  previous: TacticalMatchState,
  next: TacticalMatchState,
): MatchStatistics => {
  const result: MatchStatistics = {
    players: statistics.players.map((entry) => ({ ...entry })),
    observedPassAttemptIds: [...statistics.observedPassAttemptIds],
    observedPassResultIds: [...statistics.observedPassResultIds],
    observedShotIds: [...statistics.observedShotIds],
    observedShotResultIds: [...statistics.observedShotResultIds],
    observedContactIds: [...statistics.observedContactIds],
    observedCarryIds: [...statistics.observedCarryIds],
    passingNetwork: statistics.passingNetwork.map((edge) => ({ ...edge })),
    observedAssistGoalIds: [...statistics.observedAssistGoalIds],
    observedPossessionEvents: [...statistics.observedPossessionEvents],
    ...(statistics.assistCandidate ? { assistCandidate: { ...statistics.assistCandidate } } : {}),
  };
  const stats = (id: string) => result.players.find((entry) => entry.playerId === id);
  for (const player of next.players) {
    const entry = stats(player.id)!;
    entry.minutesPlayed = next.time / 60;
    const running = player.locomotionTelemetry;
    if (running) {
      entry.distanceCovered = running.distanceTotal;
      entry.sprintDistance = running.distanceSprint;
      entry.sprintBursts = running.sprintBursts;
      entry.maxSpeed = running.maxSpeed;
    }
  }
  for (const contact of collectContactEvidence(previous, next)) {
    if (result.observedContactIds.includes(contact.id)) continue;
    result.observedContactIds.push(contact.id);
    const player = stats(contact.playerId);
    if (player) player.touches++;
  }
  const action = next.latestAction;
  if (action?.type === 'carry' && next.ballCarrierIntent?.actorId === action.actorId) {
    const carryId = `${next.seed}:carry:${next.ballCarrierIntent.startedAt}:${action.actorId}`;
    if (!result.observedCarryIds.includes(carryId)) {
      result.observedCarryIds.push(carryId);
      stats(action.actorId)!.carries++;
    }
  }
  const pass = next.lastPassDiagnostic;
  if (pass && !result.observedPassAttemptIds.includes(pass.passId)) {
    result.observedPassAttemptIds.push(pass.passId);
    stats(pass.passerId)!.passesAttempted++;
    const edge = result.passingNetwork.find(
      (edge) => edge.passerId === pass.passerId && edge.receiverId === pass.intendedReceiverId,
    );
    if (edge) edge.attempted++;
    else
      result.passingNetwork.push({
        passerId: pass.passerId,
        receiverId: pass.intendedReceiverId,
        attempted: 1,
        completed: 0,
      });
  }
  if (pass?.finalResult && !result.observedPassResultIds.includes(pass.passId)) {
    result.observedPassResultIds.push(pass.passId);
    if (
      pass.finalResult === 'completed' &&
      pass.actualContactPoint &&
      pass.resolvedAt !== undefined
    ) {
      stats(pass.passerId)!.passesCompleted++;
      stats(pass.intendedReceiverId)!.passesReceived++;
      result.passingNetwork.find(
        (edge) => edge.passerId === pass.passerId && edge.receiverId === pass.intendedReceiverId,
      )!.completed++;
      result.assistCandidate = {
        passerId: pass.passerId,
        scorerId: pass.intendedReceiverId,
        passId: pass.passId,
      };
    }
  }
  const shot = next.ball.shot ?? next.lastShot;
  if (shot && !result.observedShotIds.includes(shot.shotId)) {
    result.observedShotIds.push(shot.shotId);
    const shooter = stats(shot.shooterId)!;
    shooter.shots++;
  }
  const shotResult = next.lastShot;
  if (shotResult?.outcome && !result.observedShotResultIds.includes(shotResult.shotId)) {
    const shot = shotResult;
    result.observedShotResultIds.push(shot.shotId);
    const shooter = stats(shot.shooterId)!;
    // Posts and crossbars which stay out are off-target. Blocks are a separate outcome.
    if (['goal', 'save'].includes(shot.outcome ?? '')) shooter.shotsOnTarget++;
    if (shot.outcome === 'goal') shooter.goals++;
    if (
      shot.outcome === 'goal' &&
      result.assistCandidate?.scorerId === shot.shooterId &&
      result.assistCandidate.passerId !== shot.shooterId &&
      !result.observedAssistGoalIds.includes(shot.shotId)
    ) {
      stats(result.assistCandidate.passerId)!.assists++;
      result.observedAssistGoalIds.push(shot.shotId);
    }
    const defendingTeam = next.players.find((player) => player.id === shot.shooterId)?.team;
    const keeper = next.players.find(
      (player) => player.team !== defendingTeam && player.profile.primaryPosition === 'goalkeeper',
    );
    const keeperStats = keeper ? stats(keeper.id) : undefined;
    if (keeperStats && shot.outcome === 'goal') keeperStats.goalsConceded++;
    if (keeperStats && shot.outcome === 'save') {
      keeperStats.saves++;
      if (shot.goalkeeperAction === 'catch') keeperStats.catches++;
      if (shot.goalkeeperAction === 'parry' || shot.goalkeeperAction === 'parry_away')
        keeperStats.parries++;
    }
  }
  const change = next.lastPossessionChange;
  const eventId = change ? `${change.at}:${change.from}:${change.to}:${change.cause}` : undefined;
  if (change && eventId && !result.observedPossessionEvents.includes(eventId)) {
    result.observedPossessionEvents.push(eventId);
    const winner = next.ball.ownerId ? stats(next.ball.ownerId) : undefined;
    if (winner) {
      winner.possessionWon++;
      if (change.cause === 'interception') winner.interceptions++;
      if (change.cause === 'tackle') {
        winner.tacklesAttempted++;
        winner.tacklesWon++;
      }
    }
    const loser = previous.ball.ownerId ? stats(previous.ball.ownerId) : undefined;
    if (loser) loser.possessionLost++;
    // A controlled opponent possession invalidates the direct-provider chain. A later reclaim is
    // a new attacking sequence and cannot revive the old pass.
    const candidateTeam = result.assistCandidate
      ? next.players.find((player) => player.id === result.assistCandidate!.scorerId)?.team
      : undefined;
    if (candidateTeam && change.to !== candidateTeam) delete result.assistCandidate;
  }
  return result;
};

export const playerMatchSummarySchema = playerMatchStatsSchema.pick({
  playerId: true,
  minutesPlayed: true,
  touches: true,
  passesAttempted: true,
  passesCompleted: true,
  passesReceived: true,
  shots: true,
  shotsOnTarget: true,
  goals: true,
  assists: true,
  carries: true,
  tacklesAttempted: true,
  tacklesWon: true,
  interceptions: true,
  distanceCovered: true,
  sprintDistance: true,
  sprintBursts: true,
  maxSpeed: true,
  saves: true,
  goalsConceded: true,
  catches: true,
  parries: true,
});
export const projectPlayerMatchSummary = (statistics: MatchStatistics, playerId: string) =>
  playerMatchSummarySchema.parse(statistics.players.find((entry) => entry.playerId === playerId));

export const matchSummarySchema = z.object({
  homeClubId: z.string(),
  awayClubId: z.string(),
  finalScore: z.object({
    home: z.number().int().nonnegative(),
    away: z.number().int().nonnegative(),
  }),
  playerStats: z.array(playerMatchStatsSchema),
});
export type MatchSummary = z.infer<typeof matchSummarySchema>;
export const projectMatchSummary = (state: TacticalMatchState): MatchSummary | undefined =>
  state.status === 'full_time' && state.statistics
    ? matchSummarySchema.parse({
        homeClubId: state.teams.home.clubId,
        awayClubId: state.teams.away.clubId,
        finalScore: state.score,
        playerStats: state.statistics.players,
      })
    : undefined;
