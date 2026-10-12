import type {
  CareerState,
  CosmeticOverrides,
  FaceGenome,
  FootballerProfile,
  FootballerVisualIdentity,
  Person,
  ResolvedAppearance,
} from '../types/domain';
import {
  cosmeticOverridesSchema,
  faceGenomeSchema,
  footballerVisualIdentitySchema,
} from '../schemas/domainSchemas';
import { z } from 'zod';
import { getProfileAge } from './age';
import { hashRandomSeed, RandomGenerator } from './random/RandomGenerator';

export const VISUAL_MODEL_VERSION = 1 as const;
export const HAIRSTYLES = ['cropped', 'short', 'side_part', 'curly', 'long', 'shaved'] as const;
export const FACIAL_HAIR_STYLES = ['none', 'stubble', 'beard'] as const;
export const VISUAL_ACCESSORIES = ['none', 'headband', 'glasses'] as const;
export type { CosmeticOverrides, FootballerVisualIdentity, ResolvedAppearance };
export const matchVisualContextSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Only edited identities are copied. Every ordinary NPC resolves from its canonical ID. */
    visualIdentities: z.record(z.string().min(1), footballerVisualIdentitySchema),
  })
  .strict();
export type MatchVisualContext = z.infer<typeof matchVisualContextSchema>;

/** Person fields are reused when an existing narrative Person is the source. No duplicate Person is needed. */
export type VisualIdentitySource = Pick<FootballerProfile, 'id'> &
  Partial<
    Pick<
      FootballerProfile,
      | 'age'
      | 'dateOfBirth'
      | 'heightCm'
      | 'weightKg'
      | 'visualIdentity'
      | 'firstName'
      | 'lastName'
      | 'nationality'
    >
  > &
  Partial<Pick<Person, 'faceSeed' | 'faceGenome'>>;

const unit = (value: number) => Math.max(0, Math.min(1, value));
const faceKeys = Object.keys(faceGenomeSchema.shape) as (keyof FaceGenome)[];

/** Every visual draw uses its own versioned stream; football seeds and RNG state are never inputs. */
export const resolveFaceGenome = (
  faceSeed: string,
  chosenFace?: FaceGenome,
  visualModelVersion = VISUAL_MODEL_VERSION,
): FaceGenome => {
  if (visualModelVersion !== VISUAL_MODEL_VERSION)
    throw new Error('Unsupported visual model version.');
  if (chosenFace) return faceGenomeSchema.parse(chosenFace);
  const rng = RandomGenerator.fromSeed(`visual-dna:v${visualModelVersion}:${faceSeed}`);
  return Object.fromEntries(faceKeys.map((key) => [key, rng.float()])) as unknown as FaceGenome;
};

export const createVisualIdentity = (
  id: string,
  initialFace?: Partial<FaceGenome>,
  cosmetics?: CosmeticOverrides,
): FootballerVisualIdentity => {
  const faceSeed = `footballer:${id}`;
  return footballerVisualIdentitySchema.parse({
    version: VISUAL_MODEL_VERSION,
    faceSeed,
    ...(initialFace ? { faceGenome: { ...resolveFaceGenome(faceSeed), ...initialFace } } : {}),
    ...(cosmetics ? { cosmetics } : {}),
  });
};

const choose = <T>(items: readonly T[], value: number): T =>
  items[Math.min(items.length - 1, Math.floor(value * items.length))]!;

/** One reconstruction for match bodies, portraits, creator previews and future narrative roles. */
export const deriveAppearance = (
  identity: VisualIdentitySource,
  calendarDate: string,
  cosmeticOverrides?: CosmeticOverrides,
  visualModelVersion = VISUAL_MODEL_VERSION,
): ResolvedAppearance => {
  const stored = identity.visualIdentity;
  if (stored && stored.version !== visualModelVersion)
    throw new Error('Visual identity/model version mismatch.');
  const faceSeed = stored?.faceSeed ?? identity.faceSeed ?? `footballer:${identity.id}`;
  const baseFace = resolveFaceGenome(
    faceSeed,
    stored?.faceGenome ?? identity.faceGenome,
    visualModelVersion,
  );
  const ageYears = getProfileAge(
    { id: identity.id, age: identity.age ?? 24, dateOfBirth: identity.dateOfBirth },
    calendarDate,
    '2026-07-01',
  );
  const choices = cosmeticOverridesSchema.parse({ ...stored?.cosmetics, ...cosmeticOverrides });
  const cosmetics: ResolvedAppearance['cosmetics'] = {
    presentation: choices.presentation ?? 'neutral',
    hairstyle: choices.hairstyle ?? choose(HAIRSTYLES, baseFace.hairstyle),
    hairColor: choices.hairColor ?? baseFace.hairColor,
    facialHair:
      choices.facialHair ??
      (ageYears < 18 ? 'none' : choose(FACIAL_HAIR_STYLES, baseFace.facialHair)),
    accessories: choices.accessories ?? 'none',
  };
  const maturity = unit((ageYears - 15) / 10);
  const ageLines = unit((ageYears - 28) / 55) * (0.25 + baseFace.ageSigns * 0.45);
  const greyFraction = unit((ageYears - 32 - baseFace.ageSigns * 8) / 45);
  const face: FaceGenome = {
    ...baseFace,
    // Subtle maturation preserves the stored jaw/head/chin identity rather than rerolling it.
    headProportion: unit(baseFace.headProportion + (maturity - 0.5) * 0.025),
    chinLength: unit(baseFace.chinLength + maturity * 0.035),
    hairColor: cosmetics.hairColor!,
    hairstyle: HAIRSTYLES.indexOf(cosmetics.hairstyle!) / HAIRSTYLES.length,
    facialHair: FACIAL_HAIR_STYLES.indexOf(cosmetics.facialHair!) / FACIAL_HAIR_STYLES.length,
    accessories: VISUAL_ACCESSORIES.indexOf(cosmetics.accessories!) / VISUAL_ACCESSORIES.length,
    ageSigns: ageLines,
  };
  return {
    identityId: identity.id,
    version: VISUAL_MODEL_VERSION,
    faceSeed,
    baseFace,
    face,
    ageYears,
    maturity,
    ageLines,
    greyFraction,
    cosmetics,
    heightCm: identity.heightCm ?? 180,
    weightKg: identity.weightKg ?? 75,
  };
};
export const deriveFootballerAppearance = deriveAppearance;

const styleFingerprint = (cosmetics: ResolvedAppearance['cosmetics']) =>
  hashRandomSeed(
    JSON.stringify([
      cosmetics.presentation,
      cosmetics.hairstyle,
      cosmetics.hairColor,
      cosmetics.facialHair,
      cosmetics.accessories,
    ]),
  ).toString(16);

/** Reversible protagonist cosmetics; morphology, attributes, dates and football RNG are untouched. */
export const updateCareerAppearance = (
  career: CareerState,
  overrides: CosmeticOverrides,
): CareerState => {
  const date = career.currentDate ?? `${career.currentSeason}-07-01`;
  const previous = deriveAppearance(career.player, date);
  const next = deriveAppearance(career.player, date, overrides);
  const previousFingerprint = styleFingerprint(previous.cosmetics);
  const fingerprint = styleFingerprint(next.cosmetics);
  if (previousFingerprint === fingerprint) return career;
  const identity = career.player.visualIdentity ?? createVisualIdentity(career.player.id);
  const metadata = identity.changeMetadata;
  const recent = metadata?.recentStyleFingerprints ?? [previousFingerprint];
  const elapsed = metadata?.lastCountedDate
    ? (Date.parse(date) - Date.parse(metadata.lastCountedDate)) / 86_400_000
    : Infinity;
  const counted = !recent.includes(fingerprint) && elapsed >= 7;
  const visualIdentity = footballerVisualIdentitySchema.parse({
    ...identity,
    cosmetics: { ...identity.cosmetics, ...cosmeticOverridesSchema.parse(overrides) },
    changeMetadata: {
      meaningfulChanges: (metadata?.meaningfulChanges ?? 0) + (counted ? 1 : 0),
      lastChangedDate: date,
      ...(counted
        ? { lastCountedDate: date }
        : metadata?.lastCountedDate
          ? { lastCountedDate: metadata.lastCountedDate }
          : {}),
      recentStyleFingerprints: [
        ...recent.filter((item) => item !== fingerprint),
        fingerprint,
      ].slice(-8),
    },
  });
  return { ...career, player: { ...career.player, visualIdentity } };
};

/** Appearance lives in optional presentation data, never in the canonical football contract/hash. */
export const toCanonicalFootballProfile = <T extends FootballerProfile>(profile: T): T => {
  if (!profile.visualIdentity) return profile;
  const { visualIdentity: _visualIdentity, ...football } = profile;
  void _visualIdentity;
  return football as T;
};
