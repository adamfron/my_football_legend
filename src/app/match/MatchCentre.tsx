import type { CSSProperties, ReactNode } from 'react';
import type { SingleMatchSession } from '../../core/singleMatch';
import type { TacticalMatchState } from '../../core/matchSimulation/matchState';
import type { MatchEvent } from '../../core/matchSimulation/matchEventFeed';
import { projectMatchCentreStatistics } from '../../core/matchSimulation/matchCentreStatistics';
import type { KitPresentation } from './tacticalRenderer/model';
import { formatMatchTime } from './matchTime';

const eventLabels: Record<MatchEvent['kind'], string> = {
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

/** Always projects the complete canonical match, including football hidden by watch policy. */
export const MatchCentre = ({
  state,
  session,
  kits,
  canReplay,
  onReplay,
}: {
  state: TacticalMatchState;
  session: SingleMatchSession;
  kits: Record<'home' | 'away', KitPresentation>;
  canReplay?: (replayKey: string) => boolean;
  onReplay?: (replayKey: string) => void;
}) => {
  const statistics = projectMatchCentreStatistics(state);
  const roster = new Map(
    [
      ...session.home.players,
      ...session.away.players,
      ...(session.home.bench ?? []),
      ...(session.away.bench ?? []),
    ].map((player) => [
      player.footballerId,
      `${player.profile.firstName} ${player.profile.lastName}`,
    ]),
  );
  const events = (state.matchEvents ?? []).filter((event) => event.kind !== 'kick_off');
  const percentage = (value: number | undefined) =>
    value === undefined ? '—' : `${Math.round(value)}%`;
  const row = (label: string, home: string | number, away: string | number) => (
    <tr key={label}>
      <td>{home}</td>
      <th scope="row">{label}</th>
      <td>{away}</td>
    </tr>
  );
  const mainRows = [
    row('Strzały', statistics.home.shots, statistics.away.shots),
    row('Celne', statistics.home.shotsOnTarget, statistics.away.shotsOnTarget),
    row(
      'Posiadanie',
      percentage(statistics.home.possessionPercentage),
      percentage(
        statistics.home.possessionPercentage !== undefined &&
          statistics.away.possessionPercentage !== undefined
          ? 100 - Math.round(statistics.home.possessionPercentage)
          : statistics.away.possessionPercentage,
      ),
    ),
    row('Podania', statistics.home.passesAttempted, statistics.away.passesAttempted),
    row(
      'Celność podań',
      percentage(statistics.home.completionPercentage),
      percentage(statistics.away.completionPercentage),
    ),
  ];
  const table = (rows: ReactNode[]) => (
    <table className="match-centre__statistics" aria-label="Statystyki meczu">
      <thead>
        <tr>
          <th scope="col" title={session.home.club.name}>
            Gospodarze
          </th>
          <th scope="col">Statystyka</th>
          <th scope="col" title={session.away.club.name}>
            Goście
          </th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
  return (
    <section
      className="match-centre"
      aria-label="Centrum meczu"
      style={
        { '--home-colour': kits.home.primary, '--away-colour': kits.away.primary } as CSSProperties
      }
    >
      <h2>Centrum meczu</h2>
      <p className="match-centre__score">
        <span title={session.home.club.name}>{session.home.club.name}</span>
        <strong>
          {state.score.home}–{state.score.away}
        </strong>
        <span title={session.away.club.name}>{session.away.club.name}</span>
      </p>
      <p className="match-centre__clock">
        {formatMatchTime(state.time)} · pełny przebieg spotkania
        {state.timekeeping?.minimumAnnouncedAddedSeconds !== undefined &&
          ` · doliczono co najmniej ${Math.ceil(state.timekeeping.minimumAnnouncedAddedSeconds / 60)} min`}
      </p>
      {state.controlledFootballerId &&
        !state.players.some((player) => player.id === state.controlledFootballerId) &&
        (state.departedPlayers?.some((player) => player.id === state.controlledFootballerId) ||
          state.substitutionState?.pending.some(
            (request) => request.outgoing.id === state.controlledFootballerId,
          )) && (
          <p role="status">
            Twój piłkarz zakończył udział w meczu. Obserwujesz dalszy przebieg spotkania.
          </p>
        )}
      <h3>Wydarzenia</h3>
      {events.length === 0 ? (
        <p className="match-centre__empty">Jeszcze bez ważnych wydarzeń.</p>
      ) : (
        <ol className="match-centre__events" aria-label="Wydarzenia meczu">
          {[...events].reverse().map((event) => {
            const replayable = Boolean(onReplay && canReplay?.(event.replayKey));
            const player = event.actorId ? roster.get(event.actorId) : undefined;
            return (
              <li
                key={event.id}
                className={`match-centre__event match-centre__event--${event.team}`}
                data-event-kind={event.kind}
              >
                <time>{formatMatchTime(event.at)}</time>
                <div>
                  <strong>{eventLabels[event.kind]}</strong>
                  <span>
                    {event.kind === 'substitution'
                      ? `${player ?? event.actorId} ← ${roster.get(event.relatedPlayerId ?? '') ?? event.relatedPlayerId}`
                      : player
                        ? `${player} (${session[event.team].club.name})`
                        : session[event.team].club.name}
                  </span>
                  {event.score && (
                    <span className="match-centre__event-score">
                      {event.score.home}–{event.score.away}
                    </span>
                  )}
                </div>
                {replayable && (
                  <button
                    type="button"
                    onClick={() => onReplay?.(event.replayKey)}
                    aria-label={`Powtórka: ${eventLabels[event.kind]}, ${formatMatchTime(event.at)}`}
                  >
                    ▶
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <h3>Statystyki</h3>
      {table(mainRows)}
      <details className="match-centre__more">
        <summary>Wszystkie statystyki</summary>
        {table([
          row('Podania celne', statistics.home.passesCompleted, statistics.away.passesCompleted),
          row('Podania otrzymane', statistics.home.passesReceived, statistics.away.passesReceived),
          row('Kontakty z piłką', statistics.home.touches, statistics.away.touches),
          row('Prowadzenia', statistics.home.carries, statistics.away.carries),
          row('Posiadanie wygrane', statistics.home.possessionWon, statistics.away.possessionWon),
          row(
            'Posiadanie stracone',
            statistics.home.possessionLost,
            statistics.away.possessionLost,
          ),
          row('Strzały zablokowane', statistics.home.blockedShots, statistics.away.blockedShots),
          row('Faule', statistics.home.fouls, statistics.away.fouls),
          row('Żółte kartki', statistics.home.yellowCards, statistics.away.yellowCards),
          row('Czerwone kartki', statistics.home.redCards, statistics.away.redCards),
          row('Spalone', statistics.home.offsides, statistics.away.offsides),
          row('Rzuty rożne', statistics.home.corners, statistics.away.corners),
          row('Rzuty wolne', statistics.home.freeKicks, statistics.away.freeKicks),
          row('Auty', statistics.home.throwIns, statistics.away.throwIns),
          row('Próby odbioru', statistics.home.tacklesAttempted, statistics.away.tacklesAttempted),
          row('Odbiory wygrane', statistics.home.tacklesWon, statistics.away.tacklesWon),
          row('Przechwyty', statistics.home.interceptions, statistics.away.interceptions),
          row('Zmiany', statistics.home.substitutions, statistics.away.substitutions),
          row('Urazy', statistics.home.injuries, statistics.away.injuries),
        ])}
      </details>
    </section>
  );
};
