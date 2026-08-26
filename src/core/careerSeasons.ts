import type { CareerState, Club, HistoryFact, ProfessionalOffer } from '../types/domain';
import {
  clampProfessionalLeagueTier,
  createLeagueSeason,
  getProfessionalCompetitionName,
  VISTULA_NOVA_ID,
} from './leagueSeason';
import { RandomGenerator } from './random/RandomGenerator';
import type { Person, RelationshipScores } from '../types/domain';
import type { PlayerAttributes, SquadRole, CareerStage } from '../types/domain';
import { getPlayerOverall } from './playerOverall';
import { initializeWeekContent } from './careerWeeks';

const milestone = (
  career: CareerState,
  type: string,
  date: string,
  clubId: string,
  data: Record<string, unknown>,
): HistoryFact => ({
  id: `fact_${type}_${date}`,
  factType: type,
  season: Number(date.slice(0, 4)),
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
  const professionalLevel =
    career.currentProfessionalClub?.leagueTier ?? career.currentProfessionalClub?.professionalLevel;
  const season = createLeagueSeason(`${career.seed}:season:${config.careerSeasonNumber}`, {
    startYear: config.startYear,
    controlledClubId: config.club.id,
    controlledClubName: config.club.name,
    professional: config.professional,
    ...(professionalLevel !== undefined ? { professionalLevel } : {}),
  });
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
  const fixtures = season.rounds.map((round) => {
    const leagueFixture = round.fixtures.find((item) =>
      [item.homeClubId, item.awayClubId].includes(config.club.id),
    )!;
    const opponentId =
      leagueFixture.homeClubId === config.club.id
        ? leagueFixture.awayClubId
        : leagueFixture.homeClubId;
    const opponent = season.clubs.find((item) => item.clubId === opponentId)!;
    return {
      id: leagueFixture.id,
      seasonId: season.id,
      date: round.date,
      competition: config.professional ? ('league' as const) : ('academy_league' as const),
      opponent: {
        id: opponent.clubId,
        name: opponent.name,
        strength: opponent.strength,
        style: 'zrównoważony',
        strengths: [],
        weaknesses: [],
      },
      venue: leagueFixture.homeClubId === config.club.id ? ('home' as const) : ('away' as const),
      importance: 45,
      matchImportance: 'routine' as const,
    };
  });
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
  const initialized: CareerState = {
    ...career,
    activeMatch: undefined,
    activeEvent: undefined,
    augustPlanning: undefined,
    september: undefined,
    fastForwardLog: undefined,
    currentSeason: config.startYear,
    careerSeasonNumber: config.careerSeasonNumber,
    currentClub: config.club,
    careerPhase: 'preseason',
    currentDate: `${config.startYear}-07-01`,
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
  return initializeWeekContent(initialized, 0);
};

export const getCareerStage = (
  career: Pick<CareerState, 'careerSeasonNumber' | 'player'>,
): CareerStage =>
  career.careerSeasonNumber === 1
    ? 'academy'
    : career.player.age <= 20
      ? 'prospect'
      : career.player.age <= 24
        ? 'developing'
        : career.player.age <= 29
          ? 'prime'
          : career.player.age <= 33
            ? 'experienced'
            : 'veteran';

const sensibleRole = (age: number, role: SquadRole): SquadRole =>
  age > 23 && role === 'development_player' ? 'rotation' : role;

const applyAnnualAging = (career: CareerState, date: string): CareerState => {
  const age = career.player.age + 1;
  const attrs = { ...career.player.attributes };
  const rng = RandomGenerator.fromSeed(`${career.seed}:aging:${age}`);
  const facts: HistoryFact[] = [];
  const base = age < 29 ? 0 : age <= 31 ? 0.25 : age <= 34 ? 0.52 : age <= 37 ? 0.78 : 0.95;
  const physical: Array<keyof PlayerAttributes> = ['pace', 'stamina'];
  const technical: Array<keyof PlayerAttributes> = [
    'technique',
    'vision',
    'finishing',
    'defending',
  ];
  const resilience =
    Math.min(0.25, (career.player.potential - 60) / 160) + (career.player.fitness - 70) / 300;
  for (const attribute of [...physical, ...technical]) {
    if (rng.float() >= base - resilience - (physical.includes(attribute) ? 0 : 0.35)) continue;
    const before = attrs[attribute];
    attrs[attribute] = Math.max(
      20,
      before - (age >= 38 && physical.includes(attribute) ? rng.int(1, 3) : 1),
    );
    facts.push(
      milestone(career, 'attribute_changed', date, career.currentClub.id, {
        attribute,
        before,
        after: attrs[attribute],
        source: 'aging',
      }),
    );
  }
  if (age >= 29 && age <= 34)
    for (const attribute of ['leadership', 'composure'] as const)
      if (rng.bool(0.28) && attrs[attribute] < 100) attrs[attribute]++;
  return {
    ...career,
    player: { ...career.player, age, attributes: attrs },
    historyFacts: [...career.historyFacts, ...facts],
  };
};

export const retireCareer = (career: CareerState, reason = 'decyzja zawodnika'): CareerState => ({
  ...career,
  careerStatus: 'retired',
  retirementDate: career.currentDate ?? `${career.currentSeason + 1}-06-30`,
  retirementAge: career.player.age,
  retirementReason: reason,
  careerPhase: 'offseason',
  professionalOffers: undefined,
  activeMatch: undefined,
  decisionPoint: undefined,
  historyFacts: career.historyFacts.some((f) => f.factType === 'retired')
    ? career.historyFacts
    : [
        ...career.historyFacts,
        milestone(
          career,
          'retired',
          career.currentDate ?? `${career.currentSeason + 1}-06-30`,
          career.currentClub.id,
          { age: career.player.age, reason },
        ),
      ],
});

/** Canonical boundary: transfers never age the player; this operation always does. */
export const advanceToNextCareerSeason = (career: CareerState): CareerState => {
  if ((career.careerStatus ?? 'active') === 'retired' || career.player.age >= 40)
    return retireCareer(career, 'limit wieku');
  const nextDate = `${career.currentSeason + 1}-07-01`;
  const movement =
    career.seasonOutcome?.competitionType === 'professional' ? career.seasonOutcome : undefined;
  const nextTier = clampProfessionalLeagueTier(
    movement?.nextLeagueTier ??
      career.currentProfessionalClub?.leagueTier ??
      career.currentProfessionalClub?.professionalLevel ??
      3,
  );
  const movementFactType =
    movement?.leagueOutcome === 'promoted'
      ? 'club_promoted'
      : movement?.leagueOutcome === 'relegated'
        ? 'club_relegated'
        : movement?.leagueOutcome === 'champion'
          ? 'top_tier_champion'
          : undefined;
  const withMovement =
    movementFactType &&
    !career.historyFacts.some(
      (fact) => fact.factType === movementFactType && fact.season === career.currentSeason,
    )
      ? {
          ...career,
          historyFacts: [
            ...career.historyFacts,
            milestone(
              career,
              movementFactType,
              `${career.currentSeason + 1}-06-30`,
              career.currentClub.id,
              {
                fromTier: movement?.previousLeagueTier,
                toTier: nextTier,
                competition: getProfessionalCompetitionName(nextTier),
              },
            ),
          ],
        }
      : career;
  let aged = applyAnnualAging(withMovement, nextDate);
  if (aged.currentProfessionalClub)
    aged = {
      ...aged,
      currentProfessionalClub: { ...aged.currentProfessionalClub, leagueTier: nextTier },
    };
  if (
    !aged.historyFacts.some(
      (f) => f.factType === 'season_completed' && f.season === career.currentSeason,
    )
  )
    aged = {
      ...aged,
      historyFacts: [
        ...aged.historyFacts,
        milestone(
          aged,
          'season_completed',
          `${career.currentSeason + 1}-06-30`,
          career.currentClub.id,
          {
            competition: career.leagueSeason?.competition.name,
            finalPosition: career.seasonOutcome?.finalPosition,
          },
        ),
      ],
    };
  aged = {
    ...aged,
    currentSportingStatus: sensibleRole(
      aged.player.age,
      aged.currentSportingStatus ?? aged.currentContract?.squadRole ?? 'rotation',
    ),
    playerAvailability: {
      injuries: aged.playerAvailability?.injuries.filter((i) => i.status === 'active') ?? [],
      // A dismissal in the final fixture may legitimately be served next season.
      suspensionMatchesRemaining: aged.playerAvailability?.suspensionMatchesRemaining ?? 0,
      leagueYellowCards: 0,
      matchesMissedThroughSuspension: 0,
      matchesMissedThroughInjury: 0,
    },
  };
  const initialized = initializeCareerSeason(aged, {
    startYear: career.currentSeason + 1,
    careerSeasonNumber: career.careerSeasonNumber + 1,
    club: aged.currentClub,
    professional: true,
  });
  const ovr = getPlayerOverall(initialized.player, initialized.player.primaryPosition);
  return {
    ...initialized,
    careerStatus: 'active',
    highestOVR: Math.max(career.highestOVR ?? ovr, ovr),
    highestOVRDate: ovr > (career.highestOVR ?? -1) ? nextDate : career.highestOVRDate,
  };
};

export const stayAtCurrentClub = (career: CareerState): CareerState =>
  advanceToNextCareerSeason(career);
const neutralRelationship = (): RelationshipScores => ({
  liking: 45,
  trust: 42,
  respect: 52,
  rivalry: 0,
  resentment: 0,
  gratitude: 0,
  professionalDependence: 45,
});
const createProfessionalCoach = (career: CareerState, club: Club, date: string): Person => {
  const rng = RandomGenerator.fromSeed(`${career.seed}:${club.id}:head-coach`);
  const firstNames = ['Piotr', 'Robert', 'Dariusz', 'Krzysztof'];
  const lastNames = ['Sikora', 'Maj', 'Kowalik', 'Brzoza'];
  return {
    id: `coach_${club.id}`,
    firstName: firstNames[rng.int(0, firstNames.length - 1)]!,
    lastName: lastNames[rng.int(0, lastNames.length - 1)]!,
    role: 'coach',
    nationality: 'Polska',
    age: rng.int(38, 57),
    personality: ['profesjonalny'],
    clubId: club.id,
    persistence: 'career',
    relationshipParameters: neutralRelationship(),
    faceSeed: `${club.id}:${date}:coach`,
    narrativeTags: ['head_coach', 'professional'],
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
  const coach = createProfessionalCoach(career, club, date);
  const changedClub = club.id !== career.currentClub.id;
  const types =
    career.careerSeasonNumber === 1
      ? ['academy_graduated', 'first_professional_contract', 'joined_professional_club']
      : offer.offerType === 'renewal' || !changedClub
        ? ['contract_renewed']
        : ['club_left', 'club_joined', 'transfer_completed'];
  const facts = types
    .filter(
      (type) =>
        !['academy_graduated', 'first_professional_contract'].includes(type) ||
        !career.historyFacts.some((f) => f.factType === type),
    )
    .map((type) =>
      milestone(career, type, date, club.id, {
        fromClubId: career.currentClub.id,
        toClubId: club.id,
        contract: offer.contract,
      }),
    );
  const transitioned = {
    ...career,
    currentContract: offer.contract,
    currentClub: club,
    currentProfessionalClub: offer.club,
    currentSportingStatus: sensibleRole(career.player.age, offer.contract.squadRole),
    previousClubIds: changedClub
      ? [...career.previousClubIds, career.currentClub.id]
      : career.previousClubIds,
    player: {
      ...career.player,
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
        sourceFactId: facts[0]!.id,
      },
    ],
    historyFacts: [...career.historyFacts, ...facts],
    significantPeople: [...career.significantPeople, coach],
    relationships: { ...career.relationships, [coach.id]: coach.relationshipParameters },
    // A transfer starts in the destination club's own tier. The previous club's
    // promotion/relegation belongs only to that club.
    seasonOutcome: changedClub ? undefined : career.seasonOutcome,
  };
  return advanceToNextCareerSeason(transitioned);
};
export const continueWithProfessionalTrial = (career: CareerState): CareerState => {
  if (career.careerSeasonNumber !== 1) return career;
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
      leagueTier: 4,
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
