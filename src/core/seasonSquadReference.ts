import type { CareerState, FootballerProfile, Id } from '../types/domain';
import { getPlayerOverall } from './playerOverall';
import { resolveFootballer } from './footballerWorld';
import { resolveEffectiveSeniorSquad } from './worldDatabase';
import { getCurrentSquadSelectionContext } from './youthWorld';

/** Captures past nominal OVR facts. Assigned-position OVR deliberately does not enter this map. */
export const createSeasonSquadOverallBaseline = (career: CareerState): Record<Id, number> => {
  const ids = new Set(
    career.currentProfessionalClub
      ? resolveEffectiveSeniorSquad(career, career.currentProfessionalClub.id)
      : (getCurrentSquadSelectionContext(career)?.squadPlayerIds ?? [career.player.id]),
  );
  ids.add(career.player.id);
  return Object.fromEntries(
    [...ids].flatMap((id) => {
      const player: FootballerProfile | undefined = resolveFootballer(career, id);
      return player ? [[id, getPlayerOverall(player, player.primaryPosition)]] : [];
    }),
  );
};

export const getSeasonOverallDelta = (career: CareerState, player: FootballerProfile) =>
  getPlayerOverall(player, player.primaryPosition) -
  (career.seasonBaselineOverall?.[player.id] ?? getPlayerOverall(player, player.primaryPosition));

/** Membership is a spell fact, not a contract fact (renewals therefore never count). */
export const getClubJoinedDate = (career: CareerState, playerId: Id, clubId: Id) => {
  if (playerId === career.player.id) {
    const fact = [...career.historyFacts]
      .reverse()
      .find(
        (item) =>
          ['club_joined', 'joined_professional_club'].includes(item.factType) &&
          item.clubs.includes(clubId),
      );
    return fact?.date;
  }
  return [...(career.worldDelta?.npcTransferRecords ?? [])]
    .reverse()
    .find((record) => record.playerId === playerId && record.toClubId === clubId)?.date;
};

export const joinedClubThisSeason = (career: CareerState, playerId: Id, clubId: Id) => {
  const date = getClubJoinedDate(career, playerId, clubId);
  return Boolean(
    date && date >= `${career.currentSeason}-07-01` && date <= `${career.currentSeason + 1}-06-30`,
  );
};
