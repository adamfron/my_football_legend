import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ClubStrengthTooltip } from '../../components/ClubStrengthTooltip';
import { getClubStrength } from '../../core/clubStrength';
import { squadRoleLabel } from '../../core/careerPresentation';
import { advanceSimulationStep, getCareerProgressBlocker } from '../../core/careerSimulation';
import { getLeagueTable } from '../../core/leagueSeason';
import { getPlayerOverall } from '../../core/playerOverall';
import { buildSeasonTimeline } from '../../core/seasonTimeline';
import type { CareerState } from '../../types/domain';
import { ClubView } from './ClubView';
import { HistoryView } from './HistoryView';
import { PlayerCard } from '../shared/PlayerCard';

export const PLAYBACK_INTERVAL_MS = 1000;
type Detail = 'player' | 'club' | 'contract' | 'career';

const palette = ['#285f8f', '#7b3f57', '#376b4a', '#875d22', '#554c8a', '#276c70'];
const clubAccent = (id: string) =>
  palette[
    [...id].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7) %
      palette.length
  ];
const money = (value: number) => `${value.toLocaleString('pl-PL')} PLN`;
const initials = (value: string) =>
  value
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const CareerView = ({
  career,
  onCareer,
  decisionPanel,
}: {
  career: CareerState;
  onCareer: (career: CareerState) => void;
  decisionPanel?: ReactNode;
}) => {
  const [playing, setPlaying] = useState(false);
  const [detail, setDetail] = useState<Detail>();
  const [error, setError] = useState<string>();
  const tableRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLOListElement>(null);
  const table = getLeagueTable(career);
  const timeline = buildSeasonTimeline(career);
  const controlledClubId = career.leagueSeason?.controlledClubId ?? career.currentClub.id;
  const own = table.find((row) => row.clubId === controlledClubId);
  const completedCount = timeline.filter((entry) => entry.status === 'completed').length;
  const accent = useMemo(() => clubAccent(career.currentClub.id), [career.currentClub.id]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      try {
        const next = advanceSimulationStep(career);
        onCareer(next);
        if (
          getCareerProgressBlocker(next) ||
          (next.decisionPoint && next.decisionPoint.type !== 'checkpoint')
        )
          setPlaying(false);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
        setPlaying(false);
      }
    }, PLAYBACK_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [career, onCareer, playing]);

  useEffect(() => {
    const row = tableRef.current?.querySelector<HTMLElement>('tr[aria-current="true"]');
    row?.scrollIntoView?.({ block: 'center' });
  }, [controlledClubId, table.length]);

  useEffect(() => {
    const entries = timelineRef.current?.querySelectorAll<HTMLElement>('[data-resolved="true"]');
    entries?.item(entries.length - 1)?.scrollIntoView?.({ block: 'center' });
  }, [completedCount]);

  const toggle = (next: Detail) => setDetail((current) => (current === next ? undefined : next));
  const seasonName = career.leagueSeason?.name ?? String(career.currentSeason);
  const balance = (career.finances ?? []).reduce((sum, item) => sum + item.amount, 0);
  const fixtures = career.leagueSeason?.rounds.flatMap((round) => round.fixtures) ?? [];
  const clubName = (id: string) =>
    career.leagueSeason?.clubs.find((club) => club.clubId === id)?.name ?? id;

  return (
    <main className="career-view" style={{ '--club-accent': accent } as CSSProperties}>
      <header className="career-header">
        <strong>MY FOOTBALL LEGEND</strong>
        <span>Sezon {seasonName}</span>
        <button
          aria-pressed={playing}
          onClick={() => {
            setError(undefined);
            setDetail(undefined);
            setPlaying((value) => !value);
          }}
        >
          {playing ? '❚❚ Pauza' : '▶ Graj'}
        </button>
      </header>

      <div className="summary-strip">
        <button className={detail === 'player' ? 'selected' : ''} onClick={() => toggle('player')}>
          <span className="summary-visual player-placeholder" aria-hidden="true">
            {initials(`${career.player.firstName} ${career.player.lastName}`)}
          </span>
          <span className="summary-copy">
            <small>ZAWODNIK</small>
            <strong>
              {career.player.firstName} {career.player.lastName}
            </strong>
            <b>
              {getPlayerOverall(career.player, career.player.primaryPosition)} OVR ·{' '}
              {career.player.age} lat
            </b>
            <span>
              kondycja {career.player.fitness} · morale {career.player.morale}
            </span>
          </span>
        </button>
        <button className={detail === 'club' ? 'selected' : ''} onClick={() => toggle('club')}>
          <span className="summary-visual crest-placeholder" aria-hidden="true">
            {initials(career.currentClub.name)}
          </span>
          <span className="summary-copy">
            <small>KLUB</small>
            <strong>{career.currentClub.name}</strong>
            <b>{own?.position ?? '—'}. miejsce</b>
            <span>
              {career.leagueSeason?.competition.name ?? 'Rozgrywki klubowe'} · siła{' '}
              {career.currentProfessionalClub
                ? Math.round(getClubStrength(career.currentProfessionalClub))
                : '—'}
            </span>
          </span>
        </button>
        <button
          className={detail === 'contract' ? 'selected' : ''}
          onClick={() => toggle('contract')}
        >
          <small>KONTRAKT / FINANSE</small>
          <strong>
            {career.currentContract
              ? money(career.currentContract.monthlySalary) + ' / mies.'
              : 'Brak kontraktu'}
          </strong>
          <span>
            {career.currentContract ? `do ${career.currentContract.endDate}` : '—'} · saldo{' '}
            {money(balance)}
          </span>
        </button>
        <button className={detail === 'career' ? 'selected' : ''} onClick={() => toggle('career')}>
          <small>KARIERA</small>
          <strong>Sezon {career.careerSeasonNumber}</strong>
          <b>
            Najwyższy OVR{' '}
            {career.highestOVR ?? getPlayerOverall(career.player, career.player.primaryPosition)}
          </b>
          <span>{career.completedSeasons?.length ?? 0} zakończonych sezonów</span>
        </button>
      </div>

      {detail && (
        <section className="detail-panel">
          <header className="detail-titlebar">
            <strong>
              {detail === 'player'
                ? 'ZAWODNIK'
                : detail === 'club'
                  ? 'KLUB'
                  : detail === 'contract'
                    ? 'KONTRAKT / FINANSE'
                    : 'KARIERA'}
            </strong>
            <button
              className="detail-close"
              aria-label="Zamknij"
              onClick={() => setDetail(undefined)}
            >
              ×
            </button>
          </header>
          {detail === 'player' && (
            <div className="player-detail">
              <PlayerCard
                profile={{
                  player: career.player,
                  profileDescriptionKey: 'creator.profileDescription',
                  profileDescriptionParams: {
                    strong1: 'attribute.technique',
                    strong2: 'attribute.vision',
                    weak: 'attribute.defending',
                    position: `position.${career.player.primaryPosition}`,
                  },
                  rollIndex: 0,
                }}
                seed={career.seed}
                baseline={career.seasonStartingAttributes}
              />
              <fieldset className="match-presentation-control">
                <legend>MECZE</legend>
                <label>
                  <input
                    type="radio"
                    name="match-presentation"
                    checked={career.player.matchPresentation !== 'simulate_all'}
                    onChange={() =>
                      onCareer({
                        ...career,
                        player: { ...career.player, matchPresentation: 'important_matches' },
                      })
                    }
                  />
                  Graj ważne mecze
                </label>
                <label>
                  <input
                    type="radio"
                    name="match-presentation"
                    checked={career.player.matchPresentation === 'simulate_all'}
                    onChange={() =>
                      onCareer({
                        ...career,
                        player: { ...career.player, matchPresentation: 'simulate_all' },
                      })
                    }
                  />
                  Symuluj wszystkie
                </label>
              </fieldset>
            </div>
          )}
          {detail === 'club' && <ClubView career={career} />}
          {detail === 'career' && <HistoryView career={career} />}
          {detail === 'contract' && (
            <div>
              <h2>Kontrakt i finanse</h2>
              <p>
                {career.currentContract
                  ? `${money(career.currentContract.monthlySalary)} miesięcznie, do ${career.currentContract.endDate}. Rola: ${squadRoleLabel(career.currentContract.squadRole)}.`
                  : 'Nie masz obecnie kontraktu.'}
              </p>
              <p>Dostępne środki: {money(balance)}</p>
            </div>
          )}
        </section>
      )}

      {decisionPanel && <section className="career-decision">{decisionPanel}</section>}
      {error && (
        <p className="career-error" role="alert">
          Playback zatrzymany: {error}
        </p>
      )}

      <div className="season-workspace">
        <section className="season-pane">
          <header>
            <h2>TABELA LIGOWA</h2>
            <span>{career.leagueSeason?.currentRound ?? 0}. kolejka</span>
          </header>
          <div className="pane-scroll table-scroll" ref={tableRef}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Klub</th>
                  <th>M</th>
                  <th>W</th>
                  <th>R</th>
                  <th>P</th>
                  <th>BR</th>
                  <th>+/-</th>
                  <th>PKT</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => (
                  <tr
                    key={row.clubId}
                    aria-current={row.clubId === controlledClubId ? 'true' : undefined}
                  >
                    <td>{row.position}</td>
                    <td>
                      <ClubStrengthTooltip
                        name={row.clubName}
                        strength={
                          career.leagueSeason?.clubs.find((club) => club.clubId === row.clubId)
                            ?.strength ?? 50
                        }
                      />
                    </td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td>
                      {row.goalsFor}:{row.goalsAgainst}
                    </td>
                    <td>{row.goalDifference}</td>
                    <td>
                      <strong>{row.points}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="season-pane">
          <header>
            <h2>OŚ SEZONU</h2>
            <span>{timeline.length} wpisów</span>
          </header>
          <ol className="pane-scroll season-timeline" aria-label="Oś sezonu" ref={timelineRef}>
            {timeline.map((entry) => {
              if (entry.kind === 'fixture') {
                const fixture = fixtures.find((item) => item.id === entry.fixtureId);
                const score = fixture?.completed
                  ? `${fixture.homeGoals}:${fixture.awayGoals}`
                  : '—';
                const participation = entry.participation;
                const summary = participation?.minutes
                  ? `${participation.minutes}' · ${participation.goals} G · ${participation.assists} A${participation.rating ? ` · ${participation.rating.toFixed(1)}` : ''}`
                  : participation?.fixtureStatus === 'completed'
                    ? 'poza składem'
                    : 'nadchodzący mecz';
                return (
                  <li
                    key={`fixture:${entry.sourceId}`}
                    className={entry.status !== 'completed' ? 'upcoming' : ''}
                    data-resolved={entry.status === 'completed'}
                  >
                    <time>{entry.date.slice(5).split('-').reverse().join('.')}</time>
                    <div>
                      <strong>
                        {fixture
                          ? `${clubName(fixture.homeClubId)} – ${clubName(fixture.awayClubId)}`
                          : 'Mecz'}
                      </strong>
                      <span>{summary}</span>
                    </div>
                    <b>{score}</b>
                  </li>
                );
              }
              const label =
                entry.status === 'completed' ? 'Wydarzenie zakończone' : 'Zaplanowane wydarzenie';
              return (
                <li
                  key={`${entry.kind}:${entry.sourceId}`}
                  className={`timeline-${entry.kind}`}
                  data-resolved={entry.status === 'completed'}
                >
                  <time>{entry.date.slice(5).split('-').reverse().join('.')}</time>
                  <div>
                    <strong>{label}</strong>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </main>
  );
};
