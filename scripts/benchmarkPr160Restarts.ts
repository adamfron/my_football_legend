import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const engineRoot = resolve(args.get('engine-root') ?? '.');
const load = <T>(path: string): Promise<T> => import(pathToFileURL(resolve(engineRoot, path)).href);
const [worldModule, sessions, engine, restarts, lifecycle] = await Promise.all([
  load<typeof import('./createCanonicalWorldDatabase')>('scripts/createCanonicalWorldDatabase.ts'),
  load<typeof import('../src/core/singleMatch')>('src/core/singleMatch.ts'),
  load<typeof import('../src/core/matchSimulation/matchSimulation')>(
    'src/core/matchSimulation/matchSimulation.ts',
  ),
  load<typeof import('../src/core/matchSimulation/restartScenarios')>(
    'src/core/matchSimulation/restartScenarios.ts',
  ),
  load<typeof import('../src/core/matchSimulation/restartLifecycle')>(
    'src/core/matchSimulation/restartLifecycle.ts',
  ),
]);
const world = worldModule.createCanonicalWorldDatabase();
const actors = (state: TacticalMatchState) => ({
  ball: {
    x: state.ball.x,
    y: state.ball.y,
    height: state.ball.height ?? 0,
    velocity: state.ball.velocity ?? { x: 0, y: 0 },
  },
  taker: state.players.find((p) => p.id === state.restart?.takerId),
  keeper:
    state.players.find(
      (p) =>
        p.team !== state.restart?.restartTeam &&
        state.restart?.roles[p.id]?.key === 'penalty_goalkeeper',
    ) ??
    state.players.find(
      (p) => p.team !== state.restart?.restartTeam && p.profile.primaryPosition === 'goalkeeper',
    ),
});
const snapshot = (state: TacticalMatchState) => {
  const a = actors(state);
  return {
    at: state.time,
    phase: state.restart?.phase ?? 'released',
    origin: state.restart?.origin ?? null,
    readiness: state.restart?.readiness ?? null,
    retrieval: state.restart?.retrieval ?? null,
    spot: state.restart?.spot ?? null,
    ball: a.ball,
    taker: a.taker
      ? { id: a.taker.id, position: a.taker.position, velocity: a.taker.velocity }
      : null,
    keeper: a.keeper
      ? { id: a.keeper.id, position: a.keeper.position, velocity: a.keeper.velocity }
      : null,
    selectedAction: state.restart?.selectedAction ?? null,
    selectedSource: state.restart?.selectedSource ?? null,
    preparationStartedAt: state.restart?.preparationStartedAt ?? null,
    canExecutePreparedRestart: lifecycle.canExecutePreparedRestart(state),
    decisionIndex: state.decisionIndex,
    latestAction: state.latestAction ?? null,
  };
};
const make = (side: 'home' | 'away', variant: string): TacticalMatchState => {
  const initial = engine.createTacticalMatch(
    sessions.createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'lab-mv1fg3zw',
      control: { mode: 'spectator' },
    }),
  );
  const { restart: _restart, ...open } = initial;
  void _restart;
  const at = variant === 'terminal' ? 2699.99 : 415;
  const defending = side === 'home' ? 'away' : 'home';
  const roster =
    variant === 'unavailable_keeper'
      ? initial.players.filter(
          (p) => !(p.team === defending && p.profile.primaryPosition === 'goalkeeper'),
        )
      : initial.players;
  let state = restarts.awardNaturalRestart(
    {
      ...open,
      time: at,
      scenario: 'open_play',
      players: roster,
      playerAgencyEnabled: false,
      ball: {
        x: side === 'away' ? 11.05 : 93.95,
        y: 34.037,
        velocity: { x: 0, y: 0, z: 0 },
        height: 0,
      },
    },
    'penalty',
    {
      restartTeam: side,
      incidentId: `pr160:${side}:${variant}`,
      incidentPoint: { x: side === 'away' ? 11 : 94, y: 34 },
      cause: 'foul',
    },
  );
  if (variant === 'far_taker_illegal_players')
    state = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p,
        position:
          p.id === state.restart!.takerId
            ? { x: side === 'away' ? 102 : 3, y: 62 }
            : { x: side === 'away' ? 8 + i * 0.7 : 97 - i * 0.7, y: 25 + i * 0.65 },
        velocity: { x: 0, y: 0 },
      })),
    };
  if (variant === 'unavailable_taker')
    state = { ...state, players: state.players.filter((p) => p.id !== state.restart!.takerId) };
  return state;
};
const resultSchema = z.object({
  side: z.enum(['home', 'away']),
  variant: z.string(),
  ticks: z.number(),
  runtimeMs: z.number(),
  releaseAt: z.number().nullable(),
  status: z.string(),
  remainingBlockers: z.array(z.string()),
  initialAwardId: z.string(),
  phaseTrace: z.array(z.unknown()),
  finalSnapshot: z.unknown(),
  diagnostics: z.array(z.unknown()),
});
const results: z.infer<typeof resultSchema>[] = [];
const seconds = Number(args.get('seconds') ?? 60);
// Warm-up does not enter measured windows.
let warm = make('home', 'ordinary');
for (let i = 0; i < 40; i++)
  warm = engine.stepTacticalMatchAfterDecisionProbe(warm, engine.FIXED_MATCH_DT);
for (const side of ['home', 'away'] as const)
  for (const variant of [
    'ordinary',
    'unavailable_keeper',
    'far_taker_illegal_players',
    'unavailable_taker',
    'terminal',
  ]) {
    let state = make(side, variant);
    const initialAwardId = state.lastRestartAward!.id;
    const phaseTrace: unknown[] = [];
    let lastKey = '';
    let releaseAt: number | null = null;
    const ticks = Math.ceil(seconds / engine.FIXED_MATCH_DT);
    const started = performance.now();
    for (let tick = 0; tick < ticks; tick++) {
      state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
      const key = `${state.restart?.phase}:${state.restart?.retrieval?.stage}:${state.restart?.readiness?.blockers.join(',')}`;
      if (key !== lastKey && phaseTrace.length < 20) {
        phaseTrace.push(snapshot(state));
        lastKey = key;
      }
      releaseAt ??=
        state.stoppageLedger?.intervals.find(
          (i) => i.awardId === initialAwardId && i.endReason === 'execution',
        )?.executedAt ?? null;
    }
    results.push(
      resultSchema.parse({
        side,
        variant,
        ticks,
        runtimeMs: performance.now() - started,
        releaseAt,
        status: state.status ?? 'unknown',
        remainingBlockers:
          state.restart?.awardId === initialAwardId
            ? (state.restart.readiness?.blockers ?? [])
            : [],
        initialAwardId,
        phaseTrace,
        finalSnapshot: snapshot(state),
        diagnostics: state.restartLivenessDiagnostics ?? [],
      }),
    );
  }
const fullHalf = args.has('full-half')
  ? (() => {
      const initial = engine.createTacticalMatch(
        sessions.createSingleMatchSession(world, {
          homeClubId: world.clubs[0]!.id,
          awayClubId: world.clubs[1]!.id,
          seed: 'pr160-full-half-penalty',
          control: { mode: 'spectator' },
        }),
      );
      let state: TacticalMatchState = { ...initial, playerAgencyEnabled: false };
      let awarded = false;
      let releaseAt: number | undefined;
      const started = performance.now();
      let ticks = 0;
      let lastProgressAt = 0;
      let decision = state.decisionIndex;
      while (ticks < 140000 && state.status === 'first_half') {
        if (!awarded && state.time >= 415) {
          state = restarts.awardNaturalRestart(state, 'penalty', {
            restartTeam: 'away',
            incidentId: 'pr160-full-half-penalty',
            incidentPoint: { x: 11, y: 34 },
            cause: 'foul',
          });
          awarded = true;
        }
        state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
        ticks++;
        releaseAt ??= state.stoppageLedger?.intervals.find(
          (i) => i.incidentId === 'pr160-full-half-penalty' && i.endReason === 'execution',
        )?.executedAt;
        if (decision !== state.decisionIndex) {
          decision = state.decisionIndex;
          lastProgressAt = state.time;
        }
        if (state.time - lastProgressAt > 180)
          throw new Error(`CPU action progress absent for ${state.time - lastProgressAt}s`);
        if (
          state.restartLivenessDiagnostics?.some(
            (d) => d.classification === 'soft_lock' && d.unchangedSeconds >= 120,
          )
        )
          throw new Error('CPU restart soft lock');
      }
      if (state.status !== 'half_time' || releaseAt === undefined)
        throw new Error(`Invalid observer completion ${state.status}, release ${releaseAt}`);
      return {
        seed: state.seed,
        ticks,
        runtimeMs: performance.now() - started,
        releaseAt,
        status: state.status,
        time: state.time,
        timekeeping: state.timekeeping,
        score: state.score,
        decisionIndex: state.decisionIndex,
        stoppagesCompleted: state.stoppageLedger?.completedCount,
        diagnostics: state.restartLivenessDiagnostics ?? [],
      };
    })()
  : null;
const report = {
  benchmark: 'PR160 focused penalty readiness and clock liveness',
  engineRoot,
  seed: 'lab-mv1fg3zw',
  syntheticFixture: {
    clubs: [world.clubs[0]!.id, world.clubs[1]!.id],
    purpose: 'Additional readiness matrix; original fixture is pro_9 versus pro_1.',
  },
  historicalReference: {
    file: 'lab-mv1fg3zw-benchmark-sesji.json',
    found: true,
    evidence: 'docs/performance/PR160-penalty-clock.json',
    reconstructedClubs: [world.clubs[9]!.id, world.clubs[1]!.id],
    rootCause:
      'A barely-outside penalty-area intent let locomotion stop with the actual participant still inside.',
  },
  limitations: [
    'These ten cells are synthetic readiness coverage; the authenticated original replay is recorded separately.',
    'Unavailable-keeper fixture directly removes the preferred keeper; it does not claim to replay the normal card path, which historically altered the emergency player match profile.',
    'The measured fixed 60-second windows include movement, physics and accounting; construction/warm-up are excluded.',
    'No scoring-rate or open-play calibration campaign.',
  ],
  dt: engine.FIXED_MATCH_DT,
  seconds,
  cells: results.length,
  released: results.filter((r) => r.releaseAt !== null).length,
  runtimeMs: results.reduce((sum, r) => sum + r.runtimeMs, 0),
  results,
  fullHalf,
};
const output = resolve(args.get('output') ?? 'work/pr160-penalty-clock-matrix.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(
  JSON.stringify({
    output,
    cells: report.cells,
    released: report.released,
    runtimeMs: report.runtimeMs,
    fullHalf,
  }) + '\n',
);
