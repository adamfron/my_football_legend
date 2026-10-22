import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { PRIMARY_DECISION_POLICIES } from '../src/core/matchSimulation/decisionPolicyConfig.ts';
import { pr172SourceHash } from './pr172Evidence.ts';
const root = process.argv.find((a) => a.startsWith('--runs='))?.slice(7) ?? '../pr181-lineage';
const comparisonPath = 'docs/performance/PR181-policy-comparison.json',
  comparison = JSON.parse(readFileSync(comparisonPath)),
  sourceHash = pr172SourceHash();
const dest = 'docs/performance/pr181-evidence/lineage';
mkdirSync(dest, { recursive: true });
const files = PRIMARY_DECISION_POLICIES.flatMap((p) =>
  readdirSync(`${root}/${p}`)
    .filter((f) => f.endsWith('.json.gz'))
    .map((f) => `${root}/${p}/${f}`),
);
if (files.length !== 30) throw Error('Expected thirty complete lineage replays');
const rows = files.map((path) => {
  const bytes = readFileSync(path),
    r = JSON.parse(gunzipSync(bytes)),
    original = comparison.rows.find((o) => o.id === r.design.id && o.policy === r.policy);
  if (
    r.sourceHash !== sourceHash ||
    r.status !== 'full_time' ||
    !r.observerReplayEqual ||
    r.finalHash !== original?.finalHash ||
    r.ticks !== original.ticks ||
    r.inputHash !== original.inputHash
  )
    throw Error('Lineage/canonical provenance mismatch');
  // A physical teammate diagnostic can describe the passer collecting his own ball.
  // Match the existing official contract: that is a recovery, not a completed pass.
  const isCompletedPass = (p) =>
    p.outcome === 'completed' &&
    p.contact &&
    p.resolvedAt !== undefined &&
    p.intendedReceiverId !== p.passerId &&
    (p.actualReceiverId ?? p.intendedReceiverId) !== p.passerId;
  const completed = r.records.filter(isCompletedPass).length;
  if (Math.abs(completed - original.completion * original.passes) > 1e-6)
    throw Error('Lineage completion identities do not reconcile');
  const targeted = r.records.filter((p) => p.targetBehind),
    count = (predicate) => targeted.filter(predicate).length;
  const officialDepth = {
    completedBeyondReleaseLine: count(
      (p) => isCompletedPass(p) && p.contactBeyondReleaseLine === true,
    ),
    completedBeforeOrAtReleaseLine: count(
      (p) => isCompletedPass(p) && p.contactBeyondReleaseLine === false,
    ),
    completedWithoutContactEvidence: count(
      (p) => isCompletedPass(p) && p.contactBeyondReleaseLine === undefined,
    ),
    completedBeyondCurrentDefence: count(
      (p) => isCompletedPass(p) && p.contactBeyondCurrentDefence === true,
    ),
    failed: count((p) => p.outcome !== 'unresolved' && !isCompletedPass(p)),
    selfRecoveredTargeted: count(
      (p) =>
        p.outcome === 'completed' && (p.actualReceiverId ?? p.intendedReceiverId) === p.passerId,
    ),
  };
  if (
    officialDepth.completedBeyondReleaseLine +
      officialDepth.completedBeforeOrAtReleaseLine +
      officialDepth.completedWithoutContactEvidence +
      officialDepth.failed +
      r.summary.unresolved !==
    targeted.length
  )
    throw Error('Official depth outcomes do not reconcile');
  const name = `${r.design.id}-${r.policy}.json.gz`;
  copyFileSync(path, `${dest}/${name}`);
  return {
    id: r.design.id,
    tier: r.design.tier,
    policy: r.policy,
    sourceHash,
    inputHash: r.inputHash,
    finalHash: r.finalHash,
    ticks: r.ticks,
    harnessHash: r.harnessHash,
    observerReplayEqual: true,
    artifact: `pr181-evidence/lineage/${name}`,
    artifactSha256: createHash('sha256').update(bytes).digest('hex'),
    ...r.summary,
    ...officialDepth,
    diagnosticCompleted: r.records.filter((p) => p.outcome === 'completed').length,
    selfRecoveries: r.records.filter(
      (p) =>
        p.outcome === 'completed' && (p.actualReceiverId ?? p.intendedReceiverId) === p.passerId,
    ).length,
    completedPasses: completed,
    targetedSnapshotFallbacks: r.records.filter((p) => p.targetBehind && !p.snapshotMatched).length,
  };
});
const originalHarnessHash = 'ee1fd349b2d23b237a92b8171456122aecabad75d2607d3662990a0b69389d6e',
  currentHarnessHash = createHash('sha256')
    .update(readFileSync('scripts/benchmarkPr181Depth.mjs'))
    .digest('hex');
if (rows.some((r) => ![originalHarnessHash, currentHarnessHash].includes(r.harnessHash)))
  throw Error('Unknown lineage harness version');
const fields = [
  'targetedBehind',
  'completedBeyondReleaseLine',
  'completedBeforeOrAtReleaseLine',
  'completedWithoutContactEvidence',
  'failed',
  'unresolved',
  'completedBeyondCurrentDefence',
  'snapshotFallbacks',
  'carryEpisodes',
  'carriesPastMarkerWithControl',
  'carriesLostToOpponent',
  'selfRecoveredTargeted',
];
const summarize = (list) =>
  Object.fromEntries(fields.map((k) => [k, list.reduce((n, r) => n + r[k], 0) / list.length]));
const byPolicy = Object.fromEntries(
  PRIMARY_DECISION_POLICIES.map((p) => [p, summarize(rows.filter((r) => r.policy === p))]),
);
const byTier = Object.fromEntries(
  ['SS', 'SW', 'WW'].map((t) => [
    t,
    Object.fromEntries(
      PRIMARY_DECISION_POLICIES.map((p) => [
        p,
        summarize(rows.filter((r) => r.policy === p && r.tier === t)),
      ]),
    ),
  ]),
);
const definitions = {
  depth:
    'Target >0.5m beyond actual legal release snapshot line, with defender/ball/halfway rule. Contact beyond release line is separate from a completed pass received earlier. Also report contact beyond the second-last defender at resolution, excluding ball from that latter line.',
  fallbacks:
    'Count passes whose matching release snapshot was unavailable; preceding 0.025s frame used. Tolerance0.5m, no estimate relabelled exact.',
  carry:
    'One continuous wide carry/possession episode starting with active physical carry intention and nearest eligible opponent within8m, initially no more than1m behind. Intent refreshes do not create a new episode. End on deliberate pass/cross/shot, opponent/teammate acquisition, departure/stoppage, or loose ball without ownership for1.5s. Passing marker requires >1m goalward lead and >1m actor movement with actual control; later loss remains possible. This is not a provider-defined successful-dribble statistic.',
  replay:
    'Thirty complete state/tick/official identity equalities against the original observed cohort. Replays add no independent fixtures or new validation sample.',
  completions:
    'Raw replay summaries retain the physical diagnostic outcome. Final comparison completion requires actual contact and resolution, a distinct intended receiver and a receiver other than the passer, exactly as playerMatchStats.ts. A passer collecting his own delivery is a self-recovery, not a completed pass; targeted self-recoveries are included in failed pass totals and reported separately. All thirty complete official completion counts reconcile.',
};
writeFileSync(
  'docs/performance/PR181-depth-lineage.json',
  JSON.stringify(
    {
      schema: 'mfl-pr181-depth-lineage-comparison-v1',
      sourceHash,
      replays: 30,
      allCanonicalStatesEqual: true,
      harnessProvenance: {
        originalHarnessHash,
        currentHarnessHash,
        originalArtifact: 'pr181-evidence/lineage-original-harness.mjs.gz',
        change:
          'The first 14 successful rows use the original harness. Its pitch-bounded pass-target validator rejected legal out-of-play physical targets in subsequent matches. The resumed version uses the existing finite physicalPointSchema and validates/skips saved results. Simulation, measurements, thresholds and outcome definitions are unchanged; each saved result retains its actual harness hash.',
      },
      definitions,
      byPolicy,
      byTier,
      rows,
    },
    null,
    2,
  ) + '\n',
);
for (const r of comparison.rows)
  r.physicalOutcomes = rows.find((o) => o.id === r.id && o.policy === r.policy);
for (const p of PRIMARY_DECISION_POLICIES) comparison.byPolicy[p].physicalOutcomes = byPolicy[p];
for (const t of ['SS', 'SW', 'WW'])
  for (const p of PRIMARY_DECISION_POLICIES)
    comparison.byTier[t][p].physicalOutcomes = byTier[t][p];
writeFileSync(comparisonPath, JSON.stringify(comparison, null, 2) + '\n');
const table = [
  '| Actual outcomes, mean per complete match | Legacy | B | R1 | R2 | R3 |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...[
    ['Target beyond release line', 'targetedBehind'],
    ['Completed beyond release line', 'completedBeyondReleaseLine'],
    ['Completed before/at release line', 'completedBeforeOrAtReleaseLine'],
    ['Failed targeted depth pass', 'failed'],
    ['Unresolved targeted depth pass', 'unresolved'],
    ['Completed beyond defence at contact', 'completedBeyondCurrentDefence'],
    ['Continuous wide carry episodes', 'carryEpisodes'],
    ['First marker passed with control', 'carriesPastMarkerWithControl'],
    ['Carry episodes lost to opponent', 'carriesLostToOpponent'],
  ].map(
    ([label, key]) =>
      `| ${label} | ${PRIMARY_DECISION_POLICIES.map((p) => byPolicy[p][key].toFixed(2)).join(' | ')} |`,
  ),
].join('\n');
const doc = 'docs/PR181_ATTACKING_DEPTH_WING_DUELS_AERIAL_FOOTBALL.md';
let text = readFileSync(doc, 'utf8');
const section = `<!-- PR181_LINEAGE_START -->\n**30/30 complete canonical replay states and tick counts equal the original cohort.**\nActual contact and continuous carries are measured separately from target/intent counters.\n\n${table}\n\n[Lineage definitions and all paired rows](performance/PR181-depth-lineage.json) retain contact points, release snapshot matching and episode endings.\n<!-- PR181_LINEAGE_END -->`;
text = text.includes('<!-- PR181_LINEAGE_START -->')
  ? text.replace(/<!-- PR181_LINEAGE_START -->[\s\S]*?<!-- PR181_LINEAGE_END -->/, section)
  : text.replace('<!-- PR181_RESULTS_END -->', `<!-- PR181_RESULTS_END -->\n\n${section}`);
writeFileSync(doc, text);
console.log(JSON.stringify({ equal: 30, byPolicy }));
