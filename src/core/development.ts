import type {
  AttributeDevelopmentProgress,
  CareerState,
  HistoryFact,
  MatchAppearance,
  PlayerAttributes,
} from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';
import { getPlayerOverall } from './playerOverall';
import { OVR_ATTRIBUTE_KEYS } from './playerOverall';
import { getAttributeFamily } from './attributePresentation';
const keys = [...OVR_ATTRIBUTE_KEYS];
const weights = (a: MatchAppearance): Partial<Record<keyof PlayerAttributes, number>> => ({
  technique: 1 + a.keyPasses * 0.25,
  passing: 1 + a.keyPasses * 0.5,
  pace: 1 + (a.minutes > 70 ? 0.5 : 0),
  stamina: 1 + a.minutes / 90,
  finishing: 1 + a.goals * 2 + a.xG,
  tackling: 1 + a.defensiveActions * 0.3,
  leadership: 0.45 + (a.started ? 0.35 : 0),
  composure: 1 + a.goals + a.assists * 0.5,
  gameReading: 1 + a.keyPasses * 0.25 + a.goals * 0.3,
  determination: 0.12,
  ambition: 0.06,
  professionalism: 0.1,
});
const stablePersonality = new Set<keyof PlayerAttributes>(['ambition', 'professionalism']);
const familyCapacity = (career: CareerState, key: keyof PlayerAttributes) =>
  career.developmentProfile?.familyCapacity[getAttributeFamily(key)] ?? 70;
const ageMultiplier = (age: number) =>
  age <= 18 ? 1.65 : age <= 21 ? 1.4 : age <= 24 ? 1.05 : age <= 27 ? 0.68 : age <= 30 ? 0.3 : 0.08;
export const applyDevelopmentCheckpoint = (
  career: CareerState,
  appearance: MatchAppearance,
): CareerState => {
  if (!appearance.minutes) return career;
  const rng = RandomGenerator.fromSeed(`${career.seed}:development:${appearance.matchId}`);
  const w = weights(appearance);
  const mean = getPlayerOverall(career.player, career.player.primaryPosition);
  const profile = career.developmentProfile;
  const character =
    (career.player.attributes.professionalism * 0.45 +
      career.player.attributes.determination * 0.4 +
      career.player.attributes.ambition * 0.15) /
    50;
  const injuryFactor = appearance.injuryId?.length ? 0.7 : 1;
  const attrs = { ...career.player.attributes };
  const map = new Map((career.developmentProgress ?? []).map((p) => [p.attribute, p.progress]));
  const facts: HistoryFact[] = [];
  for (const key of keys) {
    const current = attrs[key];
    const ceilingFactor = Math.max(0.12, (familyCapacity(career, key) - current + 8) / 35);
    const appearanceWeight =
      w[key] ??
      (career.player.primaryPosition === 'goalkeeper' && getAttributeFamily(key) === 'goalkeeper'
        ? 0.7
        : 0);
    const potentialFactor = Math.max(
      0.25,
      Math.min(1.35, (familyCapacity(career, key) - mean + 12) / 30),
    );
    let progress =
      (map.get(key) ?? 0) +
      (appearance.minutes / 90) *
        appearanceWeight *
        7 *
        ageMultiplier(career.player.age) *
        potentialFactor *
        ceilingFactor *
        injuryFactor *
        character *
        (profile?.growthRate ?? 1) *
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
  goalkeeper: ['reflexes', 'handling', 'oneOnOnes', 'goalkeeperSweeping'],
  center_back: ['tackling', 'gameReading', 'composure', 'stamina', 'leadership'],
  left_back: ['pace', 'stamina', 'tackling', 'passing'],
  right_back: ['pace', 'stamina', 'tackling', 'passing'],
  defensive_midfielder: ['tackling', 'passing', 'composure', 'stamina'],
  attacking_midfielder: ['passing', 'technique', 'dribbling', 'gameReading'],
  left_winger: ['pace', 'technique', 'dribbling', 'finishing'],
  right_winger: ['pace', 'technique', 'dribbling', 'finishing'],
  striker: ['finishing', 'gameReading', 'composure', 'technique', 'pace'],
};
const planFocus: Record<string, Array<keyof PlayerAttributes>> = {
  technical: ['technique', 'firstTouch', 'passing'],
  playmaking: ['passing', 'technique', 'gameReading'],
  dribbling: ['dribbling', 'agility', 'firstTouch'],
  finishing: ['finishing', 'composure', 'firstTouch'],
  defending: ['tackling', 'gameReading', 'concentration'],
  aerial: ['heading', 'jumping', 'strength'],
  physical: ['pace', 'stamina', 'strength', 'agility'],
  set_pieces: ['setPieces', 'technique'],
  goalkeeper: ['reflexes', 'handling', 'oneOnOnes'],
  sweeper_keeper: ['goalkeeperSweeping', 'passing', 'gameReading', 'firstTouch'],
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
  const focus = planFocus[career.trainingPlan ?? 'general'] ??
    positionFocus[career.player.primaryPosition] ?? ['technique', 'stamina', 'composure'];
  const available = ((career.player.health / 100) * career.player.fitness) / 100;
  const seasonMinutes =
    career.seasonParticipation?.reduce((sum, match) => sum + match.minutes, 0) ??
    (career.matchHistory ?? [])
      .filter(
        (match) =>
          match.date >= `${career.currentSeason}-07-01` &&
          match.date <= `${career.currentSeason + 1}-06-30`,
      )
      .reduce((sum, match) => sum + match.minutes, 0);
  // Training supplies the base budget; competitive minutes make that work more effective.
  const experienceFactor = Math.min(1.15, 0.68 + seasonMinutes / 2400);
  const attrs = { ...career.player.attributes };
  const club = career.currentProfessionalClub;
  const environment =
    career.careerSeasonNumber === 1
      ? 1.05
      : club
        ? Math.max(
            0.65,
            Math.min(
              1.35,
              (club.youthPolicy * 0.3 +
                club.developmentReputation * 0.45 +
                club.coachYouthTrust * 0.25) /
                55,
            ),
          ) * ({ 1: 1.1, 2: 1.05, 3: 1, 4: 0.93 }[club.leagueTier] ?? 1)
        : 0.9;
  const progress = new Map(
    (career.developmentProgress ?? []).map((item) => [item.attribute, item.progress]),
  );
  const facts: HistoryFact[] = [];
  const trainingMultiplier = { recovery: 0.78, balanced: 1, extra_work: 1.22 }[
    career.trainingApproach ?? 'balanced'
  ];
  const professionalismMultiplier = 0.7 + career.player.attributes.professionalism / 200;
  for (const key of keys) {
    const family = getAttributeFamily(key);
    const explicitlyFocused = career.individualFocus === key || focus.includes(key);
    const unrelatedGoalkeeper =
      family === 'goalkeeper' &&
      career.player.primaryPosition !== 'goalkeeper' &&
      !['goalkeeper', 'sweeper_keeper'].includes(career.trainingPlan ?? 'general');
    const background = stablePersonality.has(key) || unrelatedGoalkeeper ? 0 : 5;
    const keyPotentialGap = Math.max(
      0.2,
      Math.min(1.35, (familyCapacity(career, key) - attrs[key] + 15) / 30),
    );
    let value =
      (progress.get(key) ?? 0) +
      (career.individualFocus === key ? 45 : explicitlyFocused ? 30 : background) *
        ageMultiplier(career.player.age) *
        keyPotentialGap *
        available *
        environment *
        experienceFactor *
        trainingMultiplier *
        professionalismMultiplier *
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
  const weakFootGain =
    career.trainingPlan === 'weak_foot' || career.individualFocus === 'weakFootProficiency'
      ? Math.max(0, Math.floor((career.player.attributes.professionalism - 35) / 25))
      : 0;
  // Aging is part of the season timeline, so negative changes are visible against its baseline.
  const physicalChance =
    career.player.age < 29
      ? 0
      : career.player.age < 32
        ? 0.025
        : career.player.age < 35
          ? 0.07
          : career.player.age < 38
            ? 0.13
            : 0.22;
  for (const key of ['pace', 'stamina'] as const)
    if (attrs[key] > 1 && rng.float() < physicalChance) {
      const before = attrs[key];
      attrs[key]--;
      facts.push({
        id: `fact_aging_attribute_${month}_${key}`,
        factType: 'attribute_changed',
        season: career.currentSeason,
        date: `${month}-28`,
        actors: [career.player.id],
        targets: [],
        clubs: [career.currentClub.id],
        competitions: [],
        data: { attribute: key, before, after: attrs[key], source: 'aging' },
        causes: [`aging_${month}`],
        tags: ['development', 'aging', key],
        visibility: 'public',
        narrativeImportance: 60,
        emotionalTone: 'negative',
      });
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
    player: {
      ...career.player,
      attributes: attrs,
      weakFootProficiency: Math.min(100, career.player.weakFootProficiency + weakFootGain),
    },
    developmentProgress: keys.map((attribute) => ({
      attribute,
      progress: progress.get(attribute) ?? 0,
    })),
    historyFacts: [...career.historyFacts, ...facts, checkpointFact],
  };
};
