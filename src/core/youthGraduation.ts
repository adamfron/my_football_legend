import { getPolishU17TeamDefinitions, getYouthCohortKey } from '../content/world/polishU17';
import type {
  CareerState,
  Id,
  PlayerPosition,
  ProfessionalClub,
  WorldFootballer,
} from '../types/domain';
import { getExpectedSquadRole } from './clubStrength';
import { evaluateExpectedMonthlySalary } from './playerEconomy';
import { getPlayerOverall } from './playerOverall';
import { RandomGenerator } from './random/RandomGenerator';
import { emptyWorldDelta, resolveYouthCohort } from './worldDatabase';
import { getProfileAge } from './age';

/** Players aged 17 at the season boundary leave the U-17 cohort. */
export const YOUTH_GRADUATION_AGE = 17;
const unitFor = (position: PlayerPosition): keyof ProfessionalClub['positionalNeeds'] =>
  position === 'goalkeeper'
    ? 'goalkeeper'
    : ['center_back', 'left_back', 'right_back'].includes(position)
      ? 'defense'
      : ['striker', 'right_winger'].includes(position)
        ? 'attack'
        : 'midfield';

const potential = (footballer: WorldFootballer) =>
  Math.max(...Object.values(footballer.developmentProfile.familyCapacity));

const effectiveSquad = (career: CareerState, club: ProfessionalClub) =>
  career.worldDelta?.squadOverrides[club.id] ?? club.squadPlayerIds ?? [];

const asEvaluationCareer = (
  career: CareerState,
  footballer: WorldFootballer,
  footballers: Record<Id, WorldFootballer>,
): CareerState => ({
  ...career,
  player: {
    ...footballer.profile,
    careerPremiseId: 'npc_first_contract_evaluation',
    fitness: footballer.fitness ?? 90,
    health: 100,
    morale: 60,
    reputation: footballer.reputation ?? 1,
    matchPresentation: 'simulate_all',
    matchEffort: 3,
    trainingEffort: 3,
  },
  developmentProfile: footballer.developmentProfile,
  footballerWorld: footballers,
});

export interface YouthGraduationDiagnostics {
  graduates: number;
  parentClubPromotions: number;
  externalFirstContracts: number;
  unattachedGraduates: number;
}

/**
 * Applies the bounded, one-off first-contract market. Presence of the cohort override is the
 * canonical processed marker, so retries cannot age or contract the cohort twice.
 */
export const processYouthGraduation = (
  career: CareerState,
  season = career.currentSeason,
): { career: CareerState; diagnostics: YouthGraduationDiagnostics } => {
  let delta = career.worldDelta ?? emptyWorldDelta();
  const clubs = career.clubWorld ?? [];
  const footballers: Record<Id, WorldFootballer> = {
    ...(career.footballerWorld ?? {}),
    ...delta.newFootballers,
    ...delta.footballerOverrides,
  };
  const diagnostics: YouthGraduationDiagnostics = {
    graduates: 0,
    parentClubPromotions: 0,
    externalFirstContracts: 0,
    unattachedGraduates: 0,
  };

  for (const team of getPolishU17TeamDefinitions(clubs)) {
    const key = getYouthCohortKey(team.id, season);
    if (delta.youthCohortOverrides?.[key] !== undefined) continue;
    const baseCohort = resolveYouthCohort(career, key);
    if (!baseCohort) continue;
    const remaining: Id[] = [];
    const graduates: WorldFootballer[] = [];
    for (const id of baseCohort) {
      if (id === career.player.id) continue;
      const original = footballers[id];
      if (!original) continue;
      const age = getProfileAge(original.profile, `${season + 1}-06-30`, `${season}-07-01`);
      if (age >= YOUTH_GRADUATION_AGE) graduates.push(original);
      else remaining.push(id);
    }
    delta = {
      ...delta,
      youthCohortOverrides: { ...delta.youthCohortOverrides, [key]: remaining },
    };
    diagnostics.graduates += graduates.length;

    const parent = team.parentClubId
      ? clubs.find((club) => club.id === team.parentClubId)
      : undefined;
    const unsigned: WorldFootballer[] = [];
    for (const graduate of graduates) {
      const overall = getPlayerOverall(graduate.profile, graduate.profile.primaryPosition);
      const need = parent?.positionalNeeds[unitFor(graduate.profile.primaryPosition)];
      const noise = RandomGenerator.fromSeed(
        `${career.seed}:graduate:${season}:${graduate.profile.id}:parent`,
      ).int(-13, 13);
      const score = parent
        ? overall * 0.48 +
          potential(graduate) * 0.2 +
          need!.needLevel * 0.16 +
          parent.youthPolicy * 0.09 +
          parent.developmentReputation * 0.08 +
          parent.coachYouthTrust * 0.07 +
          (need!.depth === 'thin' ? 8 : need!.depth === 'deep' ? -8 : 0) -
          (parent.strengthRating ?? 50) * 0.42 +
          noise
        : -Infinity;
      if (!parent || score < 42) {
        unsigned.push(graduate);
        continue;
      }
      const squad = [
        ...new Set([
          ...effectiveSquad({ ...career, worldDelta: delta }, parent),
          graduate.profile.id,
        ]),
      ];
      const club = { ...parent, squadPlayerIds: squad };
      const evaluation = asEvaluationCareer(career, graduate, footballers);
      const role = getExpectedSquadRole(evaluation, club);
      const contract = {
        clubId: parent.id,
        startDate: `${season + 1}-07-01`,
        endDate: `${season + 4}-06-30`,
        monthlySalary: evaluateExpectedMonthlySalary(evaluation, parent, role),
        signingBonus: 0,
        squadRole: role,
        contractType: 'development' as const,
      };
      const signed = { ...graduate, currentClubId: parent.id, currentContract: contract };
      footballers[graduate.profile.id] = signed;
      delta = {
        ...delta,
        squadOverrides: { ...delta.squadOverrides, [parent.id]: squad },
        footballerOverrides: { ...delta.footballerOverrides, [graduate.profile.id]: signed },
      };
      diagnostics.parentClubPromotions++;
    }

    for (const graduate of unsigned) {
      const shortlist = clubs
        .map((club) => ({
          club,
          order: RandomGenerator.fromSeed(
            `${career.seed}:first-contract:${season}:${graduate.profile.id}:${club.id}`,
          ).int(0, 1_000_000),
        }))
        .sort((a, b) => a.order - b.order)
        .slice(0, 8);
      const overall = getPlayerOverall(graduate.profile, graduate.profile.primaryPosition);
      const offers = shortlist
        .map(({ club }) => {
          const need = club.positionalNeeds[unitFor(graduate.profile.primaryPosition)];
          const noise = RandomGenerator.fromSeed(
            `${career.seed}:first-contract-score:${season}:${graduate.profile.id}:${club.id}`,
          ).int(-18, 18);
          return {
            club,
            score:
              overall * 0.55 +
              potential(graduate) * 0.16 +
              need.needLevel * 0.16 +
              club.youthPolicy * 0.08 +
              club.developmentReputation * 0.06 +
              (need.depth === 'thin' ? 7 : need.depth === 'deep' ? -8 : 0) -
              (club.strengthRating ?? 50) * 0.45 -
              (4 - club.leagueTier) * 3 +
              noise,
          };
        })
        .filter((item) => item.score >= 43)
        .sort((a, b) => b.score - a.score || a.club.id.localeCompare(b.club.id));
      const destination = offers[0]?.club;
      if (!destination) {
        diagnostics.unattachedGraduates++;
        continue;
      }
      const squad = [
        ...new Set([
          ...effectiveSquad({ ...career, worldDelta: delta }, destination),
          graduate.profile.id,
        ]),
      ];
      const club = { ...destination, squadPlayerIds: squad };
      const evaluation = asEvaluationCareer(career, graduate, footballers);
      const role = getExpectedSquadRole(evaluation, club);
      const contract = {
        clubId: destination.id,
        startDate: `${season + 1}-07-01`,
        endDate: `${season + 3}-06-30`,
        monthlySalary: evaluateExpectedMonthlySalary(evaluation, destination, role),
        signingBonus: 0,
        squadRole: role,
        contractType: 'development' as const,
      };
      const signed = { ...graduate, currentClubId: destination.id, currentContract: contract };
      footballers[graduate.profile.id] = signed;
      delta = {
        ...delta,
        squadOverrides: { ...delta.squadOverrides, [destination.id]: squad },
        footballerOverrides: { ...delta.footballerOverrides, [graduate.profile.id]: signed },
      };
      diagnostics.externalFirstContracts++;
    }
  }
  return { career: { ...career, worldDelta: delta }, diagnostics };
};
