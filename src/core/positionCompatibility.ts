import type { PlayerPosition } from '../types/domain';

/** The one normal-generation adjacency graph. Goalkeeper is deliberately isolated. */
export const POSITION_COMPATIBILITY: Readonly<Record<PlayerPosition, readonly PlayerPosition[]>> = {
  goalkeeper: [],
  center_back: ['central_midfielder'],
  left_back: ['left_winger', 'right_back'],
  right_back: ['right_winger', 'left_back'],
  central_midfielder: ['center_back', 'striker', 'left_winger', 'right_winger'],
  left_winger: ['right_winger', 'central_midfielder', 'left_back'],
  right_winger: ['left_winger', 'central_midfielder', 'right_back'],
  striker: ['central_midfielder'],
};

export const arePositionsCompatible = (primary: PlayerPosition, secondary: PlayerPosition) =>
  POSITION_COMPATIBILITY[primary].includes(secondary) ||
  POSITION_COMPATIBILITY[secondary].includes(primary);

export const POSITION_MASTERY_THRESHOLD = 0.75;
export const ADJACENT_SELECTION_THRESHOLD = 0.2;
export type PositionRelationship =
  | 'natural'
  | 'mastered'
  | 'adjacent'
  | 'unrelated'
  | 'specialist_forbidden';

/** Canonical relationship used by selection, competition, learning and squad planning. */
export const getPositionRelationship = (
  player: Pick<
    import('../types/domain').FootballerProfile,
    'primaryPosition' | 'positionFamiliarity'
  >,
  position: PlayerPosition,
): PositionRelationship => {
  if (player.primaryPosition === position) return 'natural';
  if ((player.primaryPosition === 'goalkeeper') !== (position === 'goalkeeper'))
    return 'specialist_forbidden';
  if ((player.positionFamiliarity[position] ?? 0) >= POSITION_MASTERY_THRESHOLD) return 'mastered';
  return arePositionsCompatible(player.primaryPosition, position) ? 'adjacent' : 'unrelated';
};

export const isNormallyEligibleForPosition = (
  player: Pick<
    import('../types/domain').FootballerProfile,
    'primaryPosition' | 'positionFamiliarity'
  >,
  position: PlayerPosition,
) => {
  const relationship = getPositionRelationship(player, position);
  return (
    relationship === 'natural' ||
    relationship === 'mastered' ||
    (relationship === 'adjacent' &&
      (player.positionFamiliarity[position] ?? 0) >= ADJACENT_SELECTION_THRESHOLD)
  );
};
