import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import process from 'node:process';
import { roleExperimentExportSchema } from '../src/core/matchSimulation/roleExperiment.ts';
import { pr172SourceHash } from './pr172Evidence.ts';
const files = process.argv.slice(2);
const load = (file) =>
  roleExperimentExportSchema.parse(
    JSON.parse(file.endsWith('.gz') ? gunzipSync(readFileSync(file)) : readFileSync(file)),
  );
const reports = [
  load(files[0] ?? 'docs/performance/pr179-evidence/browser-r2-full.json.gz'),
  load(files[1] ?? 'docs/performance/pr179-evidence/browser-r3-full.json.gz'),
];
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const inputHashes = reports.map((r) => sha(r.metadata.fixtureInputs));
const followupFile = files[2] ?? 'docs/performance/pr179-evidence/browser-r3-followup.json.gz';
const followup = existsSync(followupFile) ? load(followupFile) : undefined;
if (followup) {
  if (
    followup.metadata.status !== 'full_time' ||
    sha(followup.metadata.fixtureInputs) !== inputHashes[1] ||
    sha(followup.summary.canonicalStatistics) !== sha(reports[1].summary.canonicalStatistics) ||
    sha(followup.summary.official) !== sha(reports[1].summary.official)
  )
    throw new Error('Renderer follow-up changed football or frozen inputs');
  writeFileSync(
    'docs/performance/pr179-evidence/browser-r3-followup.json.gz',
    gzipSync(JSON.stringify(followup)),
  );
}
if (new Set(inputHashes).size !== 1) throw new Error('Browser replay changed frozen inputs');
if (reports.some((r) => r.metadata.status !== 'full_time'))
  throw new Error('Browser match incomplete');
if (
  reports.some(
    (r) =>
      r.summary.official.home.goals !== r.metadata.result.home ||
      r.summary.official.away.goals !== r.metadata.result.away,
  )
)
  throw new Error('Displayed result/export mismatch');
const roleChange = reports[0].metadata.roles.changes.find(
  (c) => c.reason === 'explicit' && c.from === 'target_forward' && c.to === 'advanced_forward',
);
if (!roleChange || !reports[0].summary.teamAdjustments.length)
  throw new Error('Missing actual halftime changes');
for (const [i, r] of reports.entries())
  writeFileSync(
    `docs/performance/pr179-evidence/browser-${i === 0 ? 'r2' : 'r3'}-full.json.gz`,
    gzipSync(JSON.stringify(r)),
  );
const receipt = {
  version: 1,
  url: 'http://127.0.0.1:5180/my_football_legend/?devtools=1&matchSandbox=1',
  sourceHash: pr172SourceHash(),
  sourceLabelScope:
    'Dev-server Git/source label identifies its launch snapshot. The normalized research engine sourceHash identifies the measured final engine. Frozen manual experiments should restart the dev server after source changes.',
  verified: [
    'visible five-policy selector',
    'explicit seed and teams',
    'visible policy and unchanged fixture identity',
    'initial role assignments',
    'R2 full time',
    'halftime target forward -> advanced forward',
    'halftime high press -> compact low block/counters',
    'R3 replay from complete original session',
    'R3 full time',
    'actual JSON downloads',
    'byte-equivalent frozen fixture inputs',
    'exported official result matches displayed score',
  ],
  scope:
    'Two exploratory visual runs. R2 includes declared halftime interventions; R3 starts from the same initial inputs but has no matching halftime intervention, so final results are not a causal policy-only estimate.',
  matches: reports.map((r, i) => ({
    policy: r.metadata.policy,
    fixtureId: r.metadata.fixtureId,
    inputHash: inputHashes[i],
    sourceLabel: r.metadata.sourceRevision,
    status: r.metadata.status,
    time: r.metadata.time,
    result: r.metadata.result,
    official: r.summary.official,
    roleChanges: r.metadata.roles.changes,
    teamChanges: r.summary.teamAdjustments,
    traceEntries: r.trace.length,
    omittedTraceEvents: r.diagnostics.omittedTraceEvents,
    observerErrors: r.diagnostics.observerErrors,
    receipt: `pr179-evidence/browser-${i === 0 ? 'r2' : 'r3'}-full.json.gz`,
  })),
  originalWarning:
    'The original R3 run emitted Maximum update depth exceeded: successful renderer frames notified React of an unchanged ready lifecycle. An idempotence guard and regression test address that cycle.',
  followup: followup
    ? {
        policy: followup.metadata.policy,
        status: followup.metadata.status,
        time: followup.metadata.time,
        sourceLabel: followup.metadata.sourceRevision,
        fullCanonicalStatisticsEquality: true,
        frozenInputsEquality: true,
        result: followup.metadata.result,
        consoleWarningsAndErrors: JSON.parse(
          readFileSync('docs/performance/pr179-evidence/browser-followup-console.json'),
        ),
        receipt: 'pr179-evidence/browser-r3-followup.json.gz',
      }
    : null,
  unresolved: followup ? [] : ['Post-fix full-match browser follow-up has not been packaged yet.'],
};
writeFileSync('docs/performance/PR179-browser.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(
  JSON.stringify({
    matchedInputs: true,
    roleChange,
    matches: receipt.matches.map((r) => ({ policy: r.policy, status: r.status, result: r.result })),
    unresolved: receipt.unresolved,
  }),
);
