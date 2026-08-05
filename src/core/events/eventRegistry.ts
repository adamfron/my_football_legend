import type { EventDefinition } from '../../types/domain';

const choice = (id: string) => ({ id, labelKey: `events.academy.${id}.label`, descriptionKey: `events.academy.${id}.description`, visiblePros: [`events.academy.${id}.pros`], visibleCons: [`events.academy.${id}.cons`] });
export const academyEventDefinitions: EventDefinition[] = [
  { id: 'academy_coach_introduction', version: 1, category: 'academy', tags: ['academy_first_week','coach_first_impression'], availabilityConditions: [], cast: ['coach'], playerInformationKeys: ['events.academy.coach_intro.info'], decisions: [choice('ask_team_needs'), choice('declare_senior_ambition'), choice('humble_learning')], hiddenTests: [], consequences: [], nextEventIds: ['academy_first_scrimmage'], localizationKeys: { title: 'events.academy.coach_intro.title', summary: 'events.academy.coach_intro.summary' } },
  { id: 'academy_first_scrimmage', version: 1, category: 'academy', tags: ['academy_first_week','first_scrimmage'], availabilityConditions: [], cast: ['coach','rival'], playerInformationKeys: ['events.academy.scrimmage.info'], decisions: [choice('take_action'), choice('play_rival'), choice('organize_team'), choice('gk_long_counter'), choice('gk_short_shape'), choice('gk_safe')], hiddenTests: [{ id: 'scrimmage', attribute: 'composure', difficulty: 62 }], consequences: [], nextEventIds: ['academy_rival_reaction'], localizationKeys: { title: 'events.academy.scrimmage.title', summary: 'events.academy.scrimmage.summary' } },
  { id: 'academy_rival_reaction', version: 1, category: 'academy', tags: ['academy_first_week','first_rival'], availabilityConditions: [], cast: ['rival'], playerInformationKeys: ['events.academy.rival.info'], decisions: [choice('share_credit'), choice('stress_rivalry'), choice('dismiss_reaction')], hiddenTests: [], consequences: [], nextEventIds: ['academy_first_week_summary'], localizationKeys: { title: 'events.academy.rival.title', summary: 'events.academy.rival.summary' } },
  { id: 'academy_first_week_summary', version: 1, category: 'academy', tags: ['academy_first_week'], availabilityConditions: [], cast: ['coach','rival'], playerInformationKeys: [], decisions: [], hiddenTests: [], consequences: [], nextEventIds: [], localizationKeys: { title: 'events.academy.summary.title', summary: 'events.academy.summary.summary' } },
];
export const getEventDefinition = (id: string) => {
  const definition = academyEventDefinitions.find((event) => event.id === id);
  if (!definition) throw new Error(`Unknown event definition: ${id}`);
  return definition;
};
