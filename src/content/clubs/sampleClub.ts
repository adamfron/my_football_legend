import type { Club } from '../../types/domain';
export const sampleClub: Club = {
  id: 'club_vistula_nova',
  name: 'Vistula Nova',
  country: 'Polska',
  region: 'Małopolska',
  visualIdentity: { primaryColor: '#f7f7f3', secondaryColor: '#285f8f' },
  dna: ['cierpliwość', 'akademia', 'technika'],
  currentSituation: 'Młodzieżowa akademia przygotowująca wychowanków do zawodowej piłki.',
  playStyle: 'Spokojne budowanie akcji w lidze akademii',
  youthApproach: 'Rozwój i bezpieczne wprowadzanie juniorów do dorosłej kariery',
  prestige: 42,
  seasonHistory: [
    {
      season: 2026,
      summary: 'Sezon ligi młodzieżowej nastawiony na rozwój i ukończenie akademii.',
      placement: 7,
    },
  ],
  notablePlayers: [],
  notableCoaches: ['person_marek_wrona'],
  legends: [],
  rivals: [],
};
