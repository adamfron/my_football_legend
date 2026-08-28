import { z } from 'zod';
import { sampleClub } from '../content/clubs/sampleClub';
import { promisingAcademyPlayerPremise } from '../content/archetypes/everyman';
import { samplePerson } from '../content/sampleContent';
import type { CareerState, HistoryFact, Player, PlayerAttributes } from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';
import { generateProfessionalClubPool } from './professionalClubs';
import { deriveGoalkeeperAttributes, goalkeeperAttributeLabels } from './goalkeeperAttributes';
import { deriveInitialEffort } from './playerPreferences';

export const STARTING_AGE = 16;
export const MIN_HEIGHT_CM = 155;
export const MAX_HEIGHT_CM = 205;
export const MIN_WEIGHT_KG = 45;
export const MAX_WEIGHT_KG = 120;
export const MAX_PROFILE_VARIANTS = 3;

export const positionIds = [
  'goalkeeper',
  'center_back',
  'full_back',
  'defensive_midfielder',
  'central_midfielder',
  'attacking_midfielder',
  'winger',
  'striker',
] as const;
export type PositionId = (typeof positionIds)[number];
export const dominantFootIds = ['right', 'left'] as const;
export type DominantFoot = (typeof dominantFootIds)[number];
export const nationalityIds = ['PL'] as const;
export type NationalityId = (typeof nationalityIds)[number];

const integerField = (
  emptyMessage: string,
  numberMessage: string,
  configure?: (schema: z.ZodNumber) => z.ZodNumber,
) => {
  const baseSchema = z.number({ error: emptyMessage }).finite(numberMessage).int(numberMessage);
  const numberSchema = configure ? configure(baseSchema) : baseSchema;

  return z.preprocess((value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (trimmed === '') return undefined;

      return Number(trimmed);
    }

    return value;
  }, numberSchema);
};

export const getAllowedWeightRange = (heightCm: number): { min: number; max: number } => {
  const meters = heightCm / 100;
  const min = Math.ceil(Math.max(MIN_WEIGHT_KG, 18 * meters * meters));
  const max = Math.floor(Math.min(MAX_WEIGHT_KG, 30 * meters * meters));
  return { min, max };
};

export const identityInputSchema = z.object({
  firstName: z.string().trim().min(2, 'Podaj imię zawodnika.').max(32, 'Imię jest zbyt długie.'),
  lastName: z
    .string()
    .trim()
    .min(2, 'Podaj nazwisko zawodnika.')
    .max(40, 'Nazwisko jest zbyt długie.'),
  nationality: z.enum(nationalityIds, { error: 'Wybierz narodowość.' }),
  age: z.literal(STARTING_AGE, { error: 'Standardowa kariera zaczyna się w wieku 16 lat.' }),
  dominantFoot: z.enum(dominantFootIds, { error: 'Wybierz dominującą nogę.' }),
  customSeed: z.string().trim().max(48, 'Seed może mieć maksymalnie 48 znaków.').optional(),
});
export type IdentityInput = z.infer<typeof identityInputSchema>;

const heightCmSchema = integerField(
  'Podaj wzrost zawodnika.',
  'Wzrost musi być liczbą całkowitą.',
  (schema) =>
    schema
      .min(MIN_HEIGHT_CM, `Minimalny wzrost to ${MIN_HEIGHT_CM} cm.`)
      .max(MAX_HEIGHT_CM, `Maksymalny wzrost to ${MAX_HEIGHT_CM} cm.`),
);
const weightKgSchema = integerField(
  'Podaj masę ciała zawodnika.',
  'Masa musi być liczbą całkowitą.',
);

export const profileInputSchema = z
  .object({
    position: z.enum(positionIds, { error: 'Wybierz pozycję.' }),
    heightCm: heightCmSchema,
    weightKg: weightKgSchema,
  })
  .superRefine((value, ctx) => {
    if (!Number.isInteger(value.heightCm) || !Number.isInteger(value.weightKg)) return;
    const range = getAllowedWeightRange(value.heightCm);
    if (value.weightKg < range.min || value.weightKg > range.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['weightKg'],
        message: `Masa dla tego wzrostu musi mieścić się w zakresie ${range.min}–${range.max} kg.`,
      });
    }
  });
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const creatorInputSchema = identityInputSchema
  .extend({
    position: z.enum(positionIds),
    heightCm: heightCmSchema,
    weightKg: weightKgSchema,
    seed: z.string().trim().min(1),
  })
  .superRefine((value, ctx) => {
    const range = getAllowedWeightRange(value.heightCm);
    if (value.weightKg < range.min || value.weightKg > range.max)
      ctx.addIssue({
        code: 'custom',
        path: ['weightKg'],
        message: `Masa dla tego wzrostu musi mieścić się w zakresie ${range.min}–${range.max} kg.`,
      });
  });
export type CreatorInput = z.infer<typeof creatorInputSchema>;

const attributeKeys = [
  'technique',
  'vision',
  'pace',
  'stamina',
  'finishing',
  'defending',
  'leadership',
  'composure',
  'spatialAwareness',
  'determination',
  'ambition',
  'professionalism',
] as const;
export type AttributeKey = (typeof attributeKeys)[number];

const biases: Record<PositionId, Partial<Record<AttributeKey, number>>> = {
  goalkeeper: { defending: 8, composure: 8, leadership: 3, finishing: -8, pace: -2 },
  center_back: { defending: 9, composure: 5, stamina: 2, finishing: -5 },
  full_back: { pace: 7, stamina: 6, defending: 5, technique: 2 },
  defensive_midfielder: { defending: 6, stamina: 5, vision: 5, composure: 4 },
  central_midfielder: { vision: 7, technique: 6, stamina: 4, composure: 3 },
  attacking_midfielder: { technique: 7, vision: 7, finishing: 3, defending: -4 },
  winger: { pace: 9, technique: 7, stamina: 3, defending: -4 },
  striker: { finishing: 10, composure: 5, pace: 3, defending: -6 },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const makeReadableSeed = (): string => {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID().slice(0, 18);
  const values = new Uint32Array(2);
  cryptoObject?.getRandomValues?.(values);
  return `career-${Date.now().toString(36)}-${Array.from(values)
    .map((v) => v.toString(36))
    .join('-')}`;
};

export interface StartingPlayerProfile {
  player: Player;
  profileDescriptionKey: string;
  profileDescriptionParams: Record<string, string>;
  rollIndex: number;
}

export const generateStartingPlayerProfile = (
  input: CreatorInput,
  seed: string,
  rollIndex: number,
): StartingPlayerProfile => {
  const parsed = creatorInputSchema.parse({ ...input, seed, age: STARTING_AGE });
  const rng = RandomGenerator.fromSeed(
    `${seed}:${parsed.firstName}:${parsed.lastName}:${parsed.position}:${rollIndex}`,
  );
  const rollAttribute = (key: AttributeKey): number =>
    clamp(rng.int(31, 50) + (biases[parsed.position][key] ?? 0) + rng.int(-6, 8), 24, 66);
  const attributes: PlayerAttributes = {
    technique: rollAttribute('technique'),
    vision: rollAttribute('vision'),
    pace: rollAttribute('pace'),
    stamina: rollAttribute('stamina'),
    finishing: rollAttribute('finishing'),
    defending: rollAttribute('defending'),
    leadership: rollAttribute('leadership'),
    composure: rollAttribute('composure'),
    spatialAwareness: rollAttribute('spatialAwareness'),
    determination: rollAttribute('determination'),
    ambition: rollAttribute('ambition'),
    professionalism: rollAttribute('professionalism'),
  };
  const effort = deriveInitialEffort(`${seed}:${rollIndex}`, attributes);
  const player: Player = {
    id: `player_${
      seed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 28) || 'career'
    }`,
    firstName: parsed.firstName.trim(),
    lastName: parsed.lastName.trim(),
    age: STARTING_AGE,
    nationality: parsed.nationality,
    heightCm: parsed.heightCm,
    weightKg: parsed.weightKg,
    attributes,
    ...(parsed.position === 'goalkeeper'
      ? {
          goalkeeperAttributes: deriveGoalkeeperAttributes(
            `${seed}:${rollIndex}`,
            attributes,
            STARTING_AGE,
            57 + rng.int(-4, 6),
          ),
        }
      : {}),
    traits: [`foot_${parsed.dominantFoot}`],
    archetypeId: 'everyman',
    careerPremiseId: promisingAcademyPlayerPremise.id,
    potential: clamp(62 + rng.int(0, 24) + 4, 60, 88),
    primaryPosition: parsed.position,
    secondaryPositions: [],
    positionFamiliarity: { [parsed.position]: 1 },
    preferredRoles: [],
    fitness: 82,
    health: 100,
    morale: 55,
    reputation: 12,
    matchPresentation: 'important_matches',
    ...effort,
  };
  const goalkeeperSorted = player.goalkeeperAttributes
    ? (
        Object.keys(player.goalkeeperAttributes) as Array<keyof typeof player.goalkeeperAttributes>
      ).sort((a, b) => player.goalkeeperAttributes![b] - player.goalkeeperAttributes![a])
    : [];
  const sorted = [...attributeKeys].sort((a, b) => attributes[b] - attributes[a]);
  return {
    player,
    profileDescriptionKey: 'creator.profileDescription',
    profileDescriptionParams: {
      strong1: player.goalkeeperAttributes
        ? goalkeeperAttributeLabels[goalkeeperSorted[0]!]
        : `attribute.${sorted[0]}`,
      strong2: player.goalkeeperAttributes
        ? goalkeeperAttributeLabels[goalkeeperSorted[1]!]
        : `attribute.${sorted[1]}`,
      weak: player.goalkeeperAttributes
        ? goalkeeperAttributeLabels[goalkeeperSorted.at(-1)!]
        : `attribute.${sorted.at(-1)}`,
      position: `position.${parsed.position}`,
    },
    rollIndex,
  };
};

export const canReroll = (rollIndex: number) => rollIndex < MAX_PROFILE_VARIANTS - 1;

export const createCareerState = (profile: StartingPlayerProfile, seed: string): CareerState => {
  const playerId = profile.player.id;
  const firstFact: HistoryFact = {
    id: 'fact_career_started_2026',
    factType: 'career_started',
    season: 2026,
    date: '2026-07-01',
    actors: [playerId],
    targets: [],
    clubs: [sampleClub.id],
    competitions: [],
    data: { club: sampleClub.name, action: 'first_season_started' },
    causes: [],
    tags: ['career_start', 'u17', 'vistula_nova'],
    visibility: 'public',
    narrativeImportance: 45,
    emotionalTone: 'positive',
  };
  const profileRng = RandomGenerator.fromSeed(`${seed}:development-profile`);
  const developmentType = profileRng.pick(['early_bloomer', 'normal', 'late_bloomer'] as const);
  return {
    seed,
    currentSeason: 2026,
    careerSeasonNumber: 1,
    careerPhase: 'academy',
    player: profile.player,
    currentClub: sampleClub,
    previousClubIds: [],
    significantPeople: [samplePerson],
    relationships: {
      [samplePerson.id]: {
        liking: 50,
        trust: 50,
        respect: 50,
        rivalry: 0,
        resentment: 0,
        gratitude: 0,
        professionalDependence: 25,
      },
    },
    historyFacts: [firstFact],
    storyThreads: [],
    statistics: { appearances: 0, goals: 0, assists: 0, trainings: 0 },
    developmentProfile: {
      developmentType,
      growthRate: profileRng.int(85, 125) / 100,
      peakAge: developmentType === 'late_bloomer' ? profileRng.int(27, 30) : profileRng.int(23, 28),
      declineStartAge: profileRng.int(29, 33),
      softPotential: profile.player.potential,
      developmentVolatility: profileRng.int(5, 22),
      physicalPeakAge: profileRng.int(23, 27),
      technicalPeakAge: profileRng.int(26, 30),
      mentalPeakAge: profileRng.int(28, 32),
    },
    clubWorld: generateProfessionalClubPool(seed),
    completedSeasons: [],
    seasonParticipation: [],
    trainingApproach: 'balanced',
    selectionStanding: 50,
  };
};

export const defaultBodyForPosition = (position: PositionId) =>
  ({
    goalkeeper: [190, 82],
    center_back: [187, 80],
    full_back: [178, 72],
    defensive_midfielder: [181, 76],
    central_midfielder: [179, 73],
    attacking_midfielder: [176, 70],
    winger: [174, 68],
    striker: [183, 78],
  })[position] as [number, number];
export { attributeKeys };
