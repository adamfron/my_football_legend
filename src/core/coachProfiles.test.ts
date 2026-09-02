import { describe, expect, it } from 'vitest';
import { careerStateSchema, coachProfileSchema } from '../schemas/domainSchemas';
import { getAgeOnDate } from './age';
import {
  coachProfileToPerson,
  deriveCanonicalCoachProfile,
  resolveClubManagerId,
  resolveCoachProfile,
} from './coachProfiles';
import { getManagerPreferredFormation } from './footballerWorld';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { acceptProfessionalOffer } from './careerSeasons';
import { generateProfessionalOffers } from './professionalClubs';

const career = () =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Trener',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'striker',
        heightCm: 181,
        weightKg: 75,
        seed: 'coach-test',
      },
      'coach-test',
      0,
    ),
    'coach-test',
  );

describe('canonical coach profiles', () => {
  it('derives stable, distinct, schema-valid identities and formation from manager id', () => {
    const first = deriveCanonicalCoachProfile('manager-a', '2026-07-01');
    expect(deriveCanonicalCoachProfile('manager-a', '2035-01-01')).toEqual(first);
    expect(deriveCanonicalCoachProfile('manager-b')).not.toEqual(first);
    expect(first.personId).not.toBe(deriveCanonicalCoachProfile('manager-b').personId);
    expect(coachProfileSchema.safeParse(first).success).toBe(true);
    expect(getManagerPreferredFormation('manager-a')).toBe(first.preferredFormation);
  });

  it('projects age from the immutable birthday', () => {
    const profile = deriveCanonicalCoachProfile('manager-age');
    const person = coachProfileToPerson(profile, { id: 'club' }, '2030-07-01');
    expect(person.age).toBe(getAgeOnDate(profile.dateOfBirth, '2030-07-01'));
  });

  it('resolves the base assignment and lets the sparse override win without changing club policy', () => {
    const state = career();
    const club = state.clubWorld![0]!;
    expect(resolveClubManagerId(state, club.id)).toBe(club.managerId);
    const basePolicy = club.youthPolicy;
    const baseCoach = resolveCoachProfile(state, club.id)!;
    const overridden = {
      ...state,
      worldDelta: { ...state.worldDelta!, managerOverrides: { [club.id]: 'replacement' } },
    };
    expect(resolveClubManagerId(overridden, club.id)).toBe('replacement');
    expect(resolveCoachProfile(overridden, club.id)!.personId).toBe('replacement');
    expect(club.youthPolicy).toBe(basePolicy);
    expect(baseCoach.youthTrust).toBeDefined();
  });

  it('adds the actual destination coach once and needs no seasonal manager mutation', () => {
    const state = career();
    state.professionalOffers = generateProfessionalOffers(state);
    const offer = state.professionalOffers[0]!;
    const expectedId = resolveClubManagerId(state, offer.club.id)!;
    const joined = acceptProfessionalOffer(state, offer.id);
    expect(joined.significantPeople.filter((person) => person.id === expectedId)).toHaveLength(1);
    const metAgain = acceptProfessionalOffer({ ...joined, professionalOffers: [offer] }, offer.id);
    expect(metAgain.significantPeople.filter((person) => person.id === expectedId)).toHaveLength(1);
    expect(metAgain.worldDelta!.managerOverrides).toEqual(joined.worldDelta!.managerOverrides);
    expect(careerStateSchema.safeParse(metAgain).success).toBe(true);
  });
});
