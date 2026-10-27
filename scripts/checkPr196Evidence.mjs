import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { BASE, files, hash, read } from './pr196Evidence.mjs';
const requireTrue = (value, message) => {
  if (!value) throw Error(message);
};
const root = 'docs/performance/pr196';
export const finalMatchPaths = () =>
  [
    ['ww', 'state-value-v1', 'baseline', 'v2'],
    ['ww', 'state-value-v1', 'corrected', 'final-v1'],
    ['ww', 'opportunity-driven-v1', 'baseline', 'v2'],
    ['ww', 'opportunity-driven-v1', 'corrected', 'final-v1'],
    ...[
      ['ww', 'hierarchical-intent-v1'],
      ['ss', 'state-value-v1'],
      ['ss', 'opportunity-driven-v1'],
      ['sw', 'state-value-v1'],
      ['sw', 'hierarchical-intent-v1'],
    ].flatMap(([d, p]) =>
      ['baseline', 'corrected'].map((m) => [d, p, m, m === 'corrected' ? 'final-v1' : 'v1']),
    ),
  ].map(([d, p, m, v]) => `${root}/matches/${d}-${p}-${m}-${v}.json.gz`);
if (
  import.meta.url.endsWith('/checkPr196Evidence.mjs') &&
  process.argv[1]?.replaceAll('\\', '/').endsWith('/checkPr196Evidence.mjs')
) {
  const changed = execFileSync(
    'git',
    ['diff', '--name-only', BASE, '--', 'docs/performance/pr195'],
    { encoding: 'utf8', windowsHide: true },
  ).trim();
  requireTrue(!changed, 'PR195 evidence changed: ' + changed);
  const baseline = read(`${root}/frozen-pr195.json`),
    registry = readFileSync('docs/match-engine/ASSUMPTIONS_REGISTER.md', 'utf8');
  requireTrue(baseline.base === BASE && baseline.registryStatuses.length === 133, 'Wrong baseline');
  const ids = [...registry.matchAll(/^### ([A-Z]+-\d+) /gm)].map((m) => m[1]);
  requireTrue(
    ids.length === new Set(ids).size && baseline.registryStatuses.every((x) => ids.includes(x.id)),
    'Registry lost or duplicated IDs',
  );
  requireTrue(ids.includes('MEAS-012'), 'Missing discovered measurement assumption');
  for (const id of [
    'MEAS-011',
    'PASS-001',
    'PASS-006',
    'PASS-007',
    'DEF-001',
    'DEF-002',
    'DEF-003',
    'DEF-004',
    'DEF-005',
    'FIT-002',
    'DEC-003',
    'DEC-004',
  ]) {
    const block = registry.split(`### ${id} `)[1]?.split('\n### ')[0];
    requireTrue(
      block?.includes('PR196 development update') && !block.includes('[x] COMPLETE'),
      'Missing open scoped update ' + id,
    );
  }
  let archiveCount = 0;
  for (const path of files(`${root}/source`).filter((p) => p.endsWith('.json.gz'))) {
    const a = read(path);
    requireTrue(a.base === BASE, 'Wrong source base');
    for (const [p, h] of Object.entries(a.manifest)) {
      requireTrue(
        !p.startsWith('/') && !p.includes('..') && !p.includes(':'),
        'Unsafe source path',
      );
      const content =
        p === 'package-lock.json'
          ? readFileSync(p, 'utf8').replaceAll('\r\n', '\n')
          : a.contents[p];
      requireTrue(hash(content) === h, 'Unrecoverable source ' + p + ' in ' + path);
    }
    requireTrue(path.endsWith(hash(a.manifest) + '.json.gz'), 'Source identity drift');
    archiveCount++;
  }
  const movement = read(`${root}/movement-v5.json.gz`),
    passes = read(`${root}/passes-v5.json.gz`),
    long = read(`${root}/long-pass-v4.json.gz`);
  requireTrue(
    movement.rows.length === 360 && passes.rows.length === 336 && long.original.length === 28,
    'Incomplete laboratories',
  );
  requireTrue(
    movement.summary.held_out_development.corrected.mae <
      movement.summary.held_out_development.old.mae,
    'No held-out ETA improvement',
  );
  requireTrue(
    passes.summary.bad_pass.defensiveControl > 0 && passes.summary.safe_pass.controlled > 0,
    'Missing positive/negative controls',
  );
  requireTrue(
    long.frozen.length === 6 && new Set(long.frozen.map((x) => x.ballHash)).size === 1,
    'Frozen delivery drift',
  );
  const harvest = files(`${root}/harvest`)
    .filter((p) => /-baseline-v1\.json\.gz$/.test(p) && !p.includes('-capture-'))
    .map(read);
  requireTrue(
    harvest.length === 15 && harvest.every((r) => !r.failure && r.seconds >= 600),
    'Incomplete five-policy/three-design harvest',
  );
  const counter = read(`${root}/counterfactuals-v2.json.gz`);
  requireTrue(
    counter.rows.length >= 30 &&
      counter.rows.some((r) => r.trials.some((t) => t.action.type === 'pass')),
    'Counterfactual attacking alternatives absent',
  );
  for (const r of counter.rows)
    for (const t of r.trials) {
      requireTrue(t.originalOutcome.contract.actorId === t.action.actorId, 'Wrong original actor');
      requireTrue(t.observerReplayNeutral !== false, 'Counterfactual observer drift');
      if (!t.originalOutcome.released)
        requireTrue(t.originalOutcome.directReceiverTouch === null, 'Rejected action credited');
    }
  const matches = finalMatchPaths().map((path) => ({ path, ...read(path) }));
  for (const r of matches) {
    requireTrue(
      r.status === 'full_time' && !r.failure && r.ticks > 200000,
      'Incomplete full match ' + r.path,
    );
    requireTrue(r.flags.canonicalArrival === r.corrected, 'Model flag drift');
    for (const c of r.captures) {
      const state = read(c.path).state;
      // inputHash describes the live pre-schema object. Snapshot parsing orders keys
      // according to Zod; byte hashes of those two serializations are not comparable.
      // checkPr196Snapshots separately replays live hashes and checks parsed snapshots.
      requireTrue(
        state.time === c.at && state.ball.ownerId === c.actorId,
        'Snapshot metadata drift',
      );
    }
  }
  for (const r of matches.filter((r) => !r.corrected)) {
    const next = matches.find((x) => x.corrected && x.design === r.design && x.policy === r.policy);
    requireTrue(
      next.originalInputHash === r.originalInputHash && next.seed === r.seed,
      'Unpaired match inputs',
    );
  }
  console.log(
    'PR196 evidence PASS',
    ids.length,
    'stable registry IDs',
    archiveCount,
    'recoverable source archives',
    matches.length,
    'complete paired matches',
  );
}
