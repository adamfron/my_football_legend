import type { Player, PlayerAttributes } from '../types/domain';
import { ATTRIBUTE_PRESENTATION_BY_KEY, getAttributeFamily } from './attributePresentation';
import {
  getFootballArchetype,
  getRankedFootballArchetypes,
  type FootballArchetypeDefinition,
} from './footballArchetypes';

export const describePlayerProfile = (player: Player, selected?: FootballArchetypeDefinition) => {
  const archetype = selected ?? getRankedFootballArchetypes(player)[0]?.definition;
  if (!archetype) return 'Profil zawodnika nie został jeszcze określony.';
  const relevant = (Object.keys(player.attributes) as (keyof PlayerAttributes)[]).filter(
    (key) => player.primaryPosition === 'goalkeeper' || getAttributeFamily(key) !== 'goalkeeper',
  );
  const strengths = [...archetype.strengths]
    .filter((key) => relevant.includes(key))
    .sort((a, b) => player.attributes[b] - player.attributes[a])
    .slice(0, 2)
    .map((key) => ATTRIBUTE_PRESENTATION_BY_KEY[key].label.toLocaleLowerCase('pl'));
  const weakness = [...archetype.weaknesses]
    .filter((key) => relevant.includes(key))
    .sort((a, b) => player.attributes[a] - player.attributes[b])[0];
  return `${archetype.label}. Największe atuty to ${strengths.join(' i ')}${
    weakness
      ? `; słabszą stroną profilu jest ${ATTRIBUTE_PRESENTATION_BY_KEY[weakness].label.toLocaleLowerCase('pl')}`
      : ''
  }.`;
};

export const describeCurrentPlayerProfile = (player: Player) => describePlayerProfile(player);
export const getProfileArchetype = (id: string | undefined) => getFootballArchetype(id);
