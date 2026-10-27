import process from 'node:process';
import console from 'node:console';
import { read, files, receipt } from './pr196Evidence.mjs';
import { finalMatchPaths } from './checkPr196Evidence.mjs';
import { eligiblePassOutcomes } from './pr196FullMatchOutcomes.mjs';
import { scoreCalibration } from '../src/core/matchSimulation/calibrationMetrics.ts';
const root = 'docs/performance/pr196',
  movement = read(`${root}/movement-v5.json.gz`),
  passes = read(`${root}/passes-v5.json.gz`),
  long = read(`${root}/long-pass-v4.json.gz`),
  counter = read(`${root}/counterfactuals-v2.json.gz`);
const harvest = files(root + '/harvest')
  .filter((p) => /-baseline-v1\.json\.gz$/.test(p) && !p.includes('-capture-'))
  .sort()
  .map((path) => ({ path, ...read(path) }));
const matches = finalMatchPaths().map((path) => ({ path, ...read(path) }));
const count = (xs, fn) => xs.filter(fn).length;
const eta = (xs, model) => {
  const ys = xs.filter((r) => r.actual !== null),
    errors = ys.map((r) => r[model] - r.actual),
    a = errors.map(Math.abs).sort((a, b) => a - b);
  return {
    n: a.length,
    censored: xs.length - a.length,
    bias: errors.reduce((s, x) => s + x, 0) / a.length,
    mae: a.reduce((s, x) => s + x, 0) / a.length,
    medianAbsolute: a[Math.floor(a.length / 2)],
    p95Absolute: a[Math.floor(a.length * 0.95)],
    maxAbsolute: a.at(-1),
  };
};
const score = (xs, model, event, prediction) => {
  const eligible = xs.filter((r) => r.outcome[event] !== null),
    pairs = eligible.map((r) => ({ probability: r[model][prediction], outcome: r.outcome[event] }));
  const positives = pairs.filter((p) => p.outcome),
    negatives = pairs.filter((p) => !p.outcome);
  let wins = 0;
  for (const a of positives)
    for (const b of negatives)
      wins += a.probability > b.probability ? 1 : a.probability === b.probability ? 0.5 : 0;
  return {
    ...scoreCalibration(pairs),
    auc: positives.length && negatives.length ? wins / (positives.length * negatives.length) : null,
    rejected: xs.filter((r) => !r.outcome.released).length,
    censoredOrNotApplicable: xs.length - eligible.length,
  };
};
const passScores = (xs) =>
  Object.fromEntries(
    ['old', 'corrected'].map((m) => [
      m,
      {
        directTouch: score(xs, m, 'directReceiverTouch', 'expectedCompletion'),
        retainedEndpoint: score(xs, m, 'teamPossessionAtOneSecond', 'expectedRetainedPossession'),
      },
    ]),
  );
const cf = counter.rows.flatMap((r) =>
  r.trials.map((t) => ({ ...t, design: r.design, policy: r.policy })),
);
const summary = {
  schema: 'pr196-summary-v1',
  classification:
    'paired controlled and autonomous development, not independent or real-world calibration',
  movement: {
    ...movement.summary,
    bySkill: Object.fromEntries(
      [20, 40, 60, 80, 100].map((s) => [
        s,
        Object.fromEntries(
          ['old', 'corrected'].map((m) => [
            m,
            eta(
              movement.rows.filter((r) => r.skill === s),
              m,
            ),
          ]),
        ),
      ]),
    ),
    byOrientation: Object.fromEntries(
      [...new Set(movement.rows.map((r) => r.name))].map((s) => [
        s,
        Object.fromEntries(
          ['old', 'corrected'].map((m) => [
            m,
            eta(
              movement.rows.filter((r) => r.name === s),
              m,
            ),
          ]),
        ),
      ]),
    ),
  },
  passing: {
    trials: passes.rows.length,
    byScenario: passes.summary,
    overall: passScores(passes.rows),
    bySkill: Object.fromEntries(
      [20, 40, 60, 80, 100].map((s) => [
        s,
        passScores(passes.rows.filter((r) => r.attacker === s)),
      ]),
    ),
    byDelivery: Object.fromEntries(
      ['ground', 'lofted'].map((d) => [
        d,
        passScores(passes.rows.filter((r) => r.action.delivery === d)),
      ]),
    ),
  },
  longPass: {
    originalTrials: long.original.length,
    directTouches: count(long.original, (r) => r.outcome.directReceiverTouch),
    allOpponentContacts: count(long.original, (r) => r.outcome.defensiveContactAt !== null),
    allOpponentControls: count(long.original, (r) => r.outcome.defensiveControlAt !== null),
    factorRows: long.rows.map((r) => ({
      factor: r.label,
      value: r.factor,
      touch: r.outcome.directReceiverTouch,
      control: r.outcome.receiverControl,
      miss: r.freeFlightMiss,
      defender: r.outcome.defensiveControlAt !== null,
    })),
    frozenBallDistinctHashes: new Set(long.frozen.map((r) => r.ballHash)).size,
    frozenReceiverContacts: count(long.frozen, (r) => r.outcome.directReceiverTouch),
  },
  harvest: {
    runs: harvest.length,
    seconds: harvest.reduce((n, r) => n + r.seconds, 0),
    captures: harvest.reduce((n, r) => n + r.captures.length, 0),
    byRun: harvest.map((r) => ({
      path: r.path,
      design: r.design,
      policy: r.policy,
      seed: r.seed,
      seconds: r.seconds,
      captures: r.captures.length,
      boundedPassStates: count(r.captures, (c) => c.boundedPassCount > 0),
      fullWorldPassStates: count(r.captures, (c) => c.fullWorldPassCount > 0),
      failure: r.failure,
    })),
  },
  counterfactual: {
    states: counter.rows.length,
    labelledAlternatives: cf.length,
    uniqueRequests: count(cf, (t) => !t.reused),
    decisionChanges: count(counter.rows, (r) => r.decisionChanged),
    passesRequested: count(cf, (t) => !t.reused && t.action.type === 'pass'),
    passReleases: count(
      cf,
      (t) => !t.reused && t.action.type === 'pass' && t.originalOutcome.released,
    ),
    rejectedPassRequests: count(
      cf,
      (t) => !t.reused && t.action.type === 'pass' && !t.originalOutcome.released,
    ),
    declinedProgressive: cf
      .filter((t) => t.label === 'progressive_declined')
      .map((t) => ({
        design: t.design,
        policy: t.policy,
        action: t.action,
        admitted: t.candidateMembership.boundedAdmitted,
        released: t.originalOutcome.released,
        touch: t.originalOutcome.directReceiverTouch,
        defenderControl: t.originalOutcome.defensiveControlAt !== null,
        retained: t.originalOutcome.teamPossessionAtOneSecond,
      })),
    missingBoundedPasses: count(
      cf,
      (t) => !t.reused && t.action.type === 'pass' && !t.candidateMembership.boundedExact,
    ),
    oldChoiceAndNewChoice: counter.rows
      .filter((r) => r.decisionChanged)
      .map((r) => ({
        capture: r.capture.path,
        design: r.design,
        policy: r.policy,
        before: r.before.selected,
        after: r.after.selected,
      })),
  },
  fullMatches: matches
    .filter((r) => !r.corrected)
    .map((old) => {
      const next = matches.find(
        (r) => r.corrected && r.design === old.design && r.policy === old.policy,
      );
      const summarize = (r) => {
        const episodes = eligiblePassOutcomes(r);
        return {
          path: r.path,
          status: r.status,
          score: r.score,
          passes: r.passes,
          shots: r.shots,
          receiverTouches: count(
            episodes,
            (p) => p.outcome.directReceiverTouch || p.outcome.deflectedReceiverTouch,
          ),
          receiverMetricDenominator: episodes.length,
          originOrImmediateRestartCensored: r.passOutcomes.length - episodes.length,
          controlledReceptions: count(episodes, (p) => p.outcome.receiverControl),
          defensiveContacts: count(episodes, (p) => p.outcome.defensiveContactAt !== null),
          defensiveControl: count(episodes, (p) => p.outcome.defensiveControlAt !== null),
          disruptionsWithoutControl: count(
            episodes,
            (p) =>
              p.outcome.defensiveDisruptionAt !== null && p.outcome.defensiveControlAt === null,
          ),
          progressiveAttempts: r.counts.progressiveAttempts,
          progressiveCompletions: count(
            episodes,
            (p) => p.progress >= 10 && p.outcome.directReceiverTouch,
          ),
          longPasses: r.counts.longPasses,
          throughBalls: r.counts.throughBalls,
          finalThirdEntries: r.football.finalThirdEntries,
          boxEntries: r.football.boxEntries,
          carries: r.football.carries,
          fouls: r.football.fouls ?? null,
          corners: r.time.restartDurations.corner?.count ?? 0,
          throwIns: r.time.restartDurations.throw_in?.count ?? 0,
          foulStoppages: r.time.restartDurations.foul?.count ?? 0,
          penaltyStoppages: r.time.restartDurations.penalty?.count ?? 0,
          time: r.time,
          boundedDecisionCounters: r.counts,
          performance: r.performance,
        };
      };
      return {
        design: old.design,
        policy: old.policy,
        before: summarize(old),
        after: summarize(next),
      };
    }),
  unresolvedMeasurementFields: [
    'total fouls including advantage are not instrumented; foul and penalty stoppages are separately recorded',
    'failed interception attempts have no complete opportunity denominator',
    'dangerous second balls / counterattacks / turnovers are not validated event classes',
    'carried distance progression is not counted from carry selections',
    'candidate-window reason counts only cover emitted bounded traces, not exhaustive policy internals',
  ],
  readiness:
    'NOT READY; B default; exact physics unchanged; corrected arrival opt-in; independent cohort sealed',
};
receipt(root + '/summary.json', summary, process.argv.includes('--check'));
console.log(
  'PR196 summary',
  summary.harvest.captures,
  'captures',
  summary.counterfactual.uniqueRequests,
  'unique counterfactuals',
  summary.fullMatches.length,
  'paired full matches',
);
