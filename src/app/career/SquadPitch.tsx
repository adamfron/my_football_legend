import type { CSSProperties } from 'react';
import type { FootballerProfile, Id } from '../../types/domain';
import type { BestXIAssignment, FormationId } from '../../core/footballerWorld';
import { positionCode } from '../shared/positionPresentation';
import { FORMATION_COORDINATES } from './formationCoordinates';

export const SquadPitch = ({
  formation,
  assignments,
  resolvePlayer,
  protagonistId,
}: {
  formation: FormationId;
  assignments: readonly BestXIAssignment[];
  resolvePlayer: (id: Id) => FootballerProfile | undefined;
  protagonistId: Id;
}) => (
  <section className="squad-pitch-panel" aria-label={`Preferowana XI w ustawieniu ${formation}`}>
    <header>
      <strong>USTAWIENIE {formation}</strong>
      <span>preferencja trenera</span>
    </header>
    <div className="squad-pitch">
      <div className="pitch-box pitch-box-top" />
      <div className="pitch-circle" />
      <div className="pitch-box pitch-box-bottom" />
      {assignments.map((assignment, index) => {
        const player = resolvePlayer(assignment.footballerId);
        const point = FORMATION_COORDINATES[formation][index];
        if (!player || !point) return null;
        return (
          <div
            className={`pitch-player ${assignment.position === 'goalkeeper' ? 'goalkeeper' : ''} ${player.id === protagonistId ? 'protagonist' : ''}`}
            data-footballer-id={player.id}
            key={player.id}
            style={{ '--pitch-x': `${point.x}%`, '--pitch-y': `${point.y}%` } as CSSProperties}
          >
            <span>{positionCode(assignment.position)}</span>
            <strong>{player.lastName}</strong>
            <b>{assignment.effectiveOverall}</b>
          </div>
        );
      })}
    </div>
  </section>
);
