import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const options = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputDir = resolve(
  options.get('directory') || options.get('input-dir') || resolve(repository, '../benchmarks'),
);
const output = resolve(
  options.get('output') || resolve(repository, 'docs/performance/PR150-results.json'),
);
const timingComparable = options.get('timing-comparable') === 'true';
const roles = ['central_midfielder', 'left_back', 'striker'];
const scenarios = ['balanced-balanced', 'weak-strong'];
const minutes = [45, 90];
const sources = [];
const skippedSources = [];
const groups = new Map();
const sha = (value) => createHash('sha256').update(value).digest('hex');
const scalar = (value) => (Number.isFinite(value) ? value : null);
const round = (value, places = 4) =>
  Number.isFinite(value) ? Number(value.toFixed(places)) : null;
const roundMetrics = (value) => {
  if (typeof value === 'number') return round(value);
  if (Array.isArray(value)) return value.map(roundMetrics);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, roundMetrics(item)]),
    );
  return value;
};
const keyFor = (match, config) =>
  [
    match.scenario,
    match.seed,
    config.position || match.controlled?.position || 'unknown',
    config.minutes,
    match.repeat || 1,
    Boolean(config.replay),
  ].join('|');
const sum = (players, key) =>
  players?.length ? players.reduce((total, player) => total + (player[key] || 0), 0) : null;
const distribution = (players, key) => {
  if (!players?.length) return null;
  const values = players.map((player) => player[key] || 0).sort((a, b) => a - b);
  return {
    players: values.length,
    minimum: round(values[0]),
    median: round(
      values[Math.floor((values.length - 1) / 2)] / 2 + values[Math.floor(values.length / 2)] / 2,
    ),
    p95: round(values[Math.floor((values.length - 1) * 0.95)]),
    maximum: round(values.at(-1)),
    mean: round(values.reduce((a, b) => a + b, 0) / values.length),
  };
};

for (const filename of readdirSync(inputDir)
  .filter((file) => /^(before|after)-.*\.json$/.test(file))
  .sort()) {
  const stage = filename.startsWith('before-') ? 'before' : 'after';
  const raw = readFileSync(resolve(inputDir, filename), 'utf8');
  const report = JSON.parse(raw);
  if (!report.config || !Array.isArray(report.matches)) {
    skippedSources.push({ file: filename, reason: 'unsupported_report_shape' });
    continue;
  }
  const revisionFilter = options.get(`${stage}-revision`);
  if (revisionFilter && report.config.revision !== revisionFilter) {
    skippedSources.push({
      file: filename,
      reason: 'explicit_revision_filter',
      revision: report.config.revision,
    });
    continue;
  }
  const expectedMatches =
    report.config.scenarios.length * report.config.seeds.length * report.config.repeats;
  const extended =
    filename.includes('-intent-') || report.matches.some((match) => Boolean(match.decisions));
  sources.push({
    file: filename,
    stage,
    runner: extended ? 'benchmarkPr150' : 'benchmarkReadability',
    sha256: sha(raw),
    revision: report.config.revision,
    requestedMinutes: report.config.minutes,
    role: report.config.position,
    requestedScenarios: report.config.scenarios,
    requestedSeeds: report.config.seeds,
    replay: report.config.replay,
    matches: report.matches.length,
    expectedMatches,
    sourceComplete: report.matches.length === expectedMatches,
  });
  for (const match of report.matches) {
    const key = keyFor(match, report.config);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        fixture: {
          scenario: match.scenario,
          seed: match.seed,
          position: report.config.position || match.controlled?.position,
          requestedMinutes: report.config.minutes,
          repeat: match.repeat || 1,
          replay: Boolean(report.config.replay),
        },
        before: [],
        after: [],
      };
      groups.set(key, group);
    }
    const previous = group[stage][0];
    if (
      previous &&
      (previous.match.hashes?.state !== match.hashes?.state ||
        previous.match.hashes?.statistics !== match.hashes?.statistics)
    )
      throw new Error(
        `Conflicting ${stage} canonical outputs for ${key}: ${previous.filename} and ${filename}. Select the exact frozen revision with --${stage}-revision; do not silently choose a result.`,
      );
    group[stage].push({ filename, config: report.config, match, extended });
  }
}

const normalize = (runs, stage) => {
  if (!runs.length) return null;
  const run = [...runs].sort(
    (a, b) =>
      Number(b.extended) - Number(a.extended) ||
      Number(Boolean(b.match.receptionMotion)) - Number(Boolean(a.match.receptionMotion)) ||
      a.filename.localeCompare(b.filename),
  )[0];
  const match = run.match;
  const players = match.players;
  const controlled = match.controlled;
  const failureNames = Object.entries(match.invariants || {})
    .filter(([, value]) => value === false)
    .map(([name]) => name);
  const teams = {};
  for (const team of ['home', 'away']) {
    const members = players?.filter((player) => player.team === team);
    const centre = match.centre?.[team] || {};
    teams[team] = {
      goals: scalar(centre.goals),
      passesAttempted: scalar(centre.passesAttempted),
      passesCompleted: scalar(centre.passesCompleted),
      passesReceived: scalar(centre.passesReceived ?? sum(members, 'passesReceived')),
      touches: scalar(centre.touches ?? sum(members, 'touches')),
      carries: scalar(centre.carries ?? sum(members, 'carries')),
      shots: scalar(centre.shots),
      shotsOnTarget: scalar(centre.shotsOnTarget),
      fouls: scalar(centre.fouls),
      yellowCards: scalar(centre.yellowCards),
      redCards: scalar(centre.redCards),
      offsides: scalar(centre.offsides),
      throwIns: scalar(centre.throwIns),
      corners: scalar(centre.corners),
      freeKicks: scalar(centre.freeKicks),
      possessionPercentage: round(centre.possessionPercentage),
      possessionSeconds: round(match.possessionSeconds?.[team]),
      sprintDistanceMetres: round(sum(members, 'sprintDistance')),
      sprintBursts: scalar(sum(members, 'sprintBursts')),
      playerDistributions: {
        touches: distribution(members, 'touches'),
        passesAttempted: distribution(members, 'passesAttempted'),
        passesReceived: distribution(members, 'passesReceived'),
        carries: distribution(members, 'carries'),
        sprintDistanceMetres: distribution(members, 'sprintDistance'),
      },
    };
  }
  const decisions = match.decisions || {
    promptsShown: null,
    per45Minutes: null,
    per90Minutes: null,
    presentedEpisodes: null,
    perPresentedEpisode: null,
    perControlledTouchEpisode: null,
  };
  const normalized = {
    revision: run.config.revision,
    primarySource: run.filename,
    runner: run.extended ? 'benchmarkPr150' : 'benchmarkReadability',
    canonicalMinutes: round(match.canonicalMinutes),
    status: match.status,
    score: match.score,
    touchDefinition:
      stage === 'before' ? 'PR149_granular_discrete_contacts' : 'PR150_continuous_control_episodes',
    total: {
      passesAttempted: match.passes?.attempted ?? null,
      passesCompleted: match.passes?.completed ?? null,
      passesReceived: match.passes?.received ?? null,
      touches: match.touches ?? null,
      carries: match.carries ?? sum(players, 'carries'),
      shots: match.shots ?? null,
      shotsOnTarget: match.shotsOnTarget ?? null,
      fouls: match.fouls ?? null,
      yellowCards: match.yellowCards ?? null,
      redCards: match.redCards ?? null,
      distanceMetres: round(match.distanceMetres),
      sprintDistanceMetres: round(
        match.movement?.sprintDistanceMetres ?? sum(players, 'sprintDistance'),
      ),
      sprintBursts: match.movement?.sprintBursts ?? sum(players, 'sprintBursts'),
    },
    teams,
    controlled: controlled
      ? Object.fromEntries(
          Object.entries(controlled)
            .filter(([key]) => !['receptions', 'passContacts'].includes(key))
            .map(([key, value]) => [key, typeof value === 'number' ? round(value) : value]),
        )
      : null,
    controlledReceptions: controlled?.receptions || null,
    controlledPassContacts: controlled?.passContacts || null,
    decisions: roundMetrics(decisions),
    agency: match.agency || null,
    receptions: match.receptions || null,
    receptionQuality: roundMetrics(match.qualityScores || null),
    receptionMotion: roundMetrics(match.receptionMotion || null),
    receptionMotionAvailability: match.receptionMotion
      ? 'observed_tick_velocity_and_optional_canonical_retention'
      : 'not_captured_in_this_source',
    network: {
      edges: match.network?.edges ?? null,
      violatingEdges: match.network?.completedExceedsAttempted?.length ?? null,
      selfEdges: match.network?.selfEdges?.length ?? null,
      invariantFailures: failureNames.filter((name) => name.startsWith('network')),
    },
    invariantFailures: failureNames,
    performance: {
      elapsedMs: round(match.performance?.elapsedMs, 2),
      canonicalSpeed: round(match.performance?.canonicalSpeed, 2),
      rendererCallsBackground: match.performance?.rendererCallsBackground ?? null,
      ticks: match.performance?.ticks ?? null,
      heapUsedDeltaBytes: match.performance?.heapUsedDeltaBytes ?? null,
      rssDeltaBytes: match.performance?.rssDeltaBytes ?? null,
    },
    allMeasurements: runs.map(({ filename, extended, match: measured }) => ({
      source: filename,
      runner: extended ? 'benchmarkPr150' : 'benchmarkReadability',
      elapsedMs: round(measured.performance?.elapsedMs, 2),
      canonicalSpeed: round(measured.performance?.canonicalSpeed, 2),
    })),
    hashes: match.hashes || null,
  };
  return normalized;
};
const delta = (before, after) =>
  before !== null && after !== null && Number.isFinite(before) && Number.isFinite(after)
    ? round(after - before)
    : null;
const fixtures = [...groups.values()]
  .sort((a, b) => a.key.localeCompare(b.key))
  .map((group) => {
    const before = normalize(group.before, 'before');
    const after = normalize(group.after, 'after');
    return {
      ...group.fixture,
      before,
      after,
      comparison:
        before && after
          ? {
              passesAttemptedDelta: delta(
                before.total.passesAttempted,
                after.total.passesAttempted,
              ),
              passesCompletedDelta: delta(
                before.total.passesCompleted,
                after.total.passesCompleted,
              ),
              touchesDeltaDifferentDefinitions: delta(before.total.touches, after.total.touches),
              shotsDelta: delta(before.total.shots, after.total.shots),
              decisionPromptsDelta: delta(
                before.decisions.promptsShown,
                after.decisions.promptsShown,
              ),
              controlledPassShareDelta: delta(
                before.controlled?.passShare ?? null,
                after.controlled?.passShare ?? null,
              ),
              controlledTouchShareDeltaDifferentDefinitions: delta(
                before.controlled?.touchShare ?? null,
                after.controlled?.touchShare ?? null,
              ),
              elapsedRatio:
                timingComparable &&
                before.runner === after.runner &&
                before.performance.elapsedMs > 0
                  ? round(after.performance.elapsedMs / before.performance.elapsedMs)
                  : null,
              timingComparable: timingComparable && before.runner === after.runner,
            }
          : null,
    };
  });

const missing = { before: [], after: [] };
for (const stage of ['before', 'after'])
  for (const scenario of scenarios)
    for (const position of roles)
      for (const requestedMinutes of minutes)
        if (
          !fixtures.some(
            (fixture) =>
              fixture[stage] &&
              !fixture.replay &&
              fixture.repeat === 1 &&
              fixture.scenario === scenario &&
              fixture.position === position &&
              fixture.requestedMinutes === requestedMinutes &&
              fixture.seed.endsWith(':a'),
          )
        )
          missing[stage].push({ scenario, position, requestedMinutes, seed: 'a' });
const anomalies = [];
for (const fixture of fixtures) {
  for (const stage of ['before', 'after']) {
    const result = fixture[stage];
    if (!result) continue;
    const issues = [];
    if (result.invariantFailures.length) issues.push('invariant_failures');
    if (result.teams.home.throwIns === 0 && result.teams.away.throwIns === 0)
      issues.push('zero_throw_ins');
    if (result.teams.home.offsides === 0 && result.teams.away.offsides === 0)
      issues.push('zero_offsides');
    if (result.total.shots !== null && result.total.shots <= 3)
      issues.push('low_shot_sample_3_or_fewer');
    if (result.controlled?.sprintBursts === 0)
      issues.push('controlled_zero_sprint_bursts_under_dev_policy');
    if (result.controlled?.passesReceived === 0)
      issues.push('controlled_zero_completed_receptions');
    if (result.controlled?.touchShare > 0.2) issues.push('controlled_touch_share_above_20_percent');
    if (issues.length)
      anomalies.push({
        stage,
        scenario: fixture.scenario,
        position: fixture.position,
        requestedMinutes: fixture.requestedMinutes,
        seed: fixture.seed,
        repeat: fixture.repeat,
        replay: fixture.replay,
        issues,
      });
  }
}
const parityGroups = new Map();
for (const fixture of fixtures)
  for (const stage of ['before', 'after']) {
    const result = fixture[stage];
    if (!result) continue;
    const key = [
      stage,
      result.revision,
      fixture.scenario,
      fixture.seed,
      fixture.position,
      fixture.requestedMinutes,
    ].join('|');
    const entries = parityGroups.get(key) || [];
    entries.push({ repeat: fixture.repeat, replay: fixture.replay, hashes: result.hashes });
    parityGroups.set(key, entries);
  }
const determinismEvidence = [...parityGroups]
  .filter(([, entries]) => entries.length > 1)
  .map(([fixture, entries]) => ({
    fixture,
    variants: entries.map(({ repeat, replay }) => ({ repeat, replay })),
    stateHashesEqual: new Set(entries.map((entry) => entry.hashes?.state)).size === 1,
    statisticsHashesEqual: new Set(entries.map((entry) => entry.hashes?.statistics)).size === 1,
  }));
const report = {
  schemaVersion: 1,
  methodology: {
    fixtureFactory: 'existing_createCalibrationSession',
    fixedDtSeconds: 0.025,
    primaryInputPolicy: 'explicit_dev_ai_selection_at_exact_tick_boundary',
    decisions:
      'Counts explicit DEV opportunity resolutions; does not count React menu render events.',
    presentedEpisodes:
      'Existing canonical moment clustering sampled at 4 Hz and every decision, filtered by key_player; excludes UI lead-in/window/proxy/abort execution.',
    touches:
      'PR149 discrete contact totals and PR150 public continuous-control totals intentionally have different definitions.',
    receptionMomentum:
      'Optional canonical retention metadata is available only in PR150; velocities are pre/post tick snapshots, not exact physical-contact substeps. Old reports may omit these fields.',
    rendererCalls:
      'Zero by construction in this headless harness; independent observer/render/replay parity checks are required.',
    timingComparable,
    timingNote: timingComparable
      ? 'Only matching runner instrumentation is compared. Serial isolated execution is an external requirement.'
      : 'Raw timings retained; ratios suppressed because task/test concurrency and/or instrument differences prevent a controlled timing claim.',
    anomalies:
      'Descriptive flags identify suspicious samples; thresholds are reporting labels and never football quotas.',
    missingValues: 'Null means not captured or unavailable, never zero.',
    precision:
      'Reported rates, quality and velocity summaries are rounded to four decimal places; elapsed time and canonical speed to two. Canonical fingerprints retain full precision.',
  },
  coverage: {
    requiredSeedAMatrix: 12,
    beforeComplete: missing.before.length === 0,
    afterComplete: missing.after.length === 0,
    missing,
    incompleteSources: sources
      .filter((source) => !source.sourceComplete)
      .map((source) => source.file),
    comparableFixtures: fixtures.filter((fixture) => fixture.before && fixture.after).length,
    allFixtureRows: fixtures.length,
  },
  sources,
  skippedSources,
  determinismEvidence,
  anomalies,
  fixtures,
};
if (options.get('write') === 'true') {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report) + '\n');
}
process.stdout.write(
  JSON.stringify(
    {
      output: options.get('write') === 'true' ? output : null,
      sources: sources.length,
      fixtures: fixtures.length,
      comparableFixtures: report.coverage.comparableFixtures,
      coverage: report.coverage,
      anomalies: anomalies.length,
      bytes: Buffer.byteLength(JSON.stringify(report)),
      determinismEvidence,
    },
    null,
    2,
  ) + '\n',
);
