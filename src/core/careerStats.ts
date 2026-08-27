import type { CompletedSeasonSnapshot, SeasonParticipationRecord } from '../types/domain';
import { getParticipationTotals } from './seasonParticipation';

export const assertFixtureLedger = (fixtures: SeasonParticipationRecord[]) => {
  if (new Set(fixtures.map((fixture) => fixture.fixtureId)).size !== fixtures.length)
    throw new Error('Duplicate fixtureId in career fixture ledger.');
  for (const fixture of fixtures) {
    if (fixture.minutes < 0) throw new Error('Invalid fixture.');
    if (
      !fixture.minutes &&
      (fixture.started || fixture.goals || fixture.assists || fixture.xG || fixture.xA)
    )
      throw new Error('A zero-minute fixture cannot contain appearance statistics.');
  }
  const totals = getParticipationTotals(fixtures);
  if (totals.starts > totals.appearances) throw new Error('Starts cannot exceed appearances.');
  return totals;
};

export const getCareerTotals = (seasons: CompletedSeasonSnapshot[]) =>
  seasons.reduce(
    (total, season) => ({
      appearances: total.appearances + season.player.appearances,
      starts: total.starts + season.player.starts,
      minutes: total.minutes + season.player.minutes,
      goals: total.goals + season.player.goals,
      assists: total.assists + season.player.assists,
    }),
    { appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0 },
  );
