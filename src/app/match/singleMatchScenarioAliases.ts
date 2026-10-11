import type { SingleMatchSession } from '../../core/singleMatch';
import type { TacticalPlayer } from './tacticalRenderer/model';
import { deriveAppearance } from '../../core/visualIdentity';

export const createSingleMatchTacticalPlayers = (session: SingleMatchSession): TacticalPlayer[] => [
  ...session.home.players.map((player) => ({
    id: player.footballerId,
    team: 'home' as const,
    x: player.x,
    y: player.y,
    appearance: deriveAppearance(
      {
        ...player.profile,
        visualIdentity:
          session.presentation?.visualIdentities[player.footballerId] ??
          player.profile.visualIdentity,
      },
      session.presentation?.date ?? '2026-07-01',
    ),
    goalkeeper: player.profile.primaryPosition === 'goalkeeper',
    protagonist:
      session.setup.control.mode === 'player' &&
      player.footballerId === session.setup.control.footballerId,
  })),
  ...session.away.players.map((player) => ({
    id: player.footballerId,
    team: 'away' as const,
    x: 105 - player.x,
    y: 68 - player.y,
    appearance: deriveAppearance(
      {
        ...player.profile,
        visualIdentity:
          session.presentation?.visualIdentities[player.footballerId] ??
          player.profile.visualIdentity,
      },
      session.presentation?.date ?? '2026-07-01',
    ),
    goalkeeper: player.profile.primaryPosition === 'goalkeeper',
    protagonist:
      session.setup.control.mode === 'player' &&
      player.footballerId === session.setup.control.footballerId,
  })),
];

/** Maps legacy scenario roles without ever moving the protagonist to the opposing side. */
export const createSingleMatchScenarioAliases = (session: SingleMatchSession) => {
  const homeIds = session.home.players.map((player) => player.footballerId);
  const awayIds = session.away.players.map((player) => player.footballerId);
  const controlledAtHome =
    session.setup.control.mode === 'player' &&
    session.setup.control.clubId === session.home.club.id;
  const controlledId =
    session.setup.control.mode === 'player' ? session.setup.control.footballerId : undefined;
  return {
    'home-0': homeIds[0]!,
    'home-6': controlledAtHome ? controlledId! : homeIds[6]!,
    'home-8': homeIds[8]!,
    'home-9': homeIds[9]!,
    'away-0': awayIds[0]!,
    'away-6': !controlledAtHome && controlledId ? controlledId : awayIds[6]!,
    'away-9': awayIds[9]!,
  };
};
