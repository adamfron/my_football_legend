import type {
  CareerState,
  DevelopmentFamily,
  PlayerAttributes,
  WorldFootballer,
} from '../types/domain';
import { getProfileAge } from './age';
import { getAttributeFamily } from './attributePresentation';
import { getClubDevelopmentEnvironment } from './professionalClubs';
import { extendRandomSeedHash, hashRandomSeed } from './random/RandomGenerator';
import { emptyWorldDelta } from './worldDatabase';

export const aggregateDevelopment = (start: PlayerAttributes, end: PlayerAttributes) =>
  (Object.keys(start) as (keyof PlayerAttributes)[]).flatMap((attribute) => {
    const delta = end[attribute] - start[attribute];
    return delta === 0
      ? []
      : [{ attribute, before: start[attribute], after: end[attribute], delta }];
  });

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

const stableAttributes = new Set<keyof PlayerAttributes>(['ambition', 'professionalism']);
const ATTRIBUTE_KEYS_BY_FAMILY = Object.freeze(
  Object.fromEntries(
    (['technical', 'mental', 'physical', 'goalkeeper'] as const).map((family) => [
      family,
      Object.freeze(
        attributeKeys.filter(
          (attribute) =>
            getAttributeFamily(attribute) === family && !stableAttributes.has(attribute),
        ),
      ),
    ]),
  ) as Record<DevelopmentFamily, readonly (keyof PlayerAttributes)[]>,
);

export interface NpcDevelopmentSummary {
  age: number;
  changes: ReturnType<typeof aggregateDevelopment>;
}

const GOALKEEPER_FAMILIES: readonly DevelopmentFamily[] = [
  'goalkeeper',
  'mental',
  'physical',
  'technical',
];
const OUTFIELD_FAMILIES: readonly DevelopmentFamily[] = ['physical', 'technical', 'mental'];
const getFamilyAverage = (attributes: PlayerAttributes, family: DevelopmentFamily): number => {
  switch (family) {
    case 'technical':
      return (
        (attributes.technique +
          attributes.firstTouch +
          attributes.passing +
          attributes.dribbling +
          attributes.finishing +
          attributes.tackling +
          attributes.heading +
          attributes.setPieces) /
        8
      );
    case 'mental':
      return (
        (attributes.gameReading +
          attributes.composure +
          attributes.concentration +
          attributes.leadership +
          attributes.determination +
          attributes.aggression) /
        6
      );
    case 'physical':
      return (
        (attributes.pace +
          attributes.stamina +
          attributes.strength +
          attributes.agility +
          attributes.jumping) /
        5
      );
    case 'goalkeeper':
      return (
        (attributes.reflexes +
          attributes.handling +
          attributes.oneOnOnes +
          attributes.goalkeeperSweeping) /
        4
      );
  }
};

function projectNpcSeasonDevelopmentInternal(
  footballer: WorldFootballer,
  boundaryDate: string,
  clubEnvironment: number,
  seed: string,
  collectSummary: true,
  derivedAge?: number,
  randomSeedHash?: number,
): { footballer: WorldFootballer; summary: NpcDevelopmentSummary };
function projectNpcSeasonDevelopmentInternal(
  footballer: WorldFootballer,
  boundaryDate: string,
  clubEnvironment: number,
  seed: string,
  collectSummary: false,
  derivedAge?: number,
  randomSeedHash?: number,
): WorldFootballer;
function projectNpcSeasonDevelopmentInternal(
  footballer: WorldFootballer,
  boundaryDate: string,
  clubEnvironment: number,
  seed: string,
  collectSummary: boolean,
  derivedAge?: number,
  randomSeedHash?: number,
): WorldFootballer | { footballer: WorldFootballer; summary: NpcDevelopmentSummary } {
  const age = derivedAge ?? getProfileAge(footballer.profile, boundaryDate, '2026-07-01');
  const development = footballer.developmentProfile;
  let randomState =
    randomSeedHash ??
    hashRandomSeed(`npc-season-development:${seed}:${boundaryDate}:${footballer.profile.id}`);
  if (!randomState) randomState = 1;
  const before = footballer.profile.attributes;
  let attributes = before;
  const changes: NpcDevelopmentSummary['changes'] | undefined = collectSummary ? [] : undefined;
  const goalkeeper = footballer.profile.primaryPosition === 'goalkeeper';
  const families = goalkeeper ? GOALKEEPER_FAMILIES : OUTFIELD_FAMILIES;
  const bloomShift =
    development.developmentType === 'early_bloomer'
      ? 2
      : development.developmentType === 'late_bloomer'
        ? -2
        : 0;
  const environment = 0.82 + clubEnvironment / 250;
  for (const family of families) {
    const keys = ATTRIBUTE_KEYS_BY_FAMILY[family];
    const capacity = development.familyCapacity[family];
    const declineAge = development.familyDeclineStartAge[family];
    const peakAge = development.familyPeakAge[family];
    const declining = age >= declineAge;
    const youthWindow = peakAge - age + bloomShift;
    let chance: number;
    if (declining) {
      chance = Math.min(
        0.82,
        0.16 + (age - declineAge) * 0.075 + development.crisisSensitivity / 500,
      );
    } else {
      const average = getFamilyAverage(attributes, family);
      const capacityBrake = Math.max(0.03, Math.min(1, (capacity - average + 3) / 22));
      chance =
        youthWindow > 0
          ? Math.min(
              0.72,
              (0.08 + youthWindow * 0.025) * development.growthRate * environment * capacityBrake +
                development.stagnationResistance / 700,
            )
          : 0.06 * capacityBrake;
    }
    if (family === 'mental' && declining && age < declineAge + 3) chance *= 0.35;
    randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
    if (randomState / 0x100000000 >= chance) continue;

    let eligibleCount = declining ? keys.length : 0;
    if (!declining)
      for (const candidate of keys) if (attributes[candidate] < capacity + 2) eligibleCount++;
    if (!eligibleCount) continue;
    // Pick one eligible family attribute without allocating/sorting in the hot path. Family-level
    // selection preserves the positional shape while allowing varied paths within that family.
    randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
    const start = Math.floor((randomState / 0x100000000) * eligibleCount);
    let eligibleIndex = 0;
    let key: keyof PlayerAttributes | undefined;
    for (const candidate of keys) {
      if (!declining && attributes[candidate] >= capacity + 2) continue;
      if (eligibleIndex++ === start) {
        key = candidate;
        break;
      }
    }
    if (!key) continue;
    let rareTwo = false;
    if (development.developmentVolatility >= 75) {
      randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
      rareTwo = randomState / 0x100000000 < 0.12;
    }
    const delta = (declining ? -1 : 1) * (rareTwo ? 2 : 1);
    const value = Math.max(1, Math.min(100, attributes[key] + delta));
    if (value === attributes[key]) continue;
    if (attributes === before) attributes = { ...before };
    const previous = attributes[key];
    attributes[key] = value;
    changes?.push({ attribute: key, before: previous, after: value, delta: value - previous });
  }
  const projected =
    attributes === before
      ? footballer
      : { ...footballer, profile: { ...footballer.profile, attributes } };
  return collectSummary
    ? { footballer: projected, summary: { age, changes: changes! } }
    : projected;
}

/** Pure, bounded annual projection. Age is context, never persistent football state. */
export const projectNpcSeasonDevelopment = (options: {
  footballer: WorldFootballer;
  boundaryDate: string;
  clubEnvironment?: number;
  seed: string;
}): { footballer: WorldFootballer; summary: NpcDevelopmentSummary } =>
  projectNpcSeasonDevelopmentInternal(
    options.footballer,
    options.boundaryDate,
    options.clubEnvironment ?? 50,
    options.seed,
    true,
  );

/**
 * Applies development after graduation/season resolution and before the next hierarchy is built.
 * The explicit season marker makes retries harmless; graduates therefore participate exactly once.
 */
export const processNpcSeasonDevelopment = (
  career: CareerState,
  boundaryDate: string,
  reuseOwnedDeltaMaps = false,
): CareerState => {
  const season = Number(boundaryDate.slice(0, 4)) - 1;
  const delta = career.worldDelta ?? emptyWorldDelta();
  if ((delta.npcDevelopmentProcessedThroughSeason ?? -1) >= season) return career;
  const baseFootballers = career.footballerWorld ?? {};
  const retiredIds = new Set(delta.retiredFootballerIds);
  const footballerOverrides = reuseOwnedDeltaMaps
    ? delta.footballerOverrides
    : { ...delta.footballerOverrides };
  const environmentByClubId = new Map(
    (career.clubWorld ?? []).map((club) => [club.id, getClubDevelopmentEnvironment(club)]),
  );
  const boundaryYear = Number(boundaryDate.slice(0, 4));
  const boundaryMonthDay =
    (boundaryDate.charCodeAt(5) - 48) * 320 +
    (boundaryDate.charCodeAt(6) - 48) * 32 +
    (boundaryDate.charCodeAt(8) - 48) * 10 +
    boundaryDate.charCodeAt(9) -
    48;
  const randomSeedPrefixHash = hashRandomSeed(
    `npc-season-development:${career.seed}:${boundaryDate}:`,
  );
  const processFootballer = (id: string) => {
    const footballer =
      delta.footballerOverrides[id] ?? delta.newFootballers[id] ?? baseFootballers[id];
    if (!footballer) return;
    if (id === career.player.id || footballer.careerStatus === 'retired' || retiredIds.has(id))
      return;
    const dateOfBirth = footballer.profile.dateOfBirth;
    const derivedAge = dateOfBirth
      ? boundaryYear -
        ((dateOfBirth.charCodeAt(0) - 48) * 1000 +
          (dateOfBirth.charCodeAt(1) - 48) * 100 +
          (dateOfBirth.charCodeAt(2) - 48) * 10 +
          dateOfBirth.charCodeAt(3) -
          48) -
        (boundaryMonthDay <
        (dateOfBirth.charCodeAt(5) - 48) * 320 +
          (dateOfBirth.charCodeAt(6) - 48) * 32 +
          (dateOfBirth.charCodeAt(8) - 48) * 10 +
          dateOfBirth.charCodeAt(9) -
          48
          ? 1
          : 0)
      : getProfileAge(footballer.profile, boundaryDate, '2026-07-01');
    const projected = projectNpcSeasonDevelopmentInternal(
      footballer,
      boundaryDate,
      footballer.currentClubId ? (environmentByClubId.get(footballer.currentClubId) ?? 44) : 44,
      career.seed,
      false,
      derivedAge,
      extendRandomSeedHash(randomSeedPrefixHash, footballer.profile.id),
    );
    if (projected !== footballer) footballerOverrides[id] = projected;
  };
  for (const id in baseFootballers) processFootballer(id);
  for (const id in delta.newFootballers) if (!(id in baseFootballers)) processFootballer(id);
  for (const id in delta.footballerOverrides)
    if (!(id in baseFootballers) && !(id in delta.newFootballers)) processFootballer(id);
  const worldDelta = {
    ...delta,
    footballerOverrides,
    npcDevelopmentProcessedThroughSeason: season,
  };
  return { ...career, worldDelta };
};
