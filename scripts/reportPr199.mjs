import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import console from 'node:console';
import { read, normalized, options, ROOT } from './pr199Evidence.mjs';
const s = read(`${ROOT}/summary.json`),
  p = read('docs/match-engine/REALISM_PROGRESS.json');
const table = (head, rows) =>
  [head, head.map(() => '---'), ...rows].map((r) => '| ' + r.join(' | ') + ' |').join('\n');
const n = (v, d = 3) => (v === null || v === undefined ? 'unavailable' : Number(v).toFixed(d));
const counts = (r) => `${r.eligible ?? r.n}/${r.touch}/${r.control}/${r.retained}`;
const yes = (v) => (v ? 'yes' : 'no');
const timing = Object.entries(s.perception.byTiming).filter(
  ([k]) => /^(EARLY|APEX|LATE|INTERMITTENT)\//.test(k) && k.endsWith('/no-cue'),
);
const aggregateRows = timing.map(([k, r]) => [
  k,
  r.trials,
  n(r.attended),
  n(r.acquired, 2),
  r.noUsefulBallObservation,
  n(r.halfSecondForecast.meanHorizontal),
  n(r.halfSecondForecast.p90Horizontal),
  n(r.halfSecondForecast.maxHorizontal),
]);
const rawAudit = read(`${ROOT}/information-audit-v1.json.gz`).result.rows;
const verification = existsSync(`${ROOT}/verification.json`)
  ? read(`${ROOT}/verification.json`)
  : null;
const vars = {
  PERCEPTION_N: s.perception.trials,
  REFERENCE_N: Object.values(s.receivers.referenceSummary).reduce((n, r) => n + r.eligible, 0),
  RECEIVER_N:
    Object.values(s.receivers.summary).reduce((a, r) => a + r.eligible, 0) +
    Object.values(s.receivers.attributeSummary).reduce((a, r) => a + r.eligible, 0),
  BASELINE: table(
    ['Configuration', 'Released/touch/control/retained'],
    Object.entries(s.baseline).map(([k, r]) => [k, counts(r)]),
  ),
  CASES: table(
    [
      'Case (family / ability / sample)',
      'Change',
      'R touch/control/retained',
      'S touch/control/retained',
      'Restoring interventions',
    ],
    s.changedCases.map((c) => [
      `${c.family}/${c.skill}/${c.sample}`,
      c.lostTouch ? 'lost' : 'gained',
      `${yes(c.variants.R.touch)}/${yes(c.variants.R.control)}/${yes(c.variants.R.retained)}`,
      `${yes(c.variants.S.touch)}/${yes(c.variants.S.control)}/${yes(c.variants.S.retained)}`,
      c.restoredBy.join(', ') || 'gain retained as separate outcome',
    ]),
  ),
  CASE_EXPLANATIONS: s.changedCases
    .map(
      (c) =>
        `- **${c.family}/${c.skill}/${c.sample}**, ball \`${c.ballHash}\`: ${c.explanation} R touch time: ${c.variants.R.touchAt == null ? 'unavailable' : n(c.variants.R.touchAt) + 's'}; S touch time: ${c.variants.S.touchAt == null ? 'unavailable' : n(c.variants.S.touchAt) + 's'}; S had ${c.noPreparedPlanReviews} no-prepared-contact reviews.`,
    )
    .join('\n'),
  ABLATIONS:
    table(
      ['Intervention', 'Eligible/touch/control/retained'],
      Object.entries(s.forensicSummary).map(([k, r]) => [k, counts(r)]),
    ) +
    '\n\n' +
    table(
      ['Separate incoming-uncertainty ablation', 'Eligible/touch/control/retained'],
      Object.entries(s.forensicUncertainty).map(([k, r]) => [k, counts(r)]),
    ),
  AUDIT: table(
    ['Suspected path', 'Deterministic finding'],
    rawAudit.map((r) => [r.claim, r.finding]),
  ),
  TIMING: table(
    [
      'Window / duration seconds',
      'Flights',
      'Attended seconds',
      'Mean acquisitions',
      'No useful ball observation',
      '0.5s mean error m',
      'P90 m',
      'Maximum m',
    ],
    aggregateRows,
  ),
  EQUAL_EXPOSURE: table(
    [
      '200ms placement',
      'Offered s',
      'Attended s',
      'Mean acquisitions',
      'No useful observation /20',
    ],
    timing
      .filter(([k]) => k.includes('/0.2/'))
      .map(([k, r]) => [
        k.split('/')[0],
        n(r.offered),
        n(r.attended),
        n(r.acquired, 2),
        r.noUsefulBallObservation,
      ]),
  ),
  CUES:
    table(
      [
        'Receiver/controller',
        'Condition',
        'Eligible/touch/control/retained',
        'No useful ball observation',
        'No trajectory estimate',
      ],
      Object.entries(s.receivers.byCondition)
        .filter(([k]) => /\/(EARLY|CUE_ONLY|NONE)\//.test(k))
        .map(([k, r]) => [
          k.split('/')[0],
          k.split('/').slice(1).join('/'),
          counts(r),
          r.noUsefulBallObservation,
          r.noTrajectoryEstimate,
        ]),
    ) +
    '\n\n' +
    table(
      ['Keeper final cue comparison', 'Attempts', 'Cue acquired', 'Contact / goal'],
      Object.entries(s.keepers.v7.byCueAvailability)
        .filter(([k]) => /^(clear|wall_initial)\//.test(k))
        .map(([k, r]) => [k, r.attempts, r.acquiredCue, `${r.contacts}/${r.goals}`]),
    ),
  ATTRIBUTES: table(
    [
      'Controller / independently varied factor / level',
      'Eligible/touch/control/retained',
      'Mean acquisitions',
    ],
    Object.entries(s.receivers.byAttribute).map(([k, r]) => [
      k,
      counts(r),
      n(r.meanAcquisitions, 2),
    ]),
  ),
  ERROR_FAMILIES: table(
    [
      'Family',
      'Eligible 0.5s forecasts',
      'Emitted / missing',
      'Mean horizontal m',
      'P90 m',
      'Max m',
      'Mean height m',
    ],
    Object.entries(s.perception.byFamily).map(([k, r]) => [
      k,
      r.eligible,
      `${r.predicted}/${r.missing}`,
      n(r.meanHorizontal),
      n(r.p90Horizontal),
      n(r.maxHorizontal),
      n(r.meanHeight),
    ]),
  ),
  ERROR_AGES: table(
    [
      'Age since actual sighting s',
      'Eligible',
      'Emitted / missing',
      'Mean horizontal m',
      'P90 m',
      'Max m',
    ],
    Object.entries(s.perception.byAge).map(([k, r]) => [
      k,
      r.eligible,
      `${r.predicted}/${r.missing}`,
      n(r.meanHorizontal),
      n(r.p90Horizontal),
      n(r.maxHorizontal),
    ]),
  ),
  RECEIVER_TOTALS: table(
    ['Controller', 'Eligible/touch/control/retained', 'Censored', 'No useful ball observation'],
    Object.entries(s.receivers.summary).map(([k, r]) => [
      k,
      counts(r),
      r.censored,
      r.noUsefulEstimate,
    ]),
  ),
  RECEIVER_CONDITIONS: table(
    [
      'Controller / visibility / cues',
      'Eligible/touch/control/retained',
      'No acquired ball sighting',
      'Remembered motor ticks',
    ],
    Object.entries(s.receivers.byCondition).map(([k, r]) => [
      k,
      counts(r),
      r.noBallObservation,
      r.memoryContinuationTicks,
    ]),
  ),
  KEEPERS:
    table(
      [
        'V7 motor-isolated scenario / controller (no-cue arms)',
        'Attempts',
        'Contact',
        'Catch / parry',
        'Goal',
        'No sight',
        'Mean sight s',
        'Mean first movement s',
      ],
      Object.entries(s.keepers.v7.byScenario).map(([k, r]) => [
        k,
        r.attempts,
        r.contacts,
        `${r.catches}/${r.parries}`,
        r.goals,
        r.noSight,
        n(r.meanFirstSight),
        n(r.meanFirstMovement),
      ]),
    ) +
    '\n\n' +
    table(
      [
        'Version (all skill and control trials)',
        'Attempts',
        'Contact',
        'Catch / parry',
        'Goal',
        'No sight',
      ],
      Object.entries(s.keepers).map(([k, r]) => [
        k,
        r.summary.attempts,
        r.summary.contacts,
        `${r.summary.catches}/${r.summary.parries}`,
        r.summary.goals,
        r.summary.noSight,
      ]),
    ),
  PERFORMANCE:
    table(
      ['Category', 'Calls', 'Recorded wall ms', 'CPU user/system ms'],
      s.performance.costs.categories.map((r) => [
        r.category,
        240,
        n(r.milliseconds, 2),
        `${n(r.cpu.user / 1000, 2)}/${n(r.cpu.system / 1000, 2)}`,
      ]),
    ) + `\n\nProfile peak RSS: ${n(s.performance.costs.maxRSSKiB / 1024, 1)} MiB.`,
  VERIFICATION: verification
    ? `Local recorded verification: **${verification.status}**. [Actual commands, exits and compressed logs](performance/pr199/verification.json) retain initial failures and successful retries separately.`
    : 'Local verification is still running; this report is not a readiness or green-CI claim. Actual results will be recorded before the PR is described as verified.',
  PROGRESS:
    table(
      ['Dimension', 'Supported scopes'],
      Object.entries(p.supportedCounts).map(([k, v]) => [k, v]),
    ) +
    `\n\nTotal registered ${p.total}; registry-blocked ${p.blockedIds.length}; awaiting first linked item-specific lab ${p.awaitingFirstLinkedLab.length}; distinct scoped source corrections ${p.distinctScopedCorrections.length}.`,
};
let report = normalized('scripts/pr199ReportTemplate.md');
for (const [key, value] of Object.entries(vars))
  report = report.replaceAll('{{' + key + '}}', String(value));
if (/\{\{/.test(report)) throw Error('Unresolved PR199 report placeholder');
const path = 'docs/PR199_BALL_FLIGHT_PERCEPTION_RECEIVER_FORENSICS_AND_VALIDATION_PROGRESS.md';
if (options.has('check')) {
  if (normalized(path) !== report) throw Error('PR199 report drift');
} else writeFileSync(path, report);
console.log('PR199 report generated/checked', report.length, 'characters; 26 sections');
void readFileSync;
