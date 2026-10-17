/* global console */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = (name) => JSON.parse(readFileSync(`docs/performance/${name}.json`, 'utf8'));
const before = read('PR171-baseline'),
  after = read('PR172-after-baseline');
const beforeFunnel = read('PR171-attacking-funnel'),
  afterFunnel = read('PR172-after-attacking-funnel');
const key = (r) =>
  `${typeof r.fixture === 'string' ? r.fixture : r.fixture.family}:${typeof r.fixture === 'string' ? r.reversed : r.fixture.reversed}`;
const originals = new Map(before.fixtures.map((r) => [key(r), r]));
const matched = after.fixtures.filter((r) => originals.has(key(r)));
if (matched.length !== 12) throw new Error('Must retain all 12 originally complete fixtures');
for (const r of matched)
  if (
    r.fixture.fixtureHash !== originals.get(key(r)).fixture.fixtureHash ||
    r.initialStateHash !== originals.get(key(r)).initialStateHash
  )
    throw new Error(`Fixture changed: ${key(r)}`);
const afterRows = after.teamRows.filter((r) => originals.has(key(r)));
const sum = (values) => values.reduce((a, b) => a + b, 0),
  mean = (v) => sum(v) / v.length;
const quantile = (v, p) => {
  const a = [...v].sort((a, b) => a - b),
    i = (a.length - 1) * p,
    l = Math.floor(i);
  return a[l] + (a[Math.ceil(i)] - a[l]) * (i - l);
};
const distribution = (v) => ({
  n: v.length,
  mean: mean(v),
  median: quantile(v, 0.5),
  p10: quantile(v, 0.1),
  p90: quantile(v, 0.9),
  min: Math.min(...v),
  max: Math.max(...v),
  sd: Math.sqrt(mean(v.map((x) => (x - mean(v)) ** 2))),
});
const maps = (rows) => {
  const result = {};
  for (const r of rows)
    for (const [k, v] of Object.entries(r ?? {})) result[k] = (result[k] ?? 0) + v;
  return result;
};
const summary = (rows) => {
  const totals = Object.fromEntries(
    [
      'passesAttempted',
      'passesCompleted',
      'shots',
      'shotsOnTarget',
      'goals',
      'blockedShots',
      'corners',
      'carries',
      'possessionLost',
      'tacklesAttempted',
      'tacklesWon',
      'interceptions',
    ].map((k) => [k, sum(rows.map((r) => r[k] ?? 0))]),
  );
  totals.centralReceptions = sum(
    rows.map((r) => r.roleGroups.central_midfielder?.passesReceived ?? 0),
  );
  return {
    totals,
    centralShare: totals.centralReceptions / totals.passesCompleted,
    counters: maps(rows.map((r) => r.counters)),
    turnoverCauses: maps(rows.map((r) => r.accounting.turnoverCauses)),
    distributions: Object.fromEntries(
      Object.keys(before.summary).map((k) => [
        k,
        distribution(rows.map((r) => r[k]).filter((v) => typeof v === 'number')),
      ]),
    ),
  };
};
const stages = (rows) => maps(rows.map((r) => r.stages));
const baseline = summary(before.teamRows),
  corrected = summary(afterRows);
const cells = before.teamRows.map((old) => {
  const current = afterRows.find((r) => key(r) === key(old) && r.side === old.side);
  return {
    fixture: old.fixture,
    reversed: old.reversed,
    side: old.side,
    delta: Object.fromEntries(
      Object.keys(baseline.totals)
        .filter((k) => k !== 'centralReceptions')
        .map((k) => [k, (current[k] ?? 0) - (old[k] ?? 0)]),
    ),
  };
});
const afterF = afterFunnel.rows.filter((r) => originals.has(key(r)));
const saves = (fixtures) => sum(fixtures.flatMap((r) => r.statistics.players.map((p) => p.saves)));
baseline.totals.saves = saves(before.fixtures);
corrected.totals.saves = saves(matched);
const tactics = read('PR172-tactical-experiments');
const tacticalFactors = {};
for (const factor of [
  ...new Set(tactics.rows.flatMap((r) => r.experiments.map((e) => e.factor))),
]) {
  const pairs = tactics.rows
    .map((r) => ({ base: r.experiments[0], test: r.experiments.find((e) => e.factor === factor) }))
    .filter((r) => r.test);
  const values = (side) => ({
    n: pairs.length,
    meanMaxOwnedForwardMetres: mean(pairs.map((p) => p[side].continuation.maxOwnedProgress)),
    losses: sum(pairs.map((p) => p[side].continuation.losses)),
    finalPresent: sum(pairs.map((p) => Number(p[side].continuation.finalEntry))),
    boxPresent: sum(pairs.map((p) => Number(p[side].continuation.boxEntry))),
  });
  tacticalFactors[factor] = {
    baseline: values('base'),
    counterfactual: values('test'),
    selectedActionChanged: sum(
      pairs.map((p) =>
        Number(JSON.stringify(p.base.ranking.selected) !== JSON.stringify(p.test.ranking.selected)),
      ),
    ),
  };
}
const rawBefore = read('PR172-before-restart-continuity'),
  rawAfter = read('PR172-after-restart-continuity');
const carry = rawBefore.carry.map((b) => {
  const a = rawAfter.carry.find((a) => a.name === b.name);
  return { name: b.name, before: b, after: a };
});
const result = {
  version: 1,
  method:
    'Same 12 initially complete fixtures, 24 dependent team observations; all 16 final fixtures separately retained. No success-conditioned removals. No independent league inference from mirrors or two quality contexts.',
  baselineCommit: read('PR172-baseline-manifest').baselineCommit,
  afterSourceHash: after.fixtures[0].manifest.sourceHash,
  historicalFilesUntouched: read('PR172-baseline-manifest').evidence.every(
    (e) =>
      createHash('sha256')
        .update(readFileSync(`docs/performance/${e.name}`))
        .digest('hex') === e.sha256,
  ),
  completion: {
    before: { attempts: 16, full: 12, crashes: 2, censored: 2 },
    after: {
      attempts: after.fixtures.length + after.censored.length,
      full: after.fixtures.length,
      censored: after.censored.length,
      crashes: 0,
    },
  },
  matched: {
    before: baseline,
    after: corrected,
    stagesBefore: stages(beforeFunnel.rows),
    stagesAfter: stages(afterF),
    teamPairedDeltas: cells,
  },
  additionalCompleted: after.fixtures
    .filter((r) => !originals.has(key(r)))
    .map((r) => ({
      fixture: r.fixture,
      status: r.status,
      time: r.time,
      score: r.score,
      official: r.official,
    })),
  tacticalFactors,
  carry,
  restarts: { before: rawBefore.restarts, after: rawAfter.restarts },
  limits: [
    'Full-cohort individual restart-duration distribution was not retained in PR171; stopped/live time and exact frozen/controlled restart latencies remain separate.',
    'Human prompt and carry measurements are nine controlled probes and separately identified natural-state examples, not population frequencies.',
    'Frozen support displacement is an endpoint counterfactual, not proof a positioning policy creates it.',
    'No universal passing utility or positional CM bonus was deployed; shot volume can decrease after rejecting remote kicks.',
  ],
};
if (!result.historicalFilesUntouched) throw new Error('Historical PR171 evidence changed');
writeFileSync('docs/performance/PR172-comparison.json', JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      completion: result.completion,
      before: baseline.totals,
      after: corrected.totals,
      stagesBefore: result.matched.stagesBefore,
      stagesAfter: result.matched.stagesAfter,
    },
    null,
    2,
  ),
);
