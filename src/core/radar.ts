import type { Player, PlayerAttributes } from '../types/domain';
export interface RadarAxis {
  label: string;
  value: number;
}
const avg = (...v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const height = (cm: number) => Math.max(1, Math.min(100, (cm - 150) * 1.6));
export const getOutfieldRadarAxes = (a: PlayerAttributes, heightCm = 180): RadarAxis[] => [
  {
    label: 'Defensywa',
    value: avg(a.tackling, a.gameReading, a.concentration, (a.strength + a.aggression) / 2),
  },
  { label: 'Fizyczne', value: avg(a.strength, a.stamina, a.agility, a.jumping) },
  { label: 'Szybkość', value: a.pace * 0.75 + a.agility * 0.25 },
  { label: 'Czytanie gry', value: a.gameReading },
  {
    label: 'Ofensywa',
    value: avg(a.finishing, a.dribbling, a.gameReading, a.composure, a.firstTouch),
  },
  { label: 'Techniczne', value: avg(a.technique, a.firstTouch, a.passing, a.dribbling) },
  { label: 'Górne piłki', value: avg(a.heading, a.jumping, a.strength, height(heightCm)) },
  { label: 'Psychiczne', value: avg(a.composure, a.concentration, a.determination, a.leadership) },
];
export const getGoalkeeperRadarAxes = (a: PlayerAttributes, heightCm = 190): RadarAxis[] => [
  {
    label: 'Obrona strzałów',
    value: avg(a.reflexes, a.handling, a.oneOnOnes, a.composure, a.concentration, a.agility),
  },
  { label: 'Fizyczne', value: avg(a.strength, a.stamina, a.agility, a.jumping) },
  { label: 'Szybkość', value: a.pace * 0.75 + a.agility * 0.25 },
  {
    label: 'Gra na przedpolu',
    value: avg(a.goalkeeperSweeping, a.pace, a.gameReading, a.oneOnOnes),
  },
  { label: 'Komunikacja', value: avg(a.leadership, a.gameReading, a.composure) },
  { label: 'Wyprowadzanie', value: avg(a.passing, a.technique, a.firstTouch, a.gameReading) },
  {
    label: 'Górne piłki',
    value: avg(a.handling, a.goalkeeperSweeping, a.jumping, height(heightCm), a.strength),
  },
  {
    label: 'Psychiczne',
    value: avg(a.composure, a.concentration, a.determination, a.leadership, a.gameReading),
  },
];
export const getPlayerRadarAxes = (p: Player) =>
  p.primaryPosition === 'goalkeeper'
    ? getGoalkeeperRadarAxes(p.attributes, p.heightCm)
    : getOutfieldRadarAxes(p.attributes, p.heightCm);
export const getRadarAxes = getOutfieldRadarAxes;
