import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import type { PlayerMatchStats } from './playerMatchStats';
import type { PresentationRuntimeTelemetry } from './matchPresentation';

const count = z.number().int().nonnegative();
const measure = z.number().nonnegative();
const ratio = measure.nullable();
export const canonicalParticipationCoverageSchema = z.object({
  defensiveInvolvementCoverage: z.enum(['complete', 'legacy_challenges_interceptions_only']),
  hidden: z.object({
    possessionEpisodes: count,
    passesReceived: count,
    passesAttempted: count,
    carries: count,
    shots: count,
    defensiveInvolvements: count,
    distanceMetres: measure,
    sprintDistanceMetres: measure,
  }),
  visiblePossessionEpisodes: count,
  visibleEpisodesInvolvingPlayer: count,
});
export type CanonicalParticipationCoverage = z.infer<typeof canonicalParticipationCoverageSchema>;

const defensiveInvolvements = (player: PlayerMatchStats) =>
  player.tacklesAttempted +
  player.interceptions +
  ('looseBallRecoveries' in player ? Number(player.looseBallRecoveries) : 0) +
  ('blocks' in player ? Number(player.blocks) : 0);

/** Small presentation-owned counters. No history, tactical observer, RNG, or renderer is needed.
 * A possession is attributed at its canonical start; later visibility does not reclassify it. */
export class CanonicalParticipationTracker {
  private coverage: CanonicalParticipationCoverage = {
    defensiveInvolvementCoverage: 'complete',
    hidden: {
      possessionEpisodes: 0,
      passesReceived: 0,
      passesAttempted: 0,
      carries: 0,
      shots: 0,
      defensiveInvolvements: 0,
      distanceMetres: 0,
      sprintDistanceMetres: 0,
    },
    visiblePossessionEpisodes: 0,
    visibleEpisodesInvolvingPlayer: 0,
  };
  private visibleSequenceInvolvesPlayer = false;

  beginHiddenSequence() {
    this.visibleSequenceInvolvesPlayer = false;
  }

  markVisiblePlayerInvolvement() {
    if (this.visibleSequenceInvolvesPlayer) return;
    this.visibleSequenceInvolvesPlayer = true;
    this.coverage.visibleEpisodesInvolvingPlayer++;
  }

  observe(
    previous: TacticalMatchState,
    next: TacticalMatchState,
    hidden: boolean,
    playerId = next.controlledFootballerId ?? previous.controlledFootballerId,
  ) {
    const id = playerId;
    const before = previous.statistics?.players.find((player) => player.playerId === id);
    const after = next.statistics?.players.find((player) => player.playerId === id);
    if (!before || !after) return;
    if (!('looseBallRecoveries' in after) || !('blocks' in after))
      this.coverage.defensiveInvolvementCoverage = 'legacy_challenges_interceptions_only';
    const difference = (field: keyof PlayerMatchStats) =>
      Math.max(0, Number(after[field] ?? 0) - Number(before[field] ?? 0));
    const possessions = difference('touches');
    const defense = Math.max(0, defensiveInvolvements(after) - defensiveInvolvements(before));
    if (hidden) {
      this.beginHiddenSequence();
      const target = this.coverage.hidden;
      target.possessionEpisodes += possessions;
      target.passesReceived += difference('passesReceived');
      target.passesAttempted += difference('passesAttempted');
      target.carries += difference('carries');
      target.shots += difference('shots');
      target.defensiveInvolvements += defense;
      target.distanceMetres += difference('distanceCovered');
      target.sprintDistanceMetres += difference('sprintDistance');
    } else {
      this.coverage.visiblePossessionEpisodes += possessions;
      if (possessions || defense || difference('passesAttempted') || difference('shots'))
        this.markVisiblePlayerInvolvement();
    }
  }

  snapshot(): CanonicalParticipationCoverage {
    return { ...this.coverage, hidden: { ...this.coverage.hidden } };
  }
}

const restartsSchema = z.object({
  throwIns: count,
  corners: count,
  goalKicks: count,
  freeKicks: count,
  penalties: count,
  kickOffs: count,
});
export const canonicalTeamSanitySchema = z.object({
  possessionEpisodes: count,
  passesAttempted: count,
  passesCompleted: count,
  shots: count,
  shotsOnTarget: count,
  tacklesAttempted: count,
  tacklesWon: count,
  tackleSuccess: ratio,
  interceptions: count,
  possessionChanges: count,
  possessionSeconds: measure,
  possessionShare: ratio,
  fouls: count,
  yellowCards: count,
  redCards: count,
  offsides: count,
  distanceMetres: measure,
  sprintDistanceMetres: measure,
  restarts: restartsSchema,
});
export const canonicalMatchSanitySchema = z.object({
  canonicalSeconds: measure,
  controlled: z
    .object({
      playerId: z.string(),
      team: z.enum(['home', 'away']),
      position: z.string(),
      minutes: measure,
      possessionEpisodes: count,
      passesReceived: count,
      passesAttempted: count,
      carries: count,
      shots: count,
      defense: z.object({
        attempts: count,
        tacklesWon: count,
        interceptions: count,
        possessionWon: count,
        looseBallRecoveries: count.nullable(),
        blocks: count.nullable(),
        duelsWon: count.nullable(),
      }),
      distanceMetres: measure,
      sprintDistanceMetres: measure,
      humanDecisionPrompts: count.nullable(),
      presentationCoverage: canonicalParticipationCoverageSchema.nullable(),
    })
    .nullable(),
  teams: z.object({ home: canonicalTeamSanitySchema, away: canonicalTeamSanitySchema }),
  ratios: z.object({
    controlledPlayerTouchShare: ratio,
    controlledPlayerPassShare: ratio,
    humanPromptsPer90: ratio,
    canonicalPlayerPossessionsPerHumanPrompt: ratio,
    foulsPer90: ratio,
    cardsPer90: ratio,
    penaltiesPer90: ratio,
    throwInsPer90: ratio,
  }),
  warnings: z.array(
    z.object({ code: z.string(), playerId: z.string().nullable(), evidence: z.string() }),
  ),
});
export type CanonicalMatchSanity = z.infer<typeof canonicalMatchSanitySchema>;

const divide = (value: number, denominator: number) =>
  denominator > 0 ? value / denominator : null;

/** Export-time projection of whole-match canonical counters; detailed observer coverage is irrelevant. */
export const projectCanonicalMatchSanity = (
  state: TacticalMatchState,
  presentation?: PresentationRuntimeTelemetry,
  participation?: CanonicalParticipationCoverage,
  measuredPlayerId = state.controlledFootballerId,
): CanonicalMatchSanity | null => {
  const statistics = state.statistics;
  if (!statistics) return null;
  const membership =
    statistics.playerTeams ?? Object.fromEntries(state.players.map((p) => [p.id, p.team]));
  const possessionSeconds =
    (statistics.teamAccounting?.home.possessionSeconds ?? 0) +
    (statistics.teamAccounting?.away.possessionSeconds ?? 0);
  const teamSummary = (side: 'home' | 'away') => {
    const players = statistics.players.filter((p) => membership[p.playerId] === side);
    const sum = (field: keyof PlayerMatchStats) =>
      players.reduce((total, p) => total + Number(p[field] ?? 0), 0);
    const accounting = statistics.teamAccounting?.[side];
    // Earlier canonical saves have award identities but omit some counters. Derive missing
    // values from those facts rather than exporting unmeasured zeroes in before/after audits.
    const restartScenarios = (statistics.observedRestartIds ?? [])
      .filter((id) => id.split(':').at(-2) === side)
      .map((id) => id.split(':').at(-1));
    const legacyAccounting: Record<string, number> = {
      goalKicks: restartScenarios.filter(
        (scenario) => scenario === 'goal_kick' || scenario === 'gk_short',
      ).length,
      penalties: restartScenarios.filter((scenario) => scenario === 'penalty').length,
      kickOffs: restartScenarios.filter((scenario) => scenario === 'kick_off').length,
      possessionChanges: statistics.observedPossessionEvents.filter(
        (id) => id.split(':')[2] === side,
      ).length,
    };
    const accountingValue = (field: string) =>
      accounting && typeof accounting[field as keyof typeof accounting] === 'number'
        ? Number(accounting[field as keyof typeof accounting])
        : (legacyAccounting[field] ?? 0);
    return {
      possessionEpisodes: sum('touches'),
      passesAttempted: sum('passesAttempted'),
      passesCompleted: sum('passesCompleted'),
      shots: sum('shots'),
      shotsOnTarget: sum('shotsOnTarget'),
      tacklesAttempted: sum('tacklesAttempted'),
      tacklesWon: sum('tacklesWon'),
      tackleSuccess: divide(sum('tacklesWon'), sum('tacklesAttempted')),
      interceptions: sum('interceptions'),
      possessionChanges: accountingValue('possessionChanges'),
      possessionSeconds: accounting?.possessionSeconds ?? 0,
      possessionShare: divide(accounting?.possessionSeconds ?? 0, possessionSeconds),
      fouls: sum('fouls'),
      yellowCards: sum('yellowCards'),
      redCards: sum('redCards'),
      offsides: sum('offsides'),
      distanceMetres: sum('distanceCovered'),
      sprintDistanceMetres: sum('sprintDistance'),
      restarts: {
        throwIns: accountingValue('throwIns'),
        corners: accountingValue('corners'),
        goalKicks: accountingValue('goalKicks'),
        freeKicks: accountingValue('freeKicks'),
        penalties: accountingValue('penalties'),
        kickOffs: accountingValue('kickOffs'),
      },
    };
  };
  const teams = { home: teamSummary('home'), away: teamSummary('away') };
  const player = statistics.players.find((p) => p.playerId === measuredPlayerId);
  const team = player ? membership[player.playerId] : undefined;
  const active = state.players.find((p) => p.id === measuredPlayerId);
  const extra = (field: string) =>
    player && field in player ? Number(player[field as keyof PlayerMatchStats]) : null;
  const controlled =
    player && team
      ? {
          playerId: player.playerId,
          team,
          position: active?.profile.primaryPosition ?? 'unavailable_after_removal',
          minutes: player.minutesPlayed,
          possessionEpisodes: player.touches,
          passesReceived: player.passesReceived,
          passesAttempted: player.passesAttempted,
          carries: player.carries,
          shots: player.shots,
          defense: {
            attempts: player.tacklesAttempted,
            tacklesWon: player.tacklesWon,
            interceptions: player.interceptions,
            possessionWon: player.possessionWon,
            looseBallRecoveries: extra('looseBallRecoveries'),
            blocks: extra('blocks'),
            duelsWon: extra('duelsWon'),
          },
          distanceMetres: player.distanceCovered,
          sprintDistanceMetres: player.sprintDistance,
          humanDecisionPrompts: presentation?.humanDecisionPromptsShown ?? null,
          presentationCoverage: participation ?? null,
        }
      : null;
  const per90 = (value: number) => divide(value * 5400, state.time);
  const warnings: CanonicalMatchSanity['warnings'] = [];
  if (
    controlled &&
    ['central_midfielder', 'defensive_midfielder', 'attacking_midfielder'].includes(
      controlled.position,
    ) &&
    controlled.minutes >= 30 &&
    controlled.distanceMetres >= 3000 &&
    controlled.possessionEpisodes < 10
  )
    warnings.push({
      code: 'midfielder_running_without_possession',
      playerId: controlled.playerId,
      evidence: `${controlled.possessionEpisodes} possession episodes / ${controlled.minutes.toFixed(1)} min / ${controlled.distanceMetres.toFixed(0)} m`,
    });
  for (const p of statistics.players) {
    const side = membership[p.playerId];
    if (!side) continue;
    const position = state.players.find((activePlayer) => activePlayer.id === p.playerId)?.profile
      .primaryPosition;
    if (
      position &&
      ['left_back', 'right_back', 'left_wing_back', 'right_wing_back'].includes(position) &&
      teams[side].passesAttempted >= 100 &&
      p.passesAttempted / teams[side].passesAttempted > 0.35
    )
      warnings.push({
        code: 'fullback_dominates_passing',
        playerId: p.playerId,
        evidence: `${p.passesAttempted}/${teams[side].passesAttempted} team attempted passes`,
      });
    if (p.tacklesWon > p.tacklesAttempted)
      warnings.push({
        code: 'invalid_tackle_accounting',
        playerId: p.playerId,
        evidence: `${p.tacklesWon} wins / ${p.tacklesAttempted} attempts`,
      });
  }
  const fouls = teams.home.fouls + teams.away.fouls;
  const cards =
    teams.home.yellowCards + teams.away.yellowCards + teams.home.redCards + teams.away.redCards;
  const penalties = teams.home.restarts.penalties + teams.away.restarts.penalties;
  const throwIns = teams.home.restarts.throwIns + teams.away.restarts.throwIns;
  for (const [code, value, threshold] of [
    ['high_foul_rate', fouls, 40],
    ['high_card_rate', cards, 12],
    ['high_penalty_rate', penalties, 4],
    ['high_throw_in_rate', throwIns, 70],
  ] as const)
    if (state.time >= 1800 && (per90(value) ?? 0) > threshold)
      warnings.push({
        code,
        playerId: null,
        evidence: `${value} / ${(state.time / 60).toFixed(1)} min; ${(per90(value) ?? 0).toFixed(1)} per 90`,
      });
  return canonicalMatchSanitySchema.parse({
    canonicalSeconds: state.time,
    controlled,
    teams,
    ratios: {
      controlledPlayerTouchShare: controlled
        ? divide(controlled.possessionEpisodes, teams[controlled.team].possessionEpisodes)
        : null,
      controlledPlayerPassShare: controlled
        ? divide(controlled.passesAttempted, teams[controlled.team].passesAttempted)
        : null,
      humanPromptsPer90: presentation ? per90(presentation.humanDecisionPromptsShown) : null,
      canonicalPlayerPossessionsPerHumanPrompt:
        controlled && presentation
          ? divide(controlled.possessionEpisodes, presentation.humanDecisionPromptsShown)
          : null,
      foulsPer90: per90(fouls),
      cardsPer90: per90(cards),
      penaltiesPer90: per90(penalties),
      throwInsPer90: per90(throwIns),
    },
    warnings,
  });
};
