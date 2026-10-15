import {
  careerMatchInputSchema,
  careerMatchResultSchema,
  captureCareerMatchParticipants,
  contractFingerprint,
  continuationFootballFingerprint,
  type CareerMatchInput,
  type CareerMatchEvidence,
  type CareerMatchResult,
} from './careerMatchContract';
import { careerMatchContinuationSchema } from './careerMatchProvenance';
import type { TacticalMatchState } from './matchSimulation/matchState';
import { qualifyingLostTime } from './matchSimulation/matchTimekeeping';
import { getEffectivePositionOverall } from './playerOverall';
import { simulateSummaryRemainder } from './summaryMatchContinuation';

/** A pending human decision is allowed. Referee/card/injury/substitution transitions
 * must settle first, so no legally owed consequence disappears at the boundary. */
export const canContinueCareerMatch = (state: TacticalMatchState) =>
  ['first_half', 'second_half', 'half_time'].includes(state.status ?? '') &&
  !state.substitutionState?.pending.length &&
  !state.pendingCards?.length &&
  !state.pendingAdvantage &&
  !state.pendingInjuryAssessment &&
  !state.injuryAssessment &&
  !state.defensiveChallenge &&
  !state.ball.shot &&
  !state.timekeeping?.terminalPenalty &&
  Boolean(state.statistics?.teamAccounting) &&
  (['home', 'away'] as const).every(
    (side) =>
      state.players.filter(
        (p) =>
          p.team === side &&
          !state.discipline?.[p.id]?.sentOff &&
          !['unable', 'absence'].includes(p.injury?.status ?? ''),
      ).length >= 7,
  );

/** Includes already evidenced added time. The summary creates no new stoppage ledger. */
export const remainingCareerMatchSeconds = (state: TacticalMatchState) => {
  if (state.status === 'half_time') return 2700;
  const clock = state.timekeeping;
  const nominal = clock?.nominalEndAt ?? (state.status === 'second_half' ? 5400 : 2700);
  const knownAdded = Math.ceil(qualifyingLostTime(state) / 60) * 60;
  const periodEnd = Math.max(clock?.requiredEndAt ?? nominal, nominal + knownAdded);
  return Math.max(0, periodEnd - state.time) + (state.status === 'first_half' ? 2700 : 0);
};

/** Pure, synchronous handoff: caller freezes the runtime before invoking. The original
 * state/evidence remain untouched except the observer capturing its final actual state. */
export const continueCareerMatch = (
  raw: CareerMatchInput,
  state: TacticalMatchState,
  evidence: CareerMatchEvidence,
  unselectedDecision = false,
): CareerMatchResult => {
  const input = careerMatchInputSchema.parse(raw);
  if (
    !canContinueCareerMatch(state) ||
    state.seed !== input.footballSeed ||
    state.teams.home.clubId !== input.fixture.homeClubId ||
    state.teams.away.clubId !== input.fixture.awayClubId
  )
    throw new Error('Poczekaj na zakończenie bieżącej zmiany, oceny urazu lub decyzji sędziego.');
  if (Math.abs((state.statistics?.observedThrough ?? -1) - state.time) > 0.026)
    throw new Error('Statystyki nie obejmują aktualnego stanu meczu.');
  evidence.observe(state);
  const controlledEvidence = evidence.snapshot(input.fixture.ownerPlayerId);
  const active = state.players.filter(
    (p) =>
      !state.discipline?.[p.id]?.sentOff && !['unable', 'absence'].includes(p.injury?.status ?? ''),
  );
  const participants = captureCareerMatchParticipants(input, state);
  const remainingSeconds = remainingCareerMatchSeconds(state);
  const prefix = careerMatchContinuationSchema.shape.prefix.parse({
    period: state.status,
    periodEndAt:
      state.status === 'half_time'
        ? state.time
        : state.time + remainingSeconds - (state.status === 'first_half' ? 2700 : 0),
    score: state.score,
    participants,
    activeIds: active.map((p) => p.id),
    teamAccounting: state.statistics!.teamAccounting!,
    cards: evidence.cardFacts(),
    substitutions: state.substitutionState?.completed ?? [],
    substitutionUsage: state.substitutionState?.used ?? { home: 0, away: 0 },
    substitutionOpportunities: state.substitutionState?.opportunities ?? { home: 0, away: 0 },
    events: (state.matchEvents ?? []).filter((event) =>
      ['goal', 'yellow_card', 'second_yellow_red', 'red_card', 'injury', 'substitution'].includes(
        event.kind,
      ),
    ),
    controlledEvidenceFingerprint: contractFingerprint(controlledEvidence),
    ...(state.pendingPlayerDecision && !state.pendingPlayerDecision.result
      ? {
          unresolvedDecision: {
            decisionId: state.pendingPlayerDecision.decisionId,
            selectedAt: state.pendingPlayerDecision.selectedAt,
            selectedIntent: state.pendingPlayerDecision.selectedIntent,
            disposition: 'unresolved_at_handoff' as const,
          },
        }
      : {}),
    unselectedDecision,
  });
  const prefixFingerprint = contractFingerprint(prefix);
  const seed = `${input.footballSeed}:remainder:${state.time}:${continuationFootballFingerprint(prefix)}`;
  const continuation = careerMatchContinuationSchema.parse({
    version: 1,
    source: 'canonical_plus_summary',
    handoffAt: state.time,
    remainingSeconds,
    seed,
    prefixFingerprint,
    coverage: 'canonical_prefix_only_except_minutes_and_condition',
    prefix,
  });
  const team = (side: 'home' | 'away') => {
    const players = active.filter((p) => p.team === side);
    return {
      players: players.length,
      strength:
        players.reduce(
          (sum, p) => sum + getEffectivePositionOverall(p.profile, p.slot.position),
          0,
        ) / players.length,
      condition:
        players.reduce((sum, p) => sum + (p.fitness?.longTermCapacity ?? 1) * 100, 0) /
        players.length,
    };
  };
  const suffix = simulateSummaryRemainder({
    seed,
    remainingSeconds,
    score: state.score,
    home: team('home'),
    away: team('away'),
  });
  const score = { home: state.score.home + suffix.home, away: state.score.away + suffix.away };
  const endedAt = state.time + remainingSeconds;
  return careerMatchResultSchema.parse({
    version: 2,
    continuation,
    completedMatchId: `${input.fixture.id}:${input.footballFingerprint}`,
    inputFingerprint: input.footballFingerprint,
    fixture: input.fixture,
    world: input.world,
    footballSeed: input.footballSeed,
    status: 'full_time',
    endedAt,
    score,
    participants: participants.map((p) => {
      const body = active.find((body) => body.id === p.id);
      if (!body) return p;
      const minutes = remainingSeconds / 60;
      const cost = ((minutes / 14) * 1.15) / (0.55 + body.profile.attributes.stamina / 125);
      return {
        ...p,
        stats: { ...p.stats, minutesPlayed: p.stats.minutesPlayed + minutes },
        condition: Math.max(0, p.condition - cost),
      };
    }),
    teamAccounting: prefix.teamAccounting,
    substitutions: prefix.substitutions,
    cards: prefix.cards,
    controlledEvidence,
    narrativeFacts: [
      {
        kind: 'score',
        at: endedAt,
        data: { ...score, summaryRemainder: true, handoffAt: state.time },
      },
    ],
  });
};
