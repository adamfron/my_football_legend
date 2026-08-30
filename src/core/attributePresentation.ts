import type { PlayerAttributes } from '../types/domain';

export const ATTRIBUTE_GROUPS = ['technical', 'mental', 'physical', 'goalkeeper'] as const;
export type AttributeGroup = (typeof ATTRIBUTE_GROUPS)[number];
export type DevelopmentFamily = AttributeGroup;

const groupLabels: Record<AttributeGroup, string> = {
  technical: 'TECHNICZNE',
  mental: 'PSYCHICZNE',
  physical: 'FIZYCZNE',
  goalkeeper: 'BRAMKARSKIE',
};
const rows = [
  ['technique', 'Technika', 'technical'],
  ['firstTouch', 'Przyjęcie', 'technical'],
  ['passing', 'Podania', 'technical'],
  ['dribbling', 'Drybling', 'technical'],
  ['finishing', 'Wykończenie', 'technical'],
  ['tackling', 'Odbiór', 'technical'],
  ['heading', 'Gra głową', 'technical'],
  ['setPieces', 'Stałe fragmenty', 'technical'],
  ['gameReading', 'Czytanie gry', 'mental'],
  ['composure', 'Opanowanie', 'mental'],
  ['concentration', 'Koncentracja', 'mental'],
  ['leadership', 'Przywództwo', 'mental'],
  ['determination', 'Determinacja', 'mental'],
  ['aggression', 'Agresja', 'mental'],
  ['ambition', 'Ambicja', 'mental'],
  ['professionalism', 'Profesjonalizm', 'mental'],
  ['pace', 'Szybkość', 'physical'],
  ['stamina', 'Wytrzymałość', 'physical'],
  ['strength', 'Siła', 'physical'],
  ['agility', 'Zwinność', 'physical'],
  ['jumping', 'Skoczność', 'physical'],
  ['reflexes', 'Refleks', 'goalkeeper'],
  ['handling', 'Chwyt', 'goalkeeper'],
  ['oneOnOnes', 'Jeden na jednego', 'goalkeeper'],
  ['goalkeeperSweeping', 'Gra na przedpolu', 'goalkeeper'],
] as const satisfies readonly (readonly [keyof PlayerAttributes, string, AttributeGroup])[];

export const ATTRIBUTE_PRESENTATION = rows.map(([key, label, group], order) => ({
  key,
  label,
  group,
  groupLabel: groupLabels[group],
  order,
}));
export const ATTRIBUTE_PRESENTATION_BY_KEY = Object.fromEntries(
  ATTRIBUTE_PRESENTATION.map((entry) => [entry.key, entry]),
) as Record<keyof PlayerAttributes, (typeof ATTRIBUTE_PRESENTATION)[number]>;
export const getAttributeFamily = (key: keyof PlayerAttributes): DevelopmentFamily =>
  ATTRIBUTE_PRESENTATION_BY_KEY[key].group;
