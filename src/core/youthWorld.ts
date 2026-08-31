import {
  getPolishU17TeamDefinitions,
  getYouthCohortKey,
  POLISH_U17_STARTING_SEASON,
} from '../content/world/polishU17';
import type { Id, PlayerPosition, ProfessionalClub, WorldFootballer } from '../types/domain';
import { generateCanonicalFootballerProfile } from './footballerWorld';
import { generateDevelopmentProfile } from './playerCreator';
import { RandomGenerator } from './random/RandomGenerator';

const clamp = (value: number) => Math.max(30, Math.min(65, Math.round(value)));

/** Academy signals dominate deliberately; senior strength contributes only five percent. */
export const deriveYouthTeamQuality = (club: ProfessionalClub): number =>
  clamp(
    club.developmentReputation * 0.38 +
      club.youthPolicy * 0.27 +
      (club.infrastructure?.coachingQuality ?? 50) * 0.16 +
      (club.infrastructure?.trainingFacilities ?? 50) * 0.14 +
      (club.strengthRating ?? 50) * 0.05,
  );

const squadPositions: readonly PlayerPosition[] = [
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
    youthCohorts[cohortKey] = squadPositions.map((primaryPosition, index) => {
      const id = `footballer_${team.id}_2026_${index}`;
      const rng = RandomGenerator.fromSeed(`${seed}:${id}:youth`);
      const ageRoll = rng.int(1, 100);
      const age = ageRoll <= 72 ? 16 : ageRoll <= 86 ? 15 : 17;
      const targetOverall = clamp(baseline + rng.int(-10, 10) + (index % 6 === 0 ? 3 : 0));
      const profile = generateCanonicalFootballerProfile({
        id,
        seed: `${seed}:youth`,
        age,
        targetOverall,
        primaryPosition,
      });
      footballers[id] = {
        profile,
        developmentProfile: generateDevelopmentProfile(
          RandomGenerator.fromSeed(`${seed}:${id}:development`),
        ),
        careerStatus: 'active',
        reputation: Math.max(1, targetOverall - 30),
        fitness: rng.int(78, 100),
      };
      return id;
    });
  }
  return { teams, footballers, youthCohorts };
};
