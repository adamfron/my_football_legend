import { useMemo, useState } from 'react';
import { getFactPresentation } from '../../core/narrative/factPresentation';
import { getCareerMilestones } from '../../core/narrative/careerMilestones';
import { getDistinctCareerFacts } from '../../core/narrative/careerEvidence';
import { buildSeasonNarrative, buildCareerStories } from '../../core/narrative/careerStories';
import { CareerMatchDetails } from '../../components/CareerMatchDetails';
import type { CareerState, CompletedSeasonSnapshot } from '../../types/domain';

const filters = [
  'Najważniejsze',
  'Wszystkie',
  'Mecze i osiągnięcia',
  'Transfery i kontrakty',
  'Kontuzje i rozwój',
];
const date = (d: string) => d.split('-').reverse().join('.');
const SeasonHistory = ({
  career,
  season: s,
}: {
  career: CareerState;
  season: CompletedSeasonSnapshot;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <details className="season-history" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {s.label} · {s.clubName} · {s.player.appearances} występów
      </summary>
      {open && (
        <>
          {buildSeasonNarrative(career, s).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {s.matches.map((m) => (
            <div className="archived-match" key={m.matchId}>
              <span>
                {date(m.date)} · {m.score ? `${m.score.home}:${m.score.away}` : '—'}
              </span>
              <CareerMatchDetails record={m} playerId={career.player.id} />
            </div>
          ))}
        </>
      )}
    </details>
  );
};
export const HistoryView = ({ career }: { career: CareerState }) => {
  const [filter, setFilter] = useState(0),
    [year, setYear] = useState('all');
  const facts = useMemo(
    () => getDistinctCareerFacts(career.historyFacts).filter((f) => f.narrativeImportance >= 55),
    [career.historyFacts],
  );
  const stories = useMemo(() => buildCareerStories(career), [career]);
  const milestones = useMemo(
    () => new Set(getCareerMilestones(career).map((m) => m.fact.id)),
    [career],
  );
  const years = useMemo(
    () =>
      [
        ...new Set([
          ...facts.map((f) => f.season),
          ...(career.completedSeasons ?? []).map((s) => Number(s.label.slice(0, 4))),
        ]),
      ].sort((a, b) => b - a),
    [facts, career.completedSeasons],
  );
  const shown = facts.filter(
    (f) =>
      (year === 'all' || String(f.season) === year) &&
      (filter === 0
        ? milestones.has(f.id)
        : filter === 1
          ? true
          : filter === 2
            ? /match|goal|assist|debut|start|champion|winner|promoted|relegated|milestone/.test(
                f.factType,
              )
            : filter === 3
              ? /contract|transfer|club_left|club_joined|retired/.test(f.factType)
              : /injur|recover|attribute|style|coach|role/.test(f.factType)),
  );
  return (
    <div className="career-history">
      <h2>Oś czasu kariery</h2>
      {stories.length > 0 && (
        <details className="career-stories">
          <summary>Wątki kariery · {stories.length}</summary>
          {stories.map((s) => (
            <p key={s.id}>{s.text}</p>
          ))}
        </details>
      )}
      <div className="history-controls">
        <label>
          Wydarzenia{' '}
          <select
            aria-label="Wydarzenia"
            value={filter}
            onChange={(e) => setFilter(Number(e.target.value))}
          >
            {filters.map((f, i) => (
              <option key={f} value={i}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sezon{' '}
          <select aria-label="Sezon" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">Wszystkie sezony</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}/{y + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="history-rows">
        {[...shown].reverse().map((f) => {
          const p = getFactPresentation(career, f);
          return (
            <details className="history-row" key={f.id}>
              <summary>
                <time>{date(f.date)}</time>
                <strong>{p.title}</strong>
                <span>{p.clubName ?? '—'}</span>
                <span>{p.summary}</span>
              </summary>
              <p>{p.summary}</p>
              <p>
                {p.participantNames.join(', ')} · sezon {f.season}/{f.season + 1} · {p.toneLabel}
              </p>
            </details>
          );
        })}
      </div>
      {!shown.length && <p>Brak wydarzeń dla wybranego filtra.</p>}
      <h3>Archiwum sezonów i występów</h3>
      {[...(career.completedSeasons ?? [])]
        .filter((s) => year === 'all' || s.label.startsWith(year))
        .reverse()
        .map((s) => (
          <SeasonHistory key={s.seasonId} career={career} season={s} />
        ))}
    </div>
  );
};
