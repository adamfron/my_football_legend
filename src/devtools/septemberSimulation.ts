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
  return {
    seeds,
    statusRates,
    averageMinutes: minutes / appearances,
    goals,
    assists,
    results,
    averagePersonalImpact: impact / appearances,
    tiers,
    warnings,
  };
};
