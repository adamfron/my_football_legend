import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import {
  generateProfessionalOffers,
  generateProfessionalClubPool,
  evaluateClubInterest,
} from './professionalClubs';
import { acceptProfessionalOffer } from './careerSeasons';
import { careerStateSchema } from '../schemas/domainSchemas';
import { getCurrentHeadCoach } from './careerPresentation';
import { getSeasonPlayerSummary } from './matchFeedback';
import { getSeasonProgress } from './seasonProgress';
import { settleLeagueRound, getLeagueTable } from './leagueSeason';
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
    expect(generateProfessionalOffers(a).length).toBeLessThanOrEqual(4);
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
    expect(next.currentSeason).toBe(2027);
    expect(next.leagueSeason?.controlledClubId).toBe(next.currentClub.id);
    expect(next.leagueSeason?.competition.category).toBe('professional');
    expect(new Set(next.leagueSeason?.clubs.map((club) => club.name)).size).toBe(12);
    expect(next.activeMatch).toBeUndefined();
    expect(next.activeEvent).toBeUndefined();
    expect(next.leagueSeason?.name).toBe('2027/28');
    expect(next.careerCalendar?.fixtures[0]?.date).toBe('2027-08-29');
    expect(getCurrentHeadCoach(next)?.clubId).toBe(next.currentClub.id);
    expect(getSeasonPlayerSummary(next, next.currentSeason).appearances).toBe(0);
    expect(next.significantPeople.some((person) => person.clubId === 'club_vistula_nova')).toBe(
      true,
    );
    const afterRound = settleLeagueRound(next, 0);
    expect(getLeagueTable(afterRound).every((row) => row.played === 1)).toBe(true);
    expect(
      getSeasonProgress({
        ...next,
        decisionPoint: { type: 'checkpoint', date: '2027-09-01', sourceId: 'test' },
      }).progress,
    ).toBeGreaterThan(getSeasonProgress(next).progress);
    expect(
      next.historyFacts.some(
        (fact) => fact.factType === 'first_professional_contract' && fact.season === 2027,
      ),
    ).toBe(true);
    expect(careerStateSchema.safeParse(next).success).toBe(true);
  });
});
