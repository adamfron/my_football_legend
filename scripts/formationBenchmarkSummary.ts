import { z } from 'zod';
import { funnelSummarySchema } from '../src/core/matchSimulation/attackingFunnel';
import { matchStatisticsSchema } from '../src/core/matchSimulation/playerMatchStats';

export const benchmarkResultSchema = z.object({
  key: z.string(),
  formation: z.string(),
  seed: z.string(),
  reversed: z.boolean(),
  fixtureHash: z.string(),
  initialStateHash: z.string(),
  stateHash: z.string(),
  finalStatus: z.string(),
  finalTime: z.number(),
  ticks: z.number(),
  wallMs: z.number(),
  score: z.object({ home: z.number(), away: z.number() }),
  statistics: matchStatisticsSchema.pick({
    players: true,
    playerTeams: true,
    teamAccounting: true,
    passingNetwork: true,
  }),
  // Baseline telemetry definitions are versioned; retain them rather than
  // pretending a V1 observation was collected by the corrected observer.
  funnel: funnelSummarySchema
    .extend({ version: z.union([z.literal(1), z.literal(2), z.literal(3)]) })
    .nullable(),
  finalDiagnostics: z.unknown(),
});
export type BenchmarkResult = z.infer<typeof benchmarkResultSchema>;
export const benchmarkFileSchema = z.object({
  manifest: z.object({
    commit: z.string(),
    engineHash: z.string(),
    benchmarkHash: z.string(),
    telemetryVersion: z.number(),
    fixedDt: z.number(),
    node: z.string(),
    config: z.object({
      mode: z.string(),
      minutes: z.number(),
      attributes: z.number(),
      opponentAttributes: z.number(),
      seeds: z.array(z.string()),
      anchor: z.string(),
      opponents: z.array(z.string()),
      observer: z.boolean(),
      normaliseDuties: z.boolean(),
      style: z.string(),
      traces: z.boolean(),
    }),
  }),
  expectedMatches: z.number(),
  completedMatches: z.number(),
  profiles: z.record(z.string(), z.unknown()),
  results: z.array(benchmarkResultSchema),
});
export type BenchmarkFile = z.infer<typeof benchmarkFileSchema>;

export const descriptive = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length;
  const mean = n ? sorted.reduce((a, b) => a + b, 0) / n : null;
  const sd = n > 1 ? Math.sqrt(sorted.reduce((a, b) => a + (b - mean!) ** 2, 0) / (n - 1)) : null;
  // Seed pairs, not two independent observations. Small-sample exploratory t interval.
  const critical =
    n <= 1
      ? null
      : [0, 0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201][
          Math.min(n, 12)
        ]!;
  const margin = sd === null || critical === null ? null : (critical * sd) / Math.sqrt(n);
  return {
    n,
    mean,
    median: n ? (sorted[Math.floor((n - 1) / 2)]! + sorted[Math.floor(n / 2)]!) / 2 : null,
    sd,
    exploratory95Interval: margin === null ? null : [mean! - margin, mean! + margin],
    values,
  };
};

export const teamMetrics = (r: BenchmarkResult, side: 'home' | 'away') => {
  const players = r.statistics.players.filter(
    (p) => r.statistics.playerTeams?.[p.playerId] === side,
  );
  const sum = (key: keyof (typeof players)[number]) =>
    players.reduce((a, p) => a + (typeof p[key] === 'number' ? (p[key] as number) : 0), 0);
  const e = r.funnel?.teams[side].events,
    s = r.funnel?.teams[side].stages,
    t = r.statistics.teamAccounting?.[side];
  const passes = sum('passesAttempted'),
    completed = sum('passesCompleted');
  return {
    goals: r.score[side],
    conceded: r.score[side === 'home' ? 'away' : 'home'],
    shots: sum('shots'),
    onTarget: sum('shotsOnTarget'),
    saves: sum('saves'),
    parries: sum('parries'),
    catches: sum('catches'),
    corners: t?.corners ?? 0,
    fouls: sum('fouls'),
    offsides: t?.offsides ?? 0,
    passes,
    completed,
    passCompletion: passes ? completed / passes : 0,
    possessionSeconds: t?.possessionSeconds ?? 0,
    tackles: sum('tacklesAttempted'),
    tackleWins: sum('tacklesWon'),
    interceptions: sum('interceptions'),
    recoveries: sum('looseBallRecoveries'),
    distance: sum('distanceCovered'),
    sprintDistance: sum('sprintDistance'),
    controlled: r.funnel?.teams[side].possessions ?? 0,
    advanced10: s?.advance_10 ?? 0,
    sustainedFinal: s?.sustained_final ?? 0,
    finalEntries: e?.final_entry ?? 0,
    boxEntries: e?.box_entry ?? 0,
    credible: s?.credible_position ?? 0,
    progressive: e?.progressive_pass ?? 0,
    progressiveCompleted: e?.progressive_completed ?? 0,
    behindReleaseLine: e?.received_behind_release_line ?? 0,
    backward: e?.backward_pass ?? 0,
    lateral: e?.lateral_pass ?? 0,
    through: e?.through_attempt ?? 0,
    throughCompleted: e?.through_completed ?? 0,
    strikerAttempts: e?.striker_pass_attempt ?? 0,
    strikerReceptions: r.funnel?.teams[side].roles.striker?.receptions ?? 0,
    firstTime: e?.first_time_pass ?? 0,
    sampledDecisions: e?.sampled_decisions ?? 0,
    shotCandidates: e?.sampled_shot_candidates ?? 0,
    executableShotSamples: e?.sampled_executable_shot ?? 0,
    shotFirst: e?.sampled_shot_ranked_first ?? 0,
    width: r.funnel?.teams[side].spatial.width?.mean ?? 0,
    depth: r.funnel?.teams[side].spatial.depth?.mean ?? 0,
    forwardLineGap: r.funnel?.teams[side].spatial.attacking_forward_line_gap?.mean ?? 0,
    targetDeviation: r.funnel?.teams[side].spatial.target_distance?.mean ?? 0,
    anchorDeviation: r.funnel?.teams[side].spatial.anchor_distance?.mean ?? 0,
    rotationSeconds: r.funnel?.teams[side].seconds.rotation_over360_low_progress ?? 0,
  };
};

export const summarizeBenchmark = (file: BenchmarkFile) => {
  if (new Set(file.results.map((r) => r.key)).size !== file.results.length)
    throw new Error('Duplicate match keys');
  const metrics = file.results.map((r) => ({
    key: r.key,
    formation: r.formation,
    seed: r.seed,
    reversed: r.reversed,
    status: r.finalStatus,
    anchor: teamMetrics(r, r.reversed ? 'away' : 'home'),
    opponent: teamMetrics(r, r.reversed ? 'home' : 'away'),
    msPerTick: r.wallMs / r.ticks,
  }));
  const formations = [...new Set(metrics.map((r) => r.formation))].map((formation) => {
    const rows = metrics.filter((r) => r.formation === formation);
    const keys = Object.keys(rows[0]!.anchor) as Array<keyof (typeof rows)[number]['anchor']>;
    const blocks = [...new Set(rows.map((r) => r.seed))].flatMap((seed) => {
      const pair = rows.filter((r) => r.seed === seed);
      if (pair.length !== 2 || pair.some((r) => r.status !== 'full_time')) return [];
      return [
        {
          seed,
          differences: Object.fromEntries(
            keys.map((k) => [k, pair.reduce((a, r) => a + r.anchor[k] - r.opponent[k], 0) / 2]),
          ) as Record<(typeof keys)[number], number>,
        },
      ];
    });
    return {
      formation,
      matches: rows.length,
      completedFullMatches: rows.filter((r) => r.status === 'full_time').length,
      anchorWDL: {
        wins: rows.filter((r) => r.status === 'full_time' && r.anchor.goals > r.opponent.goals)
          .length,
        draws: rows.filter((r) => r.status === 'full_time' && r.anchor.goals === r.opponent.goals)
          .length,
        losses: rows.filter((r) => r.status === 'full_time' && r.anchor.goals < r.opponent.goals)
          .length,
      },
      anchorMeans: Object.fromEntries(
        keys.map((k) => [k, descriptive(rows.map((r) => r.anchor[k])).mean]),
      ),
      opponentMeans: Object.fromEntries(
        keys.map((k) => [k, descriptive(rows.map((r) => r.opponent[k])).mean]),
      ),
      seedBlocks: blocks,
      paired: Object.fromEntries(
        keys.map((k) => [k, descriptive(blocks.map((b) => b.differences[k]))]),
      ),
    };
  });
  return {
    manifest: file.manifest,
    expectedMatches: file.expectedMatches,
    observedMatches: file.results.length,
    fullMatches: metrics.filter((r) => r.status === 'full_time').length,
    metrics,
    formations,
    performance: descriptive(metrics.map((r) => r.msPerTick)),
  };
};

/** Reject accidentally mixing revisions, seeds, protocols or profile identities when joining shards. */
export const joinBenchmarkShards = (files: BenchmarkFile[]): BenchmarkFile => {
  if (!files.length) throw new Error('No shards');
  const first = files[0]!;
  const invariant = (f: BenchmarkFile) =>
    JSON.stringify({ ...f.manifest, config: { ...f.manifest.config, opponents: [] } });
  if (files.some((f) => invariant(f) !== invariant(first)))
    throw new Error('Incompatible immutable shard manifests');
  const opponents = files.flatMap((f) => f.manifest.config.opponents);
  if (new Set(opponents).size !== opponents.length) throw new Error('Overlapping formation shards');
  return {
    ...first,
    manifest: { ...first.manifest, config: { ...first.manifest.config, opponents } },
    expectedMatches: files.reduce((a, f) => a + f.expectedMatches, 0),
    completedMatches: files.reduce((a, f) => a + f.completedMatches, 0),
    profiles: Object.assign({}, ...files.map((f) => f.profiles)),
    results: files.flatMap((f) => f.results),
  };
};

/** Extend an immutable experiment by disjoint seed blocks, preserving the pilot's observations. */
export const joinBenchmarkSeedBlocks = (files: BenchmarkFile[]): BenchmarkFile => {
  if (!files.length) throw new Error('No seed blocks');
  const first = files[0]!;
  const invariant = (f: BenchmarkFile) =>
    JSON.stringify({ ...f.manifest, config: { ...f.manifest.config, seeds: [] } });
  if (files.some((f) => invariant(f) !== invariant(first)))
    throw new Error('Incompatible immutable seed-block manifests');
  const seeds = files.flatMap((f) => f.manifest.config.seeds);
  if (new Set(seeds).size !== seeds.length) throw new Error('Overlapping seed blocks');
  const results = files.flatMap((f) => f.results);
  if (new Set(results.map((r) => r.key)).size !== results.length)
    throw new Error('Duplicate match keys');
  return {
    ...first,
    manifest: { ...first.manifest, config: { ...first.manifest.config, seeds } },
    expectedMatches: files.reduce((a, f) => a + f.expectedMatches, 0),
    completedMatches: files.reduce((a, f) => a + f.completedMatches, 0),
    profiles: Object.assign({}, ...files.map((f) => f.profiles)),
    results,
  };
};
