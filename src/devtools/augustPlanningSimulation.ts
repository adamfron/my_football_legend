import type { AugustActivityId, CareerState } from '../types/domain';
import {
  advanceAugustWeek,
  augustActivities,
  canChooseAugustActivity,
  getAvailableFunds,
  initializeAugustPhase,
  resolveAugustActivity,
} from '../core/augustPlanning';

export type AugustStrategy =
  | 'always_train'
  | 'always_rest'
  | 'always_work'
  | 'invest_when_affordable'
  | 'mixed';
export interface AugustSimulationReport {
  samples: number;
  strategies: Record<
    AugustStrategy,
    {
      fitnessChange: number;
      moraleChange: number;
      averageFunds: number;
      averageDevelopment: number;
      attributeGains: number;
      overloadRate: number;
      activityShare: Record<string, number>;
    }
  >;
  alerts: string[];
}
const strategies: AugustStrategy[] = [
  'always_train',
  'always_rest',
  'always_work',
  'invest_when_affordable',
  'mixed',
];
const choice = (career: CareerState, strategy: AugustStrategy, week: number): AugustActivityId =>
  strategy === 'always_train'
    ? 'extra_individual_training'
    : strategy === 'always_rest'
      ? 'prioritize_recovery'
      : strategy === 'always_work'
        ? 'food_delivery_shift'
        : strategy === 'invest_when_affordable' &&
            canChooseAugustActivity(career, 'hire_personal_coach')
          ? 'hire_personal_coach'
          : strategy === 'mixed'
            ? augustActivities[(week + career.seed.length) % augustActivities.length]!.id
            : 'prioritize_recovery';
export const simulateAugustPlanning = (
  base: CareerState,
  samples = 500,
): AugustSimulationReport => {
  const report = {} as AugustSimulationReport['strategies'];
  for (const strategy of strategies) {
    let fitness = 0,
      morale = 0,
      funds = 0,
      development = 0,
      gains = 0,
      overloads = 0,
      total = 0;
    const counts: Record<string, number> = {};
    for (let seed = 0; seed < samples; seed++) {
      const {
        augustPlanning: _plan,
        finances: _finances,
        developmentProgress: _progress,
        ...cleanBase
      } = base;
      void _plan;
      void _finances;
      void _progress;
      let career = initializeAugustPhase({
        ...cleanBase,
        seed: `simulation-${seed}`,
        historyFacts: base.historyFacts.filter(
          (f) => f.factType !== 'august_2026_started' && f.factType !== 'august_2026_completed',
        ),
      });
      const startFitness = career.player.fitness,
        startMorale = career.player.morale,
        startAttributes = Object.values(career.player.attributes).reduce((a, b) => a + b, 0);
      for (let week = 0; week < 4; week++) {
        const activity = choice(career, strategy, week);
        counts[activity] = (counts[activity] ?? 0) + 1;
        career = resolveAugustActivity(career, activity);
        const result = career.augustPlanning?.results.at(-1);
        if (result?.overloaded) overloads++;
        total++;
        career = advanceAugustWeek(career);
      }
      fitness += career.player.fitness - startFitness;
      morale += career.player.morale - startMorale;
      funds += getAvailableFunds(career);
      development += (career.developmentProgress ?? []).reduce((sum, p) => sum + p.progress, 0);
      gains += Object.values(career.player.attributes).reduce((a, b) => a + b, 0) - startAttributes;
    }
    report[strategy] = {
      fitnessChange: fitness / samples,
      moraleChange: morale / samples,
      averageFunds: funds / samples,
      averageDevelopment: development / samples,
      attributeGains: gains,
      overloadRate: overloads / total,
      activityShare: Object.fromEntries(
        Object.entries(counts).map(([id, count]) => [id, count / total]),
      ),
    };
  }
  const alerts: string[] = [];
  if (report.always_train.fitnessChange >= report.always_rest.fitnessChange)
    alerts.push('Trening może być zawsze najlepszy.');
  if (report.always_work.averageFunds <= 0) alerts.push('Gracz bankrutuje zbyt często.');
  if (report.always_rest.fitnessChange <= 0) alerts.push('Odpoczynek nigdy nie ma sensu.');
  if (report.always_train.attributeGains > samples * 2)
    alerts.push('Atrybuty rosną zdecydowanie za szybko.');
  return { samples, strategies: report, alerts };
};
