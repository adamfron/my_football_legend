import type { FootballerProfile, PlayerAttributes, PlayerPosition } from '../types/domain';
import { getPositionRelationship } from './positionCompatibility';
import { GOALKEEPER_RADAR_GROUPS, OUTFIELD_RADAR_GROUPS } from './radar';

export const PLAYER_POSITIONS = [
  'goalkeeper',
  'center_back',
  'left_back',
  'right_back',
  'defensive_midfielder',
  'attacking_midfielder',
  'left_winger',
  'right_winger',
  'striker',
] as const satisfies readonly PlayerPosition[];
export const OVR_ATTRIBUTE_KEYS = Object.keys({
  ...Object.fromEntries(
    Object.values(OUTFIELD_RADAR_GROUPS)
      .flat()
      .map((key) => [key, true]),
  ),
  ...Object.fromEntries(
    Object.values(GOALKEEPER_RADAR_GROUPS)
      .flat()
      .map((key) => [key, true]),
  ),
  setPieces: true,
  ambition: true,
  professionalism: true,
}) as (keyof PlayerAttributes)[];

export type OutfieldOvrGroup =
  | 'defense'
  | 'physical'
  | 'speed'
  | 'reading'
  | 'offense'
  | 'technical'
  | 'aerial'
  | 'mental';
const OUTFIELD_KEYS: Record<OutfieldOvrGroup, readonly (keyof PlayerAttributes)[]> = {
  defense: OUTFIELD_RADAR_GROUPS.Defensywa,
  physical: OUTFIELD_RADAR_GROUPS.Fizyczne,
  speed: OUTFIELD_RADAR_GROUPS.Szybkość,
  reading: OUTFIELD_RADAR_GROUPS['Czytanie gry'],
  offense: OUTFIELD_RADAR_GROUPS.Ofensywa,
  technical: OUTFIELD_RADAR_GROUPS.Techniczne,
  aerial: OUTFIELD_RADAR_GROUPS['Górne piłki'],
  mental: OUTFIELD_RADAR_GROUPS.Psychiczne,
};
type GroupWeights = Record<OutfieldOvrGroup, number>;
const g = (v: readonly number[]) =>
  Object.fromEntries(Object.keys(OUTFIELD_KEYS).map((key, i) => [key, v[i]])) as GroupWeights;
export const POSITION_OVR_GROUP_WEIGHTS: Record<
  Exclude<PlayerPosition, 'goalkeeper'>,
  GroupWeights
> = {
  center_back: g([5, 3, 2, 4, 0, 1, 5, 3]),
  left_back: g([3, 3, 5, 3, 1, 3, 2, 2]),
  right_back: g([3, 3, 5, 3, 1, 3, 2, 2]),
  defensive_midfielder: g([4, 3, 2, 5, 1, 3, 2, 3]),
  attacking_midfielder: g([1, 2, 3, 5, 4, 5, 1, 3]),
  left_winger: g([1, 2, 5, 3, 4, 5, 1, 2]),
  right_winger: g([1, 2, 5, 3, 4, 5, 1, 2]),
  striker: g([0, 3, 4, 2, 5, 3, 4, 3]),
};
export const GOALKEEPER_OVR_GROUP_WEIGHTS = [6, 2, 1, 3, 2, 3, 2, 3] as const;
/** Expanded weights are diagnostic compatibility only; calculation remains group-normalized. */
export const POSITION_OVR_WEIGHTS = Object.fromEntries(
  PLAYER_POSITIONS.map((position) => [position, {}]),
) as Record<PlayerPosition, Partial<Record<keyof PlayerAttributes, number>>>;
const average = (a: PlayerAttributes, keys: readonly (keyof PlayerAttributes)[]) =>
  keys.reduce((s, k) => s + a[k], 0) / keys.length;
const clamp = (n: number) => Math.max(1, Math.min(100, Math.round(n)));
export const getTheoreticalPositionOverall = (
  player: FootballerProfile,
  position: PlayerPosition,
) => {
  const a = player.attributes;
  if (position === 'goalkeeper') {
    const values = Object.values(GOALKEEPER_RADAR_GROUPS).map((keys) => average(a, keys));
    return clamp(
      values.reduce((s, v, i) => s + v * GOALKEEPER_OVR_GROUP_WEIGHTS[i]!, 0) /
        GOALKEEPER_OVR_GROUP_WEIGHTS.reduce((s, v) => s + v, 0),
    );
  }
  const weights = POSITION_OVR_GROUP_WEIGHTS[position];
  let sum = 0,
    total = 0;
  for (const key of Object.keys(OUTFIELD_KEYS) as OutfieldOvrGroup[]) {
    sum += average(a, OUTFIELD_KEYS[key]) * weights[key];
    total += weights[key];
  }
  const specialist =
    position === 'attacking_midfielder' ||
    position === 'left_winger' ||
    position === 'right_winger' ||
    position === 'striker'
      ? a.setPieces * 0.35
      : 0;
  return clamp((sum + specialist) / (total + (specialist ? 0.35 : 0)));
};
export const getPositionFamiliarityModifier = (
  player: FootballerProfile,
  position: PlayerPosition,
) => {
  const relationship = getPositionRelationship(player, position);
  if (relationship === 'specialist_forbidden' || relationship === 'unrelated') return 0.65;
  const familiarity = player.positionFamiliarity[position] ?? 0;
  return familiarity >= 1
    ? 1
    : familiarity >= 0.8
      ? 0.98
      : familiarity >= 0.6
        ? 0.96
        : familiarity >= 0.3
          ? 0.9
          : 0.84;
};
export const getEffectivePositionOverall = (player: FootballerProfile, position: PlayerPosition) =>
  clamp(
    getTheoreticalPositionOverall(player, position) *
      getPositionFamiliarityModifier(player, position),
  );
export const getPlayerOverall = (player: FootballerProfile, position: PlayerPosition | string) =>
  getEffectivePositionOverall(
    player,
    PLAYER_POSITIONS.includes(position as PlayerPosition)
      ? (position as PlayerPosition)
      : player.primaryPosition,
  );
