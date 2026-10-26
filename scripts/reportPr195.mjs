import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { scoreCalibration } from '../src/core/matchSimulation/calibrationMetrics.ts';
import { digest } from './pr195SourceInventory.mjs';

const root = 'docs/performance/pr195',
  evidence = JSON.parse(gunzipSync(readFileSync(`${root}/pilot-v1.json.gz`)));
const pairs = (rows, predicted, outcome) =>
  rows.flatMap((r) =>
    typeof r.summary[outcome] === 'boolean' && r.summary[predicted] !== null
      ? [{ probability: r.summary[predicted], outcome: r.summary[outcome] }]
      : [],
  );
const discrimination = (xs) => {
  const yes = xs.filter((x) => x.outcome),
    no = xs.filter((x) => !x.outcome);
  return yes.length && no.length
    ? yes.reduce(
        (sum, y) =>
          sum +
          no.reduce(
            (n, x) =>
              n + (y.probability > x.probability ? 1 : y.probability === x.probability ? 0.5 : 0),
            0,
          ),
        0,
      ) /
        (yes.length * no.length)
    : null;
};
const scores = (rows) =>
  Object.fromEntries(
    [
      ['completion', 'predictedCompletion'],
      ['retained', 'predictedRetained'],
      ['goal', 'predictedGoal'],
    ].map(([event, p]) => {
      const xs = pairs(rows, p, event);
      return [
        event,
        {
          ...scoreCalibration(xs),
          auc: discrimination(xs),
          censoredOrNotApplicable: rows.filter(
            (r) => r.summary[p] !== null && r.summary[event] === null,
          ).length,
        },
      ];
    }),
  );
const outcomes = (rows) => ({
  trials: rows.length,
  released: rows.filter((r) => r.summary.released).length,
  candidate: rows.filter((r) => r.summary.candidateExists).length,
  receiverTouches: rows.filter((r) => r.summary.receiverTouchAt !== null).length,
  receiverControls: rows.filter((r) => r.summary.receiverControlAt !== null).length,
  defenderTouches: rows.filter((r) => r.summary.defenderTouchAt !== null).length,
  defenderControls: rows.filter((r) => r.summary.defenderControlAt !== null).length,
  defenderProximity: rows.filter((r) => r.summary.defenderProximityAt !== null).length,
  defenderReachable: rows.filter((r) => r.summary.defenderReachableAt !== null).length,
  defenderDisruptions: rows.filter((r) => r.summary.defenderDisruptionAt !== null).length,
  looseAtHorizon: rows.filter((r) => r.summary.looseAtHorizon).length,
  exitsBeforeFirstControl: rows.filter((r) => r.summary.exitAt !== null).length,
  shotOutcomes: Object.fromEntries(
    [...new Set(rows.map((r) => r.summary.shotOutcome).filter(Boolean))].map((k) => [
      k,
      rows.filter((r) => r.summary.shotOutcome === k).length,
    ]),
  ),
  scores: scores(rows),
});
const register = readFileSync('docs/match-engine/ASSUMPTIONS_REGISTER.md', 'utf8');
const ids = [...register.matchAll(/^### ([A-Z]+-\d{3}) — /gm)].map((m) => m[1]);
if (ids.length < 133 || new Set(ids).size !== ids.length)
  throw Error('Missing/duplicate registry IDs');
for (const [prefix, count] of Object.entries({
  DEC: 13,
  PASS: 12,
  SHOT: 12,
  DEF: 12,
  DRIB: 10,
  GK: 10,
  TACT: 12,
  FIT: 10,
  REST: 14,
  CONTACT: 15,
  MEAS: 11,
  PHYS: 2,
}))
  for (let i = 1; i <= count; i++)
    if (!ids.includes(`${prefix}-${String(i).padStart(3, '0')}`))
      throw Error('Missing required ID');
for (const entry of register.split(/^### /m).slice(1)) {
  for (const field of [
    'Classification / priority / severity',
    'Implementation',
    'Current values / structural rule',
    'Origin / provenance',
    'Existing evidence',
    'Validation layers',
    'Missing evidence',
    'Hypothesised consequences / expected impact',
    'Dependencies / affected policies',
    'Proposed validation laboratory',
    'Calibration / replacement strategy',
    'Acceptance conditions',
    'Status rationale / blockers',
    'Closure PR / commit / evidence',
  ])
    if (!entry.includes(`**${field}:**`)) throw Error('Missing field ' + field);
  const status = entry.match(/^- \[([ x])\] ([A-Z_]+)$/m);
  if (!status) throw Error('Missing status');
  if (
    ![
      'NOT_AUDITED',
      'AUDITED_UNVALIDATED',
      'LAB_REQUIRED',
      'LAB_ACTIVE',
      'CALIBRATION_REQUIRED',
      'REFACTOR_REQUIRED',
      'BLOCKED',
      'DEVELOPMENT_VALIDATED',
      'INDEPENDENT_VALIDATION_REQUIRED',
      'COMPLETE',
    ].includes(status[2])
  )
    throw Error('Unknown registry status');
  if ((status[1] === 'x') !== (status[2] === 'COMPLETE'))
    throw Error('Invalid completion checkbox');
  if (status[2] === 'COMPLETE' && /none; \*\*OPEN/.test(entry)) throw Error('No closure evidence');
}
for (const m of register.matchAll(/\]\(\.\.\/\.\.\/(src\/[^)#]+)#L(\d+)\)/g)) {
  if (!existsSync(m[1]) || Number(m[2]) > readFileSync(m[1], 'utf8').split('\n').length)
    throw Error('Broken source reference ' + m[0]);
}
const x = evidence.rows;
if (x.length !== 504 || evidence.captures.length !== 2 || evidence.defenderArrivals.length !== 30)
  throw Error('Incomplete pilot matrix');
for (const r of x) {
  if (
    !r.summary.released &&
    (r.summary.goal !== null || r.summary.completion !== null || r.summary.retained !== null)
  )
    throw Error('Rejected action acquired success');
  if (r.summary.goal !== null && !r.summary.shotId)
    throw Error('Goal without requested shot identity');
}
const groups = (key) =>
  Object.fromEntries(
    [...new Set(x.map(key))].map((k) => [k, outcomes(x.filter((r) => key(r) === k))]),
  );
const inv = JSON.parse(readFileSync(`${root}/source-inventory.json`));
for (const m of register.matchAll(
  /\[`([A-Za-z]+)\.([A-Za-z0-9_]+)`\]\(\.\.\/\.\.\/(src\/core\/matchSimulation\/[^)#]+)#L(\d+)\)/g,
)) {
  const file = inv.files.find((f) => f.path === m[3]);
  if (!file?.symbols.some((s) => s.name === m[2] && s.line === Number(m[4])))
    throw Error('Symbol reference drift ' + m[0]);
}
const result = {
  schema: 'mfl-pr195-summary-v1',
  archiveSha256: digest(readFileSync(`${root}/pilot-v1.json.gz`)),
  sourceHash: evidence.sourceHash,
  protocolHash: evidence.protocolHash,
  registry: {
    count: ids.length,
    classes: Object.fromEntries(
      [
        ...new Set(
          [
            ...register.matchAll(/\*\*Classification \/ priority \/ severity:\*\* `([A-Z_]+)`/g),
          ].map((m) => m[1]),
        ),
      ].map((k) => [
        k,
        [...register.matchAll(new RegExp('severity:\\*\\* `' + k + '`', 'g'))].length,
      ]),
    ),
    priorities: Object.fromEntries(
      ['P0', 'P1', 'P2', 'P3'].map((k) => [
        k,
        [...register.matchAll(new RegExp('; \\*\\*' + k + '\\*\\*;', 'g'))].length,
      ]),
    ),
    statuses: Object.fromEntries(
      [...new Set([...register.matchAll(/^- \[ \] ([A-Z_]+)$/gm)].map((m) => m[1]))].map((k) => [
        k,
        [...register.matchAll(new RegExp('^- \\[ \\] ' + k + '$', 'gm'))].length,
      ]),
    ),
  },
  inventory: {
    files: inv.files.length,
    source: inv.files.filter((f) => !f.test).length,
    tests: inv.files.filter((f) => f.test).length,
    contextCandidates: inv.files.reduce((n, f) => n + f.findings.length, 0),
  },
  overall: outcomes(x),
  byScenario: groups((r) => r.config.scenario),
  bySkill: groups((r) => `${r.config.attacker}:${r.config.defender}`),
  defenderArrivals: evidence.defenderArrivals,
  captures: evidence.captures.map((c) => ({
    name: c.name,
    status: c.status,
    inputHash: digest(c.snapshot?.state ?? c.state),
    selectedAction: c.selectedAction,
    trials: c.trials,
  })),
  performance: evidence.performance,
};
const target = `${root}/summary.json`;
if (process.argv.includes('--check')) {
  if (digest(JSON.parse(readFileSync(target))) !== digest(result)) throw Error('Summary drift');
} else writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
const fmt = (n) => (n === null ? '—' : n.toFixed(3));
let table =
  '# PR195 pilot results\n\nControlled development only. Counts are per requested trial, never full matches. All outcome flags have distinct definitions and overlap. Rejected requests and censored/unresolved events are excluded from probability scores, with denominators shown. Mirrors and repeated seeds are clustered; Wilson95 intervals in JSON are descriptive and do not establish independent statistical coverage.\n\n| Scene | Trials / released | Receiver touch / control | Defender touch / control | Completion observed / predicted / Brier | Retention observed / predicted / Brier | Goal observed / predicted / Brier |\n|---|---:|---:|---:|---|---|---|\n';
for (const [name, r] of Object.entries(result.byScenario)) {
  const cell = (s) =>
    `${s.count}: ${fmt(s.observedRate)} / ${fmt(s.meanPrediction)} / ${fmt(s.brier)}`;
  table += `| ${name} | ${r.trials} / ${r.released} | ${r.receiverTouches} / ${r.receiverControls} | ${r.defenderTouches} / ${r.defenderControls} | ${cell(r.scores.completion)} | ${cell(r.scores.retained)} | ${cell(r.scores.goal)} |\n`;
}
table +=
  '\n## Reliability by event\n\n| Event / interval | n | Mean forecast | Observed |\n|---|---:|---:|---:|\n';
for (const [event, s] of Object.entries(result.overall.scores))
  for (const bin of s.bins)
    table += `| ${event} / ${bin.lower.toFixed(1)}–${bin.upper.toFixed(1)} | ${bin.count} | ${fmt(bin.meanPrediction)} | ${fmt(bin.observedRate)} |\n`;
table +=
  '\n## Skill matchups\n\n| Attacker:defender | Completion n / bias | Retention n / bias | Goal n / bias |\n|---|---:|---:|---:|\n';
for (const [k, r] of Object.entries(result.bySkill))
  table += `| ${k} | ${r.scores.completion.count} / ${fmt(r.scores.completion.bias)} | ${r.scores.retained.count} / ${fmt(r.scores.retained.bias)} | ${r.scores.goal.count} / ${fmt(r.scores.goal.bias)} |\n`;
table +=
  '\nPositive bias means overprediction. These analytic outputs are candidate probability claims, not calibrated probabilities. Pooled AUC, clipped log loss (epsilon1e−12), Wilson intervals and per-skill reliability bins are in summary.json. Calibration and discrimination differ. Neither identifies a real-football optimum.\n';
if (process.argv.includes('--check')) {
  if (readFileSync(`${root}/results.md`, 'utf8') !== table) throw Error('Results table drift');
} else writeFileSync(`${root}/results.md`, table);
console.log(
  'PR195 registry/evidence/summary',
  process.argv.includes('--check') ? 'CHECK PASS' : 'recorded',
  JSON.stringify({
    registry: result.registry,
    inventory: result.inventory,
    scores: result.overall.scores,
  }),
);
