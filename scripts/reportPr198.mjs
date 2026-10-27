import process from 'node:process';
import console from 'node:console';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { read } from './pr198Evidence.mjs';
const root = 'docs/performance/pr198/',
  s = read(root + 'summary.json');
const table = (heads, rows) =>
  [heads, heads.map(() => '---'), ...rows].map((r) => '| ' + r.join(' | ') + ' |').join('\n');
const n = (v, d = 2) => (v === null || v === undefined ? 'unavailable' : Number(v).toFixed(d));
const labels = {
  'state-value-v1': 'B',
  'phase-role-hybrid-v1': 'R3',
  'opportunity-driven-v1': 'O',
  'hierarchical-intent-v1': 'H',
  'contextual-judgment-v1': 'J',
};
const label = (r) => r.design.toUpperCase() + '/' + labels[r.policy];
const ablations = table(
  [
    'Model',
    'Released',
    'Direct touch',
    'Direct-path control',
    'Direct-path retained 1s',
    'Censored',
  ],
  Object.entries(s.ablations).map(([m, r]) => [
    m,
    r.released,
    r.touch,
    r.control,
    r.retained,
    r.censored,
  ]),
);
const before = read(s.evidence['reception-combined'].path).result.rows,
  after = read(s.evidence['reception-synchronized'].path).result.rows;
const counts = (xs) =>
  [
    xs.length,
    xs.filter((r) => r.outcome.directReceiverTouch).length,
    xs.filter((r) => r.outcome.directReceiverTouch && r.outcome.receiverControl).length,
    xs.filter((r) => r.outcome.directReceiverTouch && r.outcome.teamPossessionAtOneSecond).length,
  ].join('/');
const families = table(
  ['Family', 'Combined n/touch/control/retained', 'S n/touch/control/retained'],
  [...new Set(before.map((r) => r.family))].map((f) => [
    f,
    counts(before.filter((r) => r.family === f)),
    counts(after.filter((r) => r.family === f)),
  ]),
);
const opportunities = table(
  [
    'Model',
    'Scenarios',
    'Sampled loft',
    'Decision-only additions',
    'Either witness',
    'Autonomous loft releases',
    'Forced alternatives',
  ],
  Object.entries(s.opportunities).map(([m, r]) => [
    m,
    r.scenarios,
    r.loftCandidates,
    s.opportunityDecisionAudit[m].additionalShortWindows,
    s.opportunityDecisionAudit[m].candidateWithAnyWitness,
    r.released,
    r.forced,
  ]),
);
const stages = table(
  [
    'Policy',
    'n/arm',
    'Loft presence baseline→experiment',
    'Ready-now native decision witnesses',
    'Loft releases baseline→experiment',
  ],
  Object.keys(s.opportunityDecisionAudit.baseline.perPolicy).map((p) => {
    const a = s.opportunityDecisionAudit.baseline.perPolicy[p],
      b = s.opportunityDecisionAudit.loft.perPolicy[p];
    return [
      labels[p],
      a.n,
      `${a.candidate}→${b.candidate}`,
      b.readyNow === null ? 'unavailable (full-world)' : `${a.readyNow}→${b.readyNow}`,
      `${a.released}→${b.released}`,
    ];
  }),
);
const skills = table(
  [
    'Band',
    'n/arm',
    'Position-job recognition baseline→experiment',
    'Loft presence baseline→experiment',
    'Loft releases baseline→experiment',
  ],
  [40, 80].map((skill) => {
    const a = s.opportunityDecisionAudit.baseline.perSkill[skill],
      b = s.opportunityDecisionAudit.loft.perSkill[skill];
    return [
      skill,
      a.n,
      `${a.recognizedPositionJobs}→${b.recognizedPositionJobs}`,
      `${a.candidate}→${b.candidate}`,
      `${a.released}→${b.released}`,
    ];
  }),
);
const errors = table(
  ['Contact subset', 'n', 'Spatial MAE m', 'Temporal MAE s'],
  [
    [
      'combined shared contacts',
      s.sharedMeetingErrors.n,
      n(s.sharedMeetingErrors.beforeSpatialMAE, 3),
      n(s.sharedMeetingErrors.beforeTemporalMAE, 3),
    ],
    [
      'synchronised shared contacts',
      s.sharedMeetingErrors.n,
      n(s.sharedMeetingErrors.afterSpatialMAE, 3),
      n(s.sharedMeetingErrors.afterTemporalMAE, 3),
    ],
  ],
);
const disruptions = table(
  [
    'Scene',
    'Branches',
    'Finite unowned deflections',
    'Loose episodes',
    'Keeper rebounds',
    'Turnovers',
    'Opponent shots',
  ],
  Object.entries(s.disruption).map(([name, r]) => [
    name,
    r.n,
    r.deflections,
    r.looseEpisodes,
    r.rebounds,
    r.turnovers,
    r.opponentShots,
  ]),
);
const matches = table(
  [
    'Pair/model',
    'Attempted/completed',
    'Shots',
    'Score',
    'In-play min',
    'Wall / CPU s',
    'Peak RSS MiB',
  ],
  s.fullMatches.map((r) => [
    label(r) + '/' + r.model,
    `${r.passes.attempted}/${r.passes.completed}`,
    r.shots,
    `${r.score.home}–${r.score.away}`,
    n(r.inPlayMinutes, 1),
    `${n(r.performance.wallSeconds, 1)} / ${n((r.performance.cpu.user + r.performance.cpu.system) / 1e6, 1)}`,
    n(r.performance.maxRSSKiB / 1024, 1),
  ]),
);
const details = table(
  [
    'Pair/model',
    'Non-restart releases',
    'Direct touch / control / retained',
    'Lofted/long/progressive',
    'Final-third/box entries',
    'Def.contact/control',
    'Loose/GK rebound/turnovers',
    'Throw-ins/corners',
  ],
  s.fullMatches.map((r) => [
    label(r) + '/' + r.model,
    r.nonRestartReleases,
    `${r.directTouches}/${r.controls}/${r.retained}`,
    `${r.lofted}/${r.long}/${r.progressive}`,
    `${r.finalThirdEntries}/${r.boxEntries}`,
    `${r.defensiveContacts}/${r.defensiveControls}`,
    `${r.looseEpisodes}/${r.goalkeeperRebounds}/${r.turnovers}`,
    `${r.restarts.throw_in ?? 0}/${r.restarts.corner ?? 0}`,
  ]),
);
const matchStages = table(
  [
    'Pair/model',
    'Bounded decision menus / loft / unready',
    'Receiving-job / moving-job instances',
    'Native overlap/underlap starts',
  ],
  s.fullMatches.map((r) => [
    label(r) + '/' + r.model,
    ['B', 'R3'].includes(labels[r.policy])
      ? 'unavailable (full-world)'
      : `${r.opportunityCounts.boundedCandidateDecisions}/${r.opportunityCounts.boundedLoftedCandidates}/${r.opportunityCounts.rejectedOrUnready}`,
    `${r.opportunityCounts.recognized}/${r.opportunityCounts.movingRuns}`,
    `${r.autonomousRunStarts.overlap}/${r.autonomousRunStarts.underlap}`,
  ]),
);
const performance = table(
  ['Process', 'Model', 'Calls', 'Wall ms', 'CPU user/system ms', 'Peak RSS MiB'],
  Object.entries(s.performance).flatMap(([mode, cost]) =>
    cost.rows.map((r) => [
      mode,
      r.model,
      r.calls,
      n(r.wallMilliseconds),
      `${n(r.cpu.user / 1000)}/${n(r.cpu.system / 1000)}`,
      n(cost.maxRSSKiB / 1024, 1),
    ]),
  ),
);
const verification = existsSync(root + 'verification.json')
  ? read(root + 'verification.json')
  : null;
const replacements = {
  BASE_FINGERPRINT: s.frozenSourceFingerprint,
  ABLATIONS: ablations,
  FAMILY_RESULTS: families,
  LOST_TOUCH: s.receiverTransitions.lostTouch,
  GAINED_TOUCH: s.receiverTransitions.gainedTouch,
  SENSITIVITY_LOST: s.sensitivity.lostTouch,
  SENSITIVITY_GAINED: s.sensitivity.gainedTouch,
  OPPORTUNITIES: opportunities,
  POLICY_STAGES: stages,
  SKILL_STAGES: skills,
  MEETING_ERRORS: errors,
  DISRUPTION: disruptions,
  MATCHES: matches,
  MATCH_DETAILS: details,
  MATCH_STAGES: matchStages,
  PERFORMANCE: performance,
  VERIFICATION: verification
    ? `Local verification: **${verification.status}**. Exact commands, exits and compressed actual logs are in [verification.json](performance/pr198/verification.json).`
    : 'Local verification is in progress. No final readiness or CI success is inferred.',
};
let report = readFileSync('scripts/pr198ReportTemplate.md', 'utf8').replaceAll('\r\n', '\n');
for (const [key, value] of Object.entries(replacements))
  report = report.replaceAll('{{' + key + '}}', String(value));
if (/\{\{/.test(report)) throw Error('Unresolved PR198 placeholder');
const path =
  'docs/PR198_RECEIVER_SYNCHRONISATION_AUTONOMOUS_OPPORTUNITIES_AND_EMERGENT_DISRUPTION.md';
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== report) throw Error('PR198 report drift');
} else writeFileSync(path, report);
console.log('PR198 report', s.fullMatches.length, 'complete match rows; canonical NOT READY');
