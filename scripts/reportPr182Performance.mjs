import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { strict as assert } from 'node:assert';
import console from 'node:console';
import { pr182SourceHash } from './pr182Evidence.mjs';
import { pr172SourceHash } from './pr172Evidence.ts';
const rows = readdirSync('../pr182-performance')
  .filter((p) => p.endsWith('.json'))
  .map((p) => JSON.parse(readFileSync(`../pr182-performance/${p}`)));
assert.equal(rows.length, 28);
const measured = JSON.parse(readFileSync('../pr182-measured-source.json'));
assert.equal(measured.matchCoreHash, pr172SourceHash());
for (const r of rows.filter((r) => r.label.startsWith('after')))
  assert.equal(r.sourceHash, measured.productionHash);
const full = ['role-value-v1', 'role-intent-v1', 'phase-role-hybrid-v1'].map((policy) => {
  const before = rows.find((r) => r.policy === policy && r.label === 'before-full'),
    after = rows.find((r) => r.policy === policy && r.label === 'after-full');
  assert.equal(before.initialHash, after.initialHash);
  return {
    policy,
    inputHash: before.initialHash,
    before: {
      cpuSeconds: before.cpuSeconds,
      wallSeconds: before.wallSeconds,
      maxSampledRssMiB: before.maxSampledRssBytes / 2 ** 20,
    },
    after: {
      cpuSeconds: after.cpuSeconds,
      wallSeconds: after.wallSeconds,
      maxSampledRssMiB: after.maxSampledRssBytes / 2 ** 20,
    },
    cpuRatio: after.cpuSeconds / before.cpuSeconds,
    wallRatio: after.wallSeconds / before.wallSeconds,
    withinThirtyFivePercentCpu: after.cpuSeconds / before.cpuSeconds <= 1.35,
  };
});
const windows = [
  'legacy-pr176',
  'state-value-v1',
  'role-value-v1',
  'role-intent-v1',
  'phase-role-hybrid-v1',
].map((policy) => {
  const before = rows.filter((r) => r.policy === policy && r.label.startsWith('before-window')),
    after = rows.filter((r) => r.policy === policy && r.label.startsWith('after-window'));
  for (const group of [before, after]) {
    assert.equal(group.length, 2);
    assert.equal(group[0].finalHash, group[1].finalHash);
  }
  assert.equal(before[0].initialHash, after[0].initialHash);
  const mean = (xs, key) => xs.reduce((n, r) => n + r[key], 0) / xs.length;
  return {
    policy,
    before,
    after,
    cpuMeanRatio: mean(after, 'cpuSeconds') / mean(before, 'cpuSeconds'),
  };
});
const off = rows.find((r) => r.label === 'after-observer' && !r.observers),
  on = rows.find((r) => r.label === 'after-observer' && r.observers);
const all = JSON.parse(
  gunzipSync(readFileSync('../pr182-full-observer/pr181-dev-sw-1-role-intent-v1.json.gz')),
);
assert.equal(off.finalHash, on.finalHash);
assert.equal(off.finalHash, all.finalHash);
assert.equal(off.ticks, all.ticks);
const observer = {
  off: { cpuSeconds: off.cpuSeconds, wallSeconds: off.wallSeconds },
  roleAndFlow: {
    cpuSeconds: on.cpuSeconds,
    wallSeconds: on.wallSeconds,
    cpuRatio: on.cpuSeconds / off.cpuSeconds,
  },
  completePrimaryObservers: {
    cpuSeconds: all.performance.cpuSeconds,
    wallSeconds: all.performance.wallSeconds,
    cpuRatio: all.performance.cpuSeconds / off.cpuSeconds,
  },
  sameCompleteStateAndTicks: true,
};
writeFileSync(
  'docs/performance/pr182-evidence/serial-performance-trials.json.gz',
  gzipSync(JSON.stringify({ rows, allObservers: all })),
);
writeFileSync(
  'docs/performance/PR182-performance.json',
  JSON.stringify(
    {
      schema: 'mfl-pr182-serial-performance-v1',
      baseline: 'PR181 source, code identical to merged b9c7bfb8dd341f258d684f19fba1ebd4c849a888',
      measuredProductionHash: measured.productionHash,
      measuredMatchCoreHash: measured.matchCoreHash,
      currentProductionHash: pr182SourceHash(),
      currentMatchCoreHash: pr172SourceHash(),
      postMeasurementChange:
        'Only Match Lab UI start-pause, freeze/restart remount and explanatory text changed after serial measurement; canonical match-core hash is identical.',
      method:
        '28 fresh serial trials plus one complete-observer window, with other simulation/test workers stopped. Twenty paired 120s windows have two within-source repeats; three complete role-policy workload pairs have one repetition. Identical initial states and fixed 0.025s stepping; whole football histories may diverge. RSS is sampled, not an allocation peak. One complete workload per policy cannot establish universal CPU rates or confidence intervals.',
      full,
      windows: windows.map(({ policy, cpuMeanRatio, before, after }) => ({
        policy,
        cpuMeanRatio,
        before: before.map(({ cpuSeconds, wallSeconds, finalHash }) => ({
          cpuSeconds,
          wallSeconds,
          finalHash,
        })),
        after: after.map(({ cpuSeconds, wallSeconds, finalHash }) => ({
          cpuSeconds,
          wallSeconds,
          finalHash,
        })),
      })),
      observer,
      raw: 'pr182-evidence/serial-performance-trials.json.gz',
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ full, observer }, null, 2));
