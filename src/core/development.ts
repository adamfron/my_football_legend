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
const ageMultiplier = (age: number) =>
  age <= 18 ? 1.35 : age <= 22 ? 1.15 : age <= 27 ? 0.75 : age <= 31 ? 0.4 : 0.15;
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
        1.5 *
        ageMultiplier(career.player.age) *
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

const positionFocus: Record<string, Array<keyof PlayerAttributes>> = {
  goalkeeper: ['composure', 'vision', 'leadership', 'technique'],
  center_back: ['defending', 'composure', 'stamina', 'leadership'],
  defensive_midfielder: ['defending', 'vision', 'composure', 'stamina'],
  central_midfielder: ['vision', 'technique', 'stamina', 'composure'],
  winger: ['pace', 'technique', 'vision', 'finishing'],
  striker: ['finishing', 'composure', 'technique', 'pace'],
};

/** Deterministic monthly training growth; appearances remain a separate experience bonus. */
export const applyTrainingDevelopmentCheckpoint = (
  career: CareerState,
  month: string,
): CareerState => {
  if (
    career.historyFacts.some(
      (fact) => fact.factType === 'training_development_checkpoint' && fact.data.month === month,
    )
  )
    return career;
  const rng = RandomGenerator.fromSeed(`${career.seed}:training-development:${month}`);
  const focus = positionFocus[career.player.primaryPosition] ?? [
    'technique',
    'stamina',
    'composure',
  ];
  const available = ((career.player.health / 100) * career.player.fitness) / 100;
  const potentialGap = Math.max(
    0.45,
    Math.min(
      1.35,
      (career.player.potential -
        Object.values(career.player.attributes).reduce((a, b) => a + b, 0) / 8 +
        18) /
        30,
    ),
  );
  const attrs = { ...career.player.attributes };
  const progress = new Map(
    (career.developmentProgress ?? []).map((item) => [item.attribute, item.progress]),
  );
  const facts: HistoryFact[] = [];
  for (const key of keys) {
    let value =
      (progress.get(key) ?? 0) +
      (focus.includes(key) ? 11 : 4) *
        ageMultiplier(career.player.age) *
        potentialGap *
        available *
        (0.85 + rng.float() * 0.3);
    while (value >= 100 && attrs[key] < 100) {
      const before = attrs[key]++;
      value -= 100;
      facts.push({
        id: `fact_training_attribute_${month}_${key}`,
        factType: 'attribute_changed',
        season: career.currentSeason,
        date: `${month}-28`,
        actors: [career.player.id],
        targets: [],
        clubs: [career.currentClub.id],
        competitions: [],
        data: { attribute: key, before, after: attrs[key], source: 'training' },
        causes: [`training_${month}`],
        tags: ['development', 'training', key],
        visibility: 'public',
        narrativeImportance: 55,
        emotionalTone: 'positive',
      });
    }
    progress.set(key, value);
  }
  const checkpointFact: HistoryFact = {
    id: `fact_training_checkpoint_${month}`,
    factType: 'training_development_checkpoint',
    season: career.currentSeason,
    date: `${month}-28`,
    actors: [career.player.id],
    targets: [],
    clubs: [career.currentClub.id],
    competitions: [],
    data: { month },
    causes: [],
    tags: ['development', 'training'],
    visibility: 'hidden',
    narrativeImportance: 10,
    emotionalTone: 'neutral',
  };
  return {
    ...career,
    player: { ...career.player, attributes: attrs },
    developmentProgress: keys.map((attribute) => ({
      attribute,
      progress: progress.get(attribute) ?? 0,
    })),
    historyFacts: [...career.historyFacts, ...facts, checkpointFact],
  };
};
