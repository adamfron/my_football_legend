import type { LeagueFixture, SeasonParticipationRecord } from '../types/domain';
import { ClubStrengthTooltip } from './ClubStrengthTooltip';

const months = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const date = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${months[(m ?? 1) - 1]}`;
};
const rating = (value?: number) => (value === undefined ? '—' : value.toFixed(1).replace('.', ','));

export interface CompactFixtureItem {
  fixture: LeagueFixture;
  opponentName: string;
  venue: 'home' | 'away';
  participation: SeasonParticipationRecord;
  opponentStrength?: number;
}
export const CompactFixtureRow = ({ item }: { item: CompactFixtureItem }) => {
  const { fixture, opponentName, venue, participation } = item;
  const status =
    participation?.status === 'injured'
      ? 'kontuzja'
      : participation?.status === 'suspended'
        ? 'zawieszenie'
        : participation?.status === 'unfit'
          ? 'niezdolny do gry'
          : participation?.status === 'unused_bench'
            ? 'ławka, bez wejścia'
            : participation?.status === 'not_selected'
              ? 'poza kadrą'
              : 'bez występu';
  return (
    <div className="compact-fixture-row">
      <span>{date(fixture.date)}</span>
      <strong>
        {item.opponentStrength === undefined ? (
          opponentName
        ) : (
          <ClubStrengthTooltip name={opponentName} strength={item.opponentStrength} />
        )}{' '}
        ({venue === 'home' ? 'D' : 'W'})
      </strong>
      <span>{fixture.completed ? `${fixture.homeGoals}:${fixture.awayGoals}` : '—'}</span>
      {fixture.completed && (
        <span>
          {participation.minutes
            ? participation.goalkeeperStats
              ? `${participation.minutes}' · ${participation.goalkeeperStats.saves} obr. · ${participation.goalkeeperStats.cleanSheet ? 'CS · ' : ''}${rating(participation.goalkeeperStats.rating)}`
              : `${participation.minutes}' · ${participation.goals} G · ${participation.assists} A · ${rating(participation.rating)}`
            : status}
        </span>
      )}
    </div>
  );
};
export const CompactFixtureList = ({ items }: { items: CompactFixtureItem[] }) => (
  <div className="compact-fixture-list">
    {items.map((item) => (
      <CompactFixtureRow key={item.fixture.id} item={item} />
    ))}
  </div>
);
