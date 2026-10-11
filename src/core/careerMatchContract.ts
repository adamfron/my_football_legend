import { z } from 'zod';
import {
  footballerProfileSchema,
  formationSlotSchema,
  professionalClubSchema,
} from '../schemas/domainSchemas';
import type { CareerState, WorldDatabase } from '../types/domain';
import { FORMATIONS } from './footballerWorld';
import { singleMatchSetupSchema } from './singleMatch';
import { createCareerSingleMatchSession } from './careerFitness';
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
import { playerMatchStatsSchema, teamAccountingSchema } from './matchSimulation/playerMatchStats';
import { playerDecisionOutcomeSchema, type TacticalMatchState } from './matchSimulation/matchState';
import { cardFactSchema } from './matchSimulation/matchRules';
import { teamSideSchema } from './matchSimulation/matchSpace';
import { matchVisualContextSchema, toCanonicalFootballProfile } from './visualIdentity';

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
  if (!fixture || !league || league.competition.category !== 'professional')
    throw new Error('A current professional career fixture is required.');
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
    substitutionRules: DEFAULT_SUBSTITUTION_RULES,
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

const participant = z.object({
  id,
  team: teamSideSchema,
  started: z.boolean(),
  stats: playerMatchStatsSchema,
  condition: z.number().min(0).max(100),
  injury: matchInjurySchema.optional(),
  position: formationSlotSchema.shape.position,
});
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
    version: z.literal(MATCH_CONTRACT_VERSION),
    completedMatchId: id,
    inputFingerprint: id,
    fixture: fixtureSchema,
    world: worldSchema,
    footballSeed: id,
    status: z.literal('full_time'),
    endedAt: z.number().min(5400).max(10800),
    score: z.object({ home: count, away: count }),
    participants: z.array(participant).min(22).max(40),
    teamAccounting: z.object({ home: teamAccountingSchema, away: teamAccountingSchema }),
    substitutions: z.array(substitutionFactSchema).max(10),
    cards: z.array(cardFactSchema).max(80),
    controlledEvidence: z.object({
      playerId: id,
      selected: count,
      resolved: count,
      byIntent: z.array(aggregate).max(32),
      recentOutcomes: z.array(playerDecisionOutcomeSchema).max(12),
    }),
    narrativeFacts: z
      .array(
        z.object({
          kind: z.enum(['score', 'goal', 'card', 'injury', 'substitution']),
          at: z.number().nonnegative(),
          actorId: id.optional(),
          data: z.record(id, z.union([z.string().max(256), z.number().finite(), z.boolean()])),
        }),
      )
      .max(24),
  })
  .strict()
  .superRefine((result, ctx) => {
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
    };
  }
  cardFacts() {
    return [...this.cards.values()];
  }
}

export const finishCareerMatch = (
  raw: unknown,
  state: TacticalMatchState,
  evidence: CareerMatchEvidence,
): CareerMatchResult => {
  const input = careerMatchInputSchema.parse(raw);
  if (
    state.status !== 'full_time' ||
    state.seed !== input.footballSeed ||
    state.teams.home.clubId !== input.fixture.homeClubId ||
    state.teams.away.clubId !== input.fixture.awayClubId
  )
    throw new Error('Only the matching completed canonical fixture may produce a result.');
  evidence.observe(state);
  const bodies = [
    ...state.players,
    ...(state.departedPlayers ?? []),
    ...(state.substitutionState?.pending.map((p) => p.outgoing) ?? []),
  ];
  const participants = (state.statistics?.players ?? []).map((stats) => {
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
          at: state.time,
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
  const factId = `canonical_match:${f.id}`;
  const prior = career.historyFacts.find((fact) => fact.id === factId);
  if (prior) {
    if (prior.data.resultFingerprint !== contractFingerprint(result))
      throw new Error('Conflicting completion for an already committed fixture.');
    return career;
  }
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
  const delta = career.worldDelta ?? emptyWorldDelta(),
    conditions = { ...delta.footballerConditionOverrides };
  for (const p of result.participants)
    if (p.stats.minutesPlayed > 0)
      conditions[p.id] = {
        capacity: p.condition,
        lastUpdatedDate: f.date,
        lastAppearanceDate: f.date,
        lastAppearanceMinutes: p.stats.minutesPlayed,
        lastMatchId: result.completedMatchId,
        source: 'canonical',
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
    ...career,
    currentDate: f.date,
    player: { ...career.player, fitness: controlled?.condition ?? career.player.fitness },
    worldDelta: { ...delta, footballerConditionOverrides: conditions },
    playerAvailability: {
      ...availability,
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
              teamLevel: 'senior',
              started: controlled!.started,
              assignedPosition: controlled!.position,
              minutes: Math.round(stats.minutesPlayed),
              goals: stats.goals,
              assists: stats.assists,
              xG: 0,
              xA: 0,
              keyPasses: 0,
              defensiveActions: stats.tacklesWon + stats.interceptions,
              saves: stats.saves,
              personalImpact: 0,
              yellowCards: yellows,
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
          contractVersion: MATCH_CONTRACT_VERSION,
          resultFingerprint: contractFingerprint(result),
          result,
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
    competition: fixture.competition,
    homeClubId: f.homeClubId,
    awayClubId: f.awayClubId,
    fixtureStatus: 'completed',
    score: result.score,
    status: controlled?.started
      ? 'starter'
      : stats && stats.minutesPlayed > 0
        ? 'substitute'
        : 'unused_bench',
    plannedMinutes: 90,
    minutes: Math.round(stats?.minutesPlayed ?? 0),
    started: controlled?.started ?? false,
    assignedPosition: controlled?.position,
    appearanceMatchId: result.completedMatchId,
    goals: stats?.goals ?? 0,
    assists: stats?.assists ?? 0,
    // The current physical counter does not export xG/xA. Preserve ledger defaults without inventing a model.
    xG: 0,
    xA: 0,
    defensiveActions: (stats?.tacklesWon ?? 0) + (stats?.interceptions ?? 0),
    yellowCards: yellows,
    ...(red
      ? { redCard: red.kind === 'red' ? ('direct' as const) : ('second_yellow' as const) }
      : {}),
  });
  return settleLeagueRound(next, f.roundIndex, {
    homeGoals: result.score.home,
    awayGoals: result.score.away,
    playerAppearanceMatchId: result.completedMatchId,
  });
};
