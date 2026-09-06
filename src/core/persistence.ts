import { z } from 'zod';
import type { CareerState, WorldFootballer } from '../types/domain';
import { careerStateSchema } from '../schemas/domainSchemas';
import { WORLD_DATABASE_VERSION } from './worldDatabase';
import { withCanonicalBirthDate } from './age';

export const CAREER_SAVE_VERSION = 5;
export const CAREER_SAVE_KEY = 'mfl.careerSave.v3';
/** Audit-derived soft ceiling: full deterministic careers stay well below typical 5 MiB quotas. */
export const CAREER_SAVE_SOFT_BUDGET_BYTES = 3_000_000;
export const careerSaveSchema = z.object({
  version: z.literal(CAREER_SAVE_VERSION),
  savedAt: z.string().datetime(),
  career: careerStateSchema,
});
export type CareerSave = z.infer<typeof careerSaveSchema>;
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
const storageAvailable = () => typeof localStorage !== 'undefined';
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
export const saveCareer = (career: CareerState): CareerSave => {
  let result: ReturnType<typeof careerSaveSchema.safeParse>;
  try {
    const persistableCareer = { ...migrateBirthDates(career) };
    delete persistableCareer.clubWorld;
    delete persistableCareer.footballerWorld;
    delete persistableCareer.youthCohorts;
    result = careerSaveSchema.safeParse({
      version: CAREER_SAVE_VERSION,
      savedAt: new Date().toISOString(),
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
  const save = result.data;
  if (storageAvailable()) {
    let serialized: string;
    try {
      serialized = JSON.stringify(save);
    } catch (error) {
      console.error('career save serialization failed', error);
      throw new CareerPersistenceError('serialization_failure', 'Career serialization failed', {
        cause: error,
      });
    }
    try {
      localStorage.setItem(CAREER_SAVE_KEY, serialized);
    } catch (error) {
      const quotaExceeded =
        error instanceof Error &&
        (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
      console.error('career save failed', {
        kind: quotaExceeded ? 'quota_exceeded' : 'storage_failure',
        serializedBytes: new TextEncoder().encode(serialized).byteLength,
      });
      throw new CareerPersistenceError(
        quotaExceeded ? 'quota_exceeded' : 'storage_failure',
        quotaExceeded ? 'Browser storage quota exceeded' : 'Browser storage write failed',
        { cause: error },
      );
    }
  }
  return save;
};
/** Uses the exact persistable representation without touching browser storage. */
export const serializeCareerSave = (career: CareerState): string => {
  const persistableCareer = { ...migrateBirthDates(career) };
  delete persistableCareer.clubWorld;
  delete persistableCareer.footballerWorld;
  delete persistableCareer.youthCohorts;
  return JSON.stringify(
    careerSaveSchema.parse({
      version: CAREER_SAVE_VERSION,
      savedAt: new Date(0).toISOString(),
      career: persistableCareer,
    }),
  );
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
    completedSeasons: serializedBytes(career.completedSeasons ?? []),
    leagueSeason: serializedBytes(career.leagueSeason ?? {}),
    seasonParticipation: serializedBytes(career.seasonParticipation ?? []),
    matchHistory: serializedBytes(career.matchHistory ?? []),
    youthCohortOverrides: serializedBytes(delta?.youthCohortOverrides ?? {}),
    squadOverrides: serializedBytes(delta?.squadOverrides ?? {}),
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
                  'squadOverrides',
                ].includes(key),
            ),
          )
        : {},
    ),
  };
};
export const loadCareer = (): LoadCareerResult => {
  if (!storageAvailable()) return { ok: false, reason: 'missing' };
  const raw = localStorage.getItem(CAREER_SAVE_KEY);
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
    ![3, 4, CAREER_SAVE_VERSION].includes(parsed.version as number)
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
      version: CAREER_SAVE_VERSION,
      career: migrateLegacyMidfieldPositions((parsed as Record<string, unknown>).career),
    };
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
export const deleteCareer = () => {
  if (storageAvailable()) localStorage.removeItem(CAREER_SAVE_KEY);
};
export const hasValidCareer = () => loadCareer().ok;
