import type { CareerState, PlayerPosition, ProfessionalClub } from '../types/domain';
import { getCareerClubStrength } from './clubStrength';
import { getManagerPreferredFormation, selectBestXI } from './footballerWorld';
import { getPlayerOverall } from './playerOverall';
import {
  createCareerWorldFootballerResolver,
  resolveEffectiveProfessionalClub,
} from './worldDatabase';

export interface ClubQualityDiagnostic {
  clubId: string;
  strength: number;
  strongestSlot: { position: PlayerPosition; overall: number };
  weakestSlot: { position: PlayerPosition; overall: number };
  weakestGap: number;
  formation: string;
  preferredFormationFeasible: boolean;
}

export const getClubQualityDiagnostic = (
  career: CareerState,
  club: ProfessionalClub,
): ClubQualityDiagnostic | undefined => {
  const effective = resolveEffectiveProfessionalClub(career, club.id) ?? club;
  const preferred = getManagerPreferredFormation(effective.managerId);
  const xi = selectBestXI(career, effective, preferred);
  if (xi.assignments.length !== 11) return undefined;
  const ordered = [...xi.assignments].sort(
    (a, b) => a.effectiveOverall - b.effectiveOverall || a.position.localeCompare(b.position),
  );
  const strength = getCareerClubStrength(career, effective);
  return {
    clubId: club.id,
    strength,
    weakestSlot: { position: ordered[0]!.position, overall: ordered[0]!.effectiveOverall },
    strongestSlot: {
      position: ordered.at(-1)!.position,
      overall: ordered.at(-1)!.effectiveOverall,
    },
    weakestGap: ordered[0]!.effectiveOverall - strength,
    formation: xi.formation,
    preferredFormationFeasible: xi.formation === preferred,
  };
};

export interface WorldBrowserRow {
  id: string;
  name: string;
  age: number;
  clubId: string;
  clubName: string;
  leagueTier: number;
  position: PlayerPosition;
  overall: number;
}

export const buildWorldBrowserRows = (career: CareerState): WorldBrowserRow[] => {
  const resolve = createCareerWorldFootballerResolver(career, { cache: true });
  return (career.clubWorld ?? [])
    .flatMap((club) => {
      const effective = resolveEffectiveProfessionalClub(career, club.id) ?? club;
      return (effective.squadPlayerIds ?? [])
        .map((id) => (id === career.player.id ? career.player : resolve(id)?.profile))
        .filter((player): player is CareerState['player'] => Boolean(player))
        .map((player) => ({
          id: player.id,
          name: `${player.firstName} ${player.lastName}`,
          age: player.age,
          clubId: club.id,
          clubName: club.name,
          leagueTier: club.leagueTier,
          position: player.primaryPosition,
          overall: getPlayerOverall(player, player.primaryPosition),
        }));
    })
    .sort(
      (a, b) =>
        b.overall - a.overall ||
        a.age - b.age ||
        a.name.localeCompare(b.name, 'pl') ||
        a.id.localeCompare(b.id),
    );
};
