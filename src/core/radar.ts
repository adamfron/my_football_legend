import type { PlayerAttributes } from '../types/domain';

export interface RadarAxis {
  label: string;
  value: number;
}

/** The single, presentation-independent definition of the player's macro profile. */
export const getRadarAxes = (attributes: PlayerAttributes): RadarAxis[] => [
  { label: 'Technika', value: attributes.technique },
  {
    label: 'Atak',
    value: attributes.finishing * 0.45 + attributes.technique * 0.25 + attributes.composure * 0.3,
  },
  {
    label: 'Kreacja',
    value:
      attributes.vision * 0.45 + attributes.technique * 0.25 + attributes.spatialAwareness * 0.3,
  },
  {
    label: 'Mentalność',
    value:
      attributes.composure * 0.4 +
      attributes.spatialAwareness * 0.35 +
      attributes.determination * 0.25,
  },
  {
    label: 'Charakter',
    value:
      attributes.leadership * 0.25 +
      attributes.determination * 0.3 +
      attributes.professionalism * 0.3 +
      attributes.ambition * 0.15,
  },
  { label: 'Fizyczność', value: attributes.stamina },
  { label: 'Szybkość', value: attributes.pace },
  { label: 'Obrona', value: attributes.defending * 0.7 + attributes.spatialAwareness * 0.3 },
];
