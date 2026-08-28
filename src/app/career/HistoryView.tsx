import { useState } from 'react';
import { getFactPresentation } from '../../core/narrative/factPresentation';
import { getCareerMilestones } from '../../core/narrative/careerMilestones';
import type { CareerState } from '../../types/domain';

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(`${date}T12:00:00Z`),
  );

export const HistoryView = ({ career }: { career: CareerState }) => {
  const [showAll, setShowAll] = useState(false);
  const facts = showAll
    ? career.historyFacts
    : getCareerMilestones(career).map((item) => item.fact);
  return (
    <div>
      <h2>Oś czasu kariery</h2>
      <div className="tabs">
        <button className={!showAll ? 'active' : ''} onClick={() => setShowAll(false)}>
          Najważniejsze
        </button>
        <button className={showAll ? 'active' : ''} onClick={() => setShowAll(true)}>
          Wszystko
        </button>
      </div>
      {facts.map((fact) => {
        const presentation = getFactPresentation(career, fact);
        return (
          <article className="mini-card history-item" key={fact.id}>
            <p>
              {formatDate(fact.date)} <span className="tone-badge">{presentation.toneLabel}</span>
            </p>
            <h3>{presentation.title}</h3>
            <p>{presentation.summary}</p>
            <p>
              {presentation.participantNames.join(', ')}
              {presentation.clubName ? ` · ${presentation.clubName}` : ''}
            </p>
          </article>
        );
      })}
    </div>
  );
};
