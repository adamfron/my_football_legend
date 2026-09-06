import type { SingleMatchSession } from '../../core/singleMatch';
import type { TacticalPlayer } from './tacticalRenderer/model';

export const createSingleMatchTacticalPlayers = (session: SingleMatchSession): TacticalPlayer[] => [
  ...session.home.players.map((player) => ({
    id: player.footballerId,
    team: 'home' as const,
    x: player.x,
    y: player.y,
    goalkeeper: player.profile.primaryPosition === 'goalkeeper',
    protagonist: player.footballerId === session.setup.controlledFootballerId,
  })),
  ...session.away.players.map((player) => ({
    id: player.footballerId,
    team: 'away' as const,
    x: 105 - player.x,
    y: 68 - player.y,
    goalkeeper: player.profile.primaryPosition === 'goalkeeper',
    protagonist: player.footballerId === session.setup.controlledFootballerId,
  })),
];

/** Maps legacy scenario roles without ever moving the protagonist to the opposing side. */
export const createSingleMatchScenarioAliases = (session: SingleMatchSession) => {
  const homeIds = session.home.players.map((player) => player.footballerId);
  const awayIds = session.away.players.map((player) => player.footballerId);
  const controlledAtHome = session.setup.controlledClubId === session.home.club.id;
  return {
    'home-0': homeIds[0]!,
    'home-6': controlledAtHome ? session.setup.controlledFootballerId : homeIds[6]!,
    'home-8': homeIds[8]!,
    'home-9': homeIds[9]!,
    'away-0': awayIds[0]!,
    'away-6': controlledAtHome ? awayIds[6]! : session.setup.controlledFootballerId,
    'away-9': awayIds[9]!,
  };
};
