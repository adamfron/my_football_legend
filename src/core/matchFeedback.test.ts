import { describe, expect, it } from 'vitest';
import { evaluateMatchRating, getSeasonPlayerSummary, normalizeTeamStats } from './matchFeedback';
import type { CareerState, MatchMomentResult, SeasonParticipationRecord } from '../types/domain';
const ledgerRecord = (
  fixtureId: string,
  overrides: Partial<SeasonParticipationRecord> = {},
): SeasonParticipationRecord => ({
  fixtureId,
  seasonId: '2026-27',
  competitionId: 'polish-u17',
  date: '2026-09-01',
  homeClubId: 'vistula',
  awayClubId: 'opponent',
  opponentId: 'opponent',
  venue: 'home',
  competition: 'Polska Liga U-17',
  fixtureStatus: 'completed',
  status: 'starter',
  plannedMinutes: 90,
  started: true,
  minutes: 90,
  goals: 0,
  assists: 0,
  xG: 0,
  xA: 0,
  ...overrides,
});
const result = (tier: MatchMomentResult['tier'], xG = 0.1): MatchMomentResult => ({
  moment: { definitionId: 'test', minute: 70, scoreFor: 0, scoreAgainst: 0, description: 'test' },
  decisionId: 'test',
  tier,
  personalImpact: tier === 'excellent' ? 3 : -3,
  teamImpact: 0,
  coachImpact: 0,
  narrative: '',
  goals: 0,
  assists: 0,
  xG,
  xA: 0,
  keyPasses: 0,
  defensiveActions: 0,
  saves: 0,
});
describe('match feedback', () => {
  it('keeps cards local to their season and ignores impossible zero-minute cards', () => {
    const career = {
      currentSeason: 2026,
      seasonParticipation: [
        ledgerRecord('card', { yellowCards: 1 }),
        ledgerRecord('phantom', {
          status: 'not_selected',
          started: false,
          minutes: 0,
          plannedMinutes: 0,
          yellowCards: 3,
          redCard: 'direct',
          rating: 9,
        }),
      ],
    } as CareerState;
    expect(getSeasonPlayerSummary(career, 2026).yellowCards).toBe(1);
    expect(getSeasonPlayerSummary(career, 2026)).toMatchObject({
      appearances: 1,
      yellowCards: 1,
      redCards: 0,
    });
  });

  it('counts a current-season dismissal and card exactly once', () => {
    const career = {
      currentSeason: 2027,
      seasonParticipation: [
        ledgerRecord('current-card', {
          date: '2028-03-01',
          minutes: 70,
          plannedMinutes: 70,
          yellowCards: 1,
          redCard: 'second_yellow',
          defensiveActions: 2,
        }),
      ],
    } as CareerState;
    expect(getSeasonPlayerSummary(career, 2027)).toMatchObject({
      yellowCards: 1,
      redCards: 1,
    });
  });
  it('does not rate zero minutes and clamps ratings', () => {
    expect(evaluateMatchRating({ position: 'striker', minutes: 0, results: [] })).toBeUndefined();
    expect(
      evaluateMatchRating({
        position: 'striker',
        minutes: 90,
        results: Array(30).fill(result('excellent')),
      }),
    ).toBe(10);
  });
  it('rewards good actions and penalizes a missed big chance more', () => {
    expect(
      evaluateMatchRating({ position: 'striker', minutes: 70, results: [result('excellent')] }),
    ).toBeGreaterThan(6);
    expect(
      evaluateMatchRating({ position: 'striker', minutes: 70, results: [result('costly', 0.65)] })!,
    ).toBeLessThan(
      evaluateMatchRating({ position: 'striker', minutes: 70, results: [result('costly', 0.05)] })!,
    );
  });
  it('keeps team statistics coherent', () => {
    const stats = normalizeTeamStats({
      home: { possession: 61, shots: 5, shotsOnTarget: 9, xG: -1, dangerousActions: 8 },
      away: { possession: 20, shots: 7, shotsOnTarget: 3, xG: 1.2, dangerousActions: 9 },
    });
    expect(stats.home.possession + stats.away.possession).toBe(100);
    expect(stats.home.shotsOnTarget).toBeLessThanOrEqual(stats.home.shots);
    expect(stats.home.xG).toBe(0);
  });
  it('aggregates only played and rated appearances', () => {
    const career = {
      currentSeason: 2026,
      seasonParticipation: [
        ledgerRecord('a', {
          goals: 1,
          xG: 0.7,
          xA: 0.1,
          keyPasses: 1,
          defensiveActions: 2,
          rating: 7.4,
        }),
        ledgerRecord('b', {
          status: 'not_selected',
          started: false,
          minutes: 0,
          plannedMinutes: 0,
        }),
      ],
    } as CareerState;
    const s = getSeasonPlayerSummary(career, 2026);
    expect(s).toMatchObject({
      appearances: 1,
      starts: 1,
      minutes: 90,
      goals: 1,
      averageRating: 7.4,
      bestMatchId: 'a',
      academyAppearances: 1,
    });
  });

  it('never lets contradictory legacy match history override the canonical ledger', () => {
    const seasonParticipation = Array.from({ length: 12 }, (_, index) =>
      ledgerRecord(`canonical-${index}`, { goals: index < 7 ? 1 : 0 }),
    );
    const matchHistory = Array.from({ length: 20 }, (_, index) => ({
      matchId: `legacy-${index}`,
      date: '2026-09-01',
      opponentId: 'x',
      teamLevel: 'senior' as const,
      started: true,
      minutes: 90,
      goals: index < 15 ? 1 : 0,
      assists: 0,
      xG: 0,
      xA: 0,
      keyPasses: 0,
      defensiveActions: 0,
      saves: 0,
      personalImpact: 0,
    }));
    const summary = getSeasonPlayerSummary(
      { currentSeason: 2026, seasonParticipation, matchHistory } as CareerState,
      2026,
    );
    expect(summary).toMatchObject({ appearances: 12, starts: 12, goals: 7 });
  });
});
