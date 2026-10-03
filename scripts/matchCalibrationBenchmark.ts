import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PlayerPosition, WorldDatabase } from '../src/types/domain';
import { createSingleMatchSession, type SingleMatchSession } from '../src/core/singleMatch';
import { createDefensiveCounters } from '../src/core/matchSimulation/defensiveChallenges';
import {
  agencySessionMetricsSchema,
  PlayerAgencyTracker,
} from '../src/core/matchSimulation/playerAgency';
import {
  projectPlayerAgency,
  resolveDevPlayerDecision,
} from '../src/core/matchSimulation/playerDecision';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { percentile } from '../src/core/matchSimulation/backgroundPerformance';
import { canonicalHash, stableStringify } from './performanceBenchmark';

const metric = z.number().nonnegative();
/** Raw counts and per-90 rates have the same names; only distance values use metres. */
export const calibrationMetricsSchema = z.object({
  defensiveOpportunities: metric,
  attemptedChallenges: metric,
  cleanWins: metric,
  looseBalls: metric,
  attackerBeatsDefender: metric,
  missedChallenges: metric,
  fouls: metric,
  yellowCards: metric,
  redCards: metric,
  secondYellowReds: metric,
  straightReds: metric,
  penalties: metric,
  advantagePlayed: metric,
  advantageRecalled: metric,
  slides: metric,
  tacticalFoulIntents: metric,
  highRiskIntents: metric,
  passesAttempted: metric,
  passesCompleted: metric,
  touches: metric,
  carries: metric,
  interceptions: metric,
  possessionChanges: metric,
  shots: metric,
  shotsOnTarget: metric,
  goals: metric,
  distanceMetres: metric,
  sprintDistanceMetres: metric,
  sprintEpisodes: metric,
});
export type CalibrationMetrics = z.infer<typeof calibrationMetricsSchema>;
export const calibrationScenarioSchema = z.enum([
  'balanced-balanced',
  'weak-strong',
  'aggressive-defenders',
]);
export type CalibrationScenario = z.infer<typeof calibrationScenarioSchema>;
export const calibrationBenchmarkConfigSchema = z.object({
  canonicalMinutes: z.number().positive().max(90).default(45),
  batchTicks: z.number().int().positive().max(5000).default(800),
});
export const calibrationPlayerSchema = z.object({
  playerId: z.string(),
  team: z.enum(['home', 'away']),
  position: z.string(),
  controlled: z.boolean(),
  sentOff: z.boolean(),
  minutesPlayed: z.number().nonnegative(),
  possessionSeconds: z.number().nonnegative().optional(),
  tacticalFouls: z.number().int().nonnegative().optional(),
  tacticalFoulsPer90: z.number().nonnegative().optional(),
  raw: calibrationMetricsSchema,
  per90: calibrationMetricsSchema,
});
export const calibrationMatchResultSchema = z.object({
  scenario: calibrationScenarioSchema,
  seed: z.string(),
  configurationHash: z.string().length(64),
  requestedMinutes: z.number().positive(),
  canonicalMinutes: z.number().nonnegative(),
  status: z.string(),
  controlledPosition: z.string(),
  controlledPossessionSeconds: z.number().nonnegative().optional(),
  tacticalFouls: z.number().int().nonnegative().optional(),
  tacticalFoulsPer90: z.number().nonnegative().optional(),
  terminationReason: z.string().optional(),
  score: z.object({ home: z.number().int().nonnegative(), away: z.number().int().nonnegative() }),
  raw: calibrationMetricsSchema,
  per90: calibrationMetricsSchema,
  players: z.array(calibrationPlayerSchema),
  passingNetwork: z.object({
    maximumDirectedAttempts: z.number().int().nonnegative(),
    maximumPairAttempts: z.number().int().nonnegative(),
    topPairShare: z.number().nonnegative(),
  }),
  agency: agencySessionMetricsSchema,
  performance: z.object({
    elapsedMs: z.number().nonnegative(),
    ticks: z.number().int().nonnegative(),
    canonicalSpeed: z.number().nonnegative(),
    estimatedHidden90Seconds: z.number().nonnegative(),
    batchP50Ms: z.number().nonnegative(),
    batchP95Ms: z.number().nonnegative(),
    rendererCallsBackground: z.literal(0),
  }),
  hashes: z.object({
    canonicalState: z.string().length(64),
    statistics: z.string().length(64),
    canonicalEventSequence: z.string().length(64),
  }),
});
export type CalibrationMatchResult = z.infer<typeof calibrationMatchResultSchema>;
export const calibrationDistributionSchema = z.object({
  samples: z.number().int().nonnegative(),
  minimum: metric,
  p25: metric,
  median: metric,
  p75: metric,
  maximum: metric,
  mean: metric,
});
export const calibrationReportSchema = z.object({
  schemaVersion: z.literal(1),
  inputPolicy: z.literal('explicit_dev_ai_selection_at_exact_tick_boundary'),
  fixedDt: z.literal(0.025),
  distanceUnit: z.literal('metres'),
  config: calibrationBenchmarkConfigSchema,
  revision: z.string(),
  matches: z.array(calibrationMatchResultSchema),
  failures: z.array(
    z.object({ scenario: calibrationScenarioSchema, seed: z.string(), error: z.string() }),
  ),
  distributions: z.object({
    raw: z.record(z.string(), calibrationDistributionSchema),
    per90: z.record(z.string(), calibrationDistributionSchema),
    playerRaw: z.record(z.string(), calibrationDistributionSchema),
    outfieldPlayerPer90: z.record(z.string(), calibrationDistributionSchema),
    decisionsPer90: calibrationDistributionSchema,
    byScenario: z.record(
      z.string(),
      z.object({
        matches: z.number().int().nonnegative(),
        raw: z.record(z.string(), calibrationDistributionSchema),
        per90: z.record(z.string(), calibrationDistributionSchema),
        decisionsPer90: calibrationDistributionSchema,
      }),
    ),
  }),
});

const emptyMetrics = (): CalibrationMetrics =>
  Object.fromEntries(
    Object.keys(calibrationMetricsSchema.shape).map((name) => [name, 0]),
  ) as CalibrationMetrics;
const per90 = (raw: CalibrationMetrics, minutes: number): CalibrationMetrics =>
  Object.fromEntries(
    Object.entries(raw).map(([name, value]) => [name, minutes > 0 ? (value * 90) / minutes : 0]),
  ) as CalibrationMetrics;

/** Club indices are the existing canonical benchmark fixture identities, not tuned outcomes. */
export const createCalibrationSession = (
  world: WorldDatabase,
  scenario: CalibrationScenario,
  seedSuffix: string,
  controlledPosition: PlayerPosition = scenario === 'weak-strong'
    ? 'striker'
    : scenario === 'aggressive-defenders'
      ? 'left_back'
      : 'central_midfielder',
): SingleMatchSession => {
  const [homeIndex, awayIndex] = scenario === 'weak-strong' ? [63, 0] : [0, 1];
  const spectator = createSingleMatchSession(world, {
    homeClubId: world.clubs[homeIndex]!.id,
    awayClubId: world.clubs[awayIndex]!.id,
    seed: `pr148:${scenario}:${seedSuffix}`,
    control: { mode: 'spectator' },
  });
  const player =
    spectator.home.players.find((entry) => entry.profile.primaryPosition === controlledPosition) ??
    spectator.home.players.find((entry) => entry.profile.primaryPosition !== 'goalkeeper')!;
  const session = createSingleMatchSession(world, {
    ...spectator.setup,
    control: {
      mode: 'player',
      clubId: spectator.home.club.id,
      footballerId: player.footballerId,
      forceIntoXI: false,
    },
  });
  if (scenario !== 'aggressive-defenders') return session;
  return {
    ...session,
    away: {
      ...session.away,
      players: session.away.players.map((entry) =>
        entry.profile.primaryPosition === 'goalkeeper'
          ? entry
          : {
              ...entry,
              profile: {
                ...entry.profile,
                attributes: { ...entry.profile.attributes, aggression: 95, composure: 35 },
              },
            },
      ),
    },
  };
};

/** Observers collect changed evidence only and never participate in football decisions. */
export const runCalibrationBenchmark = (
  session: SingleMatchSession,
  scenario: CalibrationScenario,
  input: z.input<typeof calibrationBenchmarkConfigSchema> = {},
): CalibrationMatchResult => {
  const config = calibrationBenchmarkConfigSchema.parse(input);
  let state = createTacticalMatch(session);
  const initialPlayers = state.players;
  const agency = new PlayerAgencyTracker();
  const eventHash = createHash('sha256');
  const possessionChangesByPlayer = new Map<string, number>();
  const possessionSecondsByPlayer = new Map<string, number>();
  const tacticalFoulsByPlayer = new Map<string, number>();
  let possessionChanges = 0;
  let lastPossessionKey = '';
  let lastActionEventId = '';
  let lastFoulId = '';
  let ticks = 0;
  const batches: number[] = [];
  const targetSeconds = config.canonicalMinutes * 60;
  const complete = () =>
    state.status === 'abandoned' ||
    (state.time + 1e-7 >= targetSeconds &&
      (targetSeconds !== 2700 || state.status === 'half_time') &&
      (targetSeconds !== 5400 || state.status === 'full_time'));
  const observe = (next: TacticalMatchState) => {
    if (next.lastFoul && next.lastFoul.id !== lastFoulId) {
      if (next.lastFoul.tactical)
        tacticalFoulsByPlayer.set(
          next.lastFoul.actorId,
          (tacticalFoulsByPlayer.get(next.lastFoul.actorId) ?? 0) + 1,
        );
      lastFoulId = next.lastFoul.id;
    }
    if (state.ball.ownerId && next.time > state.time) {
      possessionSecondsByPlayer.set(
        state.ball.ownerId,
        (possessionSecondsByPlayer.get(state.ball.ownerId) ?? 0) + next.time - state.time,
      );
    }
    const latest = next.actionEvents?.at(-1);
    if (latest && latest.id !== lastActionEventId) {
      const retained = next.actionEvents ?? [];
      const start = lastActionEventId
        ? retained.findIndex((event) => event.id === lastActionEventId) + 1
        : 0;
      for (const event of retained.slice(Math.max(0, start)))
        eventHash.update(stableStringify(event) + '\n');
      lastActionEventId = latest.id;
    }
    const change = next.lastPossessionChange;
    const key = change ? `${change.at}:${change.from}:${change.to}:${change.cause}` : '';
    if (change && key !== lastPossessionKey) {
      possessionChanges++;
      if (next.ball.ownerId)
        possessionChangesByPlayer.set(
          next.ball.ownerId,
          (possessionChangesByPlayer.get(next.ball.ownerId) ?? 0) + 1,
        );
      lastPossessionKey = key;
    }
    state = next;
  };
  while (!complete()) {
    const batchStarted = performance.now();
    for (let local = 0; local < config.batchTicks && !complete(); local++) {
      if (state.status === 'half_time') observe(startSecondHalf(state));
      if (state.status === 'full_time') throw new Error('Match ended before benchmark target');
      const evaluation = projectPlayerAgency(state);
      agency.observe(state, evaluation);
      if (evaluation.opportunity)
        observe(resolveDevPlayerDecision(state, evaluation.opportunity).state);
      if (complete()) break;
      observe(stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT));
      ticks++;
      if (ticks > Math.ceil(targetSeconds / FIXED_MATCH_DT) + 10_000)
        throw new Error('Canonical clock stopped advancing');
    }
    batches.push(performance.now() - batchStarted);
  }
  const players = (state.statistics?.players ?? []).map((stats) => {
    const player = initialPlayers.find((entry) => entry.id === stats.playerId)!;
    const d = state.defensiveTelemetry?.byPlayer[stats.playerId] ?? createDefensiveCounters();
    const raw: CalibrationMetrics = {
      defensiveOpportunities: d.opportunities,
      attemptedChallenges: d.attempted,
      cleanWins: d.cleanWins,
      looseBalls: d.looseBalls,
      attackerBeatsDefender: d.beaten,
      missedChallenges: d.missed,
      fouls: d.fouls,
      yellowCards: d.yellowCards,
      redCards: d.redCards,
      secondYellowReds: d.secondYellowDismissals,
      straightReds: d.straightReds,
      penalties: d.penalties,
      advantagePlayed: d.advantagePlayed,
      advantageRecalled: d.advantageRecalled,
      slides: d.slides,
      tacticalFoulIntents: d.tacticalIntents,
      highRiskIntents: d.highRiskIntents,
      passesAttempted: stats.passesAttempted,
      passesCompleted: stats.passesCompleted,
      touches: stats.touches,
      carries: stats.carries,
      interceptions: stats.interceptions,
      possessionChanges: possessionChangesByPlayer.get(stats.playerId) ?? 0,
      shots: stats.shots,
      shotsOnTarget: stats.shotsOnTarget,
      goals: stats.goals,
      distanceMetres: stats.distanceCovered,
      sprintDistanceMetres: stats.sprintDistance,
      sprintEpisodes: stats.sprintBursts,
    };
    return {
      playerId: stats.playerId,
      team: player.team,
      position: player.profile.primaryPosition,
      controlled: player.id === state.controlledFootballerId,
      sentOff: state.discipline?.[player.id]?.sentOff ?? false,
      minutesPlayed: stats.minutesPlayed,
      possessionSeconds: possessionSecondsByPlayer.get(stats.playerId) ?? 0,
      tacticalFouls: tacticalFoulsByPlayer.get(stats.playerId) ?? 0,
      tacticalFoulsPer90:
        stats.minutesPlayed > 0
          ? ((tacticalFoulsByPlayer.get(stats.playerId) ?? 0) * 90) / stats.minutesPlayed
          : 0,
      raw,
      per90: per90(raw, stats.minutesPlayed),
    };
  });
  const raw = players.reduce((total, player) => {
    for (const key of Object.keys(total) as (keyof CalibrationMetrics)[])
      total[key] += player.raw[key];
    return total;
  }, emptyMetrics());
  raw.possessionChanges = possessionChanges;
  const pairs = new Map<string, number>();
  const network = state.statistics?.passingNetwork ?? [];
  for (const edge of network) {
    const key = [edge.passerId, edge.receiverId].sort().join(':');
    pairs.set(key, (pairs.get(key) ?? 0) + edge.attempted);
  }
  const maximumPairAttempts = Math.max(0, ...pairs.values());
  const elapsedMs = batches.reduce((sum, value) => sum + value, 0);
  const canonicalSpeed = elapsedMs ? (state.time * 1000) / elapsedMs : 0;
  const termination =
    'termination' in state ? (state.termination as { reason?: string } | undefined) : undefined;
  return calibrationMatchResultSchema.parse({
    scenario,
    seed: session.setup.seed,
    configurationHash: canonicalHash(session),
    requestedMinutes: config.canonicalMinutes,
    canonicalMinutes: state.time / 60,
    status: state.status,
    controlledPosition:
      initialPlayers.find((player) => player.id === state.controlledFootballerId)?.profile
        .primaryPosition ?? 'spectator',
    controlledPossessionSeconds: state.controlledFootballerId
      ? (possessionSecondsByPlayer.get(state.controlledFootballerId) ?? 0)
      : 0,
    tacticalFouls: [...tacticalFoulsByPlayer.values()].reduce((total, count) => total + count, 0),
    tacticalFoulsPer90:
      state.time > 0
        ? ([...tacticalFoulsByPlayer.values()].reduce((total, count) => total + count, 0) * 5400) /
          state.time
        : 0,
    terminationReason: termination?.reason,
    score: state.score,
    raw,
    per90: per90(raw, state.time / 60),
    players,
    passingNetwork: {
      maximumDirectedAttempts: Math.max(0, ...network.map((edge) => edge.attempted)),
      maximumPairAttempts,
      topPairShare: raw.passesAttempted > 0 ? maximumPairAttempts / raw.passesAttempted : 0,
    },
    agency: agency.snapshot(state.time),
    performance: {
      elapsedMs,
      ticks,
      canonicalSpeed,
      estimatedHidden90Seconds: canonicalSpeed ? 5400 / canonicalSpeed : 0,
      batchP50Ms: percentile(batches, 0.5),
      batchP95Ms: percentile(batches, 0.95),
      rendererCallsBackground: 0,
    },
    hashes: {
      canonicalState: canonicalHash(state),
      statistics: canonicalHash(state.statistics),
      canonicalEventSequence: eventHash.digest('hex'),
    },
  });
};

export const summarizeCalibrationDistribution = (values: number[]) =>
  calibrationDistributionSchema.parse({
    samples: values.length,
    minimum: values.length ? Math.min(...values) : 0,
    p25: percentile(values, 0.25),
    median: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    maximum: values.length ? Math.max(...values) : 0,
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
  });
export const createCalibrationReport = (
  matches: CalibrationMatchResult[],
  config: z.input<typeof calibrationBenchmarkConfigSchema>,
  revision: string,
  failures: z.infer<typeof calibrationReportSchema>['failures'] = [],
) => {
  const keys = Object.keys(calibrationMetricsSchema.shape) as (keyof CalibrationMetrics)[];
  const players = matches.flatMap((match) => match.players);
  return calibrationReportSchema.parse({
    schemaVersion: 1,
    inputPolicy: 'explicit_dev_ai_selection_at_exact_tick_boundary',
    fixedDt: FIXED_MATCH_DT,
    distanceUnit: 'metres',
    config: calibrationBenchmarkConfigSchema.parse(config),
    revision,
    matches,
    failures,
    distributions: {
      raw: Object.fromEntries(
        keys.map((key) => [
          key,
          summarizeCalibrationDistribution(matches.map((match) => match.raw[key])),
        ]),
      ),
      per90: Object.fromEntries(
        keys.map((key) => [
          key,
          summarizeCalibrationDistribution(matches.map((match) => match.per90[key])),
        ]),
      ),
      playerRaw: Object.fromEntries(
        keys.map((key) => [
          key,
          summarizeCalibrationDistribution(players.map((player) => player.raw[key])),
        ]),
      ),
      outfieldPlayerPer90: Object.fromEntries(
        keys.map((key) => [
          key,
          summarizeCalibrationDistribution(
            players
              .filter((player) => player.position !== 'goalkeeper')
              .map((player) => player.per90[key]),
          ),
        ]),
      ),
      decisionsPer90: summarizeCalibrationDistribution(
        matches.map((match) => match.agency.decisionsPer90Minutes),
      ),
      byScenario: Object.fromEntries(
        [...new Set(matches.map((match) => match.scenario))].map((scenario) => {
          const fixtures = matches.filter((match) => match.scenario === scenario);
          return [
            scenario,
            {
              matches: fixtures.length,
              raw: Object.fromEntries(
                keys.map((key) => [
                  key,
                  summarizeCalibrationDistribution(fixtures.map((match) => match.raw[key])),
                ]),
              ),
              per90: Object.fromEntries(
                keys.map((key) => [
                  key,
                  summarizeCalibrationDistribution(fixtures.map((match) => match.per90[key])),
                ]),
              ),
              decisionsPer90: summarizeCalibrationDistribution(
                fixtures.map((match) => match.agency.decisionsPer90Minutes),
              ),
            },
          ];
        }),
      ),
    },
  });
};
