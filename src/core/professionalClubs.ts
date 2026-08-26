import type {
  CareerState,
  ClubArchetype,
  ProfessionalClub,
  ProfessionalOffer,
  SquadRole,
} from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';
import { getPlayerOverall } from './playerOverall';
import { getPlayerForm } from './careerWeeks';
import { clampProfessionalLeagueTier } from './leagueSeason';

export const getClubLeagueTier = (club: ProfessionalClub) =>
  clampProfessionalLeagueTier(club.leagueTier ?? club.professionalLevel ?? 3);

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
  'Korona Puszczy', 'Zryw Opole', 'Lechia Srebrna', 'Motor Roztocze',
  'Bałtyk Hel', 'Sokół Kujawy', 'Gwardia Narew', 'Sparta Beskidy',
  'Odra Kamienna', 'Wisłoka Dębica', 'Piast Łęczyca', 'Czarni Pojezierze',
  'Naprzód Bory', 'Olimpia Noteć', 'Włókniarz Łódzki', 'Granica Chełm',
  'Mazur Ełk', 'Concordia Lubusz', 'Ruch Solny', 'Gryf Kaszuby',
  'Start Zamość', 'Płomień Sudety', 'Lublinianka Wschód', 'Metal Tarnów',
  'Orkan Łowicz', 'Powiśle Puławy', 'Jedność Kalisz', 'Świt Bieszczady',
  'Nadzieja Radom', 'Karkonosze Jelenia', 'Wicher Suwałki', 'Prosną Ostrów',
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
      : position.includes('mid') || position === 'winger'
        ? 'midfield'
        : 'attack';
export const generateProfessionalClubPool = (seed: string): ProfessionalClub[] =>
  names.map((name, index) => {
    const rng = RandomGenerator.fromSeed(`${seed}:professional-club:${index}`);
    const leagueTier = (Math.floor(index / 12) + 1) as 1 | 2 | 3 | 4;
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
      leagueTier,
      shortName: name.slice(0, 18),
      managerId: `coach_pro_${index}`,
      philosophyTags: [archetypes[index % archetypes.length]!.toLowerCase()],
      reputation: Math.min(85, strength + rng.int(-5, 8)),
      overallStrength: strength,
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
const currentSeasonAppearances = (career: CareerState) =>
  (career.matchHistory ?? []).filter(
    (match) => Number(match.date.slice(0, 4)) >= career.currentSeason,
  );
export const evaluateClubInterest = (career: CareerState, club: ProfessionalClub) => {
  const need = club.positionalNeeds[group(career.player.primaryPosition)];
  const stats = currentSeasonAppearances(career).reduce(
    (s, m) => s + m.minutes / 500 + (m.rating ?? 6) - 6 + m.goals * 0.7 + m.assists * 0.5,
    0,
  );
  const scout = RandomGenerator.fromSeed(
    `${career.seed}:scout:${career.careerSeasonNumber}:${club.id}`,
  ).int(-9, 9);
  const potentialEstimate = career.player.potential + scout;
  const style =
    club.playingStyle === 'techniczny' || club.playingStyle === 'cierpliwe posiadanie'
      ? (career.player.attributes.technique + career.player.attributes.vision - 90) / 8
      : 0;
  const score =
    overall(career) * 0.65 +
    potentialEstimate * 0.18 +
    need.needLevel * 0.2 +
    club.coachYouthTrust * 0.13 +
    club.youthPolicy * 0.08 +
    stats +
    getPlayerForm(career).value * 1.5 +
    career.player.reputation * 0.08 -
    Math.max(0, career.player.age - 29) * 1.1 -
    club.overallStrength * 0.55 -
    Math.max(0, 3 - getClubLeagueTier(club)) *
      Math.max(0, club.overallStrength - overall(career)) *
      0.28 -
    (need.depth === 'deep' ? 10 : need.depth === 'thin' ? -5 : 0) +
    style;
  return { score, interested: score >= 37, need, potentialEstimate };
};
export const generateProfessionalOffers = (career: CareerState): ProfessionalOffer[] =>
  (career.clubWorld ?? generateProfessionalClubPool(career.seed))
    .flatMap((club): ProfessionalOffer[] => {
      const interest = evaluateClubInterest(career, club);
      if (!interest.interested) return [];
      const rng = RandomGenerator.fromSeed(
        `${career.seed}:offer:${career.careerSeasonNumber}:${club.id}`,
      );
      const gap = overall(career) - interest.need.starterQuality;
      const role: SquadRole =
        gap > 7
          ? 'important_player'
          : gap > 0
            ? 'first_team_competition'
            : interest.need.depth === 'thin'
              ? 'rotation'
              : career.player.age <= 22
                ? 'development_player'
                : 'rotation';
      const years = rng.int(1, 3);
      const roleFactor = {
        development_player: 0.75,
        rotation: 1,
        first_team_competition: 1.18,
        important_player: 1.4,
      }[role];
      const salary =
        Math.round(
          ((1200 +
            club.financialLevel * 28 +
            (5 - getClubLeagueTier(club)) * 180 +
            career.player.reputation * 16) *
            roleFactor) /
            100,
        ) * 100;
      return [
        {
          id: `offer_${club.id}_${career.currentSeason}`,
          offerType: 'external',
          club,
          contract: {
            clubId: club.id,
            startDate: `${career.currentSeason + 1}-07-01`,
            endDate: `${career.currentSeason + 1 + years}-06-30`,
            monthlySalary: salary,
            signingBonus: Math.round((salary * rng.int(1, 3)) / 100) * 100,
            squadRole: role,
            contractType: role === 'development_player' ? 'development' : 'professional',
          },
          interestReasons: [
            club.coachYouthTrust > 65
              ? 'Trener chętnie daje szanse młodym zawodnikom.'
              : 'Sztab widzi dopasowanie do sposobu gry.',
            interest.need.needLevel > 60
              ? 'Klub ma wyraźną potrzebę na twojej pozycji.'
              : 'Skauci docenili twój sezon w akademii.',
          ],
          opportunity:
            interest.need.depth === 'thin'
              ? 'Realna droga do minut w pierwszym zespole.'
              : 'Możliwość rozwoju w profesjonalnym środowisku.',
          risk:
            club.pressureLevel > 65
              ? 'Presja na wynik może ograniczać cierpliwość.'
              : 'Minuty trzeba będzie wywalczyć.',
          competitionAssessment:
            interest.need.depth === 'deep'
              ? 'Duża konkurencja (ocena sztabu)'
              : 'Konkurencja do pokonania (ocena sztabu)',
        },
      ];
    })
    .sort((a, b) => {
      const currentTier = career.currentProfessionalClub ? getClubLeagueTier(career.currentProfessionalClub) : 3;
      const ai = evaluateClubInterest(career, a.club).score - Math.max(0, Math.abs(getClubLeagueTier(a.club) - currentTier) - 1) * 18;
      const bi = evaluateClubInterest(career, b.club).score - Math.max(0, Math.abs(getClubLeagueTier(b.club) - currentTier) - 1) * 18;
      return bi - ai || a.id.localeCompare(b.id);
    })
    .slice(0, career.player.age >= 33 ? 3 : 4);

export const generateSummerWindowOffers = (career: CareerState): ProfessionalOffer[] => {
  const external = generateProfessionalOffers(career).filter(
    (o) => o.club.id !== career.currentClub.id,
  );
  if (!career.currentProfessionalClub || !career.currentContract) return external.slice(0, 4);
  const appearances = currentSeasonAppearances(career);
  const minutes = appearances.reduce((sum, item) => sum + item.minutes, 0);
  const contractExpires = career.currentContract.endDate <= `${career.currentSeason + 1}-06-30`;
  if (minutes < 180 && overall(career) < career.currentProfessionalClub.overallStrength - 8)
    return external.slice(0, 4);
  const role: SquadRole =
    career.player.age <= 22 && overall(career) < career.currentProfessionalClub.overallStrength
      ? 'development_player'
      : overall(career) >= career.currentProfessionalClub.overallStrength
        ? 'first_team_competition'
        : 'rotation';
  const renewal: ProfessionalOffer = {
    id: `renewal_${career.currentClub.id}_${career.currentSeason}`,
    offerType: 'renewal',
    club: {
      ...career.currentProfessionalClub,
      leagueTier: clampProfessionalLeagueTier(
        career.leagueSeason?.competition.tier ?? getClubLeagueTier(career.currentProfessionalClub),
      ),
    },
    contract: {
      ...career.currentContract,
      startDate: `${career.currentSeason + 1}-07-01`,
      endDate: contractExpires
        ? `${career.currentSeason + 3}-06-30`
        : career.currentContract.endDate,
      squadRole: role,
      contractType: role === 'development_player' ? 'development' : 'professional',
    },
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
