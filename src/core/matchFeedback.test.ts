import { describe, expect, it } from 'vitest';
import { evaluateMatchRating, getSeasonPlayerSummary, normalizeTeamStats } from './matchFeedback';
import type { CareerState, MatchMomentResult } from '../types/domain';
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
      matchHistory: [
        {
          matchId: 'a',
          date: '2026-09-01',
          opponentId: 'x',
          teamLevel: 'senior',
          started: true,
          minutes: 90,
          goals: 1,
          assists: 0,
          xG: 0.7,
          xA: 0.1,
          keyPasses: 1,
          defensiveActions: 2,
          saves: 0,
          personalImpact: 2,
          rating: 7.4,
        },
        {
          matchId: 'b',
          date: '2026-09-08',
          opponentId: 'y',
          teamLevel: 'academy',
          started: false,
          minutes: 0,
          goals: 0,
          assists: 0,
          xG: 0,
          xA: 0,
          keyPasses: 0,
          defensiveActions: 0,
          saves: 0,
          personalImpact: 0,
        },
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
      seniorAppearances: 1,
      academyAppearances: 0,
    });
  });
});
