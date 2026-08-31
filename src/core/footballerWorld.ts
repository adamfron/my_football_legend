import type {
  CareerState,
  Contract,
  FootballerProfile,
  Id,
  PlayerPosition,
  ProfessionalClub,
  WorldFootballer,
  SquadRole,
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
  const overall = getPlayerOverall(profile, primaryPosition);
  const role: SquadRole =
    index < 3
      ? 'star_player'
      : index < 11
        ? 'important_player'
        : index < 17
          ? 'first_team_competition'
          : index < 21
            ? 'rotation'
            : 'development_player';
  const contractRng = RandomGenerator.fromSeed(`${seed}:${id}:contract`);
  const startYear = 2026 - contractRng.int(0, age <= 21 ? 2 : 4);
  const startMonth = contractRng.int(1, 8);
  const duration = age >= 33 ? contractRng.int(1, 2) : contractRng.int(2, age <= 22 ? 5 : 4);
  // Independent market noise and rare distortions intentionally prevent OVR from becoming payroll.
  const noise = 0.72 + contractRng.float() * 0.62;
  const distortion = contractRng.int(1, 100) <= 8 ? contractRng.pick([0.58, 1.65]) : 1;
  const ageFactor = age >= 32 ? 1.12 : age <= 21 ? 0.78 : 1;
  const roleFactor: Record<SquadRole, number> = {
    development_player: 0.58,
    rotation: 0.78,
    first_team_competition: 0.95,
    important_player: 1.18,
    star_player: 1.45,
  };
  const tierFactor = 1 + (4 - club.leagueTier) * 0.42;
  const salary = Math.max(
    1_500,
    Math.round(
      ((club.financialLevel + 20) * 95 + overall * overall * 1.7) *
        tierFactor *
        roleFactor[role] *
        ageFactor *
        noise *
        distortion *
        (0.85 + Math.max(5, targetOverall - 25) / 300),
    ),
  );
  const currentContract: Contract = {
    clubId: club.id,
    startDate: `${startYear}-${String(startMonth).padStart(2, '0')}-01`,
    endDate: `${startYear + duration}-06-30`,
    monthlySalary: salary,
    signingBonus: contractRng.int(1, 100) <= 72 ? Math.round(salary * contractRng.int(1, 5)) : 0,
    squadRole: role,
    contractType: 'professional',
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
    currentContract,
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

export type MatchBenchAssignment = BestXIAssignment;
const BENCH_COVERAGE: readonly (readonly PlayerPosition[])[] = [
  ['goalkeeper'],
  ['center_back', 'left_back', 'right_back'],
  ['defensive_midfielder', 'attacking_midfielder'],
  ['left_winger', 'right_winger', 'striker'],
];

/** Temporary deterministic presentation evaluation, not manager selection AI. */
export const selectMatchBench = (
  career: Pick<CareerState, 'player' | 'footballerWorld' | 'selectionStanding'>,
  club: ProfessionalClub,
  xi: readonly BestXIAssignment[] = selectBestXI(career, club).assignments,
  limit = 7,
): MatchBenchAssignment[] => {
  const excluded = new Set(xi.map((item) => item.footballerId));
  const available = (club.squadPlayerIds ?? [])
    .filter((id) => !excluded.has(id) && career.footballerWorld?.[id]?.careerStatus !== 'retired')
    .map((id) => resolveFootballer(career, id))
    .filter((player): player is FootballerProfile => Boolean(player));
  const selected: MatchBenchAssignment[] = [];
  const takeBest = (positions: readonly PlayerPosition[]) => {
    const candidates = available
      .filter((player) => !selected.some((item) => item.footballerId === player.id))
      .map((player) => {
        const position = [...positions].sort(
          (a, b) =>
            getEffectivePositionOverall(player, b) - getEffectivePositionOverall(player, a) ||
            a.localeCompare(b),
        )[0]!;
        return {
          footballerId: player.id,
          position,
          effectiveOverall: getEffectivePositionOverall(player, position),
        };
      })
      .sort(
        (a, b) =>
          getManagerSelectionScore(
            career,
            club,
            resolveFootballer(career, b.footballerId)!,
            b.position,
          ) -
            getManagerSelectionScore(
              career,
              club,
              resolveFootballer(career, a.footballerId)!,
              a.position,
            ) || a.footballerId.localeCompare(b.footballerId),
      );
    if (candidates[0] && selected.length < limit) selected.push(candidates[0]);
  };
  for (const coverage of BENCH_COVERAGE) takeBest(coverage);
  while (selected.length < Math.min(limit, available.length)) takeBest(PLAYER_POSITIONS);
  return selected;
};

export interface SquadHierarchy {
  formation: FormationId;
  preferredXI: BestXIAssignment[];
  bench: MatchBenchAssignment[];
  deepReserve: FootballerProfile[];
}
export type SportingStatus = 'starting_xi' | 'bench' | 'deep_reserve';

/**
 * A manager's stable, deliberately small preference. Effective positional quality remains the
 * dominant signal; selectionStanding is slow-moving coach trust and can only settle close calls.
 */
export const getManagerSelectionScore = (
  career: Pick<CareerState, 'player' | 'footballerWorld' | 'selectionStanding'>,
  club: ProfessionalClub,
  player: FootballerProfile,
  position: PlayerPosition,
) => {
  const effectiveOverall = getEffectivePositionOverall(player, position);
  const isProtagonist = player.id === career.player.id;
  const fitness = isProtagonist
    ? career.player.fitness
    : (career.footballerWorld?.[player.id]?.fitness ?? 90);
  const trust = isProtagonist ? ((career.selectionStanding ?? 50) - 50) / 25 : 0;
  const fitnessInfluence = (Math.max(50, fitness) - 85) / 25;
  const preference =
    RandomGenerator.fromSeed(
      `manager-preference:${club.managerId}:${player.id}:${position}`,
    ).float() *
      2.5 -
    1.25;
  return effectiveOverall + trust + fitnessInfluence + preference;
};

const selectManagerXI = (
  career: Pick<CareerState, 'player' | 'footballerWorld' | 'selectionStanding'>,
  club: ProfessionalClub,
  formation: FormationId,
): BestXI => {
  const slots = FORMATIONS[formation];
  const players = (club.squadPlayerIds ?? [])
    .filter((id) => career.footballerWorld?.[id]?.careerStatus !== 'retired')
    .map((id) => resolveFootballer(career, id))
    .filter((p): p is FootballerProfile => Boolean(p))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (players.length < slots.length) return { formation, assignments: [] };
  const available = [...players];
  const assignments: BestXIAssignment[] = [];
  // Repeated best-pair selection is intentionally plausible rather than a perfect global optimizer.
  for (const position of [...slots].sort((a, b) => {
    const aOptions = players.filter((p) => p.positionFamiliarity[a] >= 0.3).length;
    const bOptions = players.filter((p) => p.positionFamiliarity[b] >= 0.3).length;
    return aOptions - bOptions || a.localeCompare(b);
  })) {
    const selected = [...available].sort(
      (a, b) =>
        getManagerSelectionScore(career, club, b, position) -
          getManagerSelectionScore(career, club, a, position) || a.id.localeCompare(b.id),
    )[0]!;
    available.splice(available.indexOf(selected), 1);
    assignments.push({
      footballerId: selected.id,
      position,
      effectiveOverall: getEffectivePositionOverall(selected, position),
    });
  }
  return { formation, assignments };
};

export const deriveSquadHierarchy = (
  career: Pick<CareerState, 'player' | 'footballerWorld' | 'selectionStanding'>,
  club: ProfessionalClub,
  formation = getManagerPreferredFormation(club.managerId),
): SquadHierarchy => {
  const xi = selectManagerXI(career, club, formation);
  const bench = selectMatchBench(career, club, xi.assignments);
  const selected = new Set([...xi.assignments, ...bench].map((item) => item.footballerId));
  const deepReserve = (club.squadPlayerIds ?? [])
    .filter((id) => !selected.has(id) && career.footballerWorld?.[id]?.careerStatus !== 'retired')
    .map((id) => resolveFootballer(career, id))
    .filter((player): player is FootballerProfile => Boolean(player))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { formation: xi.formation, preferredXI: xi.assignments, bench, deepReserve };
};

export const getSportingStatus = (hierarchy: SquadHierarchy, footballerId: Id): SportingStatus =>
  hierarchy.preferredXI.some((item) => item.footballerId === footballerId)
    ? 'starting_xi'
    : hierarchy.bench.some((item) => item.footballerId === footballerId)
      ? 'bench'
      : 'deep_reserve';

export const getPositionalCompetition = (
  career: Pick<CareerState, 'player' | 'footballerWorld' | 'selectionStanding'>,
  club: ProfessionalClub,
  position: PlayerPosition,
  hierarchy = deriveSquadHierarchy(career, club),
) =>
  (club.squadPlayerIds ?? [])
    .map((id) => resolveFootballer(career, id))
    .filter((player): player is FootballerProfile => Boolean(player))
    .filter((player) => player.positionFamiliarity[position] >= 0.3)
    .map((player) => ({
      player,
      effectiveOverall: getEffectivePositionOverall(player, position),
      status: getSportingStatus(hierarchy, player.id),
    }))
    .sort(
      (a, b) =>
        getManagerSelectionScore(career, club, b.player, position) -
          getManagerSelectionScore(career, club, a.player, position) ||
        a.player.id.localeCompare(b.player.id),
    );
export const selectBestXI = (
  career: Pick<CareerState, 'player' | 'footballerWorld'>,
  club: ProfessionalClub,
  formation = getManagerPreferredFormation(club.managerId),
): BestXI => {
  const slots = FORMATIONS[formation];
  const players = (club.squadPlayerIds ?? [])
    .filter((id) => career.footballerWorld?.[id]?.careerStatus !== 'retired')
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
