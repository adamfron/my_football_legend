import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import {
  generateProfessionalOffers,
  generateProfessionalClubPool,
  evaluateClubInterest,
} from './professionalClubs';
import { acceptProfessionalOffer } from './careerSeasons';
import { careerStateSchema } from '../schemas/domainSchemas';
const career = () =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Testowy',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'central_midfielder',
        heightCm: 178,
        weightKg: 70,
        seed: 'offers',
      },
      'offers',
      0,
    ),
    'offers',
  );
describe('professional transition', () => {
  it('generates deterministic contextual offers', () => {
    const a = career();
    a.matchHistory = Array.from({ length: 20 }, (_, i) => ({
      matchId: `m${i}`,
      date: `2027-0${(i % 5) + 1}-01`,
      opponentId: 'x',
      teamLevel: 'academy' as const,
      started: true,
      minutes: 80,
      goals: 0,
      assists: 1,
      xG: 0.1,
      xA: 0.2,
      keyPasses: 3,
      defensiveActions: 2,
      saves: 0,
      personalImpact: 1,
      rating: 7,
    }));
    expect(generateProfessionalOffers(a)).toEqual(generateProfessionalOffers(a));
  });
  it('need and youth trust increase interest', () => {
    const c = career();
    const club = generateProfessionalClubPool(c.seed)[0]!;
    const low = {
      ...club,
      coachYouthTrust: 10,
      positionalNeeds: {
        ...club.positionalNeeds,
        midfield: { starterQuality: 70, depth: 'deep' as const, needLevel: 10 },
      },
    };
    const high = {
      ...club,
      coachYouthTrust: 95,
      positionalNeeds: {
        ...club.positionalNeeds,
        midfield: { starterQuality: 45, depth: 'thin' as const, needLevel: 95 },
      },
    };
    expect(evaluateClubInterest(c, high).score).toBeGreaterThan(evaluateClubInterest(c, low).score);
  });
  it('acceptance creates contract and valid season 2', () => {
    const c = career();
    c.professionalOffers = generateProfessionalOffers(c);
    const offer = c.professionalOffers[0];
    if (!offer) return;
    const next = acceptProfessionalOffer(c, offer.id);
    expect(next.careerSeasonNumber).toBe(2);
    expect(next.currentContract?.clubId).toBe(next.currentClub.id);
    expect(careerStateSchema.safeParse(next).success).toBe(true);
  });
});
