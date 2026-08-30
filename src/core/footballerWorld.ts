import type {
  CareerState,
  FootballerProfile,
  Id,
  PlayerPosition,
  ProfessionalClub,
  WorldFootballer,
} from '../types/domain';
import { getEligibleFootballArchetypes } from './footballArchetypes';
import { generateDevelopmentProfile, generateFootballerAttributes } from './playerCreator';
import { getEffectivePositionOverall, getPlayerOverall, PLAYER_POSITIONS } from './playerOverall';
import { RandomGenerator } from './random/RandomGenerator';

export type FormationId = '4-3-3' | '4-2-3-1' | '4-4-2' | '3-4-2-1' | '3-5-2';
export const FORMATIONS: Record<FormationId, readonly PlayerPosition[]> = {
  '4-3-3': [
    'goalkeeper',
    'left_back',
    'center_back',
    'center_back',
    'right_back',
    'defensive_midfielder',
    'attacking_midfielder',
    'attacking_midfielder',
    'left_winger',
    'right_winger',
    'striker',
  ],
  '4-2-3-1': [
    'goalkeeper',
    'left_back',
    'center_back',
    'center_back',
    'right_back',
    'defensive_midfielder',
    'defensive_midfielder',
    'left_winger',
    'attacking_midfielder',
    'right_winger',
    'striker',
  ],
  '4-4-2': [
    'goalkeeper',
    'left_back',
    'center_back',
    'center_back',
    'right_back',
    'defensive_midfielder',
    'defensive_midfielder',
    'left_winger',
    'right_winger',
    'striker',
    'striker',
  ],
  '3-4-2-1': [
    'goalkeeper',
    'center_back',
    'center_back',
    'center_back',
    'left_back',
    'right_back',
    'defensive_midfielder',
    'defensive_midfielder',
    'attacking_midfielder',
    'attacking_midfielder',
    'striker',
  ],
  '3-5-2': [
    'goalkeeper',
    'center_back',
    'center_back',
    'center_back',
    'left_back',
    'right_back',
    'defensive_midfielder',
    'attacking_midfielder',
    'attacking_midfielder',
    'striker',
    'striker',
  ],
};
const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];
export const getManagerPreferredFormation = (managerId = 'manager'): FormationId =>
  RandomGenerator.fromSeed(`manager-formation:${managerId}`).pick(FORMATION_IDS);

export const resolveFootballer = (
  career: Pick<CareerState, 'player' | 'footballerWorld'>,
  id: Id,
): FootballerProfile | undefined =>
  id === career.player.id ? career.player : career.footballerWorld?.[id]?.profile;

const positionTemplate: PlayerPosition[] = [
  'goalkeeper',
  'goalkeeper',
  'goalkeeper',
  'center_back',
  'center_back',
  'center_back',
  'center_back',
  'left_back',
  'left_back',
  'right_back',
  'right_back',
  'defensive_midfielder',
  'defensive_midfielder',
  'defensive_midfielder',
  'attacking_midfielder',
  'attacking_midfielder',
  'attacking_midfielder',
  'left_winger',
  'left_winger',
  'right_winger',
  'right_winger',
  'striker',
  'striker',
  'striker',
];
const firstNames = [
  'Adam',
  'Bartosz',
  'Kacper',
  'Michał',
  'Jakub',
  'Jan',
  'Mateusz',
  'Piotr',
  'Igor',
  'Oskar',
  'Filip',
  'Tomasz',
];
const lastNames = [
  'Nowak',
  'Kowalski',
  'Mazur',
  'Wójcik',
  'Krawczyk',
  'Dudek',
  'Król',
  'Lis',
  'Pawlak',
  'Sikora',
  'Baran',
  'Zając',
];
const secondaryFor: Partial<Record<PlayerPosition, PlayerPosition[]>> = {
  left_winger: ['right_winger', 'attacking_midfielder'],
  right_winger: ['left_winger', 'attacking_midfielder'],
  attacking_midfielder: ['defensive_midfielder', 'striker'],
  defensive_midfielder: ['center_back', 'attacking_midfielder'],
  left_back: ['right_back', 'left_winger'],
  right_back: ['left_back', 'right_winger'],
  center_back: ['defensive_midfielder'],
  striker: ['attacking_midfielder'],
};
const generateWorldFootballer = (
  club: ProfessionalClub,
  index: number,
  seed: string,
): WorldFootballer => {
  const id = `footballer_${club.id}_${index}`;
  const rng = RandomGenerator.fromSeed(`${seed}:${id}`);
  const primaryPosition = positionTemplate[index % positionTemplate.length]!;
  const age = Math.max(17, Math.min(36, Math.round(26 + rng.int(-8, 8) + rng.int(-5, 5) / 2)));
  const hierarchy = index < 3 ? 4 : index < 14 ? 1 : index < 20 ? -5 : -10;
  const ageAdjustment = age <= 20 ? -3 : age >= 33 ? -2 : 0;
  const targetOverall = Math.max(
    32,
    Math.min(88, (club.strengthRating ?? 50) + hierarchy + ageAdjustment + rng.int(-2, 2)),
  );
  const archetypes = getEligibleFootballArchetypes(primaryPosition);
  const archetype = archetypes[rng.int(0, archetypes.length - 1)]!;
  const secondaryOptions = secondaryFor[primaryPosition] ?? [];
  const secondaryPositions =
    rng.int(1, 100) <= 42 && secondaryOptions.length ? [rng.pick(secondaryOptions)] : [];
  const familiarity = Object.fromEntries(
    PLAYER_POSITIONS.map((position) => [
      position,
      position === primaryPosition ? 1 : secondaryPositions.includes(position) ? 0.75 : 0,
    ]),
  ) as Record<PlayerPosition, number>;
  const profile: FootballerProfile = {
    id,
    firstName: rng.pick(firstNames),
    lastName: rng.pick(lastNames),
    age,
    nationality: 'PL',
    heightCm: rng.int(
      primaryPosition === 'goalkeeper' ? 184 : 168,
      primaryPosition === 'goalkeeper' ? 201 : 194,
    ),
    weightKg: rng.int(65, 91),
    attributes: generateFootballerAttributes({
      seed: `${seed}:${id}`,
      targetOverall,
      primaryPosition,
      archetypeId: archetype.id,
    }),
    hiddenProfile: {
      consistency: rng.int(25, 90),
      importantMatches: rng.int(20, 90),
      injuryProneness: rng.int(8, 80),
      adaptability: rng.int(20, 95),
      loyalty: rng.int(15, 95),
      pressureResistance: rng.int(20, 90),
      controversy: rng.int(3, 70),
      fairPlay: rng.int(25, 95),
    },
    dominantFoot: rng.int(1, 100) <= 24 ? 'left' : 'right',
    weakFootProficiency: rng.int(20, 78),
    traits: [],
    primaryPosition,
    secondaryPositions,
    positionFamiliarity: familiarity,
  };
  return {
    profile,
    developmentProfile: generateDevelopmentProfile(
      RandomGenerator.fromSeed(`${seed}:${id}:development`),
    ),
    careerStatus: 'active',
    currentClubId: club.id,
    reputation: Math.max(5, targetOverall - 25),
    fitness: rng.int(78, 100),
  };
};

export const populateFootballerWorld = (clubs: ProfessionalClub[], seed: string) => {
  const footballerWorld: Record<Id, WorldFootballer> = {};
  const populatedClubs = clubs.map((club) => {
    const squadPlayerIds = positionTemplate.map((_, index) => {
      const footballer = generateWorldFootballer(club, index, seed);
      footballerWorld[footballer.profile.id] = footballer;
      return footballer.profile.id;
    });
    return { ...club, squadPlayerIds };
  });
  return { clubs: populatedClubs, footballerWorld };
};

export interface BestXIAssignment {
  footballerId: Id;
  position: PlayerPosition;
  effectiveOverall: number;
}
export interface BestXI {
  formation: FormationId;
  assignments: BestXIAssignment[];
}
export const selectBestXI = (
  career: Pick<CareerState, 'player' | 'footballerWorld'>,
  club: ProfessionalClub,
  formation = getManagerPreferredFormation(club.managerId),
): BestXI => {
  const slots = FORMATIONS[formation];
  const players = (club.squadPlayerIds ?? [])
    .map((id) => resolveFootballer(career, id))
    .filter((p): p is FootballerProfile => Boolean(p))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (players.length < slots.length) return { formation, assignments: [] };
  // Rectangular Hungarian assignment: O(slots² × players), exact rather than greedy.
  const n = slots.length,
    m = players.length;
  const u = Array(n + 1).fill(0),
    v = Array(m + 1).fill(0),
    p = Array(m + 1).fill(0),
    way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = Array(m + 1).fill(Number.POSITIVE_INFINITY);
    const used = Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = Number.POSITIVE_INFINITY,
        j1 = 0;
      for (let j = 1; j <= m; j++)
        if (!used[j]) {
          const quality = getEffectivePositionOverall(players[j - 1]!, slots[i0 - 1]!);
          const current = -quality + j * 1e-7 - u[i0]! - v[j]!;
          if (current < minv[j]!) {
            minv[j] = current;
            way[j] = j0;
          }
          if (minv[j]! < delta) {
            delta = minv[j]!;
            j1 = j;
          }
        }
      for (let j = 0; j <= m; j++)
        if (used[j]) {
          u[p[j]!] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0 !== 0);
  }
  const assigned = Array<number>(n);
  for (let j = 1; j <= m; j++) if (p[j]) assigned[p[j]! - 1] = j - 1;
  return {
    formation,
    assignments: assigned.map((playerIndex, slot) => ({
      footballerId: players[playerIndex]!.id,
      position: slots[slot]!,
      effectiveOverall: getEffectivePositionOverall(players[playerIndex]!, slots[slot]!),
    })),
  };
};
export const getSquadDerivedClubStrength = (
  career: Pick<CareerState, 'player' | 'footballerWorld'>,
  club: ProfessionalClub,
) => {
  const xi = selectBestXI(career, club);
  return xi.assignments.length === 11
    ? Math.round(xi.assignments.reduce((sum, item) => sum + item.effectiveOverall, 0) / 11)
    : undefined;
};
export const getSquadDepthAtPosition = (
  career: Pick<CareerState, 'player' | 'footballerWorld'>,
  club: ProfessionalClub,
  position: PlayerPosition,
) =>
  (club.squadPlayerIds ?? [])
    .map((id) => resolveFootballer(career, id))
    .filter((p): p is FootballerProfile => Boolean(p))
    .filter(
      (p) =>
        getEffectivePositionOverall(p, position) >= getPlayerOverall(p, p.primaryPosition) * 0.92,
    ).length;
export const getBestPlayerAtPosition = (
  career: Pick<CareerState, 'player' | 'footballerWorld'>,
  club: ProfessionalClub,
  position: PlayerPosition,
) =>
  (club.squadPlayerIds ?? [])
    .map((id) => resolveFootballer(career, id))
    .filter((p): p is FootballerProfile => Boolean(p))
    .sort(
      (a, b) =>
        getEffectivePositionOverall(b, position) - getEffectivePositionOverall(a, position) ||
        a.id.localeCompare(b.id),
    )[0];
