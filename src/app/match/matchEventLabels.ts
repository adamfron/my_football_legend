import type { MatchEvent } from '../../core/matchSimulation/matchEventFeed';

export const matchEventLabels: Record<MatchEvent['kind'], string> = {
  goal: 'Gol',
  yellow_card: 'Żółta kartka',
  second_yellow_red: 'Druga żółta · czerwona kartka',
  red_card: 'Czerwona kartka',
  penalty: 'Rzut karny',
  foul: 'Faul',
  offside: 'Spalony',
  kick_off: 'Rozpoczęcie gry',
  substitution: 'Zmiana',
  injury: 'Uraz',
};
