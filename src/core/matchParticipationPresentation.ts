import type { SeasonParticipationRecord } from '../types/domain';
import { positionCode } from './positionPresentation';
import { getParticipationStatusLabel } from './participationPresentation';
import { participationMinutes } from './seasonParticipation';

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
  if (!participationMinutes(participation))
    return { text: getParticipationStatusLabel(participation.status), cards: [] };
  const position = participation.assignedPosition
    ? ` · ${positionCode(participation.assignedPosition)}`
    : '';
  const stats =
    participation.canonicalStats && participation.assignedPosition === 'goalkeeper'
      ? `${participation.canonicalStats.saves} obr. · ${participation.canonicalStats.goalsConceded} strac.`
      : participation.goalkeeperStats
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
    text: `${participation.started ? 'Pierwszy skład' : 'Rezerwowy'} · ${participationMinutes(participation) < 1 ? '<1' : Math.round(participationMinutes(participation))}'${position} · ${stats} · ${rating(participation.goalkeeperStats?.rating ?? participation.rating)}`,
    cards,
  };
};

export const presentSubstitutions = (
  record: Pick<SeasonParticipationRecord, 'participationEvidence'>,
  playerId: string,
) =>
  (record.participationEvidence?.substitutions ?? []).map((s) => {
    const reason = { injury: 'uraz', fatigue: 'zmęczenie', tactical: 'taktycznie' }[s.reason];
    return s.outgoingId === playerId
      ? `Zejście w ${Math.ceil(s.leftAt / 60)}. min · zastępujący: ${s.incomingName ?? 'brak zachowanego nazwiska'} (${reason})`
      : `Wejście w ${Math.ceil(s.enteredAt / 60)}. min · za: ${s.outgoingName ?? 'brak zachowanego nazwiska'} (${reason})`;
  });
