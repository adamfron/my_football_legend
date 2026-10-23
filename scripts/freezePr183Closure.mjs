import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import console from 'node:console';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { digest, pr183SourceHash, pr183HarnessHash } from './pr183ClosureValidationEvidence.mjs';
import { pr183HarnessHash as developmentHarnessHash } from './pr183ClosureEvidence.mjs';
const sourceHash = pr183SourceHash(),
  harnessHash = pr183HarnessHash();
const path = 'docs/performance/PR183-closure-freeze.json';
if (existsSync(path)) {
  const frozen = JSON.parse(readFileSync(path));
  if (frozen.harnessHash !== harnessHash)
    throw Error('Frozen closure source/harness differs; preserve consumed confirmation');
  if (frozen.sourceHash !== sourceHash) {
    execFileSync(process.execPath, ['scripts/verifyPr183TypeOnlyBridge.mjs'], { stdio: 'pipe' });
    const bridge = JSON.parse(readFileSync('docs/performance/PR183-closure-type-only-bridge.json'));
    if (
      bridge.simulatedSourceHash !== frozen.sourceHash ||
      bridge.compilableSourceHash !== sourceHash
    )
      throw Error('Invalid type-only bridge');
  }
  console.log('Closure freeze verified.');
} else {
  const validation = JSON.parse(
    readFileSync('docs/performance/PR183-closure-validation-inputs.json'),
  );
  const fixtures = JSON.parse(
    gunzipSync(readFileSync('docs/performance/pr183-evidence/closure-validation.json.gz')),
  );
  const consumed = JSON.parse(
    gunzipSync(readFileSync('docs/performance/pr183-evidence/validation.json.gz')),
  );
  for (const f of fixtures) {
    if (
      f.state.time !== 0 ||
      f.state.decisionIndex !== 0 ||
      digest(f.state) !== f.inputHash ||
      digest(f.session) !== f.sessionHash
    )
      throw Error('Invalid zero-step confirmation input');
    if (consumed.some((old) => old.inputHash === f.inputHash || old.design.seed === f.design.seed))
      throw Error('Consumed confirmation reused');
  }
  writeFileSync(
    path,
    JSON.stringify(
      {
        schema: 'mfl-pr183-closure-freeze-v1',
        frozenAtUtc: new Date().toISOString(),
        productionCommit: 'a5c11fa2b64607a3ae83a7bc95de2f29ed4b0ff9',
        sourceHash,
        harnessHash,
        developmentHarnessHash: developmentHarnessHash(),
        baselineRejectedCommit: '94550a3dd66d63f3386c1d42584893a2f8b2273c',
        defaultPolicy: 'state-value-v1',
        policies: [
          'legacy-pr176',
          'state-value-v1',
          'role-value-v1',
          'role-intent-v1',
          'phase-role-hybrid-v1',
        ],
        validation: validation.rows.map((r) => ({
          id: r.design.id,
          inputHash: r.inputHash,
          sessionHash: r.sessionHash,
        })),
        validationArchiveHash: digest(
          readFileSync('docs/performance/pr183-evidence/closure-validation.json.gz'),
        ),
        acceptance: {
          dt: 0.025,
          fullMatches: 15,
          independentDesigns: 3,
          maximumSimulatedSeconds: 7200,
          maximumCpuSeconds: 600,
          finalState: 'tacticalMatchStateSchema.parse',
          statistics: 'assertMatchStatisticsInvariants',
          observerErrors: 0,
          clocks: 'fixed-tick inPlay + stoppage = elapsed',
          mechanical:
            'All seven frozen R3 cases find a real pass in <20s before a 12m peak retreat; exact saved loose-ball failure gets a reachable aerial action without a possession grant.',
          wholeMatch:
            'Audit every R3 excursion >=15m using PEAK rather than net displacement; reject recurrence of the original unsupported 30-45m march toward own keeper. These are review criteria, never engine caps.',
          verification:
            'Unchanged complete npm run verify must pass; assertion/timeout/physics/match-duration weakening prohibited.',
          integrity:
            'All-policy observed/unobserved repeat equality, complete B state/tick equality, unchanged legacy golden telemetry; actual browser and human smoke.',
          policy:
            'B remains default; all five policies retained; no promotion from three designs; summary calibration remains NOT READY.',
        },
        harnessDifference:
          'Development and confirmation share the exact same peak/base observers. Confirmation additionally validates complete final states and the new untouched manifest. Both harness digests are explicit; development is not relabelled independent.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'New closure source, diagnostics and acceptance frozen; confirmation inputs still at zero steps.',
  );
}
