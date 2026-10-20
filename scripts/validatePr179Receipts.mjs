import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import { roleExperimentExportSchema } from '../src/core/matchSimulation/roleExperiment.ts';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { pr172SourceHash, pr172Hash as sha } from './pr172Evidence.ts';
const comparison = JSON.parse(readFileSync('docs/performance/PR179-policy-comparison.json'));
const indexed = JSON.parse(readFileSync('docs/performance/PR179-evidence-index.json'));
const inputs = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr179-evidence/initial-states.json.gz')),
);
if (comparison.sourceHash !== pr172SourceHash() || comparison.rows.length !== 30)
  throw new Error('Wrong source/cohort size');
for (const input of inputs) {
  tacticalMatchStateSchema.parse(input.state);
  if (sha(input.state) !== input.inputHash || sha(input.session) !== input.sessionHash)
    throw new Error('Frozen input differs');
}
if (inputs.filter((f) => f.design.split === 'validation').length !== 12)
  throw new Error('Missing unopened designs');
for (const row of comparison.rows) {
  if (!row.id.startsWith('pr179-dev-')) throw new Error('Reserved design was opened');
  const raw = JSON.parse(gunzipSync(readFileSync(`docs/performance/${row.receipt}`)));
  const report = roleExperimentExportSchema.parse(raw.report);
  const frozen = inputs.find((f) => f.design.id === row.id);
  if (
    raw.manifest.sourceHash !== pr172SourceHash() ||
    raw.manifest.policy !== row.policy ||
    !frozen ||
    raw.inputHash !== frozen.inputHash ||
    raw.sessionHash !== frozen.sessionHash
  )
    throw new Error(`Unmatched policy/source/input ${row.id}/${row.policy}`);
  if (raw.error || report.metadata.status !== 'full_time')
    throw new Error('Not a completed valid match');
  assertMatchStatisticsInvariants(report.summary.canonicalStatistics);
  const ids = report.summary.shots.map((s) => s.shotId);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate physical shot diagnostics');
  if (ids.length !== report.summary.official.home.shots + report.summary.official.away.shots)
    throw new Error(`Shot diagnostic/statistic mismatch ${row.id}/${row.policy}`);
  if (report.diagnostics.observerErrors.length) throw new Error('Observer failed');
}
for (const file of indexed.files) {
  const bytes = readFileSync(`docs/performance/${file.path}`);
  if (
    bytes.length !== file.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== file.sha256
  )
    throw new Error(`Bad evidence bytes ${file.path}`);
}
const controlled = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr179-evidence/controlled.json.gz')),
);
if (
  controlled.manifest.sourceHash !== pr172SourceHash() ||
  controlled.rows.length !== 250 ||
  controlled.rows.some(
    (r) => !r.observerEquality || r.continuation.length !== 3 || r.candidates.length > 48,
  )
)
  throw new Error('Controlled coverage/equality mismatch');
const performance = JSON.parse(readFileSync('docs/performance/PR179-performance.json'));
if (performance.sourceHash !== pr172SourceHash() || performance.trials.length !== 5)
  throw new Error('Performance source/policy coverage mismatch');
for (const trial of performance.trials) {
  const cohort = comparison.rows.find(
    (r) => r.id === performance.fixtureId && r.policy === trial.policy,
  );
  const raw = JSON.parse(gunzipSync(readFileSync(`docs/performance/${cohort.receipt}`)));
  if (trial.finalHash !== raw.finalHash || performance.inputHash !== raw.inputHash)
    throw new Error(`Serial/cohort state mismatch ${trial.policy}`);
}
if (
  !performance.plainR3.fullStateEquality ||
  performance.plainR3.status !== 'full_time' ||
  performance.plainR3.finalHash !==
    performance.trials.find((t) => t.policy === 'phase-role-hybrid-v1').finalHash
)
  throw new Error('Full-match observer equality mismatch');
const browser = JSON.parse(readFileSync('docs/performance/PR179-browser.json'));
if (
  browser.sourceHash !== pr172SourceHash() ||
  browser.unresolved.length ||
  !browser.followup.fullCanonicalStatisticsEquality ||
  browser.followup.consoleWarningsAndErrors.length
)
  throw new Error('Browser follow-up incomplete');
console.log(
  JSON.stringify({
    sourceHash: pr172SourceHash(),
    completeMatches: 30,
    pairedDesigns: 6,
    unopenedDesigns: 12,
    controlledCells: 250,
    observerEqualities: 250,
    serialCohortEqualities: 5,
    fullMatchObserverEquality: true,
    browserFollowup: true,
    indexedArtifacts: indexed.files.length,
    valid: true,
  }),
);
