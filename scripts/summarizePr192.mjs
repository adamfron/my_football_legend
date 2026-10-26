import { writeFileSync, readdirSync, existsSync } from 'node:fs';
import { readPr192Evidence } from './readPr192Evidence.mjs';
import process from 'node:process';
import console from 'node:console';
const root = 'docs/performance/pr192',
  policies = [
    'state-value-v1',
    'phase-role-hybrid-v1',
    'opportunity-driven-v1',
    'hierarchical-intent-v1',
    'contextual-judgment-v1',
  ];
const load = readPr192Evidence;
const selected = (design, policy) => {
  const final = `${root}/matches/${design}-${policy}-combined-final-v2.json`;
  if (existsSync(final)) return final;
  const measured = `${root}/matches/${design}-${policy}-combined-measured.json`,
    normal = `${root}/matches/${design}-${policy}-combined.json`;
  return existsSync(measured) ? measured : normal;
};
const rows = [],
  missing = [];
const compact = (r, path) => ({
  path,
  design: r.design,
  policy: r.policy,
  mode: r.mode,
  status: r.status,
  failure: r.failure,
  sourceHash: r.sourceHash,
  inputHash: r.inputHash,
  finalHash: r.finalHash,
  passes: r.passes,
  shots: r.shots,
  score: r.score,
  inPlayMinutes: r.time.ballInPlaySeconds / 60,
  passesPerInPlayMinute: r.time.passesPerInPlayMinute,
  shotsPerInPlayMinute: r.shots / (r.time.ballInPlaySeconds / 60),
  restarts: r.time.restartDurations,
  deadBallSeconds: r.time.deadBallSeconds,
  addedSeconds: r.time.addedSecondsActuallyPlayed,
  football: r.football,
  detail: r.detail ?? null,
  challengeDistribution: r.naturalFlow?.diagnostics.challenges ?? null,
  physicalContacts: r.naturalFlow?.diagnostics.contacts ?? null,
  performance: r.performance,
});
for (const design of ['ww', 'ss', 'sw'])
  for (const policy of policies) {
    const path = selected(design, policy);
    if (!path.endsWith('-final-v2.json'))
      missing.push(`${design}/${policy}: frozen final-v2 cohort`);
    if (!existsSync(path)) {
      missing.push(path);
      continue;
    }
    const r = load(path);
    if (!r.detail) missing.push(path + ': detailed measurement');
    rows.push(compact(r, path));
  }
if (missing.length && !process.argv.includes('--partial'))
  throw Error('Missing final development evidence: ' + missing.join(', '));
const fourWay = [];
for (const design of ['ww', 'ss', 'sw'])
  for (const mode of ['baseline', 'recovery', 'flow', 'combined']) {
    const path =
      mode === 'combined'
        ? selected(design, 'state-value-v1')
        : `${root}/matches/${design}-state-value-v1-${mode}${mode === 'flow' ? '-final' : ''}.json`;
    if (existsSync(path)) fourWay.push(compact(load(path), path));
  }
const neutrality = [];
for (const design of ['ww', 'ss', 'sw']) {
  const bare = `${root}/matches/${design}-state-value-v1-combined-bare.json`,
    normal = `${root}/matches/${design}-state-value-v1-combined.json`;
  if (existsSync(bare) && existsSync(normal)) {
    const a = load(bare),
      b = load(normal);
    neutrality.push({
      design,
      kind: 'full combined observer on/off',
      a: bare,
      b: normal,
      equal: a.finalHash === b.finalHash,
      inputEqual: a.inputHash === b.inputHash,
    });
  }
  for (const policy of policies) {
    const old = `${root}/matches/${design}-${policy}-combined.json`,
      next = selected(design, policy);
    if (next !== old && existsSync(old) && existsSync(next))
      neutrality.push({
        design,
        policy,
        kind: 'full extra passive measurement',
        a: old,
        b: next,
        equal: load(old).finalHash === load(next).finalHash,
        inputEqual: load(old).inputHash === load(next).inputHash,
      });
  }
}
if (neutrality.some((r) => !r.equal || !r.inputEqual))
  throw Error('Passive measurement changed a full match');
const allFiles = readdirSync(root + '/matches').filter((p) => p.endsWith('.json'));
const result = {
  schema: 'mfl-pr192-development-summary-v1',
  classification: 'paired development; independent confirmation sealed',
  complete: missing.length === 0,
  missing,
  completedSelected: rows.filter((r) => r.status === 'full_time' && !r.failure).length,
  selected: rows,
  fourWay,
  observerNeutrality: neutrality,
  totalRetainedFullMatchReceipts: allFiles.length,
  limitations: [
    'B remains default; both mechanisms are opt-in.',
    'Source stages and unsuccessful apparatus remain retained separately.',
    'Concurrent elapsed CPU/memory comparisons are descriptive, not a calibrated performance limit.',
    'No event, pass or ball-in-play quota is applied.',
  ],
};
writeFileSync(root + '/development-summary.json', JSON.stringify(result, null, 2) + '\n');
console.log(
  rows.map((r) => ({
    design: r.design,
    policy: r.policy,
    status: r.status,
    passes: r.passes.attempted,
    inPlay: r.inPlayMinutes,
    shots: r.shots,
    detailed: !!r.detail,
  })),
);
