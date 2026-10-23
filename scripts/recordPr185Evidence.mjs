import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { resolve, dirname, relative } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import ts from 'typescript';

const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v))
    .digest('hex');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const write = (name, value) =>
  writeFileSync(`docs/performance/PR185-${name}.json`, JSON.stringify(value) + '\n');
const files = readdirSync('src', { recursive: true })
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort();
const entries = files.map((p) => ({
  path: `src/${p}`,
  sha256: sha(readFileSync(`src/${p}`, 'utf8').replaceAll('\r\n', '\n')),
}));
const sourceSha256 = sha(
  files.map((p) => `${p}\0${readFileSync(`src/${p}`, 'utf8').replaceAll('\r\n', '\n')}`).join('\0'),
);
const baseline = read('docs/performance/PR185-baseline.json');
for (const f of baseline.historical)
  if (sha(readFileSync(f.path)) !== f.sha256) throw Error(`Historical receipt changed: ${f.path}`);
const portableSourceSha256 = sha(
  entries
    .map((e) => ({ ...e, path: e.path.replaceAll('\\', '/') }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
);
const provenance = {
  baseCommit: baseline.mergedPr184,
  sourceSha256,
  portableSourceSha256,
  stepSeconds: 0.025,
};
const harnesses = [
  'scripts/benchmarkPr185.mjs',
  'scripts/benchmarkPr185Matches.mjs',
  'scripts/benchmarkPr185Telemetry.mjs',
  'scripts/recordPr185Evidence.mjs',
  'scripts/replayPr185.mjs',
  'scripts/pr185Baseline.ts',
];
write('source-manifest', {
  ...provenance,
  entries,
  fingerprintEncoding:
    'sourceSha256 uses native Windows relative path separators and LF-normalized contents; portableSourceSha256 hashes sorted JSON path/sha256 entries with forward slashes. Neither is a Git commit SHA.',
  packageLockSha256: sha(readFileSync('package-lock.json')),
  harnesses: harnesses.map((p) => ({
    path: p,
    sha256: sha(readFileSync(p, 'utf8').replaceAll('\r\n', '\n')),
  })),
});

// Conservatively include TYPE imports too. A file excluded from this overapproximation
// cannot alter execution of the match entry points through a static relative import.
const closure = new Set();
const visit = (p) => {
  p = resolve(p);
  if (closure.has(p)) return;
  closure.add(p);
  const text = readFileSync(p, 'utf8');
  for (const ref of ts.preProcessFile(text, true, true).importedFiles)
    if (ref.fileName.startsWith('.')) {
      const base = resolve(dirname(p), ref.fileName.replace(/\.js$/, '.ts'));
      const next = [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')].find(
        (x) => existsSync(x) && /\.(ts|tsx)$/.test(x),
      );
      if (next) visit(next);
    }
};
for (const name of [
  'benchmarkFixtures',
  'roleExperiment',
  'matchSimulation',
  'matchState',
  'playerMatchStats',
  'matchFlowTelemetry',
])
  visit(`src/core/matchSimulation/${name}.ts`);
const bridgePath = 'docs/performance/PR185-match-source-bridge.json';
const priorBridge = existsSync(bridgePath) ? read(bridgePath) : undefined;
const frozen = existsSync('../pr185-match-source-manifest.json')
  ? read('../pr185-match-source-manifest.json')
  : { sourceSha256: priorBridge.matchMeasuredSourceSha256, rows: priorBridge.matchSourceManifest };
const changed = entries.filter(
  (e) =>
    frozen.rows.find((f) => f.path.replaceAll('\\', '/') === e.path.replaceAll('\\', '/'))
      ?.sha256 !== e.sha256,
);
if (changed.some((e) => closure.has(resolve(e.path))))
  throw Error('Match execution changed after the recorded match freeze');
write('match-source-bridge', {
  ...provenance,
  matchMeasuredSourceSha256: frozen.sourceSha256,
  matchSourceManifest: frozen.rows,
  changedAfterMatchFreeze: changed,
  staticImportClosure: [...closure].map((p) => relative('.', p).replaceAll('\\', '/')).sort(),
  conclusion:
    'The final changes after the full-match freeze are laboratory protocol/measurement only and are outside the conservative match dependency closure. Original complete-source hashes remain attached to their original measurements.',
});

const dir = 'docs/performance/pr185-matches';
const names = existsSync(dir)
  ? readdirSync(dir)
      .filter((p) => /^(pr184|pr185)-.*\.json$/.test(p))
      .sort()
  : [];
const archive = 'docs/performance/pr185-traces/match-regression.json.gz';
const runs = names.length
  ? names.map((name) => ({ name, ...read(`${dir}/${name}`) }))
  : JSON.parse(gunzipSync(readFileSync(archive)));
if (runs.filter((r) => r.version === 'pr185' && r.full).length !== 3)
  throw Error('Need both full policies and a complete observer-off repeat');
for (const r of runs.filter((r) => r.version === 'pr185' && r.full))
  if (r.sourceSha256 !== frozen.sourceSha256) throw Error('Full match source freeze mismatch');
const observed = runs.find(
  (r) => r.version === 'pr185' && r.policy === 'state-value-v1' && r.full && r.observed,
);
const bare = runs.find(
  (r) => r.version === 'pr185' && r.policy === 'state-value-v1' && r.full && !r.observed,
);
if (observed.finalStateSha256 !== bare.finalStateSha256 || observed.ticks !== bare.ticks)
  throw Error('Full-match observer/repeat mismatch');
const compact = (r) => ({
  version: r.version,
  policy: r.policy,
  observed: r.observed,
  full: r.full,
  status: r.status,
  ticks: r.ticks,
  canonicalSeconds: r.canonicalSeconds,
  score: r.score,
  measuredSourceSha256: r.sourceSha256,
  inputSha256: r.inputSha256,
  finalStateSha256: r.finalStateSha256,
  passes: r.telemetry?.passesAttempted ?? null,
  completedPasses: r.telemetry?.passesCompleted ?? null,
  shots: r.telemetry?.shots ?? null,
  goals: r.telemetry?.goals ?? null,
  fouls: r.telemetry?.fouls ?? null,
  wallMilliseconds: r.wallMilliseconds,
  cpuMicroseconds: r.cpuMicroseconds,
  rssBytes: r.rssBytes,
});
mkdirSync('docs/performance/pr185-traces', { recursive: true });
writeFileSync(archive, gzipSync(JSON.stringify(runs)));
write('match-regression', {
  ...provenance,
  archive,
  archiveSha256: sha(readFileSync(archive)),
  rows: runs.map(compact),
  fullObserverEquivalence: true,
  independentDesigns: 1,
  interpretation:
    'One development SW input paired across policies/versions. Full B repeat is deterministic/observer evidence, not another independent match design. Not a league calibration cohort.',
});

const telemetry = [];
const priorTelemetryPath = 'docs/performance/PR185-telemetry-reference.json';
const priorTelemetry = existsSync(priorTelemetryPath) ? read(priorTelemetryPath).rows : [];
for (const version of ['pr184', 'pr185'])
  for (const seed of ['a', 'b'])
    for (const repetition of [1, 2]) {
      const rawPath = `../telemetry-${version}-${seed}${repetition}.json`;
      const r = existsSync(rawPath)
        ? read(rawPath)
        : priorTelemetry.find(
            (t) =>
              t.version === version &&
              t.repetition === repetition &&
              t.seed === `pr146-flow-reference:${seed}`,
          );
      if (!r) throw Error(`Missing telemetry evidence: ${rawPath}`);
      telemetry.push({ version, repetition, ...r });
    }
for (const version of ['pr184', 'pr185'])
  for (const seed of ['a', 'b']) {
    const rows = telemetry.filter(
      (r) => r.version === version && r.seed === `pr146-flow-reference:${seed}`,
    );
    if (
      rows[0].telemetrySha256 !== rows[1].telemetrySha256 ||
      rows[0].finalStateSha256 !== rows[1].finalStateSha256
    )
      throw Error('Telemetry repeat mismatch');
  }
write('telemetry-reference', {
  ...provenance,
  rows: telemetry,
  allFieldsAndIdentityInvariants: true,
});

const lab = read('docs/performance/PR185-performance.json');
const summary = {
  ...provenance,
  labTrials: lab.totalTrials,
  baselineHistoricalFiles: baseline.historical.length,
  groups: lab.groups.map((g) => {
    const r = read(`docs/performance/PR185-${g.name}.json`);
    return { ...g, physicalStartingStates: r.physicallyDifferentStartingStates };
  }),
  matches: runs.map(compact),
  verification: process.argv.includes('--verified') ? 'passed' : 'pending',
};
write('evidence-index', summary);
if (process.argv.includes('--verified')) {
  const log = readFileSync('../pr185-verify-final.log', 'utf8');
  const repair = !log.includes('built in')
    ? readFileSync('../pr185-final-repair.log', 'utf8')
    : null;
  if (!(repair ?? log).includes('built in') || !log.includes('test:full-career'))
    throw Error('Verification log is incomplete');
  if (repair) {
    const proof = read('docs/performance/PR185-type-repair.json');
    const emitted = ts.transpileModule(readFileSync(proof.test, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    }).outputText;
    if (
      !proof.identicalEmittedJavaScript ||
      sha(emitted) !== proof.emittedJavaScriptSha256 ||
      !repair.includes('36 passed (36)')
    )
      throw Error('Type-only repair proof/test missing');
  }
  const testCounts = [...log.matchAll(/Tests\s+(\d+) passed \((\d+)\)/g)].map((m) => Number(m[1]));
  if (testCounts.length !== 4 || testCounts.some((n) => n === 0) || /FAIL|failed \(/.test(log))
    throw Error('Verification test stages did not all pass');
  const logArchive = 'docs/performance/pr185-traces/verification.log.gz';
  writeFileSync(logArchive, gzipSync(log));
  const repairArchive = 'docs/performance/pr185-traces/type-repair-verification.log.gz';
  if (repair) writeFileSync(repairArchive, gzipSync(repair));
  write('verification', {
    ...provenance,
    status: 'passed',
    command: 'npm run verify',
    initialVerifyExitCode: repair ? 2 : 0,
    finalVerificationStages: 'passed',
    ...(repair
      ? {
          repair: {
            command:
              'npm run lint; vitest run src/core/matchSimulation/extendedPhysicalLab.test.ts --maxWorkers=1; npm run build',
            exitCode: 0,
            reason:
              'Test-only nullable TypeScript assertion; emitted JavaScript byte-identical. No production change or assertion removed.',
            proof: 'docs/performance/PR185-type-repair.json',
            archive: repairArchive,
            archiveSha256: sha(readFileSync(repairArchive)),
          },
        }
      : {}),
    logSha256: sha(log),
    logArchive,
    logArchiveSha256: sha(readFileSync(logArchive)),
    testCounts: {
      unit: testCounts[0],
      matchIntegration: testCounts[1],
      careerContracts: testCounts[2],
      fullCareer: testCounts[3],
      total: testCounts.reduce((a, b) => a + b, 0),
    },
    checks: [
      'lint',
      'unit',
      'match integration',
      'career contracts',
      'full career',
      'TypeScript',
      'Vite build',
    ],
    historicalHashesPreserved: baseline.historical.length,
    policyDefault: 'state-value-v1',
    summaryCalibration: 'NOT READY',
    environment: {
      node: process.version,
      nodeOptions: '--max-semi-space-size=64',
      note: 'Bundled npm 11.6.2; dependencies copied from the identical PR184 lockfile installation. No project checks or time budgets are removed.',
    },
  });
}
console.log(
  JSON.stringify({
    sourceSha256,
    changedAfterMatchFreeze: changed.map((e) => e.path),
    trials: lab.totalTrials,
    matches: runs.length,
    verification: summary.verification,
  }),
);
