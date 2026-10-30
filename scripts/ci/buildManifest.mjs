import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { catalogue as c198, groups as g198 } from '../pr198Catalogue.mjs';
import { catalogue as c199, groups as g199 } from '../pr199Catalogue.mjs';
import {
  digest,
  json,
  validateManifest,
  manifestSchema,
  equivalenceSchema,
  nodeResourceSchema,
  groupExecutionSchema,
} from './manifest.mjs';
import { z } from 'zod';
import { qualityProgram } from './quality.mjs';
import { BASE as PR203_BASE } from '../pr203Evidence.mjs';
import { checkPr205Source } from '../pr205SourceGuard.mjs';
const ROOT = 'docs/performance/pr202';
const BASE = '5b6bbf6778017ac415964dd48dfe30b850f2f352';
const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024 });
const cache = new Map();
const read = (p) => {
  if (!cache.has(p))
    cache.set(
      p,
      JSON.parse(p.endsWith('.gz') ? gunzipSync(readFileSync(p)) : readFileSync(p, 'utf8')),
    );
  return cache.get(p);
};
const hash = (x) => digest(typeof x === 'string' ? x : JSON.stringify(x));
const receipt = (path) => {
  const r = read(path).result ?? read(path),
    s = r.source;
  return {
    path,
    sha256: digest(readFileSync(path)),
    resultSha256: hash(r),
    finalHash: r.finalHash ?? null,
    source: s?.path
      ? { ...s, base: read(s.path).base, archiveSha256: digest(readFileSync(s.path)) }
      : null,
  };
};
const tasks = [],
  original = [];
const add = (job, command, cases = [], os = 'ubuntu-latest', node = '24', timeoutMinutes = 30) => {
  let group = original.find((g) => g.id === job);
  if (!group) original.push((group = { id: job, tasks: [] }));
  const id = `${job}/${group.tasks.length + 1}`;
  group.tasks.push(id);
  tasks.push({
    id,
    originalJob: job,
    command,
    cases,
    os,
    node,
    timeoutMinutes,
    requiredResult: 'success',
  });
};
const npm = (job, name, cases = [], args = [], ...context) =>
  add(job, ['npm', 'run', name, ...(args.length ? ['--', ...args] : [])], cases, ...context);
const workflow = readFileSync(`${ROOT}/ci-pr201.yml`, 'utf8').replaceAll('\r\n', '\n');
assert.equal(
  workflow,
  git(['show', `${BASE}:.github/workflows/ci.yml`]),
  'Rollback workflow differs from merged PR201',
);
const originalPackage = JSON.parse(git(['show', `${BASE}:package.json`]));
const currentPackage = json('package.json');
for (const key of Object.keys(currentPackage.scripts).filter((k) => k.startsWith('ci:')))
  delete currentPackage.scripts[key];
assert.deepEqual(currentPackage, originalPackage, 'Existing npm commands/dependencies changed');
checkPr205Source();
// Preserve the original PR202 unchanged-runtime assertion over its historical
// interval. PR203 current bytes are independently bound above and replayed.
git([
  'diff',
  '--exit-code',
  BASE,
  PR203_BASE,
  '--',
  'src',
  'scripts',
  'package-lock.json',
  'docs/performance',
  'docs/match-engine',
  ':(exclude)scripts/ci/**',
  ':(exclude)docs/performance/pr202/**',
]);
// Derive unchanged verify/historical commands from the frozen workflow, rather than a second hand-written list.
for (const family of ['checks', 'historical-checks']) {
  const block = workflow.split(`  ${family}:\n`)[1].split(/^ {2}[a-z][\w-]+:\n/m)[0];
  for (const match of block.matchAll(/- group: (\S+)\n\s+command: (.+)/g)) {
    const job = `${family}:${match[1]}`;
    if (family === 'historical-checks') npm(job, 'generate:world-db');
    for (const command of match[2].split(' && ')) {
      assert.match(command, /^npm run [\w:-]+$/);
      npm(job, command.slice(8));
    }
    if (family === 'checks' && match[1] === 'main')
      add(job, ['file-exists', 'dist/data/world/pl-2026-v2.json']);
    if (family === 'historical-checks')
      add(job, ['git', 'diff', '--exit-code', '--', 'docs/performance', 'docs/match-engine']);
  }
}
for (const [edition, catalogue, groups] of [
  [198, c198, g198],
  [199, c199, g199],
])
  for (const [group, keys] of Object.entries(groups)) {
    const job = `pr${edition}-source:${group}`;
    npm(
      job,
      `benchmark:pr${edition}:source-replay`,
      keys.map((key) => ({
        id: `pr${edition}:${key}`,
        receipt: receipt(`docs/performance/pr${edition}/${catalogue[key][0]}`),
      })),
      [`--case=${group}`],
    );
    add(job, ['git', 'diff', '--exit-code', '--', 'docs/performance', 'docs/match-engine']);
  }
const local200 = {
  frozen: 'local-frozen-v1',
  changed: 'local-changed-v1',
  fresh: 'local-fresh-v1',
  keepers: 'goalkeepers-v1',
  'keepers-v2': 'goalkeepers-v2',
  diagnosis: 'local-bounded-diagnosis-v1',
  smoke: 'prefix/ww-state-value-v1-realism-candidate-v0-smoke-v1',
  'frozen-final': 'local-frozen-final-v1',
  'fresh-final': 'local-fresh-final-v1',
  'diagnosis-final': 'local-bounded-diagnosis-final-v1',
  'keepers-v3': 'goalkeepers-v3',
  information: 'information-boundary-final-v1',
};
for (const [key, file] of Object.entries(local200)) {
  const job = `pr200-source:${key}`;
  npm(
    job,
    'benchmark:pr200:source-replay',
    [{ id: `pr200:${key}`, receipt: receipt(`docs/performance/pr200/${file}.json.gz`) }],
    [`--case=${key}`],
  );
  add(job, ['git', 'diff', '--exit-code', '--', 'docs/performance', 'docs/match-engine']);
}
const fixtureLine = workflow.match(/fixture: \[([^\]]+)\]/)[1];
for (const fixture of fixtureLine.split(', '))
  for (const cohort of ['current', 'historical']) {
    const job = `pr200-matches:${fixture}:${cohort}`;
    const names = readdirSync('docs/performance/pr200/matches')
      .filter((n) => n.startsWith(fixture + '-') && n.endsWith('.json.gz'))
      .filter(
        (n) =>
          /-canonical-pr199-v1.json.gz$|-realism-candidate-v0-v3.json.gz$/.test(n) ===
          (cohort === 'current'),
      );
    npm(
      job,
      'benchmark:pr200:source-replay',
      names.map((n) => ({
        id: `pr200:match-${n.slice(0, -8)}`,
        receipt: receipt(`docs/performance/pr200/matches/${n}`),
      })),
      [`--case=matches-${fixture}`, `--cohort=${cohort}`],
      'windows-2025',
      '24.22.1',
      45,
    );
    if (cohort === 'current') {
      const keys = ['realism-candidate-v1-v1', 'realism-candidate-no-recovery-v1-v1'].map(
        (p) => `match-${fixture}-${p}`,
      );
      npm(
        job,
        'benchmark:pr201:source-replay',
        keys.map((key) => ({
          id: `pr201:${key}`,
          receipt: receipt(`docs/performance/pr201/matches/${key.slice(6)}.json.gz`),
        })),
        [`--case=${keys.join(',')}`],
        'windows-2025',
        '24.22.1',
        45,
      );
      const key = `match-${fixture}-canonical-pr199-v1`;
      npm(
        job,
        'benchmark:pr201:source-replay',
        [
          {
            id: `pr201:final-main:${fixture}`,
            receipt: receipt(`docs/performance/pr201/matches/${key.slice(6)}.json.gz`),
          },
          {
            id: `pr201:final-main-proof:${fixture}`,
            receipt: receipt(`docs/performance/pr201/baseline-final-pr200/${fixture}.json`),
          },
        ],
        ['--baseline-runtime', `--case=${key}`],
        'windows-2025',
        '24.22.1',
        45,
      );
    }
    add(
      job,
      ['git', 'diff', '--exit-code', '--', 'docs/performance', 'docs/match-engine'],
      [],
      'windows-2025',
      '24.22.1',
      45,
    );
  }
for (const os of ['ubuntu-latest', 'windows-2025']) {
  const job = `pr200-platform:${os}`;
  add(
    job,
    [
      'node',
      '--experimental-transform-types',
      '--import',
      './scripts/registerTypescriptLoader.mjs',
      'scripts/probePr200Platform.mjs',
    ],
    [
      {
        id: 'pr200:platform-probe',
        receipt: receipt('docs/performance/pr200/platform-probe-win32-v2.json.gz'),
      },
    ],
    os,
    '24.22.1',
  );
  if (os === 'windows-2025')
    npm(
      job,
      'benchmark:pr201:source-replay',
      readdirSync('docs/performance/pr201')
        .filter((n) => n.endsWith('.json.gz'))
        .map((n) => ({
          id: `pr201:${n.slice(0, -8)}`,
          receipt: receipt(`docs/performance/pr201/${n}`),
        })),
      [],
      os,
      '24.22.1',
    );
  add(
    job,
    ['git', 'diff', '--exit-code', '--', 'docs/performance', 'docs/match-engine'],
    [],
    os,
    '24.22.1',
  );
}
const baseline = json(`${ROOT}/baseline-jobs.json`).attempts[0].jobs;
const label = (id) =>
  id
    .replace(/^pr198-source:(.+)$/, 'PR198 source ($1)')
    .replace(/^pr199-source:(.+)$/, 'PR199 source ($1)')
    .replace(/^pr200-source:(.+)$/, 'PR200 local ($1)');
const source = original
  .filter((g) => /^pr(198|199|200)-source:/.test(g.id))
  .map((g) => ({
    ...g,
    seconds: baseline
      .find((j) => j.name === label(g.id))
      .steps.filter((s) => s.name.startsWith('Run npm run benchmark:'))
      .reduce((a, s) => a + (Date.parse(s.completed_at) - Date.parse(s.started_at)) / 1000, 0),
  }))
  .sort((a, b) => b.seconds - a.seconds || a.id.localeCompare(b.id));
const packed = Array.from({ length: 4 }, (_, i) => ({
  id: `source-0${i + 1}`,
  tasks: [],
  measuredPayloadSeconds: 0,
}));
for (const g of source) {
  const target = [...packed].sort(
    (a, b) => a.measuredPayloadSeconds - b.measuredPayloadSeconds || a.id.localeCompare(b.id),
  )[0];
  target.tasks.push(...g.tasks);
  target.measuredPayloadSeconds += g.seconds;
}
const proposed = [
  ...original
    .filter((g) => !source.some((s) => s.id === g.id))
    .map((g) => ({ ...g, measuredPayloadSeconds: 0 })),
  ...packed,
];
const m = validateManifest({
  schema: 'pr202-ci-manifest-v1',
  base: '5b6bbf6778017ac415964dd48dfe30b850f2f352',
  originalWorkflowSha256: digest(workflow),
  packageScriptsSha256: hash(json('package.json').scripts),
  gate: {
    name: 'quality',
    os: 'ubuntu-latest',
    timeoutMinutes: 30,
    originalNeeds: workflow
      .split('  quality:\n')[1]
      .match(/needs: \[([^\]]+)\]/)[1]
      .split(', '),
    proposedNeeds: [
      'checks',
      'historical-checks',
      'historical-source',
      'pr200-matches',
      'pr200-platform',
    ],
    requireEveryResult: 'success',
    originalCommand: workflow.split('  quality:\n')[1].match(/run: (.+)/)[1],
    proposedProgram: qualityProgram,
    rejectedResults: ['failure', 'cancelled', 'skipped', 'timed_out', 'missing'],
  },
  tasks,
  original,
  proposed,
});
const frozen = json(`${ROOT}/task-manifest-pr201.json`);
assert.equal(
  digest(readFileSync(`${ROOT}/task-manifest-pr201.json`)),
  '2074c644791c5c44e246d1160f3aea8c0b788428bd80a78b19c22a0f207aeb35',
  'Frozen coverage changed',
);
assert.deepEqual(tasks, frozen.tasks, 'Original command/case/receipt coverage changed');
assert.deepEqual(original, frozen.jobs, 'Original job inventory changed');
assert.equal(m.proposed.length + 1, 28);
assert.equal(
  m.tasks
    .flatMap((t) => t.cases)
    .filter((c) => /^(pr200:match-|pr201:match-|pr201:final-main:)/.test(c.id)).length,
  63,
);
const canonical = (list) => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const oldDefinitions = hash(canonical(frozen.tasks));
const newDefinitions = hash(
  canonical(m.proposed.flatMap((g) => g.tasks.map((id) => m.tasks.find((t) => t.id === id)))),
);
assert.equal(oldDefinitions, newDefinitions, 'Task definitions differ after scheduling');
const proof = equivalenceSchema.parse({
  schema: 'pr202-ci-equivalence-v1',
  base: BASE,
  originalTaskDefinitionsSha256: oldDefinitions,
  proposedTaskDefinitionsSha256: newDefinitions,
  frozenInventorySha256: digest(readFileSync(`${ROOT}/task-manifest-pr201.json`)),
  originalCommands: m.tasks.length,
  explicitCases: m.tasks.flatMap((t) => t.cases).length,
  fullMatchExecutions: 63,
  beforeJobs: 43,
  afterJobs: 28,
  taskMultiplicityEqual: true,
  platformsAndEditionsEqual: true,
  receiptAndArchiveBytesEqual: true,
  originalTimeoutsEqual: true,
  currentRuntimeAndHistoricalEvidenceUnchanged: true,
  historicalCheckerContext: 'merged-pr201-private-index-and-work-tree',
});
for (const [name, value] of Object.entries({
  'task-manifest.json': m,
  'coverage-equivalence.json': proof,
  'task-manifest.schema.json': z.toJSONSchema(manifestSchema),
  'coverage-equivalence.schema.json': z.toJSONSchema(equivalenceSchema),
  'node-resource.schema.json': z.toJSONSchema(nodeResourceSchema),
  'group-execution.schema.json': z.toJSONSchema(groupExecutionSchema),
})) {
  const output = JSON.stringify(value, null, 2) + '\n';
  if (process.argv.includes('--check'))
    assert.equal(readFileSync(`${ROOT}/${name}`, 'utf8'), output, `Regenerate ${name}`);
  else writeFileSync(`${ROOT}/${name}`, output);
}
console.log(
  `CI manifest: ${tasks.length} commands, ${m.tasks.flatMap((t) => t.cases).length} explicit cases; 43 -> 28 jobs; 63 complete matches preserved`,
);
