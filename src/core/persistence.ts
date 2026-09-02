import { z } from 'zod';
import type { CareerState, WorldFootballer } from '../types/domain';
import { careerStateSchema } from '../schemas/domainSchemas';
import { WORLD_DATABASE_VERSION } from './worldDatabase';
import { withCanonicalBirthDate } from './age';

export const CAREER_SAVE_VERSION = 3;
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
    try {
      localStorage.setItem(CAREER_SAVE_KEY, JSON.stringify(save));
    } catch (error) {
      throw new Error('Nie udało się zapisać kariery. Sprawdź dostępne miejsce w przeglądarce.', {
        cause: error,
      });
    }
  }
  return save;
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
    parsed.version !== CAREER_SAVE_VERSION
  )
    return { ok: false, reason: 'incompatible_version' };
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
  return careerStateSchema.parse({
    ...career,
    clubWorld: world.clubs,
    footballerWorld: world.footballers,
    youthCohorts: world.youthCohorts,
  });
};
export const deleteCareer = () => {
  if (storageAvailable()) localStorage.removeItem(CAREER_SAVE_KEY);
};
export const hasValidCareer = () => loadCareer().ok;
