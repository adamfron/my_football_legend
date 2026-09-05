import type {
  CareerState,
  DevelopmentFamily,
  NpcDevelopmentCurveId,
  PlayerAttributes,
  WorldFootballer,
} from '../types/domain';
import { getProfileAge } from './age';
import { getAttributeFamily } from './attributePresentation';
import { hashRandomSeed } from './random/RandomGenerator';

interface NpcDevelopmentCurve {
  id: NpcDevelopmentCurveId;
  peakShift: Record<DevelopmentFamily, number>;
  growth: Record<DevelopmentFamily, number>;
  decline: Record<DevelopmentFamily, number>;
}

const familyValues = (technical: number, mental: number, physical: number, goalkeeper: number) =>
  ({ technical, mental, physical, goalkeeper }) satisfies Record<DevelopmentFamily, number>;

/** Compact canonical trajectories. Individual profiles and stable per-attribute noise distort them. */
export const NPC_DEVELOPMENT_CURVES: Readonly<Record<NpcDevelopmentCurveId, NpcDevelopmentCurve>> =
  Object.freeze({
    early_peak: {
      id: 'early_peak',
      peakShift: familyValues(-2, -1, -3, -1),
      growth: familyValues(1.15, 1, 1.2, 1),
      decline: familyValues(1.15, 0.9, 1.3, 1),
    },
    rapid_start: {
      id: 'rapid_start',
      peakShift: familyValues(-1, 0, -1, 0),
      growth: familyValues(1.3, 1.15, 1.25, 1.1),
      decline: familyValues(1, 0.8, 1.05, 0.85),
    },
    balanced: {
      id: 'balanced',
      peakShift: familyValues(0, 0, 0, 0),
      growth: familyValues(1, 1, 1, 1),
      decline: familyValues(1, 0.75, 1.1, 0.85),
    },
    steady: {
      id: 'steady',
      peakShift: familyValues(1, 1, 1, 1),
      growth: familyValues(0.82, 0.9, 0.8, 0.9),
      decline: familyValues(0.85, 0.65, 0.9, 0.72),
    },
    late_bloomer: {
      id: 'late_bloomer',
      peakShift: familyValues(3, 3, 2, 3),
      growth: familyValues(0.9, 1, 0.82, 0.95),
      decline: familyValues(0.9, 0.65, 0.95, 0.7),
    },
    long_prime: {
      id: 'long_prime',
      peakShift: familyValues(2, 3, 2, 3),
      growth: familyValues(0.92, 0.95, 0.9, 0.95),
      decline: familyValues(0.68, 0.5, 0.72, 0.55),
    },
    physical_early_mental_late: {
      id: 'physical_early_mental_late',
      peakShift: familyValues(0, 4, -3, 0),
      growth: familyValues(1, 0.85, 1.25, 1),
      decline: familyValues(0.95, 0.5, 1.35, 0.8),
    },
    goalkeeper_late_prime: {
      id: 'goalkeeper_late_prime',
      peakShift: familyValues(1, 3, 0, 5),
      growth: familyValues(0.75, 0.9, 0.55, 1.05),
      decline: familyValues(0.8, 0.5, 1, 0.55),
    },
  });

const attributeKeys = Object.keys({
  technique: 0,
  firstTouch: 0,
  passing: 0,
  dribbling: 0,
  finishing: 0,
  tackling: 0,
  positioning: 0,
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
  goalkeeperKicking: 0,
  goalkeeperThrowing: 0,
} satisfies Record<keyof PlayerAttributes, number>) as (keyof PlayerAttributes)[];
const stableAttributes = new Set<keyof PlayerAttributes>([
  'ambition',
  'professionalism',
  'determination',
]);

export const deriveNpcDevelopmentCurveId = (
  footballer: Pick<WorldFootballer, 'profile' | 'developmentProfile' | 'developmentCurveId'>,
): NpcDevelopmentCurveId => {
  if (footballer.developmentCurveId) return footballer.developmentCurveId;
  if (footballer.profile.primaryPosition === 'goalkeeper') return 'goalkeeper_late_prime';
  const profile = footballer.developmentProfile;
  if (profile.developmentType === 'early_bloomer')
    return profile.growthRate >= 1.05 ? 'rapid_start' : 'early_peak';
  if (profile.developmentType === 'late_bloomer') return 'late_bloomer';
  const roll = hashRandomSeed(`npc-curve:${footballer.profile.id}`) % 4;
  return (['balanced', 'steady', 'long_prime', 'physical_early_mental_late'] as const)[roll]!;
};

const phaseValue = (
  age: number,
  anchorAge: number,
  peak: number,
  declineStart: number,
  growth: number,
  decline: number,
) => {
  const at = (valueAge: number) => {
    if (valueAge <= peak) return (valueAge - anchorAge) * growth;
    const growthToPeak = (peak - anchorAge) * growth;
    if (valueAge < declineStart) return growthToPeak;
    return growthToPeak - (valueAge - declineStart + 0.5) * decline;
  };
  return at(age) - at(anchorAge);
};

/** Pure random-access projection: no prior season or previous query is an input. */
export const projectNpcAttributesAtDate = (options: {
  footballer: WorldFootballer;
  date: string;
  seed?: string;
}): PlayerAttributes => {
  const { footballer, date } = options;
  const profile = footballer.profile;
  const development = footballer.developmentProfile;
  const birthDate = profile.dateOfBirth;
  const anchorYear = birthDate
    ? Number(birthDate.slice(0, 4)) + profile.age + (birthDate.slice(5) > '07-01' ? 1 : 0)
    : 2026;
  const anchorDate = `${anchorYear}-07-01`;
  const anchorAge = getProfileAge(profile, anchorDate, anchorDate);
  const age = getProfileAge(profile, date, '2026-07-01');
  if (age === anchorAge) return profile.attributes;
  const curve = NPC_DEVELOPMENT_CURVES[deriveNpcDevelopmentCurveId(footballer)];
  const attributes = { ...profile.attributes };
  for (const key of attributeKeys) {
    if (stableAttributes.has(key)) continue;
    const family = getAttributeFamily(key);
    if (family === 'goalkeeper' && profile.primaryPosition !== 'goalkeeper') continue;
    const peak = development.familyPeakAge[family] + curve.peakShift[family];
    const declineStart = Math.max(
      peak + 1,
      development.familyDeclineStartAge[family] + curve.peakShift[family],
    );
    const character = 0.82 + (attributes.professionalism + attributes.determination) / 500;
    const growth = 0.55 * development.growthRate * curve.growth[family] * character;
    const declineResilience = 1.12 - attributes.professionalism / 260;
    const decline =
      (family === 'physical' ? 1.05 : 0.62) * curve.decline[family] * declineResilience;
    const noise =
      ((hashRandomSeed(`${options.seed ?? ''}:npc-projection:${profile.id}:${key}`) % 21) - 10) /
      100;
    const delta = Math.round(
      phaseValue(age, anchorAge, peak, declineStart, growth * (1 + noise), decline * (1 - noise)),
    );
    const capacity = development.familyCapacity[family] + 2;
    attributes[key] = Math.max(1, Math.min(100, capacity, profile.attributes[key] + delta));
  }
  return attributes;
};

export const aggregateDevelopment = (start: PlayerAttributes, end: PlayerAttributes) =>
  attributeKeys.flatMap((attribute) =>
    end[attribute] === start[attribute]
      ? []
      : [
          {
            attribute,
            before: start[attribute],
            after: end[attribute],
            delta: end[attribute] - start[attribute],
          },
        ],
  );

export const projectNpcSeasonDevelopment = (options: {
  footballer: WorldFootballer;
  boundaryDate: string;
  clubEnvironment?: number;
  seed: string;
}) => {
  const attributes = projectNpcAttributesAtDate({
    footballer: options.footballer,
    date: options.boundaryDate,
    seed: options.seed,
  });
  return {
    footballer: { ...options.footballer, profile: { ...options.footballer.profile, attributes } },
    summary: {
      age: getProfileAge(options.footballer.profile, options.boundaryDate, '2026-07-01'),
      changes: aggregateDevelopment(options.footballer.profile.attributes, attributes),
    },
  };
};

/** Natural development is resolved by date; a season boundary intentionally persists nothing. */
export const processNpcSeasonDevelopment = (
  career: CareerState,
  _boundaryDate: string,
  _reuseOwnedDeltaMaps = false,
): CareerState => {
  void _boundaryDate;
  void _reuseOwnedDeltaMaps;
  return career;
};
