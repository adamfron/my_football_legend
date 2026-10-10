import type { MatchPlayerState, TacticalMatchState } from './matchState';

/** Resolve the identity behind an already released action, including an actor who has left.
 * This history lookup does not grant the actor active physical participation. */
export const findMatchParticipant = (
  state: TacticalMatchState,
  playerId: string,
): MatchPlayerState | undefined =>
  state.players.find((player) => player.id === playerId) ??
  state.departedPlayers?.find((player) => player.id === playerId) ??
  state.substitutionState?.pending.find((request) => request.outgoing.id === playerId)?.outgoing;
