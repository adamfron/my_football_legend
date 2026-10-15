import { z } from 'zod';
import type { CareerState, FootballerProfile, PlayStyleId, WorldFootballer } from '../types/domain';
import { hashRandomSeed } from './random/RandomGenerator';
import { playStyleIdSchema } from './playStyles';
import { compactMatchParticipantSchema } from './careerMatchSummary';

export const npcStyleSchema = z.object({
  style: playStyleIdSchema,
  source: z.enum(['established', 'development', 'career_experience']),
});
export const npcExperienceSchema = z.object({
  matches: z.number().int().nonnegative(),
  minutes: z.number().nonnegative(),
  injuryDays: z.number().nonnegative().optional(),
});
export type NpcExperience = z.infer<typeof npcExperienceSchema>;
const experienceCache = new WeakMap<
  object,
  { date: string; result: ReadonlyMap<string, NpcExperience> }
>();

/** Only retained, actually simulated participation. No invented pass/tackle histories. */
export const getNpcExperience = (
  career: Pick<CareerState, 'historyFacts'> & Partial<Pick<CareerState, 'currentDate'>>,
) => {
  const date = career.currentDate ?? '9999-12-31';
  const cached = experienceCache.get(career.historyFacts);
  if (cached?.date === date) return cached.result;
  const result = new Map<string, NpcExperience>();
  const injuries = new Set<string>();
  for (const fact of career.historyFacts) {
    if (fact.factType !== 'canonical_match_result' || fact.date > date) continue;
    const rows =
      (fact.data.summary as { participants?: unknown[] } | undefined)?.participants ?? [];
    for (const raw of rows) {
      const parsed = compactMatchParticipantSchema.safeParse(raw);
      if (!parsed.success || parsed.data[3] <= 0) continue;
      const [id, , , minutes] = parsed.data;
      const previous = result.get(id) ?? { matches: 0, minutes: 0 };
      const injury = parsed.data[11] as { id?: string; recoveryDays?: number } | null;
      const injuryKey = `${id}:${injury?.id ?? ''}`;
      const days =
        injury?.id && !injuries.has(injuryKey) && Number.isFinite(injury.recoveryDays)
          ? Math.max(0, Math.min(28, injury.recoveryDays!))
          : 0;
      injuries.add(injuryKey);
      result.set(id, {
        matches: previous.matches + 1,
        minutes: previous.minutes + minutes,
        injuryDays: (previous.injuryDays ?? 0) + days,
      });
    }
  }
  experienceCache.set(career.historyFacts, { date, result });
  return result;
};

const scores = (p: FootballerProfile): Record<PlayStyleId, number> => {
  const a = p.attributes;
  const keeper = p.primaryPosition === 'goalkeeper';
  const offensive = ['striker', 'left_winger', 'right_winger', 'central_midfielder'].includes(
    p.primaryPosition,
  );
  return {
    progressive_passer: keeper ? 0 : Math.min(a.passing, a.technique, a.gameReading),
    between_the_lines: offensive ? Math.min(a.positioning, a.gameReading, a.firstTouch) : 0,
    ball_winner: keeper ? 0 : Math.min(a.tackling, a.gameReading, a.concentration),
    calm_finisher: offensive ? Math.min(a.finishing, a.composure, a.firstTouch) : 0,
    engine: keeper ? 0 : Math.min(a.stamina, a.determination, a.professionalism),
    goalkeeper_distributor: keeper ? Math.min(a.goalkeeperKicking, a.passing, a.gameReading) : 0,
  };
};

/** Identity chooses at most two compatible specialisations, never all mature-player styles.
 * Established styles describe prior identity, not observed historical actions. A new
 * specialisation can emerge from material skill development; only the separate experience
 * path claims known participation. Age alone awards nothing. */
export const deriveNpcPlayStyles = (
  base: Pick<WorldFootballer, 'profile'>,
  current: FootballerProfile = base.profile,
  experience: NpcExperience = { matches: 0, minutes: 0 },
): z.infer<typeof npcStyleSchema>[] => {
  const baseline = scores(base.profile),
    effective = scores(current);
  const ranked = playStyleIdSchema.options
    .map((style) => ({ style, affinity: hashRandomSeed(`npc-style:${current.id}:${style}`) % 100 }))
    .filter(({ affinity }) => affinity >= 48)
    .sort(
      (a, b) =>
        baseline[b.style] + b.affinity / 8 - (baseline[a.style] + a.affinity / 8) ||
        a.style.localeCompare(b.style),
    );
  const result: z.infer<typeof npcStyleSchema>[] = [];
  for (const { style } of ranked) {
    if (result.length >= 2) break;
    if (
      result.some(
        (s) =>
          (s.style === 'calm_finisher' && style === 'ball_winner') ||
          (s.style === 'ball_winner' && style === 'calm_finisher'),
      )
    )
      continue;
    if (base.profile.age >= 20 && baseline[style] >= 52 && effective[style] >= 48)
      result.push({ style, source: 'established' });
    else if (
      experience.matches >= 12 &&
      experience.minutes >= 900 &&
      effective[style] >= 60 &&
      effective[style] >= baseline[style] + 2
    )
      result.push({ style, source: 'career_experience' });
    else if (
      current.age >= 22 &&
      current.age > base.profile.age &&
      effective[style] >= 56 &&
      effective[style] >= baseline[style] + 3 &&
      hashRandomSeed(`npc-style:${current.id}:${style}`) % 100 >= 65
    )
      result.push({ style, source: 'development' });
  }
  return result;
};

export const describeNpcDevelopment = (profile: FootballerProfile) =>
  profile.age <= 20
    ? 'Młody zawodnik · profil w rozwoju'
    : profile.age >= 32
      ? 'Doświadczony zawodnik · liczą się obecne atuty'
      : 'Ukształtowany profil piłkarski';
