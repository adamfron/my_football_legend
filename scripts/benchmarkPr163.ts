import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createFormationBenchmarkSession } from '../src/core/matchSimulation/benchmarkFixtures';
import {
  createOffensiveScenario,
  offensiveScenarioSchema,
} from '../src/core/matchSimulation/pr163Fixtures';
import { OffensiveContinuationTracker } from '../src/core/matchSimulation/offensiveContinuationFunnel';
import { AttackingFunnelTracker } from '../src/core/matchSimulation/attackingFunnel';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import { distance } from '../src/core/matchSimulation/matchSpace';
import { deriveOnBallPreparation } from '../src/core/matchSimulation/onBallPreparation';
import { findMatchParticipant } from '../src/core/matchSimulation/matchParticipants';
import { z } from 'zod';
import { TACTICAL_PREFERENCE_DEFAULTS } from '../src/core/matchSimulation/tacticalPreferences';
import type { TacticalMatchState, MatchAction } from '../src/core/matchSimulation/matchState';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const root = resolve(args.get('engine-root') ?? '.');
const load = <T>(p: string): Promise<T> => import(pathToFileURL(resolve(root, p)).href);
const engine = await load<typeof import('../src/core/matchSimulation/matchSimulation')>(
  'src/core/matchSimulation/matchSimulation.ts',
);
const actions = await load<typeof import('../src/core/matchSimulation/matchActions')>(
  'src/core/matchSimulation/matchActions.ts',
);
const stats = await load<typeof import('../src/core/matchSimulation/playerMatchStats')>(
  'src/core/matchSimulation/playerMatchStats.ts',
);
const agency = await load<typeof import('../src/core/matchSimulation/playerDecision')>(
  'src/core/matchSimulation/playerDecision.ts',
);
const opportunities = await load<typeof import('../src/core/matchSimulation/shootingOpportunity')>(
  'src/core/matchSimulation/shootingOpportunity.ts',
);
const shooting = await load<typeof import('../src/core/matchSimulation/shootingOptions')>(
  'src/core/matchSimulation/shootingOptions.ts',
);
const mode = z
  .enum(['scenarios', 'passing', 'matches', 'performance'])
  .parse(args.get('mode') ?? 'scenarios');
const repetitions = z
  .number()
  .int()
  .min(1)
  .max(64)
  .parse(Number(args.get('repetitions') ?? 4));
const digest = (x: unknown) =>
  createHash('sha256')
    .update(typeof x === 'string' ? x : JSON.stringify(x))
    .digest('hex');
const sourceHash = () => {
  const files: string[] = [];
  const walk = (folder: string) => {
    for (const e of readdirSync(folder, { withFileTypes: true })) {
      const p = resolve(folder, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) files.push(p);
    }
  };
  for (const p of ['src/core', 'src/schemas', 'src/types']) walk(resolve(root, p));
  return digest(
    files
      .sort()
      .map(
        (p) =>
          `${relative(root, p).replaceAll('\\', '/')}\0${readFileSync(p, 'utf8').replaceAll('\r\n', '\n')}\0`,
      )
      .join(''),
  );
};
const source = sourceHash();
const out = resolve(args.get('output') ?? `docs/performance/PR163-${mode}.json`);
const rows: unknown[] = [];
const manifest = {
  version: 1,
  mode,
  sourceHash: source,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  harnessHash: digest(
    [
      readFileSync(new URL(import.meta.url), 'utf8'),
      readFileSync(resolve('src/core/matchSimulation/pr163Fixtures.ts'), 'utf8'),
      readFileSync(resolve('src/core/matchSimulation/offensiveContinuationFunnel.ts'), 'utf8'),
    ]
      .map((s) => s.replaceAll('\r\n', '\n'))
      .join('\0'),
  ),
  fixedDt: engine.FIXED_MATCH_DT,
  node: process.version,
  repetitions,
};
const save = () => {
  if (sourceHash() !== source) throw new Error('Source changed during measurement.');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ manifest, rows }, null, 2));
};
const ranking = (s: TacticalMatchState, id: string) =>
  actions
    .rankAvailableActionsForAI(s, id)
    .slice(0, 8)
    .map((r) => ({ action: r.action, score: r.score, canonicalScore: r.canonicalScore }));

if (mode === 'scenarios') {
  for (const scenario of offensiveScenarioSchema.options)
    for (const seed of ['pr163-case-1', 'pr163-case-2', 'pr163-case-3']) {
      const fixture = createOffensiveScenario(scenario, seed, engine.createTacticalMatch);
      const initialHash = digest(fixture.state);
      const initial = ranking(fixture.state, fixture.action.actorId);
      let state = actions.resolveMatchAction(
        fixture.state,
        scenario === 'central_vs_backward_switch'
          ? (actions.chooseNpcAction(fixture.state, fixture.action.actorId) ?? fixture.action)
          : fixture.action,
        scenario === 'human_winger' ? 'human_selected' : 'autonomous_npc',
      );
      const funnel = new OffensiveContinuationTracker();
      funnel.observe(fixture.state, state);
      const trace: unknown[] = [];
      let receptionRanking: unknown = null,
        lastDecision = state.decisionIndex;
      const initialPassId = state.lastPassDiagnostic?.passId;
      let firstPassResult: unknown = null;
      const wingerOrigin = fixture.state.players.find((p) => p.id === fixture.wingerId)!.position;
      for (let tick = 0; tick < 480 && state.status !== 'full_time'; tick++) {
        const previous = state;
        state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
        funnel.observe(previous, state);
        const firstPass =
          state.lastResolvedPass?.passId === initialPassId
            ? state.lastResolvedPass
            : state.lastPassDiagnostic?.passId === initialPassId
              ? state.lastPassDiagnostic
              : undefined;
        if (!firstPassResult && firstPass?.finalResult)
          firstPassResult = {
            result: firstPass.finalResult,
            at: firstPass.resolvedAt,
            receiverId: firstPass.actualReceiverId,
            reception: firstPass.receptionOutcome,
          };
        if (!receptionRanking && state.ball.ownerId === fixture.wingerId)
          receptionRanking = { time: state.time, ranking: ranking(state, fixture.wingerId) };
        if (
          state.decisionIndex !== lastDecision ||
          previous.ball.ownerId !== state.ball.ownerId ||
          (trace.length < 8 && previous.lastGroundContact?.at !== state.lastGroundContact?.at)
        ) {
          lastDecision = state.decisionIndex;
          if (trace.length < 24)
            trace.push({
              time: state.time,
              ownerId: state.ball.ownerId ?? null,
              ball: {
                x: state.ball.x,
                y: state.ball.y,
                height: state.ball.height,
                velocity: state.ball.velocity,
              },
              action: state.latestAction,
              contact: state.lastGroundContact?.executed ?? null,
              reception: state.lastReceptionOutcome?.kind ?? null,
              passResult: state.lastPassDiagnostic?.finalResult ?? null,
            });
        }
        if (scenario === 'human_winger' && agency.projectPlayerDecisionOpportunity(state)) break;
      }
      stats.assertMatchStatisticsInvariants(state.statistics!);
      const winger = findMatchParticipant(state, fixture.wingerId)!;
      rows.push({
        scenario,
        seed,
        initialHash,
        initial,
        receptionRanking,
        trace,
        firstPassResult,
        funnel: funnel.snapshot(),
        end: {
          time: state.time,
          status: state.status,
          ownerId: state.ball.ownerId ?? null,
          wingerDisplacement: distance(wingerOrigin, winger.position),
          speed: Math.hypot(winger.velocity.x, winger.velocity.y),
          workload: winger.fitness?.workload,
          contacts: state.contactControlTelemetry,
          carry: state.lastCarryDiagnostic,
          passResult: state.lastResolvedPass?.finalResult,
          humanDecision: Boolean(agency.projectPlayerDecisionOpportunity(state)),
          stateHash: digest(state),
        },
      });
      save();
      console.log(`scenario ${scenario} ${seed}`);
    }
} else if (mode === 'passing') {
  // Matched base plus one-factor receiver/defensive perturbations. All lengths/abilities/pressure
  // are crossed; contexts are explicitly not a dense factorial league simulation.
  const contexts = [
    'stationary',
    'toward',
    'away',
    'sprint',
    'turned',
    'weak_foot',
    'fatigued',
    'lane',
    'near_target',
    'tracking',
    'keeper',
  ] as const;
  for (const metres of [5, 10, 15, 20, 30, 40, 50, 60])
    for (const quality of [25, 50, 75, 95])
      for (const pressure of ['none', 'moderate', 'severe'] as const)
        for (const context of contexts)
          for (const delivery of ['ground', 'lofted'] as const) {
            const totals = {
              n: 0,
              predicted: 0,
              deliveryError: 0,
              ballTargetDisplacement: 0,
              receiverArrival: 0,
              interceptions: 0,
              firstTouchFailures: 0,
              completed: 0,
              retained: 0,
              useful: 0,
            };
            for (let sample = 0; sample < repetitions; sample++) {
              const f = createOffensiveScenario(
                'elite_winger',
                `pr163-pass:${context}:${delivery}:${sample}`,
                engine.createTacticalMatch,
              );
              let state = f.state;
              const passer = state.players.find((p) => p.id === f.passerId)!,
                receiver = state.players.find((p) => p.id === f.wingerId)!;
              for (const p of state.players) {
                p.position = { x: p.team === 'home' ? 3 : 100, y: 4 + p.slotIndex * 5 };
                p.target = { ...p.position };
              }
              passer.position = { x: 15, y: 34 };
              passer.target = { ...passer.position };
              passer.facingAngle = Math.PI / 2;
              Object.assign(passer.profile.attributes, {
                passing: quality,
                technique: quality,
                gameReading: quality,
                composure: quality,
              });
              receiver.position = { x: 15 + metres, y: 34 };
              receiver.target = { ...receiver.position };
              receiver.velocity = {
                x:
                  context === 'toward' ? -3 : context === 'away' ? 3 : context === 'sprint' ? 6 : 0,
                y: 0,
              };
              receiver.facingAngle = context === 'turned' ? Math.PI / 2 : -Math.PI / 2;
              if (context === 'weak_foot') {
                receiver.profile.weakFootProficiency = 10;
                receiver.position.y = 34.5;
              }
              if (context === 'fatigued') {
                receiver.fitness!.longTermCapacity = 0.35;
                receiver.fitness!.burstReadiness = 0.2;
              }
              const defenders = state.players.filter((p) => p.team === 'away');
              const pressurePlayer = defenders.find((p) => p.slot.position === 'striker')!;
              if (pressure !== 'none')
                pressurePlayer.position = { x: 15, y: 34 + (pressure === 'moderate' ? 6 : 1.5) };
              const defender = state.players.find((p) => p.id === f.defenderId)!;
              if (context === 'lane') defender.position = { x: 15 + metres * 0.55, y: 34.3 };
              if (context === 'near_target')
                defender.position = { x: receiver.position.x + 1.2, y: 35 };
              if (context === 'tracking') {
                defender.position = { x: receiver.position.x - 1.5, y: 36 };
                defender.velocity = { x: receiver.velocity.x, y: 0 };
              }
              if (context === 'keeper')
                defenders.find((p) => p.slot.position === 'goalkeeper')!.position = {
                  x: receiver.position.x + 3,
                  y: 34,
                };
              state.ball = {
                ...passer.position,
                ownerId: passer.id,
                height: 0.11,
                lastTouchPlayerId: passer.id,
              };
              state.onBallPreparation = deriveOnBallPreparation(
                { ...state, time: 18 },
                passer,
                'clean_control',
              );
              const target = { ...receiver.position };
              const intent =
                context === 'sprint' || context === 'away'
                  ? ('lead' as const)
                  : ('progressive' as const);
              const action: MatchAction = {
                type: 'pass',
                actorId: passer.id,
                receiverId: receiver.id,
                target,
                intent,
                delivery,
              };
              state = actions.resolveMatchAction(state, action);
              const prediction = state.lastPassDiagnostic!.selectionQuality!;
              const passId = state.lastPassDiagnostic!.passId;
              const error = distance(
                state.lastPassDiagnostic!.intendedTarget!,
                state.lastPassDiagnostic!.physicalTarget!,
              );
              let minimumDisplacement = Infinity,
                arrival = 8,
                result = '',
                controlled = false,
                retained = false,
                useful = false;
              for (let tick = 0; tick < 320; tick++) {
                state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
                if (state.lastPassDiagnostic?.passId === passId)
                  minimumDisplacement = Math.min(minimumDisplacement, distance(state.ball, target));
                const pass =
                  state.lastResolvedPass?.passId === passId
                    ? state.lastResolvedPass
                    : state.lastPassDiagnostic?.passId === passId
                      ? state.lastPassDiagnostic
                      : undefined;
                if (pass?.finalResult && !result) {
                  result = pass.finalResult;
                  arrival = (pass.resolvedAt ?? state.time) - 20;
                  controlled = pass.actualReceiverId === receiver.id && result === 'completed';
                }
                if (
                  controlled &&
                  state.time > 20 + arrival + 1 &&
                  state.ball.ownerId === receiver.id
                )
                  retained = true;
                const live = findMatchParticipant(state, receiver.id)!;
                if (
                  controlled &&
                  state.ball.ownerId === receiver.id &&
                  live.position.x - target.x >= 5
                )
                  useful = true;
                if (result && state.time > 20 + arrival + 2) break;
              }
              totals.n++;
              totals.predicted += prediction.expectedCompletion;
              totals.deliveryError += error;
              totals.ballTargetDisplacement += Number.isFinite(minimumDisplacement)
                ? minimumDisplacement
                : 0;
              totals.receiverArrival += arrival;
              totals.interceptions += Number(result === 'intercepted');
              totals.firstTouchFailures += Number(result === 'technical_error');
              totals.completed += Number(controlled);
              totals.retained += Number(retained);
              totals.useful += Number(useful);
            }
            rows.push({ metres, quality, pressure, context, delivery, totals });
            if (rows.length % 22 === 0) {
              save();
              console.log(`passing ${rows.length}/2112 cells`);
            }
          }
} else if (mode === 'matches') {
  const world = createCanonicalWorldDatabase();
  const seeds = (args.get('seeds') ?? 'pr163-paired-1').split(',');
  for (const fixture of [
    'clubs',
    'balanced',
    'equal',
    'strong_passer_fast_winger',
    'weak_passer_fast_winger',
    'technical_midfield',
    'equal_442',
  ] as const)
    if (!args.has('fixtures') || args.get('fixtures')!.split(',').includes(fixture))
      for (const seed of seeds)
        for (const reversed of [false, true]) {
          const session =
            fixture === 'clubs'
              ? createSingleMatchSession(world, {
                  homeClubId: reversed ? 'pro_1' : 'pro_9',
                  awayClubId: reversed ? 'pro_9' : 'pro_1',
                  seed,
                  control: { mode: 'spectator' },
                })
              : createFormationBenchmarkSession({
                  anchor: fixture === 'equal_442' ? '4-4-2' : '4-3-3',
                  opponent: '4-4-2',
                  attributes: fixture === 'balanced' ? 70 : 60,
                  seed,
                  reversed,
                });
          if (
            fixture === 'strong_passer_fast_winger' ||
            fixture === 'weak_passer_fast_winger' ||
            fixture === 'technical_midfield'
          ) {
            const team = reversed ? session.away : session.home;
            const midfielder = team.players.find((p) => p.slot.position === 'central_midfielder')!;
            Object.assign(midfielder.profile.attributes, {
              passing: fixture === 'weak_passer_fast_winger' ? 35 : 90,
              technique: 90,
              gameReading: 85,
              composure: 85,
            });
            for (const p of team.players.filter((p) => p.slot.position.includes('winger')))
              Object.assign(p.profile.attributes, {
                pace: 90,
                dribbling: 85,
                technique: 85,
                firstTouch: 80,
              });
          }
          const fixtureHash = digest(session);
          let state = engine.createTacticalMatch(structuredClone(session));
          state.playerAgencyEnabled = false;
          if (fixture === 'balanced')
            for (const side of ['home', 'away'] as const) {
              state.teams[side].style = 'balanced';
              state.teams[side].tacticalPreferences = { ...TACTICAL_PREFERENCE_DEFAULTS.balanced };
            }
          if (fixture === 'technical_midfield') {
            state.teams[reversed ? 'home' : 'away'].style = 'pressing';
            state.teams[reversed ? 'home' : 'away'].tacticalPreferences = {
              ...TACTICAL_PREFERENCE_DEFAULTS.pressing,
              compactness: 0.95,
              organisedPress: 0.9,
            };
          }
          const initialStateHash = digest(state),
            funnel = new OffensiveContinuationTracker(),
            attacking = new AttackingFunnelTracker(
              {
                ranking: actions.rankAvailableActionsForAI,
                opportunity: opportunities.evaluateShootingOpportunity,
                executable: shooting.canExecuteCanonicalShot,
                delay: actions.npcPossessionDecisionDelay,
              },
              false,
            );
          const start = performance.now();
          let ticks = 0;
          while (
            state.status !== 'full_time' &&
            state.status !== 'abandoned' &&
            state.time < 7200
          ) {
            if (state.status === 'half_time') state = engine.startSecondHalf(state);
            const previous = state;
            state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
            ticks++;
            funnel.observe(previous, state);
            attacking.observe(previous, state);
            if (ticks % 24000 === 0)
              console.log(
                `match ${fixture} ${seed} reversed=${reversed} t=${state.time.toFixed(1)}`,
              );
          }
          stats.assertMatchStatisticsInvariants(state.statistics!);
          const observation = funnel.snapshot();
          const completed = state.statistics!.players.reduce((n, p) => n + p.passesCompleted, 0);
          const attempted = state.statistics!.players.reduce((n, p) => n + p.passesAttempted, 0);
          if (
            (observation.counts.result_completed ?? 0) !== completed ||
            (observation.counts.released ?? 0) !== attempted
          )
            throw new Error(
              `Continuation/official pass ledger mismatch: ${JSON.stringify({ completed, attempted, counts: observation.counts })}`,
            );
          rows.push({
            fixture,
            seed,
            reversed,
            fixtureHash,
            initialStateHash,
            teamStyles: { home: state.teams.home.style, away: state.teams.away.style },
            finalStateHash: digest(state),
            status: state.status,
            time: state.time,
            ticks,
            wallMs: performance.now() - start,
            score: state.score,
            statistics: {
              players: state.statistics?.players,
              teamAccounting: state.statistics?.teamAccounting,
            },
            continuation: funnel.snapshot(),
            attacking: attacking.snapshot(),
          });
          save();
          console.log(`completed ${fixture} ${seed} reversed=${reversed}`);
        }
} else {
  for (const scenario of ['elite_winger', 'immediate_pressure', 'baran_equivalent'] as const) {
    const { state, wingerId } = createOffensiveScenario(
      scenario,
      'pr163-performance',
      engine.createTacticalMatch,
    );
    const actor = state.players.find((p) => p.id === wingerId)!;
    state.ball = { ...actor.position, ownerId: actor.id };
    const before = digest(state);
    const samples: number[] = [];
    for (let block = 0; block < 7; block++) {
      const start = performance.now();
      for (let i = 0; i < 50; i++) actions.rankAvailableActionsForAI(state, actor.id);
      samples.push((performance.now() - start) / 50);
    }
    rows.push({
      scenario,
      rankMilliseconds: samples,
      candidates: actions.enumerateAvailableActions(state, actor.id).length,
      stateUnchanged: digest(state) === before,
    });
  }
}
save();
console.log(`saved ${rows.length} rows to ${out}`);
