import { z } from 'zod';
import { getCareerNpcPlayStyles } from './npcCareerIdentity';
import {
  footballerProfileSchema,
  formationSlotSchema,
  professionalClubSchema,
} from '../schemas/domainSchemas';
import type { CareerState, WorldDatabase } from '../types/domain';
import { FORMATIONS } from './footballerWorld';
import { singleMatchSetupSchema } from './singleMatch';
import { createCareerSingleMatchSession, recoverCareerFitnessToDate } from './careerFitness';
import { getCurrentFixture } from './careerWeeks';
import { settleLeagueRound } from './leagueSeason';
import { recordParticipation } from './seasonParticipation';
import { availabilityState, getPlayerAvailability } from './playerAvailability';
import { conditionRecoveryDate } from './fitnessRecovery';
import { WORLD_DATABASE_SEED, WORLD_DATABASE_VERSION, emptyWorldDelta } from './worldDatabase';
import { createTacticalMatch } from './matchSimulation/matchSimulation';
import { matchInjurySchema } from './matchSimulation/matchInjuries';
import {
  DEFAULT_SUBSTITUTION_RULES,
  matchSubstitutionRulesSchema,
  substitutionFactSchema,
} from './matchSimulation/substitutions';
import { teamAccountingSchema } from './matchSimulation/playerMatchStats';
import {
  matchTerminationSchema,
  playerDecisionOutcomeSchema,
  type TacticalMatchState,
} from './matchSimulation/matchState';
import { cardFactSchema } from './matchSimulation/matchRules';
import { matchVisualContextSchema, toCanonicalFootballProfile } from './visualIdentity';
import {
  evaluatePlayStyleUnlocks,
  getUnlockedPlayStyles,
  playStyleEvidenceSchema,
  playStyleIdSchema,
  qualifyingPlayStyles,
  type PlayStyleEvidence,
} from './playStyles';
import { applyAppearanceConsequences } from './appearanceConsequences';
import { retainCareerMatchResults } from './careerMatchRetention';
import { recordCanonicalCareerMilestones } from './careerMatchMilestones';
import { compactMatchParticipant } from './careerMatchSummary';
import {
  careerMatchContinuationSchema,
  careerMatchParticipantSchema,
} from './careerMatchProvenance';

export const MATCH_CONTRACT_VERSION = 1;
export const MATCH_RESULT_MAX_BYTES = 96_000;
const id = z.string().min(1).max(256);
const count = z.number().int().min(0).max(1_000_000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rosterPlayer = z.object({
  footballerId: id,
  profile: footballerProfileSchema.omit({ visualIdentity: true }),
  condition: z.number().min(0).max(100),
  injury: matchInjurySchema.optional(),
  playStyles: z.array(playStyleIdSchema).max(6).optional(),
});
const team = z.object({
  club: professionalClubSchema,
  formation: z.enum(
    Object.keys(FORMATIONS) as [keyof typeof FORMATIONS, ...Array<keyof typeof FORMATIONS>],
  ),
  strength: z.number().min(0).max(100),
  players: z
    .array(
      rosterPlayer.extend({
        slotIndex: z.number().int().min(0).max(10),
        slot: formationSlotSchema,
        x: z.number().min(-8).max(113),
        y: z.number().min(-8).max(76),
      }),
    )
    .length(11),
  bench: z.array(rosterPlayer).max(9),
});
const fixtureSchema = z.object({
  id,
  seasonId: id,
  date,
  competitionId: id,
  homeClubId: id,
  awayClubId: id,
  roundIndex: z.number().int().nonnegative(),
  ownerPlayerId: id,
  ownerCareerSeed: id,
});
const worldSchema = z.object({
  version: z.literal(WORLD_DATABASE_VERSION),
  seed: z.literal(WORLD_DATABASE_SEED),
  generationPolicy: z.literal('canonical-base-with-career-overlays-v1'),
});
const careerMatchBaseSchema = z
  .object({
    version: z.literal(MATCH_CONTRACT_VERSION),
    fixture: fixtureSchema,
    world: worldSchema,
    footballSeed: id,
    footballFingerprint: id,
    session: z.object({ setup: singleMatchSetupSchema, home: team, away: team }),
    substitutionRules: matchSubstitutionRulesSchema,
    // These defaults document the current engine, rather than claiming unsupported weather physics.
    environment: z.object({
      pitch: z.literal('standard_105x68'),
      ball: z.literal('canonical-default'),
      weather: z.literal('neutral'),
    }),
    presentation: z.object({
      seed: id,
      stadiumId: id,
      visualPlayerIds: z.record(id, id),
      visualContext: matchVisualContextSchema.optional(),
    }),
  })
  .strict();
export const careerMatchInputSchema = careerMatchBaseSchema.superRefine((input, context) => {
  const seen = new Set<string>();
  for (const side of ['home', 'away'] as const) {
    const value = input.session[side];
    if (
      value.club.id !== input.fixture[`${side}ClubId`] ||
      value.club.id !== input.session.setup[`${side}ClubId`]
    )
      context.addIssue({ code: 'custom', message: 'Fixture and session team mismatch.' });
    if (new Set(value.players.map((p) => p.slotIndex)).size !== 11)
      context.addIssue({ code: 'custom', message: 'Starting XI must cover eleven unique slots.' });
    for (const player of [...value.players, ...value.bench]) {
      if (seen.has(player.footballerId) || player.footballerId !== player.profile.id)
        context.addIssue({
          code: 'custom',
          message: 'Duplicate or inconsistent participant identity.',
        });
      seen.add(player.footballerId);
    }
    for (const player of value.players)
      if (
        contractFingerprint(player.slot) !==
        contractFingerprint(FORMATIONS[value.formation][player.slotIndex])
      )
        context.addIssue({ code: 'custom', message: 'Formation slot mismatch.' });
  }
  if (
    input.session.setup.seed !== input.footballSeed ||
    input.footballFingerprint !== footballFingerprint(input)
  )
    context.addIssue({ code: 'custom', message: 'Football input fingerprint mismatch.' });
});
export type CareerMatchInput = z.infer<typeof careerMatchInputSchema>;

/** Stable local integrity checksum, not a cryptographic signature. No presentation RNG is consumed. */
export const contractFingerprint = (value: unknown): string => {
  const stable = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(stable)
      : item && typeof item === 'object'
        ? Object.fromEntries(
            Object.entries(item)
              .filter(([, v]) => v !== undefined)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, stable(v)]),
          )
        : item;
  let hash = 2166136261;
  for (const char of JSON.stringify(stable(value)))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/** The receipt records UI handoff context, but presentation must not choose football RNG. */
export const continuationFootballFingerprint = (
  prefix: z.infer<typeof careerMatchContinuationSchema>['prefix'],
) => {
  const { unselectedDecision: _presentation, ...football } = prefix;
  void _presentation;
  return contractFingerprint(football);
};
const footballFingerprint = (
  input: Pick<
    CareerMatchInput,
    'fixture' | 'world' | 'footballSeed' | 'session' | 'environment' | 'substitutionRules'
  >,
) =>
  contractFingerprint({
    fixture: input.fixture,
    world: input.world,
    footballSeed: input.footballSeed,
    session: {
      setup: input.session.setup,
      ...Object.fromEntries(
        (['home', 'away'] as const).map((side) => [
          side,
          {
            ...input.session[side],
            players: input.session[side].players.map((player) => ({
              ...player,
              profile: toCanonicalFootballProfile(player.profile),
            })),
            bench: input.session[side].bench.map((player) => ({
              ...player,
              profile: toCanonicalFootballProfile(player.profile),
            })),
          },
        ]),
      ),
    },
    environment: input.environment,
    substitutionRules: input.substitutionRules,
  });

export const createCareerMatchInput = (
  career: CareerState,
  world: WorldDatabase,
  presentationSeed = `${career.seed}:presentation`,
  forceIntoXI = false,
): CareerMatchInput => {
  const fixture = getCurrentFixture(career);
  const league = career.leagueSeason;
  if (!fixture || !league) throw new Error('A current career fixture is required.');
  const roundIndex = league.rounds.findIndex((r) => r.fixtures.some((f) => f.id === fixture.id));
  const canonical = league.rounds[roundIndex]?.fixtures.find((f) => f.id === fixture.id);
  if (!canonical || canonical.completed)
    throw new Error('Fixture is missing or already completed.');
  if (!getPlayerAvailability(career, fixture.date).available)
    throw new Error('Controlled career player is unavailable for this fixture.');
  if (world.version !== career.worldDatabaseVersion || world.seed !== WORLD_DATABASE_SEED)
    throw new Error('Career/world version mismatch.');
  const footballSeed = `${career.seed}:canonical:${league.id}:${fixture.id}`;
  const session = createCareerSingleMatchSession(
    career,
    world,
    {
      homeClubId: canonical.homeClubId,
      awayClubId: canonical.awayClubId,
      seed: footballSeed,
      control: {
        mode: 'player',
        clubId: league.controlledClubId,
        footballerId: career.player.id,
        forceIntoXI,
      },
    },
    fixture.date,
  );
  for (const side of ['home', 'away'] as const)
    session[side].bench = (session[side].bench ?? []).slice(0, 7);
  for (const side of ['home', 'away'] as const)
    for (const p of [...session[side].players, ...(session[side].bench ?? [])])
      p.playStyles =
        p.footballerId === career.player.id
          ? getUnlockedPlayStyles(career)
          : getCareerNpcPlayStyles(career, p.profile).map((value) => value.style);
  const base = {
    version: MATCH_CONTRACT_VERSION,
    fixture: {
      id: fixture.id,
      seasonId: league.id,
      date: fixture.date,
      competitionId: league.competition.id,
      homeClubId: canonical.homeClubId,
      awayClubId: canonical.awayClubId,
      roundIndex,
      ownerPlayerId: career.player.id,
      ownerCareerSeed: career.seed,
    },
    world: {
      version: WORLD_DATABASE_VERSION,
      seed: WORLD_DATABASE_SEED,
      generationPolicy: 'canonical-base-with-career-overlays-v1' as const,
    },
    footballSeed,
    session: {
      ...session,
      home: {
        ...session.home,
        players: session.home.players.map((p) => ({ ...p, condition: p.condition ?? 100 })),
        bench: session.home.bench ?? [],
      },
      away: {
        ...session.away,
        players: session.away.players.map((p) => ({ ...p, condition: p.condition ?? 100 })),
        bench: session.away.bench ?? [],
      },
    },
    substitutionRules: { ...DEFAULT_SUBSTITUTION_RULES, namedBenchSize: 7 },
    environment: {
      pitch: 'standard_105x68' as const,
      ball: 'canonical-default' as const,
      weather: 'neutral' as const,
    },
    presentation: {
      seed: presentationSeed,
      ...(session.presentation ? { visualContext: session.presentation } : {}),
      stadiumId: `stadium:${canonical.homeClubId}`,
      visualPlayerIds: Object.fromEntries(
        [
          ...session.home.players,
          ...session.away.players,
          ...(session.home.bench ?? []),
          ...(session.away.bench ?? []),
        ].map((p) => [p.footballerId, `visual:${p.footballerId}`]),
      ),
    },
  };
  const normalized = careerMatchBaseSchema.parse({ ...base, footballFingerprint: 'pending' });
  return careerMatchInputSchema.parse({
    ...normalized,
    footballFingerprint: footballFingerprint(normalized),
  });
};
export const startCareerMatch = (raw: unknown): TacticalMatchState => {
  const input = careerMatchInputSchema.parse(raw);
  return { ...createTacticalMatch(input.session), substitutionRules: input.substitutionRules };
};

const aggregate = z.object({
  kind: id,
  attempts: count,
  resolved: count,
  retained: count,
  turnovers: count,
  completedPasses: count,
  progressTotal: z.number().finite(),
  pressureTotal: z.number().nonnegative(),
  firstSelectedAt: z.number().nonnegative(),
  lastResolvedAt: z.number().nonnegative().optional(),
});
export const careerMatchResultSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    continuation: careerMatchContinuationSchema.optional(),
    completedMatchId: id,
    inputFingerprint: id,
    fixture: fixtureSchema,
    world: worldSchema,
    footballSeed: id,
    status: z.enum(['full_time', 'abandoned']),
    termination: matchTerminationSchema.optional(),
    endedAt: z.number().nonnegative().max(10800),
    score: z.object({ home: count, away: count }),
    participants: z.array(careerMatchParticipantSchema).min(22).max(40),
    teamAccounting: z.object({ home: teamAccountingSchema, away: teamAccountingSchema }),
    substitutions: z.array(substitutionFactSchema).max(10),
    cards: z.array(cardFactSchema).max(80),
    controlledEvidence: z.object({
      playerId: id,
      selected: count,
      resolved: count,
      byIntent: z.array(aggregate).max(32),
      recentOutcomes: z.array(playerDecisionOutcomeSchema).max(12),
      behaviour: z.array(playStyleEvidenceSchema).max(6).optional(),
    }),
    narrativeFacts: z
      .array(
        z.object({
          kind: z.enum(['score', 'goal', 'card', 'injury', 'substitution']),
          at: z.number().nonnegative().optional(),
          actorId: id.optional(),
          data: z.record(id, z.union([z.string().max(256), z.number().finite(), z.boolean()])),
        }),
      )
      .max(24),
  })
  .strict()
  .superRefine((result, ctx) => {
    if ((result.version === 2) !== Boolean(result.continuation))
      ctx.addIssue({ code: 'custom', message: 'Continuation requires result contract v2.' });
    const bridge = result.continuation;
    if (bridge) {
      const prefix = bridge.prefix;
      if (
        result.status !== 'full_time' ||
        Math.abs(result.endedAt - bridge.handoffAt - bridge.remainingSeconds) > 0.001 ||
        contractFingerprint(prefix) !== bridge.prefixFingerprint ||
        bridge.seed !==
          `${result.footballSeed}:remainder:${bridge.handoffAt}:${continuationFootballFingerprint(prefix)}` ||
        prefix.controlledEvidenceFingerprint !== contractFingerprint(result.controlledEvidence) ||
        contractFingerprint(prefix.cards) !== contractFingerprint(result.cards) ||
        contractFingerprint(prefix.substitutions) !== contractFingerprint(result.substitutions) ||
        contractFingerprint(prefix.teamAccounting) !== contractFingerprint(result.teamAccounting) ||
        prefix.score.home > result.score.home ||
        prefix.score.away > result.score.away ||
        prefix.participants.length !== result.participants.length ||
        new Set(prefix.participants.map((p) => p.id)).size !== prefix.participants.length ||
        bridge.remainingSeconds !==
          (prefix.period === 'half_time'
            ? 2700
            : Math.max(0, prefix.periodEndAt - bridge.handoffAt) +
              (prefix.period === 'first_half' ? 2700 : 0)) ||
        new Set(prefix.activeIds).size !== prefix.activeIds.length
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid canonical-to-summary prefix or chronology.',
        });
      for (const before of prefix.participants) {
        const after = result.participants.find((p) => p.id === before.id);
        const minutes = prefix.activeIds.includes(before.id) ? bridge.remainingSeconds / 60 : 0;
        const eligible =
          !before.stats.redCards &&
          !['unable', 'absence'].includes(before.injury?.status ?? '') &&
          !prefix.substitutions.some((s) => s.outgoingId === before.id);
        const { minutesPlayed: _beforeMinutes, ...beforeStats } = before.stats;
        const { minutesPlayed: _afterMinutes, ...afterStats } = after?.stats ?? before.stats;
        void _beforeMinutes;
        void _afterMinutes;
        if (
          !after ||
          prefix.activeIds.includes(before.id) !== eligible ||
          contractFingerprint(beforeStats) !== contractFingerprint(afterStats) ||
          after.stats.minutesPlayed !== before.stats.minutesPlayed + minutes ||
          after.team !== before.team ||
          after.started !== before.started ||
          after.position !== before.position ||
          after.condition > before.condition ||
          (!minutes && after.condition !== before.condition) ||
          contractFingerprint(after.injury ?? null) !==
            contractFingerprint(before.injury ?? null) ||
          before.stats.minutesPlayed > bridge.handoffAt / 60 + 0.01 ||
          (minutes > 0 &&
            (before.stats.redCards > 0 ||
              ['unable', 'absence'].includes(before.injury?.status ?? '') ||
              prefix.substitutions.some((s) => s.outgoingId === before.id)))
        )
          ctx.addIssue({
            code: 'custom',
            message: 'Continuation changes canonical evidence or inactive participation.',
          });
      }
      if (
        prefix.activeIds.some((id) => !prefix.participants.some((p) => p.id === id)) ||
        prefix.events.some((event) => event.at > bridge.handoffAt) ||
        prefix.cards.some((card) => card.at > bridge.handoffAt) ||
        prefix.substitutions.some((s) => s.enteredAt > bridge.handoffAt)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Prefix contains future or unknown participation.',
        });
    }
    if (
      (result.status === 'full_time' && (result.endedAt < 5400 || result.termination)) ||
      (result.status === 'abandoned' &&
        (!result.termination || result.termination.at !== result.endedAt))
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid terminal match outcome.' });
    if (new Set(result.participants.map((p) => p.id)).size !== result.participants.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate result participant.' });
    for (const p of result.participants)
      if (
        p.id !== p.stats.playerId ||
        p.stats.minutesPlayed > result.endedAt / 60 + 0.01 ||
        p.stats.passesCompleted > p.stats.passesAttempted ||
        p.stats.goals > p.stats.shots
      )
        ctx.addIssue({ code: 'custom', message: 'Impossible participant statistics.' });
    if (result.controlledEvidence.resolved > result.controlledEvidence.selected)
      ctx.addIssue({ code: 'custom', message: 'Resolved decisions exceed selections.' });
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MATCH_RESULT_MAX_BYTES)
      ctx.addIssue({ code: 'custom', message: 'Result exceeds bounded persistence contract.' });
  });
export type CareerMatchResult = z.infer<typeof careerMatchResultSchema>;

/** Observer owned by the caller, never by the simulation state. Captures bounded deliberate decisions. */
export class CareerMatchEvidence {
  private selected = new Set<string>();
  private resolved = new Set<string>();
  private groups = new Map<string, z.infer<typeof aggregate>>();
  private outcomes: z.infer<typeof playerDecisionOutcomeSchema>[] = [];
  private cards = new Map<string, z.infer<typeof cardFactSchema>>();
  private behaviour = new Map<string, PlayStyleEvidence>();
  private windows = new Set<string>();
  observe(state: TacticalMatchState) {
    for (const card of state.recentCards ?? []) this.cards.set(card.id, card);
    if (state.lastCard) this.cards.set(state.lastCard.id, state.lastCard);
    for (const outcome of [state.pendingPlayerDecision, state.lastPlayerDecisionOutcome]) {
      if (!outcome || outcome.actorId !== state.controlledFootballerId) continue;
      const kind = `${outcome.decisionKind}:${outcome.selectedIntent}`;
      const key = this.groups.has(kind) || this.groups.size < 31 ? kind : 'other';
      const group = this.groups.get(key) ?? {
        kind: key,
        attempts: 0,
        resolved: 0,
        retained: 0,
        turnovers: 0,
        completedPasses: 0,
        progressTotal: 0,
        pressureTotal: 0,
        firstSelectedAt: outcome.selectedAt,
      };
      if (!this.selected.has(outcome.decisionId)) {
        this.selected.add(outcome.decisionId);
        group.attempts++;
        group.pressureTotal += outcome.startContext.pressure;
      }
      if (outcome.result && !this.resolved.has(outcome.decisionId)) {
        this.resolved.add(outcome.decisionId);
        group.resolved++;
        group.retained += Number(outcome.result.retainedPossession ?? false);
        group.turnovers += Number(outcome.result.turnover ?? false);
        group.completedPasses += Number(outcome.result.passCompleted ?? false);
        group.progressTotal += outcome.result.progressDelta ?? 0;
        group.lastResolvedAt = outcome.resolvedAt;
        this.outcomes = [...this.outcomes.slice(-11), structuredClone(outcome)];
        for (const style of qualifyingPlayStyles(outcome)) {
          // At most one useful situation per five match minutes/style, capped per fixture.
          const window = `${style}:${Math.floor(outcome.selectedAt / 300)}`;
          const value = this.behaviour.get(style) ?? {
            style,
            situations: 0,
            successes: 0,
            contexts: [],
          };
          if (this.windows.has(window) || value.situations >= 8) continue;
          this.windows.add(window);
          value.situations++;
          value.successes += Number(
            Boolean(
              outcome.result.passCompleted ||
                outcome.result.duelWon ||
                outcome.result.retainedPossession ||
                outcome.result.teamRetainedPossession ||
                ['goal', 'save', 'post', 'crossbar'].includes(outcome.result.shotOutcome ?? ''),
            ),
          );
          const context = `${outcome.startContext.phase}:${outcome.startContext.pressure >= 0.5 ? 'pressed' : 'space'}`;
          if (!value.contexts.includes(context)) value.contexts.push(context);
          this.behaviour.set(style, value);
        }
      }
      this.groups.set(key, group);
    }
  }
  snapshot(playerId: string) {
    return {
      playerId,
      selected: this.selected.size,
      resolved: this.resolved.size,
      byIntent: [...this.groups.values()].map((g) => ({ ...g })),
      recentOutcomes: structuredClone(this.outcomes),
      behaviour: [...this.behaviour.values()].map((value) => structuredClone(value)),
    };
  }
  cardFacts() {
    return [...this.cards.values()];
  }
}

export const captureCareerMatchParticipants = (
  input: CareerMatchInput,
  state: TacticalMatchState,
) => {
  const bodies = [
    ...state.players,
    ...(state.departedPlayers ?? []),
    ...(state.substitutionState?.pending.map((p) => p.outgoing) ?? []),
  ];
  return (state.statistics?.players ?? []).map((stats) => {
    const body = bodies.find((p) => p.id === stats.playerId);
    if (!body?.fitness) throw new Error('Missing actual participant condition.');
    const side = body.team;
    return {
      id: body.id,
      team: side,
      started: input.session[side].players.some((p) => p.footballerId === body.id),
      stats,
      condition: body.fitness.longTermCapacity * 100,
      ...(body.injury ? { injury: body.injury } : {}),
      position: body.slot.position,
    };
  });
};

export const finishCareerMatch = (
  raw: unknown,
  state: TacticalMatchState,
  evidence: CareerMatchEvidence,
): CareerMatchResult => {
  const input = careerMatchInputSchema.parse(raw);
  if (
    (state.status !== 'full_time' && state.status !== 'abandoned') ||
    state.seed !== input.footballSeed ||
    state.teams.home.clubId !== input.fixture.homeClubId ||
    state.teams.away.clubId !== input.fixture.awayClubId
  )
    throw new Error('Only the matching completed canonical fixture may produce a result.');
  evidence.observe(state);
  const participants = captureCareerMatchParticipants(input, state);
  const substitutions = state.substitutionState?.completed ?? [];
  const cards = evidence.cardFacts();
  const result = careerMatchResultSchema.parse({
    version: MATCH_CONTRACT_VERSION,
    completedMatchId: `${input.fixture.id}:${input.footballFingerprint}`,
    inputFingerprint: input.footballFingerprint,
    fixture: input.fixture,
    world: input.world,
    footballSeed: input.footballSeed,
    status: state.status,
    ...(state.termination ? { termination: state.termination } : {}),
    endedAt: state.time,
    score: state.score,
    participants,
    teamAccounting: state.statistics?.teamAccounting,
    substitutions,
    cards,
    controlledEvidence: evidence.snapshot(input.fixture.ownerPlayerId),
    narrativeFacts: [
      { kind: 'score', at: state.time, data: { home: state.score.home, away: state.score.away } },
      ...participants
        .filter((p) => p.stats.goals > 0)
        .map((p) => ({
          kind: 'goal',
          actorId: p.id,
          data: { goals: p.stats.goals, summary: true },
        })),
      ...cards.map((c) => ({ kind: 'card', at: c.at, actorId: c.actorId, data: { kind: c.kind } })),
      ...participants
        .filter((p) => p.injury)
        .map((p) => ({
          kind: 'injury',
          at: p.injury!.at,
          actorId: p.id,
          data: { status: p.injury!.status, recoveryDays: p.injury!.recoveryDays },
        })),
      ...substitutions.map((s) => ({
        kind: 'substitution',
        at: s.enteredAt,
        actorId: s.incomingId,
        data: { outgoingId: s.outgoingId },
      })),
    ].slice(0, 24),
  });
  validateResultParticipants(input, result);
  return result;
};

const validateResultParticipants = (input: CareerMatchInput, result: CareerMatchResult) => {
  const named = new Map(
    (['home', 'away'] as const).flatMap((side) =>
      [...input.session[side].players, ...input.session[side].bench].map(
        (p) => [p.footballerId, side] as const,
      ),
    ),
  );
  if (
    result.inputFingerprint !== input.footballFingerprint ||
    result.completedMatchId !== `${input.fixture.id}:${input.footballFingerprint}` ||
    contractFingerprint(result.fixture) !== contractFingerprint(input.fixture) ||
    contractFingerprint(result.world) !== contractFingerprint(input.world) ||
    result.footballSeed !== input.footballSeed ||
    result.controlledEvidence.playerId !== input.fixture.ownerPlayerId
  )
    throw new Error('Result input/provenance mismatch.');
  const starters = new Set(
    [...input.session.home.players, ...input.session.away.players].map((p) => p.footballerId),
  );
  const entered = new Set(result.substitutions.map((s) => s.incomingId));
  for (const p of result.participants) {
    if (named.get(p.id) !== p.team) throw new Error('Result contains an unnamed participant.');
    if (p.started !== starters.has(p.id) || (!p.started && !entered.has(p.id)))
      throw new Error('Participant did not enter this match.');
  }
  for (const side of ['home', 'away'] as const)
    if (
      result.substitutions.filter((s) => s.team === side).length >
        input.substitutionRules.maximumSubstitutions ||
      (result.continuation &&
        (result.continuation.prefix.substitutionUsage[side] !==
          result.substitutions.filter((s) => s.team === side).length ||
          (input.substitutionRules.maximumOpportunities !== null &&
            result.continuation.prefix.substitutionOpportunities[side] >
              input.substitutionRules.maximumOpportunities)))
    )
      throw new Error('Substitution allowance exceeded or lost during continuation.');
  for (const side of ['home', 'away'] as const)
    for (const p of input.session[side].players)
      if (!result.participants.some((r) => r.id === p.footballerId && r.started))
        throw new Error('Starting participant missing from result.');
  const active = new Set(starters);
  const used = new Set(starters);
  for (const s of [...result.substitutions].sort((a, b) => a.enteredAt - b.enteredAt)) {
    if (
      named.get(s.outgoingId) !== s.team ||
      named.get(s.incomingId) !== s.team ||
      !active.has(s.outgoingId) ||
      used.has(s.incomingId) ||
      s.requestedAt > s.leftAt ||
      s.leftAt > s.enteredAt ||
      s.enteredAt > result.endedAt ||
      !result.participants.some((p) => p.id === s.incomingId)
    )
      throw new Error('Invalid substitution identities.');
    active.delete(s.outgoingId);
    active.add(s.incomingId);
    used.add(s.incomingId);
  }
  for (const c of result.cards)
    if (named.get(c.actorId) !== c.team) throw new Error('Invalid card identity.');
};

/** One immutable commit, before a caller saves. Existing v7 history/fixture/condition fields own persistence. */
export const applyCareerMatchResult = (
  career: CareerState,
  world: WorldDatabase,
  rawInput: unknown,
  rawResult: unknown,
): CareerState => {
  const input = careerMatchInputSchema.parse(rawInput),
    result = careerMatchResultSchema.parse(rawResult);
  validateResultParticipants(input, result);
  const f = result.fixture,
    league = career.leagueSeason;
  if (
    f.ownerPlayerId !== career.player.id ||
    f.ownerCareerSeed !== career.seed ||
    world.version !== result.world.version ||
    world.seed !== result.world.seed ||
    career.worldDatabaseVersion !== world.version
  )
    throw new Error('Result does not belong to this career calendar/world.');
  const factId = `canonical_match:${f.id}`;
  const prior = career.historyFacts.find((fact) => fact.id === factId);
  if (prior) {
    if (prior.data.resultFingerprint !== contractFingerprint(result))
      throw new Error('Conflicting completion for an already committed fixture.');
    return career;
  }
  const fixture = career.careerCalendar?.fixtures.find((item) => item.id === f.id);
  const leagueFixture = league?.rounds[f.roundIndex]?.fixtures.find((item) => item.id === f.id);
  if (
    f.ownerPlayerId !== career.player.id ||
    f.ownerCareerSeed !== career.seed ||
    f.seasonId !== league?.id ||
    f.competitionId !== league.competition.id ||
    world.version !== result.world.version ||
    world.seed !== result.world.seed ||
    career.worldDatabaseVersion !== world.version ||
    !fixture ||
    fixture.date !== f.date ||
    !leagueFixture ||
    leagueFixture.homeClubId !== f.homeClubId ||
    leagueFixture.awayClubId !== f.awayClubId
  )
    throw new Error('Result does not belong to this career calendar/world.');
  if (
    leagueFixture.completed ||
    getCurrentFixture(career)?.id !== f.id ||
    createCareerMatchInput(
      career,
      world,
      undefined,
      input.session.setup.control.mode === 'player' && input.session.setup.control.forceIntoXI,
    ).footballFingerprint !== input.footballFingerprint
  )
    throw new Error('Fixture is completed, stale or is not the current career input.');
  const recovered = recoverCareerFitnessToDate(career, f.date);
  const delta = recovered.worldDelta ?? emptyWorldDelta(),
    conditions = { ...delta.footballerConditionOverrides };
  for (const p of result.participants)
    if (p.stats.minutesPlayed > 0)
      conditions[p.id] = {
        capacity: p.condition,
        lastUpdatedDate: f.date,
        lastAppearanceDate: f.date,
        lastAppearanceMinutes: p.stats.minutesPlayed,
        lastMatchId: result.completedMatchId,
        source: result.continuation ? 'canonical_plus_summary' : 'canonical',
        ...(p.injury && p.injury.recoveryDays > 0
          ? {
              injuryUntilDate: conditionRecoveryDate(f.date, p.injury.recoveryDays),
              injuryStatus: p.injury.status,
            }
          : {}),
      };
  const controlled = result.participants.find((p) => p.id === career.player.id);
  const stats = controlled?.stats;
  const availability = availabilityState(career);
  const yellows = stats?.yellowCards ?? 0;
  const red = result.cards.find((c) => c.actorId === career.player.id && c.kind !== 'yellow');
  let next: CareerState = {
    ...recovered,
    currentDate: f.date,
    careerCalendar: { ...career.careerCalendar!, currentDate: f.date },
    player: { ...recovered.player, fitness: controlled?.condition ?? recovered.player.fitness },
    worldDelta: { ...delta, footballerConditionOverrides: conditions },
    playerAvailability: {
      ...availability,
      injuries:
        controlled?.injury && controlled.injury.recoveryDays > 0
          ? [
              ...availability.injuries.filter((injury) => injury.id !== controlled.injury!.id),
              {
                id: controlled.injury.id,
                startDate: f.date,
                canonicalRecoveryDate: conditionRecoveryDate(
                  f.date,
                  controlled.injury.recoveryDays,
                ),
                severity:
                  controlled.injury.status === 'playable'
                    ? ('knock' as const)
                    : controlled.injury.recoveryDays >= 14
                      ? ('moderate' as const)
                      : ('minor' as const),
                injuryType:
                  controlled.injury.injuryType === 'muscle'
                    ? ('strain' as const)
                    : controlled.injury.injuryType === 'joint'
                      ? ('joint_injury' as const)
                      : ('bruise' as const),
                matchesRemaining: Math.ceil(controlled.injury.recoveryDays / 7),
                source: 'match' as const,
                status: 'active' as const,
              },
            ]
          : availability.injuries,
      leagueYellowCards: availability.leagueYellowCards + yellows,
      suspensionMatchesRemaining: Math.max(
        availability.suspensionMatchesRemaining,
        red
          ? red.kind === 'red'
            ? 3
            : 1
          : Math.floor((availability.leagueYellowCards + yellows) / 4) >
              Math.floor(availability.leagueYellowCards / 4)
            ? 1
            : 0,
      ),
    },
    matchHistory:
      stats && stats.minutesPlayed > 0
        ? [
            ...(career.matchHistory ?? []),
            {
              matchId: result.completedMatchId,
              date: f.date,
              opponentId: fixture.opponent.id,
              teamLevel: league.competition.category === 'professional' ? 'senior' : 'academy',
              metricsSource: result.continuation ? 'canonical_plus_summary' : 'canonical',
              started: controlled!.started,
              assignedPosition: controlled!.position,
              minutes: stats.minutesPlayed,
              goals: stats.goals,
              assists: stats.assists,
              xG: 0,
              xA: 0,
              keyPasses: 0,
              defensiveActions: stats.tacklesWon + stats.interceptions,
              saves: stats.saves,
              personalImpact: 0,
              yellowCards: yellows,
              ...(controlled?.injury ? { injuryId: controlled.injury.id } : {}),
              ...(red
                ? { redCard: red.kind === 'red' ? ('direct' as const) : ('second_yellow' as const) }
                : {}),
            },
          ]
        : career.matchHistory,
    historyFacts: [
      ...career.historyFacts,
      {
        id: factId,
        factType: 'canonical_match_result',
        season: career.currentSeason,
        date: f.date,
        actors: [career.player.id],
        targets: [],
        clubs: [f.homeClubId, f.awayClubId],
        competitions: [f.competitionId],
        data: {
          contractVersion: result.version,
          resultFingerprint: contractFingerprint(result),
          result,
          summary: {
            retentionVersion: 1,
            ...(result.continuation
              ? {
                  provenance: {
                    source: result.continuation.source,
                    handoffAt: result.continuation.handoffAt,
                    prefixFingerprint: result.continuation.prefixFingerprint,
                    coverage: result.continuation.coverage,
                    canonicalEvents: result.continuation.prefix.events,
                    substitutions: result.continuation.prefix.substitutions,
                    canonicalMinutes:
                      stats?.minutesPlayed !== undefined
                        ? result.continuation.prefix.participants.find(
                            (p) => p.id === career.player.id,
                          )?.stats.minutesPlayed
                        : null,
                  },
                }
              : {}),
            completedMatchId: result.completedMatchId,
            inputFingerprint: result.inputFingerprint,
            fixture: f,
            status: result.status,
            score: result.score,
            teamNames: { home: input.session.home.club.name, away: input.session.away.club.name },
            teamAccounting: result.teamAccounting,
            playerStatistics: stats ?? null,
            participants: result.participants.map(compactMatchParticipant),
            styles: result.controlledEvidence.behaviour ?? [],
            cards: result.cards,
            narrativeFacts: result.narrativeFacts,
          },
        },
        causes: [],
        tags: ['match', 'canonical'],
        visibility: 'public',
        narrativeImportance: 50,
        emotionalTone: 'neutral',
      },
    ],
  };
  next = recordParticipation(next, {
    fixtureId: f.id,
    seasonId: f.seasonId,
    competitionId: f.competitionId,
    date: f.date,
    opponentId: fixture.opponent.id,
    venue: fixture.venue,
    competition: league.competition.name,
    homeClubId: f.homeClubId,
    awayClubId: f.awayClubId,
    fixtureStatus: 'completed',
    score: result.score,
    status: controlled?.started
      ? 'starter'
      : stats && stats.minutesPlayed > 0
        ? 'substitute'
        : [...input.session.home.bench, ...input.session.away.bench].some(
              (p) => p.footballerId === career.player.id,
            )
          ? 'unused_bench'
          : 'not_selected',
    plannedMinutes: controlled?.started ? 90 : 0,
    minutes: Math.round(stats?.minutesPlayed ?? 0),
    started: controlled?.started ?? false,
    assignedPosition: controlled?.position,
    appearanceMatchId: result.completedMatchId,
    goals: stats?.goals ?? 0,
    assists: stats?.assists ?? 0,
    // The current physical counter does not export xG/xA. Preserve ledger defaults without inventing a model.
    xG: 0,
    xA: 0,
    metricsSource: result.continuation ? 'canonical_plus_summary' : 'canonical',
    ...(stats ? { canonicalStats: stats } : {}),
    defensiveActions: (stats?.tacklesWon ?? 0) + (stats?.interceptions ?? 0),
    yellowCards: yellows,
    ...(red
      ? { redCard: red.kind === 'red' ? ('direct' as const) : ('second_yellow' as const) }
      : {}),
  });
  if (stats && stats.minutesPlayed > 0)
    next = applyAppearanceConsequences(next, next.matchHistory!.at(-1)!);
  next = recordCanonicalCareerMilestones(career, next, result);
  next = settleLeagueRound(next, f.roundIndex, {
    homeGoals: result.score.home,
    awayGoals: result.score.away,
    playerAppearanceMatchId: result.completedMatchId,
    ...(result.status === 'abandoned' ? { outcome: 'abandoned' as const } : {}),
  });
  for (let i = 0; i < 6; i++) next = evaluatePlayStyleUnlocks(next, f.date);
  return retainCareerMatchResults({ ...next, activeMatch: undefined, decisionPoint: undefined });
};
