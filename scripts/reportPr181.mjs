import { readFileSync, writeFileSync, readdirSync, copyFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { PRIMARY_DECISION_POLICIES } from '../src/core/matchSimulation/decisionPolicyConfig.ts';
import { pr172SourceHash } from './pr172Evidence.ts';
const root = process.argv.find((a) => a.startsWith('--runs='))?.slice(7) ?? '../pr181-final-v4';
const sourceHash = pr172SourceHash(),
  dir = 'docs/performance/pr181-evidence/cohort';
mkdirSync(dir, { recursive: true });
const files = PRIMARY_DECISION_POLICIES.flatMap((p) =>
  readdirSync(resolve(root, p))
    .filter((f) => f.endsWith('.json.gz') && !f.includes('failure'))
    .map((f) => resolve(root, p, f)),
);
if (files.length !== 30) throw Error(`Expected 30 final receipts, got ${files.length}`);
const rows = files.map((path) => {
  const raw = readFileSync(path),
    r = JSON.parse(gunzipSync(raw));
  if (
    r.status !== 'full_time' ||
    r.sourceHash !== sourceHash ||
    r.observer.errors.length ||
    r.report.diagnostics.observerErrors.length
  )
    throw Error(`Invalid final receipt ${path}`);
  if (
    r.official.attempts !== r.passes.unique ||
    r.observer.attempts !== r.passes.firstTime ||
    r.observer.completed !== r.passes.firstTimeCompleted
  )
    throw Error('Pass identities do not reconcile');
  if (Math.abs(r.clock.elapsed - r.clock.inPlay - r.clock.stoppage) > 0.0251)
    throw Error('Clock accounting mismatch');
  const crosses = Object.values(r.spatial.crossTypes).reduce((a, b) => a + b, 0);
  if (crosses !== r.flow.crosses)
    throw Error(
      `Cross release/observer mismatch ${r.design.id}/${r.policy}: ${crosses}/${r.flow.crosses}`,
    );
  const official = r.report.summary.official;
  const sum = (key) => official.home[key] + official.away[key];
  copyFileSync(path, `${dir}/${r.design.id}-${r.policy}.json.gz`);
  return {
    id: r.design.id,
    tier: r.design.tier,
    policy: r.policy,
    inputHash: r.inputHash,
    sessionHash: r.sessionHash,
    sourceHash,
    harnessHash: r.harnessHash,
    observationHash: r.observationHash,
    artifact: `pr181-evidence/cohort/${r.design.id}-${r.policy}.json.gz`,
    artifactSha256: createHash('sha256').update(raw).digest('hex'),
    status: r.status,
    finalHash: r.finalHash,
    ticks: r.ticks,
    time: r.time,
    clock: r.clock,
    official,
    passes: r.official.attempts,
    firstTime: r.passes.firstTime,
    firstTimeCompleted: r.passes.firstTimeCompleted,
    completion: r.official.completed / Math.max(1, r.official.attempts),
    firstTimeShare: r.passes.firstTime / Math.max(1, r.official.attempts),
    shots: r.flow.shots,
    goals: sum('goals'),
    corners: sum('corners'),
    offsides: sum('offsides'),
    fouls: sum('fouls'),
    crosses,
    crossTypes: r.spatial.crossTypes,
    aerial: r.spatial.events.aerial_contact_opportunity ?? 0,
    contestedAerialContacts: r.spatial.events.contested_aerial_contact ?? 0,
    multiPlayerBallContact: r.spatial.events.multi_player_ball_contact ?? 0,
    aerialOutcomes: r.spatial.aerialOutcomes,
    secondBallTeams: r.spatial.secondBallTeams,
    spatialEvents: r.spatial.events,
    exposure: r.spatial.sampled,
    forwardGapMetres:
      (r.spatial.sampled.forward_line_gap_metres ?? 0) /
      Math.max(1, r.spatial.sampled.forward_observations ?? 0),
    spaceBehindLineMetres:
      (r.spatial.sampled.depth_behind_line_metres ?? 0) /
      Math.max(1, r.spatial.sampled.attacking_shape_observations ?? 0),
    shapeMean: Object.fromEntries(
      [
        'block_width_metres',
        'block_length_metres',
        'defence_midfield_gap_metres',
        'midfield_attack_gap_metres',
        'defensive_line_from_own_goal_metres',
      ].map((k) => [
        k,
        (r.spatial.sampled[k] ?? 0) / Math.max(1, r.spatial.sampled.team_shape_observations ?? 0),
      ]),
    ),
    sprintCarryAttempts: r.spatial.events.sprint_carry_intent_started ?? 0,
    takeOnAttempts: r.spatial.events.wing_take_on_started ?? 0,
    passedMarkerWithControl: r.spatial.events.take_on_passed_marker_with_control ?? 0,
    takeOnOpponentControl: r.spatial.events.take_on_end_opponent_control ?? 0,
    behindLinePassAttempts: r.spatial.events.pass_targeted_behind_line ?? 0,
    behindLinePassResults: Object.fromEntries(
      Object.entries(r.spatial.events).filter(([k]) => k.startsWith('behind_line_pass_result_')),
    ),
    sprintDistance: r.spatial.sprintDistance,
    boxEntries: r.flow.boxEntries,
    turnovers: r.flow.turnovers,
    restarts: r.flow.restarts,
    credibleOpportunityEpisodes: r.report.summary.credibleOpportunityEpisodes,
    shotOutcomes: Object.fromEntries(
      [...new Set(r.report.summary.shots.map((s) => s.outcome ?? 'unresolved'))].map((k) => [
        k,
        r.report.summary.shots.filter((s) => (s.outcome ?? 'unresolved') === k).length,
      ]),
    ),
    performance: {
      cpuSeconds: r.performance.cpuSeconds,
      wallSeconds: r.performance.wallSeconds,
      maxSampledRssBytes: r.performance.maxSampledRssBytes,
      concurrent: true,
    },
    observerErrors: r.observer.errors.length,
    roleObserverErrors: r.report.diagnostics.observerErrors.length,
  };
});
for (const id of new Set(rows.map((r) => r.id))) {
  const paired = rows.filter((r) => r.id === id);
  if (
    paired.length !== 5 ||
    new Set(paired.map((r) => r.inputHash)).size !== 1 ||
    new Set(paired.map((r) => r.sessionHash)).size !== 1
  )
    throw Error('Matched inputs differ');
}
if (
  new Set(rows.map((r) => r.harnessHash)).size !== 1 ||
  new Set(rows.map((r) => r.observationHash)).size !== 1
)
  throw Error('Mixed observation definitions');
const mean = (list, get) => list.reduce((n, r) => n + get(r), 0) / list.length;
const summarize = (list) => ({
  matches: list.length,
  passes: mean(list, (r) => r.passes),
  firstTimeShare: mean(list, (r) => r.firstTimeShare),
  shots: mean(list, (r) => r.shots),
  goals: mean(list, (r) => r.goals),
  crosses: mean(list, (r) => r.crosses),
  aerial: mean(list, (r) => r.aerial),
  contestedAerialContacts: mean(list, (r) => r.contestedAerialContacts),
  corners: mean(list, (r) => r.corners),
  offsides: mean(list, (r) => r.offsides),
  liveMinutes: mean(list, (r) => r.clock.inPlay / 60),
  boxEntries: mean(list, (r) => r.boxEntries),
  forwardGapMetres: mean(list, (r) => r.forwardGapMetres),
  spaceBehindLineMetres: mean(list, (r) => r.spaceBehindLineMetres),
  behindLinePassAttempts: mean(list, (r) => r.behindLinePassAttempts),
  sprintCarryAttempts: mean(list, (r) => r.sprintCarryAttempts),
  takeOnAttempts: mean(list, (r) => r.takeOnAttempts),
  passedMarkerWithControl: mean(list, (r) => r.passedMarkerWithControl),
});
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
writeFileSync(
  'docs/performance/PR181-policy-comparison.json',
  JSON.stringify(
    {
      schema: 'mfl-pr181-comparison-v1',
      sourceHash,
      unit: 'six development fixture designs; five dependent policy executions per design, no independent policy selection',
      byPolicy,
      byTier,
      rows,
    },
    null,
    2,
  ) + '\n',
);
const table = [
  '| Mean per complete match, both teams | Legacy | B | R1 | R2 | R3 |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...[
    ['Passes', 'passes'],
    ['First-time share', 'firstTimeShare'],
    ['Forward gap to line (m, exposure mean)', 'forwardGapMetres'],
    ['Space behind line (m, exposure mean)', 'spaceBehindLineMetres'],
    ['Pre-step event targets behind line', 'behindLinePassAttempts'],
    ['Sprint carry intentions', 'sprintCarryAttempts'],
    ['Wide take-on intentions', 'takeOnAttempts'],
    ['Marker passed with control', 'passedMarkerWithControl'],
    ['Physical shots', 'shots'],
    ['Goals', 'goals'],
    ['Cross releases', 'crosses'],
    ['Aerial opportunities', 'aerial'],
    ['Body-contested aerial contacts', 'contestedAerialContacts'],
    ['Box entries', 'boxEntries'],
    ['Corners', 'corners'],
    ['Offsides', 'offsides'],
    ['Live minutes', 'liveMinutes'],
  ].map(
    ([label, field]) =>
      `| ${label} | ${PRIMARY_DECISION_POLICIES.map((p) => (field === 'firstTimeShare' ? `${(byPolicy[p][field] * 100).toFixed(1)}%` : byPolicy[p][field].toFixed(2))).join(' | ')} |`,
  ),
].join('\n');
const doc = 'docs/PR181_ATTACKING_DEPTH_WING_DUELS_AERIAL_FOOTBALL.md';
const text = readFileSync(doc, 'utf8').replace(
  /<!-- PR181_RESULTS_START -->[\s\S]*?<!-- PR181_RESULTS_END -->/,
  `<!-- PR181_RESULTS_START -->\n**30/30 full-time matches**, zero flow/role observer errors, identical inputs within every five-policy pair.\n\n${table}\n<!-- PR181_RESULTS_END -->`,
);
writeFileSync(doc, text);
console.log(JSON.stringify({ fullTime: rows.length, byPolicy, sourceHash }));
