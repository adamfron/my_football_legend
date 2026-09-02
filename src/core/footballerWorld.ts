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
import { POSITION_COMPATIBILITY } from './positionCompatibility';
import { deriveDateOfBirth } from './age';
import { getProfileAge } from './age';

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
  career: Pick<CareerState, 'player' | 'footballerWorld' | 'worldDelta' | 'currentDate'>,
  id: Id,
): FootballerProfile | undefined => {
  const profile =
    id === career.player.id
      ? career.player
      : (
          career.worldDelta?.footballerOverrides[id] ??
          career.worldDelta?.newFootballers[id] ??
          career.footballerWorld?.[id]
        )?.profile;
  if (!profile || !career.currentDate) return profile;
  const age = getProfileAge(profile, career.currentDate, '2026-07-01');
  return age === profile.age ? profile : { ...profile, age };
};

interface SquadDepthSlot {
  position: PlayerPosition;
  qualityOffset: number;
}
const depth = (position: PlayerPosition, offsets: readonly number[]): SquadDepthSlot[] =>
  offsets.map((qualityOffset) => ({ position, qualityOffset }));
/** Explicit competition at each position: array order is identity only, never quality. */
const squadDepthBlueprint: SquadDepthSlot[] = [
  ...depth('goalkeeper', [2, -4, -9]),
  ...depth('center_back', [2, 1, -2, -6]),
  ...depth('left_back', [2, -5]),
  ...depth('right_back', [2, -5]),
  ...depth('defensive_midfielder', [2, 0, -5]),
  ...depth('attacking_midfielder', [2, 0, -5]),
  ...depth('left_winger', [2, -5]),
  ...depth('right_winger', [2, -5]),
  ...depth('striker', [2, 0, -6]),
];
export const firstNames = [
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
export const lastNames = [
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
const archetypeVersatility: Record<string, number> = {
  center_back_libero: 24,
  center_back_complete: 14,
  false_nine: 25,
  complete_forward: 18,
  wide_playmaker: 25,
  wing_back: 22,
  poacher: -22,
  center_back_aggressive: -18,
  shot_stopper: -100,
};
export const generateCanonicalFootballerProfile = (options: {
  id: Id;
  seed: string;
  age: number;
  referenceDate?: string;
  targetOverall: number;
  primaryPosition: PlayerPosition;
}): FootballerProfile => {
  const { id, seed, age, targetOverall, primaryPosition } = options;
  const rng = RandomGenerator.fromSeed(`${seed}:${id}`);
  const archetypes = getEligibleFootballArchetypes(primaryPosition);
  const archetype = archetypes[rng.int(0, archetypes.length - 1)]!;
  const secondaryOptions = [...POSITION_COMPATIBILITY[primaryPosition]];
  const versatilityRoll = rng.int(1, 100) + (archetypeVersatility[archetype.id] ?? 0);
  const secondaryCount =
    primaryPosition === 'goalkeeper' || versatilityRoll < 50
      ? 0
      : versatilityRoll < 88
        ? 1
        : versatilityRoll < 98
          ? 2
          : 3;
  const secondaryPositions: PlayerPosition[] = [];
  while (secondaryOptions.length && secondaryPositions.length < secondaryCount) {
    const selected = rng.pick(secondaryOptions);
    secondaryPositions.push(selected);
    secondaryOptions.splice(secondaryOptions.indexOf(selected), 1);
  }
  const positionFamiliarity = Object.fromEntries(
    PLAYER_POSITIONS.map((position) => [
      position,
      position === primaryPosition
        ? 1
        : secondaryPositions.includes(position)
          ? secondaryPositions.indexOf(position) === 0
            ? 0.9
            : 0.75
          : 0,
    ]),
  ) as Record<PlayerPosition, number>;
  return {
    id,
    firstName: rng.pick(firstNames),
    lastName: rng.pick(lastNames),
    age,
    dateOfBirth: deriveDateOfBirth(age, options.referenceDate ?? '2026-07-01', id),
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
    positionFamiliarity,
  };
};
const generateWorldFootballer = (
  club: ProfessionalClub,
  index: number,
  slot: SquadDepthSlot,
  seed: string,
): WorldFootballer => {
  const id = `footballer_${club.id}_${index}`;
  const rng = RandomGenerator.fromSeed(`${seed}:${id}`);
  const primaryPosition = slot.position;
  const age = Math.max(17, Math.min(36, Math.round(26 + rng.int(-8, 8) + rng.int(-5, 5) / 2)));
  const ageAdjustment = age <= 20 ? -3 : age >= 33 ? -2 : 0;
  const targetOverall = Math.max(
    32,
    Math.min(88, (club.strengthRating ?? 50) + slot.qualityOffset + ageAdjustment + rng.int(-2, 2)),
  );
  const profile = generateCanonicalFootballerProfile({
    id,
    seed,
    age,
    targetOverall,
    primaryPosition,
  });
  const overall = getPlayerOverall(profile, primaryPosition);
  // Final promises are assigned in a second pass, once real squad competition is known.
  const role: SquadRole = 'rotation';
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
    const squadPlayerIds = squadDepthBlueprint.map((slot, index) => {
      const footballer = generateWorldFootballer(club, index, slot, seed);
      footballerWorld[footballer.profile.id] = footballer;
      return footballer.profile.id;
    });
    const populatedClub = { ...club, squadPlayerIds };
    const career = { player: { id: '__world_generation__' }, footballerWorld } as SelectionCareer;
    const hierarchy = deriveSquadHierarchy(career, populatedClub);
    for (const id of squadPlayerIds) {
      const footballer = footballerWorld[id]!;
      const position = footballer.profile.primaryPosition;
      const bestCompetitor = Math.max(
        0,
        ...squadPlayerIds
          .filter((otherId) => otherId !== id)
          .map((otherId) => footballerWorld[otherId]!.profile)
          .filter((other) => other.positionFamiliarity[position] >= 0.3)
          .map((other) => getEffectivePositionOverall(other, position)),
      );
      footballer.currentContract!.squadRole = getContextualSquadRole(
        getSportingStatus(hierarchy, id),
        footballer.profile.age,
        getPlayerOverall(footballer.profile, position) - bestCompetitor,
      );
    }
    return populatedClub;
  });
  return { clubs: populatedClubs, footballerWorld };
};

export interface SquadSelectionContext {
  id: Id;
  managerId?: Id | undefined;
  squadPlayerIds?: Id[] | undefined;
}

export interface BestXIAssignment {
  footballerId: Id;
  position: PlayerPosition;
  effectiveOverall: number;
  /** Identity of the canonical FORMATIONS slot. */
  slotIndex: number;
}
export interface BestXI {
  formation: FormationId;
  assignments: BestXIAssignment[];
}

export type MatchBenchAssignment = Omit<BestXIAssignment, 'slotIndex'>;
const BENCH_COVERAGE: readonly (readonly PlayerPosition[])[] = [
  ['goalkeeper'],
  ['center_back', 'left_back', 'right_back'],
  ['defensive_midfielder', 'attacking_midfielder'],
  ['left_winger', 'right_winger', 'striker'],
];

/**
 * Goalkeeper is a specialist boundary during normal selection. A future explicit emergency
 * position mechanic may cross it after a red card/injury and exhausted substitutions.
 */
export const isEligibleForNormalPosition = (player: FootballerProfile, position: PlayerPosition) =>
  (player.primaryPosition === 'goalkeeper') === (position === 'goalkeeper');

/** Temporary deterministic presentation evaluation, not manager selection AI. */
export const selectMatchBench = (
  career: Pick<CareerState, 'player' | 'footballerWorld' | 'selectionStanding'>,
  club: SquadSelectionContext,
  xi: readonly Pick<BestXIAssignment, 'footballerId'>[] = selectBestXI(career, club).assignments,
  limit = 7,
  selectionScore: SelectionScore = (player, position) =>
    getManagerSelectionScore(career, club, player, position),
): MatchBenchAssignment[] => {
  const excluded = new Set(xi.map((item) => item.footballerId));
  const available = (club.squadPlayerIds ?? [])
    .filter((id) => !excluded.has(id) && career.footballerWorld?.[id]?.careerStatus !== 'retired')
    .map((id) => resolveFootballer(career, id))
    .filter((player): player is FootballerProfile => Boolean(player));
  const selected: MatchBenchAssignment[] = [];
  const takeBest = (positions: readonly PlayerPosition[]) => {
    let best: { assignment: MatchBenchAssignment; score: number } | undefined;
    for (const player of available) {
      if (selected.some((item) => item.footballerId === player.id)) continue;
      const eligiblePositions = positions.filter((position) =>
        isEligibleForNormalPosition(player, position),
      );
      if (!eligiblePositions.length) continue;
      let position = eligiblePositions[0]!;
      let effectiveOverall = getSelectionOverall(player, position, player.id === career.player.id);
      for (let index = 1; index < eligiblePositions.length; index++) {
        const candidatePosition = eligiblePositions[index]!;
        const candidateOverall = getSelectionOverall(
          player,
          candidatePosition,
          player.id === career.player.id,
        );
        if (
          candidateOverall > effectiveOverall ||
          (candidateOverall === effectiveOverall && candidatePosition.localeCompare(position) < 0)
        ) {
          position = candidatePosition;
          effectiveOverall = candidateOverall;
        }
      }
      const score = selectionScore(player, position);
      if (
        !best ||
        score > best.score ||
        (score === best.score && player.id < best.assignment.footballerId)
      )
        best = {
          assignment: { footballerId: player.id, position, effectiveOverall },
          score,
        };
    }
    if (best && selected.length < limit) selected.push(best.assignment);
    return Boolean(best);
  };
  for (const coverage of BENCH_COVERAGE) takeBest(coverage);
  const outfieldPositions = PLAYER_POSITIONS.filter((position) => position !== 'goalkeeper');
  while (selected.length < Math.min(limit, available.length)) {
    if (!takeBest(outfieldPositions)) break;
  }
  while (selected.length < Math.min(limit, available.length)) {
    if (!takeBest(PLAYER_POSITIONS)) break;
  }
  return selected;
};

export interface SquadHierarchy {
  formation: FormationId;
  preferredXI: BestXIAssignment[];
  bench: MatchBenchAssignment[];
  deepReserve: FootballerProfile[];
}
export type SportingStatus = 'starting_xi' | 'bench' | 'deep_reserve';
type SelectionCareer = Pick<CareerState, 'player' | 'footballerWorld' | 'selectionStanding'>;
type SelectionScore = (player: FootballerProfile, position: PlayerPosition) => number;
const managerPreferenceCache = new Map<string, number>();
const staticNpcOverallCache = new Map<string, number>();
const sportingStatusCache = new WeakMap<object, Map<string, SportingStatus>>();
const managerAssignmentCache = new WeakMap<object, Map<string, PlayerPosition | undefined>>();

const getStableManagerPreference = (
  club: SquadSelectionContext,
  player: FootballerProfile,
  position: PlayerPosition,
) => {
  const key = `${club.managerId}:${player.id}:${position}`;
  const cached = managerPreferenceCache.get(key);
  if (cached !== undefined) return cached;
  const preference = RandomGenerator.fromSeed(`manager-preference:${key}`).float() * 2.5 - 1.25;
  managerPreferenceCache.set(key, preference);
  return preference;
};

const getSelectionOverall = (
  player: FootballerProfile,
  position: PlayerPosition,
  isProtagonist: boolean,
) => {
  // Static-world NPC cards are immutable until the future seasonal-development system. Their
  // stable IDs therefore let all career snapshots and simulations reuse the same derived OVR.
  // Protagonist cards keep taking the uncached live path.
  if (isProtagonist) return getEffectivePositionOverall(player, position);
  const key = `${player.id}:${position}`;
  const cached = staticNpcOverallCache.get(key);
  if (cached !== undefined) return cached;
  const overall = getEffectivePositionOverall(player, position);
  staticNpcOverallCache.set(key, overall);
  return overall;
};

/**
 * A manager's stable, deliberately small preference. Effective positional quality remains the
 * dominant signal; selectionStanding is slow-moving coach trust and can only settle close calls.
 */
export const getManagerSelectionScore = (
  career: SelectionCareer,
  club: SquadSelectionContext,
  player: FootballerProfile,
  position: PlayerPosition,
) => {
  const isProtagonist = player.id === career.player.id;
  const effectiveOverall = getSelectionOverall(player, position, isProtagonist);
  const fitness = isProtagonist
    ? career.player.fitness
    : (career.footballerWorld?.[player.id]?.fitness ?? 90);
  const trust = isProtagonist ? ((career.selectionStanding ?? 50) - 50) / 25 : 0;
  const fitnessInfluence = (Math.max(50, fitness) - 85) / 25;
  const preference = getStableManagerPreference(club, player, position);
  return effectiveOverall + trust + fitnessInfluence + preference;
};

/** A hierarchy calculation scores every player/position pair once, not once per sort comparison. */
const createSelectionScore = (
  career: SelectionCareer,
  club: SquadSelectionContext,
): SelectionScore => {
  const scores = new Map<string, number>();
  return (player, position) => {
    const key = `${player.id}:${position}`;
    const cached = scores.get(key);
    if (cached !== undefined) return cached;
    const score = getManagerSelectionScore(career, club, player, position);
    scores.set(key, score);
    return score;
  };
};

const selectManagerXI = (
  career: SelectionCareer,
  club: SquadSelectionContext,
  formation: FormationId,
  selectionScore: SelectionScore,
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
  for (const slotIndex of slots
    .map((_, slotIndex) => slotIndex)
    .sort((a, b) => {
      const aPosition = slots[a]!;
      const bPosition = slots[b]!;
      const aOptions = players.filter(
        (p) => isEligibleForNormalPosition(p, aPosition) && p.positionFamiliarity[aPosition] >= 0.3,
      ).length;
      const bOptions = players.filter(
        (p) => isEligibleForNormalPosition(p, bPosition) && p.positionFamiliarity[bPosition] >= 0.3,
      ).length;
      return aOptions - bOptions || a - b;
    })) {
    const position = slots[slotIndex]!;
    const eligible = available.filter((player) => isEligibleForNormalPosition(player, position));
    if (!eligible.length) return { formation, assignments: [] };
    let selected = eligible[0]!;
    let selectedScore = selectionScore(selected, position);
    for (let index = 1; index < eligible.length; index++) {
      const candidate = eligible[index]!;
      const candidateScore = selectionScore(candidate, position);
      if (
        candidateScore > selectedScore ||
        (candidateScore === selectedScore && candidate.id < selected.id)
      ) {
        selected = candidate;
        selectedScore = candidateScore;
      }
    }
    available.splice(available.indexOf(selected), 1);
    assignments.push({
      footballerId: selected.id,
      position,
      effectiveOverall: getSelectionOverall(selected, position, selected.id === career.player.id),
      slotIndex,
    });
  }
  return { formation, assignments: assignments.sort((a, b) => a.slotIndex! - b.slotIndex!) };
};

export const deriveSquadHierarchy = (
  career: SelectionCareer,
  club: SquadSelectionContext,
  formation = getManagerPreferredFormation(club.managerId),
): SquadHierarchy => {
  const selectionScore = createSelectionScore(career, club);
  const xi = selectManagerXI(career, club, formation, selectionScore);
  const bench = selectMatchBench(career, club, xi.assignments, 7, selectionScore);
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

/** Contract promise derived from sporting reality; development is deliberately youth-only. */
export const getContextualSquadRole = (
  status: SportingStatus,
  age: number,
  competitorMargin = 0,
): SquadRole =>
  status === 'starting_xi'
    ? competitorMargin >= 8
      ? 'star_player'
      : 'important_player'
    : status === 'bench'
      ? competitorMargin >= -4
        ? 'first_team_competition'
        : 'rotation'
      : age <= 21
        ? 'development_player'
        : 'rotation';

/**
 * Match simulation only needs one answer. It shares the exact XI/bench selectors with the full
 * hierarchy but deliberately skips constructing and sorting the deep-reserve presentation list.
 */
export const getFootballerSportingStatus = (
  career: SelectionCareer,
  club: SquadSelectionContext,
  footballerId: Id,
  formation = getManagerPreferredFormation(club.managerId),
): SportingStatus => {
  const cacheKey = `${club.id}:${formation}:${footballerId}`;
  let careerStatuses = sportingStatusCache.get(career);
  const cached = careerStatuses?.get(cacheKey);
  if (cached) return cached;
  const selectionScore = createSelectionScore(career, club);
  const xi = selectManagerXI(career, club, formation, selectionScore);
  const bench = selectMatchBench(career, club, xi.assignments, 7, selectionScore);
  const status = xi.assignments.some((item) => item.footballerId === footballerId)
    ? 'starting_xi'
    : bench.some((item) => item.footballerId === footballerId)
      ? 'bench'
      : 'deep_reserve';
  if (!careerStatuses) {
    careerStatuses = new Map();
    sportingStatusCache.set(career, careerStatuses);
  }
  careerStatuses.set(cacheKey, status);
  let assignments = managerAssignmentCache.get(career);
  if (!assignments) {
    assignments = new Map();
    managerAssignmentCache.set(career, assignments);
  }
  const assignment =
    xi.assignments.find((item) => item.footballerId === footballerId) ??
    bench.find((item) => item.footballerId === footballerId);
  assignments.set(cacheKey, assignment?.position);
  return status;
};

/** Exact XI/bench slot from the same canonical manager-selection pass. */
export const getFootballerManagerAssignment = (
  career: SelectionCareer,
  club: SquadSelectionContext,
  footballerId: Id,
  formation = getManagerPreferredFormation(club.managerId),
) => {
  const key = `${club.id}:${formation}:${footballerId}`;
  if (!managerAssignmentCache.get(career)?.has(key))
    getFootballerSportingStatus(career, club, footballerId, formation);
  return managerAssignmentCache.get(career)?.get(key);
};

export const getPositionalCompetition = (
  career: Pick<CareerState, 'player' | 'footballerWorld' | 'selectionStanding'>,
  club: SquadSelectionContext,
  position: PlayerPosition,
  hierarchy = deriveSquadHierarchy(career, club),
) =>
  (club.squadPlayerIds ?? [])
    .map((id) => resolveFootballer(career, id))
    .filter((player): player is FootballerProfile => Boolean(player))
    .filter((player) => isEligibleForNormalPosition(player, position))
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
  club: SquadSelectionContext,
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
          const player = players[j - 1]!;
          const position = slots[i0 - 1]!;
          const quality = isEligibleForNormalPosition(player, position)
            ? getEffectivePositionOverall(player, position)
            : -1_000_000;
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
      slotIndex: slot,
    })),
  };
};
export const getSquadDerivedClubStrength = (
  career: Pick<CareerState, 'player' | 'footballerWorld'>,
  club: SquadSelectionContext,
) => {
  const xi = selectBestXI(career, club);
  return xi.assignments.length === 11
    ? Math.round(xi.assignments.reduce((sum, item) => sum + item.effectiveOverall, 0) / 11)
    : undefined;
};
export const getSquadDepthAtPosition = (
  career: Pick<CareerState, 'player' | 'footballerWorld'>,
  club: SquadSelectionContext,
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
  club: SquadSelectionContext,
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
