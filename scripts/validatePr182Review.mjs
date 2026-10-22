import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { digest, pr182SourceHash, pr182CandidateHash } from './pr182Evidence.mjs';
import { deriveCanonicalCoachProfile } from '../src/core/coachProfiles.ts';
import { initialiseCoachIntelligence } from '../src/core/matchSimulation/coachIntelligence.ts';
import { assignTacticalRoles } from '../src/core/matchSimulation/tacticalRoles.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import {
  configureMatchPolicy,
  RoleExperimentRecorder,
} from '../src/core/matchSimulation/roleExperiment.ts';
import { withRankingObserver } from '../src/core/matchSimulation/decisionObservation.ts';
import {
  stepTacticalMatchAfterDecisionProbe,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats.ts';
const planPath = 'docs/performance/PR182-review-freeze.json';
const archive = 'docs/performance/pr179-evidence/initial-states.json.gz';
const archiveHash = '4ea98d6faf9b1bcef5a544280660ce223929039c2358ebab4591f55dd400fdb1';
const ids = ['pr180-reserved-ss-1', 'pr180-reserved-sw-1', 'pr180-reserved-ww-1'];
const harnessHash = digest(readFileSync(new URL(import.meta.url), 'utf8').replaceAll('\r\n', '\n'));
if (process.argv.includes('--freeze')) {
  const manifest = JSON.parse(readFileSync('docs/performance/PR179-fixture-manifest.json'));
  const rows = Object.values(manifest).find(
    (v) => Array.isArray(v) && v.some((r) => ids.includes(r.design?.id)),
  );
  if (!rows) throw Error('Missing public reserved manifest');
  writeFileSync(
    planPath,
    JSON.stringify(
      {
        frozenAt: new Date().toISOString(),
        sourceHash: pr182SourceHash(),
        candidateHash: pr182CandidateHash(),
        harnessHash,
        archive,
        archiveHash,
        ids,
        originalInputs: rows.filter((r) => ids.includes(r.design.id)),
        policies: ['legacy-pr176', 'state-value-v1'],
        units: 3,
        matches: 6,
        purpose:
          'Post-review confirmation of the corrected release on three previously unused paired designs. No new policy search or replacement of the original twelve-design selection.',
        transformation:
          'Preserve archived session and physical state. Attach the own canonical coach, empty coaching memory and common collective roles, exactly as the primary preparation did. Policy is the sole per-run override.',
        gates: [
          'Every run completes full_time before 7200 simulated seconds / 300000 fixed ticks.',
          'Canonical statistics and final state schemas pass; primary observer reports no errors.',
          'B has no strict stationary hold over 120 seconds. Record all shorter pathological episodes as well.',
        ],
        analysis:
          'Report all three paired shots/box entries, score, substitutions, red cards and holds descriptively. No significance claim or renewed ranking from n=3; do not tune after reading.',
        budget:
          'At most three concurrent full-match workers, 15 wall minutes per match; original verify runs separately.',
        reservation:
          'Archive has not been decoded for this review at freeze. Only these three reserved inputs will be simulated; remaining nine are unused, although decoding the shared archive exposes their initial states.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(planPath);
  process.exit(0);
}
const plan = JSON.parse(readFileSync(planPath));
if (plan.sourceHash !== pr182SourceHash() || plan.harnessHash !== harnessHash)
  throw Error('Review freeze mismatch');
const [id, policy] = process.argv.slice(2);
if (!plan.ids.includes(id) || !plan.policies.includes(policy)) throw Error('Undeclared review run');
const bytes = readFileSync(archive);
if (digest(bytes) !== archiveHash) throw Error('Original archive changed');
const original = JSON.parse(gunzipSync(bytes)).find((f) => f.design.id === id);
if (
  digest(original.state) !== original.inputHash ||
  digest(original.session) !== original.sessionHash
)
  throw Error('Original input hash mismatch');
let input = structuredClone(original.state);
for (const side of ['home', 'away']) {
  input.teams[side].coach = deriveCanonicalCoachProfile(
    original.session[side].club.managerId ?? 'manager',
  );
  delete input.teams[side].coaching;
}
input = initialiseCoachIntelligence(input);
input.rolePlan = assignTacticalRoles(input);
tacticalMatchStateSchema.parse(input);
let state = configureMatchPolicy(input, policy),
  ticks = 0;
const recorder = new RoleExperimentRecorder(state);
const started = Date.now();
while (!['full_time', 'abandoned'].includes(state.status) && state.time < 7200 && ticks < 300000) {
  if (Date.now() - started > 900000) throw Error('Review wall budget exhausted');
  if (state.status === 'half_time') state = startSecondHalf(state);
  const previous = state;
  state = withRankingObserver(recorder.ranking, () =>
    stepTacticalMatchAfterDecisionProbe(state, 0.025),
  );
  recorder.observe(previous, state);
  ticks++;
}
assertMatchStatisticsInvariants(state.statistics, state);
tacticalMatchStateSchema.parse(state);
const report = recorder.export(original.session, state, plan.sourceHash, process.version);
const passed =
  state.status === 'full_time' &&
  report.diagnostics.observerErrors.length === 0 &&
  (policy !== 'state-value-v1' ||
    !report.diagnostics.holds.some((h) => h.pathological && h.endedAt - h.startedAt > 120));
const receipt = {
  id,
  policy,
  sourceHash: plan.sourceHash,
  harnessHash,
  originalInputHash: original.inputHash,
  inputHash: digest(input),
  finalHash: digest(state),
  ticks,
  passed,
  wallSeconds: (Date.now() - started) / 1000,
  report,
  finalState: state,
};
mkdirSync('docs/performance/pr182-evidence/review', { recursive: true });
writeFileSync(
  `docs/performance/pr182-evidence/review/${id}-${policy}.json.gz`,
  gzipSync(JSON.stringify(receipt)),
);
console.log(
  JSON.stringify({
    id,
    policy,
    passed,
    ticks,
    status: state.status,
    time: state.time,
    score: state.score,
  }),
);
if (!passed) process.exitCode = 1;
