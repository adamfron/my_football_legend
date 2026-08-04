import { z } from 'zod';
import { sampleClub } from '../content/clubs/sampleClub';
import { promisingAcademyPlayerPremise } from '../content/archetypes/everyman';
import { samplePerson } from '../content/sampleContent';
import type { CareerState, HistoryFact, Player, PlayerAttributes } from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';

export const positionIds = ['goalkeeper','center_back','full_back','defensive_midfielder','central_midfielder','attacking_midfielder','winger','striker'] as const;
export type PositionId = (typeof positionIds)[number];
export const dominantFootIds = ['right','left'] as const;
export type DominantFoot = (typeof dominantFootIds)[number];
export const nationalityIds = ['PL'] as const;
export type NationalityId = (typeof nationalityIds)[number];

export const identityInputSchema = z.object({
  firstName: z.string().trim().min(2, 'Podaj imię zawodnika.').max(32, 'Imię jest zbyt długie.'),
  lastName: z.string().trim().min(2, 'Podaj nazwisko zawodnika.').max(40, 'Nazwisko jest zbyt długie.'),
  nationality: z.enum(nationalityIds, { error: 'Wybierz narodowość.' }),
  age: z.coerce.number().int('Wiek musi być liczbą całkowitą.').min(16, 'Minimalny wiek startowy to 16 lat.').max(18, 'Maksymalny wiek startowy to 18 lat.'),
  dominantFoot: z.enum(dominantFootIds, { error: 'Wybierz dominującą nogę.' }),
  customSeed: z.string().trim().max(48, 'Seed może mieć maksymalnie 48 znaków.').optional(),
});
export type IdentityInput = z.infer<typeof identityInputSchema>;

export const profileInputSchema = z.object({
  position: z.enum(positionIds, { error: 'Wybierz pozycję.' }),
  heightCm: z.coerce.number().int('Wzrost musi być liczbą całkowitą.').min(155, 'Minimalny wzrost to 155 cm.').max(205, 'Maksymalny wzrost to 205 cm.'),
  weightKg: z.coerce.number().int('Masa musi być liczbą całkowitą.').min(50, 'Minimalna masa to 50 kg.').max(105, 'Maksymalna masa to 105 kg.'),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const creatorInputSchema = identityInputSchema.extend({ position: z.enum(positionIds), heightCm: profileInputSchema.shape.heightCm, weightKg: profileInputSchema.shape.weightKg, seed: z.string().trim().min(1) });
export type CreatorInput = z.infer<typeof creatorInputSchema>;

const attributeKeys = ['technique','vision','pace','stamina','finishing','defending','leadership','composure'] as const;
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
  return `career-${Date.now().toString(36)}-${Array.from(values).map((v) => v.toString(36)).join('-')}`;
};

export interface StartingPlayerProfile { player: Player; profileDescriptionKey: string; profileDescriptionParams: Record<string, string>; rollIndex: number }

export const generateStartingPlayerProfile = (input: CreatorInput, seed: string, rollIndex: number): StartingPlayerProfile => {
  const parsed = creatorInputSchema.parse({ ...input, seed });
  const rng = RandomGenerator.fromSeed(`${seed}:${parsed.firstName}:${parsed.lastName}:${parsed.position}:${rollIndex}`);
  const attributes = Object.fromEntries(attributeKeys.map((key) => {
    const base = rng.int(31, 50);
    const ageBonus = parsed.age - 16;
    const noise = rng.int(-6, 8);
    return [key, clamp(base + ageBonus + (biases[parsed.position][key] ?? 0) + noise, 24, 66)];
  })) as PlayerAttributes;
  const potential = clamp(62 + rng.int(0, 24) + (18 - parsed.age) * 2, 60, 88);
  const player: Player = {
    id: `player_${seed.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 28) || 'career'}`,
    firstName: parsed.firstName.trim(), lastName: parsed.lastName.trim(), age: parsed.age, nationality: parsed.nationality,
    heightCm: parsed.heightCm, weightKg: parsed.weightKg, attributes, traits: [`foot_${parsed.dominantFoot}`],
    archetypeId: 'everyman', careerPremiseId: promisingAcademyPlayerPremise.id, potential,
    primaryPosition: parsed.position, secondaryPositions: [], positionFamiliarity: { [parsed.position]: 1 }, preferredRoles: [], fitness: 82, health: 100, morale: 55, reputation: 12,
  };
  const sorted = [...attributeKeys].sort((a, b) => attributes[b] - attributes[a]);
  return { player, profileDescriptionKey: 'creator.profileDescription', profileDescriptionParams: { strong1: `attribute.${sorted[0]}`, strong2: `attribute.${sorted[1]}`, weak: `attribute.${sorted.at(-1)}`, position: `position.${parsed.position}` }, rollIndex };
};

export const canReroll = (rollIndex: number) => rollIndex < 2;

export const createCareerState = (profile: StartingPlayerProfile, seed: string): CareerState => {
  const playerId = profile.player.id;
  const firstFact: HistoryFact = { id: 'fact_career_started_2026', factType: 'career_started', season: 2026, date: '2026-07-01', actors: [playerId], targets: [samplePerson.id], clubs: [sampleClub.id], competitions: [], data: { academy: sampleClub.name, action: 'academy_training_started' }, causes: [], tags: ['career_start','academy','vistula_nova'], visibility: 'public', narrativeImportance: 45, emotionalTone: 'positive' };
  return { seed, currentSeason: 2026, player: profile.player, currentClub: sampleClub, previousClubIds: [], significantPeople: [samplePerson], relationships: { [samplePerson.id]: { liking: 50, trust: 50, respect: 50, rivalry: 0, resentment: 0, gratitude: 0, professionalDependence: 25 } }, historyFacts: [firstFact], storyThreads: [], statistics: { appearances: 0, goals: 0, assists: 0, trainings: 0 } };
};

export const defaultBodyForPosition = (position: PositionId) => ({ goalkeeper: [190,82], center_back: [187,80], full_back: [178,72], defensive_midfielder: [181,76], central_midfielder: [179,73], attacking_midfielder: [176,70], winger: [174,68], striker: [183,78] }[position] as [number, number]);
export { attributeKeys };
