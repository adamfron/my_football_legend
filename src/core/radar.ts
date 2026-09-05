import type { Player, PlayerAttributes } from '../types/domain';

export interface RadarAxis {
  label: string;
  value: number;
}

export type RadarGroupMap = Readonly<Record<string, readonly (keyof PlayerAttributes)[]>>;

/** Presentation-only canonical mapping. A raw attribute occurs in at most one axis. */
export const OUTFIELD_RADAR_GROUPS = {
  Defensywa: ['tackling', 'concentration', 'positioning'],
  Fizyczne: ['stamina', 'strength', 'agility'],
  Szybkość: ['pace'],
  'Czytanie gry': ['passing', 'gameReading'],
  Ofensywa: ['finishing', 'composure'],
  Techniczne: ['technique', 'firstTouch', 'dribbling'],
  'Górne piłki': ['heading', 'jumping'],
  Psychiczne: ['leadership', 'determination', 'aggression'],
} as const satisfies RadarGroupMap;

export const GOALKEEPER_RADAR_GROUPS = {
  'Obrona strzałów': ['reflexes', 'handling', 'oneOnOnes'],
  Fizyczne: ['stamina', 'strength', 'agility'],
  Szybkość: ['pace'],
  'Gra na przedpolu': ['goalkeeperSweeping', 'firstTouch', 'technique'],
  Komunikacja: ['gameReading', 'leadership'],
  Wyprowadzanie: ['passing', 'goalkeeperKicking', 'goalkeeperThrowing'],
  'Górne piłki': ['jumping'],
  Psychiczne: ['composure', 'concentration', 'determination', 'aggression'],
} as const satisfies RadarGroupMap;

const axes = (attributes: PlayerAttributes, groups: RadarGroupMap): RadarAxis[] =>
  Object.entries(groups).map(([label, keys]) => ({
    label,
    value: keys.reduce((sum, key) => sum + attributes[key], 0) / keys.length,
  }));

// heightCm is retained as a compatibility argument, but body dimensions never enter skill radar.
export const getOutfieldRadarAxes = (attributes: PlayerAttributes, heightCm?: number) => {
  void heightCm;
  return axes(attributes, OUTFIELD_RADAR_GROUPS);
};
export const getGoalkeeperRadarAxes = (attributes: PlayerAttributes, heightCm?: number) => {
  void heightCm;
  return axes(attributes, GOALKEEPER_RADAR_GROUPS);
};
export const getPlayerRadarAxes = (player: Player) =>
  player.primaryPosition === 'goalkeeper'
    ? getGoalkeeperRadarAxes(player.attributes)
    : getOutfieldRadarAxes(player.attributes);
export const getRadarAxes = getOutfieldRadarAxes;
