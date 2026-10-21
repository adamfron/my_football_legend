import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import process from 'node:process';
import { pr172SourceHash } from './pr172Evidence.ts';
const dir = process.argv[2] ?? '../pr180-final-v4',
  evidenceDir = 'docs/performance/pr180-evidence';
const read = (p) => JSON.parse(gunzipSync(readFileSync(p)));
const files = readdirSync(dir).filter(
  (n) => n.endsWith('.json.gz') && !n.includes('-state.json.gz'),
);
const rows = files.map((n) => read(`${dir}/${n}`));
const mean = (r, get) => r.reduce((s, x) => s + get(x), 0) / Math.max(1, r.length);
const policies = [
  'legacy-pr176',
  'state-value-v1',
  'role-value-v1',
  'role-intent-v1',
  'phase-role-hybrid-v1',
];
const sourceHash = pr172SourceHash();
for (const r of rows) {
  if (r.sourceHash !== sourceHash) throw Error('cohort source mismatch');
  if (r.passes.unique !== r.official.attempts) throw Error('canonical pass identity mismatch');
  if (
    r.observer.attempts !== r.passes.firstTime ||
    r.observer.completed !== r.passes.firstTimeCompleted ||
    r.observer.errors.length ||
    r.report.diagnostics.observerErrors.length
  )
    throw Error('first-time observer mismatch');
  if (Math.abs(r.clock.elapsed - r.clock.inPlay - r.clock.stoppage) > 1e-6)
    throw Error('clock partition mismatch');
}
const compact = (r) => ({
  policy: r.policy,
  id: r.design.id,
  tier: r.design.tier,
  status: r.status,
  time: r.time,
  inputHash: r.inputHash,
  sessionHash: r.sessionHash,
  sourceHash: r.sourceHash,
  harnessHash: r.harnessHash,
  finalHash: r.finalHash,
  official: r.official,
  firstTime: r.passes.firstTime,
  firstTimeCompleted: r.passes.firstTimeCompleted,
  firstTimeShare: r.passes.firstTime / r.official.attempts,
  completion: r.official.completed / r.official.attempts,
  intervalMean: r.passes.intervalMean,
  intervalMedian: r.passes.intervalMedian,
  receptions: r.receptions,
  passOutcomes: r.passes.outcomes,
  flow: r.flow,
  clock: r.clock,
  ledger: r.report.summary.stoppages
    ? {
        ...r.report.summary.stoppages,
        intervals: undefined,
        intervalCount: r.report.summary.stoppages.intervals.length,
      }
    : undefined,
  hold: r.report.diagnostics.maxHoldSeconds,
  observer: r.observer,
  roleObserverErrors: r.report.diagnostics.observerErrors,
  performance: r.performance,
});
const summary = {
  sourceHash,
  scope:
    'six new matched development designs; experimental unit is the fixture design, not the policy run. All failed/censored rows retained.',
  intervalDefinition:
    'Pass release intervals across both teams; median is the upper middle order statistic for even sample counts. UI bounded action intervals use the average of the middle pair.',
  complete: rows.filter((r) => r.status === 'full_time').length,
  total: rows.length,
  rows: rows.map(compact),
  policies: policies.map((policy) => {
    const all = rows.filter((r) => r.policy === policy),
      r = all.filter((r) => r.status === 'full_time');
    return {
      policy,
      complete: r.length,
      total: all.length,
      attempts: mean(r, (x) => x.official.attempts),
      completion: mean(r, (x) => x.official.completed / x.official.attempts),
      firstTimeShare: mean(r, (x) => x.passes.firstTime / x.official.attempts),
      shots: mean(r, (x) => x.flow.shots),
      boxEntries: mean(r, (x) => x.flow.boxEntries),
      crosses: mean(r, (x) => x.flow.crosses),
      liveMinutes: mean(r, (x) => x.clock.inPlay / 60),
      cpuSeconds: mean(r, (x) => x.performance.cpuSeconds),
      observerErrors: all.reduce((s, x) => s + x.observer.errors.length, 0),
    };
  }),
};
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(
  'docs/performance/PR180-policy-comparison.json',
  JSON.stringify(summary, null, 2) + '\n',
);
for (const n of files) writeFileSync(`${evidenceDir}/${n}`, readFileSync(`${dir}/${n}`));
for (const tier of ['SS', 'SW', 'WW']) {
  const pairs = rows.filter((r) => r.design.tier === tier);
  for (const id of new Set(pairs.map((r) => r.design.id))) {
    const r = pairs.filter((r) => r.design.id === id);
    if (
      new Set(r.map((x) => x.inputHash)).size !== 1 ||
      new Set(r.map((x) => x.sessionHash)).size !== 1
    )
      throw Error('unmatched fixture inputs');
  }
}
const clocks = rows.map((r) => {
  const ledger = r.report.summary.stoppages;
  return {
    id: r.design.id,
    policy: r.policy,
    clock: r.clock,
    ledgerCompleted: ledger?.completedSeconds ?? 0,
    unledgeredSeconds: r.clock.stoppage - (ledger?.completedSeconds ?? 0),
    partitionResidual: r.clock.elapsed - r.clock.inPlay - r.clock.stoppage,
    intervalCount: ledger?.intervals.length ?? 0,
    fullIntervalEvidence: `pr180-evidence/${r.design.id}-${r.policy}.json.gz`,
  };
});
writeFileSync(
  'docs/performance/PR180-match-flow.json',
  JSON.stringify(
    {
      sourceHash,
      definition:
        'Fixed-step referee/play partition; initial setup or half-start boundary differences from the stoppage ledger remain explicit. Added-time credit is distinct from dead-ball duration.',
      rows: clocks,
    },
    null,
    2,
  ) + '\n',
);
if (existsSync('../pr180-final-v2')) {
  const rejected = readdirSync('../pr180-final-v2')
    .filter((n) => n.endsWith('.json.gz') && !n.endsWith('-state.json.gz'))
    .map((n) => read('../pr180-final-v2/' + n));
  writeFileSync(
    `${evidenceDir}/rejected-pre-wall-candidate.json.gz`,
    gzipSync(
      JSON.stringify({
        scope:
          'Rejected development source, 27 full-time and three 7200s censored preparations; not final results',
        rows: rejected.map(compact),
      }),
    ),
  );
}
const manual = [];
for (const p of policies) {
  const beforePath = existsSync(`../pr180-baseline/manual-closest-${p}.json.gz`)
      ? `../pr180-baseline/manual-closest-${p}.json.gz`
      : `${evidenceDir}/manual-before-${p}.json.gz`,
    before = read(beforePath),
    after = read(`../pr180-manual-v4/manual-closest-${p}.json.gz`);
  if (after.sourceHash !== sourceHash) throw Error('manual final source mismatch');
  if (before.inputHash !== after.inputHash || before.sessionHash !== after.sessionHash)
    throw Error('Closest before/after inputs differ');
  manual.push({
    policy: p,
    scope:
      'Closest fixture, 2820 elapsed seconds. Complete original setup unavailable; not exact raw-manual reproduction.',
    before: compact(before),
    after: compact(after),
  });
  writeFileSync(`${evidenceDir}/manual-before-${p}.json.gz`, readFileSync(beforePath));
  writeFileSync(
    `${evidenceDir}/manual-after-${p}.json.gz`,
    readFileSync(`../pr180-manual-v4/manual-closest-${p}.json.gz`),
  );
}
writeFileSync(
  'docs/performance/PR180-manual-comparison.json',
  JSON.stringify({ sourceHash, rows: manual }, null, 2) + '\n',
);
const fmt = (n) => n.toFixed(2),
  pct = (n) => (100 * n).toFixed(1) + '%';
const table = [
  '| Complete-match mean, both teams | Legacy | B | R1 | R2 | R3 |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...[
    ['Full time', (r) => `${r.complete}/${r.total}`],
    ['Pass attempts', (r) => fmt(r.attempts)],
    ['Completion', (r) => pct(r.completion)],
    ['First-time share', (r) => pct(r.firstTimeShare)],
    ['Shots released', (r) => fmt(r.shots)],
    ['Box entries', (r) => fmt(r.boxEntries)],
    ['Crosses', (r) => fmt(r.crosses)],
    ['Live minutes', (r) => fmt(r.liveMinutes)],
  ].map(([label, get]) => `| ${label} | ${summary.policies.map(get).join(' | ')} |`),
];
const manualTable = [
  '| Closest seed fixture, 2820 elapsed seconds | Attempts before → after | First-time before → after | Share before → after |',
  '| --- | ---: | ---: | ---: |',
  ...manual.map(
    (r) =>
      `| ${r.policy} | ${r.before.official.attempts} → ${r.after.official.attempts} | ${r.before.firstTime} → ${r.after.firstTime} | ${pct(r.before.firstTimeShare)} → ${pct(r.after.firstTimeShare)} |`,
  ),
];
const consequenceTable = [
  '| Closest fixture, before → after | Shots | Box entries | Completion | Live minutes | CPU seconds |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...manual.map(
    ({ policy, before, after }) =>
      `| ${policy} | ${before.flow.shots} → ${after.flow.shots} | ${before.flow.boxEntries} → ${after.flow.boxEntries} | ${pct(before.completion)} → ${pct(after.completion)} | ${fmt(before.clock.inPlay / 60)} → ${fmt(after.clock.inPlay / 60)} | ${fmt(before.performance.cpuSeconds)} → ${fmt(after.performance.cpuSeconds)} |`,
  ),
];
const tierTable = [
  '| Tier / policy (two matched designs each) | Pass attempts | First-time share | Shots | Box entries |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...['SS', 'SW', 'WW'].flatMap((tier) =>
    policies.map((policy) => {
      const r = rows.filter(
        (r) => r.design.tier === tier && r.policy === policy && r.status === 'full_time',
      );
      return `| ${tier} / ${policy} | ${fmt(mean(r, (x) => x.official.attempts))} | ${pct(mean(r, (x) => x.passes.firstTime / x.official.attempts))} | ${fmt(mean(r, (x) => x.flow.shots))} | ${fmt(mean(r, (x) => x.flow.boxEntries))} |`;
    }),
  ),
];
const path = 'docs/PR180_FOOTBALL_TEMPO_AND_BALL_INTERACTION.md';
let doc = readFileSync(path, 'utf8');
doc = doc.replace(
  /<!-- PR180_RESULTS_START -->[\s\S]*?<!-- PR180_RESULTS_END -->/,
  `<!-- PR180_RESULTS_START -->\n**${summary.complete}/${summary.total} final runs reach full time.** All per-fixture/tier rows, official denominators and observer checks remain in the JSON.\n\n${table.join('\n')}\n\n${tierTable.join('\n')}\n\n${manualTable.join('\n')}\n\n${consequenceTable.join('\n')}\n\nThe closest-fixture inputs and sessions match exactly before/after, although their equivalence to the original manual setup remains unproven. CPU is process time under concurrent workload; these before/after runs were not isolated marginal-cost experiments. These comparisons concern the same corrected mechanics, with no winning-policy selection.\n<!-- PR180_RESULTS_END -->`,
);
writeFileSync(path, doc);
const evidence = readdirSync(evidenceDir).map((name) => ({
  name,
  sha256: createHash('sha256')
    .update(readFileSync(`${evidenceDir}/${name}`))
    .digest('hex'),
}));
writeFileSync(
  'docs/performance/PR180-evidence-index.json',
  JSON.stringify(evidence, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    { complete: summary.complete, total: summary.total, policies: summary.policies },
    null,
    2,
  ),
);
if (summary.complete !== 30 || summary.total !== 30) process.exitCode = 1;
