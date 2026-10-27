import process from 'node:process';
import console from 'node:console';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { hash, read } from './pr197Evidence.mjs';
import { scoreCalibration } from '../src/core/matchSimulation/calibrationMetrics.ts';
const check = process.argv.includes('--check');
const paths = {
  longBaseline: 'docs/performance/pr197/long-pass-baseline-v6.json.gz',
  longDefence: 'docs/performance/pr197/long-pass-defence-v4.json.gz',
  longCombined: 'docs/performance/pr197/long-pass-combined-v5.json.gz',
  families: 'docs/performance/pr197/families-v5.json.gz',
  launch: 'docs/performance/pr197/launch-v1.json.gz',
  readiness: 'docs/performance/pr197/readiness-v1.json.gz',
  autonomous: 'docs/performance/pr197/autonomous-v5.json.gz',
  candidates: 'docs/performance/pr197/candidates-v3.json.gz',
  interception: 'docs/performance/pr197/interception-v2.json.gz',
  profile: 'docs/performance/pr197/profile-v2.json',
};
paths.aerialControls = 'docs/performance/pr197/aerial-controls-v2.json.gz';
paths.candidateBoundaries = 'docs/performance/pr197/candidate-boundaries-v2.json.gz';
const loaded = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, read(path)]));
const counts = (rows) => ({
  requests: rows.length,
  released: rows.filter((r) => r.outcome.released).length,
  directTouch: rows.filter((r) => r.outcome.directReceiverTouch).length,
  control: rows.filter((r) => r.outcome.receiverControl).length,
  retained: rows.filter((r) => r.outcome.teamPossessionAtOneSecond).length,
  opponentControl: rows.filter((r) => r.outcome.defensiveControlAt !== null).length,
  censored: rows.filter((r) => r.outcome.censored).length,
  highOwnership: rows.filter((r) =>
    r.events?.some(
      (e) =>
        e.actorId?.includes('opponent') &&
        e.contactHeight > 0.65 &&
        e.afterBall.position.z === 0.11,
    ),
  ).length,
});
const family = loaded.families.result,
  autonomous = loaded.autonomous.result.rows;
const strata = {};
for (const model of ['baseline', 'defence', 'height', 'receiver', 'combined']) {
  const rows = family.rows.filter((r) => r.model === model);
  const score = (xs) =>
    Object.fromEntries(
      ['directTouch', 'directControl', 'directRetained'].map((event) => [
        event,
        scoreCalibration(
          xs
            .filter(
              (r) =>
                r.outcome.released &&
                (event === 'directTouch' ? r.outcome.directReceiverTouch : r[event]) !== null,
            )
            .map((r) => ({
              probability: r.contracts[event],
              outcome: event === 'directTouch' ? r.outcome.directReceiverTouch : r[event],
            })),
        ),
      ]),
    );
  strata[model] = {
    byFamily: Object.fromEntries(
      [...new Set(rows.map((r) => r.family))].map((f) => [
        f,
        score(rows.filter((r) => r.family === f)),
      ]),
    ),
    bySkill: Object.fromEntries(
      [20, 40, 60, 80, 100].map((n) => [n, score(rows.filter((r) => r.skill === n))]),
    ),
  };
}
const candidates = loaded.candidates.result.rows;
const available = readdirSync('docs/performance/pr197/matches')
  .filter((p) => p.endsWith('.json.gz') && !p.includes('-prefix'))
  .sort();
const allMatches = available.map((name) => ({
  path: 'docs/performance/pr197/matches/' + name,
  ...read('docs/performance/pr197/matches/' + name),
}));
const selected = new Map();
for (const row of allMatches
  .filter((r) => r.status === 'full_time' && !r.failure)
  .sort((a, b) => a.version.localeCompare(b.version)))
  selected.set(`${row.design}:${row.policy}:${row.corrected}`, row);
const matchRows = [...selected.values()].map((r) => {
  const lineagePath = `docs/performance/pr197/lineage/${basename(r.path).replace('.json.gz', '-lineage-v1.json.gz')}`;
  const lineage = existsSync(lineagePath) ? read(lineagePath) : null;
  const outcomes = (lineage?.equivalent ? lineage.passOutcomes : r.passOutcomes).filter(
    (p) => !p.restartOrigin,
  );
  return {
    path: r.path,
    design: r.design,
    policy: r.policy,
    model: r.corrected ? 'combined' : 'baseline',
    version: r.version,
    measurementVersion: lineage?.equivalent ? 'original-delivery-v3' : 'original-delivery-v2',
    fullReplay: lineage
      ? {
          path: lineagePath,
          equivalent: lineage.equivalent,
          finalHash: lineage.finalHash,
          expectedFinalHash: lineage.expectedFinalHash,
          changedMeasurements: lineage.differences.length,
          source: lineage.source,
          performance: lineage.performance,
        }
      : null,
    seed: r.seed,
    inputHash: r.originalInputHash,
    status: r.status,
    seconds: r.seconds,
    ticks: r.ticks,
    passes: r.passes,
    score: r.score,
    shots: r.shots,
    eligibleNonRestartReleases: outcomes.length,
    directTouches: outcomes.filter((p) => p.outcome.directReceiverTouch).length,
    controls: outcomes.filter((p) => p.outcome.receiverControl).length,
    retained: outcomes.filter((p) => p.outcome.teamPossessionAtOneSecond).length,
    opponentContacts: outcomes.filter((p) => p.outcome.defensiveContactAt !== null).length,
    opponentControls: outcomes.filter((p) => p.outcome.defensiveControlAt !== null).length,
    disruptions: outcomes.filter((p) => p.outcome.defensiveDisruptionAt !== null).length,
    censored: outcomes.filter((p) => p.outcome.censored).length,
    ground: outcomes.filter((p) => p.delivery === 'ground').length,
    lofted: outcomes.filter((p) => p.delivery === 'lofted').length,
    long: outcomes.filter((p) => p.length >= 30).length,
    progressive: outcomes.filter((p) => p.progress >= 10).length,
    lead: lineage?.equivalent ? outcomes.filter((p) => p.intent === 'lead').length : null,
    through: lineage?.equivalent ? outcomes.filter((p) => p.intent === 'through').length : null,
    counts: r.counts,
    football: Object.fromEntries(
      Object.entries(r.football).filter(
        ([key, value]) =>
          typeof value === 'number' ||
          ['receptions', 'turnoverCauses', 'firstTimePassByIntent'].includes(key),
      ),
    ),
    time: r.time,
    performance: r.performance,
    source: r.sourceArchive,
    flags: r.flags,
  };
});
const value = {
  schema: 'pr197-summary-v1',
  base: read('docs/performance/pr197/frozen-pr196.json').base,
  evidence: Object.fromEntries(
    Object.entries(paths).map(([key, path]) => [key, { path, sha256: hash(readFileSync(path)) }]),
  ),
  longPasses: Object.fromEntries(
    ['longBaseline', 'longDefence', 'longCombined'].map((key) => [
      key,
      counts(loaded[key].result.original),
    ]),
  ),
  family: { requests: family.rows.length, summaries: family.summaries, strata },
  launch: {
    samples: loaded.launch.result.rows.length,
    liveTraces: loaded.launch.result.flight.length,
    maximumPreInterventionPositionError: Math.max(
      ...loaded.launch.result.flight.map((r) => r.flight.maximumPositionError),
    ),
    maximumPreInterventionVelocityError: Math.max(
      ...loaded.launch.result.flight.map((r) => r.flight.maximumVelocityError),
    ),
  },
  readiness: {
    rows: loaded.readiness.result.rows.length,
    byCondition: Object.fromEntries(
      [...new Set(loaded.readiness.result.rows.map((r) => r.id))].map((id) => {
        const xs = loaded.readiness.result.rows.filter((r) => r.id === id);
        return [
          id,
          {
            n: xs.length,
            contacts: xs.filter((r) => r.metrics.actorContacts > 0).length,
            control: xs.filter((r) => r.metrics.controlAt !== null).length,
            defenderContact: xs.filter((r) => r.metrics.defenderContact).length,
          },
        ];
      }),
    ),
  },
  autonomous: {
    n: autonomous.length,
    recognisedOpportunities: autonomous.filter((r) => r.opportunityRecognition !== null).length,
    runs: autonomous.filter((r) => r.runBegins !== null).length,
    diagonalRuns: autonomous.filter((r) => r.diagonalRunBegins !== null).length,
    passerObserves: autonomous.filter((r) => r.passerSeesRun !== null).length,
    candidate: autonomous.filter((r) => r.candidateAt !== null).length,
    loftedCandidate: autonomous.filter((r) => r.loftedCandidateAt !== null).length,
    selected: autonomous.filter((r) => r.selectedAt !== null).length,
    autonomousLoftedRelease: autonomous.filter(
      (r) => r.classification === 'autonomous_lofted_release',
    ).length,
  },
  candidateAudit: {
    states: candidates.length,
    boundedMenuInvariant: candidates.every((r) => r.boundedMenuInvariant),
    boundedSceneInvariant: candidates.every((r) => r.boundedSceneInvariant),
    physicalBranches: candidates.reduce((n, r) => n + r.physical.length, 0),
    changedFullWorldWinners: candidates.flatMap((r) =>
      r.before.rankings
        .filter((p) => ['state-value-v1', 'phase-role-hybrid-v1'].includes(p.policy))
        .filter(
          (p) =>
            hash(p.actions[0]?.action) !==
            hash(r.after.rankings.find((q) => q.policy === p.policy).actions[0]?.action),
        )
        .map((p) => ({ input: r.inputPath, policy: p.policy })),
    ),
  },
  candidateBoundaries: loaded.candidateBoundaries.result.rows.map((r) => ({
    metres: r.metres,
    sample: r.sample,
    observed: !!r.observed,
    boundedOptions: r.boundedOptions.length,
    fullWorld: r.fullWorld.map((p) => ({ policy: p.policy, options: p.receiverOptions.length })),
    released: r.outcome.released,
    directTouch: r.outcome.directReceiverTouch,
    control: r.outcome.receiverControl,
  })),
  aerialControls: loaded.aerialControls.result.rows.map((r) => ({
    policy: r.policy,
    firstAction: r.events[0]?.afterAction?.type ?? null,
    contactHeight: r.events[0]?.contactHeight ?? null,
    outcome: r.outcome,
  })),
  profile: loaded.profile,
  fullMatches: matchRows,
  fullReplayCount: matchRows.filter((r) => r.fullReplay?.equivalent).length,
  measurementVersion: 'original-delivery-v3',
  failedMatches: allMatches
    .filter((r) => r.failure || r.status !== 'full_time')
    .map((r) => ({
      path: r.path,
      design: r.design,
      policy: r.policy,
      model: r.corrected ? 'combined' : 'baseline',
      seconds: r.seconds,
      failure: r.failure,
    })),
  canonicalReadiness: 'NOT READY',
  defaultPolicy: 'state-value-v1',
  independentConfirmation: 'sealed',
  probabilityQualification:
    'Unfitted historical claims, distinct direct-path events, no tuning; mirrors/seeds dependent; no independent real-football calibration.',
};
const text = JSON.stringify(value, null, 2) + '\n',
  path = 'docs/performance/pr197/summary.json';
if (check) {
  if (readFileSync(path, 'utf8') !== text) throw Error('PR197 summary drift');
} else writeFileSync(path, text);
console.log(
  'PR197 summary',
  matchRows.length,
  'completed matches',
  value.longPasses,
  value.autonomous,
);
