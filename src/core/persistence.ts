import { z } from 'zod';
import type { CareerState, CareerWorldDelta, WorldFootballer } from '../types/domain';
import { careerStateSchema } from '../schemas/domainSchemas';
import { WORLD_DATABASE_VERSION } from './worldDatabase';
import { withCanonicalBirthDate } from './age';
import { rememberFacts } from './history/careerMemory';
import { parseProceduralFootballerId } from './proceduralFootballers';

export const CAREER_SAVE_VERSION = 7;
export const CAREER_SAVE_KEY = 'mfl.careerSave.v3';
/** Audit-derived soft ceiling: full deterministic careers stay well below typical 5 MiB quotas. */
export const CAREER_SAVE_SOFT_BUDGET_BYTES = 3_000_000;
export const careerSaveSchema = z.object({
  version: z.literal(CAREER_SAVE_VERSION),
  savedAt: z.string().datetime(),
  career: careerStateSchema,
});
export type CareerSave = z.infer<typeof careerSaveSchema>;
export type PersistedCareerState = Omit<
  CareerState,
  'clubWorld' | 'footballerWorld' | 'youthCohorts'
>;

const PERSISTED_CAREER_KEYS = [
  'seed',
  'difficulty',
  'currentSeason',
  'careerSeasonNumber',
  'player',
  'currentClub',
  'previousClubIds',
  'significantPeople',
  'relationships',
  'historyFacts',
  'careerMemory',
  'storyThreads',
  'statistics',
  'activeEvent',
  'finances',
  'developmentProgress',
  'activeMatch',
  'matchHistory',
  'careerCalendar',
  'recentVariantKeys',
  'leagueSeason',
  'decisionPoint',
  'fastForwardLog',
  'playerAvailability',
  'seasonOutcome',
  'seasonStartingAttributes',
  'seasonBaselineOverall',
  'currentContract',
  'professionalOffers',
  'careerPhase',
  'currentDate',
  'currentProfessionalClub',
  'currentSportingStatus',
  'careerStatus',
  'retirementDate',
  'retirementAge',
  'retirementReason',
  'highestOVR',
  'highestOVRDate',
  'developmentProfile',
  'worldDatabaseVersion',
  'worldDelta',
  'completedSeasons',
  'seasonParticipation',
  'trainingApproach',
  'trainingPlan',
  'individualFocus',
  'selectionStanding',
  'agentPreferences',
  'renegotiation',
] as const satisfies readonly (keyof PersistedCareerState)[];

const PERSISTED_WORLD_DELTA_KEYS = [
  'clubOverrides',
  'footballerOverrides',
  'footballerStateOverrides',
  'footballerAttributeOverrides',
  'npcClubMembership',
  'youthCohortOverrides',
  'newFootballers',
  'retiredFootballerIds',
  'professionalMarketExitCount',
  'managerOverrides',
  'managerMoveRecords',
  'managerLifecycleProcessedThroughSeason',
  'npcTransferRecords',
  'summerMarketDiagnostics',
  'criticalSquadRepairRecords',
  'npcRetirementProcessedThroughSeason',
  'npcTransferMarketProcessedThroughSeason',
  'youthGraduationProcessedThroughSeason',
  'currentGraduateIds',
  'squadRepairProcessedThroughSeason',
] as const satisfies readonly (keyof CareerWorldDelta)[];

/** Nested allow-list: runtime indexes and diagnostics cannot leak into browser saves. */
export const toPersistedWorldDelta = (delta: CareerWorldDelta): CareerWorldDelta =>
  Object.fromEntries(
    PERSISTED_WORLD_DELTA_KEYS.flatMap((key) =>
      delta[key] === undefined ? [] : [[key, delta[key]]],
    ),
  ) as unknown as CareerWorldDelta;

/** Explicit allow-list boundary: runtime additions never become persistent by accident. */
export const toPersistedCareerState = (career: CareerState): PersistedCareerState =>
  Object.fromEntries(
    PERSISTED_CAREER_KEYS.flatMap((key) =>
      career[key] === undefined
        ? []
        : [[key, key === 'worldDelta' ? toPersistedWorldDelta(career.worldDelta!) : career[key]]],
    ),
  ) as PersistedCareerState;
export type LoadCareerResult =
  | { ok: true; save: CareerSave }
  | {
      ok: false;
      reason:
        | 'missing'
        | 'invalid_json'
        | 'incompatible_version'
        | 'unsupported_world_database'
        | 'invalid_data';
    };
const LEGACY_MIDFIELD_POSITIONS = new Set(['defensive_midfielder', 'attacking_midfielder']);
const LEGACY_ARCHETYPE_IDS: Record<string, string> = {
  classic_creator: 'playmaker',
  regista: 'playmaker',
  dribbling_creator: 'mezzala',
  carillero: 'box_to_box',
  ball_winner: 'defensive_midfielder',
  half_back: 'defensive_midfielder',
  withdrawn_forward: 'raumdeuter',
};
/** The single versioned compatibility boundary for PR80 positional data. */
export const migrateLegacyMidfieldPositions = (value: unknown): unknown => {
  if (typeof value === 'string')
    return LEGACY_MIDFIELD_POSITIONS.has(value) ? 'central_midfielder' : value;
  if (Array.isArray(value)) return value.map(migrateLegacyMidfieldPositions);
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const migrated = Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !LEGACY_MIDFIELD_POSITIONS.has(key))
      .map(([key, item]) => {
        const next =
          key === 'footballArchetypeId' && typeof item === 'string'
            ? (LEGACY_ARCHETYPE_IDS[item] ?? item)
            : migrateLegacyMidfieldPositions(item);
        return [
          key,
          key === 'secondaryPositions' && Array.isArray(next) ? [...new Set(next)] : next,
        ];
      }),
  );
  const familiarities = ['central_midfielder', 'defensive_midfielder', 'attacking_midfielder']
    .map((key) => source[key])
    .filter((item): item is number => typeof item === 'number');
  if (familiarities.length) migrated.central_midfielder = Math.max(...familiarities);
  return migrated;
};
export type CareerPersistenceErrorKind =
  | 'validation_failure'
  | 'serialization_failure'
  | 'quota_exceeded'
  | 'indexeddb_unavailable'
  | 'transaction_failure'
  | 'storage_failure';
export class CareerPersistenceError extends Error {
  constructor(
    public readonly kind: CareerPersistenceErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CareerPersistenceError';
  }
}
export const getCareerPersistenceMessage = (error: unknown) => {
  if (!(error instanceof CareerPersistenceError)) return 'Nie udało się zapisać kariery.';
  switch (error.kind) {
    case 'validation_failure':
      return 'Nie można zapisać kariery, ponieważ jej dane są niespójne.';
    case 'serialization_failure':
      return 'Nie można przygotować danych kariery do zapisu.';
    case 'quota_exceeded':
      return 'Brak miejsca na zapis kariery w pamięci przeglądarki.';
    case 'indexeddb_unavailable':
      return 'Baza IndexedDB jest niedostępna. Zapis działa w ograniczonym trybie lokalnym.';
    case 'transaction_failure':
      return 'Nie udało się zakończyć transakcji zapisu kariery.';
    default:
      return 'Przeglądarka nie pozwoliła zapisać kariery.';
  }
};
const migrateBirthDates = (career: CareerState): CareerState => {
  const referenceDate = `${career.currentSeason - career.careerSeasonNumber + 1}-07-01`;
  const migrateWorld = (records: Record<string, WorldFootballer> | undefined) =>
    records
      ? Object.fromEntries(
          Object.entries(records).map(([id, footballer]) => [
            id,
            { ...footballer, profile: withCanonicalBirthDate(footballer.profile, referenceDate) },
          ]),
        )
      : records;
  return {
    ...career,
    player: withCanonicalBirthDate(career.player, referenceDate),
    significantPeople: career.significantPeople.map((person) =>
      withCanonicalBirthDate(person, referenceDate),
    ),
    ...(career.worldDelta
      ? {
          worldDelta: {
            ...career.worldDelta,
            newFootballers: migrateWorld(career.worldDelta.newFootballers)!,
            footballerOverrides: migrateWorld(career.worldDelta.footballerOverrides)!,
          },
        }
      : {}),
  };
};
export const createCareerSave = (
  career: CareerState,
  savedAt = new Date().toISOString(),
): CareerSave => {
  let result: ReturnType<typeof careerSaveSchema.safeParse>;
  try {
    const persistableCareer = toPersistedCareerState(migrateBirthDates(career));
    result = careerSaveSchema.safeParse({
      version: CAREER_SAVE_VERSION,
      savedAt,
      career: persistableCareer,
    });
  } catch (error) {
    console.error('career save normalization failed', error);
    throw new CareerPersistenceError('validation_failure', 'Career save normalization failed', {
      cause: error,
    });
  }
  if (!result.success) {
    console.error('career save validation failed', result.error.issues);
    throw new CareerPersistenceError('validation_failure', 'Career save validation failed', {
      cause: result.error,
    });
  }
  return result.data;
};
/** Backwards-compatible pure save preparation. Browser writes live in src/persistence. */
export const saveCareer = createCareerSave;
/** Uses the exact persistable representation without touching browser storage. */
export const serializeCareerSave = (career: CareerState): string => {
  return JSON.stringify(createCareerSave(career, new Date(0).toISOString()));
};

export const serializeCurrentCareerSave = (career: CareerState): string => {
  try {
    return JSON.stringify(createCareerSave(career));
  } catch (error) {
    if (error instanceof CareerPersistenceError) throw error;
    throw new CareerPersistenceError('serialization_failure', 'Career serialization failed', {
      cause: error,
    });
  }
};

const serializedBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** Test/dev-only attribution; values are independent JSON estimates, not additive save compression. */
export const measureCareerSaveSections = (career: CareerState) => {
  const delta = career.worldDelta;
  return {
    totalSave: new TextEncoder().encode(serializeCareerSave(career)).length,
    newFootballers: serializedBytes(delta?.newFootballers ?? {}),
    footballerOverrides: serializedBytes(delta?.footballerOverrides ?? {}),
    footballerStateOverrides: serializedBytes(delta?.footballerStateOverrides ?? {}),
    retiredFootballerIds: serializedBytes(delta?.retiredFootballerIds ?? []),
    professionalMarketExitCount: serializedBytes(delta?.professionalMarketExitCount ?? 0),
    npcTransferRecords: serializedBytes(delta?.npcTransferRecords ?? []),
    historyFacts: serializedBytes(career.historyFacts),
    careerMemory: serializedBytes(career.careerMemory ?? {}),
    completedSeasons: serializedBytes(career.completedSeasons ?? []),
    archivedHistoricalMatches: serializedBytes(
      (career.completedSeasons ?? []).flatMap((season) => season.matches),
    ),
    leagueSeason: serializedBytes(career.leagueSeason ?? {}),
    seasonParticipation: serializedBytes(career.seasonParticipation ?? []),
    matchHistory: serializedBytes(career.matchHistory ?? []),
    youthCohortOverrides: serializedBytes(delta?.youthCohortOverrides ?? {}),
    npcClubMembership: serializedBytes(delta?.npcClubMembership ?? {}),
    managerState: serializedBytes({
      managerOverrides: delta?.managerOverrides ?? {},
      managerMoveRecords: delta?.managerMoveRecords ?? [],
    }),
    otherWorldDelta: serializedBytes(
      delta
        ? Object.fromEntries(
            Object.entries(delta).filter(
              ([key]) =>
                ![
                  'footballerStateOverrides',
                  'newFootballers',
                  'footballerOverrides',
                  'retiredFootballerIds',
                  'professionalMarketExitCount',
                  'npcTransferRecords',
                  'youthCohortOverrides',
                  'npcClubMembership',
                ].includes(key),
            ),
          )
        : {},
    ),
  };
};

/* Legacy payloads are intentionally decoded structurally before the v6 schema can validate them. */
/* eslint-disable @typescript-eslint/no-explicit-any */
const migrateV5Save = (save: Record<string, unknown>): unknown => {
  const source = save.career as Record<string, any>;
  const technical = new Set([
    'career_week_completed',
    'training_development_checkpoint',
    'attribute_changed',
    'regular_season_decision',
    'fixture_rescheduled',
    'match_played',
    'interactive_match',
  ]);
  const protectedIds = new Set<string>(
    (source.storyThreads ?? [])
      .filter((thread: any) => thread.status !== 'closed')
      .flatMap((thread: any) => thread.relatedFactIds ?? []),
  );
  const removed = (source.historyFacts ?? []).filter(
    (fact: any) => technical.has(fact.factType) && !protectedIds.has(fact.id),
  );
  const historyFacts = (source.historyFacts ?? []).filter((fact: any) => !removed.includes(fact));
  const retainedIds = new Set<string>(historyFacts.map((fact: any) => fact.id));
  const compactMatch = (match: any) => ({
    matchId: match.fixtureId ?? match.matchId,
    date: match.date,
    opponentId: match.opponentId,
    venue: match.venue,
    ...(match.score ? { score: match.score } : {}),
    started: Boolean(match.started),
    substitute: !match.started && match.minutes > 0,
    ...(match.assignedPosition ? { assignedPosition: match.assignedPosition } : {}),
    minutes: match.minutes ?? 0,
    goals: match.goals ?? 0,
    assists: match.assists ?? 0,
    ...(match.rating !== undefined ? { rating: match.rating } : {}),
    ...(match.yellowCards ? { yellowCards: match.yellowCards } : {}),
    ...(match.redCard ? { redCard: match.redCard } : {}),
    ...(match.goalkeeperStats
      ? {
          goalkeeper: {
            saves: match.goalkeeperStats.saves,
            goalsConceded: match.goalkeeperStats.goalsConceded,
            cleanSheet: match.goalkeeperStats.cleanSheet,
          },
        }
      : {}),
  });
  const completedSeasons = (source.completedSeasons ?? []).map((season: any) => ({
    ...season,
    development: {
      seasonEndAttributes: season.development.seasonEndAttributes,
      seasonStartOVR: season.development.seasonStartOVR,
      seasonEndOVR: season.development.seasonEndOVR,
    },
    matches: (season.matches ?? season.fixtures ?? []).map(compactMatch),
    fixtures: undefined,
    milestones: (season.milestones ?? []).filter((id: string) => retainedIds.has(id)),
  }));
  const currentStart = `${source.currentSeason}-07-01`;
  const career: Record<string, any> = {
    ...source,
    historyFacts,
    careerMemory: rememberFacts(source.careerMemory, removed),
    completedSeasons,
    matchHistory: (source.matchHistory ?? []).filter((match: any) => match.date >= currentStart),
    storyThreads: (source.storyThreads ?? []).map((thread: any) => ({
      ...thread,
      relatedFactIds: (thread.relatedFactIds ?? []).filter((id: string) => retainedIds.has(id)),
    })),
    ...(source.playerAvailability
      ? {
          playerAvailability: {
            ...source.playerAvailability,
            injuries: (source.playerAvailability.injuries ?? []).filter(
              (injury: any) => injury.status === 'active',
            ),
            processedMatchIds: (source.playerAvailability.processedMatchIds ?? []).filter(
              (id: string) =>
                (source.seasonParticipation ?? []).some(
                  (record: any) => record.appearanceMatchId === id,
                ),
            ),
          },
        }
      : {}),
  };
  delete career.clubWorld;
  delete career.footballerWorld;
  delete career.youthCohorts;
  return { ...save, version: 6, career };
};
/**
 * v6 membership precedence is deliberately player-centric: squadOverrides establish membership,
 * then footballerStateOverrides.currentClubId wins, and retirement wins over both.
 */
export const migrateV6WorldDelta = (source: Record<string, any>): Record<string, any> => {
  const membership: Record<string, string | null> = {};
  for (const [clubId, ids] of Object.entries(source.squadOverrides ?? {}))
    for (const id of ids as string[]) membership[id] = clubId;
  const states = Object.fromEntries(
    Object.entries(source.footballerStateOverrides ?? {}).flatMap(([id, raw]) => {
      const state = raw as Record<string, any>;
      if ('currentClubId' in state) membership[id] = state.currentClubId ?? null;
      const compact = 'currentContract' in state ? { currentContract: state.currentContract } : {};
      return Object.keys(compact).length ? [[id, compact]] : [];
    }),
  );
  for (const id of source.retiredFootballerIds ?? []) delete membership[id];
  return {
    ...source,
    footballerStateOverrides: states,
    npcClubMembership: membership,
    newFootballers: Object.fromEntries(
      Object.entries(source.newFootballers ?? {}).filter(
        ([id]) => !parseProceduralFootballerId(id),
      ),
    ),
    squadOverrides: undefined,
  };
};

const migrateV6Save = (save: Record<string, any>): unknown => ({
  ...save,
  version: CAREER_SAVE_VERSION,
  career: {
    ...save.career,
    ...(save.career?.worldDelta ? { worldDelta: migrateV6WorldDelta(save.career.worldDelta) } : {}),
  },
});
/* eslint-enable @typescript-eslint/no-explicit-any */
export const parseCareerSave = (raw: string | null): LoadCareerResult => {
  if (!raw) return { ok: false, reason: 'missing' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  if (
    typeof parsed === 'object' &&
    parsed &&
    'version' in parsed &&
    ![3, 4, 5, 6, CAREER_SAVE_VERSION].includes(parsed.version as number)
  )
    return { ok: false, reason: 'incompatible_version' };
  if (
    typeof parsed === 'object' &&
    parsed &&
    'version' in parsed &&
    [3, 4].includes(parsed.version as number)
  )
    parsed = {
      ...parsed,
      career: migrateLegacyMidfieldPositions((parsed as Record<string, unknown>).career),
    };
  if (
    typeof parsed === 'object' &&
    parsed &&
    'version' in parsed &&
    [3, 4, 5].includes(parsed.version as number)
  )
    parsed = migrateV5Save(parsed as Record<string, unknown>);
  if (
    typeof parsed === 'object' &&
    parsed &&
    'version' in parsed &&
    [6].includes(parsed.version as number)
  )
    parsed = migrateV6Save(parsed as Record<string, never>);
  const result = careerSaveSchema.safeParse(parsed);
  if (!result.success) return { ok: false, reason: 'invalid_data' };
  if (result.data.career.worldDatabaseVersion !== WORLD_DATABASE_VERSION)
    return { ok: false, reason: 'unsupported_world_database' };
  return {
    ok: true,
    save: {
      ...result.data,
      career: migrateBirthDates(result.data.career),
    },
  };
};
export const hydrateCareerWithWorld = (
  career: CareerState,
  world: import('../types/domain').WorldDatabase,
): CareerState => {
  if (career.worldDatabaseVersion !== world.version)
    throw new Error(
      `Zapis wymaga świata ${career.worldDatabaseVersion ?? 'nieznanego'}, a wczytano ${world.version}.`,
    );
  return careerStateSchema.parse(
    migrateLegacyMidfieldPositions({
      ...career,
      clubWorld: world.clubs,
      footballerWorld: world.footballers,
      youthCohorts: world.youthCohorts,
    }),
  );
};
