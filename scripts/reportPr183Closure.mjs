import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import {
  digest,
  pr183SourceHash,
  pr183HarnessHash as developmentHarnessHash,
} from './pr183ClosureEvidence.mjs';
import { pr183HarnessHash as confirmationHarnessHash } from './pr183ClosureValidationEvidence.mjs';

const read = (p) => JSON.parse(readFileSync(p));
const load = (dir) =>
  readdirSync(dir)
    .filter((p) => p.endsWith('.json.gz') && !/retreat-\d|failure|restart-state/.test(p))
    .map((p) => JSON.parse(gunzipSync(readFileSync(`${dir}/${p}`))));
const development = load('../pr183-closure-final-development');
const validation = load('../pr183-closure-final-validation');
const regression = load('../pr183-closure-final-regression');
const before = load('../pr183-development');
const pr182Baseline = load('../pr183-baseline-comparison');
const freeze = read('docs/performance/PR183-closure-freeze.json');
if (development.length !== 30 || validation.length !== 15 || regression.length !== 3)
  throw Error('Require all 30 development, 15 confirmation and 3 supplemental regression runs');
const finalSourceHash = pr183SourceHash();
if (finalSourceHash !== freeze.sourceHash) {
  execFileSync(process.execPath, ['scripts/verifyPr183TypeOnlyBridge.mjs'], { stdio: 'pipe' });
  const bridge = read('docs/performance/PR183-closure-type-only-bridge.json');
  if (
    bridge.simulatedSourceHash !== freeze.sourceHash ||
    bridge.compilableSourceHash !== finalSourceHash ||
    !bridge.emittedProgramsEqual
  )
    throw Error('Invalid type-only bridge');
}
if (
  freeze.harnessHash !== confirmationHarnessHash() ||
  freeze.developmentHarnessHash !== developmentHarnessHash()
)
  throw Error('Closure source/harness freeze changed');
const mean = (a) => a.reduce((n, v) => n + v, 0) / Math.max(1, a.length);
const sum = (a) => a.reduce((n, v) => n + v, 0);
const counts = (a, key) =>
  Object.fromEntries(
    [...new Set(a.map(key))].map((k) => [k, a.filter((x) => key(x) === k).length]),
  );
const compact = (d, analysisGroup) => {
  const ledger = d.report.summary.shots;
  const ids = new Set(ledger.map((s) => s.shotId));
  const physical = d.realism.shots;
  const peaks = d.realism.retreatExcursions;
  const score = d.report.metadata.result;
  return {
    id: d.design.id,
    tier: d.design.tier,
    policy: d.policy,
    cohort: d.cohort,
    analysisGroup,
    inputHash: d.inputHash,
    sessionHash: d.sessionHash,
    sourceHash: d.productionHash,
    harnessHash: d.frozenHarnessHash,
    effectiveInputHash: d.effectiveInputHash,
    finalHash: d.finalHash,
    status: d.status,
    time: d.time,
    ticks: d.ticks,
    score,
    passes: d.official,
    shots: d.flow.shots,
    goals: score.home + score.away,
    ledgerAttempts: ledger.length,
    physicalRecords: physical.length,
    matchedPhysicalDetails: physical.filter((s) => ids.has(s.shot.shotId)).length,
    physicalStatuses: counts(physical, (s) => s.status),
    uncountedPhysicalReleases: physical
      .filter((s) => !ids.has(s.shot.shotId))
      .map((s) => ({
        shotId: s.shot.shotId,
        status: s.status,
        interruption: s.interruption,
        releasedAt: s.shot.releasedAt,
      })),
    meanShotDistance: mean(ledger.map((s) => s.distance)),
    meanShotPressure: mean(ledger.map((s) => s.pressure)),
    baseXg: sum(ledger.map((s) => s.baseXg ?? 0)),
    expectationProxy: sum(ledger.map((s) => s.effectiveScoringExpectation ?? 0)),
    fouls: d.defensive?.fouls ?? 0,
    challenges: d.defensive?.attempted ?? 0,
    retreatMetric: peaks
      ? 'peak continuous-owner excursion'
      : 'historical net displacement (not comparable to peak)',
    retreats: peaks?.length ?? d.realism.retreats.length,
    maxRetreat: Math.max(
      0,
      ...(peaks?.map((r) => r.peakMetres) ?? d.realism.retreats.map((r) => r.retreatMetres)),
    ),
    longRetreats: peaks?.filter((r) => r.peakMetres >= 15),
    firstSubstitution: d.substitutions?.length
      ? Math.min(...d.substitutions.map((s) => s.enteredAt))
      : null,
    substitutions: d.substitutions,
    clock: d.clock,
    flow: d.flow,
    lineage: d.lineage.summary,
    ownership: d.realism.ownership,
    touchAttributionErrors: d.realism.challenges.filter(
      (c) =>
        c.ballFirst &&
        ['clean_win', 'loose_ball'].includes(c.outcome) &&
        c.lastTouchPlayerId !== c.actorId,
    ).length,
    observerErrors: d.observer.errors,
    cpuSeconds: d.performance.cpuSeconds,
    wallSeconds: d.performance.wallSeconds,
    maxRssBytes: d.performance.maxSampledRssBytes,
  };
};
const manifest = (name) => read(`docs/performance/PR183-closure-${name}-inputs.json`).rows;
const seen = new Set();
for (const [data, name, expectedHarness] of [
  [development, 'development', freeze.developmentHarnessHash],
  [validation, 'validation', freeze.harnessHash],
  [regression, 'regression', freeze.developmentHarnessHash],
]) {
  const inputs = manifest(name);
  for (const d of data) {
    const input = inputs.find((f) => f.design.id === d.design.id);
    const key = `${d.design.id}:${d.policy}`;
    if (
      seen.has(key) ||
      !input ||
      input.inputHash !== d.inputHash ||
      input.sessionHash !== d.sessionHash ||
      !freeze.policies.includes(d.policy)
    )
      throw Error(`Invalid input/duplicate ${key}`);
    seen.add(key);
    if (
      d.productionHash !== freeze.sourceHash ||
      d.frozenHarnessHash !== expectedHarness ||
      d.status !== 'full_time' ||
      d.observer.errors.length ||
      d.time > 7200 ||
      d.performance.cpuSeconds > 600 ||
      Math.abs(d.clock.elapsed - d.clock.inPlay - d.clock.stoppage) > 1e-6 ||
      d.flow.shots !== d.report.summary.shots.length
    )
      throw Error(`Invalid final run ${key}`);
  }
}
const rows = [
  ...development.map((d) => compact(d, 'development')),
  ...validation.map((d) => compact(d, 'confirmation')),
  ...regression.map((d) => compact(d, 'supplemental consumed confirmation')),
];
const aggregate = (rs) => ({
  matches: rs.length,
  meanPasses: mean(rs.map((r) => r.passes.attempts)),
  shots: sum(rs.map((r) => r.shots)),
  goals: sum(rs.map((r) => r.goals)),
  conversion: sum(rs.map((r) => r.goals)) / Math.max(1, sum(rs.map((r) => r.shots))),
  meanFouls: mean(rs.map((r) => r.fouls)),
  meanLiveMinutes: mean(rs.map((r) => r.clock.inPlay / 60)),
  maxPeakRetreat: Math.max(0, ...rs.map((r) => r.maxRetreat)),
  touchAttributionErrors: sum(rs.map((r) => r.touchAttributionErrors)),
  cpuMean: mean(rs.map((r) => r.cpuSeconds)),
});
const policies = freeze.policies.map((policy) => ({
  policy,
  development: aggregate(
    rows.filter((r) => r.analysisGroup === 'development' && r.policy === policy),
  ),
  confirmation: aggregate(
    rows.filter((r) => r.analysisGroup === 'confirmation' && r.policy === policy),
  ),
  tiers: ['SS', 'SW', 'WW'].map((tier) => ({
    tier,
    ...aggregate(
      rows.filter(
        (r) =>
          r.analysisGroup !== 'supplemental consumed confirmation' &&
          r.tier === tier &&
          r.policy === policy,
      ),
    ),
  })),
}));
const pairs = development.map((d) => {
  const b = before.find((b) => b.design.id === d.design.id && b.policy === d.policy);
  if (!b || b.inputHash !== d.inputHash) throw Error('Missing paired rejected-draft input');
  return {
    id: d.design.id,
    policy: d.policy,
    inputHash: d.inputHash,
    before: compact(b, 'rejected draft; consumed development'),
    after: compact(d, 'development'),
  };
});
const pr182Pairs = pr182Baseline.map((b) => {
  const d = development.find((d) => d.design.id === b.design.id && d.policy === b.policy);
  if (
    !d ||
    b.inputHash !== d.inputHash ||
    b.productionHash !== 'fede3b2873e6ed5d0cf39f8a6487fc81364eda18544b2063cfc56cc39d7b24f1'
  )
    throw Error('Invalid true PR182 baseline pair');
  return {
    id: b.design.id,
    policy: b.policy,
    inputHash: b.inputHash,
    before: compact(b, 'true PR182 baseline'),
    after: compact(d, 'development'),
  };
});
const retained = [...development, ...validation, ...regression].map((d) => ({
  design: d.design,
  policy: d.policy,
  cohort: d.cohort,
  sourceHash: d.productionHash,
  harnessHash: d.frozenHarnessHash,
  inputHash: d.inputHash,
  sessionHash: d.sessionHash,
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
  longRetreatSnapshots: d.longRetreatSnapshots,
}));
const archive = 'pr183-evidence/closure-cohort-diagnostics.json.gz';
const data = JSON.stringify(retained);
writeFileSync(`docs/performance/${archive}`, gzipSync(data));
const receipt = {
  schema: 'mfl-pr183-closure-comparison-v1',
  sourceHash: freeze.sourceHash,
  compilableSourceHash: finalSourceHash,
  typeOnlyBridge:
    finalSourceHash === freeze.sourceHash ? null : 'PR183-closure-type-only-bridge.json',
  developmentHarnessHash: freeze.developmentHarnessHash,
  confirmationHarnessHash: freeze.harnessHash,
  freezeCommit: 'c9299bd8a819ed8f1dc8d6a853381fed8236bb6d',
  units: { consumedDevelopment: 6, newConfirmation: 3, supplementalConsumedConfirmation: 3 },
  runs: { development: 30, newConfirmation: 15, supplementalR3: 3 },
  scope:
    'Paired native designs, small descriptive cohorts; B default, all five policies retained. Peak and historical net retreat metrics are explicitly distinguished. Summary calibration NOT READY. Concurrent timings are not isolated marginal costs.',
  policies,
  rows,
  pairs,
  pr182Pairs,
  archive,
  uncompressedArchiveHash: digest(data),
};
writeFileSync(
  'docs/performance/PR183-closure-policy-comparison.json',
  JSON.stringify(receipt, null, 2) + '\n',
);
writeFileSync(
  'docs/performance/PR183-closure-performance.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-closure-performance-v1',
      sourceHash: freeze.sourceHash,
      context: receipt.scope,
      rows: rows.map(
        ({ id, policy, analysisGroup, cpuSeconds, wallSeconds, maxRssBytes, time, ticks }) => ({
          id,
          policy,
          analysisGroup,
          cpuSeconds,
          wallSeconds,
          maxRssBytes,
          time,
          ticks,
        }),
      ),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify(
    {
      policies,
      runs: rows.length,
      sourceHash: freeze.sourceHash,
      shotAttempts: sum(rows.map((r) => r.shots)),
      physicalRecords: sum(rows.map((r) => r.physicalRecords)),
      uncounted: sum(rows.map((r) => r.uncountedPhysicalReleases.length)),
      maxR3Peak: Math.max(
        ...rows.filter((r) => r.policy === 'phase-role-hybrid-v1').map((r) => r.maxRetreat),
      ),
    },
    null,
    2,
  ),
);
