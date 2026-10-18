import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import console from 'node:console';
const evidence = 'docs/performance';
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const write = (name, payload) =>
  writeFileSync(`${evidence}/PR174-${name}.json`, JSON.stringify(payload, null, 2) + '\n');
const sum = (a) => a.reduce((n, x) => n + x, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);
const counts = (a) => a.reduce((out, k) => ({ ...out, [k]: (out[k] ?? 0) + 1 }), {});
const sumMaps = (a) =>
  a.reduce((out, row) => {
    for (const [k, v] of Object.entries(row ?? {})) out[k] = (out[k] ?? 0) + v;
    return out;
  }, {});
const digest = (s) => createHash('sha256').update(s).digest('hex');
const pairs = [
  ['development', 'A6', 'K'],
  ['held-out', 'A6', 'K'],
  ['targeted', 'A6', 'K'],
  ['geometry', 'A5', 'K'],
].map(([set, a, b]) => {
  const before = read(`../pr174-research/PR174-${a}-${set}.json`);
  const after = read(`../pr174-research/PR174-${b}-${set}.json`);
  if (
    before.runs.length !== after.runs.length ||
    before.runs.some((r, i) => r.initialHash !== after.runs[i].initialHash)
  )
    throw new Error(`Unpaired ${set}`);
  if (set !== 'geometry') {
    const old = read(`../pr174-research/PR174-H3-${set}.json`);
    const observed = read(`../pr174-research/PR174-I-${set}.json`);
    const oldBefore = read(
      `../pr174-research/PR174-${set === 'targeted' ? 'A4' : 'A3'}-${set}.json`,
    );
    if (
      old.runs.some(
        (r, i) =>
          r.finalHash !== observed.runs[i].finalHash || r.finalHash !== after.runs[i].finalHash,
      ) ||
      oldBefore.runs.some((r, i) => r.finalHash !== before.runs[i].finalHash)
    )
      throw new Error('Complete controlled state differs across observer/cover-only revisions');
  } else {
    const old = read('../pr174-research/PR174-J-geometry.json');
    if (old.runs.some((r, i) => r.finalHash !== after.runs[i].finalHash))
      throw new Error('Complete geometry state differs across cover-only revision');
  }
  return { set, before, after };
});
const summarise = (runs) => {
  const combinations = runs.flatMap((r) => r.combinations);
  const shotsObserved = runs.length > 0 && runs.every((r) => Array.isArray(r.actualShots));
  return {
    cases: runs.length,
    actualForwardPasserRuns: runs.filter((r) => r.runInitiated).length,
    intentions: combinations.length,
    intentionsByKind: counts(combinations.map((c) => c.kind)),
    physicallyStarted: combinations.filter((c) => c.runStartedAt !== undefined).length,
    firstPassCompleted: combinations.filter((c) => c.firstCompletedAt !== undefined).length,
    continuationReleased: combinations.filter((c) => c.continuationPassId !== undefined).length,
    resultCounts: counts(combinations.map((c) => c.result ?? 'still_active_at_end')),
    completedByKind: counts(
      combinations.filter((c) => c.result === 'completed').map((c) => c.kind),
    ),
    actualShots: shotsObserved ? sum(runs.map((r) => r.actualShots.length)) : null,
    shotsAfterCompletedCombination: shotsObserved
      ? sum(
          runs.map(
            (r) =>
              (r.actualShots ?? []).filter(
                (s) =>
                  s.shooterId.startsWith('geometry:anchor:') &&
                  r.combinations.some(
                    (c) =>
                      c.result === 'completed' &&
                      s.releasedAt >= c.endedAt &&
                      s.releasedAt - c.endedAt <= 8,
                  ),
              ).length,
          ),
        )
      : null,
    meanMaxControlledForwardMetres: mean(runs.map((r) => r.maxControlledForward)),
    ownTeamOwnerAt5s: runs.filter((r) => r.samples.find((s) => s.at === 5)?.retained).length,
    ownTeamOwnerAt8s: runs.filter((r) => r.samples.find((s) => s.at === 8)?.retained).length,
    humanStoppedAtPendingChoice: runs.filter((r) => r.humanPending).length,
    possessionLossEvents: sum(runs.map((r) => r.losses)),
    fouls: sum(runs.map((r) => r.fouls)),
    completeSchemaContinuationEqual: runs.every((r) => r.reloadEqual),
  };
};
const controlled = (scenarios) =>
  pairs.map((p) => ({
    set: p.set,
    sources: { before: p.before.manifest, after: p.after.manifest },
    before: summarise(
      p.before.runs.filter((r) => !scenarios || scenarios.includes(r.options.scenario)),
    ),
    after: summarise(
      p.after.runs.filter((r) => !scenarios || scenarios.includes(r.options.scenario)),
    ),
    cases: p.after.runs
      .filter((r) => !scenarios || scenarios.includes(r.options.scenario))
      .map((r) => ({
        options: r.options,
        initialHash: r.initialHash,
        finalHash: r.finalHash,
        combinations: r.combinations,
        actualShots: r.actualShots,
        losses: r.losses,
        maxControlledForward: r.maxControlledForward,
      })),
  }));
const method =
  'Paired complete canonical states. Only opening prescribed; autonomous 8s continuation. Human cases stop if a genuine pending choice occurs (four development, two held-out). Own-team owner excludes a ball in flight. Variants/mirrors share a design block. Geometry grid is post-validation exploration; all 27 cases retained, no policy tuning.';
write('combination-baseline', {
  version: 1,
  method,
  pairs: controlled(),
  observationOnlyExtensionEquality: true,
  intermediateStages: ['A1', 'B', 'C', 'E', 'D', 'F', 'G'].map((stage) => {
    const r = read(`../pr174-research/PR174-${stage}-development.json`);
    return { stage, manifest: r.manifest, summary: summarise(r.runs) };
  }),
  limitations:
    'Fixture revisions are not interchangeable. Compare only matching initial hashes. An available pass is not a selected or completed one. No population realism inference.',
});
for (const [name, scenarios] of [
  ['one-two', ['winger', 'central', 'pace', 'creator']],
  ['third-man', ['third_man']],
  ['flank-combinations', ['overlap', 'underlap']],
  ['pressing-escape', ['press']],
])
  write(name, { version: 1, method, pairs: controlled(scenarios) });
write('advantage-conversion', {
  version: 1,
  method,
  controlled: pairs.map((p) => ({
    set: p.set,
    before: summarise(p.before.runs),
    after: summarise(p.after.runs),
  })),
  fullCohortShotAfterCombination: null,
  limitation:
    'The bounded natural tracker counts intention, physical run, first completion, independently available option, released continuation, contact outcome and controlled progression. It does not retain an 8s post-combination shot attribution window. The final paired baselines and final engine record every actual shot within the controlled 8s run. Older intermediate stages without that observer report null rather than measured zero.',
});

const key = (r) =>
  `${typeof r.fixture === 'string' ? r.fixture : r.fixture.family}:${typeof r.fixture === 'string' ? r.reversed : r.fixture.reversed}`;
const originalKeys = new Set(read(`${evidence}/PR171-baseline.json`).fixtures.map(key));
const metrics = [
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
  'offsides',
  'tacklesAttempted',
  'tacklesWon',
  'interceptions',
];
const aggregate = (base, filter = () => true) => {
  const rows = base.teamRows.filter(filter);
  return {
    teams: rows.length,
    totals: Object.fromEntries(metrics.map((k) => [k, sum(rows.map((r) => r[k] ?? 0))])),
    roleGroups: sumMaps(
      rows.flatMap((r) =>
        Object.entries(r.roleGroups).map(([role, v]) =>
          Object.fromEntries(Object.entries(v).map(([k, n]) => [`${role}.${k}`, n])),
        ),
      ),
    ),
    counters: sumMaps(rows.map((r) => r.counters)),
    meanPassesPerControlledSequence: mean(
      rows.map((r) => r.passesPerControlledSequence).filter(Number.isFinite),
    ),
  };
};
const summaryFiles = ['replay', 'after', 'heldout-before', 'heldout-after'].map(
  (prefix) => `${evidence}/PR174-${prefix}-baseline.json`,
);
if (summaryFiles.every(existsSync)) {
  const [before, after, hBefore, hAfter] = summaryFiles.map(read);
  const compare = (a, b, n) => {
    if (
      a.fixtures.length !== n ||
      b.fixtures.length !== n ||
      a.censored.length ||
      b.censored.length
    )
      throw new Error('Incomplete final cohort');
    for (const f of b.fixtures) {
      const old = a.fixtures.find((r) => key(r) === key(f));
      if (
        !old ||
        old.initialStateHash !== f.initialStateHash ||
        old.fixture.fixtureHash !== f.fixture.fixtureHash
      )
        throw new Error('Cohort input changed');
    }
    return {
      completion: { before: n, after: n, censored: 0 },
      before: aggregate(a),
      after: aggregate(b),
      pairedDeltas: b.fixtures.map((f) => ({
        fixture: f.fixture,
        score: f.score,
        initialHash: f.initialStateHash,
        finalHash: f.finalStateHash,
        delta: Object.fromEntries(
          metrics.map((k) => [
            k,
            sum(b.teamRows.filter((r) => key(r) === key(f)).map((r) => r[k] ?? 0)) -
              sum(a.teamRows.filter((r) => key(r) === key(f)).map((r) => r[k] ?? 0)),
          ]),
        ),
      })),
    };
  };
  const natural = (dir) => {
    const rows = readdirSync(dir)
      .filter((f) => f.startsWith('cohort-'))
      .map((f) => read(resolve(dir, f)));
    return {
      counts: sumMaps(rows.map((r) => r.observed.combinations.counts)),
      maximumCandidates: Math.max(...rows.map((r) => r.observed.combinations.maximumCandidates)),
      fixtures: rows.map((r) => ({
        fixture: r.fixture,
        counts: r.observed.combinations.counts,
        maximumCandidates: r.observed.combinations.maximumCandidates,
      })),
    };
  };
  const stages = (prefix, filter = () => true) =>
    sumMaps(
      read(`${evidence}/PR174-${prefix}-attacking-funnel.json`)
        .rows.filter(filter)
        .map((r) => r.stages),
    );
  const continuation = (dir, filter = () => true) =>
    sumMaps(
      readdirSync(dir)
        .filter((p) => p.startsWith('cohort-'))
        .map((p) => read(resolve(dir, p)))
        .filter(filter)
        .map((r) => r.observed.continuation.counts),
    );
  const original = (r) => originalKeys.has(key(r));
  const historical = read(`${evidence}/PR173-after-baseline.json`);
  if (
    before.fixtures.some(
      (f) =>
        f.finalStateHash !== historical.fixtures.find((r) => key(r) === key(f))?.finalStateHash,
    )
  )
    throw new Error('Pristine PR173 replay changed');
  write('full-match-comparison', {
    version: 1,
    method:
      'Original 16 fully paired fixtures, including the same original 12 PR171 keys and four repaired extra-a fixtures. Separate held-out eight games = four dependent home/away design blocks with reserved seeds/new clubs/XIs/formations/styles. No tuning against either final cohort. Reused seeds/mirrors are not independent population replicates. Concurrent cohort wall time is completion data, not CPU cost.',
    original16: compare(before, after, 16),
    matchedOriginal12: {
      before: aggregate(before, original),
      after: aggregate(after, original),
      stagesBefore: stages('replay', original),
      stagesAfter: stages('after', original),
    },
    heldOut8: compare(hBefore, hAfter, 8),
    stages: {
      before: stages('replay'),
      after: stages('after'),
      heldOutBefore: stages('heldout-before'),
      heldOutAfter: stages('heldout-after'),
    },
    naturalCombinations: {
      original16: natural('../pr174-K-full'),
      heldOut8: natural('../pr174-K-heldout'),
    },
    continuationCounts: {
      before: continuation('../pr174-pr173-full'),
      after: continuation('../pr174-K-full'),
      matched12Before: continuation('../pr174-pr173-full', original),
      matched12After: continuation('../pr174-K-full', original),
      heldOutBefore: continuation('../pr174-baseline-heldout'),
      heldOutAfter: continuation('../pr174-K-heldout'),
    },
    pristinePR173All16FinalHashesEqual: true,
    uncertainty:
      'Small dependent samples, strong family effects, branching deterministic trajectories and 90+ minutes of compound effects. Report every paired delta. No calibrated population realism or general causal improvement claim.',
  });
}
const historical = Object.fromEntries(
  readdirSync(evidence)
    .filter((p) => /^PR17[123].*\.json$/.test(p))
    .map((p) => [p, digest(readFileSync(`${evidence}/${p}`))]),
);
const ref = pairs[0].after.manifest.retainedEvidence;
if (
  Object.keys(historical).length !== Object.keys(ref).length ||
  Object.entries(ref).some(([p, h]) => historical[p] !== h)
)
  throw new Error('Historical evidence changed');
write('evidence-integrity', {
  version: 1,
  historicalJsonHashes: historical,
  historicalEvidenceUnchanged: true,
  observationOnlyShotExtensionPreservesAll100FinalHashes: true,
  unavailableCoverCorrectionPreservesAll127ControlledFinalHashes: true,
  baselineShotObserverPreservesAll100ControlledFinalHashes: true,
});
console.log('PR174 paired controlled receipts and available full-cohort summaries generated.');
