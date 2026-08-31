import type { LeagueFixture, SeasonParticipationRecord } from '../types/domain';
import { ClubStrengthTooltip } from './ClubStrengthTooltip';
import { MatchParticipationSummary } from './MatchParticipationSummary';

const months = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const date = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${months[(m ?? 1) - 1]}`;
};

export interface CompactFixtureItem {
  fixture: LeagueFixture;
  opponentName: string;
  venue: 'home' | 'away';
  participation?: SeasonParticipationRecord | undefined;
  opponentStrength?: number;
}
export const CompactFixtureRow = ({ item }: { item: CompactFixtureItem }) => {
  const { fixture, opponentName, venue, participation } = item;
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
          <MatchParticipationSummary participation={participation} />
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
