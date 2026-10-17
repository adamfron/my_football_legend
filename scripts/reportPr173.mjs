/* global console */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const root = 'docs/performance';
const rawBytes = (name) =>
  existsSync(`${root}/${name}.json`)
    ? readFileSync(`${root}/${name}.json`)
    : gunzipSync(readFileSync(`${root}/pr173-experiments/${name}.json.gz`));
const read = (name) => JSON.parse(rawBytes(name).toString('utf8'));
const write = (name, value) =>
  writeFileSync(`${root}/${name}.json`, JSON.stringify(value, null, 2) + '\n');
const hash = (v) => createHash('sha256').update(v).digest('hex');
const sum = (a) => a.reduce((n, v) => n + v, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);
const sample = z
  .object({
    at: z.number(),
    teamRetained: z.boolean(),
    speed: z.number(),
    forward: z.number(),
    separation: z.number(),
  })
  .passthrough();
const run = z
  .object({
    initialHash: z.string(),
    finalHash: z.string(),
    firstReception: z.unknown(),
    firstActionAfterReception: z.unknown(),
    canonicalContacts: z.number(),
    fouls: z.number(),
    cards: z.number(),
    maxControlledForward: z.number(),
    samples: z.array(sample).length(4),
  })
  .passthrough();
const scenario = z.object({
  manifest: z.object({ sourceHash: z.string() }).passthrough(),
  rows: z.array(
    z
      .object({
        options: z.object({ scenario: z.string() }).passthrough(),
        initialHash: z.string(),
        result: run,
      })
      .passthrough(),
  ),
});
const before = scenario.parse(read('PR173-A-scenarios'));
const gateB = scenario.parse(read('PR173-B-scenarios'));
const physical = scenario.parse(read('PR173-C-scenarios'));
const after = scenario.parse(read('PR173-F-scenarios'));
if (before.rows.length !== 57 || after.rows.length !== 57)
  throw new Error('Incomplete controlled matrix');
for (let i = 0; i < 57; i++) {
  if (new Set([before, gateB, physical, after].map((s) => s.rows[i].initialHash)).size !== 1)
    throw new Error(`Controlled input changed ${i}`);
  if (before.rows[i].result.finalHash !== gateB.rows[i].result.finalHash)
    throw new Error('Gate B changed canonical outcomes');
}
const summary = (runs) => ({
  n: runs.length,
  teamPossessionAt2s: runs.filter((r) => r.samples[2].teamRetained).length,
  teamPossessionAt5s: runs.filter((r) => r.samples[3].teamRetained).length,
  meanMaximumControlledForwardMetres: mean(runs.map((r) => r.maxControlledForward)),
  canonicalGroundImpulses: sum(runs.map((r) => r.canonicalContacts)),
  actualFouls: sum(runs.map((r) => r.fouls)),
  cards: sum(runs.map((r) => r.cards)),
  receptionKinds: Object.fromEntries(
    [...new Set(runs.map((r) => r.firstReception?.outcome.kind).filter(Boolean))].map((k) => [
      k,
      runs.filter((r) => r.firstReception?.outcome.kind === k).length,
    ]),
  ),
  meanSpeedBeforeReception: mean(
    runs.filter((r) => r.firstReception).map((r) => r.firstReception.speedBefore),
  ),
  meanSpeedAfterReception: mean(
    runs.filter((r) => r.firstReception).map((r) => r.firstReception.speedAfter),
  ),
  movingToStoppedContactSamples: runs.filter(
    (r) => r.firstReception?.speedBefore > 0.7 && r.firstReception.speedAfter <= 0.7,
  ).length,
  meanNextActionDelay: mean(
    runs.filter((r) => r.firstActionAfterReception).map((r) => r.firstActionAfterReception.delay),
  ),
});
for (const id of ['1a', '1b', '2a']) {
  const rows = before.rows
    .map((r, i) => ({
      options: r.options,
      initialHash: r.initialHash,
      before: r.result,
      physicalOnly: physical.rows[i].result,
      after: after.rows[i].result,
    }))
    .filter((r) => r.options.scenario.endsWith(id));
  write(`PR173-scenario-${id}`, {
    version: 1,
    method:
      'Paired deterministic geometries; 19 dependent one-factor variants per scenario, 5 canonical seconds each. Forward metres are progression, not proof of tactical advantage. Team possession follows the established live-flight possession definition.',
    sources: {
      before: before.manifest.sourceHash,
      physicalOnly: physical.manifest.sourceHash,
      after: after.manifest.sourceHash,
    },
    summary: {
      before: summary(rows.map((r) => r.before)),
      physicalOnly: summary(rows.map((r) => r.physicalOnly)),
      after: summary(rows.map((r) => r.after)),
    },
    rows,
  });
}
write('PR173-first-touch-continuity', {
  version: 1,
  source: after.manifest.sourceHash,
  gateBCompleteStateEquality: 57,
  gateCvsFinalDifferentStates: after.rows.filter(
    (r, i) => r.result.finalHash !== physical.rows[i].result.finalHash,
  ).length,
  before: summary(before.rows.slice(0, 19).map((r) => r.result)),
  after: summary(after.rows.slice(0, 19).map((r) => r.result)),
  definition:
    'Reception speeds bracket one 25ms contact tick. A moving-to-stopped sample is not automatically an unintended stop. First-touch physical outcome and explicit human direction remain distinct from subsequent action selection.',
});
const extensionBefore = read('PR173-A-extensions'),
  extensionAfter = read('PR173-F-extensions');
for (let i = 0; i < extensionBefore.rows.length; i++)
  if (extensionBefore.rows[i].initialHash !== extensionAfter.rows[i].initialHash)
    throw new Error('Supplementary opening changed');
write('PR173-first-time-continuations', {
  version: 1,
  method:
    '16 paired supplementary 1a openings: immediate layoff, explicitly selected layoff plus run, actual overlapping runner, and close misaligned revalidation; each with/without cover and mirrored. The run uses an existing canonical movement intent; the support player is never ordered to return the ball.',
  rows: extensionBefore.rows.map((r, i) => ({
    options: r.options,
    initialHash: r.initialHash,
    selectedIntent: r.selectedIntent,
    before: r.result,
    after: extensionAfter.rows[i].result,
  })),
});

const naturalSchema = z.object({
  manifest: z.unknown(),
  rows: z.array(
    z.object({
      id: z.string(),
      initialHash: z.string(),
      ranking: z.array(z.unknown()),
      selected: run,
      carryCounterfactuals: z.array(z.object({ action: z.unknown(), result: run })),
    }),
  ),
});
const naturalBefore = naturalSchema.parse(read('PR173-A-short-continuations'));
const naturalAfter = naturalSchema.parse(read('PR173-F-short-continuations'));
const rejected = naturalSchema.parse(read('PR173-R-short-continuations'));
for (let i = 0; i < naturalBefore.rows.length; i++)
  if (new Set([naturalBefore, naturalAfter, rejected].map((s) => s.rows[i].initialHash)).size !== 1)
    throw new Error('Natural frozen state changed');
const counterRuns = (data) => data.rows.flatMap((r) => r.carryCounterfactuals.map((c) => c.result));
write('PR173-short-continuations', {
  version: 1,
  method:
    '40 genuine retained PR172 frozen decisions; selected action and three prescribed carry alternatives from each identical state. 5s canonical consequences; these are tuning/rejection states, not independent validation. Forward metres alone do not establish useful tactical exploitation.',
  selected: {
    before: summary(naturalBefore.rows.map((r) => r.selected)),
    after: summary(naturalAfter.rows.map((r) => r.selected)),
    rejectedRoute: summary(rejected.rows.map((r) => r.selected)),
  },
  carryCounterfactuals: {
    before: summary(counterRuns(naturalBefore)),
    after: summary(counterRuns(naturalAfter)),
    rejectedRoute: summary(counterRuns(rejected)),
  },
  unchangedInitialRanking: naturalBefore.rows.filter(
    (r, i) => JSON.stringify(r.ranking) === JSON.stringify(naturalAfter.rows[i].ranking),
  ).length,
  cases: naturalBefore.rows.map((r, i) => ({
    id: r.id,
    initialHash: r.initialHash,
    beforeHash: r.selected.finalHash,
    afterHash: naturalAfter.rows[i].selected.finalHash,
    rejectedHash: rejected.rows[i].selected.finalHash,
  })),
});
write('PR173-burst-readiness', {
  ...read('PR173-F-burst-readiness'),
  beforeSource: read('PR173-A-burst-readiness').manifest.sourceHash,
  unchangedEquations:
    JSON.stringify(read('PR173-F-burst-readiness').rows) ===
    JSON.stringify(read('PR173-A-burst-readiness').rows),
  definition:
    'Constant workload traces, existing finite-acceleration fitness drills and stationary/moving candidate comparisons. Press intent alone does not spend energy. No stamina or recovery coefficients were changed.',
});

const frozen = read('PR173-baseline-manifest');
const integrity = frozen.evidence.map((e) => {
  const actual = hash(readFileSync(`${root}/${e.name}`));
  const normalized = hash(readFileSync(`${root}/${e.name}`, 'utf8').replaceAll('\r\n', '\n'));
  if (actual !== e.sha256 && normalized !== e.normalizedLfSha256)
    throw new Error(`Historical evidence changed: ${e.name}`);
  return { ...e, unchanged: true, rawBytesUnchanged: actual === e.sha256 };
});
const historicArchives = (frozen.archives ?? []).map((e) => {
  const actual = hash(readFileSync(`${root}/${e.path}`));
  if (actual !== e.sha256) throw new Error(`Historical archive changed: ${e.path}`);
  return { ...e, unchanged: true };
});
write('PR173-evidence-integrity', { version: 1, evidence: integrity, archives: historicArchives });

const archive = `${root}/pr173-experiments`;
mkdirSync(archive, { recursive: true });
const names = [
  'A-scenarios',
  'B-scenarios',
  'C-scenarios',
  'F-scenarios',
  'R-scenarios',
  'A-extensions',
  'F-extensions',
  'A-short-continuations',
  'F-short-continuations',
  'R-short-continuations',
  'A-burst-readiness',
  'F-burst-readiness',
];
const archives = names.map((name) => {
  const file = `PR173-${name}.json`,
    raw = rawBytes(`PR173-${name}`);
  const compressed = gzipSync(raw, { level: 9 });
  writeFileSync(`${archive}/${file}.gz`, compressed);
  return {
    path: `pr173-experiments/${file}.gz`,
    jsonSha256: hash(raw),
    bytes: raw.length,
    gzipBytes: compressed.length,
  };
});
write('PR173-evidence-index', {
  version: 1,
  archives,
  sourceHash: after.manifest.sourceHash,
  method:
    'Complete raw controlled/natural JSON compressed losslessly. Human-readable summary receipts retain definitions and paired results. Historical PR171/PR172 files are not rewritten.',
});

if (existsSync(`${root}/PR173-after-baseline.json`)) {
  const old = read('PR172-after-baseline'),
    current = read('PR173-after-baseline'),
    original = read('PR171-baseline');
  const key = (r) =>
    `${typeof r.fixture === 'string' ? r.fixture : r.fixture.family}:${typeof r.fixture === 'string' ? r.reversed : r.fixture.reversed}`;
  const originalKeys = new Set(original.fixtures.map(key));
  const matched = current.fixtures.filter((r) => originalKeys.has(key(r)));
  if (matched.length !== 12 || current.fixtures.length !== 16 || current.censored.length)
    throw new Error('Incomplete or censored final cohort');
  for (const f of current.fixtures) {
    const b = old.fixtures.find((r) => key(r) === key(f));
    if (
      !b ||
      b.fixture.fixtureHash !== f.fixture.fixtureHash ||
      b.initialStateHash !== f.initialStateHash
    )
      throw new Error('Full fixture changed');
  }
  const aggregate = (base) => {
    const rows = base.teamRows.filter((r) => originalKeys.has(key(r)));
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
        'fouls',
        'yellowCards',
        'redCards',
        'tacklesAttempted',
        'tacklesWon',
        'interceptions',
      ].map((k) => [k, sum(rows.map((r) => r[k] ?? 0))]),
    );
    totals.centralReceptions = sum(
      rows.map((r) => r.roleGroups.central_midfielder?.passesReceived ?? 0),
    );
    totals.saves = sum(
      base.fixtures
        .filter((r) => originalKeys.has(key(r)))
        .flatMap((r) => r.statistics.players.map((p) => p.saves)),
    );
    const counters = {};
    for (const r of rows)
      for (const [k, v] of Object.entries(r.counters ?? {})) counters[k] = (counters[k] ?? 0) + v;
    return {
      totals,
      centralShare: totals.centralReceptions / totals.passesCompleted,
      passesPerControlledSequenceMean: mean(
        rows.map((r) => r.passesPerControlledSequence).filter((v) => typeof v === 'number'),
      ),
      counters,
    };
  };
  const stages = (data, field = 'stages') => {
    const totals = {};
    for (const r of data.rows.filter((r) => originalKeys.has(key(r))))
      for (const [k, v] of Object.entries(r[field])) totals[k] = (totals[k] ?? 0) + v;
    return totals;
  };
  write('PR173-full-match-comparison', {
    version: 1,
    method:
      'The same 12 originally complete PR171 fixtures, also run in PR172; 24 dependent team observations. The four previously repaired fixtures are retained separately, not selectively removed. Concurrent cohort wall times are completion data, not a controlled CPU comparison.',
    completion: { attempts: 16, full: 16, censored: 0 },
    matched: {
      before: aggregate(old),
      after: aggregate(current),
      stagesBefore: stages(read('PR172-after-attacking-funnel')),
      stagesAfter: stages(read('PR173-after-attacking-funnel')),
      eventsBefore: stages(read('PR172-after-attacking-funnel'), 'events'),
      eventsAfter: stages(read('PR173-after-attacking-funnel'), 'events'),
    },
    fixtures: current.fixtures.map((f) => ({
      fixture: f.fixture,
      status: f.status,
      time: f.time,
      score: f.score,
      initialStateHash: f.initialStateHash,
      finalStateHash: f.finalStateHash,
      wallMs: f.wallMs,
    })),
    limitation:
      'A small reused cohort cannot establish calibrated population realism or causal policy improvement. No global passing, shooting, positional, foul or stamina bonus was deployed.',
  });
}
console.log('PR173 scenario, natural, fitness and integrity receipts updated.');
