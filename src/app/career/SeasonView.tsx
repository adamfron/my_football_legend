import { ClubStrengthTooltip } from '../../components/ClubStrengthTooltip';
import { CompactFixtureList, type CompactFixtureItem } from '../../components/CompactFixtureList';
import { getLeagueTable } from '../../core/leagueSeason';
import { getSeasonProgress } from '../../core/seasonProgress';
import type { CareerState } from '../../types/domain';

export const SeasonView = ({ career }: { career: CareerState }) => {
  const table = getLeagueTable(career);
  const controlledClubId = career.leagueSeason?.controlledClubId ?? career.currentClub.id;
  const own = table.find((row) => row.clubId === controlledClubId);
  const season = career.leagueSeason;
  const fixtures =
    season?.rounds
      .flatMap((round) => round.fixtures)
      .filter((fixture) => [fixture.homeClubId, fixture.awayClubId].includes(controlledClubId)) ??
    [];
  const name = (id: string) => season?.clubs.find((club) => club.clubId === id)?.name ?? id;
  const compactFixtures: CompactFixtureItem[] = fixtures.map((fixture) => {
    const opponentStrength = season?.clubs.find(
      (club) =>
        club.clubId ===
        (fixture.homeClubId === controlledClubId ? fixture.awayClubId : fixture.homeClubId),
    )?.strength;
    return {
      fixture,
      opponentName: name(
        fixture.homeClubId === controlledClubId ? fixture.awayClubId : fixture.homeClubId,
      ),
      venue: fixture.homeClubId === controlledClubId ? 'home' : 'away',
      participation: career.seasonParticipation?.find((item) => item.fixtureId === fixture.id),
      ...(opponentStrength === undefined ? {} : { opponentStrength }),
    };
  });
  return (
    <section>
      <h2>Sezon {season?.name ?? getSeasonProgress(career).seasonLabel}</h2>
      <strong>{season?.competition.name}</strong>
      <p>
        {season?.currentRound ?? 0}. kolejka z {season?.rounds.length ?? 0} ·{' '}
        {career.currentClub.name} zajmuje {own?.position ?? '—'}. miejsce
      </p>
      <h3>Tabela</h3>
      <div className="table-wrap">
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
              <tr key={row.clubId} className={row.clubId === controlledClubId ? 'active' : ''}>
                <td>{row.position}</td>
                <td>
                  <ClubStrengthTooltip
                    name={row.clubName}
                    strength={
                      season?.clubs.find((club) => club.clubId === row.clubId)?.strength ?? 50
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
      <h3>Terminarz</h3>
      <CompactFixtureList items={compactFixtures} />
    </section>
  );
};
