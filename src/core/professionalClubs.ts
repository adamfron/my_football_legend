import type {
  CareerState,
  ClubArchetype,
  ProfessionalClub,
  ProfessionalOffer,
} from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';
import { getEffectivePositionOverall, getPlayerOverall } from './playerOverall';
import { getPlayerForm } from './careerWeeks';
import { clampProfessionalLeagueTier } from './leagueSeason';
import {
  getBootstrapClubStrength,
  getCareerClubStrength,
  getExpectedSquadRole,
} from './clubStrength';
import { createProfessionalContract, evaluateTransferFee } from './playerEconomy';
import { generateClubVisualIdentity } from './clubVisualIdentity';
import {
  deriveSquadHierarchy,
  FORMATIONS,
  getContextualSquadRole,
  getManagerPreferredFormation,
  getPositionalCompetition,
  getSportingStatus,
} from './footballerWorld';
import { resolveEffectiveProfessionalClub } from './worldDatabase';

export const getClubLeagueTier = (club: ProfessionalClub) =>
  clampProfessionalLeagueTier(club.leagueTier);

const names = [
  'KS Nadwiśle',
  'Górnik Brzeziny',
  'Polonia Bursztyn',
  'Orzeł Północy',
  'Stal Grodzisko',
  'LKS Zielone Wzgórza',
  'Sporting Rawa',
  'Kolejarz Mazovia',
  'Unia Sandomierz',
  'Błękitni Port',
  'Warta Kresowa',
  'Victoria Żary',
  'MKS Podhale',
  'Pogoń Jasna',
  'Hutnik Dolina',
  'Akademik Toruń',
  'Korona Puszczy',
  'Zryw Opole',
  'Lechia Srebrna',
  'Motor Roztocze',
  'Bałtyk Hel',
  'Sokół Kujawy',
  'Gwardia Narew',
  'Sparta Beskidy',
  'Odra Kamienna',
  'Wisłoka Dębica',
  'Piast Łęczyca',
  'Czarni Pojezierze',
  'Naprzód Bory',
  'Olimpia Noteć',
  'Włókniarz Łódzki',
  'Granica Chełm',
  'Mazur Ełk',
  'Concordia Lubusz',
  'Ruch Solny',
  'Gryf Kaszuby',
  'Start Zamość',
  'Płomień Sudety',
  'Lublinianka Wschód',
  'Metal Tarnów',
  'Orkan Łowicz',
  'Powiśle Puławy',
  'Jedność Kalisz',
  'Świt Bieszczady',
  'Nadzieja Radom',
  'Karkonosze Jelenia',
  'Wicher Suwałki',
  'Prosną Ostrów',
  'Resovia Północ',
  'Górnik Wałbrzych',
  'Stomil Jeziorak',
  'Chemik Police',
  'Siarka Sandomierz',
  'Sandecja Dunajec',
  'Beskid Andrychów',
  'Cuiavia Inowrocław',
  'Pelikan Łowicz',
  'Radunia Kaszuby',
  'Stal Kraśnik',
  'Victoria Sulejówek',
  'Polonia Przemyśl',
  'Gwarek Tarnowskie Góry',
  'Ślęza Wrocław',
  'ŁKS Łomża',
];
const archetypes: ClubArchetype[] = [
  'YOUTH_TRADER',
  'RESULTS_FIRST',
  'LOCAL_DEVELOPMENT',
  'TECHNICAL_ACADEMY',
  'UNDERDOG',
  'AMBITIOUS_CLIMBER',
];
const group = (position: string): keyof ProfessionalClub['positionalNeeds'] =>
  position.includes('goal')
    ? 'goalkeeper'
    : position.includes('back')
      ? 'defense'
      : position.includes('mid') || position === 'left_winger'
        ? 'midfield'
        : 'attack';
export const generateProfessionalClubPool = (seed: string): ProfessionalClub[] =>
  names.map((name, index) => {
    const rng = RandomGenerator.fromSeed(`${seed}:professional-club:${index}`);
    const leagueTier = (Math.floor(index / 16) + 1) as 1 | 2 | 3 | 4;
    const strength = 82 - leagueTier * 9 + rng.int(-5, 5);
    const needs = () => ({
      starterQuality: Math.max(35, strength + rng.int(-7, 6)),
      depth: rng.pick(['thin', 'normal', 'deep'] as const),
      needLevel: rng.int(20, 90),
    });
    return {
      id: `pro_${index}`,
      name,
      country: 'Polska',
      region: rng.pick(['Mazowsze', 'Małopolska', 'Śląsk', 'Pomorze', 'Wielkopolska']),
      visualIdentity: generateClubVisualIdentity(seed, `pro_${index}`),
      leagueTier,
      shortName: name.slice(0, 18),
      managerId: `coach_pro_${index}`,
      philosophyTags: [archetypes[index % archetypes.length]!.toLowerCase()],
      reputation: Math.min(85, strength + rng.int(-5, 8)),
      strengthRating: strength,
      financialLevel: rng.int(28, 82),
      playingStyle: rng.pick([
        'techniczny',
        'bezpośredni',
        'intensywny pressing',
        'cierpliwe posiadanie',
      ]),
      youthPolicy: rng.int(25, 90),
      developmentReputation: rng.int(25, 90),
      sellingClubTendency: rng.int(20, 90),
      pressureLevel: rng.int(25, 90),
      coachYouthTrust: rng.int(20, 95),
      infrastructure: {
        coachingQuality: Math.max(20, Math.min(95, strength + rng.int(-12, 14))),
        trainingFacilities: Math.max(20, Math.min(95, strength + rng.int(-15, 15))),
        medicalQuality: Math.max(20, Math.min(95, strength + rng.int(-18, 18))),
        scoutingQuality: Math.max(20, Math.min(95, strength + rng.int(-15, 18))),
      },
      archetype: archetypes[index % archetypes.length]!,
      positionalNeeds: {
        goalkeeper: needs(),
        defense: needs(),
        midfield: needs(),
        attack: needs(),
      },
    };
  });
const overall = (career: CareerState) =>
  getPlayerOverall(career.player, career.player.primaryPosition);
export { getExpectedSquadRole } from './clubStrength';
export const getClubInfrastructure = (club: ProfessionalClub) =>
  club.infrastructure ?? {
    coachingQuality: getBootstrapClubStrength(club),
    trainingFacilities: getBootstrapClubStrength(club),
    medicalQuality: getBootstrapClubStrength(club),
    scoutingQuality: getBootstrapClubStrength(club),
  };
export const getClubDevelopmentEnvironment = (club: ProfessionalClub) =>
  Math.round(
    (getClubInfrastructure(club).coachingQuality + getClubInfrastructure(club).trainingFacilities) /
      2,
  );
export const getClubMedicalQuality = (club: ProfessionalClub) =>
  getClubInfrastructure(club).medicalQuality;
const currentSeasonAppearances = (career: CareerState) =>
  career.seasonParticipation?.length
    ? career.seasonParticipation.filter((match) => match.minutes > 0)
    : (career.matchHistory ?? []).filter(
        (match) => Number(match.date.slice(0, 4)) >= career.currentSeason,
      );
export const evaluateClubInterest = (career: CareerState, club: ProfessionalClub) => {
  const need = club.positionalNeeds[group(career.player.primaryPosition)];
  const stats = currentSeasonAppearances(career).reduce((s, m) => {
    const goalkeeperStats = 'goalkeeperStats' in m ? m.goalkeeperStats : undefined;
    return (
      s +
      m.minutes / 500 +
      (m.rating ?? goalkeeperStats?.rating ?? 6) -
      6 +
      (career.player.primaryPosition === 'goalkeeper'
        ? (goalkeeperStats ? goalkeeperStats.xGA - goalkeeperStats.goalsConceded : 0) * 0.8
        : m.goals * 0.7 + m.assists * 0.5)
    );
  }, 0);
  const scout =
    RandomGenerator.fromSeed(`${career.seed}:scout:${career.careerSeasonNumber}:${club.id}`).int(
      -9,
      9,
    ) +
    (getClubInfrastructure(club).scoutingQuality - 50) * 0.08;
  const potentialEstimate =
    Math.max(...Object.values(career.developmentProfile?.familyCapacity ?? { technical: 70 })) +
    scout;
  const style =
    club.playingStyle === 'techniczny' || club.playingStyle === 'cierpliwe posiadanie'
      ? (career.player.attributes.technique + career.player.attributes.passing - 90) / 8
      : 0;
  const score =
    overall(career) * 0.65 +
    potentialEstimate * 0.18 +
    need.needLevel * 0.2 +
    club.coachYouthTrust * 0.13 +
    getClubInfrastructure(club).scoutingQuality * 0.06 +
    club.youthPolicy * 0.08 +
    stats +
    getPlayerForm(career).value * 1.5 +
    career.player.reputation * 0.08 -
    Math.max(0, career.player.age - 29) * 1.1 -
    club.reputation * 0.55 -
    Math.max(0, 3 - getClubLeagueTier(club)) *
      Math.max(0, club.reputation - overall(career)) *
      0.28 -
    (need.depth === 'deep' ? 10 : need.depth === 'thin' ? -5 : 0) +
    style;
  const eliteDomesticCandidate = overall(career) >= 80 && getClubLeagueTier(club) === 1;
  return { score, interested: eliteDomesticCandidate || score >= 37, need, potentialEstimate };
};

const offerOverallCache = new WeakMap<object, Map<string, number>>();
const offerPositionOverall = (
  player: CareerState['player'],
  position: CareerState['player']['primaryPosition'],
) => {
  let cache = offerOverallCache.get(player);
  if (!cache) {
    cache = new Map();
    offerOverallCache.set(player, cache);
  }
  const cached = cache.get(position);
  if (cached !== undefined) return cached;
  const value = getEffectivePositionOverall(player, position);
  cache.set(position, value);
  return value;
};

export const deriveOfferPositionIntent = (
  career: CareerState,
  club: ProfessionalClub,
): Pick<ProfessionalOffer, 'plannedPosition' | 'alternativePositions'> => {
  const formation = FORMATIONS[getManagerPreferredFormation(club.managerId)];
  const effectiveOverall = (position: CareerState['player']['primaryPosition']) =>
    offerPositionOverall(career.player, position);
  const plausible = [...new Set(formation)].filter((position) => {
    const sameBoundary =
      (position === 'goalkeeper') === (career.player.primaryPosition === 'goalkeeper');
    return sameBoundary && career.player.positionFamiliarity[position] >= 0.3;
  });
  const candidates = plausible.map((position) => {
    const need = club.positionalNeeds[group(position)];
    // Canonical club depth/need already summarizes the destination's real positional competition.
    const leadingRival = need.starterQuality;
    return {
      position,
      score:
        effectiveOverall(position) +
        need.needLevel * 0.12 +
        (need.depth === 'thin' ? 5 : need.depth === 'deep' ? -5 : 0) +
        Math.max(-8, effectiveOverall(position) - leadingRival) * 0.35,
    };
  });
  // Old creator/save data can contain no plausible formation secondary; nominal identity is safe.
  if (!candidates.length) return { plannedPosition: career.player.primaryPosition };
  candidates.sort((a, b) => b.score - a.score || a.position.localeCompare(b.position));
  const [planned, ...rest] = candidates;
  const alternatives = rest.filter((item) => item.score >= planned!.score - 6).slice(0, 2);
  return {
    plannedPosition: planned!.position,
    ...(alternatives.length
      ? { alternativePositions: alternatives.map((item) => item.position) }
      : {}),
  };
};
const createProfessionalOffer = (
  career: CareerState,
  club: ProfessionalClub,
  safetyNet = false,
): ProfessionalOffer => {
  const interest = evaluateClubInterest(career, club);
  const rng = RandomGenerator.fromSeed(
    `${career.seed}:offer:${career.careerSeasonNumber}:${club.id}`,
  );
  const years = rng.int(1, 3);
  const startDate = `${career.currentSeason + 1}-07-01`;
  const free =
    !career.currentContract ||
    career.currentContract.endDate <= `${career.currentSeason + 1}-07-01`;
  const positionIntent = deriveOfferPositionIntent(career, club);
  const effectiveClub = resolveEffectiveProfessionalClub(career, club.id) ?? club;
  const projectedClub = {
    ...effectiveClub,
    squadPlayerIds: [...new Set([...(effectiveClub.squadPlayerIds ?? []), career.player.id])],
  };
  const projectedHierarchy = deriveSquadHierarchy(career, projectedClub);
  const projectedStanding = getSportingStatus(projectedHierarchy, career.player.id);
  const destinationCompetition = getPositionalCompetition(
    career,
    projectedClub,
    positionIntent.plannedPosition,
    projectedHierarchy,
  )
    .filter(({ player }) => player.id !== career.player.id)
    .slice(0, 4)
    .map(({ player, effectiveOverall, status }) => ({
      competitorId: player.id,
      competitorName: `${player.firstName} ${player.lastName}`,
      effectiveOverall,
      expectedStatus: status,
    }));
  const playerOverall = getEffectivePositionOverall(career.player, positionIntent.plannedPosition);
  const bestCompetitor = Math.max(
    0,
    ...destinationCompetition.map(({ effectiveOverall }) => effectiveOverall),
  );
  const role =
    (effectiveClub.squadPlayerIds?.length ?? 0) < 11
      ? getExpectedSquadRole(career, club)
      : getContextualSquadRole(
          projectedStanding,
          career.player.age,
          playerOverall - bestCompetitor,
        );
  return {
    id: `offer_${club.id}_${career.currentSeason}`,
    offerType: 'external',
    club,
    contract: createProfessionalContract({
      player: career.player,
      club,
      role,
      date: startDate,
      reputation: career.player.reputation,
      startDate,
      endDate: `${career.currentSeason + 1 + years}-06-30`,
      offerFactor: 0.9 + rng.float() * 0.2,
      signingBonusMonths: rng.int(1, 3),
    }),
    ...positionIntent,
    destinationCompetition,
    projectedStanding,
    interestReasons: [
      ...(safetyNet
        ? ['Klub daje ci szansę na odbudowanie kariery w profesjonalnym futbolu.']
        : []),
      ...(!safetyNet
        ? [
            club.coachYouthTrust > 65
              ? 'Trener chętnie daje szanse młodym zawodnikom.'
              : 'Sztab widzi dopasowanie do sposobu gry.',
            interest.need.needLevel > 60
              ? 'Klub ma wyraźną potrzebę na planowanej dla ciebie pozycji.'
              : interest.potentialEstimate > overall(career) + 8
                ? 'Skauci wysoko oceniają twój potencjał jak na ten wiek.'
                : 'Skauci dobrze ocenili twoją ostatnią formę.',
          ]
        : []),
    ],
    opportunity:
      interest.need.depth === 'thin'
        ? 'Realna droga do minut w pierwszym zespole.'
        : 'Możliwość rozwoju w profesjonalnym środowisku.',
    risk:
      club.pressureLevel > 65
        ? 'Presja na wynik może ograniczać cierpliwość.'
        : 'Minuty trzeba będzie wywalczyć.',
    competitionAssessment: destinationCompetition.length
      ? `${destinationCompetition.length} realnych rywali; prognoza: ${projectedStanding === 'starting_xi' ? 'pierwszy skład' : projectedStanding === 'bench' ? 'ławka' : 'rezerwy'}`
      : 'Brak bezpośredniego rywala na planowanej pozycji',
    transferKind: free ? 'free' : 'fee',
    ...(free
      ? {}
      : {
          estimatedTransferFee: evaluateTransferFee({
            player: career.player,
            club: career.currentProfessionalClub ?? club,
            contract: career.currentContract,
            date: startDate,
            reputation: career.player.reputation,
            developmentProfile: career.developmentProfile,
          }),
        }),
  };
};

export const generateProfessionalOffers = (career: CareerState): ProfessionalOffer[] => {
  const candidates = (career.clubWorld ?? generateProfessionalClubPool(career.seed))
    .flatMap((club): ProfessionalOffer[] => {
      if (!evaluateClubInterest(career, club).interested) return [];
      return [createProfessionalOffer(career, club)];
    })
    .sort((a, b) => {
      const preferenceScore = (offer: ProfessionalOffer) =>
        (career.agentPreferences ?? []).reduce((score, preference) => {
          if (preference === 'sporting_level')
            return score + offer.club.reputation + (5 - getClubLeagueTier(offer.club)) * 5;
          if (preference === 'important_role')
            return (
              score +
              [
                'development_player',
                'rotation',
                'first_team_competition',
                'important_player',
                'star_player',
              ].indexOf(offer.contract.squadRole) *
                10
            );
          if (preference === 'development')
            return score + getClubDevelopmentEnvironment(offer.club);
          if (preference === 'salary') return score + offer.contract.monthlySalary / 200;
          return (
            score +
            (getClubInfrastructure(offer.club).trainingFacilities +
              getClubInfrastructure(offer.club).medicalQuality) /
              2
          );
        }, 0);
      const ai =
        evaluateClubInterest(career, a.club).score +
        Math.max(0, overall(career) - a.club.reputation) * 0.35;
      const bi =
        evaluateClubInterest(career, b.club).score +
        Math.max(0, overall(career) - b.club.reputation) * 0.35;
      return preferenceScore(b) - preferenceScore(a) || bi - ai || a.id.localeCompare(b.id);
    });
  const playerOverall = overall(career);
  const bands = [
    (gap: number) => gap <= -8,
    (gap: number) => gap > -8 && gap <= 3,
    (gap: number) => gap > 3 && gap <= 12,
    (gap: number) => gap > 12,
  ];
  const selected: ProfessionalOffer[] = [];
  for (const band of bands) {
    const offer = candidates.find(
      (item) => !selected.includes(item) && band(item.club.reputation - playerOverall),
    );
    if (offer) selected.push(offer);
  }
  for (const offer of candidates) {
    if (selected.length >= (career.player.age >= 33 ? 3 : 4)) break;
    if (!selected.includes(offer)) selected.push(offer);
  }
  return selected;
};

export const generateSummerWindowOffers = (career: CareerState): ProfessionalOffer[] => {
  const external = generateProfessionalOffers(career).filter(
    (o) => o.club.id !== career.currentClub.id,
  );
  if (!career.currentProfessionalClub || !career.currentContract) return external.slice(0, 4);
  const appearances = currentSeasonAppearances(career);
  const minutes = appearances.reduce((sum, item) => sum + item.minutes, 0);
  const contractExpires = career.currentContract.endDate <= `${career.currentSeason + 1}-06-30`;
  if (
    minutes < 180 &&
    overall(career) < getCareerClubStrength(career, career.currentProfessionalClub) - 8
  ) {
    if (external.length || career.currentContract.endDate > `${career.currentSeason + 1}-06-30`)
      return external.slice(0, 4);
    return createSafetyNetOffers(career);
  }
  const role = getExpectedSquadRole(career, career.currentProfessionalClub);
  const renewal: ProfessionalOffer = {
    id: `renewal_${career.currentClub.id}_${career.currentSeason}`,
    offerType: 'renewal',
    club: {
      ...career.currentProfessionalClub,
      leagueTier: clampProfessionalLeagueTier(
        career.seasonOutcome?.nextLeagueTier ?? getClubLeagueTier(career.currentProfessionalClub),
      ),
    },
    contract: createProfessionalContract({
      player: career.player,
      club: {
        ...career.currentProfessionalClub,
        leagueTier: clampProfessionalLeagueTier(
          career.seasonOutcome?.nextLeagueTier ?? getClubLeagueTier(career.currentProfessionalClub),
        ),
      },
      role,
      date: `${career.currentSeason + 1}-07-01`,
      reputation: career.player.reputation,
      startDate: `${career.currentSeason + 1}-07-01`,
      endDate: contractExpires
        ? `${career.currentSeason + 3}-06-30`
        : career.currentContract.endDate,
      offerFactor:
        0.96 +
        RandomGenerator.fromSeed(`${career.seed}:renewal:${career.currentSeason}`).float() * 0.08,
      signingBonusMonths: contractExpires ? 1 : 0,
    }),
    ...deriveOfferPositionIntent(career, career.currentProfessionalClub),
    interestReasons: [
      contractExpires
        ? 'Klub proponuje przedłużenie po ocenie twoich występów.'
        : 'Obecny kontrakt pozwala ci kontynuować pracę w klubie.',
    ],
    opportunity: 'Kontynuacja pracy w znanym środowisku.',
    risk: 'Pozycję w składzie nadal trzeba potwierdzać formą.',
    competitionAssessment: 'Znana konkurencja w obecnym zespole',
  };
  return [renewal, ...external].slice(0, 4);
};

const createSafetyNetOffers = (career: CareerState): ProfessionalOffer[] => {
  const clubs = (career.clubWorld ?? generateProfessionalClubPool(career.seed)).filter(
    (club) => club.id !== career.currentClub.id,
  );
  if (!clubs.length) return [];
  const playerLevel = overall(career);
  const club = [...clubs].sort(
    (a, b) =>
      Math.abs(a.reputation - playerLevel) - Math.abs(b.reputation - playerLevel) ||
      a.reputation - b.reputation ||
      a.id.localeCompare(b.id),
  )[0]!;
  return [createProfessionalOffer(career, club, true)];
};
