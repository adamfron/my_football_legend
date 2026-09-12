import { z } from 'zod';
import type { TacticalMatchState } from './matchState';

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
});
export type PlayerMatchStats = z.infer<typeof playerMatchStatsSchema>;

export const matchStatisticsSchema = z.object({
  players: z.array(playerMatchStatsSchema),
  observedPassAttemptIds: z.array(z.string()),
  observedPassResultIds: z.array(z.string()),
  observedShotIds: z.array(z.string()),
  observedPossessionEvents: z.array(z.string()),
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
  })),
  observedPassAttemptIds: [],
  observedPassResultIds: [],
  observedShotIds: [],
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
    observedPossessionEvents: [...statistics.observedPossessionEvents],
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
  if (next.ball.ownerId && next.ball.ownerId !== previous.ball.ownerId)
    stats(next.ball.ownerId)!.touches++;
  const action = next.latestAction;
  const newAction =
    action && (action !== previous.latestAction || next.decisionIndex !== previous.decisionIndex);
  if (newAction && action.type === 'carry') stats(action.actorId)!.carries++;
  const pass = next.lastPassDiagnostic;
  if (pass && !result.observedPassAttemptIds.includes(pass.passId)) {
    result.observedPassAttemptIds.push(pass.passId);
    stats(pass.passerId)!.passesAttempted++;
  }
  if (pass?.finalResult && !result.observedPassResultIds.includes(pass.passId)) {
    result.observedPassResultIds.push(pass.passId);
    if (pass.finalResult === 'completed') {
      stats(pass.passerId)!.passesCompleted++;
      stats(pass.intendedReceiverId)!.passesReceived++;
    }
  }
  const shot = next.lastShot;
  if (shot && !result.observedShotIds.includes(shot.shotId)) {
    result.observedShotIds.push(shot.shotId);
    const shooter = stats(shot.shooterId)!;
    shooter.shots++;
    if (['goal', 'save', 'post', 'crossbar'].includes(shot.outcome)) shooter.shotsOnTarget++;
    if (shot.outcome === 'goal') shooter.goals++;
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
  carries: true,
  tacklesAttempted: true,
  tacklesWon: true,
  interceptions: true,
  distanceCovered: true,
  sprintDistance: true,
  sprintBursts: true,
  maxSpeed: true,
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
