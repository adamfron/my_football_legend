import { useState } from 'react';
import {
  evaluateTacticalActions,
  TACTICAL_REASON_LABELS,
} from '../../core/matchSimulation/tacticalActionEvaluator';
import type { TacticalMatchState } from '../../core/matchSimulation/matchState';

export const TacticalExplanation = ({
  state,
  actorId,
}: {
  state: TacticalMatchState;
  actorId: string;
}) => {
  const [evaluation, setEvaluation] = useState<ReturnType<typeof evaluateTacticalActions>>();
  const names: Record<string, string> = {
    pass: 'Podanie',
    shot: 'Strzał',
    carry: 'Prowadzenie',
    hold: 'Utrzymanie',
    cross: 'Dośrodkowanie',
    header: 'Główka',
    challenge: 'Odbiór',
    space_pass: 'Podanie w przestrzeń',
  };
  return (
    <section className="tactical-explanation">
      <button
        onClick={() =>
          setEvaluation(evaluation ? undefined : evaluateTacticalActions(state, actorId))
        }
        aria-expanded={Boolean(evaluation)}
      >
        Ocena sytuacji
      </button>
      {evaluation && (
        <>
          <p>Ocena kontekstu przed akcją. Prognozy są orientacyjne; wykonanie rozstrzyga boisko.</p>
          <ul>
            {evaluation.actions.slice(0, 3).map((item, index) => (
              <li key={index}>
                <strong>{names[item.action.type]}</strong>:{' '}
                {item.reasons
                  .filter((r) => r.code !== 'progression' || r.value > 5)
                  .map((r) => TACTICAL_REASON_LABELS[r.code])
                  .join(' · ')}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};
