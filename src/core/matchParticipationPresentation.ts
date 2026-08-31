import type { SeasonParticipationRecord } from '../types/domain';
import { positionCode } from './positionPresentation';
import { getParticipationStatusLabel } from './participationPresentation';

export type CardIndicator = 'yellow' | 'red';
export interface MatchParticipationPresentation {
  text: string;
  cards: CardIndicator[];
}
const rating = (value?: number) => (value === undefined ? '—' : value.toFixed(1).replace('.', ','));

/** Shared compact match summary rules. Card rectangles remain a React/CSS concern. */
export const presentMatchParticipation = (
  participation: SeasonParticipationRecord | undefined,
): MatchParticipationPresentation => {
  if (!participation) return { text: 'brak danych', cards: [] };
  if (!participation.minutes)
    return { text: getParticipationStatusLabel(participation.status), cards: [] };
  const position = participation.assignedPosition
    ? ` · ${positionCode(participation.assignedPosition)}`
    : '';
  const stats = participation.goalkeeperStats
    ? `${participation.goalkeeperStats.saves} obr.${participation.goalkeeperStats.cleanSheet ? ' · CS' : ''}`
    : `${participation.goals} G · ${participation.assists} A`;
  const cards: CardIndicator[] =
    participation.redCard === 'second_yellow'
      ? ['yellow', 'yellow', 'red']
      : [
          ...(Array(participation.yellowCards ?? 0).fill('yellow') as CardIndicator[]),
          ...(participation.redCard === 'direct' ? ['red' as const] : []),
        ];
  return {
    text: `${participation.minutes}'${position} · ${stats} · ${rating(participation.goalkeeperStats?.rating ?? participation.rating)}`,
    cards,
  };
};
