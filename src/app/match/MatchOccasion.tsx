import { useState, type CSSProperties } from 'react';
import type { TacticalMatchState } from '../../core/matchSimulation/matchState';
import type { SingleMatchSession } from '../../core/singleMatch';
import { evaluateCanonicalRating } from '../../core/careerMatchPresentation';
import type { KitPresentation } from './tacticalRenderer/model';
import { formatMatchTime } from './matchTime';
import { matchEventLabels } from './matchEventLabels';

/** Canonical facts → a short dismissible caption. Never delays or advances football. */
export const MatchOccasion = ({
  state,
  session,
  kits,
}: {
  state: TacticalMatchState;
  session: SingleMatchSession;
  kits: Record<'home' | 'away', KitPresentation>;
}) => {
  const [dismissed, setDismissed] = useState<string>();
  const terminal = state.status === 'full_time' || state.status === 'abandoned';
  const latest = (state.matchEvents ?? [])
    .filter(
      (event) =>
        event.at <= state.time &&
        state.time - event.at < 3 &&
        ['goal', 'substitution'].includes(event.kind),
    )
    .at(-1);
  const key = terminal
    ? state.status
    : state.status === 'half_time'
      ? 'half_time'
      : (latest?.id ?? (state.time < 2 ? 'kick_off' : undefined));
  if (!key || dismissed === key) return null;
  const roster = [
    ...session.home.players,
    ...session.away.players,
    ...(session.home.bench ?? []),
    ...(session.away.bench ?? []),
  ];
  const name = (id?: string) =>
    roster.find((player) => player.footballerId === id)?.profile.lastName;
  const controlledId =
    session.setup.control.mode === 'player' ? session.setup.control.footballerId : undefined;
  const controlled = roster.find((player) => player.footballerId === controlledId);
  const summary = state.statistics?.players.find((player) => player.playerId === controlledId);
  const actualPlayer = [...state.players, ...(state.departedPlayers ?? [])].find(
    (player) => player.id === controlledId,
  );
  const rating =
    terminal && controlled
      ? evaluateCanonicalRating({
          position: actualPlayer?.slot.position ?? controlled.profile.primaryPosition,
          source: 'canonical',
          abandoned: state.status === 'abandoned',
          stats: summary,
        })
      : undefined;
  return (
    <section
      className={`match-occasion ${terminal ? 'match-occasion--terminal' : ''}`}
      aria-label={terminal ? 'Podsumowanie meczu' : 'Oprawa meczu'}
      style={
        { '--home-colour': kits.home.primary, '--away-colour': kits.away.primary } as CSSProperties
      }
      onClick={(event) => event.stopPropagation()}
    >
      <div className="match-occasion__heading">
        <strong>
          {terminal
            ? state.status === 'abandoned'
              ? 'MECZ PRZERWANY'
              : 'KONIEC MECZU'
            : key === 'half_time'
              ? 'PRZERWA'
              : key === 'kick_off'
                ? 'ZACZYNAMY'
                : latest?.kind === 'goal'
                  ? 'GOL'
                  : 'ZMIANA'}
        </strong>
        <button
          type="button"
          aria-label={terminal ? 'Zwiń podsumowanie meczu' : 'Pomiń oprawę'}
          onClick={() => setDismissed(key)}
        >
          ×
        </button>
      </div>
      <div className="match-occasion__score">
        <span>{session.home.club.name}</span>
        <b>
          {state.score.home}–{state.score.away}
        </b>
        <span>{session.away.club.name}</span>
      </div>
      {latest && !terminal && (
        <p>
          {formatMatchTime(latest.at)} · {name(latest.actorId) ?? session[latest.team].club.name}
          {latest.kind === 'substitution'
            ? ` ← ${name(latest.relatedPlayerId) ?? 'zmieniony zawodnik'}`
            : ''}
        </p>
      )}
      {key === 'half_time' && <p>Piłkarze odpoczywają. Druga połowa czeka na wznowienie.</p>}
      {terminal && (
        <>
          {controlled && (
            <p>
              {controlled.profile.firstName} {controlled.profile.lastName} ·{' '}
              {summary?.minutesPlayed ? `${Math.ceil(summary.minutesPlayed)} min` : 'Bez występu'} ·
              Ocena: {rating?.value?.toLocaleString('pl-PL', { minimumFractionDigits: 1 }) ?? '—'}
            </p>
          )}
          <ul>
            {(state.matchEvents ?? [])
              .filter((event) => ['goal', 'red_card', 'second_yellow_red'].includes(event.kind))
              .slice(-6)
              .map((event) => (
                <li key={event.id}>
                  {formatMatchTime(event.at)} · {matchEventLabels[event.kind]} ·{' '}
                  {name(event.actorId) ?? session[event.team].club.name}
                </li>
              ))}
          </ul>
          <small>Pełny przebieg i zdarzenia w centrum meczu.</small>
        </>
      )}
    </section>
  );
};
