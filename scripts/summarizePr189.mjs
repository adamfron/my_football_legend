import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import console from 'node:console';
import process from 'node:process';
const root = 'docs/performance/pr189';
const version = process.argv.find((v) => v.startsWith('--version='))?.slice(10) ?? 'v4';
const policies = [
  'opportunity-driven-v1',
  'hierarchical-intent-v1',
  'contextual-judgment-v1',
  'state-value-v1',
  'phase-role-hybrid-v1',
];
const labels = ['A', 'H', 'C', 'B', 'R3'];
const rows = [];
const sum = (s, key) => (s?.players ?? []).reduce((n, p) => n + (p[key] ?? 0), 0);
for (const design of ['ww', 'ss', 'sw'])
  for (const [i, policy] of policies.entries()) {
    const path = `${root}/${design}-${policy}-${version}.json`,
      r = JSON.parse(readFileSync(path));
    const old = JSON.parse(
      readFileSync(
        `docs/performance/PR188-match-dev-${design}-${policy}-full-observed-final-v1.json`,
      ),
    );
    const oldState = JSON.parse(gunzipSync(readFileSync(old.archive))).finalState;
    rows.push({
      design,
      policy,
      label: labels[i],
      path,
      sourceSha256: r.sourceSha256,
      inputSha256: r.inputSha256,
      status: r.status,
      failure: r.failure,
      seconds: r.seconds,
      score: r.score,
      maxStationary: { baseline: old.maxStationarySeconds, current: r.maxStationary },
      maxOwnerSeconds: r.maxOwnerSeconds,
      passes: {
        attempted: sum(r.statistics, 'passesAttempted'),
        completed: sum(r.statistics, 'passesCompleted'),
        baselineAttempted: sum(oldState.statistics, 'passesAttempted'),
        baselineCompleted: sum(oldState.statistics, 'passesCompleted'),
      },
      shots: sum(r.statistics, 'shots'),
      fouls: sum(r.statistics, 'fouls'),
      yellowCards: sum(r.statistics, 'yellowCards'),
      redCards: sum(r.statistics, 'redCards'),
      challenges: r.defence?.attempted ?? 0,
      cleanWins: r.defence?.cleanWins ?? 0,
      looseBalls: r.defence?.looseBalls ?? 0,
      cpu: r.cpu,
      rssBytes: r.rssBytes,
      runnerHashTiming:
        r.runnerHashTiming ?? 'completion_time_file_hash; see report apparatus limitation',
    });
  }
if (new Set(rows.map((r) => r.sourceSha256)).size !== 1)
  throw Error('Final table mixes physical source manifests');
const completed = rows.filter((r) => r.status === 'full_time' && !r.failure).length;
writeFileSync(
  `${root}/summary.json`,
  JSON.stringify(
    {
      schemaVersion: 1,
      classification: 'three paired development designs; no independent confirmation',
      completed,
      attempted: rows.length,
      rows,
    },
    null,
    2,
  ) + '\n',
);
const header =
  '| Design | Policy | Result | Stationary s, old → new | Same owner s | Completed/attempted passes | Shots | Fouls |\n| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |';
const table =
  header +
  '\n' +
  rows
    .map(
      (r) =>
        `| ${r.design.toUpperCase()} | ${r.label} | ${r.failure ? `CUTOFF ${r.seconds.toFixed(0)} s` : r.status} | ${r.maxStationary.baseline.toFixed(3)} → ${r.maxStationary.current.toFixed(3)} | ${r.maxOwnerSeconds.toFixed(3)} | ${r.passes.completed}/${r.passes.attempted} | ${r.shots} | ${r.fouls} |`,
    )
    .join('\n');
const report = 'docs/PR189_BALL_CONTACT_DUEL_GEOMETRY_AND_DEADLOCK_RESOLUTION.md';
const source = readFileSync(report, 'utf8');
writeFileSync(
  report,
  source.replace(
    /<!-- DEVELOPMENT_RESULTS -->[\s\S]*?<!-- END_DEVELOPMENT_RESULTS -->/,
    `<!-- DEVELOPMENT_RESULTS -->\n\n${completed}/${rows.length} frozen variants reach full time within the unchanged 7,200-second development limit. Cutoff rows are incomplete matches, not accepted full-match results. Final table source: \`${rows[0].sourceSha256}\`. A/H/C are experimental; B/R3 are historical controls.\n\n${table}\n\n<!-- END_DEVELOPMENT_RESULTS -->`,
  ),
);
console.log(JSON.stringify({ rows: rows.length, sourceSha256: rows[0].sourceSha256 }));
