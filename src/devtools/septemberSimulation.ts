import type { CareerState, SquadStatus } from '../types/domain';
import {
  advanceMatch,
  advanceSeptemberWeek,
  initializeSeptemberPhase,
  MATCH_MOMENT_LIBRARY,
  resolveMatchDecision,
  startSeptemberMatch,
} from '../core/septemberMatches';
export interface SeptemberSimulationReport {
  seeds: number;
  statusRates: Record<SquadStatus, number>;
  averageMinutes: number;
  goals: Record<string, number>;
  assists: Record<string, number>;
  results: Record<'W' | 'D' | 'L', number>;
  averagePersonalImpact: number;
  ratings: {
    average: number;
    median: number;
    p10: number;
    p90: number;
    below55: number;
    atLeast70: number;
    atLeast80: number;
    lowest: number;
    highest: number;
    starters: number;
    substitutes: number;
  };
  tiers: Record<string, number>;
  warnings: string[];
}
export const simulateSeptemberMatches = (
  baseCareer: CareerState,
  seeds = 1000,
): SeptemberSimulationReport => {
  const statuses = Object.fromEntries(
    [
      'senior_starter',
      'senior_bench',
      'senior_out',
      'academy_starter',
      'academy_bench',
      'no_match',
    ].map((k) => [k, 0]),
  ) as Record<SquadStatus, number>;
  const goals: Record<string, number> = {},
    assists: Record<string, number> = {},
    results = { W: 0, D: 0, L: 0 },
    tiers: Record<string, number> = {};
  let minutes = 0,
    impact = 0,
    appearances = 0;
  const ratings: number[] = [],
    starterRatings: number[] = [],
    substituteRatings: number[] = [];
  for (let s = 0; s < seeds; s++) {
    let c = initializeSeptemberPhase({ ...baseCareer, seed: `${baseCareer.seed}:${s}` });
    for (let week = 0; week < 4; week++) {
      c = startSeptemberMatch(c);
      const m = c.activeMatch!;
      statuses[m.squadStatus]++;
      c = advanceMatch(c);
      while (c.activeMatch && !c.activeMatch.completed) {
        const def = MATCH_MOMENT_LIBRARY.find(
          (x) => x.id === c.activeMatch!.currentMoment?.definitionId,
        );
        c = def
          ? resolveMatchDecision(c, def.decisions[s % def.decisions.length]!.id)
          : advanceMatch(c);
      }
      const a = c.matchHistory?.at(-1);
      if (a) {
        minutes += a.minutes;
        impact += a.personalImpact;
        appearances++;
        goals[a.goals] = (goals[a.goals] ?? 0) + 1;
        assists[a.assists] = (assists[a.assists] ?? 0) + 1;
        if (a.rating !== undefined) {
          ratings.push(a.rating);
          (a.started ? starterRatings : substituteRatings).push(a.rating);
        }
      }
      c.activeMatch?.resolvedMoments.forEach((r) => (tiers[r.tier] = (tiers[r.tier] ?? 0) + 1));
      const final = c.activeMatch!;
      const f = final.venue === 'home' ? final.homeGoals : final.awayGoals,
        o = final.venue === 'home' ? final.awayGoals : final.homeGoals;
      results[f > o ? 'W' : f < o ? 'L' : 'D']++;
      c = advanceSeptemberWeek(c);
    }
  }
  const total = seeds * 4;
  const statusRates = Object.fromEntries(
    Object.entries(statuses).map(([k, v]) => [k, v / total]),
  ) as Record<SquadStatus, number>;
  const warnings: string[] = [];
  if (statusRates.senior_starter > 0.8) warnings.push('Junior prawie zawsze zaczyna w seniorach.');
  if ((statuses.senior_starter + statuses.senior_bench) / total < 0.05)
    warnings.push('Junior prawie nigdy nie dostaje szansy seniorów.');
  if (Object.entries(goals).some(([g, n]) => Number(g) >= 3 && n / total > 0.1))
    warnings.push('Rozkład goli wygląda zbyt wysoko.');
  const sorted = [...ratings].sort((a, b) => a - b),
    mean = (values: number[]) =>
      values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
    quantile = (q: number) => sorted[Math.floor((sorted.length - 1) * q)] ?? 0;
  if (ratings.length && ratings.filter((r) => r > 7).length / ratings.length > 0.85)
    warnings.push('Prawie każdy oceniony występ kończy się notą powyżej 7.');
  if (ratings.length && ratings.filter((r) => r >= 7).length / ratings.length < 0.05)
    warnings.push('Prawie nikt nie przekracza oceny 7.');
  return {
    seeds,
    statusRates,
    averageMinutes: minutes / appearances,
    goals,
    assists,
    results,
    averagePersonalImpact: impact / appearances,
    ratings: {
      average: mean(ratings),
      median: quantile(0.5),
      p10: quantile(0.1),
      p90: quantile(0.9),
      below55: ratings.filter((r) => r < 5.5).length / Math.max(1, ratings.length),
      atLeast70: ratings.filter((r) => r >= 7).length / Math.max(1, ratings.length),
      atLeast80: ratings.filter((r) => r >= 8).length / Math.max(1, ratings.length),
      lowest: sorted[0] ?? 0,
      highest: sorted.at(-1) ?? 0,
      starters: mean(starterRatings),
      substitutes: mean(substituteRatings),
    },
    tiers,
    warnings,
  };
};
