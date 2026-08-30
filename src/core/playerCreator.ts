import { z } from 'zod';
import { sampleClub } from '../content/clubs/sampleClub';
import { promisingAcademyPlayerPremise } from '../content/archetypes/everyman';
import { samplePerson } from '../content/sampleContent';
import type {
  CareerDifficulty,
  CareerState,
  DevelopmentProfile,
  HiddenPlayerProfile,
  HistoryFact,
  Player,
  PlayerAttributes,
  PlayerPosition,
} from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';
import { generateProfessionalClubPool } from './professionalClubs';
import { deriveInitialEffort } from './playerPreferences';
import {
  getTheoreticalPositionOverall,
  OVR_ATTRIBUTE_KEYS,
  PLAYER_POSITIONS,
} from './playerOverall';
import { getEligibleFootballArchetypes, getFootballArchetype } from './footballArchetypes';
import { describePlayerProfile } from './playerProfilePresentation';
import { POSITION_OVR_WEIGHTS } from './playerOverall';
export const STARTING_AGE = 16,
  MIN_HEIGHT_CM = 155,
  MAX_HEIGHT_CM = 205,
  MIN_WEIGHT_KG = 45,
  MAX_WEIGHT_KG = 120;
export const positionIds = PLAYER_POSITIONS;
export type PositionId = PlayerPosition;
export const dominantFootIds = ['right', 'left'] as const;
export type DominantFoot = (typeof dominantFootIds)[number];
export const difficultyIds = ['easy', 'normal', 'hard'] as const;
export const nationalityIds = ['PL'] as const;
export type NationalityId = (typeof nationalityIds)[number];
const integerField = (
  empty: string,
  message: string,
  configure?: (s: z.ZodNumber) => z.ZodNumber,
) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() ? Number(v) : undefined) : v),
    configure
      ? configure(z.number({ error: empty }).finite(message).int(message))
      : z.number({ error: empty }).finite(message).int(message),
  );
export const getAllowedWeightRange = (h: number) => {
  const m = h / 100;
  return {
    min: Math.ceil(Math.max(MIN_WEIGHT_KG, 18 * m * m)),
    max: Math.floor(Math.min(MAX_WEIGHT_KG, 30 * m * m)),
  };
};
export const identityInputSchema = z.object({
  firstName: z.string().trim().min(2, 'Podaj imię zawodnika.').max(32),
  lastName: z.string().trim().min(2, 'Podaj nazwisko zawodnika.').max(40),
  nationality: z.enum(nationalityIds),
  age: z.literal(STARTING_AGE),
  dominantFoot: z.enum(dominantFootIds),
  difficulty: z.enum(difficultyIds).default('normal'),
  customSeed: z.string().trim().max(48).optional(),
});
export type IdentityInput = z.input<typeof identityInputSchema>;
const heightCmSchema = integerField(
  'Podaj wzrost zawodnika.',
  'Wzrost musi być liczbą całkowitą.',
  (s) => s.min(MIN_HEIGHT_CM).max(MAX_HEIGHT_CM),
);
const weightKgSchema = integerField(
  'Podaj masę ciała zawodnika.',
  'Masa musi być liczbą całkowitą.',
);
export const profileInputSchema = z
  .object({ position: z.enum(positionIds), heightCm: heightCmSchema, weightKg: weightKgSchema })
  .superRefine((v, c) => {
    const r = getAllowedWeightRange(v.heightCm);
    if (v.weightKg < r.min || v.weightKg > r.max)
      c.addIssue({
        code: 'custom',
        path: ['weightKg'],
        message: `Masa dla tego wzrostu musi mieścić się w zakresie ${r.min}–${r.max} kg.`,
      });
  });
export type ProfileInput = z.infer<typeof profileInputSchema>;
export const creatorInputSchema = identityInputSchema.extend({
  position: z.enum(positionIds),
  heightCm: heightCmSchema,
  weightKg: weightKgSchema,
  seed: z.string().min(1),
});
export type CreatorInput = z.input<typeof creatorInputSchema>;
export const attributeKeys = OVR_ATTRIBUTE_KEYS;
export type AttributeKey = (typeof attributeKeys)[number];
const baseBias: Record<PlayerPosition, Partial<Record<AttributeKey, number>>> = {
  goalkeeper: { reflexes: 24, handling: 24, oneOnOnes: 22, goalkeeperSweeping: 22, gameReading: 6 },
  center_back: { tackling: 12, heading: 10, strength: 9, concentration: 10, jumping: 8 },
  left_back: { pace: 9, stamina: 10, tackling: 8, passing: 5 },
  right_back: { pace: 9, stamina: 10, tackling: 8, passing: 5 },
  defensive_midfielder: { tackling: 10, passing: 8, gameReading: 11, stamina: 8 },
  attacking_midfielder: { technique: 10, passing: 11, dribbling: 8, gameReading: 9 },
  left_winger: { pace: 12, dribbling: 12, technique: 8, agility: 9 },
  right_winger: { pace: 12, dribbling: 12, technique: 8, agility: 9 },
  striker: { finishing: 14, composure: 10, firstTouch: 9, gameReading: 7 },
};
const clamp = (n: number) => Math.max(1, Math.min(100, Math.round(n)));
const difficultyBase: Record<CareerDifficulty, number> = { easy: 56, normal: 46, hard: 34 };
const hidden = (rng: RandomGenerator): HiddenPlayerProfile => ({
  consistency: rng.int(25, 85),
  importantMatches: rng.int(20, 90),
  injuryProneness: rng.int(10, 80),
  adaptability: rng.int(20, 90),
  loyalty: rng.int(15, 95),
  pressureResistance: rng.int(20, 90),
  controversy: rng.int(5, 75),
  fairPlay: rng.int(25, 95),
});
const development = (rng: RandomGenerator, d: CareerDifficulty): DevelopmentProfile => {
  const roll = rng.int(1, 100),
    cut = d === 'easy' ? [35, 95] : d === 'normal' ? [20, 75] : [12, 60],
    developmentType =
      roll <= (cut[0] ?? 0) ? 'early_bloomer' : roll <= (cut[1] ?? 100) ? 'normal' : 'late_bloomer';
  return {
    developmentType,
    growthRate: rng.int(82, 125) / 100,
    developmentVolatility: rng.int(d === 'hard' ? 25 : 8, d === 'easy' ? 30 : 60),
    familyCapacity: {
      technical: rng.int(60, 96),
      mental: rng.int(65, 98),
      physical: rng.int(55, 94),
      goalkeeper: rng.int(50, 96),
    },
    familyPeakAge: {
      technical: rng.int(24, 29),
      mental: rng.int(29, 34),
      physical: rng.int(22, 27),
      goalkeeper: rng.int(28, 33),
    },
    familyDeclineStartAge: {
      technical: rng.int(29, 34),
      mental: rng.int(34, 39),
      physical: rng.int(27, 31),
      goalkeeper: rng.int(33, 38),
    },
    stagnationResistance: rng.int(20, 90),
    crisisSensitivity: rng.int(10, 90),
  };
};
const familiarities = (p: PlayerPosition) =>
  Object.fromEntries(PLAYER_POSITIONS.map((x) => [x, x === p ? 1 : 0])) as Record<
    PlayerPosition,
    number
  >;
const shared = (input: z.output<typeof creatorInputSchema>, seed: string) => {
  const rng = RandomGenerator.fromSeed(`${seed}:shared`);
  return {
    hiddenProfile: hidden(rng),
    developmentProfile: development(rng, input.difficulty),
    weakFootProficiency: rng.int(22, 75),
  };
};
export interface StartingPlayerProfile {
  player: Player;
  profileDescriptionKey: string;
  profileDescriptionParams: Record<string, string>;
  rollIndex: number;
  footballArchetypeId?: string;
  developmentProfile?: DevelopmentProfile;
  difficulty?: CareerDifficulty;
}
const build = (
  input: CreatorInput,
  seed: string,
  archetypeChoice: number | string,
): StartingPlayerProfile => {
  const parsed = creatorInputSchema.parse({ ...input, seed, age: STARTING_AGE });
  const common = shared(parsed, seed);
  const eligible = getEligibleFootballArchetypes(parsed.position);
  const archetype =
    typeof archetypeChoice === 'string'
      ? getFootballArchetype(archetypeChoice)
      : eligible[archetypeChoice % Math.max(1, eligible.length)];
  if (!archetype || !archetype.eligiblePositions.includes(parsed.position))
    throw new Error(`No eligible archetype for ${parsed.position}`);
  const rng = RandomGenerator.fromSeed(`${seed}:${parsed.position}:archetype:${archetype.id}`);
  const target = difficultyBase[parsed.difficulty];
  const attrs = Object.fromEntries(
    attributeKeys.map((k) => {
      const gk = ['reflexes', 'handling', 'oneOnOnes', 'goalkeeperSweeping'].includes(k);
      let base =
        gk && parsed.position !== 'goalkeeper'
          ? rng.int(4, 25)
          : target + rng.int(-10, 10) + (baseBias[parsed.position][k] ?? 0);
      const strengthIndex = archetype.strengths.indexOf(k);
      if (strengthIndex >= 0) base += Math.max(8, 18 - strengthIndex * 2);
      if (archetype.weaknesses.includes(k)) base -= 12;
      return [k, clamp(base)];
    }),
  ) as unknown as PlayerAttributes;
  const player: Player = {
    id: `player_${
      seed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 28) || 'career'
    }`,
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    age: STARTING_AGE,
    nationality: parsed.nationality,
    heightCm: parsed.heightCm,
    weightKg: parsed.weightKg,
    attributes: attrs,
    hiddenProfile: common.hiddenProfile,
    dominantFoot: parsed.dominantFoot,
    weakFootProficiency: common.weakFootProficiency,
    traits: [],
    careerPremiseId: promisingAcademyPlayerPremise.id,
    primaryPosition: parsed.position,
    secondaryPositions: [],
    positionFamiliarity: familiarities(parsed.position),
    fitness: 82,
    health: 100,
    morale: 55,
    reputation: 12,
    matchPresentation: 'important_matches',
    ...deriveInitialEffort(`${seed}:shared-effort`, attrs),
  };
  // Adjust only position-relevant outfield/GK values; never inflate unrelated GK attributes.
  const relevant = Object.keys(POSITION_OVR_WEIGHTS[parsed.position]) as AttributeKey[];
  for (let pass = 0; pass < 8; pass++) {
    const delta = target - getTheoreticalPositionOverall(player, parsed.position);
    if (Math.abs(delta) <= 1) break;
    for (const key of relevant)
      if (!archetype.strengths.includes(key)) attrs[key] = clamp(attrs[key] + Math.sign(delta));
  }
  const description = describePlayerProfile(player, archetype);
  return {
    player,
    developmentProfile: common.developmentProfile,
    profileDescriptionKey: 'creator.profileDescription',
    profileDescriptionParams: {
      description,
    },
    rollIndex: eligible.findIndex((item) => item.id === archetype.id),
    footballArchetypeId: archetype.id,
    difficulty: parsed.difficulty,
  };
};
export const generateStartingPlayerProfile = build;
export const generateStartingProfileVariants = (input: CreatorInput, seed: string) =>
  getEligibleFootballArchetypes(input.position).map((archetype) =>
    build(input, seed, archetype.id),
  );
export const makeReadableSeed = () =>
  globalThis.crypto?.randomUUID?.().slice(0, 18) ?? `career-${Date.now().toString(36)}`;
export const createCareerState = (profile: StartingPlayerProfile, seed: string): CareerState => {
  const fact: HistoryFact = {
    id: 'fact_career_started_2026',
    factType: 'career_started',
    season: 2026,
    date: '2026-07-01',
    actors: [profile.player.id],
    targets: [],
    clubs: [sampleClub.id],
    competitions: [],
    data: { club: sampleClub.name },
    causes: [],
    tags: ['career_start'],
    visibility: 'public',
    narrativeImportance: 45,
    emotionalTone: 'positive',
  };
  return {
    seed,
    difficulty: profile.difficulty ?? 'normal',
    currentSeason: 2026,
    careerSeasonNumber: 1,
    careerPhase: 'academy',
    player: profile.player,
    currentClub: sampleClub,
    previousClubIds: [],
    significantPeople: [samplePerson],
    relationships: {},
    historyFacts: [fact],
    storyThreads: [],
    statistics: { appearances: 0, goals: 0, assists: 0, trainings: 0 },
    developmentProfile: profile.developmentProfile,
    clubWorld: generateProfessionalClubPool(seed),
    completedSeasons: [],
    seasonParticipation: [],
    trainingApproach: 'balanced',
    trainingPlan: 'general',
    selectionStanding: 50,
  };
};
export const defaultBodyForPosition = (p: PositionId) =>
  ({
    goalkeeper: [190, 82],
    center_back: [187, 80],
    left_back: [178, 72],
    right_back: [178, 72],
    defensive_midfielder: [181, 76],
    attacking_midfielder: [177, 71],
    left_winger: [175, 69],
    right_winger: [175, 69],
    striker: [183, 78],
  })[p] as [number, number];
