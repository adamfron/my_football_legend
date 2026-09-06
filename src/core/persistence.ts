import { z } from 'zod';
import type { CareerState, WorldFootballer } from '../types/domain';
import { careerStateSchema } from '../schemas/domainSchemas';
import { WORLD_DATABASE_VERSION } from './worldDatabase';
import { withCanonicalBirthDate } from './age';

export const CAREER_SAVE_VERSION = 4;
export const CAREER_SAVE_KEY = 'mfl.careerSave.v3';
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
        const next = migrateLegacyMidfieldPositions(item);
        return [key, key === 'secondaryPositions' && Array.isArray(next) ? [...new Set(next)] : next];
      }),
  );
  const familiarities = ['central_midfielder', 'defensive_midfielder', 'attacking_midfielder']
    .map((key) => source[key])
    .filter((item): item is number => typeof item === 'number');
  if (familiarities.length) migrated.central_midfielder = Math.max(...familiarities);
  return migrated;
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
  const persistableCareer = { ...migrateBirthDates(career) };
  delete persistableCareer.clubWorld;
  delete persistableCareer.footballerWorld;
  delete persistableCareer.youthCohorts;
  const save = careerSaveSchema.parse({
    version: CAREER_SAVE_VERSION,
    savedAt: new Date().toISOString(),
    career: persistableCareer,
  });
  if (storageAvailable()) {
    const serialized = JSON.stringify(save);
    try {
      localStorage.setItem(CAREER_SAVE_KEY, serialized);
    } catch (error) {
      const quotaExceeded =
        error instanceof DOMException &&
        (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
      console.error('career save failed', {
        kind: quotaExceeded ? 'quota_exceeded' : 'storage_failure',
        serializedBytes: new TextEncoder().encode(serialized).byteLength,
      });
      throw new Error('Nie udało się zapisać kariery. Sprawdź dostępne miejsce w przeglądarce.', {
        cause: error,
      });
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
    footballerStateOverrides: serializedBytes(delta?.footballerStateOverrides ?? {}),
    retiredFootballerIds: serializedBytes(delta?.retiredFootballerIds ?? []),
    professionalMarketExitCount: serializedBytes(delta?.professionalMarketExitCount ?? 0),
    npcTransferRecords: serializedBytes(delta?.npcTransferRecords ?? []),
    historyFacts: serializedBytes(career.historyFacts),
    youthCohortOverrides: serializedBytes(delta?.youthCohortOverrides ?? {}),
    squadOverrides: serializedBytes(delta?.squadOverrides ?? {}),
    otherWorldDelta: serializedBytes(
      delta
        ? Object.fromEntries(
            Object.entries(delta).filter(
              ([key]) =>
                ![
                  'footballerStateOverrides',
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
    ![3, CAREER_SAVE_VERSION].includes(parsed.version as number)
  )
    return { ok: false, reason: 'incompatible_version' };
  if (typeof parsed === 'object' && parsed && 'version' in parsed && parsed.version === 3)
    parsed = { ...parsed, version: CAREER_SAVE_VERSION, career: migrateLegacyMidfieldPositions((parsed as Record<string, unknown>).career) };
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
  return careerStateSchema.parse(migrateLegacyMidfieldPositions({
    ...career,
    clubWorld: world.clubs,
    footballerWorld: world.footballers,
    youthCohorts: world.youthCohorts,
  }));
};
export const deleteCareer = () => {
  if (storageAvailable()) localStorage.removeItem(CAREER_SAVE_KEY);
};
export const hasValidCareer = () => loadCareer().ok;
