import { z } from 'zod';
import type { PlayerPosition, ProfessionalClub, WorldFootballer } from '../types/domain';
import { generateCanonicalFootballerProfile } from './footballerWorld';
import { generateDevelopmentProfile } from './playerCreator';
import { RandomGenerator } from './random/RandomGenerator';
import { deriveNpcDevelopmentCurveId } from './seasonDevelopment';

const clampAcademyQuality = (value: number) => Math.max(30, Math.min(65, Math.round(value)));

/** Academy signals dominate deliberately; senior strength contributes only five percent. */
export const deriveYouthTeamQuality = (club: ProfessionalClub): number =>
  clampAcademyQuality(
    club.developmentReputation * 0.38 +
      club.youthPolicy * 0.27 +
      (club.infrastructure?.coachingQuality ?? 50) * 0.16 +
      (club.infrastructure?.trainingFacilities ?? 50) * 0.14 +
      (club.strengthRating ?? 50) * 0.05,
  );

export const youthTalentInputSchema = z.object({
  id: z.string().min(1),
  seed: z.string().min(1),
  age: z.number().int().min(15).max(17),
  referenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  primaryPosition: z.enum([
    'goalkeeper',
    'center_back',
    'left_back',
    'right_back',
    'defensive_midfielder',
    'attacking_midfielder',
    'left_winger',
    'right_winger',
    'striker',
  ]),
  academyQuality: z.number().min(30).max(65),
});

/**
 * Canonical academy model. Academy quality moves probabilities and potential, rather than being
 * treated as ready-made OVR. The stepped tail is intentionally very thin.
 */
export const generateYouthFootballer = (
  rawInput: z.input<typeof youthTalentInputSchema>,
): WorldFootballer => {
  const input = youthTalentInputSchema.parse(rawInput);
  const rng = RandomGenerator.fromSeed(`${input.seed}:${input.id}:youth-talent-v2`);
  const academyShift = (input.academyQuality - 47) / 18;
  const tailRoll = rng.int(1, 10_000) - Math.round(academyShift * 110);
  const bandBonus =
    tailRoll <= 8 ? 22 : tailRoll <= 55 ? 16 : tailRoll <= 420 ? 10 : tailRoll <= 2_250 ? 5 : 0;
  // Three small rolls form a centre-heavy distribution, unlike the former flat +/-10 range.
  const shapedNoise = rng.int(-4, 4) + rng.int(-3, 3) + rng.int(-2, 2);
  const ageAdjustment = input.age === 17 ? 1 : input.age === 15 ? -1 : 0;
  const targetOverall = Math.max(
    30,
    Math.min(76, Math.round(44 + academyShift * 2.2 + shapedNoise + bandBonus + ageAdjustment)),
  );
  const profile = generateCanonicalFootballerProfile({
    id: input.id,
    seed: `${input.seed}:canonical-youth-v2`,
    age: input.age,
    ...(input.referenceDate ? { referenceDate: input.referenceDate } : {}),
    targetOverall,
    primaryPosition: input.primaryPosition as PlayerPosition,
  });

  const potentialRng = RandomGenerator.fromSeed(`${input.seed}:${input.id}:youth-potential-v2`);
  const developmentProfile = generateDevelopmentProfile(potentialRng);
  const potentialNoise = potentialRng.int(-7, 7) + potentialRng.int(-4, 4);
  const rarePotential = potentialRng.int(1, 1000) <= 12 + Math.max(0, academyShift) * 5 ? 8 : 0;
  const capacityCenter = Math.round(
    68 + academyShift * 3 + potentialNoise + bandBonus * 0.22 + rarePotential,
  );
  for (const family of Object.keys(developmentProfile.familyCapacity) as Array<
    keyof typeof developmentProfile.familyCapacity
  >) {
    developmentProfile.familyCapacity[family] = Math.max(
      52,
      Math.min(96, capacityCenter + potentialRng.int(-5, 5)),
    );
  }

  const footballer: WorldFootballer = {
    profile,
    developmentProfile,
    careerStatus: 'active',
    reputation: Math.max(1, targetOverall - 30),
    fitness: rng.int(78, 100),
  };
  footballer.developmentCurveId = deriveNpcDevelopmentCurveId(footballer);
  return footballer;
};
