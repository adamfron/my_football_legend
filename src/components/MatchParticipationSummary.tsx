import type { SeasonParticipationRecord } from '../types/domain';
import { presentMatchParticipation } from '../core/matchParticipationPresentation';

export const MatchParticipationSummary = ({
  participation,
}: {
  participation?: SeasonParticipationRecord | undefined;
}) => {
  const summary = presentMatchParticipation(participation);
  return (
    <span className="match-participation-summary">
      <span>{summary.text}</span>
      {summary.cards.length > 0 && (
        <span
          className="card-indicators"
          aria-label={
            participation?.redCard === 'second_yellow'
              ? 'druga żółta kartka i czerwona kartka'
              : summary.cards
                  .map((card) => (card === 'yellow' ? 'żółta kartka' : 'czerwona kartka'))
                  .join(', ')
          }
        >
          {summary.cards.map((card, index) => (
            <i key={`${card}-${index}`} className={`card-indicator ${card}`} aria-hidden="true" />
          ))}
        </span>
      )}
    </span>
  );
};
