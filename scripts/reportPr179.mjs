import {
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import process from 'node:process';
import { PR179_DESIGNS } from './pr179Fixtures.ts';
import { roleExperimentExportSchema } from '../src/core/matchSimulation/roleExperiment.ts';
import { pr172SourceHash } from './pr172Evidence.ts';

const policies = [
  'legacy-pr176',
  'state-value-v1',
  'role-value-v1',
  'role-intent-v1',
  'phase-role-hybrid-v1',
];
const quantile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b),
    index = (sorted.length - 1) * p;
  return (
    sorted[Math.floor(index)] + (sorted[Math.ceil(index)] - sorted[Math.floor(index)]) * (index % 1)
  );
};
const describe = (values) => ({
  n: values.length,
  mean: values.reduce((a, b) => a + b, 0) / values.length,
  median: quantile(values, 0.5),
  p10: quantile(values, 0.1),
  p90: quantile(values, 0.9),
  min: Math.min(...values),
  max: Math.max(...values),
});
const references = ['PR171-reference-comparison.json', 'PR175-reference-methodology.json'].map(
  (name) => {
    const input = JSON.parse(readFileSync(`docs/performance/${name}`));
    return {
      file: name,
      commit: input.commit,
      n: input.rows.length,
      matchIds: input.rows.map((r) => r.matchId),
      distributions: Object.fromEntries(
        ['passesWithoutCrosses', 'shots', 'corners', 'fouls'].map((key) => [
          key,
          input.rows.every((r) => r.teams.every((t) => Number.isFinite(t[key])))
            ? describe(input.rows.map((r) => r.teams.reduce((s, t) => s + t[key], 0)))
            : null,
        ]),
      ),
      incompleteNonCrossPasses: describe(
        input.rows.map((r) =>
          r.teams.reduce((s, t) => s + t.passesWithoutCrosses - t.completedWithoutCrosses, 0),
        ),
      ),
    };
  },
);
writeFileSync(
  'docs/performance/PR179-reference-intervals.json',
  JSON.stringify(
    {
      source:
        'StatsBomb Open Data, original frozen chronological twelve-match samples. Linear empirical quantile: index=(n-1)*p; interpolation between adjacent sorted totals.',
      references,
      interpretation:
        'Small descriptive samples, no SS/SW/WW labels or acceptance quotas. Incomplete non-cross passes are event-provider failures, not all MFL controlled-possession losses. No sum of incomparable interceptions/tackles/recoveries, no invented live-minute denominator.',
    },
    null,
    2,
  ) + '\n',
);
if (process.argv.includes('--reference')) {
  console.log(JSON.stringify(references));
  process.exit(0);
}

const dir = 'docs/performance/pr179-evidence/final';
mkdirSync(dir, { recursive: true });
const rows = [];
for (const policy of policies)
  for (const design of PR179_DESIGNS) {
    const path = `../pr179-final-${policy}/${design.id}.json.gz`;
    if (!existsSync(path)) throw new Error(`Missing full match ${path}`);
    const receipt = JSON.parse(gunzipSync(readFileSync(path)));
    if (receipt.manifest.sourceHash !== pr172SourceHash()) throw new Error(`Stale source ${path}`);
    if (receipt.error || receipt.report.metadata.status !== 'full_time')
      throw new Error(`Failed full match ${path}`);
    roleExperimentExportSchema.parse(receipt.report);
    const report = receipt.report,
      a = report.summary.official.home,
      b = report.summary.official.away;
    if (a.goals !== report.metadata.result.home || b.goals !== report.metadata.result.away)
      throw new Error('Result does not match official projection');
    if (report.diagnostics.observerErrors.length) throw new Error('Diagnostic observation failed');
    const filename = `${policy}-${design.id}.json.gz`;
    copyFileSync(path, `${dir}/${filename}`);
    const shots = report.summary.shots;
    rows.push({
      id: design.id,
      tier: design.tier,
      policy,
      inputHash: receipt.inputHash,
      sessionHash: receipt.sessionHash,
      finalHash: receipt.finalHash,
      time: report.metadata.time,
      result: report.metadata.result,
      official: report.summary.official,
      bothTeams: {
        passes: a.passesAttempted + b.passesAttempted,
        shots: a.shots + b.shots,
        corners: a.corners + b.corners,
        fouls: a.fouls + b.fouls,
        losses: a.possessionLost + b.possessionLost,
        tackles: a.tacklesWon + b.tacklesWon,
        interceptions: a.interceptions + b.interceptions,
      },
      credibleOpportunityEpisodes: report.summary.credibleOpportunityEpisodes,
      maxHoldSeconds: report.diagnostics.maxHoldSeconds,
      pathologicalHolds: report.diagnostics.pathologicalHolds,
      shotDistances: shots.map((s) => s.distance),
      shotOutcomes: shots.map((s) => s.outcome ?? 'in_flight'),
      turnoversByArea: report.summary.turnoversByArea,
      exposedRecoveries: report.summary.transitions.filter((t) => t.phase === 'rapid_transition')
        .length,
      recoveriesWithTenMetres: report.summary.transitions.filter(
        (t) => t.phase === 'rapid_transition' && t.progress >= 10,
      ).length,
      shotsWithinTenSecondsOfLoss: report.summary.turnoverConsequences.filter(
        (l) => l.shotIds.length > 0,
      ).length,
      diagnostics: report.diagnostics,
      performance: receipt.performance,
      receipt: `pr179-evidence/final/${filename}`,
    });
  }
for (const design of PR179_DESIGNS) {
  const paired = rows.filter((r) => r.id === design.id);
  if (
    new Set(paired.map((r) => r.inputHash)).size !== 1 ||
    new Set(paired.map((r) => r.sessionHash)).size !== 1
  )
    throw new Error('Unmatched fixture input');
}
const summaries = policies.map((policy) => {
  const cells = rows.filter((r) => r.policy === policy);
  return {
    policy,
    fixtures: cells.length,
    metrics: Object.fromEntries(
      Object.keys(cells[0].bothTeams).map((key) => [
        key,
        describe(cells.map((r) => r.bothTeams[key])),
      ]),
    ),
    maxHoldSeconds: Math.max(...cells.map((r) => r.maxHoldSeconds)),
    pathologicalHolds: cells.reduce((s, r) => s + r.pathologicalHolds, 0),
    exposedRecoveries: cells.reduce((s, r) => s + r.exposedRecoveries, 0),
    recoveriesWithTenMetres: cells.reduce((s, r) => s + r.recoveriesWithTenMetres, 0),
    tierSplits: ['SS', 'SW', 'WW'].map((tier) => ({
      tier,
      rows: cells
        .filter((r) => r.tier === tier)
        .map((r) => ({ id: r.id, result: r.result, official: r.official, hold: r.maxHoldSeconds })),
    })),
  };
});
writeFileSync(
  'docs/performance/PR179-policy-comparison.json',
  JSON.stringify(
    {
      version: 1,
      sourceHash: pr172SourceHash(),
      unit: 'Six fixture designs, two per tier. Thirty paired policy executions, not thirty independent designs. Exploratory development; no population confidence interval.',
      rows,
      summaries,
      promotion:
        'No default change. Excess passing and sparse shots remain structural failures; long stationary holds disqualify a candidate independently of possession retention. Do not rank policies by turnover count alone.',
    },
    null,
    2,
  ) + '\n',
);

const pilot = [];
for (const policy of policies) {
  const sourceDir = `../pr179-development-${policy}`;
  if (!existsSync(sourceDir)) continue;
  for (const file of readdirSync(sourceDir).filter(
    (p) => p.endsWith('.json.gz') && !p.includes('failure-state'),
  )) {
    const x = JSON.parse(gunzipSync(readFileSync(`${sourceDir}/${file}`)));
    const destination = `pr179-evidence/development-r0-${policy}-${file}`;
    copyFileSync(`${sourceDir}/${file}`, `docs/performance/${destination}`);
    pilot.push({
      policy,
      design: x.design,
      sourceHash: x.manifest.sourceHash,
      status: x.report.metadata.status,
      error: x.error,
      receipt: destination,
    });
  }
}
writeFileSync(
  'docs/performance/PR179-development-history.json',
  JSON.stringify(
    {
      pilot,
      corrections: [
        'Runner called the invariant checker with a whole state rather than its statistics. Matches reached full_time; the harness error is preserved. Final runs pass both statistics and state.',
        'Depth invitation initially used owner depth alone, drawing already advanced wingers backwards. It now compares a reachable forward invitation with owner depth, retaining the canonical onside constraint.',
        'Final bounded observer retains final shot diagnostics and starts interval clocks at the observed initial time.',
      ],
      source: 'pr179-evidence/development-r0-source.json.gz',
      stoppedPartialRuns:
        'Pilot workers were stopped after their harness defect was diagnosed. Their partial progress is not counted as a complete match or a football liveness failure.',
    },
    null,
    2,
  ) + '\n',
);

const files = readdirSync('docs/performance/pr179-evidence', { recursive: true })
  .map(String)
  .filter((f) => /\.(gz|json|png)$/.test(f))
  .sort();
writeFileSync(
  'docs/performance/PR179-evidence-index.json',
  JSON.stringify(
    {
      version: 1,
      sourceHash: pr172SourceHash(),
      files: files.map((f) => ({
        path: `pr179-evidence/${f.replaceAll('\\', '/')}`,
        bytes: readFileSync(`docs/performance/pr179-evidence/${f}`).length,
        sha256: createHash('sha256')
          .update(readFileSync(`docs/performance/pr179-evidence/${f}`))
          .digest('hex'),
      })),
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(summaries));
