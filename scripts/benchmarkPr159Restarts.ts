import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { RestartScenario, TacticalMatchState } from '../src/core/matchSimulation/matchState';

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const configurationSchema = z.object({
  seconds: z.number().positive().max(90),
  repetitions: z.number().int().min(1).max(16),
});
const configuration = configurationSchema.parse({
  seconds: Number(args.get('seconds') ?? 20),
  repetitions: Number(args.get('repetitions') ?? 2),
});
const engineRoot = resolve(args.get('engine-root') ?? '.');
const load = <T>(path: string): Promise<T> => import(pathToFileURL(resolve(engineRoot, path)).href);
const [worldModule, sessions, engine, restarts] = await Promise.all([
  load<typeof import('./createCanonicalWorldDatabase')>('scripts/createCanonicalWorldDatabase.ts'),
  load<typeof import('../src/core/singleMatch')>('src/core/singleMatch.ts'),
  load<typeof import('../src/core/matchSimulation/matchSimulation')>(
    'src/core/matchSimulation/matchSimulation.ts',
  ),
  load<typeof import('../src/core/matchSimulation/restartScenarios')>(
    'src/core/matchSimulation/restartScenarios.ts',
  ),
]);
const world = worldModule.createCanonicalWorldDatabase();
const scenarios: RestartScenario[] = [
  'kick_off',
  'goal_kick',
  'corner',
  'free_kick_wide',
  'free_kick_close',
  'penalty',
];
const traceSchema = z.object({ at: z.number(), phase: z.string(), blockers: z.array(z.string()) });
const resultSchema = z.object({
  scenario: z.string(),
  repetition: z.number().int(),
  ticks: z.number().int(),
  runtimeMs: z.number(),
  awardMaximumPlayerDisplacement: z.number(),
  awardBallDisplacement: z.number(),
  releaseAt: z.number().optional(),
  maximumPlayerStep: z.number(),
  maximumBallStep: z.number(),
  elapsedBeforeRelease: z.number(),
  phaseTrace: z.array(traceSchema),
  awardIds: z.array(z.string()),
  returnedToOpenPlay: z.boolean(),
  remainingBlockers: z.array(z.string()),
});
type RestartResult = z.infer<typeof resultSchema>;
const results: RestartResult[] = [];
const liveAwards = typeof restarts.awardNaturalRestart === 'function';
const makeState = (scenario: RestartScenario, repetition: number) => {
  const initial = engine.createTacticalMatch(
    sessions.createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: `pr159-focused-runtime-${scenario}-${repetition}`,
      control: { mode: 'spectator' },
    }),
  );
  // Both engines start from their seeded DEV fixture, then receive the same bounded offset.
  // These are fixture coordinates; every subsequent canonical tick must move physically.
  const setup = restarts.applyRestartScenario(
    { ...initial, playerAgencyEnabled: false },
    scenario,
    { restartTeam: 'home' },
  );
  const incidentPoint = { x: setup.ball.x, y: setup.ball.y };
  const { restart: _restart, ...uninterrupted } = setup;
  void _restart;
  const perturbed: TacticalMatchState = {
    ...uninterrupted,
    scenario: 'open_play',
    ball: {
      ...incidentPoint,
      x: Math.max(0.5, Math.min(104.5, incidentPoint.x - 2)),
      y: Math.max(0.5, Math.min(67.5, incidentPoint.y + 2)),
      velocity: { x: 0, y: 0 },
      height: 0,
    },
    players: setup.players.map((player, index) => ({
      ...player,
      position: {
        x: Math.max(0.5, Math.min(104.5, player.position.x + (index % 2 ? 2 : -2))),
        y: Math.max(0.5, Math.min(67.5, player.position.y + (index % 3 ? 1.5 : -1.5))),
      },
      velocity: { x: 0.5, y: -0.2 },
    })),
  };
  const state = liveAwards
    ? restarts.awardNaturalRestart(perturbed, scenario, {
        restartTeam: 'home',
        incidentId: `benchmark-${scenario}-${repetition}`,
        incidentPoint,
        cause: 'bookkeeping',
      })
    : restarts.applyRestartScenario(perturbed, scenario, {
        restartTeam: 'home',
        restartPoint: incidentPoint,
      });
  return {
    state,
    awardMaximumPlayerDisplacement: Math.max(
      ...state.players.map((player) => {
        const previous = perturbed.players.find((before) => before.id === player.id)!;
        return Math.hypot(
          player.position.x - previous.position.x,
          player.position.y - previous.position.y,
        );
      }),
    ),
    awardBallDisplacement: Math.hypot(
      state.ball.x - perturbed.ball.x,
      state.ball.y - perturbed.ball.y,
    ),
  };
};

// Warm up transforms and hot paths once; warm-up time is excluded from the measurement.
let warmup = makeState('free_kick_wide', 0).state;
for (let tick = 0; tick < 40; tick++)
  warmup = engine.stepTacticalMatchAfterDecisionProbe(warmup, engine.FIXED_MATCH_DT);
for (const scenario of scenarios)
  for (let repetition = 0; repetition < configuration.repetitions; repetition++) {
    const constructed = makeState(scenario, repetition);
    let state = constructed.state;
    const phaseTrace: RestartResult['phaseTrace'] = [];
    const awards = new Set<string>();
    const initialAwardId = state.lastRestartAward?.id;
    if (state.lastRestartAward) awards.add(state.lastRestartAward.id);
    let maximumPlayerStep = 0,
      maximumBallStep = 0,
      releaseAt: number | undefined;
    let lastPhase = '',
      returnedToOpenPlay = false;
    const ticks = Math.ceil(configuration.seconds / engine.FIXED_MATCH_DT);
    const started = performance.now();
    for (let tick = 0; tick < ticks; tick++) {
      const previous = state;
      state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
      const phase = state.restart?.phase ?? (state.postGoal ? 'post_goal' : 'open_play');
      if (phase !== lastPhase && phaseTrace.length < 24) {
        phaseTrace.push({
          at: state.time,
          phase,
          blockers: state.restart?.readiness?.blockers ?? [],
        });
        lastPhase = phase;
      }
      if (releaseAt === undefined) {
        const completedInterval = state.stoppageLedger?.intervals.find(
          (interval) => interval.awardId === initialAwardId && interval.endReason === 'execution',
        );
        releaseAt = state.restart?.executedAt ?? completedInterval?.executedAt;
        // The legacy penalty path consumes its restart state on the execution tick.
        if (
          releaseAt === undefined &&
          previous.restart &&
          !state.restart &&
          state.decisionIndex > previous.decisionIndex
        )
          releaseAt = state.time;
      }
      if (releaseAt !== undefined && !state.restart && state.scenario === 'open_play')
        returnedToOpenPlay = true;
      if (state.lastRestartAward) awards.add(state.lastRestartAward.id);
      if (releaseAt === undefined) {
        maximumBallStep = Math.max(
          maximumBallStep,
          Math.hypot(state.ball.x - previous.ball.x, state.ball.y - previous.ball.y),
        );
        for (const player of state.players) {
          const before = previous.players.find((prior) => prior.id === player.id);
          if (before)
            maximumPlayerStep = Math.max(
              maximumPlayerStep,
              Math.hypot(
                player.position.x - before.position.x,
                player.position.y - before.position.y,
              ),
            );
        }
      }
    }
    results.push(
      resultSchema.parse({
        scenario,
        repetition,
        ticks,
        runtimeMs: performance.now() - started,
        awardMaximumPlayerDisplacement: constructed.awardMaximumPlayerDisplacement,
        awardBallDisplacement: constructed.awardBallDisplacement,
        ...(releaseAt !== undefined ? { releaseAt } : {}),
        maximumPlayerStep,
        maximumBallStep,
        elapsedBeforeRelease: releaseAt ?? state.time,
        phaseTrace,
        awardIds: [...awards],
        returnedToOpenPlay,
        remainingBlockers: state.restart?.readiness?.blockers ?? [],
      }),
    );
  }
const report = {
  benchmark: 'PR159 focused restart continuity',
  engineRoot,
  implementation: liveAwards ? 'live_physical_restart' : 'legacy_dev_placement',
  configuration,
  dt: engine.FIXED_MATCH_DT,
  limitations: [
    'Fixed seeded fixture windows; no league-wide realism or scoring claims.',
    'No human decisions are automated.',
    'Runtime includes canonical movement and accounting; fixture construction is excluded.',
  ],
  summary: {
    cells: results.length,
    released: results.filter((result) => result.releaseAt !== undefined).length,
    runtimeMs: results.reduce((sum, result) => sum + result.runtimeMs, 0),
    awardMaximumPlayerDisplacement: Math.max(
      ...results.map((result) => result.awardMaximumPlayerDisplacement),
    ),
    awardBallDisplacement: Math.max(...results.map((result) => result.awardBallDisplacement)),
    maximumPlayerStep: Math.max(...results.map((result) => result.maximumPlayerStep)),
    maximumBallStep: Math.max(...results.map((result) => result.maximumBallStep)),
  },
  results,
};
const output = resolve(args.get('output') ?? 'docs/performance/PR159-restarts-summary.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(
  `${JSON.stringify({ output, implementation: report.implementation, ...report.summary })}\n`,
);
