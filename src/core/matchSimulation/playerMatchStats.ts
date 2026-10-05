import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import {
  collectContactEvidence,
  controlEpisodeSchema,
  projectControlEpisodes,
} from './contactEvidence';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';

export const teamAccountingSchema = z.object({
  possessionSeconds: z.number().nonnegative(),
  blockedShots: z.number().int().nonnegative(),
  offsides: z.number().int().nonnegative(),
  corners: z.number().int().nonnegative(),
  freeKicks: z.number().int().nonnegative(),
  throwIns: z.number().int().nonnegative(),
  // Keep missing legacy counters distinguishable until their canonical ledgers are migrated.
  goalKicks: z.number().int().nonnegative().optional(),
  penalties: z.number().int().nonnegative().optional(),
  kickOffs: z.number().int().nonnegative().optional(),
  possessionChanges: z.number().int().nonnegative().optional(),
});
const emptyTeamAccounting = () => ({
  possessionSeconds: 0,
  blockedShots: 0,
  offsides: 0,
  corners: 0,
  freeKicks: 0,
  throwIns: 0,
  goalKicks: 0,
  penalties: 0,
  kickOffs: 0,
  possessionChanges: 0,
});

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
  /** Ground/keeper claim of an uncontrolled ball, including a team's own second ball. */
  looseBallRecoveries: z.number().int().nonnegative().default(0),
  /** A physical shot deflection is separate from a challenge and a possession win. */
  blocks: z.number().int().nonnegative().default(0),
  /** A won contested challenge or aerial duel; uncontested recoveries are excluded. */
  duelsWon: z.number().int().nonnegative().default(0),
  fouls: z.number().int().nonnegative().default(0),
  yellowCards: z.number().int().nonnegative().default(0),
  redCards: z.number().int().nonnegative().default(0),
  offsides: z.number().int().nonnegative().default(0),
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
  /** Stable membership survives dismissal from the active physics roster. */
  playerTeams: z.record(z.string(), z.enum(['home', 'away'])).optional(),
  teamAccounting: z.object({ home: teamAccountingSchema, away: teamAccountingSchema }).optional(),
  observedThrough: z.number().nonnegative().optional(),
  observedRestartIds: z.array(z.string()).optional(),
  observedOffsideIds: z.array(z.string()).optional(),
  observedPassAttemptIds: z.array(z.string()),
  observedPassResultIds: z.array(z.string()),
  observedShotIds: z.array(z.string()),
  observedShotResultIds: z.array(z.string()),
  observedContactIds: z.array(z.string()),
  /** One active possession/control episode; physical contacts are retained separately. */
  activeControlEpisode: controlEpisodeSchema.optional(),
  observedCarryIds: z.array(z.string()),
  passingNetwork: z.array(
    z
      .object({
        passerId: z.string(),
        receiverId: z.string(),
        attempted: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
      })
      .superRefine((edge, context) => {
        if (edge.completed > edge.attempted)
          context.addIssue({ code: 'custom', message: 'Completed passes exceed edge attempts.' });
        if (edge.passerId === edge.receiverId)
          context.addIssue({ code: 'custom', message: 'Self-passing is not a public pass.' });
      }),
  ),
  observedAssistGoalIds: z.array(z.string()),
  observedPossessionEvents: z.array(z.string()),
  observedChallengeIds: z.array(z.string()).optional(),
  observedChallengeResultIds: z.array(z.string()).optional(),
  observedRecoveryIds: z.array(z.string()).optional(),
  observedDuelIds: z.array(z.string()).optional(),
  assistCandidate: z
    .object({ passerId: z.string(), scorerId: z.string(), passId: z.string() })
    .optional(),
});
export type MatchStatistics = z.infer<typeof matchStatisticsSchema>;

// Snapshot arrays are immutable. Each historical identity list is indexed once, outside the
// canonical/serialized state; branches use their own array identity and cannot poison a sibling.
const membershipIndexes = new WeakMap<readonly string[], ReadonlySet<string>>();
const containsIdentity = (ids: readonly string[], id: string) => {
  let index = membershipIndexes.get(ids);
  if (!index) {
    index = new Set(ids);
    membershipIndexes.set(ids, index);
  }
  return index.has(id);
};
type IdentityHistory = {
  [Key in keyof MatchStatistics]: NonNullable<MatchStatistics[Key]> extends string[] ? Key : never;
}[keyof MatchStatistics] &
  keyof MatchStatistics;

export const createMatchStatistics = (state: TacticalMatchState): MatchStatistics => ({
  playerTeams: Object.fromEntries(state.players.map((player) => [player.id, player.team])),
  teamAccounting: { home: emptyTeamAccounting(), away: emptyTeamAccounting() },
  observedThrough: state.time,
  observedRestartIds: [],
  observedOffsideIds: [],
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
    looseBallRecoveries: 0,
    blocks: 0,
    duelsWon: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    offsides: 0,
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
  observedChallengeIds: [],
  observedChallengeResultIds: [],
  observedRecoveryIds: [],
  observedDuelIds: [],
});

/** Rebuild only absent legacy counters, once; fresh snapshots already store cheap totals. */
const resumeTeamAccounting = (statistics: MatchStatistics, side: 'home' | 'away') => {
  const previous = statistics.teamAccounting?.[side];
  const countAwards = (scenarios: readonly string[]) =>
    (statistics.observedRestartIds ?? []).reduce(
      (total, id) =>
        total + Number(scenarios.some((scenario) => id.endsWith(`:${side}:${scenario}`))),
      0,
    );
  return {
    ...emptyTeamAccounting(),
    ...previous,
    goalKicks: previous?.goalKicks ?? countAwards(['goal_kick', 'gk_short']),
    penalties: previous?.penalties ?? countAwards(['penalty']),
    kickOffs: previous?.kickOffs ?? countAwards(['kick_off']),
    // Possession keys begin at:from:to:cause. New source evidence appends the winner;
    // player identity can itself contain separators, so destination is a fixed prefix field.
    possessionChanges:
      previous?.possessionChanges ??
      statistics.observedPossessionEvents.reduce(
        (total, id) => total + Number(id.split(':')[2] === side),
        0,
      ),
  };
};

/** Immutable observer: event ids provide exactly-once counting; locomotion is projected, not copied. */
export const observePlayerMatchStats = (
  statistics: MatchStatistics,
  previous: TacticalMatchState,
  next: TacticalMatchState,
): MatchStatistics => {
  if (previous.status === 'full_time' || previous.status === 'abandoned') return statistics;
  const statisticsSpan = startPerformanceSpan('statistics');
  try {
    const result: MatchStatistics = {
      ...statistics,
      players: statistics.players.map((entry) => ({ ...entry })),
      playerTeams:
        statistics.playerTeams ??
        Object.fromEntries([
          ...Object.entries(next.discipline ?? {}).map(([id, discipline]) => [id, discipline.team]),
          ...previous.players.map((player) => [player.id, player.team]),
          ...next.players.map((player) => [player.id, player.team]),
        ]),
      teamAccounting: {
        home: resumeTeamAccounting(statistics, 'home'),
        away: resumeTeamAccounting(statistics, 'away'),
      },
      // Old snapshots already observed the last resolved challenge using adjacency. Seed the
      // new identity ledgers with that historical result when resuming, rather than replay it.
      observedChallengeIds:
        statistics.observedChallengeIds ??
        (previous.lastChallenge ? [previous.lastChallenge.id] : []),
      observedChallengeResultIds:
        statistics.observedChallengeResultIds ??
        (previous.lastChallenge ? [previous.lastChallenge.id] : []),
    };
    const accounting = result.teamAccounting!;
    const elapsed = Math.max(
      0,
      next.time - Math.max(previous.time, statistics.observedThrough ?? previous.time),
    );
    result.observedThrough = Math.max(statistics.observedThrough ?? previous.time, next.time);
    // The restart scenario survives a legal release for its delivery context. That flight is
    // live football too; only setup, intervals and the scored-goal completion pause are dead.
    // Percentages use the two credited canonical live-time totals, without renderer input.
    if (
      (previous.scenario === 'open_play' || previous.restart?.phase === 'release') &&
      previous.restart?.phase !== 'setup' &&
      previous.status !== 'half_time' &&
      previous.goalCompletionUntil === undefined
    )
      accounting[previous.possessionTeam].possessionSeconds += elapsed;
    const restart = next.restart;
    if (restart) {
      const id = `${next.seed}:restart:${restart.startedAt}:${restart.restartTeam}:${next.scenario}`;
      if (!containsIdentity(result.observedRestartIds ?? [], id)) {
        result.observedRestartIds = [...(result.observedRestartIds ?? []), id];
        const team = accounting[restart.restartTeam];
        if (next.scenario === 'corner') team.corners++;
        if (next.scenario.startsWith('free_kick')) team.freeKicks++;
        if (next.scenario === 'throw_in') team.throwIns++;
        if (next.scenario === 'goal_kick' || next.scenario === 'gk_short')
          team.goalKicks = (team.goalKicks ?? 0) + 1;
        if (next.scenario === 'penalty') team.penalties = (team.penalties ?? 0) + 1;
        if (next.scenario === 'kick_off') team.kickOffs = (team.kickOffs ?? 0) + 1;
      }
    }
    const offside = next.lastOffsideOffence;
    let newOffsidePlayerId: string | undefined;
    if (offside) {
      const id = `${next.seed}:offside:${offside.at}:${offside.playerId}`;
      if (!containsIdentity(result.observedOffsideIds ?? [], id)) {
        result.observedOffsideIds = [...(result.observedOffsideIds ?? []), id];
        const team = result.playerTeams?.[offside.playerId];
        if (team) accounting[team].offsides++;
        newOffsidePlayerId = offside.playerId;
      }
    }
    const appendIdentity = (key: IdentityHistory, id: string) => {
      result[key] = [...(result[key] ?? []), id];
    };
    const mutableNetwork = () => {
      if (result.passingNetwork === statistics.passingNetwork)
        result.passingNetwork = statistics.passingNetwork.map((edge) => ({ ...edge }));
      return result.passingNetwork;
    };
    const playersById = new Map(result.players.map((entry) => [entry.playerId, entry]));
    const stats = (id: string) => playersById.get(id);
    if (newOffsidePlayerId) {
      const offender = stats(newOffsidePlayerId);
      if (offender) offender.offsides = (offender.offsides ?? 0) + 1;
    }
    for (const entry of result.players) {
      entry.fouls = next.defensiveTelemetry?.byPlayer[entry.playerId]?.fouls ?? entry.fouls ?? 0;
      entry.yellowCards = next.discipline?.[entry.playerId]?.yellowCards ?? entry.yellowCards ?? 0;
      entry.redCards = next.discipline?.[entry.playerId]?.sentOff ? 1 : (entry.redCards ?? 0);
      entry.offsides ??= 0;
      entry.looseBallRecoveries ??= 0;
      entry.blocks ??= 0;
      entry.duelsWon ??= 0;
    }
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
    // Removal from the active array preserves history, including the exact canonical dismissal
    // time rather than the preceding physics tick. Terminal observers cannot extend minutes.
    for (const entry of result.players) {
      const sentOffAt = next.discipline?.[entry.playerId]?.sentOffAt;
      if (sentOffAt !== undefined) {
        entry.minutesPlayed = sentOffAt / 60;
        if (sentOffAt !== previous.discipline?.[entry.playerId]?.sentOffAt) {
          // The player moved earlier in this tick before the referee removed the active body.
          // showCard retains that final telemetry; subsequent observations keep it frozen.
          const finalEntry = next.statistics?.players.find(
            (player) => player.playerId === entry.playerId,
          );
          if (finalEntry) {
            entry.distanceCovered = finalEntry.distanceCovered;
            entry.sprintDistance = finalEntry.sprintDistance;
            entry.sprintBursts = finalEntry.sprintBursts;
            entry.maxSpeed = finalEntry.maxSpeed;
          }
        }
      }
    }
    const newContacts = [];
    for (const contact of collectContactEvidence(previous, next)) {
      if (containsIdentity(result.observedContactIds, contact.id)) continue;
      appendIdentity('observedContactIds', contact.id);
      newContacts.push(contact);
    }
    const control = projectControlEpisodes(
      previous,
      next,
      newContacts,
      statistics.activeControlEpisode,
    );
    for (const episode of control.started) {
      const player = stats(episode.playerId);
      if (player) player.touches++;
    }
    const physicalContact = next.lastBallContact;
    if (
      physicalContact?.kind === 'defender' &&
      physicalContact.playerId &&
      newContacts.some(
        (contact) =>
          contact.source === 'flight_contact' &&
          contact.playerId === physicalContact.playerId &&
          contact.at === physicalContact.at,
      )
    ) {
      const blocker = stats(physicalContact.playerId);
      if (blocker) blocker.blocks++;
    }
    if (control.active) result.activeControlEpisode = control.active;
    else delete result.activeControlEpisode;
    const action = next.latestAction;
    if (action?.type === 'carry' && next.ballCarrierIntent?.actorId === action.actorId) {
      const carryId = `${next.seed}:carry:${next.ballCarrierIntent.startedAt}:${action.actorId}`;
      if (!containsIdentity(result.observedCarryIds, carryId)) {
        appendIdentity('observedCarryIds', carryId);
        stats(action.actorId)!.carries++;
      }
    }
    // A preselected human reception action can release the next pass in the same physics tick.
    // Its incoming completion remains a canonical fact even though the launch diagnostic changed.
    const passes = new Map(
      [next.lastResolvedPass, next.lastPassDiagnostic]
        .filter((pass): pass is NonNullable<typeof pass> => Boolean(pass))
        .map((pass) => [pass.passId, pass]),
    );
    for (const pass of passes.values()) {
      if (pass.passerId === pass.intendedReceiverId) {
        if (!containsIdentity(result.observedPassAttemptIds, pass.passId))
          appendIdentity('observedPassAttemptIds', pass.passId);
        if (pass.finalResult && !containsIdentity(result.observedPassResultIds, pass.passId))
          appendIdentity('observedPassResultIds', pass.passId);
        continue;
      }
      if (pass && !containsIdentity(result.observedPassAttemptIds, pass.passId)) {
        appendIdentity('observedPassAttemptIds', pass.passId);
        stats(pass.passerId)!.passesAttempted++;
        const edge = mutableNetwork().find(
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
      if (pass.finalResult && !containsIdentity(result.observedPassResultIds, pass.passId)) {
        appendIdentity('observedPassResultIds', pass.passId);
        if (
          pass.finalResult === 'completed' &&
          pass.actualContactPoint &&
          pass.resolvedAt !== undefined &&
          (pass.actualReceiverId ?? pass.intendedReceiverId) !== pass.passerId
        ) {
          stats(pass.passerId)!.passesCompleted++;
          const receiverId = pass.actualReceiverId ?? pass.intendedReceiverId;
          stats(receiverId)!.passesReceived++;
          // A completed edge describes the realized football relationship. Reattribute the
          // original attempt, rather than inventing an attempt for the physical receiver.
          // The selected target remains canonically recorded in the pass diagnostic.
          if (receiverId !== pass.intendedReceiverId) {
            const intendedEdge = mutableNetwork().find(
              (edge) =>
                edge.passerId === pass.passerId && edge.receiverId === pass.intendedReceiverId,
            );
            if (intendedEdge) intendedEdge.attempted--;
            const realized = result.passingNetwork.find(
              (edge) => edge.passerId === pass.passerId && edge.receiverId === receiverId,
            );
            if (realized) realized.attempted++;
            else
              result.passingNetwork.push({
                passerId: pass.passerId,
                receiverId,
                attempted: 1,
                completed: 0,
              });
            result.passingNetwork = result.passingNetwork.filter(
              (edge) => edge.attempted !== 0 || edge.completed !== 0,
            );
          }
          const completedEdge = mutableNetwork().find(
            (edge) => edge.passerId === pass.passerId && edge.receiverId === receiverId,
          );
          if (completedEdge) completedEdge.completed++;
          else
            result.passingNetwork.push({
              passerId: pass.passerId,
              receiverId,
              attempted: 1,
              completed: 1,
            });
          result.assistCandidate = {
            passerId: pass.passerId,
            scorerId: receiverId,
            passId: pass.passId,
          };
        }
      }
    }
    const shot = next.ball.shot ?? next.lastShot;
    if (shot && !containsIdentity(result.observedShotIds, shot.shotId)) {
      appendIdentity('observedShotIds', shot.shotId);
      const shooter = stats(shot.shooterId)!;
      shooter.shots++;
    }
    const shotResult = next.lastShot;
    if (shotResult?.outcome && !containsIdentity(result.observedShotResultIds, shotResult.shotId)) {
      const shot = shotResult;
      appendIdentity('observedShotResultIds', shot.shotId);
      const shooter = stats(shot.shooterId)!;
      // Posts and crossbars which stay out are off-target. Blocks are a separate outcome.
      if (['goal', 'save'].includes(shot.outcome ?? '')) shooter.shotsOnTarget++;
      if (shot.outcome === 'goal') shooter.goals++;
      if (shot.outcome === 'block') {
        const team = result.playerTeams?.[shot.shooterId];
        if (team) accounting[team].blockedShots++;
      }
      if (
        shot.outcome === 'goal' &&
        result.assistCandidate?.scorerId === shot.shooterId &&
        result.assistCandidate.passerId !== shot.shooterId &&
        !containsIdentity(result.observedAssistGoalIds, shot.shotId)
      ) {
        stats(result.assistCandidate.passerId)!.assists++;
        appendIdentity('observedAssistGoalIds', shot.shotId);
      }
      const defendingTeam = next.players.find((player) => player.id === shot.shooterId)?.team;
      const keeper = next.players.find(
        (player) =>
          player.team !== defendingTeam && player.profile.primaryPosition === 'goalkeeper',
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
    // The intent identity counts one legitimate attempt, even while contact is still pending.
    // A copied result can be observed after an unrelated challenge; history, not adjacency,
    // supplies exactly-once accounting. A clean win belongs to the challenger, never whichever
    // teammate happens to own the ball at the observation boundary.
    for (const challenge of [next.defensiveChallenge, next.lastChallenge]) {
      if (!challenge || containsIdentity(result.observedChallengeIds ?? [], challenge.id)) continue;
      appendIdentity('observedChallengeIds', challenge.id);
      const challenger = stats(challenge.actorId);
      if (challenger) challenger.tacklesAttempted++;
    }
    const challenge = next.lastChallenge;
    if (challenge && !containsIdentity(result.observedChallengeResultIds ?? [], challenge.id)) {
      appendIdentity('observedChallengeResultIds', challenge.id);
      if (challenge.outcome === 'clean_win') {
        const challenger = stats(challenge.actorId);
        if (challenger) {
          challenger.tacklesWon++;
          challenger.duelsWon++;
        }
      }
    }
    const aerial = next.lastAerialContact;
    if (aerial?.id && aerial.winnerId && aerial.contestantIds.length > 1) {
      const duelId = aerial.id;
      const winnerTeam = result.playerTeams?.[aerial.winnerId];
      const contested = aerial.contestantIds.some(
        (id) => result.playerTeams?.[id] && result.playerTeams[id] !== winnerTeam,
      );
      if (contested && !containsIdentity(result.observedDuelIds ?? [], duelId)) {
        appendIdentity('observedDuelIds', duelId);
        const winner = stats(aerial.winnerId);
        if (winner) winner.duelsWon++;
      }
    }
    // The source records a recovery before the winner can release again in this tick.
    // Same-team second balls count too; restart placement and pass receptions do not.
    const recovery = next.lastBallRecovery;
    if (recovery && !containsIdentity(result.observedRecoveryIds ?? [], recovery.id)) {
      appendIdentity('observedRecoveryIds', recovery.id);
      const winner = stats(recovery.playerId);
      if (winner) winner.looseBallRecoveries++;
    }
    const change = next.lastPossessionChange;
    const eventId = change
      ? `${change.at}:${change.from}:${change.to}:${change.cause}${change.winnerId ? `:${change.winnerId}` : ''}`
      : undefined;
    if (change && eventId && !containsIdentity(result.observedPossessionEvents, eventId)) {
      appendIdentity('observedPossessionEvents', eventId);
      accounting[change.to].possessionChanges = (accounting[change.to].possessionChanges ?? 0) + 1;
      const winnerId = change.winnerId ?? next.ball.ownerId;
      const winner = winnerId ? stats(winnerId) : undefined;
      if (winner) {
        winner.possessionWon++;
        if (change.cause === 'interception') winner.interceptions++;
      }
      const loserId = change.winnerId ? change.loserId : (change.loserId ?? previous.ball.ownerId);
      const loser = loserId ? stats(loserId) : undefined;
      if (loser) loser.possessionLost++;
      // A controlled opponent possession invalidates the direct-provider chain. A later reclaim is
      // a new attacking sequence and cannot revive the old pass.
      const candidateTeam = result.assistCandidate
        ? next.players.find((player) => player.id === result.assistCandidate!.scorerId)?.team
        : undefined;
      if (candidateTeam && change.to !== candidateTeam) delete result.assistCandidate;
    }
    return result;
  } finally {
    endPerformanceSpan('statistics', statisticsSpan);
  }
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
  possessionWon: true,
  possessionLost: true,
  looseBallRecoveries: true,
  blocks: true,
  duelsWon: true,
  fouls: true,
  yellowCards: true,
  redCards: true,
  offsides: true,
  distanceCovered: true,
  sprintDistance: true,
  sprintBursts: true,
  maxSpeed: true,
  saves: true,
  goalsConceded: true,
  catches: true,
  parries: true,
});

/** Import/export and benchmark validation. All public passes have one canonical target;
 * a realized completion moves that original attempt to the physical receiver's edge. */
export const assertMatchStatisticsInvariants = (statistics: MatchStatistics) => {
  const attempts = new Map<string, number>();
  const completed = new Map<string, number>();
  const received = new Map<string, number>();
  for (const edge of statistics.passingNetwork) {
    if (
      edge.passerId === edge.receiverId ||
      edge.completed > edge.attempted ||
      edge.attempted < 0 ||
      edge.completed < 0
    )
      throw new Error('Passing network invariant failed: invalid edge or self pass.');
    attempts.set(edge.passerId, (attempts.get(edge.passerId) ?? 0) + edge.attempted);
    completed.set(edge.passerId, (completed.get(edge.passerId) ?? 0) + edge.completed);
    received.set(edge.receiverId, (received.get(edge.receiverId) ?? 0) + edge.completed);
  }
  for (const player of statistics.players) {
    if (
      (attempts.get(player.playerId) ?? 0) !== player.passesAttempted ||
      (completed.get(player.playerId) ?? 0) !== player.passesCompleted ||
      (received.get(player.playerId) ?? 0) !== player.passesReceived ||
      player.passesReceived > player.touches ||
      player.shotsOnTarget > player.shots ||
      player.goals > player.shotsOnTarget ||
      player.interceptions > player.possessionWon ||
      player.tacklesWon > player.tacklesAttempted
    )
      throw new Error(`Public statistics invariant failed for ${player.playerId}.`);
  }
};
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
