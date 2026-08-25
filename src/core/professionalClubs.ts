import type {
  CareerState,
  ClubArchetype,
  ProfessionalClub,
  ProfessionalOffer,
  SquadRole,
} from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';

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
    const strength = 43 + index * 2 + rng.int(-4, 4);
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
      professionalLevel: strength > 68 ? 2 : strength > 55 ? 3 : 4,
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
  Object.values(career.player.attributes).reduce((a, b) => a + b, 0) / 8;
export const evaluateClubInterest = (career: CareerState, club: ProfessionalClub) => {
  const need = club.positionalNeeds[group(career.player.primaryPosition)];
  const stats = (career.matchHistory ?? []).reduce(
    (s, m) => s + m.minutes / 500 + (m.rating ?? 6) - 6 + m.goals * 0.7 + m.assists * 0.5,
    0,
  );
  const scout = RandomGenerator.fromSeed(`${career.seed}:scout:${club.id}`).int(-9, 9);
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
    stats -
    club.overallStrength * 0.55 -
    (need.depth === 'deep' ? 10 : need.depth === 'thin' ? -5 : 0) +
    style;
  return { score, interested: score >= 37, need, potentialEstimate };
};
export const generateProfessionalOffers = (career: CareerState): ProfessionalOffer[] =>
  generateProfessionalClubPool(career.seed)
    .flatMap((club): ProfessionalOffer[] => {
      const interest = evaluateClubInterest(career, club);
      if (!interest.interested) return [];
      const rng = RandomGenerator.fromSeed(`${career.seed}:offer:${club.id}`);
      const gap = overall(career) - interest.need.starterQuality;
      const role: SquadRole =
        gap > 7
          ? 'important_player'
          : gap > 0
            ? 'first_team_competition'
            : interest.need.depth === 'thin'
              ? 'rotation'
              : 'development_player';
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
            club.professionalLevel * 180 +
            career.player.reputation * 16) *
            roleFactor) /
            100,
        ) * 100;
      return [
        {
          id: `offer_${club.id}_${career.currentSeason}`,
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
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 6);
