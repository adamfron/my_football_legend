import type {
  CareerState,
  DevelopmentFamily,
  PlayerAttributes,
  ProfessionalClub,
  WorldFootballer,
} from '../types/domain';
import { getProfileAge } from './age';
import { getAttributeFamily } from './attributePresentation';
import { getClubDevelopmentEnvironment } from './professionalClubs';
import { RandomGenerator } from './random/RandomGenerator';
import { emptyWorldDelta } from './worldDatabase';

export const aggregateDevelopment = (start: PlayerAttributes, end: PlayerAttributes) =>
  (Object.keys(start) as (keyof PlayerAttributes)[]).flatMap((attribute) => {
    const delta = end[attribute] - start[attribute];
    return delta === 0
      ? []
      : [{ attribute, before: start[attribute], after: end[attribute], delta }];
  });

const stable = new Set<keyof PlayerAttributes>(['ambition', 'professionalism']);
const attributeKeys = Object.keys({
  technique: 0,
  firstTouch: 0,
  passing: 0,
  dribbling: 0,
  finishing: 0,
  tackling: 0,
  heading: 0,
  setPieces: 0,
  gameReading: 0,
  composure: 0,
  concentration: 0,
  leadership: 0,
  determination: 0,
  aggression: 0,
  pace: 0,
  stamina: 0,
  strength: 0,
  agility: 0,
  jumping: 0,
  ambition: 0,
  professionalism: 0,
  reflexes: 0,
  handling: 0,
  oneOnOnes: 0,
  goalkeeperSweeping: 0,
} satisfies Record<keyof PlayerAttributes, number>) as (keyof PlayerAttributes)[];

export interface NpcDevelopmentSummary {
  age: number;
  changes: ReturnType<typeof aggregateDevelopment>;
}

/** Pure, bounded annual projection. Age is context, never persistent football state. */
export const projectNpcSeasonDevelopment = ({
  footballer,
  boundaryDate,
  clubEnvironment = 50,
  seed,
}: {
  footballer: WorldFootballer;
  boundaryDate: string;
  clubEnvironment?: number;
  seed: string;
}): { footballer: WorldFootballer; summary: NpcDevelopmentSummary } => {
  const age = getProfileAge(footballer.profile, boundaryDate, '2026-07-01');
  const development = footballer.developmentProfile;
  const rng = RandomGenerator.fromSeed(
    `npc-season-development:${seed}:${boundaryDate}:${footballer.profile.id}`,
  );
  const before = footballer.profile.attributes;
  const attributes = { ...before };
  const goalkeeper = footballer.profile.primaryPosition === 'goalkeeper';
  const families: DevelopmentFamily[] = goalkeeper
    ? ['goalkeeper', 'mental', 'physical', 'technical']
    : ['physical', 'technical', 'mental'];
  for (const family of families) {
    const keys = attributeKeys.filter(
      (key) => getAttributeFamily(key) === family && !stable.has(key),
    );
    if (!keys.length || (!goalkeeper && family === 'goalkeeper')) continue;
    const capacity = development.familyCapacity[family];
    const average = keys.reduce((sum, key) => sum + attributes[key], 0) / keys.length;
    const declineAge = development.familyDeclineStartAge[family];
    const peakAge = development.familyPeakAge[family];
    const declining = age >= declineAge;
    const bloomShift =
      development.developmentType === 'early_bloomer'
        ? 2
        : development.developmentType === 'late_bloomer'
          ? -2
          : 0;
    const youthWindow = peakAge - age + bloomShift;
    const environment = 0.82 + clubEnvironment / 250;
    const capacityBrake = Math.max(0.03, Math.min(1, (capacity - average + 3) / 22));
    let chance = declining
      ? Math.min(0.82, 0.16 + (age - declineAge) * 0.075 + development.crisisSensitivity / 500)
      : youthWindow > 0
        ? Math.min(
            0.72,
            (0.08 + youthWindow * 0.025) * development.growthRate * environment * capacityBrake +
              development.stagnationResistance / 700,
          )
        : 0.06 * capacityBrake;
    if (family === 'mental' && declining && age < declineAge + 3) chance *= 0.35;
    if (!rng.bool(chance)) continue;
    const eligible = keys.filter((key) => declining || attributes[key] < capacity + 2);
    if (!eligible.length) continue;
    // Existing strengths are more likely to move, preserving positional/archetypal identity.
    const ranked = eligible.sort((a, b) => attributes[b] - attributes[a]);
    const key = ranked[rng.int(0, Math.max(0, Math.ceil(ranked.length * 0.65) - 1))]!;
    const rareTwo = development.developmentVolatility >= 75 && rng.bool(0.12);
    const delta = (declining ? -1 : 1) * (rareTwo ? 2 : 1);
    attributes[key] = Math.max(1, Math.min(100, attributes[key] + delta));
  }
  const changes = aggregateDevelopment(before, attributes);
  return {
    footballer: changes.length
      ? { ...footballer, profile: { ...footballer.profile, attributes } }
      : footballer,
    summary: { age, changes },
  };
};

const environmentFor = (clubs: ProfessionalClub[], footballer: WorldFootballer) => {
  const club = clubs.find((item) => item.id === footballer.currentClubId);
  return club ? getClubDevelopmentEnvironment(club) : 44;
};

/**
 * Applies development after graduation/season resolution and before the next hierarchy is built.
 * The explicit season marker makes retries harmless; graduates therefore participate exactly once.
 */
export const processNpcSeasonDevelopment = (
  career: CareerState,
  boundaryDate: string,
): CareerState => {
  const season = Number(boundaryDate.slice(0, 4)) - 1;
  const delta = career.worldDelta ?? emptyWorldDelta();
  if ((delta.npcDevelopmentProcessedThroughSeason ?? -1) >= season) return career;
  const effective = {
    ...(career.footballerWorld ?? {}),
    ...delta.newFootballers,
    ...delta.footballerOverrides,
  };
  const overrides = { ...delta.footballerOverrides };
  for (const [id, footballer] of Object.entries(effective)) {
    if (
      id === career.player.id ||
      footballer.careerStatus === 'retired' ||
      delta.retiredFootballerIds.includes(id)
    )
      continue;
    const projected = projectNpcSeasonDevelopment({
      footballer,
      boundaryDate,
      clubEnvironment: environmentFor(career.clubWorld ?? [], footballer),
      seed: career.seed,
    });
    if (projected.summary.changes.length) overrides[id] = projected.footballer;
  }
  const worldDelta = {
    ...delta,
    footballerOverrides: overrides,
    npcDevelopmentProcessedThroughSeason: season,
  };
  return {
    ...career,
    worldDelta,
    footballerWorld: { ...(career.footballerWorld ?? {}), ...overrides },
  };
};
