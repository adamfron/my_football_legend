import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import console from 'node:console';
import { digest, pr183SourceHash } from './pr183Evidence.mjs';
const read = (path) => JSON.parse(readFileSync(path));
const load = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.json.gz') && !f.includes('failure'))
    .map((f) => JSON.parse(gunzipSync(readFileSync(`${dir}/${f}`))));
const development = load('../pr183-development'),
  validation = load('../pr183-validation'),
  baseline = load('../pr183-baseline-comparison');
const freeze = read('docs/performance/PR183-freeze.json');
if (development.length !== 30 || validation.length !== 15 || baseline.length !== 3)
  throw Error('Complete declared cohorts are required');
const mean = (a) => a.reduce((n, v) => n + v, 0) / Math.max(1, a.length);
const sum = (a) => a.reduce((n, v) => n + v, 0);
const outcomeCounts = (rows) =>
  Object.fromEntries(
    [...new Set(rows.map((r) => r.status))].map((k) => [
      k,
      rows.filter((r) => r.status === k).length,
    ]),
  );
const compact = (d) => {
  const score = d.report.metadata.result,
    shotRows = d.realism.shots;
  const ids = new Set(d.report.summary.shots.map((s) => s.shotId));
  const matched = shotRows.filter((s) => ids.has(s.shot.shotId));
  const uncounted = shotRows.filter((s) => !ids.has(s.shot.shotId));
  return {
    id: d.design.id,
    cohort: d.cohort,
    tier: d.design.tier,
    policy: d.policy,
    inputHash: d.inputHash,
    sourceHash: d.productionHash,
    harnessHash: d.frozenHarnessHash,
    finalHash: d.finalHash,
    status: d.status,
    time: d.time,
    ticks: d.ticks,
    score,
    passes: d.official,
    shots: d.flow.shots,
    goals: score.home + score.away,
    shotDetails: shotRows.length,
    shotOutcomes: outcomeCounts(shotRows),
    shotDetailGap: d.flow.shots - matched.length,
    ledgerAttempts: d.report.summary.shots.length,
    matchedPhysicalDetails: matched.length,
    uncountedPhysicalReleases: uncounted.map((s) => ({
      shotId: s.shot.shotId,
      releasedAt: s.shot.releasedAt,
      status: s.status,
      interruption: s.interruption,
      at: s.at,
    })),
    meanShotDistance: mean(shotRows.map((r) => r.shot.distance)),
    meanShotPressure: mean(shotRows.map((r) => r.shot.pressure)),
    fouls: d.defensive?.fouls ?? 0,
    challenges: d.defensive?.attempted ?? 0,
    defensive: d.defensive,
    adjacentTickFlips: d.realism.ownership.adjacentTickFlips,
    pairReversalsWithin100ms: d.realism.ownership.stationaryPairReversalsWithin100ms,
    touchAttributionErrors: d.realism.challenges.filter(
      (c) =>
        c.ballFirst &&
        ['clean_win', 'loose_ball'].includes(c.outcome) &&
        c.lastTouchPlayerId !== c.actorId,
    ).length,
    retreats: d.realism.retreats.length,
    maxRetreat: Math.max(0, ...d.realism.retreats.map((r) => r.retreatMetres)),
    firstSubstitution: d.substitutions?.length
      ? Math.min(...d.substitutions.map((s) => s.enteredAt))
      : null,
    substitutions: d.substitutions,
    clock: d.clock,
    flow: d.flow,
    observerErrors: d.observer.errors,
    cpuSeconds: d.performance.cpuSeconds,
    wallSeconds: d.performance.wallSeconds,
    maxRssBytes: d.performance.maxSampledRssBytes,
  };
};
const rows = [...development, ...validation].map(compact);
for (const r of rows)
  if (
    r.sourceHash !== freeze.sourceHash ||
    r.harnessHash !== freeze.harnessHash ||
    r.status !== 'full_time' ||
    r.observerErrors.length ||
    r.shotDetailGap < 0 ||
    r.ledgerAttempts !== r.shots
  )
    throw Error('Mixed/invalid final cohort');
const aggregate = (rs) => ({
  matches: rs.length,
  meanPasses: mean(rs.map((r) => r.passes.attempts)),
  shots: sum(rs.map((r) => r.shots)),
  goals: sum(rs.map((r) => r.goals)),
  conversion: sum(rs.map((r) => r.goals)) / Math.max(1, sum(rs.map((r) => r.shots))),
  meanFouls: mean(rs.map((r) => r.fouls)),
  meanLiveMinutes: mean(rs.map((r) => r.clock.inPlay / 60)),
  maxRetreat: Math.max(0, ...rs.map((r) => r.maxRetreat)),
  earliestSubstitution: Math.min(
    ...rs.filter((r) => r.firstSubstitution !== null).map((r) => r.firstSubstitution),
  ),
  touchAttributionErrors: sum(rs.map((r) => r.touchAttributionErrors)),
  cpuMean: mean(rs.map((r) => r.cpuSeconds)),
});
const policies = freeze.policies.map((policy) => ({
  policy,
  development: aggregate(rows.filter((r) => r.cohort === 'development' && r.policy === policy)),
  validation: aggregate(rows.filter((r) => r.cohort === 'validation' && r.policy === policy)),
  tiers: ['SS', 'SW', 'WW'].map((tier) => ({
    tier,
    ...aggregate(rows.filter((r) => r.policy === policy && r.tier === tier)),
  })),
}));
const beforeAfter = baseline.map((b) => ({
  id: b.design.id,
  tier: b.design.tier,
  inputHash: b.inputHash,
  before: compact(b),
  after: rows.find((r) => r.id === b.design.id && r.policy === 'state-value-v1'),
}));
const common = {
  schema: 'mfl-pr183-policy-comparison-v1',
  sourceHash: freeze.sourceHash,
  harnessHash: freeze.harnessHash,
  freezeCommit: '74213611bc9ad1594f212359f63437a8ef07fe19',
  units: { development: 6, validation: 3 },
  runs: { development: 30, validation: 15 },
  scope:
    'Paired native designs; descriptive small cohorts, no policy promotion. B remains provisional default; summary NOT READY.',
  policies,
  rows,
  beforeAfter,
};
writeFileSync(
  'docs/performance/PR183-policy-comparison.json',
  JSON.stringify(common, null, 2) + '\n',
);
const retained = [...development, ...validation, ...baseline].map((d) => ({
  design: d.design,
  policy: d.policy,
  cohort: d.cohort,
  sourceHash: d.productionHash,
  inputHash: d.inputHash,
  finalHash: d.finalHash,
  clock: d.clock,
  passes: d.passes,
  realism: d.realism,
  spatial: d.spatial,
  defensive: d.defensive,
  substitutions: d.substitutions,
  official: d.official,
  observer: d.observer,
  flow: d.flow,
  performance: { ...d.performance, profile: undefined },
  canonicalShots: d.report.summary.shots,
  stoppages: d.report.summary.stoppages,
}));
writeFileSync(
  'docs/performance/pr183-evidence/cohort-diagnostics.json.gz',
  gzipSync(JSON.stringify(retained)),
);
writeFileSync(
  'docs/performance/PR183-contact-ownership.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-contact-v1',
      sourceHash: freeze.sourceHash,
      scope:
        'Adjacent flips and pair reversals are screening counts, not proof of invalid events. Touch attribution audits actual clean-win/loose-ball ball-first challenge outcomes.',
      rows: rows.map((r) => ({
        id: r.id,
        policy: r.policy,
        cohort: r.cohort,
        adjacentTickFlips: r.adjacentTickFlips,
        pairReversalsWithin100ms: r.pairReversalsWithin100ms,
        touchAttributionErrors: r.touchAttributionErrors,
      })),
      baseline: beforeAfter.map((r) => ({
        id: r.id,
        beforeErrors: r.before.touchAttributionErrors,
        afterErrors: r.after.touchAttributionErrors,
      })),
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  'docs/performance/PR183-defensive-fouls.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-fouls-v1',
      sourceHash: freeze.sourceHash,
      conclusion:
        'No separately proven duplicate foul incident in the supplied partial export. Continuous-pair and canonical incident guards are retained; global foul probabilities are unchanged. Frequencies remain a realism limitation.',
      rows: rows.map((r) => ({
        id: r.id,
        policy: r.policy,
        cohort: r.cohort,
        fouls: r.fouls,
        challenges: r.challenges,
        byTechnique: r.defensive?.byTechnique,
      })),
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  'docs/performance/PR183-match-flow.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-flow-v1',
      sourceHash: freeze.sourceHash,
      scope:
        'All fixed steps retained; clock reconciliation and legal restart completion checked. Excessive live time is reported, not corrected by artificial downtime.',
      rows: rows.map((r) => ({
        id: r.id,
        policy: r.policy,
        cohort: r.cohort,
        clock: r.clock,
        restarts: r.flow.restarts,
      })),
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  'docs/performance/PR183-shooting-outcomes.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-shots-v1',
      sourceHash: freeze.sourceHash,
      scope:
        'Canonical recorded attempts use the retained summary shot ledger and agree with flow counts. Physical records are joined by shotId; unmatched releases are retained separately with their actual observer status. Censored means no observed resolution, not proof of a whistle. Expectations are uncalibrated proxies.',
      rows: rows.map((r) => ({
        id: r.id,
        policy: r.policy,
        cohort: r.cohort,
        attempts: r.shots,
        goals: r.goals,
        outcomes: r.shotOutcomes,
        recorded: r.shotDetails,
        matchedPhysicalDetails: r.matchedPhysicalDetails,
        missing: r.shotDetailGap,
        uncountedPhysicalReleases: r.uncountedPhysicalReleases,
        meanDistance: r.meanShotDistance,
        meanPressure: r.meanShotPressure,
      })),
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  'docs/performance/PR183-passing-and-width.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-passing-v1',
      sourceHash: freeze.sourceHash,
      scope:
        'Five-minute releases, direction, distance and reciprocal exchanges; role/route screens are separate. Midfield invitation counters do not claim completed receptions.',
      rows: [...development, ...validation].map((d) => ({
        id: d.design.id,
        policy: d.policy,
        cohort: d.cohort,
        windows: d.realism.windows,
        spatial: { ...d.spatial, trace: undefined, shape: undefined },
      })),
    },
    null,
    2,
  ) + '\n',
);
const native = existsSync('../pr183-reproduce-before/receipt.json')
  ? read('../pr183-reproduce-before/receipt.json')
  : undefined;
writeFileSync(
  'docs/performance/PR183-coach-substitution-reasons.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-substitutions-v1',
      sourceHash: freeze.sourceHash,
      scope:
        'Native reproduced early reasons are actual PR182 pending requests, not an assertion of the inaccessible original owner state. Final cohort facts carry full numerical benefit decomposition; controlled emergency/no-reserve/halftime cases are in pr183Realism.test.ts.',
      nativeEarly: native?.substitutions.slice(0, 6).map((s) => ({
        at: s.time,
        score: s.score,
        used: s.remaining,
        requests: s.requests.map((q) => ({
          outgoing: q.outgoing.id,
          incoming: q.incoming.id,
          injury: q.outgoing.injury ?? null,
          fitness: q.outgoing.fitness,
          slot: q.outgoing.slot,
          requestedRole: q.roleId,
          reason: q.reason,
          reasoning: q.reasoning,
          opportunityId: q.opportunityId,
        })),
      })),
      rows: rows.map((r) => ({
        id: r.id,
        policy: r.policy,
        cohort: r.cohort,
        first: r.firstSubstitution,
        substitutions: r.substitutions,
      })),
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  'docs/performance/PR183-performance.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-performance-v1',
      sourceHash: freeze.sourceHash,
      context:
        'Complete cohort CPU, wall and sampled RSS under concurrent processes. Paired before/after football workloads can differ in event counts/duration; this is not an isolated marginal-function cost. Independent match cap is 600 CPU seconds.',
      rows: rows.map((r) => ({
        id: r.id,
        policy: r.policy,
        cohort: r.cohort,
        cpuSeconds: r.cpuSeconds,
        wallSeconds: r.wallSeconds,
        maxRssBytes: r.maxRssBytes,
      })),
      beforeAfter: beforeAfter.map((r) => ({
        id: r.id,
        beforeCpu: r.before.cpuSeconds,
        afterCpu: r.after.cpuSeconds,
        beforeWall: r.before.wallSeconds,
        afterWall: r.after.wallSeconds,
        beforeRss: r.before.maxRssBytes,
        afterRss: r.after.maxRssBytes,
      })),
    },
    null,
    2,
  ) + '\n',
);
const table = policies
  .map(
    (p) =>
      `| ${p.policy} | ${p.development.meanPasses.toFixed(0)} | ${p.development.shots} | ${p.development.goals} | ${(100 * p.development.conversion).toFixed(1)}% | ${p.development.meanFouls.toFixed(1)} | ${p.development.meanLiveMinutes.toFixed(1)} |`,
  )
  .join('\n');
writeFileSync(
  '../pr183-results-table.md',
  `| Development, six designs each | Mean passes | Shots | Goals | Conversion | Mean fouls | Live min |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n${table}\n`,
);
console.log(
  JSON.stringify(
    {
      sourceHash: pr183SourceHash(),
      development: development.length,
      validation: validation.length,
      policies: policies.map((p) => ({
        policy: p.policy,
        development: p.development,
        validation: p.validation,
      })),
      maximumCpu: Math.max(...rows.map((r) => r.cpuSeconds)),
      missingShotDetails: sum(rows.map((r) => r.shotDetailGap)),
      censored: sum(rows.map((r) => r.shotOutcomes.censored ?? 0)),
      retainedDigest: digest(retained),
    },
    null,
    2,
  ),
);
