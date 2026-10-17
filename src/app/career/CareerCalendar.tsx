import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CareerState } from '../../types/domain';
import { buildSeasonTimeline } from '../../core/seasonTimeline';
import { presentInjury } from '../../core/injuryPresentation';
import { CareerMatchDetails } from '../../components/CareerMatchDetails';

import {
  calendarDateString as dateString,
  utcCalendarDate as utcDate,
  shiftCalendarMonth,
  calendarDays,
} from './calendarPresentation';
/** Read-only window onto the authoritative timeline. No simulation or settlement callbacks. */
export const CareerCalendar = ({ career }: { career: CareerState }) => {
  const today =
    career.currentDate ?? career.careerCalendar?.currentDate ?? `${career.currentSeason}-07-01`;
  const [month, setMonth] = useState(today.slice(0, 7)),
    [selected, setSelected] = useState(today);
  const [focusDate, setFocusDate] = useState<string>();
  const host = useRef<HTMLElement>(null);
  const timeline = useMemo(() => buildSeasonTimeline(career), [career]);
  const byDate = useMemo(() => {
    const index = new Map<string, typeof timeline>();
    for (const entry of timeline) index.set(entry.date, [...(index.get(entry.date) ?? []), entry]);
    return index;
  }, [timeline]);
  useLayoutEffect(() => {
    if (focusDate)
      host.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus();
  }, [focusDate, month, selected]);
  const injuries = (date: string) =>
    (career.playerAvailability?.injuries ?? []).filter(
      (injury) => injury.startDate <= date && date <= (injury.recoveryDate ?? today),
    );
  const select = (date: string, focus = false) => {
    setSelected(date);
    setMonth(date.slice(0, 7));
    setFocusDate(focus ? date : undefined);
  };
  return (
    <section className="career-calendar" aria-label="Kalendarz kariery" ref={host}>
      <header>
        <button
          type="button"
          aria-label="Poprzedni miesiąc"
          onClick={() => {
            const next = shiftCalendarMonth(month, -1);
            setMonth(next);
            setSelected(`${next}-01`);
            setFocusDate(undefined);
          }}
        >
          ‹
        </button>
        <h2>
          {utcDate(`${month}-01`).toLocaleDateString('pl-PL', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </h2>
        <button
          type="button"
          aria-label="Następny miesiąc"
          onClick={() => {
            const next = shiftCalendarMonth(month, 1);
            setMonth(next);
            setSelected(`${next}-01`);
            setFocusDate(undefined);
          }}
        >
          ›
        </button>
        <button type="button" onClick={() => select(today)}>
          Dziś
        </button>
      </header>
      <div className="calendar-weekdays" aria-hidden="true">
        {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="calendar-days" role="group" aria-label="Dni miesiąca">
        {calendarDays(month).map((date) => {
          const entries = byDate.get(date) ?? [],
            injured = injuries(date).length > 0;
          return (
            <button
              type="button"
              key={date}
              data-date={date}
              data-outside={date.slice(0, 7) !== month}
              data-past={date < today}
              aria-current={date === today ? 'date' : undefined}
              aria-pressed={date === selected}
              tabIndex={date === selected ? 0 : -1}
              aria-label={`${date}${entries.length ? `, ${entries.map((entry) => (entry.kind === 'fixture' ? (entry.status === 'completed' ? 'rozegrany mecz' : entry.status === 'postponed' ? 'przełożony mecz' : 'zaplanowany mecz') : 'wydarzenie')).join(', ')}` : ''}${injured ? ', okres urazu' : ''}`}
              onClick={() => select(date)}
              onKeyDown={(event) => {
                const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
                  event.key
                ];
                if (delta !== undefined) {
                  event.preventDefault();
                  const next = utcDate(date);
                  next.setUTCDate(next.getUTCDate() + delta);
                  const value = dateString(next);
                  select(value, true);
                }
              }}
            >
              <span>{Number(date.slice(8))}</span>
              <small aria-hidden="true">
                {entries.some((e) => e.kind === 'fixture' && e.status === 'completed')
                  ? '■'
                  : entries.some((e) => e.kind === 'fixture')
                    ? '□'
                    : ''}
                {entries.some((e) => e.kind === 'event') ? '•' : ''}
                {injured ? '+' : ''}
              </small>
            </button>
          );
        })}
      </div>
      <p className="calendar-key">
        <time dateTime={today}>Symulacja: {today.split('-').reverse().join('.')}</time> · ■
        rozegrany · □ plan · • wydarzenie · + uraz
      </p>
      <div className="calendar-date-details" aria-live="polite">
        <strong>{selected.split('-').reverse().join('.')}</strong>
        {(byDate.get(selected) ?? []).map((entry) => {
          if (entry.kind === 'event')
            return (
              <p key={entry.sourceId}>
                {entry.label} · {entry.status === 'completed' ? 'zakończone' : 'plan'}
              </p>
            );
          const fixture = career.careerCalendar?.fixtures.find(
            (item) => item.id === entry.fixtureId,
          );
          const leagueFixture = career.leagueSeason?.rounds
            .flatMap((round) => round.fixtures)
            .find((item) => item.id === entry.fixtureId);
          return (
            <div key={entry.sourceId}>
              <p>
                {fixture?.opponent.name ?? 'Mecz'} ·{' '}
                {fixture?.venue === 'home' ? 'u siebie' : 'na wyjeździe'}
                <br />
                {career.leagueSeason?.competition.name ?? 'Rozgrywki klubowe'} ·{' '}
                {entry.status === 'completed'
                  ? 'rozegrany'
                  : entry.status === 'postponed'
                    ? 'przełożony'
                    : 'zaplanowany'}
                {leagueFixture?.completed &&
                  ` · ${leagueFixture.homeGoals}:${leagueFixture.awayGoals}`}
              </p>
              {entry.status === 'completed' && entry.participation && (
                <CareerMatchDetails record={entry.participation} playerId={career.player.id} />
              )}
            </div>
          );
        })}
        {injuries(selected).map((injury) => (
          <p key={injury.id}>
            {presentInjury(injury, 'ongoing')} · od {injury.startDate}
            {injury.recoveryDate ? ` do ${injury.recoveryDate}` : ' · brak zapisanej daty powrotu'}
          </p>
        ))}
        {!byDate.has(selected) && !injuries(selected).length && (
          <p>Brak zapisanych wydarzeń na ten dzień.</p>
        )}
      </div>
    </section>
  );
};
