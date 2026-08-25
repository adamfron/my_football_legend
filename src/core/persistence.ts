import { z } from 'zod';
import type { CareerState } from '../types/domain';
import { careerStateSchema } from '../schemas/domainSchemas';

export const CAREER_SAVE_VERSION = 1;
export const CAREER_SAVE_KEY = 'mfl.careerSave.v1';

export const careerSaveSchema = z.object({
  version: z.literal(CAREER_SAVE_VERSION),
  savedAt: z.string().datetime(),
  career: careerStateSchema,
});
export type CareerSave = z.infer<typeof careerSaveSchema>;
export type LoadCareerResult =
  | { ok: true; save: CareerSave }
  | { ok: false; reason: 'missing' | 'invalid_json' | 'incompatible_version' | 'invalid_data' };

const storageAvailable = () => typeof localStorage !== 'undefined';

export const saveCareer = (career: CareerState): CareerSave => {
  const save = careerSaveSchema.parse({
    version: CAREER_SAVE_VERSION,
    savedAt: new Date().toISOString(),
    career,
  });
  if (storageAvailable()) localStorage.setItem(CAREER_SAVE_KEY, JSON.stringify(save));
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
  if (
    typeof parsed === 'object' &&
    parsed &&
    'career' in parsed &&
    typeof parsed.career === 'object' &&
    parsed.career
  ) {
    const career = parsed.career as Record<string, unknown>;
    career.careerSeasonNumber ??= 1;
    career.careerPhase ??= career.currentSeason === 2026 ? 'academy' : 'regular_season';
    if (career.leagueSeason && typeof career.leagueSeason === 'object') {
      const league = career.leagueSeason as Record<string, unknown>;
      league.controlledClubId ??= (career.currentClub as Record<string, unknown>).id;
      league.competition ??=
        career.currentSeason === 2026
          ? {
              id: 'polish-u17',
              name: 'Polska Liga U-17',
              country: 'Polska',
              category: 'youth',
              ageLevel: 'U17',
            }
          : {
              id: 'polish-professional-3',
              name: 'Polska Liga Regionalna',
              country: 'Polska',
              category: 'professional',
              tier: 3,
            };
    }
    if (career.seasonOutcome && typeof career.seasonOutcome === 'object')
      (career.seasonOutcome as Record<string, unknown>).competitionType ??= 'academy';
  }
  const result = careerSaveSchema.safeParse(parsed);
  return result.success ? { ok: true, save: result.data } : { ok: false, reason: 'invalid_data' };
};
export const deleteCareer = () => {
  if (storageAvailable()) localStorage.removeItem(CAREER_SAVE_KEY);
};
export const hasValidCareer = () => loadCareer().ok;
