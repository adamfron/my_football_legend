import process from 'node:process';
import console from 'node:console';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { read } from './pr197Evidence.mjs';

const s = read('docs/performance/pr197/summary.json');
const table = (heads, rows) =>
  [heads, heads.map(() => '---'), ...rows].map((r) => '| ' + r.join(' | ') + ' |').join('\n');
const n = (v, digits = 3) =>
  v === null || v === undefined ? 'unavailable' : Number(v).toFixed(digits);
const yn = (v) => (v ? 'yes' : 'no');
const labels = {
  'state-value-v1': 'B',
  'phase-role-hybrid-v1': 'R3',
  'opportunity-driven-v1': 'O',
  'hierarchical-intent-v1': 'H',
  'contextual-judgment-v1': 'J',
};
const label = (r) => r.design.toUpperCase() + '/' + (labels[r.policy] ?? r.policy);
const counts = (rows) => [
  rows.length,
  ...['directReceiverTouch', 'receiverControl', 'teamPossessionAtOneSecond'].map(
    (key) => rows.filter((r) => r.outcome[key]).length,
  ),
  rows.filter((r) => r.outcome.defensiveControlAt !== null).length,
];
const long = ['longBaseline', 'longDefence', 'longCombined'].map((k) => [
  k.replace('long', '').toLowerCase(),
  s.longPasses[k],
]);
const longTotals = table(
  [
    'Model',
    'Released',
    'Direct touch',
    'Control',
    'Retained',
    'Opponent control',
    'High ownership bypass',
    'Censored',
  ],
  long.map(([k, r]) => [
    k,
    r.released,
    r.directTouch,
    r.control,
    r.retained,
    r.opponentControl,
    r.highOwnership,
    r.censored,
  ]),
);
const raws = Object.fromEntries(
  ['longBaseline', 'longDefence', 'longCombined'].map((k) => [k, read(s.evidence[k].path).result]),
);
const bands = [
  ...new Set(raws.longBaseline.original.map((r) => r.config.attacker + ':' + r.config.defender)),
];
const longBands = table(
  ['Skill A:D', 'Baseline n/touch/control/retained/opp.control', 'Defence', 'Combined'],
  bands.map((band) => [
    band,
    ...Object.values(raws).map((r) =>
      counts(r.original.filter((x) => x.config.attacker + ':' + x.config.defender === band)).join(
        '/',
      ),
    ),
  ]),
);
const same = table(
  [
    'Same actual release intervention',
    'Touch',
    'Control',
    'Retained',
    'Terminal',
    'Receiver contact time',
  ],
  raws.longCombined.sameRelease.map((r) => [
    r.factor,
    yn(r.outcome.directReceiverTouch),
    yn(r.outcome.receiverControl),
    yn(r.outcome.teamPossessionAtOneSecond),
    r.outcome.terminal,
    n(r.outcome.receiverTouchAt),
  ]),
);
const readiness = table(
  ['Condition', 'n', 'Actor contact', 'Later control', 'Defender contact'],
  Object.entries(s.readiness.byCondition).map(([key, r]) => [
    key,
    r.n,
    r.contacts,
    r.control,
    r.defenderContact,
  ]),
);
const calibration = table(
  [
    'Model/event',
    'Eligible',
    'Mean claim',
    'Observed',
    'Bias',
    'Brier',
    'Log loss',
    'Descriptive Wilson95',
  ],
  Object.entries(s.family.summaries).flatMap(([model, r]) =>
    ['touch', 'control', 'retained'].map((event) => {
      const m = r[event];
      return [
        model + '/' + event,
        m.count,
        n(m.meanPrediction),
        n(m.observedRate),
        n(m.bias),
        n(m.brier),
        n(m.clippedLogLoss),
        m.wilson95.map((v) => n(v)).join('–'),
      ];
    }),
  ),
);
const autonomous = table(
  ['Actual stage', 'Runs /110'],
  Object.entries(s.autonomous)
    .filter(([key]) => key !== 'n')
    .map(([key, value]) => [key, value]),
);
const pairs = new Map();
for (const r of s.fullMatches) {
  const k = label(r);
  pairs.set(k, { ...pairs.get(k), [r.model]: r });
}
const arrow = (a, b, key) => a[key] + ' → ' + b[key];
const matches = table(
  ['Pair', 'Attempted/completed baseline → combined', 'Shots', 'Score', 'In-play min', 'Wall s'],
  [...pairs].map(([key, { baseline: a, combined: b }]) => [
    key,
    `${a.passes.attempted}/${a.passes.completed} → ${b.passes.attempted}/${b.passes.completed}`,
    arrow(a, b, 'shots'),
    `${a.score.home}–${a.score.away} → ${b.score.home}–${b.score.away}`,
    `${n(a.time.ballInPlaySeconds / 60, 1)} → ${n(b.time.ballInPlaySeconds / 60, 1)}`,
    `${n(a.performance.wallSeconds, 1)} → ${n(b.performance.wallSeconds, 1)}`,
  ]),
);
const details = [];
details.push(
  'Non-restart released-delivery metrics (control can follow an intervening deflection; it is not restricted to the direct-touch path in this table):\n',
);
details.push(
  table(
    [
      'Pair/model',
      'Releases',
      'Direct touch/control/retained',
      'Opp.contact/control',
      'Disruption/censored',
      'Ground/lofted/long/progressive',
      'Lead/through',
      'v3 changed attributions',
    ],
    s.fullMatches.map((r) => [
      label(r) + '/' + r.model,
      r.eligibleNonRestartReleases,
      [r.directTouches, r.controls, r.retained].join('/'),
      [r.opponentContacts, r.opponentControls].join('/'),
      [r.disruptions, r.censored].join('/'),
      [r.ground, r.lofted, r.long, r.progressive].join('/'),
      [r.lead ?? '?', r.through ?? '?'].join('/'),
      r.fullReplay?.changedMeasurements ?? 'pending',
    ]),
  ),
);
details.push('\nTerritory, touch quality and ordinary continuations:\n');
details.push(
  table(
    [
      'Pair/model',
      'Final-third/box entries',
      'Clean/directional/heavy/failed',
      'Carries',
      'Restart awards',
      'Attempts/selected observer events',
      'Preparation failures',
    ],
    s.fullMatches.map((r) => [
      label(r) + '/' + r.model,
      [r.football.finalThirdEntries, r.football.boxEntries].join('/'),
      ['clean', 'directional', 'heavy', 'failed'].map((k) => r.football.receptions[k]).join('/'),
      r.football.carries,
      r.football.restartAwards,
      [r.counts.attempts, r.counts.decisions].join('/'),
      JSON.stringify(r.counts.preparationFailures),
    ]),
  ),
);
details.push(
  '\nThe observer counts decision-index transitions/attempt events, not a complete denominator of every policy candidate. Long-pass and through/progressive observer counts can differ from the original-episode denominator. Natural restart durations, reasons and distributions are in each raw match receipt; no restart count is treated as a target.',
);
details.push(
  `\nCurrent-kernel full replays equivalent: **${s.fullReplayCount}/14**; total changed measured episode records: **${s.fullMatches.reduce((sum, r) => sum + (r.fullReplay?.changedMeasurements ?? 0), 0)}**. Physical final hashes and exact release lists are checked independently of those changed measurements.`,
);
const shotLosses = [...pairs]
  .filter(([, { baseline: a, combined: b }]) => b.shots < a.shots)
  .map(([key, { baseline: a, combined: b }]) => `${key} ${a.shots}→${b.shots}`);
const territoryLosses = [...pairs]
  .filter(([, { baseline: a, combined: b }]) => b.football.boxEntries < a.football.boxEntries)
  .map(
    ([key, { baseline: a, combined: b }]) =>
      `${key} ${a.football.boxEntries}→${b.football.boxEntries}`,
  );
details.push(
  `\nPaired shot regressions: ${shotLosses.join('; ') || 'none in this small catalogue'}. Box-entry regressions: ${territoryLosses.join('; ') || 'none in this small catalogue'}. Excessive circulation and SW mismatch scores remain realism concerns. These policy-specific results prevent an inference of general football improvement from the pooled shot total.`,
);
const perf = s.profile;
const performance =
  table(
    ['Process', 'Probe', 'Canonical ETA', 'Model', 'Calls', 'Wall ms', 'CPU user/system ms'],
    [
      { name: 'serial', value: perf.serial },
      ...perf.concurrent.map((value, i) => ({ name: 'concurrent-' + (i + 1), value })),
    ].flatMap(({ name, value }) =>
      value.rows.map((r) => [
        name,
        r.kind,
        r.canonical === undefined ? 'n/a' : yn(r.canonical),
        r.model,
        r.calls,
        n(r.milliseconds, 2),
        [n(r.cpu.user / 1000, 1), n(r.cpu.system / 1000, 1)].join('/'),
      ]),
    ),
  ) +
  '\n\n' +
  table(
    ['Process', 'Peak RSS MiB'],
    [
      { name: 'serial', value: perf.serial },
      ...perf.concurrent.map((value, i) => ({ name: 'concurrent-' + (i + 1), value })),
    ].map(({ name, value }) => [name, n(value.maxRSSKiB / 1024, 1)]),
  );
const shots = ['baseline', 'combined']
  .map((model) =>
    s.fullMatches.filter((r) => r.model === model).reduce((sum, r) => sum + r.shots, 0),
  )
  .join(' → ');
const verificationPath = 'docs/performance/pr197/verification.json';
const verification = existsSync(verificationPath) ? read(verificationPath) : null;
const registry = readFileSync('docs/match-engine/ASSUMPTIONS_REGISTER.md', 'utf8');
const scope = [
  'PASS-001',
  'PASS-003',
  'PASS-004',
  'PASS-005',
  'PASS-006',
  'PASS-007',
  'PASS-008',
  'PASS-009',
  'PASS-010',
  'DEF-003',
  'DEF-004',
  'MEAS-011',
  'MEAS-012',
  'TACT-009',
  'PHYS-002',
];
const registryStatus = table(
  ['Investigated ID', 'Historical PR196', 'PR197 status', 'Closure'],
  scope.map((id) => [
    id,
    read('docs/performance/pr197/frozen-pr196.json').registry.find((r) => r.id === id).status,
    registry.split('### ' + id + ' — ')[1].match(/- \[ \] ([A-Z_]+)/)[1],
    'OPEN',
  ]),
);
const replacements = {
  REGISTRY_STATUS: registryStatus,
  LONG_TOTALS: longTotals,
  SHOTS: shots,
  LONG_BANDS: longBands,
  SAME_RELEASE: same,
  READINESS: readiness,
  CALIBRATION: calibration,
  AUTONOMOUS: autonomous,
  MATCHES: matches,
  MATCH_DETAILS: details.join('\n'),
  PERFORMANCE: performance,
  VERIFY_STATUS: verification?.status ?? 'PENDING — recording and final checks in progress',
};
let report = readFileSync('scripts/pr197ReportTemplate.md', 'utf8');
for (const [key, value] of Object.entries(replacements))
  report = report.replaceAll('{{' + key + '}}', value);
if (/\{\{/.test(report)) throw Error('Unresolved report placeholder');
const path = 'docs/PR197_PASSING_REALITY_FLIGHT_INTERCEPTION_AND_RECEIVER_ANTICIPATION.md';
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== report) throw Error('PR197 report drift');
} else writeFileSync(path, report);
console.log('PR197 report', s.fullReplayCount, 'full replays', replacements.VERIFY_STATUS);
