import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  PressureSupportTracker,
  projectFormationConnectivity,
} from '../src/core/matchSimulation/footballIntelligenceDiagnostics';
import { runAttributeMicroLab } from '../src/core/matchSimulation/attributeMicroLab';
import { MatchDebugRecorder } from '../src/app/match/matchDebugCapture';
import { MatchReplayHistory } from '../src/core/matchSimulation/matchReplay';
import { tacticalStyleSchema } from '../src/core/matchSimulation/matchState';
import { runPassFlightMatrix } from './pr154PassFlightMatrix';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const config = z
  .object({
    minutes: z.number().positive().max(45),
    seeds: z.array(z.string()).min(1),
    observer: z.enum(['normal', 'dev', 'capture']),
    revision: z.string(),
  })
  .parse({
    minutes: Number(args.get('minutes') ?? 45),
    seeds: (args.get('seeds') ?? 'lab-muvry3p0,pr154-natural-b').split(','),
    observer: args.get('observer') ?? 'dev',
    revision: args.get('revision') ?? 'PR154',
  });
const root = resolve(args.get('engine-root') ?? process.cwd());
const load = <T>(path: string): Promise<T> => import(pathToFileURL(resolve(root, path)).href);
const [worldModule, sessions, engine, flow, stats, actions, positioning] = await Promise.all([
  load<typeof import('./createCanonicalWorldDatabase')>('scripts/createCanonicalWorldDatabase.ts'),
  load<typeof import('../src/core/singleMatch')>('src/core/singleMatch.ts'),
  load<typeof import('../src/core/matchSimulation/matchSimulation')>(
    'src/core/matchSimulation/matchSimulation.ts',
  ),
  load<typeof import('../src/core/matchSimulation/matchFlowTelemetry')>(
    'src/core/matchSimulation/matchFlowTelemetry.ts',
  ),
  load<typeof import('../src/core/matchSimulation/playerMatchStats')>(
    'src/core/matchSimulation/playerMatchStats.ts',
  ),
  load<typeof import('../src/core/matchSimulation/matchActions')>(
    'src/core/matchSimulation/matchActions.ts',
  ),
  load<typeof import('../src/core/matchSimulation/tacticalPositioning')>(
    'src/core/matchSimulation/tacticalPositioning.ts',
  ),
]);
const world = worldModule.createCanonicalWorldDatabase();
const cases = args.has('matrix')
  ? [
      { id: 'supplied-433-442', home: 'pro_9', away: 'pro_1', style: undefined },
      { id: 'balanced-balanced', home: 'pro_0', away: 'pro_1', style: 'balanced' },
      { id: 'weak-strong', home: world.clubs[63]!.id, away: 'pro_0', style: 'balanced' },
      { id: 'high-press', home: 'pro_9', away: 'pro_1', style: 'pressing' },
    ]
  : [
      {
        id: 'supplied-433-442',
        home: args.get('home') ?? 'pro_9',
        away: args.get('away') ?? 'pro_1',
        style: args.get('style'),
      },
    ];
const results = [];
for (const fixture of cases)
  for (const seed of config.seeds) {
    const session = sessions.createSingleMatchSession(world, {
      homeClubId: fixture.home,
      awayClubId: fixture.away,
      control: { mode: 'spectator' },
      seed,
    });
    let state = engine.createTacticalMatch(session);
    if (fixture.style) state.teams.home.style = tacticalStyleSchema.parse(fixture.style);
    if (fixture.id === 'balanced-balanced') state.teams.away.style = 'balanced';
    const initial = structuredClone(state);
    if (args.has('micro') || args.has('pass-matrix')) {
      const micro = args.has('pass-matrix')
        ? runPassFlightMatrix(initial)
        : runAttributeMicroLab(initial);
      const output = resolve(args.get('out') ?? '.benchmark-artifacts/pr154-micro.json');
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, JSON.stringify(micro, null, 2) + '\n');
      process.stderr.write(`${micro.rows.length} micro variants\n`);
      process.exit(0);
    }
    let telemetry = flow.createMatchFlowTelemetry(seed);
    const support = new PressureSupportTracker({
      deriveBuildUpSupport: positioning.deriveBuildUpSupport,
      rankAvailableActionsForAI: actions.rankAvailableActionsForAI,
    });
    const recorder = config.observer === 'capture' ? new MatchDebugRecorder() : undefined;
    const replay = config.observer === 'normal' ? undefined : new MatchReplayHistory();
    const started = performance.now();
    let ticks = 0;
    const target = config.minutes * 60;
    while (
      state.time < target &&
      !['half_time', 'full_time', 'abandoned'].includes(state.status ?? '')
    ) {
      const previous = state;
      state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
      if (config.observer !== 'normal') {
        telemetry = flow.observeMatchFlow(telemetry, previous, state);
        support.observe(previous, state);
        replay!.observe(state);
      }
      if (recorder) {
        recorder.record(state);
        if (recorder.lastObservationError) throw new Error(recorder.lastObservationError);
      }
      ticks++;
    }
    stats.assertMatchStatisticsInvariants(state.statistics!, state);
    if (config.revision === 'PR154' && config.observer !== 'normal')
      flow.assertTelemetryInvariants(telemetry);
    const elapsedMs = performance.now() - started;
    const accounting = state.statistics!.teamAccounting!;
    const totalLive = accounting.home.possessionSeconds + accounting.away.possessionSeconds;
    const teams = (['home', 'away'] as const).map((side) => {
      const ids = initial.players.filter((p) => p.team === side).map((p) => p.id);
      const players = state.statistics!.players.filter((p) => ids.includes(p.playerId));
      return {
        side,
        club: session[side].club.name,
        formation: session[side].formation,
        possession: (accounting[side].possessionSeconds / Math.max(1, totalLive)) * 100,
        players: players.map((p) => {
          const actor = initial.players.find((a) => a.id === p.playerId)!;
          return {
            ...p,
            name: `${actor.profile.firstName} ${actor.profile.lastName}`,
            role: actor.slot.position,
          };
        }),
        passIntents: ['support', 'progressive', 'direct', 'lead', 'through'].map((intent) => {
          const attempts = telemetry.passOutcomes.filter(
            (p) => p.intent === intent && ids.includes(p.passerId ?? p.passId.split(':').at(-1)!),
          );
          return {
            intent,
            attempted: attempts.length,
            completed: attempts.filter((p) => p.outcome === 'completed').length,
          };
        }),
        accounting: accounting[side],
      };
    });
    const buckets = new Map<
      string,
      {
        attempts: number;
        completed: number;
        predictedOut: number;
        actualOut: number;
        intercepted: number;
        receiverFailures: number;
        executionErrorTotal: number;
      }
    >();
    for (const pass of telemetry.passOutcomes) {
      const ability = pass.selection?.passerAbility;
      const key = `${pass.intent}:pressure-${pass.pressure < 0.33 ? 'low' : pass.pressure < 0.67 ? 'medium' : 'high'}:length-${pass.length < 15 ? 'short' : pass.length < 30 ? 'medium' : 'long'}:ability-${ability === undefined ? 'uncollected' : Math.floor(ability / 20) * 20}`;
      const bucket = buckets.get(key) ?? {
        attempts: 0,
        completed: 0,
        predictedOut: 0,
        actualOut: 0,
        intercepted: 0,
        receiverFailures: 0,
        executionErrorTotal: 0,
      };
      bucket.attempts++;
      bucket.completed += Number(pass.outcome === 'completed');
      bucket.predictedOut += Number(pass.selection?.targetPredictedOutOfPlay ?? false);
      bucket.actualOut += Number(pass.outcome === 'out_of_play');
      bucket.intercepted += Number(pass.outcome === 'intercepted');
      bucket.receiverFailures += Number(pass.receiverFailure ?? false);
      bucket.executionErrorTotal += pass.executionErrorMetres ?? 0;
      buckets.set(key, bucket);
    }
    results.push({
      case: fixture.id,
      seed,
      requestedMinutes: config.minutes,
      time: state.time,
      status: state.status,
      score: state.score,
      teams,
      observation: config.observer,
      passes:
        config.observer === 'normal'
          ? null
          : {
              attempted: telemetry.passesAttempted,
              completed: telemetry.passesCompleted,
              out: telemetry.passesOutOfPlay,
            },
      passBuckets: [...buckets].map(([context, b]) => ({
        context,
        ...b,
        meanExecutionError: b.executionErrorTotal / b.attempts,
      })),
      holds: [...telemetry.ballHolds].sort((a, b) => b.duration - a.duration).slice(0, 12),
      pressureSupport: support
        .snapshot()
        .sort((a, b) => b.maximumStationaryStall - a.maximumStationaryStall)
        .slice(0, 12),
      connectivity: projectFormationConnectivity(state),
      topEdges: [...state.statistics!.passingNetwork]
        .sort((a, b) => b.attempted - a.attempted)
        .slice(0, 12),
      shots: telemetry.shotDiagnostics.map((p, i) => ({
        id: p.shotId,
        distance: p.distance,
        aggregateDistance: telemetry.shotDistances[i],
      })),
      elapsedMs,
      ticks,
      canonicalHash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
    });
    process.stderr.write(
      `${config.revision} ${fixture.id}:${seed}: ${state.time / 60}min ${elapsedMs.toFixed(0)}ms\n`,
    );
  }
const output = resolve(args.get('out') ?? '.benchmark-artifacts/pr154.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      base: '7b175c7a2e5d76ba082c677b407dd80130c37705',
      config,
      node: process.version,
      platform: process.platform,
      results,
    },
    null,
    2,
  ) + '\n',
);
