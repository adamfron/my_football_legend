import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { PRIMARY_DECISION_POLICIES } from '../src/core/matchSimulation/decisionPolicyConfig.ts';
import { pr172SourceHash } from './pr172Evidence.ts';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const baselineRoot = args.get('baseline-root');
if (!baselineRoot) throw Error('Provide --baseline-root=<pristine-PR180-checkout>');
const json = (p) => JSON.parse(readFileSync(p, 'utf8')),
  sha = (b) => createHash('sha256').update(b).digest('hex'),
  sourceHash = pr172SourceHash(),
  baselineSourceHash = pr172SourceHash(baselineRoot),
  comparison = json('docs/performance/PR181-policy-comparison.json'),
  lineage = json('docs/performance/PR181-depth-lineage.json'),
  integrity = json('docs/performance/PR181-integrity.json'),
  verification = json('docs/performance/PR181-verification.json'),
  browser = json('docs/performance/PR181-browser.json');
for (const r of [comparison, lineage, integrity, verification, browser])
  if (r.sourceHash !== sourceHash) throw Error('Final receipt source mismatch');
if (
  verification.exitCode !== 0 ||
  verification.tests !== 2020 ||
  comparison.rows.length !== 30 ||
  lineage.rows.length !== 30 ||
  !lineage.allCanonicalStatesEqual ||
  integrity.rows.length !== 5 ||
  integrity.rows.some((r) => !r.equal) ||
  !integrity.full.equal ||
  !browser.digestMatches
)
  throw Error('Final correctness gate failed');
for (const [name, count] of [
  ['controlled', 130],
  ['contexts', 80],
  ['human-mechanics', 16],
]) {
  const r = JSON.parse(gunzipSync(readFileSync(`docs/performance/pr181-evidence/${name}.json.gz`)));
  if (r.sourceHash !== sourceHash || r.rows.length !== count)
    throw Error(`Controlled evidence mismatch: ${name}`);
}
const counterfactuals = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr181-evidence/baseline-counterfactuals.json.gz')),
);
if (
  counterfactuals.rows.length !== 60 ||
  counterfactuals.rows.some(
    (r) => r.sourceHash !== (r.label === 'before' ? baselineSourceHash : sourceHash),
  )
)
  throw Error('Counterfactual source mismatch');

const rawRoot = args.get('performance') ?? '../pr181-performance',
  evidenceRoot = 'docs/performance/pr181-evidence/performance';
mkdirSync(evidenceRoot, { recursive: true });
const trials = [];
const trial = (label, policy) => {
  const bytes = readFileSync(`${rawRoot}/${label}-${policy}.json`),
    r = JSON.parse(bytes),
    expectedSource = label.endsWith('before') ? baselineSourceHash : sourceHash;
  if (
    r.sourceHash !== expectedSource ||
    r.observers !== false ||
    !r.serial ||
    r.policy !== policy ||
    r.label !== label ||
    r.ticks < 4800 ||
    !Number.isFinite(r.cpuSeconds) ||
    r.cpuSeconds <= 0 ||
    !Number.isFinite(r.wallSeconds) ||
    r.wallSeconds <= 0
  )
    throw Error(`Invalid performance trial ${label}/${policy}`);
  const artifact = `pr181-evidence/performance/${label}-${policy}.json.gz`,
    compressed = gzipSync(bytes);
  writeFileSync(`docs/performance/${artifact}`, compressed);
  const { statistics, ...compact } = r;
  const sum = (key) => statistics.players.reduce((n, p) => n + (p[key] ?? 0), 0);
  const result = {
    ...compact,
    passes: sum('passesAttempted'),
    shots: sum('shots'),
    artifact,
    artifactSha256: sha(compressed),
  };
  trials.push(result);
  return result;
};
const pair = (before, after) => {
  if (
    before.inputHash !== after.inputHash ||
    before.sessionHash !== after.sessionHash ||
    before.design.id !== after.design.id ||
    before.policy !== after.policy
  )
    throw Error('Performance pair input mismatch');
  return {
    policy: after.policy,
    fixture: after.design.id,
    inputHash: after.inputHash,
    before,
    after,
    ratios: {
      cpu: after.cpuSeconds / before.cpuSeconds,
      wall: after.wallSeconds / before.wallSeconds,
      sampledRss: after.maxSampledRssBytes / before.maxSampledRssBytes,
    },
  };
};
const full = pair(
    trial('full-before', 'phase-role-hybrid-v1'),
    trial('full-after', 'phase-role-hybrid-v1'),
  ),
  windows = PRIMARY_DECISION_POLICIES.map((p) =>
    pair(trial('window-before', p), trial('window-after', p)),
  );
if (
  full.before.status !== 'full_time' ||
  full.after.status !== 'full_time' ||
  full.after.finalHash !== integrity.full.finalHash ||
  full.after.ticks !== integrity.full.ticks
)
  throw Error('Full performance completion/replay mismatch');
const oldArchives = [
  'docs/performance/pr179-evidence/initial-states.json.gz',
  'docs/performance/pr180-evidence/pr182-sealed.json.gz',
  'docs/performance/PR179-fixture-manifest.json',
  'docs/performance/PR180-inputs.json',
].map((path) => {
  // Byte hashing only: reserved states must never be decompressed or simulated here.
  const currentBytes = readFileSync(path),
    originalBytes = readFileSync(resolve(baselineRoot, path)),
    normalize = (bytes) =>
      path.endsWith('.gz') ? bytes : bytes.toString('utf8').replaceAll('\r\n', '\n'),
    current = sha(normalize(currentBytes)),
    original = sha(normalize(originalBytes));
  if (current !== original) throw Error(`Previous/reserved evidence changed: ${path}`);
  return {
    path,
    sha256: sha(currentBytes),
    baselineSha256: sha(originalBytes),
    byteEqual: currentBytes.equals(originalBytes),
    comparedSha256: current,
    comparison: path.endsWith('.gz') ? 'stored bytes' : 'text with checkout CRLF normalized to LF',
    unchanged: true,
  };
});
const performance = {
  schema: 'mfl-pr181-serial-performance-comparison-v1',
  sourceHash,
  baselineSourceHash,
  method:
    'Twelve serial fresh-process trials, fixed 0.025s canonical step, no observers or profiler; all other simulation/test workers stopped. One complete matched R3 SS1 before/after pair plus five matched 120s SW2 policy windows. Before uses pristine PR180 and the same final frozen native inputs. No replication or statistical confidence interval; full workload and football history differ, so ratios do not isolate marginal function cost. RSS sampled every 8000 ticks is not an allocation peak.',
  full,
  windows,
  trials,
  naturalStoppages: {
    scope:
      'One paired complete R3 SS1 design; descriptive only. Completed referee/restart ledger intervals, not an inserted delay or a separately measured live-minute denominator.',
    before: {
      seconds: full.before.deadBallSeconds,
      intervals: full.before.completedStoppages,
      elapsed: full.before.time,
    },
    after: {
      seconds: full.after.deadBallSeconds,
      intervals: full.after.completedStoppages,
      elapsed: full.after.time,
    },
  },
};
writeFileSync(
  'docs/performance/PR181-performance.json',
  JSON.stringify(performance, null, 2) + '\n',
);
writeFileSync(
  'docs/performance/PR181-reservation-proof.json',
  JSON.stringify(
    {
      schema: 'mfl-pr181-reservation-proof-v1',
      sourceHash,
      method:
        'SHA-256 of stored archive bytes against the pristine PR180 checkout; text manifests normalize checkout CRLF to LF and retain both raw hashes. No reserved archive decoded, decompressed or stepped.',
      files: oldArchives,
    },
    null,
    2,
  ) + '\n',
);

const fmt = (x) => x.toFixed(2),
  mib = (x) => fmt(x / 1048576),
  table = [
    '| Serial matched workload | CPU before/after (s) | Wall before/after (s) | Sampled RSS before/after (MiB) | CPU ratio |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...[full, ...windows].map(
      (p, i) =>
        `| ${i === 0 ? 'Full R3 SS1' : `120 s ${p.policy} SW2`} | ${fmt(p.before.cpuSeconds)} / ${fmt(p.after.cpuSeconds)} | ${fmt(p.before.wallSeconds)} / ${fmt(p.after.wallSeconds)} | ${mib(p.before.maxSampledRssBytes)} / ${mib(p.after.maxSampledRssBytes)} | ${fmt(p.ratios.cpu)}× |`,
    ),
  ].join('\n');
const section = `<!-- PR181_VERIFICATION_START -->
**Full original \`npm run verify\` PASS: 2,020 tests** (1,957 unit, 54 integration,
4 career contract, 5 full career), lint, TypeScript and Vite build. The
[verification receipt](performance/PR181-verification.json) preserves the full log,
an earlier concurrent wall-time timeout and its serial repeat; original test limits
and performance budgets are unchanged. Existing build chunk/dynamic-import warnings
are recorded. Final production source is \`${sourceHash}\`.

[Complete-state integrity](performance/PR181-integrity.json) reproduces each policy's
120-second canonical state twice with observers and once without them: all fifteen
states match within policy. The complete R3 SS1 observer-free performance run equals
its observed cohort state/tick count. All thirty lineage replays also equal their
original complete canonical states, ticks and official passing identities.

${table}

The complete paired R3 workload uses ${fmt((full.ratios.cpu - 1) * 100)}% more CPU.
The five bounded window ratios range from ${fmt(Math.min(...windows.map((p) => p.ratios.cpu)))}×
to ${fmt(Math.max(...windows.map((p) => p.ratios.cpu)))}×; they do not establish a universal slowdown or speedup.

[Serial trial inputs, hashes, costs and limitations](performance/PR181-performance.json)
retain all twelve raw receipts. These are single paired workloads, without uncertainty
estimates; changed football histories affect CPU and sampled memory. They cannot
prove the cost of an isolated function. The completed natural stoppage ledger on the
full R3 pair changes from ${fmt(full.before.deadBallSeconds)} s / ${full.before.completedStoppages} intervals
to ${fmt(full.after.deadBallSeconds)} s / ${full.after.completedStoppages} intervals, over elapsed
${fmt(full.before.time)} / ${fmt(full.after.time)} s. Both use the original lawful clock/restart
lifecycle. This one design does not establish a general stoppage increase.

[Reservation proof](performance/PR181-reservation-proof.json) confirms unchanged stored
bytes for both previous/reserved state archives and unchanged manifest text after
checkout newline normalization, without decoding reserved inputs.
[Evidence index](performance/PR181-evidence-index.json) identifies
the committed receipts and compressed artifacts by SHA-256.
<!-- PR181_VERIFICATION_END -->`;
const report = 'docs/PR181_ATTACKING_DEPTH_WING_DUELS_AERIAL_FOOTBALL.md';
writeFileSync(
  report,
  readFileSync(report, 'utf8').replace(
    /<!-- PR181_VERIFICATION_START -->[\s\S]*?<!-- PR181_VERIFICATION_END -->/,
    section,
  ),
);

const walk = (path) =>
  readdirSync(path, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${path}/${e.name}`) : [`${path}/${e.name}`],
  );
const paths = [
  ...readdirSync('docs/performance')
    .filter(
      (p) => p.startsWith('PR181-') && p.endsWith('.json') && p !== 'PR181-evidence-index.json',
    )
    .map((p) => `docs/performance/${p}`),
  ...walk('docs/performance/pr181-evidence'),
  ...readdirSync('scripts')
    .filter((p) => /^(benchmarkPr181|reportPr181|preparePr181|pr181)/.test(p))
    .map((p) => `scripts/${p}`),
];
writeFileSync(
  'docs/performance/PR181-evidence-index.json',
  JSON.stringify(
    {
      schema: 'mfl-pr181-evidence-index-v1',
      sourceHash,
      scope:
        'Committed final evidence and reproducible harnesses. Initial-candidate and historical failure receipts retain their original source/provenance; final measured source is identified separately. Index intentionally excludes itself and prose reports.',
      files: paths.sort().map((path) => {
        const b = readFileSync(path);
        return { path, bytes: b.length, sha256: sha(b) };
      }),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    trials: trials.length,
    fullCpuRatio: full.ratios.cpu,
    sourceHash,
    reservedArchivesByteEqual: true,
    indexed: paths.length,
  }),
);
