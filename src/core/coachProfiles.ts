import type { CareerState, CoachProfile, Id, Person, ProfessionalClub } from '../types/domain';
import { coachProfileSchema } from '../schemas/domainSchemas';
import { getAgeOnDate } from './age';
import { RandomGenerator } from './random/RandomGenerator';

const formations = ['4-3-3', '4-2-3-1', '4-4-2', '3-4-2-1', '3-5-2'] as const;
const tacticalStyles = [
  'possession',
  'balanced',
  'direct',
  'counter_attacking',
  'pressing',
] as const;
const firstNames = ['Piotr', 'Robert', 'Dariusz', 'Krzysztof', 'Marek', 'Tomasz', 'Jacek', 'Paweł'];
const lastNames = ['Sikora', 'Maj', 'Kowalik', 'Brzoza', 'Wrona', 'Lis', 'Kaczmarek', 'Wolski'];
const profileCache = new Map<Id, CoachProfile>();

/** Pure canonical generation. referenceDate is accepted for callers that also project age. */
export const deriveCanonicalCoachProfile = (
  managerId: Id,
  referenceDate = '2026-07-01',
): CoachProfile => {
  // The date is deliberately not part of generation; callers use it only when projecting age.
  void referenceDate;
  const cached = profileCache.get(managerId);
  if (cached) return cached;
  const rng = RandomGenerator.fromSeed(`canonical-coach:${managerId}`);
  const birthYear = rng.int(1967, 1988);
  const month = String(rng.int(1, 12)).padStart(2, '0');
  const day = String(rng.int(1, 28)).padStart(2, '0');
  const preferredFormation = RandomGenerator.fromSeed(`manager-formation:${managerId}`).pick(
    formations,
  );
  const otherFormations = formations.filter((formation) => formation !== preferredFormation);
  const profile = coachProfileSchema.parse({
    id: `coach-profile:${managerId}`,
    personId: managerId,
    dateOfBirth: `${birthYear}-${month}-${day}`,
    nationality: 'Polska',
    reputation: rng.int(30, 88),
    preferredFormation,
    secondaryFormation: rng.pick(otherFormations),
    tacticalStyle: rng.pick(tacticalStyles),
    rotationPreference: rng.int(20, 90),
    youthTrust: rng.int(15, 95),
    experiencePreference: rng.int(15, 95),
    positionalFlexibility: rng.int(15, 95),
    formPatience: rng.int(15, 95),
    adaptability: rng.int(20, 90),
  });
  profileCache.set(managerId, profile);
  return profile;
};

const resolveBaseClub = (career: Pick<CareerState, 'clubWorld'>, clubId: Id) =>
  career.clubWorld?.find((club) => club.id === clubId);

export const resolveClubManagerId = (
  career: Pick<CareerState, 'clubWorld' | 'worldDelta'>,
  clubId: Id,
): Id | undefined =>
  career.worldDelta?.managerOverrides[clubId] ?? resolveBaseClub(career, clubId)?.managerId;

export const resolveCoachProfile = (
  career: Pick<CareerState, 'clubWorld' | 'worldDelta' | 'currentDate'>,
  clubId: Id,
  date = career.currentDate ?? '2026-07-01',
): CoachProfile | undefined => {
  const managerId = resolveClubManagerId(career, clubId);
  return managerId ? deriveCanonicalCoachProfile(managerId, date) : undefined;
};

export const coachProfileToPerson = (
  profile: CoachProfile,
  club: Pick<ProfessionalClub, 'id'>,
  date: string,
): Person => {
  const nameRng = RandomGenerator.fromSeed(`canonical-coach-name:${profile.personId}`);
  return {
    id: profile.personId,
    firstName: nameRng.pick(firstNames),
    lastName: nameRng.pick(lastNames),
    role: 'coach',
    nationality: profile.nationality,
    age: getAgeOnDate(profile.dateOfBirth, date),
    dateOfBirth: profile.dateOfBirth,
    personality: [profile.tacticalStyle],
    clubId: club.id,
    persistence: 'career',
    relationshipParameters: {
      liking: 45,
      trust: 42,
      respect: 52,
      rivalry: 0,
      resentment: 0,
      gratitude: 0,
      professionalDependence: 45,
    },
    faceSeed: `coach:${profile.personId}`,
    narrativeTags: ['head_coach', 'professional'],
  };
};
