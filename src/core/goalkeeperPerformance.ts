import type { GoalkeeperMatchStats, Player } from '../types/domain';
import { getPlayerOverall } from './playerOverall';
import { RandomGenerator } from './random/RandomGenerator';

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

/** Propassingal chance-quality model. TODO: replace xGA with post-shot xG when shots are simulated. */
export const simulateGoalkeeperPerformance = (
  player: Player,
  opponentAttack: number,
  form: number,
  seed: string,
): GoalkeeperMatchStats => {
  const rng = RandomGenerator.fromSeed(`${seed}:goalkeeper-performance`);
  const xGA = round(Math.max(0.15, 1.15 + (opponentAttack - 60) / 24 + rng.int(-35, 35) / 100));
  const ability = getPlayerOverall(player, 'goalkeeper');
  const performance = ability + (form - 3) * 2 + (player.fitness - 70) * 0.08 + rng.int(-9, 9);
  const prevented = (performance - opponentAttack) / 18 + rng.int(-20, 20) / 100;
  const goalsConceded = Math.max(0, Math.round(xGA - prevented));
  const shotsOnTargetFaced = Math.max(goalsConceded, Math.round(xGA * 3.1 + rng.int(0, 3)));
  const saves = Math.max(0, shotsOnTargetFaced - goalsConceded);
  const errorsLeadingToGoal =
    goalsConceded && performance < opponentAttack - 12 && rng.bool(0.24) ? 1 : 0;
  const rating = round(
    Math.max(
      3,
      Math.min(
        10,
        6.4 +
          saves * 0.16 +
          (xGA - goalsConceded) * 0.65 +
          (goalsConceded === 0 ? 0.25 : 0) -
          errorsLeadingToGoal * 1.2,
      ),
    ),
    1,
  );
  return {
    goalsConceded,
    shotsOnTargetFaced,
    saves,
    savePercentage: shotsOnTargetFaced ? round((saves / shotsOnTargetFaced) * 100, 1) : 100,
    cleanSheet: goalsConceded === 0,
    xGA,
    errorsLeadingToGoal,
    rating,
    detailsAvailable: true,
  };
};

export const getGoalsPrevented = (stats: Pick<GoalkeeperMatchStats, 'xGA' | 'goalsConceded'>) =>
  round(stats.xGA - stats.goalsConceded);
