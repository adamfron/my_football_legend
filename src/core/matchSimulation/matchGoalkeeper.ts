import type { MatchPlayerState, TacticalMatchState } from './matchState';

/** A temporary appointment changes match responsibility, never a footballer's real profile. */
export const isMatchGoalkeeper = (
  player: Pick<MatchPlayerState, 'profile'> & Partial<Pick<MatchPlayerState, 'goalkeeperRole'>>,
): boolean => player.goalkeeperRole ?? player.profile.primaryPosition === 'goalkeeper';

/** The referee accepts an emergency goalkeeper during a lawful interruption. Bodies retain
 * their actual locations and attributes and move through the ordinary goalkeeper mechanisms. */
export const ensureMatchGoalkeepers = (input: TacticalMatchState): TacticalMatchState => {
  let state = input;
  for (const team of ['home', 'away'] as const) {
    const players = state.players.filter((player) => player.team === team);
    const named = players.find((player) => player.profile.primaryPosition === 'goalkeeper');
    const assigned = players.find(isMatchGoalkeeper);
    const keeper =
      named ??
      assigned ??
      players
        .slice()
        .sort(
          (a, b) =>
            b.profile.attributes.handling +
              b.profile.attributes.reflexes +
              b.profile.attributes.positioning -
              (a.profile.attributes.handling +
                a.profile.attributes.reflexes +
                a.profile.attributes.positioning) || a.id.localeCompare(b.id),
        )[0];
    if (!keeper) continue;
    if (
      (!named && assigned) ||
      (named && !players.some((player) => player.id !== named.id && player.goalkeeperRole))
    )
      continue;
    state = {
      ...state,
      players: state.players.map((player) => {
        if (player.team !== team) return player;
        if (player.id === keeper.id && !named) return { ...player, goalkeeperRole: true };
        if (player.goalkeeperRole !== undefined) {
          const { goalkeeperRole: _previous, ...ordinary } = player;
          void _previous;
          return ordinary;
        }
        return player;
      }),
    };
  }
  return state;
};
