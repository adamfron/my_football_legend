import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  PressureSupportTracker,
  projectFormationConnectivity,
  CentralConnectivityTracker,
} from '../src/core/matchSimulation/footballIntelligenceDiagnostics';
import { MatchDebugRecorder } from '../src/app/match/matchDebugCapture';
import { MatchReplayHistory } from '../src/core/matchSimulation/matchReplay';
import { runFirstTimePassMatrix } from './pr155PassMatrix';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...v] = arg.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const config = z
  .object({
    minutes: z.number().positive().max(45),
    seeds: z.array(z.string()).min(1),
    revision: z.string(),
    observer: z.enum(['normal', 'dev', 'capture']),
  })
  .parse({
    minutes: Number(args.get('minutes') ?? 45),
    seeds: (args.get('seeds') ?? 'lab-muwhj3er,pr155-natural-b,pr155-natural-c').split(','),
    revision: args.get('revision') ?? 'PR155',
    observer: args.get('observer') ?? 'dev',
  });
const root = resolve(args.get('engine-root') ?? process.cwd());
const load = <T>(path: string): Promise<T> => import(pathToFileURL(resolve(root, path)).href);
const [worldModule, sessions, engine, actions, decisions, flow, stats, positioning] =
  await Promise.all([
    load<typeof import('./createCanonicalWorldDatabase')>(
      'scripts/createCanonicalWorldDatabase.ts',
    ),
    load<typeof import('../src/core/singleMatch')>('src/core/singleMatch.ts'),
    load<typeof import('../src/core/matchSimulation/matchSimulation')>(
      'src/core/matchSimulation/matchSimulation.ts',
    ),
    load<typeof import('../src/core/matchSimulation/matchActions')>(
      'src/core/matchSimulation/matchActions.ts',
    ),
    load<typeof import('../src/core/matchSimulation/playerDecision')>(
      'src/core/matchSimulation/playerDecision.ts',
    ),
    load<typeof import('../src/core/matchSimulation/matchFlowTelemetry')>(
      'src/core/matchSimulation/matchFlowTelemetry.ts',
    ),
    load<typeof import('../src/core/matchSimulation/playerMatchStats')>(
      'src/core/matchSimulation/playerMatchStats.ts',
    ),
    load<typeof import('../src/core/matchSimulation/tacticalPositioning')>(
      'src/core/matchSimulation/tacticalPositioning.ts',
    ),
  ]);
const world = worldModule.createCanonicalWorldDatabase();
if (args.has('pass-matrix')) {
  const input = engine.createTacticalMatch(
    sessions.createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: 'pr155-matrix',
      control: { mode: 'spectator' },
    }),
  );
  const result = runFirstTimePassMatrix(input);
  const output = resolve(args.get('out') ?? '.benchmark-artifacts/pr155-first-time.json');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  process.stderr.write(
    `${result.rows.length} cells; parity failures ${result.physicalParityFailures}; unresolved ${result.rows.reduce((s, r) => s + r.unresolved, 0)}\n`,
  );
  process.exit(0);
}
const fixtures = args.has('matrix')
  ? [
      { id: 'supplied-player', home: 'pro_9', away: 'pro_1', player: true, balanced: false },
      { id: 'supplied-observer', home: 'pro_9', away: 'pro_1', player: false, balanced: false },
      { id: 'balanced-balanced', home: 'pro_9', away: 'pro_1', player: false, balanced: true },
      {
        id: 'strong-weak',
        home: 'pro_9',
        away: world.clubs[63]!.id,
        player: false,
        balanced: true,
      },
    ]
  : [
      {
        id: args.has('player') ? 'supplied-player' : 'supplied-observer',
        home: 'pro_9',
        away: 'pro_1',
        player: args.has('player'),
        balanced: false,
      },
    ];
const results = [];
for (const fixture of fixtures)
  for (const seed of config.seeds) {
    const session = sessions.createSingleMatchSession(world, {
      homeClubId: fixture.home,
      awayClubId: fixture.away,
      seed,
      control: fixture.player
        ? {
            mode: 'player',
            clubId: fixture.home,
            footballerId: 'footballer_pro_9_12',
            forceIntoXI: true,
          }
        : { mode: 'spectator' },
    });
    let state = engine.createTacticalMatch(session);
    state.teams.home.style = 'balanced';
    state.teams.away.style = fixture.balanced ? 'balanced' : 'pressing';
    const initial = structuredClone(state);
    let telemetry = flow.createMatchFlowTelemetry(seed);
    const support = new PressureSupportTracker({
      deriveBuildUpSupport: positioning.deriveBuildUpSupport,
      rankAvailableActionsForAI: actions.rankAvailableActionsForAI,
    });
    const central = new CentralConnectivityTracker();
    const replay = config.observer === 'normal' ? undefined : new MatchReplayHistory();
    const recorder = config.observer === 'capture' ? new MatchDebugRecorder() : undefined;
    const flips: {
      at: number;
      from: string;
      to: string;
      winner?: string;
      cause?: string;
      owner?: string;
      travel?: string;
      challenge?: string;
    }[] = [];
    const choices: { at: number; kind: string; option: string }[] = [];
    let lastFlipAt = -10,
      adjacentTickPossessionFlips = 0;
    const started = performance.now();
    let ticks = 0;
    while (
      state.time < config.minutes * 60 &&
      !['half_time', 'full_time', 'abandoned'].includes(state.status ?? '')
    ) {
      const opportunity = fixture.player
        ? decisions.projectPlayerDecisionOpportunity(state)
        : undefined;
      if (opportunity) {
        // Reproducible explicit choices, not the unavailable original human input tape.
        const ranked = opportunity.options
          .map((option) => ({
            option,
            score:
              option.kind === 'action'
                ? actions.scoreActionForAI(state, opportunity.actorId, option.action)
                : -20,
          }))
          .sort((a, b) => b.score - a.score || a.option.id.localeCompare(b.option.id));
        const selected = ranked[0]!.option;
        const before = state;
        state = decisions.applyPlayerDecision(state, opportunity, selected.id);
        if (state === before) throw new Error(`Unresolved choice ${opportunity.id}`);
        if (config.observer !== 'normal')
          telemetry = flow.observeMatchFlow(telemetry, before, state);
        choices.push({ at: state.time, kind: opportunity.kind, option: selected.id });
      }
      const previous = state;
      state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
      if (state.time === previous.time) throw new Error(`Stalled ${state.time}`);
      if (previous.possessionTeam !== state.possessionTeam) {
        if (state.time - lastFlipAt <= engine.FIXED_MATCH_DT + 1e-6) adjacentTickPossessionFlips++;
        lastFlipAt = state.time;
        flips.push({
          at: state.time,
          from: previous.possessionTeam,
          to: state.possessionTeam,
          winner: state.lastPossessionChange?.winnerId,
          cause: state.lastPossessionChange?.cause,
          owner: state.ball.ownerId,
          travel: state.ball.travelKind,
          challenge: state.lastChallenge?.id,
        });
      }
      if (config.observer !== 'normal') {
        telemetry = flow.observeMatchFlow(telemetry, previous, state);
        support.observe(previous, state);
        central.observe(previous, state);
        replay!.observe(state);
      }
      if (recorder) {
        recorder.record(state);
        if (recorder.lastObservationError) throw new Error(recorder.lastObservationError);
      }
      ticks++;
      if (ticks % 24_000 === 0)
        process.stderr.write(
          `${fixture.id}:${seed}: ${state.time.toFixed(1)}s, ${choices.length} explicit choices\n`,
        );
    }
    stats.assertMatchStatisticsInvariants(state.statistics!, state);
    if (args.has('state-out')) {
      const statePath = resolve(args.get('state-out')!);
      mkdirSync(dirname(statePath), { recursive: true });
      writeFileSync(statePath, JSON.stringify(state) + '\n');
    }
    if (config.observer !== 'normal') flow.assertTelemetryInvariants(telemetry);
    const teams = (['home', 'away'] as const).map((side) => ({
      side,
      formation: session[side].formation,
      style: state.teams[side].style,
      players: state
        .statistics!.players.filter((p) =>
          initial.players.some((a) => a.id === p.playerId && a.team === side),
        )
        .map((p) => ({
          ...p,
          role: initial.players.find((a) => a.id === p.playerId)!.slot.position,
        })),
      accounting: state.statistics!.teamAccounting![side],
    }));
    results.push({
      case: fixture.id,
      seed,
      time: state.time,
      score: state.score,
      teams,
      choices: choices.length,
      choiceKinds: Object.fromEntries(
        [...new Set(choices.map((c) => c.kind))].map((kind) => [
          kind,
          choices.filter((c) => c.kind === kind).length,
        ]),
      ),
      controlled: config.observer === 'normal' ? null : telemetry.controlled,
      firstTimePassAttempts: config.observer === 'normal' ? null : telemetry.firstTimePassAttempts,
      firstTimePassCompleted:
        config.observer === 'normal' ? null : telemetry.firstTimePassCompleted,
      firstTimePassByIntent: config.observer === 'normal' ? null : telemetry.firstTimePassByIntent,
      firstTimePasses:
        config.observer === 'normal'
          ? null
          : telemetry.passOutcomes.filter((p) => p.executionType === 'first_time'),
      microSpellsUnder0_5s:
        config.observer === 'normal'
          ? null
          : telemetry.possessionSpells.filter((p) => p.duration < 0.5).length,
      adjacentTickPossessionFlips,
      flipOutliers: flips.filter((p, i) => i > 0 && p.at - flips[i - 1]!.at < 0.5),
      holds: [...telemetry.ballHolds].sort((a, b) => b.duration - a.duration).slice(0, 20),
      holdsByPressure: Object.fromEntries(
        ['low', 'medium', 'high'].map((band) => [
          band,
          telemetry.ballHolds
            .filter((h) => h.pressureBand === band)
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 5),
        ]),
      ),
      pressureSupport: support
        .snapshot()
        .filter((p) => p.duration > 5 && p.pressureStartedAt !== null),
      connectivity: projectFormationConnectivity(state),
      centralConnectivity: central.snapshot(),
      topEdges: [...state.statistics!.passingNetwork]
        .sort((a, b) => b.attempted - a.attempted)
        .slice(0, 15),
      fouls: state.statistics!.players.reduce((sum, p) => sum + p.fouls, 0),
      yellows: state.statistics!.players.reduce((sum, p) => sum + p.yellowCards, 0),
      reds: state.statistics!.players.reduce((sum, p) => sum + p.redCards, 0),
      shots: state.statistics!.players.reduce((sum, p) => sum + p.shots, 0),
      elapsedMs: performance.now() - started,
      ticks,
      canonicalHash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
    });
    process.stderr.write(
      `${config.revision} ${fixture.id}:${seed}: ${state.time / 60}min ${(performance.now() - started).toFixed(0)}ms\n`,
    );
  }
const output = resolve(args.get('out') ?? '.benchmark-artifacts/pr155.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      base: '235caf8abe593fb7fa85911f0d12bbe5474973e0',
      config,
      inputPolicy:
        'explicit highest canonical score among surfaced options; original human tape unavailable',
      node: process.version,
      results,
    },
    null,
    2,
  ) + '\n',
);
