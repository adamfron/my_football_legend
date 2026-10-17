/* global console */
import process from 'node:process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const argument = (key) =>
  process.argv.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3);
const input = resolve(argument('input-dir') ?? '../pr171-full');
const receiptPrefix = argument('receipt-prefix') ?? 'PR171';
if (!/^PR\d+(-after)?$/.test(receiptPrefix)) throw new Error('Invalid receipt prefix');
const minimumMatches = Number(argument('minimum-matches') ?? 14);
if (!Number.isInteger(minimumMatches) || minimumMatches < 1) throw new Error('Invalid minimum');
const paths = readdirSync(input)
  .filter((p) => p.startsWith('cohort-') && p.endsWith('.json'))
  .sort();
if (paths.length < minimumMatches && !process.argv.includes('--partial'))
  throw new Error(
    `Expected ${minimumMatches} completed/censored main-cohort receipts, found ${paths.length}`,
  );
const all = paths.map((path) => ({
  path,
  bytes: readFileSync(resolve(input, path)),
  ...JSON.parse(readFileSync(resolve(input, path), 'utf8')),
}));
const raw = all.filter((r) => r.observed.status === 'full_time');
const censored = all
  .filter((r) => r.observed.status !== 'full_time')
  .map((r) => ({
    fixture: r.fixture,
    status: r.observed.status,
    time: r.observed.time,
    finalStateHash: r.observed.finalStateHash,
    officialPrefixOnly: r.observed.official,
    manifest: r.manifest,
  }));
const mean = (xs) => xs.reduce((n, x) => n + x, 0) / xs.length;
const quantile = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b),
    i = (s.length - 1) * p,
    a = Math.floor(i);
  return s[a] + (s[Math.ceil(i)] - s[a]) * (i - a);
};
export const distribution = (values) =>
  values.length
    ? {
        n: values.length,
        mean: mean(values),
        median: quantile(values, 0.5),
        p10: quantile(values, 0.1),
        p90: quantile(values, 0.9),
        min: Math.min(...values),
        max: Math.max(...values),
        sd: Math.sqrt(mean(values.map((v) => (v - mean(values)) ** 2))),
      }
    : null;
const sumMaps = (maps) => {
  const result = {};
  for (const map of maps)
    for (const [key, value] of Object.entries(map ?? {})) result[key] = (result[key] ?? 0) + value;
  return result;
};
const save = (name, payload) =>
  writeFileSync(`docs/performance/${receiptPrefix}-${name}.json`, JSON.stringify(payload, null, 2));
const teamRows = [],
  funnelRows = [],
  midfieldRows = [];
const fixtureRows = raw.map((r) => {
  const s = r.observed;
  if (s.status !== 'full_time')
    throw new Error('Censored fixture must not enter full-match distribution');
  const audit = s.attacking.audit;
  for (const side of ['home', 'away']) {
    const counters = sumMaps(
      Object.entries(audit.periods)
        .filter(([k]) => k.startsWith(side))
        .map(([, v]) => v),
    );
    const own = s.statistics.players.filter((p) => s.statistics.playerTeams[p.playerId] === side);
    const liveMinutes = counters.liveSeconds / 60;
    const team = {
      fixture: r.fixture.family,
      reversed: r.fixture.reversed,
      side,
      ...s.official[side],
      accounting: s.statistics.teamAccounting[side],
      counters,
      per90ElapsedPasses: (s.official[side].passesAttempted * 5400) / s.time,
      per90ElapsedShots: (s.official[side].shots * 5400) / s.time,
      passesPerLiveMinute: liveMinutes ? s.official[side].passesAttempted / liveMinutes : null,
      passesPerControlledSequence: s.official[side].passesAttempted / counters.possessions,
      roleGroups: {},
    };
    for (const p of own) {
      const role = s.roles[p.playerId]?.position ?? 'unknown';
      const group = (team.roleGroups[role] ??= {
        players: 0,
        minutes: 0,
        passesAttempted: 0,
        passesReceived: 0,
        controlEpisodes: 0,
        shots: 0,
      });
      group.players++;
      group.minutes += p.minutesPlayed;
      group.passesAttempted += p.passesAttempted;
      group.passesReceived += p.passesReceived;
      group.controlEpisodes += p.touches;
      group.shots += p.shots;
      if (role === 'central_midfielder')
        midfieldRows.push({
          fixture: r.fixture.family,
          reversed: r.fixture.reversed,
          side,
          playerId: p.playerId,
          ...p,
          exposure: audit.players[p.playerId] ?? {},
          receptionsPer90Active: p.minutesPlayed ? (p.passesReceived * 90) / p.minutesPlayed : null,
          shareOfOwnTeamAttempts: s.official[side].passesAttempted
            ? p.passesReceived / s.official[side].passesAttempted
            : null,
          shareOfTeamCompletions: s.official[side].passesCompleted
            ? p.passesReceived / s.official[side].passesCompleted
            : null,
        });
    }
    teamRows.push(team);
    funnelRows.push({
      fixture: r.fixture.family,
      reversed: r.fixture.reversed,
      side,
      ...s.attacking.teams[side],
      counters,
      possessionHistograms: Object.fromEntries(
        Object.entries(audit.possessionHistograms).filter(([k]) => k.startsWith(side)),
      ),
    });
  }
  const compactStatistics = (value) =>
    value
      ? {
          players: value.players,
          teamAccounting: value.teamAccounting,
          passingNetwork: value.passingNetwork,
        }
      : null;
  return {
    fixture: r.fixture,
    manifest: r.manifest,
    rawSha256: createHash('sha256').update(r.bytes).digest('hex'),
    status: s.status,
    time: s.time,
    ticks: s.ticks,
    score: s.score,
    wallMs: s.wallMs,
    observerMs: s.observerMs,
    initialStateHash: s.initialStateHash,
    finalStateHash: s.finalStateHash,
    decisionIndex: s.decisionIndex,
    official: s.official,
    reconciliation: s.reconciliation,
    statistics: compactStatistics(s.statistics),
    roles: s.roles,
    halfTime: s.halfTime
      ? { ...s.halfTime, statistics: compactStatistics(s.halfTime.statistics) }
      : null,
    periods: s.attacking.audit.periods,
    memory: s.memory,
  };
});
const metrics = [
  'passesAttempted',
  'passesCompleted',
  'completionPercentage',
  'shots',
  'shotsOnTarget',
  'goals',
  'blockedShots',
  'corners',
  'possessionPercentage',
  'passesPerLiveMinute',
  'passesPerControlledSequence',
  'per90ElapsedPasses',
  'per90ElapsedShots',
];
const summary = Object.fromEntries(
  metrics.map((k) => [
    k,
    distribution(teamRows.map((r) => r[k]).filter((v) => typeof v === 'number')),
  ]),
);
const pairedClusterMeans = metrics.map((k) => {
  const means = [...new Set(teamRows.map((r) => r.fixture))].map((f) =>
    mean(
      teamRows
        .filter((r) => r.fixture === f)
        .map((r) => r[k])
        .filter((v) => typeof v === 'number'),
    ),
  );
  const d = distribution(means);
  const critical =
    { 2: 12.706, 3: 4.303, 4: 3.182, 5: 2.776, 6: 2.571, 7: 2.447, 8: 2.365, 9: 2.306, 10: 2.262 }[
      means.length
    ] ?? 1.96;
  const halfWidth = d && means.length > 1 ? (critical * d.sd) / Math.sqrt(means.length - 1) : null;
  return [
    k,
    {
      independentDesignBlocks: means.length,
      blockMeans: means,
      exploratoryMean95TInterval:
        d && halfWidth !== null ? [d.mean - halfWidth, d.mean + halfWidth] : null,
      warning:
        'Selected fixture/seed blocks, mirrored games dependent. Interval describes this design; not a random league sample or U-17 population interval. Sample SD and t critical by block count.',
    },
  ];
});
save('baseline', {
  version: 1,
  fullMatches: fixtureRows.length,
  independentDesignBlocks: new Set(teamRows.map((r) => r.fixture)).size,
  censored,
  definition:
    'Team distributions include both teams. Per90Elapsed uses final canonical seconds including stoppages and added time. Repeated orientations are dependent.',
  summary,
  uncertainty: Object.fromEntries(pairedClusterMeans),
  totalWallMs: fixtureRows.reduce((n, r) => n + r.wallMs, 0),
  fixtures: fixtureRows,
  teamRows,
});
save('attacking-funnel', {
  version: 1,
  definition:
    'Existing PR162 v3 stage meanings retained. Audit counters/histograms are opt-in. Sampled rankings are neither every canonical decision nor actual selection records. Histogram terminal bins are >=64 passes and >=600 seconds.',
  rows: funnelRows,
  traces: raw.map((r) => ({
    fixture: r.fixture,
    possessions: r.observed.attacking.possessions.slice(0, 8),
    decisions: r.observed.attacking.audit.samples.slice(0, 8),
    shots: r.observed.attacking.audit.shotResolutions,
    continuation: r.observed.continuation,
  })),
});
save('midfield-connectivity', {
  version: 1,
  definition:
    'One row per actual CM participant. Denominators separate team attempts, completed receptions, active playing minutes and sampled teammate-owner states. A credibleGenerated sample is a forecast (lane=0, lateness<0.3, expectedCompletion>0.5), not proof of realised availability or selection.',
  players: midfieldRows,
  passing: raw.map((r) => ({
    fixture: r.fixture,
    ...r.observed.passing,
    centralOptions: r.observed.passing.centralOptions.slice(-12),
    sequences: r.observed.passing.sequences.slice(-8),
  })),
});
const reference = JSON.parse(readFileSync('docs/performance/PR171-reference-comparison.json'));
reference.distributions = Object.fromEntries(
  [
    'passesWithoutCrosses',
    'completedWithoutCrosses',
    'shots',
    'shotsOnTargetConservative',
    'goalsFromShots',
    'corners',
  ].map((key) => [key, distribution(reference.rows.flatMap((r) => r.teams.map((t) => t[key])))]),
);
save('reference-comparison', reference);
console.log(
  JSON.stringify(
    { matches: fixtureRows.length, summary, reference: reference.distributions },
    null,
    2,
  ),
);
