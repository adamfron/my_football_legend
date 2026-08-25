import type {
  AttributeDevelopmentProgress,
  CareerState,
  HistoryFact,
  MatchAppearance,
  PlayerAttributes,
} from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';
const keys = Object.keys({
  technique: 0,
  vision: 0,
  pace: 0,
  stamina: 0,
  finishing: 0,
  defending: 0,
  leadership: 0,
  composure: 0,
}) as (keyof PlayerAttributes)[];
const weights = (a: MatchAppearance): Record<keyof PlayerAttributes, number> => ({
  technique: 1 + a.keyPasses * 0.25,
  vision: 1 + a.keyPasses * 0.5,
  pace: 1 + (a.minutes > 70 ? 0.5 : 0),
  stamina: 1 + a.minutes / 90,
  finishing: 1 + a.goals * 2 + a.xG,
  defending: 1 + a.defensiveActions * 0.3,
  leadership: 0.45 + (a.started ? 0.35 : 0),
  composure: 1 + a.goals + a.assists * 0.5,
});
export const applyDevelopmentCheckpoint = (
  career: CareerState,
  appearance: MatchAppearance,
): CareerState => {
  if (!appearance.minutes) return career;
  const rng = RandomGenerator.fromSeed(`${career.seed}:development:${appearance.matchId}`);
  const w = weights(appearance);
  const mean = Object.values(career.player.attributes).reduce((a, b) => a + b, 0) / 8;
  const potentialFactor = Math.max(
    0.25,
    Math.min(1.35, (career.player.potential - mean + 12) / 30),
  );
  const injuryFactor = appearance.injuryId?.length ? 0.7 : 1;
  const attrs = { ...career.player.attributes };
  const map = new Map((career.developmentProgress ?? []).map((p) => [p.attribute, p.progress]));
  const facts: HistoryFact[] = [];
  for (const key of keys) {
    const current = attrs[key];
    const ceilingFactor = Math.max(0.12, (career.player.potential - current + 8) / 35);
    let progress =
      (map.get(key) ?? 0) +
      (appearance.minutes / 90) *
        w[key] *
        2.7 *
        potentialFactor *
        ceilingFactor *
        injuryFactor *
        (0.82 + rng.float() * 0.36);
    while (progress >= 100 && attrs[key] < 100) {
      const before = attrs[key];
      attrs[key]++;
      progress -= 100;
      facts.push({
        id: `fact_attribute_changed_${appearance.matchId}_${key}`,
        factType: 'attribute_changed',
        season: career.currentSeason,
        date: appearance.date,
        actors: [career.player.id],
        targets: [],
        clubs: [career.currentClub.id],
        competitions: [],
        data: { attribute: key, before, after: attrs[key], source: 'development_checkpoint' },
        causes: [`match_${appearance.matchId}`],
        tags: ['development', key],
        visibility: 'public',
        narrativeImportance: 55,
        emotionalTone: 'positive',
      });
    }
    map.set(key, Math.max(0, progress));
  }
  const developmentProgress: Array<AttributeDevelopmentProgress> = keys.map((attribute) => ({
    attribute,
    progress: map.get(attribute) ?? 0,
  }));
  return {
    ...career,
    player: { ...career.player, attributes: attrs },
    developmentProgress,
    historyFacts: [...career.historyFacts, ...facts],
  };
};
