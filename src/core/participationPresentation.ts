import type { ParticipationStatus } from '../types/domain';

const NON_APPEARANCE_LABELS: Partial<Record<ParticipationStatus, string>> = {
  injured: 'kontuzja',
  suspended: 'zawieszony',
  unused_bench: 'niewykorzystany rezerwowy',
  not_selected: 'poza kadrą',
  unfit: 'niegotowy do gry',
  unavailable: 'niedostępny',
};

export const getParticipationStatusLabel = (status: ParticipationStatus): string =>
  NON_APPEARANCE_LABELS[status] ?? 'bez minut';
