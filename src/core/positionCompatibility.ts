import type { PlayerPosition } from '../types/domain';

/** The one normal-generation adjacency graph. Goalkeeper is deliberately isolated. */
export const POSITION_COMPATIBILITY: Readonly<Record<PlayerPosition, readonly PlayerPosition[]>> = {
  goalkeeper: [],
  center_back: ['defensive_midfielder'],
  left_back: ['left_winger', 'right_back'],
  right_back: ['right_winger', 'left_back'],
  defensive_midfielder: ['center_back', 'attacking_midfielder'],
  attacking_midfielder: ['defensive_midfielder', 'striker', 'left_winger', 'right_winger'],
  left_winger: ['right_winger', 'attacking_midfielder', 'left_back'],
  right_winger: ['left_winger', 'attacking_midfielder', 'right_back'],
  striker: ['attacking_midfielder'],
};

export const arePositionsCompatible = (primary: PlayerPosition, secondary: PlayerPosition) =>
  POSITION_COMPATIBILITY[primary].includes(secondary);
