import { youthTeamDefinitionSchema } from '../../schemas/domainSchemas';
import type { ProfessionalClub, YouthTeamDefinition } from '../../types/domain';

const definitions = [
  {
    id: 'club_vistula_nova',
    independentName: 'Vistula Nova',
    independentQuality: 45,
    coachId: 'coach_vistula_nova',
  },
  ...[0, 3, 5, 9, 15, 20, 27, 34, 42, 51, 60].map((clubIndex) => ({
    id: `u17_pro_${clubIndex}`,
    parentClubId: `pro_${clubIndex}`,
    coachId: `coach_u17_pro_${clubIndex}`,
  })),
] satisfies YouthTeamDefinition[];

const parsedDefinitions = definitions.map(
  (definition) => youthTeamDefinitionSchema.parse(definition) as YouthTeamDefinition,
);

export const POLISH_U17_STARTING_SEASON = 2026;
export const getYouthCohortKey = (teamId: string, season: number) => `u17:${teamId}:${season}`;

export const getPolishU17TeamDefinitions = (clubs: readonly ProfessionalClub[]) => {
  const clubIds = new Set(clubs.map((club) => club.id));
  return parsedDefinitions.map((parsed) => {
    if (parsed.parentClubId && !clubIds.has(parsed.parentClubId))
      throw new Error(`Brak klubu macierzystego ${parsed.parentClubId} dla ${parsed.id}.`);
    return parsed;
  });
};

export const getYouthTeamDisplayName = (team: YouthTeamDefinition, parent?: ProfessionalClub) =>
  team.independentName ?? `${parent?.name ?? team.parentClubId} U-17`;
