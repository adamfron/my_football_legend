import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import {
  generateProfessionalOffers,
  generateSummerWindowOffers,
  generateProfessionalClubPool,
  evaluateClubInterest,
} from './professionalClubs';
import { acceptProfessionalOffer } from './careerSeasons';
import { careerStateSchema } from '../schemas/domainSchemas';
import { getCurrentHeadCoach } from './careerPresentation';
import { getSeasonPlayerSummary } from './matchFeedback';
import { getSeasonProgress } from './seasonProgress';
import { settleLeagueRound, getLeagueTable } from './leagueSeason';
import { advanceCareerWeek } from './careerWeeks';
import { saveCareer } from './persistence';
import { advanceCareerFlow } from './careerFlow';
import { getPlayerOverall } from './playerOverall';
import { getClubStrength } from './clubStrength';
const career = () =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Testowy',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'attacking_midfielder',
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
  it('creates one deterministic real-club safety offer when an expiring contract has no interest', () => {
    const c = career();
    const [current, fallback] = generateProfessionalClubPool(c.seed);
    const poorPlayer = {
      ...c.player,
      age: 34,
      reputation: 0,
      attributes: Object.fromEntries(
        Object.keys(c.player.attributes).map((key) => [key, 20]),
      ) as unknown as unknown as typeof c.player.attributes,
    };
    const state: typeof c = {
      ...c,
      player: poorPlayer,
      currentClub: { ...c.currentClub, id: current!.id, name: current!.name },
      currentProfessionalClub: { ...current!, strengthRating: 95, overallStrength: 95 },
      currentContract: {
        clubId: current!.id,
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        monthlySalary: 2_000,
        signingBonus: 0,
        squadRole: 'development_player',
        contractType: 'professional',
      },
      clubWorld: [
        { ...current!, strengthRating: 95, overallStrength: 95 },
        { ...fallback!, strengthRating: 35, overallStrength: 35, coachYouthTrust: 0 },
      ],
      seasonParticipation: [],
    };
    const first = generateSummerWindowOffers(state);
    const second = generateSummerWindowOffers(state);
    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
    expect(first[0]!.club.id).toBe(fallback!.id);
    expect(state.clubWorld).toContainEqual(first[0]!.club);
  });

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
  it('allows scouting and potential to create stronger-club interest for a youngster', () => {
    const c = career();
    for (const key of Object.keys(c.player.attributes) as Array<keyof typeof c.player.attributes>)
      c.player.attributes[key] = 67;
    c.player.age = 18;
    c.developmentProfile!.familyCapacity.technical = 94;
    const playerOverall = getPlayerOverall(c.player, c.player.primaryPosition);
    expect(playerOverall).toBeCloseTo(67, 0);
    const club = {
      ...generateProfessionalClubPool('young-scouting').find(
        (candidate) => candidate.strengthRating! >= 72,
      )!,
      infrastructure: {
        coachingQuality: 85,
        trainingFacilities: 88,
        medicalQuality: 78,
        scoutingQuality: 95,
      },
    };
    expect(getClubStrength(club)).toBeGreaterThan(playerOverall);
    expect(evaluateClubInterest(c, club).interested).toBe(true);
  });
  it('gives an elite goalkeeper top-tier interest and an appropriate role', () => {
    const c = career();
    c.player.primaryPosition = 'goalkeeper';
    c.player.positionFamiliarity.goalkeeper = 1;
    c.player.age = 25;
    c.player.attributes = Object.fromEntries(
      Object.keys(c.player.attributes).map((key) => [key, 84]),
    ) as unknown as typeof c.player.attributes;
    c.player.attributes.composure = 84;
    c.player.attributes.gameReading = 84;
    const topTier = generateProfessionalClubPool(c.seed).filter((club) => club.leagueTier === 1);
    expect(topTier.some((club) => evaluateClubInterest(c, club).interested)).toBe(true);
    expect(getPlayerOverall(c.player, c.player.primaryPosition)).toBeCloseTo(84, 0);
    const weakerClub = { ...topTier[0]!, strengthRating: 68, overallStrength: 68 };
    expect(getClubStrength(weakerClub)).toBe(68);
    expect(
      generateProfessionalOffers({ ...c, clubWorld: [weakerClub] })[0]?.contract.squadRole,
    ).toMatch(/important_player|star_player/);
    const lowNeed = {
      ...weakerClub,
      positionalNeeds: {
        ...weakerClub.positionalNeeds,
        goalkeeper: { starterQuality: 80, depth: 'deep' as const, needLevel: 5 },
      },
    };
    const highNeed = {
      ...weakerClub,
      positionalNeeds: {
        ...weakerClub.positionalNeeds,
        goalkeeper: { starterQuality: 60, depth: 'thin' as const, needLevel: 95 },
      },
    };
    expect(
      evaluateClubInterest(c, highNeed).score - evaluateClubInterest(c, lowNeed).score,
    ).toBeGreaterThan(20);
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
    expect(new Set(next.leagueSeason?.clubs.map((club) => club.name)).size).toBe(16);
    expect(next.leagueSeason?.rounds).toHaveLength(30);
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
        currentDate: '2027-09-01',
        decisionPoint: { type: 'checkpoint', date: '2027-07-02', sourceId: 'test' },
      }).progress,
    ).toBeGreaterThan(getSeasonProgress(next).progress);
    expect(
      next.historyFacts.some(
        (fact) => fact.factType === 'first_professional_contract' && fact.season === 2027,
      ),
    ).toBe(true);
    expect(careerStateSchema.safeParse(next).success).toBe(true);
    const firstVariant = next.careerCalendar?.weeks[0]?.summaryVariantKey;
    expect(typeof firstVariant).toBe('string');
    const afterFirstWeek = advanceCareerWeek(next);
    const afterSecondWeek = advanceCareerWeek(afterFirstWeek);
    expect(afterSecondWeek.careerCalendar?.currentWeekIndex).toBe(2);
    expect(afterSecondWeek.recentVariantKeys?.every((key) => typeof key === 'string')).toBe(true);
    expect(careerStateSchema.safeParse(afterSecondWeek).success).toBe(true);
    expect(() => saveCareer(afterSecondWeek)).not.toThrow();
  });
});

describe('completed first-season archive', () => {
  it('freezes Vistula Nova and the U-17 competition before a transfer', () => {
    const base = career();
    const initialized = advanceCareerFlow(base);
    initialized.leagueSeason!.completed = true;
    initialized.seasonOutcome = { finalPosition: 6, champion: false, competitionType: 'academy' };
    initialized.professionalOffers = generateProfessionalOffers(initialized);
    const offer = initialized.professionalOffers[0];
    expect(offer).toBeDefined();
    const next = acceptProfessionalOffer(initialized, offer!.id);
    const archived = next.completedSeasons?.find((season) => season.label === '2026/2027');
    expect(archived?.clubName).toBe('Vistula Nova');
    expect(archived?.leagueName).toMatch(/U-17/);
    expect(next.currentClub.id).toBe(offer!.club.id);
  });
});
