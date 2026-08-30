import type { FootballerProfile, PlayerAttributes, PlayerPosition } from '../types/domain';

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
export const OVR_ATTRIBUTE_KEYS = [
  'technique',
  'firstTouch',
  'passing',
  'dribbling',
  'finishing',
  'tackling',
  'heading',
  'setPieces',
  'gameReading',
  'composure',
  'concentration',
  'leadership',
  'determination',
  'aggression',
  'pace',
  'stamina',
  'strength',
  'agility',
  'jumping',
  'ambition',
  'professionalism',
  'reflexes',
  'handling',
  'oneOnOnes',
  'goalkeeperSweeping',
] as const satisfies readonly (keyof PlayerAttributes)[];
type W = Partial<Record<keyof PlayerAttributes, number>>;
const shared = (entries: W): W => entries;
const flank = shared({
  technique: 2,
  firstTouch: 2,
  passing: 2,
  dribbling: 2,
  tackling: 3,
  heading: 1,
  setPieces: 1,
  gameReading: 2,
  composure: 1,
  concentration: 2,
  pace: 3,
  stamina: 3,
  strength: 2,
  agility: 2,
  jumping: 1,
});
const wing = shared({
  technique: 3,
  firstTouch: 3,
  passing: 2,
  dribbling: 3,
  finishing: 2,
  tackling: 1,
  heading: 1,
  setPieces: 1,
  gameReading: 2,
  composure: 2,
  concentration: 1,
  pace: 3,
  stamina: 2,
  strength: 1,
  agility: 3,
  jumping: 1,
});
export const POSITION_OVR_WEIGHTS: Record<PlayerPosition, W> = {
  striker: {
    technique: 2,
    firstTouch: 2,
    passing: 2,
    dribbling: 2,
    finishing: 3,
    heading: 2,
    setPieces: 1,
    gameReading: 2,
    composure: 3,
    concentration: 1,
    pace: 2,
    stamina: 2,
    strength: 2,
    agility: 2,
    jumping: 2,
  },
  left_winger: wing,
  right_winger: wing,
  attacking_midfielder: {
    technique: 3,
    firstTouch: 3,
    passing: 3,
    dribbling: 2,
    finishing: 2,
    tackling: 1,
    heading: 1,
    setPieces: 1,
    gameReading: 3,
    composure: 2,
    concentration: 2,
    leadership: 1,
    pace: 2,
    stamina: 2,
    strength: 1,
    agility: 2,
    jumping: 1,
  },
  defensive_midfielder: {
    technique: 2,
    firstTouch: 2,
    passing: 3,
    dribbling: 1,
    tackling: 3,
    heading: 1,
    setPieces: 1,
    gameReading: 3,
    composure: 2,
    concentration: 2,
    leadership: 1,
    pace: 1,
    stamina: 3,
    strength: 2,
    agility: 1,
    jumping: 1,
  },
  left_back: flank,
  right_back: flank,
  center_back: {
    technique: 1,
    firstTouch: 1,
    passing: 2,
    dribbling: 1,
    tackling: 3,
    heading: 3,
    gameReading: 3,
    composure: 2,
    concentration: 3,
    leadership: 1,
    pace: 2,
    stamina: 2,
    strength: 3,
    agility: 1,
    jumping: 3,
  },
  goalkeeper: {
    technique: 1,
    firstTouch: 1,
    passing: 1,
    gameReading: 3,
    composure: 3,
    concentration: 3,
    leadership: 1,
    pace: 1,
    stamina: 1,
    strength: 2,
    agility: 2,
    jumping: 2,
    reflexes: 3,
    handling: 3,
    oneOnOnes: 3,
    goalkeeperSweeping: 3,
  },
};
const clamp = (n: number) => Math.max(1, Math.min(100, Math.round(n)));
export const getTheoreticalPositionOverall = (
  player: FootballerProfile,
  position: PlayerPosition,
): number => {
  const w = POSITION_OVR_WEIGHTS[position];
  let sum = 0,
    total = 0;
  for (const [key, weight] of Object.entries(w)) {
    sum += player.attributes[key as keyof PlayerAttributes] * (weight ?? 0);
    total += weight ?? 0;
  }
  return clamp(sum / total);
};
export const getPositionFamiliarityModifier = (
  player: FootballerProfile,
  position: PlayerPosition,
): number => {
  const fromGk = player.primaryPosition === 'goalkeeper';
  const toGk = position === 'goalkeeper';
  if (fromGk !== toGk) return 0.6;
  const familiarity = player.positionFamiliarity[position] ?? 0;
  return familiarity >= 1
    ? 1
    : familiarity >= 0.8
      ? 0.98
      : familiarity >= 0.6
        ? 0.95
        : familiarity >= 0.3
          ? 0.92
          : 0.88;
};
export const getEffectivePositionOverall = (
  player: FootballerProfile,
  position: PlayerPosition,
): number =>
  clamp(
    getTheoreticalPositionOverall(player, position) *
      getPositionFamiliarityModifier(player, position),
  );
export const getPlayerOverall = (
  player: FootballerProfile,
  position: PlayerPosition | string,
): number =>
  getEffectivePositionOverall(
    player,
    (PLAYER_POSITIONS.includes(position as PlayerPosition)
      ? position
      : player.primaryPosition) as PlayerPosition,
  );
