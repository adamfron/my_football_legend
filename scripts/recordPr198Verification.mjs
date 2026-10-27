import console from 'node:console';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { basename } from 'node:path';
import { args, hash, read, receipt } from './pr198Evidence.mjs';
import { catalogue } from './pr198Catalogue.mjs';
const version = args().get('version') ?? 'v1';
if (!/^[a-z0-9-]+$/.test(version)) throw Error('Invalid verification version');
const folder = `docs/performance/pr198/verification/${version}/`;
mkdirSync(folder, { recursive: true });
const logs = [];
const archiveLog = (key, input) => {
  const bytes = readFileSync(input),
    path = folder + key + '.log.gz';
  writeFileSync(path, gzipSync(bytes), { flag: 'wx' });
  const entry = { key, path, sha256: hash(readFileSync(path)), uncompressedSha256: hash(bytes) };
  logs.push(entry);
  return entry;
};
const groups = ['baseline', 'implementation', 'implementation-v2', 'final-v1'],
  runs = [];
for (const group of groups)
  for (const row of read(`../checks/${group}/results.json`)) {
    const log = archiveLog(group + '-' + row.command.replaceAll(':', '-'), row.log);
    runs.push({
      group,
      command: 'npm run ' + row.command,
      exitCode: row.exitCode,
      seconds: row.seconds,
      log,
    });
  }
const latest = new Map(runs.map((r) => [r.command, r]));
const required = [
  'benchmark:pr195:check',
  'benchmark:pr196:historical',
  'benchmark:pr196:check',
  'benchmark:pr196:replay',
  'benchmark:pr197:check',
  'benchmark:pr197:replay',
  'benchmark:pr197:source-replay',
  'benchmark:pr198:check',
  'benchmark:pr198:replay',
  'verify',
  'lint',
  'build',
];
for (const command of required)
  if (latest.get('npm run ' + command)?.exitCode !== 0)
    throw Error('Required final command missing or failed: ' + command);
const sourceLogs = [
  'pr198-source-receptions-v1',
  'pr198-source-opportunities-v1',
  'pr198-source-disruption-v1',
  'pr198-source-disruption-final',
  'pr198-source-performance-v2',
];
const witnesses = [];
for (const key of sourceLogs) {
  const path = `../checks/${key}.log`,
    text = readFileSync(path, 'utf8'),
    log = archiveLog(key, path);
  for (const match of text.matchAll(/PR198 exact-source PASS ([\w-]+) ([a-f0-9]{64})/g))
    witnesses.push({ key: match[1], fingerprint: match[2], log: log.path });
}
const exactSource = Object.entries(catalogue).map(([key, [name]]) => {
  const expected = read('docs/performance/pr198/' + name).result.source;
  const witness = witnesses.find((w) => w.key === key && w.fingerprint === expected.fingerprint);
  if (!witness) throw Error('Missing exact-source PASS: ' + key);
  return { key, source: expected, log: witness.log };
});
const jobs = read('../checks/completed-jobs.json');
if (jobs.some((j) => j.exitCode !== 0)) throw Error('Background verification failed');
const coordinator = read('../checks/matches/results-v2.json');
if (coordinator.results.length !== 14 || coordinator.results.some((r) => r.code !== 0))
  throw Error('Incomplete match coordinator');
const coordinatorSource = readFileSync('../runMatches.mjs'),
  coordinatorPath = folder + 'coordinator-source.mjs.gz';
writeFileSync(coordinatorPath, gzipSync(coordinatorSource), { flag: 'wx' });
const concurrency = {
  schema: 'pr198-concurrent-run-v1',
  ...coordinator,
  coordinatorSource: { path: coordinatorPath, sha256: hash(coordinatorSource) },
  qualification:
    'Three workers in this coordinator, plus separately recorded research/observer/test processes on the host. Coordinator wall, child CPU and per-process peak RSS are different measures. No serial full-match speed claim.',
};
receipt('docs/performance/pr198/concurrency-v2.json', concurrency);
const summary = read('docs/performance/pr198/summary.json');
const fullObserverReplays = summary.fullMatches
  .filter((r) => r.observerFullReplay)
  .map((r) => ({
    path: r.path,
    original: r.observerFullReplay,
    physicalEquivalent: read(r.path).physicalEquivalent,
  }));
if (fullObserverReplays.length !== 3 || fullObserverReplays.some((r) => !r.physicalEquivalent))
  throw Error('Full observer replay protection');
for (const row of fullObserverReplays)
  archiveLog(
    basename(row.path).replace('.json.gz', ''),
    `../checks/matches/${basename(row.path).replace('.json.gz', '')}${row.path.includes('hierarchical') ? '-retry2' : ''}.log`,
  );
const result = {
  schema: 'pr198-local-verification-v1',
  version,
  status: 'PASS',
  clientDate: '2026-10-27',
  clientTimezone: 'Europe/Warsaw',
  implementationCommit: '53ceb55a187ed48de76d5892afd6b1ca86f39736',
  runs,
  required,
  exactSource,
  jobs,
  fullObserverReplays,
  logs,
  tests: { unit: 2336, integration: 56, careerContract: 4, fullCareer: 5, total: 2401 },
  negativeRuns:
    'Initial lint errors and Windows checkout byte/template failures are retained. Final successful reruns resolve them. Rejected receiver and exploratory measurement receipts are not success evidence.',
  finalHeadCI:
    'Inspect actual PR head independently; local receipt does not assert remote CI success.',
  canonicalReadiness: 'NOT READY',
  independentConfirmation: 'sealed',
};
receipt(`docs/performance/pr198/verification-${version}.json`, result);
writeFileSync('docs/performance/pr198/verification.json', JSON.stringify(result, null, 2) + '\n');
console.log(
  'PR198 local verification PASS',
  required.length,
  'commands,',
  exactSource.length,
  'exact-source laboratories,',
  fullObserverReplays.length,
  'whole observer replays,',
  result.tests.total,
  'tests',
);
