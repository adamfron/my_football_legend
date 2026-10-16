import type { HistoricalPlayerMatch, SeasonParticipationRecord } from '../types/domain';
import { presentSubstitutions } from '../core/matchParticipationPresentation';
import { ratingUnavailableLabel } from '../core/careerMatchPresentation';

/** Read-only by construction: no fixture runner or settlement callback is imported. */
export const CareerMatchDetails = ({
  record,
  playerId,
}: {
  record: SeasonParticipationRecord | HistoricalPlayerMatch;
  playerId: string;
}) => {
  const changes = presentSubstitutions(record, playerId);
  const stats = 'canonicalStats' in record ? record.canonicalStats : undefined;
  const minutes = stats?.minutesPlayed ?? record.minutes;
  const feedback = !minutes
    ? 'Brak występu do oceny.'
    : record.rating !== undefined && record.rating >= 7
      ? record.started
        ? 'Statystyki wskazują na dobry wkład w występ zespołu.'
        : 'Pozytywny wkład po wejściu z ławki.'
      : stats && stats.tacklesWon + stats.interceptions >= 5
        ? 'Zapisano regularny udział w odbiorach i przechwytach.'
        : 'Ocena ogólnego wkładu wynika z dostępnych statystyk.';
  return (
    <details className="career-match-details">
      <summary>Szczegóły występu</summary>
      <p>
        {record.started
          ? 'Pierwszy skład'
          : minutes > 0
            ? 'Wejście z ławki'
            : ((
                {
                  unused_bench: 'Ławka · bez wejścia',
                  not_selected: 'Poza kadrą',
                  injured: 'Kontuzja',
                  suspended: 'Zawieszenie',
                  unfit: 'Niska gotowość',
                  unavailable: 'Niedostępny',
                } as Record<string, string>
              )[record.status ?? ''] ?? 'Brak występu')}{' '}
        · {minutes < 1 && minutes > 0 ? '<1' : Math.round(minutes)} min
      </p>
      <p>
        Ocena: {record.rating?.toFixed(1).replace('.', ',') ?? '—'}
        {record.rating === undefined
          ? ` · ${ratingUnavailableLabel(record.ratingProvenance)}`
          : record.ratingProvenance
            ? ' · rzeczywiste statystyki meczu 3D'
            : ' · model meczu podsumowaniowego'}
      </p>
      {changes.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
      {!changes.length && minutes > 0 && <p>Szczegóły zmian: brak zachowanych zdarzeń.</p>}
      {stats && (
        <p>
          Podania {stats.passesCompleted}/{stats.passesAttempted} · strzały {stats.shots} (
          {stats.shotsOnTarget} celnych) · odbiory {stats.tacklesWon} · przechwyty{' '}
          {stats.interceptions}
          {record.assignedPosition === 'goalkeeper'
            ? ` · obrony ${stats.saves} · stracone ${stats.goalsConceded}`
            : ''}
          {record.metricsSource === 'canonical_plus_summary'
            ? ' · akcje dotyczą wyłącznie kanonicznej części meczu'
            : ''}
        </p>
      )}
      <p>
        Gole {record.goals} · asysty {record.assists} · żółte kartki {record.yellowCards ?? 0}
        {record.redCard ? ' · czerwona kartka' : ''}
      </p>
      {record.participationEvidence?.injury && (
        <p>Uraz · przewidywana przerwa: {record.participationEvidence.injury.recoveryDays} dni</p>
      )}
      {record.participationEvidence?.decisions &&
        record.participationEvidence.decisions.resolved > 0 && (
          <p>
            Rzeczywiste decyzje: {record.participationEvidence.decisions.resolved} rozstrzygniętych
            · {record.participationEvidence.decisions.retained} z utrzymaniem piłki ·{' '}
            {record.participationEvidence.decisions.turnovers} strat. Wynik akcji nie przesądza o
            trafności wyboru.
          </p>
        )}
      <p>
        Informacja dla zawodnika: {feedback}{' '}
        {record.metricsSource
          ? 'Nie jest to ocena intencji poszczególnych decyzji.'
          : 'Mecz podsumowaniowy nie zachowuje szczegółów decyzji.'}
      </p>
    </details>
  );
};
