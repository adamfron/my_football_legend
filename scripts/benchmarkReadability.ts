import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { summarizeCalibrationDistribution } from './matchCalibrationBenchmark';
import { percentile } from '../src/core/matchSimulation/backgroundPerformance';

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const config = z
  .object({
    minutes: z.coerce.number().positive().max(90).default(10),
    scenarios: z
      .array(z.enum(['balanced-balanced', 'weak-strong', 'aggressive-defenders']))
      .nonempty(),
    seeds: z.array(z.string().min(1)).nonempty(),
    repeats: z.coerce.number().int().min(1).max(3).default(1),
    revision: z.string(),
    position: z.enum(['central_midfielder', 'left_back', 'striker']).optional(),
    replay: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .parse({
    minutes: args.get('minutes'),
    scenarios: (args.get('scenarios') ?? 'balanced-balanced').split(','),
    seeds: (args.get('seeds') ?? 'a').split(','),
    repeats: args.get('repeats'),
    revision: args.get('revision') ?? 'working-tree',
    position: args.get('position'),
    replay: args.get('replay'),
  });
// The same observer can run against a clean previous checkout. Only its canonical engine and
// fixture factory are imported; no benchmark code or football source is changed in that checkout.
const engineRoot = resolve(args.get('engine-root') ?? process.cwd());
const importEngine = <T>(path: string): Promise<T> =>
  import(pathToFileURL(resolve(engineRoot, path)).href);
const [
  { createCanonicalWorldDatabase },
  { createCalibrationSession },
  engine,
  decision,
  agencyModule,
] = await Promise.all([
  importEngine<typeof import('./createCanonicalWorldDatabase')>(
    'scripts/createCanonicalWorldDatabase.ts',
  ),
  importEngine<typeof import('./matchCalibrationBenchmark')>(
    'scripts/matchCalibrationBenchmark.ts',
  ),
  importEngine<typeof import('../src/core/matchSimulation/matchSimulation')>(
    'src/core/matchSimulation/matchSimulation.ts',
  ),
  importEngine<typeof import('../src/core/matchSimulation/playerDecision')>(
    'src/core/matchSimulation/playerDecision.ts',
  ),
  importEngine<typeof import('../src/core/matchSimulation/playerAgency')>(
    'src/core/matchSimulation/playerAgency.ts',
  ),
]);
const world = createCanonicalWorldDatabase();
const centreModule = existsSync(
  resolve(engineRoot, 'src/core/matchSimulation/matchCentreStatistics.ts'),
)
  ? await importEngine<typeof import('../src/core/matchSimulation/matchCentreStatistics')>(
      'src/core/matchSimulation/matchCentreStatistics.ts',
    )
  : undefined;
const replayModule = config.replay
  ? await importEngine<typeof import('../src/core/matchSimulation/matchReplay')>(
      'src/core/matchSimulation/matchReplay.ts',
    )
  : undefined;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const activePreparation = (state: TacticalMatchState) => {
  const preparation = state.onBallPreparation;
  if (
    !preparation?.micro ||
    state.scenario !== 'open_play' ||
    state.ball.travelKind ||
    state.ballCarrierIntent?.actorId === preparation.actorId ||
    state.playerMovementIntent?.actorId === preparation.actorId
  )
    return undefined;
  return state.ball.ownerId === preparation.actorId ||
    (!state.ball.ownerId &&
      preparation.micro?.phase === 'recovering' &&
      state.time < preparation.readyAt)
    ? preparation
    : undefined;
};
const matches = [];
for (const scenario of config.scenarios)
  for (const seed of config.seeds)
    for (let repeat = 0; repeat < config.repeats; repeat++) {
      const session = createCalibrationSession(world, scenario, seed, config.position);
      let state = engine.createTacticalMatch(session);
      const actualPosition = state.players.find(
        (player) => player.id === state.controlledFootballerId,
      )?.profile.primaryPosition;
      if (config.position && actualPosition !== config.position)
        throw new Error(`Fixture has no controlled ${config.position}; selected ${actualPosition}`);
      const agency = new agencyModule.PlayerAgencyTracker();
      const replay = replayModule ? new replayModule.MatchReplayHistory() : undefined;
      replay?.observe(state);
      const receptions: Record<string, number> = {
        clean_control: 0,
        directional_control: 0,
        heavy_touch: 0,
        failed_control: 0,
      };
      const qualityScores: number[] = [];
      const receptionContexts: Record<string, Record<string, number>> = {};
      const controlledReceptions: Record<string, number> = {
        clean_control: 0,
        directional_control: 0,
        heavy_touch: 0,
        failed_control: 0,
      };
      const controlledPassContacts = {
        actualCompleted: 0,
        unintendedCompleted: 0,
        intendedCompleted: 0,
        intendedFailed: 0,
        nonIntendedTeammateClaim: 0,
      };
      const holds: number[] = [];
      const preparationPhaseSeconds: Record<string, number> = {};
      const preparationMovement: number[] = [];
      const possessionSeconds = { home: 0, away: 0 };
      let lastReceptionKey = '';
      let lastPossessionKey = '';
      let lastResolvedPassId = '';
      let possessionChanges = 0;
      let ownerId = state.ball.ownerId;
      let gainedAt = state.time;
      let preparationOrigin:
        | { actorId: string; at: number; x: number; y: number; lastX: number; lastY: number }
        | undefined;
      let ticks = 0;
      const targetSeconds = config.minutes * 60;
      const complete = () =>
        state.status === 'abandoned' ||
        (state.time + 1e-7 >= targetSeconds &&
          (targetSeconds !== 2700 || state.status === 'half_time') &&
          (targetSeconds !== 5400 || state.status === 'full_time'));
      const observe = (next: TacticalMatchState) => {
        const dt = Math.max(0, next.time - state.time);
        if (state.scenario === 'open_play' && state.status !== 'half_time')
          possessionSeconds[state.possessionTeam] += dt;
        const phase = activePreparation(state)?.micro?.phase;
        if (phase) preparationPhaseSeconds[phase] = (preparationPhaseSeconds[phase] ?? 0) + dt;
        const preparation = activePreparation(next);
        const preparingPlayer =
          preparation && next.players.find((player) => player.id === preparation.actorId);
        if (
          preparationOrigin &&
          (!preparation ||
            preparationOrigin.actorId !== preparation.actorId ||
            preparationOrigin.at !== preparation.gainedAt)
        ) {
          preparationMovement.push(
            Math.hypot(
              preparationOrigin.lastX - preparationOrigin.x,
              preparationOrigin.lastY - preparationOrigin.y,
            ),
          );
          preparationOrigin = undefined;
        }
        if (preparation && preparingPlayer && !preparationOrigin)
          preparationOrigin = {
            actorId: preparation.actorId,
            at: preparation.gainedAt,
            ...preparingPlayer.position,
            lastX: preparingPlayer.position.x,
            lastY: preparingPlayer.position.y,
          };
        if (preparationOrigin && preparingPlayer) {
          preparationOrigin.lastX = preparingPlayer.position.x;
          preparationOrigin.lastY = preparingPlayer.position.y;
        }
        if (next.ball.ownerId !== ownerId) {
          if (ownerId) holds.push(Math.max(0, next.time - gainedAt));
          ownerId = next.ball.ownerId;
          gainedAt = next.time;
        }
        const reception = next.lastReceptionOutcome;
        const receptionKey = reception
          ? `${reception.receiverId}:${preparation?.gainedAt ?? next.lastPassDiagnostic?.resolvedAt}:${reception.kind}:${reception.contactPoint.x}:${reception.contactPoint.y}`
          : '';
        if (
          reception &&
          reception !== state.lastReceptionOutcome &&
          receptionKey !== lastReceptionKey
        ) {
          receptions[reception.kind]++;
          if (reception.receiverId === state.controlledFootballerId)
            controlledReceptions[reception.kind]++;
          if (reception.quality) {
            qualityScores.push(reception.quality.score);
            const pressure =
              reception.quality.pressure < 0.35
                ? 'low'
                : reception.quality.pressure < 0.65
                  ? 'medium'
                  : 'high';
            const speed =
              reception.quality.incomingSpeed < 12
                ? 'slow'
                : reception.quality.incomingSpeed < 20
                  ? 'medium'
                  : 'fast';
            const key = `${pressure}_pressure:${speed}_pass`;
            const counts = (receptionContexts[key] ??= {});
            counts[reception.kind] = (counts[reception.kind] ?? 0) + 1;
          }
          lastReceptionKey = receptionKey;
        }
        const resolvedPass =
          next.lastResolvedPass ??
          (next.lastPassDiagnostic?.finalResult ? next.lastPassDiagnostic : undefined);
        if (resolvedPass?.finalResult && resolvedPass.passId !== lastResolvedPassId) {
          lastResolvedPassId = resolvedPass.passId;
          if (
            resolvedPass.finalResult === 'completed' &&
            (resolvedPass.actualReceiverId ?? resolvedPass.intendedReceiverId) ===
              state.controlledFootballerId
          ) {
            controlledPassContacts.actualCompleted++;
            if (resolvedPass.intendedReceiverId !== state.controlledFootballerId)
              controlledPassContacts.unintendedCompleted++;
          }
          if (resolvedPass.intendedReceiverId === state.controlledFootballerId) {
            if (resolvedPass.finalResult === 'completed')
              controlledPassContacts.intendedCompleted++;
            if (resolvedPass.finalResult === 'technical_error')
              controlledPassContacts.intendedFailed++;
          } else if (
            resolvedPass.finalResult === 'unclaimed' &&
            next.ball.ownerId === state.controlledFootballerId &&
            next.players.find((player) => player.id === resolvedPass.passerId)?.team ===
              next.players.find((player) => player.id === state.controlledFootballerId)?.team
          )
            controlledPassContacts.nonIntendedTeammateClaim++;
        }
        const change = next.lastPossessionChange;
        const key = change ? `${change.at}:${change.from}:${change.to}:${change.cause}` : '';
        if (change && key !== lastPossessionKey) {
          possessionChanges++;
          lastPossessionKey = key;
        }
        state = next;
        replay?.observe(state);
      };
      process.stderr.write(
        `${config.revision} ${scenario}:${seed} ${config.minutes}min repeat ${repeat + 1}\n`,
      );
      const started = performance.now();
      const memoryBefore = process.memoryUsage();
      while (!complete()) {
        if (state.status === 'half_time') observe(engine.startSecondHalf(state));
        if (state.status === 'full_time') throw new Error('Match ended before benchmark target');
        const evaluation = decision.projectPlayerAgency(state);
        agency.observe(state, evaluation);
        if (evaluation.opportunity)
          observe(decision.resolveDevPlayerDecision(state, evaluation.opportunity).state);
        if (complete()) break;
        observe(engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT));
        ticks++;
        if (ticks > Math.ceil(targetSeconds / engine.FIXED_MATCH_DT) + 10_000)
          throw new Error('Canonical clock stopped advancing');
      }
      const elapsedMs = performance.now() - started;
      const memoryAfter = process.memoryUsage();
      // Storage estimation/hash serialization are deliberately outside the throughput timer.
      const replayStorage = replay?.snapshot();
      const stats = state.statistics?.players ?? [];
      const total = (
        key:
          | 'touches'
          | 'passesAttempted'
          | 'passesCompleted'
          | 'passesReceived'
          | 'shots'
          | 'shotsOnTarget'
          | 'distanceCovered',
      ) => stats.reduce((sum, player) => sum + player[key], 0);
      const defensive = Object.values(state.defensiveTelemetry?.byPlayer ?? {});
      const controlled = stats.find((entry) => entry.playerId === state.controlledFootballerId);
      const centre = centreModule?.projectMatchCentreStatistics(state);
      const feed = state.matchEvents;
      const discipline = Object.values(state.discipline ?? {});
      const teamOf = (id: string) =>
        state.statistics?.playerTeams?.[id] ??
        state.discipline?.[id]?.team ??
        state.players.find((player) => player.id === id)?.team;
      const result = {
        scenario,
        seed: session.setup.seed,
        repeat: repeat + 1,
        canonicalMinutes: state.time / 60,
        status: state.status,
        score: state.score,
        passes: {
          attempted: total('passesAttempted'),
          completed: total('passesCompleted'),
          received: total('passesReceived'),
        },
        touches: total('touches'),
        shots: total('shots'),
        shotsOnTarget: total('shotsOnTarget'),
        possessionChanges,
        fouls: defensive.reduce((sum, entry) => sum + entry.fouls, 0),
        yellowCards: defensive.reduce((sum, entry) => sum + entry.yellowCards, 0),
        redCards: defensive.reduce((sum, entry) => sum + entry.redCards, 0),
        distanceMetres: total('distanceCovered'),
        holdSeconds: { ...summarizeCalibrationDistribution(holds), p95: percentile(holds, 0.95) },
        receptions,
        receptionContexts,
        qualityScores: summarizeCalibrationDistribution(qualityScores),
        preparationPhaseSeconds,
        preparationMovementMetres: summarizeCalibrationDistribution(preparationMovement),
        possessionSeconds,
        agency: agency.snapshot(state.time),
        controlled: controlled
          ? {
              position: session.home.players.find(
                (entry) => entry.footballerId === state.controlledFootballerId,
              )?.profile.primaryPosition,
              touches: controlled.touches,
              passesCompleted: controlled.passesCompleted,
              passesReceived: controlled.passesReceived,
              receptions: controlledReceptions,
              passContacts: controlledPassContacts,
            }
          : undefined,
        invariants: {
          completedWithinAttempts: stats.every(
            (entry) => entry.passesCompleted <= entry.passesAttempted,
          ),
          onTargetWithinShots: stats.every((entry) => entry.shotsOnTarget <= entry.shots),
          receivedMatchesCompleted: total('passesReceived') === total('passesCompleted'),
          networkAttemptsReconcile:
            (state.statistics?.passingNetwork ?? []).reduce(
              (sum, edge) => sum + edge.attempted,
              0,
            ) === total('passesAttempted'),
          networkCompletionsReconcile:
            (state.statistics?.passingNetwork ?? []).reduce(
              (sum, edge) => sum + edge.completed,
              0,
            ) === total('passesCompleted'),
          goalFeedMatchesScore: feed
            ? ['home', 'away'].every(
                (team) =>
                  feed.filter((event) => event.kind === 'goal' && event.team === team).length ===
                  state.score[team as 'home' | 'away'],
              )
            : null,
          yellowFeedMatchesDiscipline: feed
            ? feed.filter((event) => ['yellow_card', 'second_yellow_red'].includes(event.kind))
                .length === discipline.reduce((sum, entry) => sum + entry.yellowCards, 0)
            : null,
          redFeedMatchesDismissals: feed
            ? feed.filter((event) => ['red_card', 'second_yellow_red'].includes(event.kind))
                .length === discipline.filter((entry) => entry.sentOff).length
            : null,
          teamPassesReconcile: centre
            ? centre.home.passesAttempted + centre.away.passesAttempted ===
                total('passesAttempted') &&
              centre.home.passesCompleted + centre.away.passesCompleted === total('passesCompleted')
            : null,
          teamShotsReconcile: centre
            ? centre.home.shots + centre.away.shots === total('shots') &&
              centre.home.shotsOnTarget + centre.away.shotsOnTarget === total('shotsOnTarget')
            : null,
          canonicalPossessionSums:
            centre &&
            centre.home.possessionPercentage !== undefined &&
            centre.away.possessionPercentage !== undefined
              ? Math.abs(
                  centre.home.possessionPercentage + centre.away.possessionPercentage - 100,
                ) < 1e-6
              : null,
          teamRestartCountersNonnegative: state.statistics?.teamAccounting
            ? Object.values(state.statistics.teamAccounting).every((entry) =>
                [entry.corners, entry.freeKicks, entry.throwIns, entry.offsides].every(
                  (count) => count >= 0 && Number.isInteger(count),
                ),
              )
            : null,
          allHistoricPlayersHaveTeam: stats.every((entry) => teamOf(entry.playerId) !== undefined),
        },
        centre,
        replay: { enabled: config.replay, storage: replayStorage },
        performance: {
          elapsedMs,
          ticks,
          canonicalSpeed: (state.time * 1000) / elapsedMs,
          rendererCallsBackground: 0,
          heapUsedDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
          rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
        },
        hashes: { state: hash(state), statistics: hash(state.statistics) },
      };
      const failedInvariants = Object.entries(result.invariants)
        .filter(([, valid]) => valid === false)
        .map(([name]) => name);
      if (failedInvariants.length)
        throw new Error(`Canonical accounting failed: ${failedInvariants.join(', ')}`);
      const repeated = matches.find(
        (match) => match.seed === result.seed && match.scenario === result.scenario,
      );
      if (
        repeated &&
        (repeated.hashes.state !== result.hashes.state ||
          repeated.hashes.statistics !== result.hashes.statistics)
      )
        throw new Error(`Determinism failed for ${result.seed}`);
      matches.push(result);
      process.stderr.write(
        `${(elapsedMs / 1000).toFixed(2)}s, ${result.passes.attempted} passes/${result.touches} touches, received ${result.passes.received}, receptions ${JSON.stringify(receptions)}\n`,
      );
      if (args.get('output')) {
        const output = resolve(args.get('output')!);
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(
          output,
          JSON.stringify({ config, fixedDt: engine.FIXED_MATCH_DT, matches }, null, 2) + '\n',
        );
      }
    }
process.stdout.write(
  JSON.stringify({ config, fixedDt: engine.FIXED_MATCH_DT, matches }, null, 2) + '\n',
);
