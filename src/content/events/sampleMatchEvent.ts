import type { EventDefinition } from '../../types/domain';
export const sampleMatchEvent: EventDefinition = {
  id: 'event_late_match_choice',
  version: 1,
  category: 'match',
  tags: ['late_game', 'pressure'],
  availabilityConditions: ['important_match', 'player_on_pitch'],
  cast: ['player', 'coach'],
  playerInformationKeys: ['events.match.late_choice.info'],
  decisions: [
    {
      id: 'shoot',
      labelKey: 'events.match.late_choice.shoot.label',
      descriptionKey: 'events.match.late_choice.shoot.description',
      visiblePros: ['Możesz zostać bohaterem meczu.'],
      visibleCons: ['Strata piłki pogorszy relacje z trenerem.'],
    },
    {
      id: 'pass',
      labelKey: 'events.match.late_choice.pass.label',
      descriptionKey: 'events.match.late_choice.pass.description',
      visiblePros: ['Zwiększasz szansę na lepszą pozycję zespołu.'],
      visibleCons: ['Oddajesz komuś innemu moment chwały.'],
    },
  ],
  hiddenTests: [{ id: 'pressure_finish', attribute: 'composure', difficulty: 62 }],
  consequences: [
    {
      id: 'create_match_fact',
      type: 'history_fact',
      factType: 'decisive_late_action',
      data: { minute: 88 },
    },
  ],
  nextEventIds: [],
  localizationKeys: {
    title: 'events.match.late_choice.title',
    summary: 'events.match.late_choice.summary',
  },
};
