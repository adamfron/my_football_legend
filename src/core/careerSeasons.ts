import type { CareerState, Club, HistoryFact, ProfessionalOffer } from '../types/domain';
import { createLeagueSeason, VISTULA_NOVA_ID } from './leagueSeason';
import { generateFixtureSchedule } from './careerWeeks';

const milestone = (
  career: CareerState,
  type: string,
  date: string,
  clubId: string,
  data: Record<string, unknown>,
): HistoryFact => ({
  id: `fact_${type}_${date}`,
  factType: type,
  season: career.currentSeason,
  date,
  actors: [career.player.id],
  targets: [],
  clubs: [clubId],
  competitions: [],
  data,
  causes: career.historyFacts.slice(-2).map((f) => f.id),
  tags: [type, 'career_transition'],
  visibility: 'public',
  narrativeImportance: 95,
  emotionalTone: 'positive',
});
export interface CareerSeasonConfig {
  startYear: number;
  careerSeasonNumber: number;
  club: Club;
  professional: boolean;
}
export const initializeCareerSeason = (
  career: CareerState,
  config: CareerSeasonConfig,
): CareerState => {
  const season = createLeagueSeason(`${career.seed}:season:${config.careerSeasonNumber}`);
  season.id = `${config.startYear}-${String(config.startYear + 1).slice(-2)}`;
  season.name = config.professional ? 'Liga zawodowa' : 'Liga akademii';
  season.startDate = `${config.startYear}-08-01`;
  season.endDate = `${config.startYear + 1}-05-31`;
  season.clubs = season.clubs.map((c) =>
    c.clubId === VISTULA_NOVA_ID ? { ...c, clubId: config.club.id, name: config.club.name } : c,
  );
  season.clubIds = season.clubs.map((c) => c.clubId);
  season.rounds = season.rounds.map((r) => ({
    ...r,
    date: r.date.replace(/^\d{4}/, String(config.startYear)),
    fixtures: r.fixtures.map((f) => ({
      ...f,
      date: f.date.replace(/^\d{4}/, String(config.startYear)),
      homeClubId: f.homeClubId === VISTULA_NOVA_ID ? config.club.id : f.homeClubId,
      awayClubId: f.awayClubId === VISTULA_NOVA_ID ? config.club.id : f.awayClubId,
    })),
  }));
  const fixtures = generateFixtureSchedule(
    `${career.seed}:season:${config.careerSeasonNumber}`,
    season.id,
  ).map((f) => ({
    ...f,
    date: f.date.replace(/^\d{4}/, String(config.startYear)),
    competition: config.professional ? ('league' as const) : ('academy_league' as const),
  }));
  const weeks = fixtures.map((fixture, index) => ({
    id: `week_${season.id}_${index}`,
    seasonId: season.id,
    weekIndex: index,
    startDate: fixture.date,
    endDate: fixture.date,
    phase: (index < 2 ? 'preseason' : 'regular_season') as 'preseason' | 'regular_season',
    fixtureIds: [fixture.id],
    scheduledEventIds: [],
    completedEventIds: [],
    completed: false,
  }));
  return {
    ...career,
    currentSeason: config.startYear,
    careerSeasonNumber: config.careerSeasonNumber,
    currentClub: config.club,
    careerPhase: 'preseason',
    leagueSeason: season,
    careerCalendar: {
      seasonId: season.id,
      currentWeekIndex: 0,
      weeks,
      fixtures,
      monthlyCheckpoints: [],
      availableThrough: `${config.startYear}-07-01`,
    },
    seasonOutcome: undefined,
    professionalOffers: undefined,
    decisionPoint: {
      type: 'development_event',
      date: `${config.startYear}-07-07`,
      sourceId: 'first_professional_preseason',
    },
    seasonStartingAttributes: { ...career.player.attributes },
  };
};
const asClub = (offer: ProfessionalOffer): Club => ({
  id: offer.club.id,
  name: offer.club.name,
  country: offer.club.country,
  region: offer.club.region,
  dna: [offer.club.archetype.toLowerCase(), 'professional'],
  currentSituation: 'Pierwszy sezon zawodnika w profesjonalnej piłce.',
  playStyle: offer.club.playingStyle,
  youthApproach: 'Rozwój młodych zależy od polityki klubu i zaufania trenera.',
  prestige: offer.club.reputation,
  seasonHistory: [],
  notablePlayers: [],
  notableCoaches: [],
  legends: [],
  rivals: [],
});
export const acceptProfessionalOffer = (career: CareerState, offerId: string): CareerState => {
  const offer = career.professionalOffers?.find((o) => o.id === offerId);
  if (!offer) return career;
  const date = offer.contract.startDate;
  const club = asClub(offer);
  const facts = [
    'academy_graduated',
    'first_professional_contract',
    'joined_professional_club',
  ].map((type) =>
    milestone(career, type, date, club.id, {
      fromClubId: career.currentClub.id,
      toClubId: club.id,
      contract: offer.contract,
    }),
  );
  const transitioned = {
    ...career,
    currentContract: offer.contract,
    previousClubIds: [...career.previousClubIds, career.currentClub.id],
    player: {
      ...career.player,
      age: career.player.age + 1,
      morale: Math.min(100, career.player.morale + 8),
      reputation: Math.min(100, career.player.reputation + 10),
    },
    finances: [
      ...(career.finances ?? []),
      {
        id: `signing_${offer.id}`,
        date,
        amount: offer.contract.signingBonus,
        category: 'signing_bonus' as const,
        sourceFactId: facts[1]!.id,
      },
    ],
    historyFacts: [...career.historyFacts, ...facts],
  };
  return initializeCareerSeason(transitioned, {
    startYear: career.currentSeason + 1,
    careerSeasonNumber: career.careerSeasonNumber + 1,
    club,
    professional: true,
  });
};
export const continueWithProfessionalTrial = (career: CareerState): CareerState => {
  const club: Club = {
    id: 'pro_trial_dolina',
    name: 'Hutnik Dolina',
    country: 'Polska',
    region: 'Małopolska',
    dna: ['underdog', 'youth'],
    currentSituation: 'Niewielki klub oferuje młodemu zawodnikowi kontrakt rozwojowy po testach.',
    playStyle: 'bezpośredni',
    youthApproach: 'Szanse wynikają z ograniczonej kadry.',
    prestige: 30,
    seasonHistory: [],
    notablePlayers: [],
    notableCoaches: [],
    legends: [],
    rivals: [],
  };
  const offer: ProfessionalOffer = {
    id: 'fallback_trial',
    club: {
      id: club.id,
      name: club.name,
      country: club.country,
      region: club.region,
      professionalLevel: 4,
      reputation: 30,
      overallStrength: 42,
      financialLevel: 25,
      playingStyle: club.playStyle,
      youthPolicy: 75,
      developmentReputation: 55,
      sellingClubTendency: 60,
      pressureLevel: 35,
      coachYouthTrust: 80,
      archetype: 'UNDERDOG',
      positionalNeeds: {
        goalkeeper: { starterQuality: 45, depth: 'normal', needLevel: 50 },
        defense: { starterQuality: 45, depth: 'thin', needLevel: 80 },
        midfield: { starterQuality: 44, depth: 'thin', needLevel: 80 },
        attack: { starterQuality: 46, depth: 'thin', needLevel: 75 },
      },
    },
    contract: {
      clubId: club.id,
      startDate: `${career.currentSeason + 1}-07-01`,
      endDate: `${career.currentSeason + 2}-06-30`,
      monthlySalary: 1800,
      signingBonus: 500,
      squadRole: 'development_player',
      contractType: 'development',
    },
    interestReasons: ['Udane testy i mała głębia kadry otworzyły ścieżkę rozwojową.'],
    opportunity: 'Profesjonalny trening i droga z ławki.',
    risk: 'Niski budżet ogranicza zaplecze.',
    competitionAssessment: 'Ograniczona konkurencja (ocena sztabu)',
  };
  return acceptProfessionalOffer({ ...career, professionalOffers: [offer] }, offer.id);
};
