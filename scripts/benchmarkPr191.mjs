import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { createFootballLabProfile } from './footballLabProfile.ts';
import { createFirstTouchLabCatalog } from '../src/core/matchSimulation/firstTouchLabCatalog.ts';
import { runFirstTouchLab } from '../src/core/matchSimulation/firstTouchLaboratory.ts';
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? files(join(dir, d.name))
      : d.name.endsWith('.ts') && !d.name.endsWith('.test.ts')
        ? [join(dir, d.name).replaceAll('\\', '/')]
        : [],
  );
const manifest = files('src/core')
  .sort()
  .map((path) => ({ path, sha256: sha(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')) }));
const sourceHash = sha(manifest),
  args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('='))),
  out = args.get('output') ?? 'docs/performance/pr191/laboratory.json';
const check = args.has('check');
if (!check && existsSync(out)) throw Error('Refusing to overwrite evidence: ' + out);
const started = performance.now(),
  cpu = process.cpuUsage(),
  profile = createFootballLabProfile(),
  rows = [];
const run = (config, player, seed) => {
  const result = runFirstTouchLab(config, player, seed),
    hash = sha(result);
  const repeat = runFirstTouchLab(config, player, seed, (s) => {
    s.ball.x = 999;
  });
  if (hash !== sha(repeat)) throw Error('Observer/determinism failure ' + config.id);
  const stored = {
    id: config.id,
    inputHash: sha(result.input),
    seed,
    resultHash: hash,
    observerNeutral: true,
    ...result,
  };
  // Short traces in the readable receipt, complete traces for six named cases.
  if (
    [
      'descending_chest',
      'descending_thigh',
      'pressure',
      'first_time_pass',
      'close_shot',
      'juggle_5',
    ].includes(config.id) &&
    !seed.includes(':paired:') &&
    seed.endsWith(':0')
  ) {
    const tracePath = join(out, '..', `trace-${config.id}.json.gz`);
    const bytes = check ? readFileSync(tracePath) : gzipSync(JSON.stringify(stored));
    if (check && gunzipSync(bytes).toString('utf8') !== JSON.stringify(stored))
      throw Error('Selected uncompressed trace drift: ' + config.id);
    if (!check) {
      mkdirSync(join(out, '..'), { recursive: true });
      writeFileSync(tracePath, bytes);
    }
    stored.trace = {
      path: tracePath.replaceAll('\\', '/'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }
  stored.samples = stored.samples.filter(
    (_, i, a) => i === 0 || i === a.length - 1 || i % Math.max(1, Math.ceil(a.length / 12)) === 0,
  );
  return stored;
};
for (const config of createFirstTouchLabCatalog())
  for (const sample of [0, 1, 2])
    rows.push(
      run(
        { ...config, launcher: { ...config.launcher, dispersion: sample === 0 ? 0 : 0.025 } },
        profile,
        'pr191:' + config.id + ':' + sample,
      ),
    );
const contrasts = [];
for (const attribute of [
  'firstTouch',
  'technique',
  'agility',
  'composure',
  'concentration',
  'gameReading',
  'heading',
  'jumping',
  'dribbling',
  'passing',
  'finishing',
  'leadership',
])
  for (const level of [20, 40, 60, 80, 100])
    for (const sample of [0, 1, 2]) {
      const config = createFirstTouchLabCatalog().find(
        (c) => c.id === (attribute === 'gameReading' ? 'autonomous_aerial' : 'fast_low'),
      );
      const player = JSON.parse(JSON.stringify(profile));
      player.attributes[attribute] = level;
      config.launcher.dispersion = 0.025;
      const result = run(config, player, 'pr191:paired:' + config.id + ':' + sample);
      contrasts.push({
        attribute,
        level,
        sample,
        inputHash: result.inputHash,
        seed: result.seed,
        resultHash: result.resultHash,
        metrics: result.metrics,
        status: result.status,
        reason: result.reason,
        firstContact: result.contacts[0] ?? null,
      });
    }
const physicalVariants = [];
for (const [variable, levels, id] of [
  ['weakFootProficiency', [20, 40, 80, 100], 'weak_foot'],
  ['heightCm', [160, 180, 200], 'descending_chest'],
  ['condition', [40, 70, 100], 'fast_low'],
])
  for (const level of levels) {
    const config = createFirstTouchLabCatalog().find((c) => c.id === id),
      player = JSON.parse(JSON.stringify(profile));
    if (variable === 'condition') config.condition = level;
    else player[variable] = level;
    const r = run(config, player, 'pr191:physical:' + variable);
    physicalVariants.push({
      variable,
      level,
      input: r.input,
      resultHash: r.resultHash,
      contacts: r.contacts,
      metrics: r.metrics,
      status: r.status,
      reason: r.reason,
    });
  }
const physics = {
  schema: 'mfl-pr191-evidence-v1',
  sourceHash,
  manifest,
  stepSeconds: 0.025,
  baselineCommit: '251ec9f88f212f7a93d26ebc7491b1176e5a25ef',
  rows,
  contrasts,
  physicalVariants,
};
if (check) {
  const old = JSON.parse(readFileSync(out));
  if (sha(old.physics) !== sha(physics)) {
    const differences = [];
    const compare = (a, b, path) => {
      if (differences.length >= 8 || JSON.stringify(a) === JSON.stringify(b)) return;
      if (a && b && typeof a === 'object' && typeof b === 'object')
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
          compare(a[key], b[key], path + '.' + key);
      else differences.push({ path, expected: a, actual: b });
    };
    compare(old.physics, physics, 'physics');
    throw Error('Evidence drift: ' + JSON.stringify(differences));
  }
} else {
  mkdirSync(join(out, '..'), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      {
        physics,
        performance: {
          wallSeconds: (performance.now() - started) / 1000,
          cpu: process.cpuUsage(cpu),
          rssBytes: process.memoryUsage().rss,
        },
      },
      null,
      2,
    ) + '\n',
  );
}
console.log(
  JSON.stringify({
    sourceHash,
    trials: rows.length,
    contacts: rows.reduce((n, r) => n + r.contacts.length, 0),
    completed: rows.filter((r) => r.status === 'completed').map((r) => r.id),
    contrasts: contrasts.length,
    output: out,
  }),
);
