import {
  getPolishU17TeamDefinitions,
  getYouthCohortKey,
  getYouthTeamDisplayName,
  POLISH_U17_STARTING_SEASON,
} from '../content/world/polishU17';
import type {
  CareerState,
  Id,
  LeagueClubProfile,
  PlayerPosition,
  ProfessionalClub,
  WorldFootballer,
} from '../types/domain';
import {
  deriveSquadHierarchy,
  getManagerPreferredFormation,
  type SquadSelectionContext,
} from './footballerWorld';
import { resolveClubManagerId } from './coachProfiles';
import { RandomGenerator } from './random/RandomGenerator';
import { resolveEffectiveProfessionalClub, resolveYouthCohort } from './worldDatabase';
import { deriveYouthTeamQuality, generateYouthFootballer } from './youthTalent';

export { deriveYouthTeamQuality } from './youthTalent';

export const YOUTH_COHORT_TARGET_POSITIONS: readonly PlayerPosition[] = [
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
  'striker',
];

export const populatePolishU17World = (clubs: readonly ProfessionalClub[], seed: string) => {
  const footballers: Record<Id, WorldFootballer> = {};
  const youthCohorts: Record<string, Id[]> = {};
  const clubsById = new Map(clubs.map((club) => [club.id, club]));
  const teams = getPolishU17TeamDefinitions(clubs);
  for (const team of teams) {
    const parent = team.parentClubId ? clubsById.get(team.parentClubId) : undefined;
    const baseline = parent ? deriveYouthTeamQuality(parent) : team.independentQuality!;
    const cohortKey = getYouthCohortKey(team.id, POLISH_U17_STARTING_SEASON);
    youthCohorts[cohortKey] = YOUTH_COHORT_TARGET_POSITIONS.map((primaryPosition, index) => {
      const id = `footballer_${team.id}_2026_${index}`;
      const rng = RandomGenerator.fromSeed(`${seed}:${id}:youth`);
      const ageRoll = rng.int(1, 100);
      const age = ageRoll <= 72 ? 16 : ageRoll <= 86 ? 15 : 17;
      const footballer = generateYouthFootballer({
        id,
        seed: `${seed}:youth`,
        age,
        primaryPosition,
        academyQuality: baseline,
      });
      footballers[id] = footballer;
      return id;
    });
  }
  return { teams, footballers, youthCohorts };
};

export const getYouthSquadSelectionContext = (
  career: Pick<
    CareerState,
    'careerSeasonNumber' | 'player' | 'clubWorld' | 'youthCohorts' | 'worldDelta'
  >,
  teamId: Id,
  season = POLISH_U17_STARTING_SEASON,
): SquadSelectionContext | undefined => {
  const team = getPolishU17TeamDefinitions(career.clubWorld ?? []).find(
    (item) => item.id === teamId,
  );
  const cohort = resolveYouthCohort(career, getYouthCohortKey(teamId, season));
  if (!team || !cohort) return undefined;
  const protagonistOverlay =
    teamId === 'club_vistula_nova' && career.careerSeasonNumber === 1 ? [career.player.id] : [];
  return {
    id: team.id,
    managerId: team.coachId,
    squadPlayerIds: [...new Set([...cohort, ...protagonistOverlay])],
  };
};

export const getCurrentSquadSelectionContext = (
  career: CareerState,
): SquadSelectionContext | undefined =>
  career.currentProfessionalClub
    ? {
        ...(resolveEffectiveProfessionalClub(career, career.currentProfessionalClub.id) ??
          career.currentProfessionalClub),
        managerId:
          resolveClubManagerId(career, career.currentProfessionalClub.id) ??
          career.currentProfessionalClub.managerId,
      }
    : getYouthSquadSelectionContext(career, career.currentClub.id, career.currentSeason);

/** One-time deterministic league projection; the generated cards remain the source of truth. */
export const createPolishU17LeagueProfiles = (career: CareerState): LeagueClubProfile[] => {
  const clubs = career.clubWorld ?? [];
  const clubsById = new Map(clubs.map((club) => [club.id, club]));
  return getPolishU17TeamDefinitions(clubs).map((team) => {
    const context = getYouthSquadSelectionContext(career, team.id);
    if (!context) throw new Error(`Brak kohorty U-17 dla ${team.id}.`);
    const hierarchy = deriveSquadHierarchy(
      career,
      context,
      getManagerPreferredFormation(context.managerId),
    );
    const average = (items: typeof hierarchy.preferredXI) =>
      Math.round(items.reduce((sum, item) => sum + item.effectiveOverall, 0) / items.length);
    const attacking = hierarchy.preferredXI.filter((item) =>
      ['attacking_midfielder', 'left_winger', 'right_winger', 'striker'].includes(item.position),
    );
    const defensive = hierarchy.preferredXI.filter((item) =>
      ['goalkeeper', 'left_back', 'right_back', 'center_back', 'defensive_midfielder'].includes(
        item.position,
      ),
    );
    return {
      clubId: team.id,
      name: getYouthTeamDisplayName(
        team,
        team.parentClubId ? clubsById.get(team.parentClubId) : undefined,
      ),
      strength: average(hierarchy.preferredXI),
      attackStrength: average(attacking),
      defenseStrength: average(defensive),
      form: 0,
    };
  });
};
