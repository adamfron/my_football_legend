import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { pushedTouchFixture } from './pr168Fixtures';
import { evaluateTacticalActions } from '../src/core/matchSimulation/tacticalActionEvaluator';

const baseline = JSON.parse(readFileSync('docs/performance/PR168-baseline.json', 'utf8'));
const current = JSON.parse(readFileSync('docs/performance/PR168-after.json', 'utf8'));
const countCarry = (report: typeof current) => {
  const rows = report.carryRows.filter(
    (row: { pressure: boolean; loose: boolean }) => !row.pressure && !row.loose,
  );
  return {
    n: rows.length,
    transientControlLosses: rows.filter((row: { lostOwnership: boolean }) => row.lostOwnership)
      .length,
    retainedAtFourSeconds: rows.filter((row: { recovered: boolean }) => row.recovered).length,
    sharpTurnsWithLoss: rows.filter(
      (row: { turn: boolean; lostOwnership: boolean }) => row.turn && row.lostOwnership,
    ).length,
  };
};
const passing = (report: typeof current) => {
  const rows = report.passing.filter(
    (row: { physical?: { released: boolean; censored: boolean } }) =>
      row.physical?.released && !row.physical.censored,
  );
  return {
    n: rows.length,
    meanCompletionForecast:
      rows.reduce(
        (sum: number, row: { predictedCompletion: number }) => sum + row.predictedCompletion,
        0,
      ) / rows.length,
    intendedReceiverContact: rows.filter(
      (row: { physical: { intendedReceiverContact: boolean } }) =>
        row.physical.intendedReceiverContact,
    ).length,
    completed: rows.filter(
      (row: { physical: { result: string } }) => row.physical.result === 'completed',
    ).length,
    retainedTwoSeconds: rows.filter(
      (row: { physical: { retainedTwoSecondsAfterCompletion: boolean } }) =>
        row.physical.retainedTwoSecondsAfterCompletion,
    ).length,
  };
};
const state = pushedTouchFixture().state;
const samples = [];
let actionCount = 0;
for (let i = 0; i < 12; i++) {
  const start = performance.now();
  actionCount = evaluateTacticalActions(state, state.controlledFootballerId!).actions.length;
  if (i >= 2) samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
const files = readdirSync('src/core', { recursive: true })
  .map(String)
  .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))
  .sort();
const sourceDigest = createHash('sha256')
  .update(
    files
      .map(
        (path) =>
          `${path.replaceAll('\\', '/')}\n${readFileSync(`src/core/${path}`, 'utf8').replaceAll('\r\n', '\n')}`,
      )
      .join('\n'),
  )
  .digest('hex');
const summary = {
  base: '2ddeb35',
  sourceDigest,
  carry: {
    baseline: countCarry(baseline),
    current: countCarry(current),
    limitation:
      'Four initially controlled unpressured cases; two sharp turns, two aligned repeats, both orientations. Other loose-ball cases remain separately visible; losing physical control is not automatically losing possession permanently.',
  },
  passing: {
    baseline: passing(baseline),
    current: passing(current),
    limitation:
      'Ten existing PR165 counterfactual probes, one seed and two conditions. This is empirical observation, not population probability calibration. New evaluative scores do not change production rankings.',
  },
  evaluator: {
    actionCount,
    calls: samples.length,
    medianMs: samples[Math.floor(samples.length / 2)],
    maxMs: samples.at(-1),
    invocation: 'On-demand paused-decision explanation, never an every-tick search.',
  },
  transfers: current.transferRows.map(
    (row: {
      position: string;
      age: number;
      ability: number;
      offers: {
        tier: number;
        actual: string;
        predicted: string;
        role: string;
        warning: string | null;
      }[];
    }) => ({
      position: row.position,
      age: row.age,
      ability: row.ability,
      count: row.offers.length,
      tiers: row.offers.map((offer) => offer.tier),
      predictionMismatches: row.offers.filter((offer) => offer.actual !== offer.predicted).length,
      misleadingImportantRoles: row.offers.filter(
        (offer) =>
          ['important_player', 'star_player'].includes(offer.role) &&
          offer.actual !== 'starting_xi',
      ).length,
      positionalWarnings: row.offers.filter((offer) => Boolean(offer.warning)).length,
    }),
  ),
};
writeFileSync('docs/performance/PR168-comparison.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
