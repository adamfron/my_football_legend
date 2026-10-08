import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { z } from 'zod';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { findCanonicalDifference } from './pr156CanonicalComparison';
import { createSingleMatchSession } from '../src/core/singleMatch';
import { hashRandomSeed, RandomGenerator } from '../src/core/random/RandomGenerator';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatch,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import {
  enumerateRestartActions,
  rankAvailableActionsForAI,
  resolveMatchAction,
} from '../src/core/matchSimulation/matchActions';
import { projectPlayerDecisionOpportunity } from '../src/core/matchSimulation/playerDecision';
import { enumerateCanonicalShootingOptions } from '../src/core/matchSimulation/shootingOptions';
import { applyRestartScenario } from '../src/core/matchSimulation/restartScenarios';
import {
  assertMatchStatisticsInvariants,
  createMatchStatistics,
} from '../src/core/matchSimulation/playerMatchStats';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
} from '../src/core/matchSimulation/matchFlowTelemetry';
import {
  CentralConnectivityTracker,
  PressureSupportTracker,
} from '../src/core/matchSimulation/footballIntelligenceDiagnostics';
import { PassingConnectivityTracker } from '../src/core/matchSimulation/passingConnectivityDiagnostics';
import { PressingTracker } from '../src/core/matchSimulation/pressingDiagnostics';
import { MatchReplayHistory } from '../src/core/matchSimulation/matchReplay';
import { MatchDebugRecorder } from '../src/app/match/matchDebugCapture';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const config = z
  .object({
    seeds: z.array(z.string().min(1)).min(1),
    seconds: z.number().positive().max(2700),
    revision: z.string().min(1),
    checks: z.array(z.enum(['ownership', 'simulation'])).min(1),
  })
  .parse({
    seeds: (args.get('seeds') ?? 'lab-muwhj3er,pr155-natural-b,pr155-natural-c').split(','),
    seconds: Number(args.get('seconds') ?? 60),
    revision: args.get('revision') ?? 'PR157',
    checks: (args.get('checks') ?? 'ownership,simulation').split(','),
  });
const world = createCanonicalWorldDatabase();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const runtimeSourceFingerprint = () => {
  const collect = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory()
        ? collect(path)
        : /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
          ? [path]
          : [];
    });
  const paths = [
    ...collect(resolve('src/core')),
    ...collect(resolve('src/app/match')),
    resolve('scripts/createCanonicalWorldDatabase.ts'),
    resolve('scripts/registerTypescriptLoader.mjs'),
  ].sort();
  return {
    algorithm: 'sha256' as const,
    scope: 'Non-test TypeScript in src/core and src/app/match, canonical world fixture and loader',
    files: paths.length,
    digest: hash(
      paths.map((path) => [
        relative(process.cwd(), path).replaceAll('\\', '/'),
        createHash('sha256').update(readFileSync(path)).digest('hex'),
      ]),
    ),
  };
};
const sourceFingerprint = runtimeSourceFingerprint();
const canonical = (state: TacticalMatchState) => {
  const { controlledFootballerId: _identity, playerAgencyEnabled: _agency, ...football } = state;
  void _identity;
  void _agency;
  return football;
};
const shotGuardState = (state: TacticalMatchState) => {
  const { shotAgencyRequest: _request, ...football } = state;
  void _request;
  return football;
};
const initial = (seed: string) => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed,
      control: { mode: 'spectator' },
    }),
  );
  state.teams.home.style = 'balanced';
  state.teams.away.style = 'pressing';
  return state;
};

// Observe actual seeded generator draws. The observer never requests an additional draw.
const originalFloat = RandomGenerator.prototype.float;
let trace = createHash('sha256');
let randomCalls = 0;
let observerTrace = createHash('sha256');
let observerRandomCalls = 0;
let observing = false;
let captureStepDraws = false;
let stepDraws: string[] = [];
RandomGenerator.prototype.float = function () {
  const result = originalFloat.call(this);
  const exported = this.export();
  if (captureStepDraws) stepDraws.push(exported);
  if (observing) {
    observerTrace.update(exported + '\n');
    observerRandomCalls += 1;
  } else {
    trace.update(exported + '\n');
    randomCalls += 1;
  }
  return result;
};
const resetTrace = () => {
  trace = createHash('sha256');
  randomCalls = 0;
  observerTrace = createHash('sha256');
  observerRandomCalls = 0;
  observing = false;
  stepDraws = [];
};
const traceResult = () => ({
  randomCalls,
  randomStreamHash: trace.copy().digest('hex'),
  observerRandomCalls,
  observerRandomStreamHash: observerTrace.copy().digest('hex'),
});
const runSchema = z.object({
  canonicalHash: z.string(),
  randomCalls: z.number().int().nonnegative(),
  randomStreamHash: z.string(),
  observerRandomCalls: z.number().int().nonnegative(),
  observerRandomStreamHash: z.string(),
  ticks: z.number().int().positive(),
  elapsedMs: z.number().nonnegative(),
  pressingObserver: z
    .object({
      episodes: z.number().int().nonnegative(),
      retainedEpisodes: z.number().int().nonnegative().max(256),
      maximumRetainedEvolutionSamples: z.number().int().nonnegative().max(8),
    })
    .nullable(),
});
const shotOwnershipRowSchema = z.object({
  context: z.enum(['settled', 'first_time', 'header', 'rebound', 'pressure', 'direct_free_kick']),
  seed: z.string(),
  contact: z.string(),
  proposalsBlocked: z.number().int().positive(),
  blockedRngDraws: z.literal(0),
  footballStateUnchanged: z.literal(true),
  humanShotReleased: z.literal(true),
  humanNpcLaunchParity: z.literal(true),
  humanNpcRngParity: z.literal(true),
  ballHash: z.string(),
});
const identityRowSchema = z.object({
  playerId: z.string(),
  disabled: runSchema,
  disabledCanonicalParity: z.literal(true),
  disabledRngParity: z.literal(true),
  enabledPrefix: z.object({
    comparedTicks: z.number().int().nonnegative(),
    comparedThrough: z.number().nonnegative(),
    canonicalParity: z.literal(true),
    canonicalDrawSequencePreserved: z.literal(true),
    independentAgencyRankingDraws: z.number().int().nonnegative(),
    seededProjectionDraws: z.number().int().nonnegative(),
    opportunity: z.string().nullable(),
    actionBoundaryDivergence: z.boolean(),
    canonicalHash: z.string(),
    referenceCanonicalHash: z.string(),
  }),
});
const evidenceSchema = z.object({
  sourceFingerprint: z.object({
    algorithm: z.literal('sha256'),
    scope: z.string(),
    files: z.number().int().positive(),
    digest: z.string().length(64),
  }),
  config: z.object({
    seeds: z.array(z.string()),
    seconds: z.number(),
    revision: z.string(),
    checks: z.array(z.enum(['ownership', 'simulation'])),
  }),
  fixedStepSeconds: z.literal(0.025),
  exclusions: z.array(z.string()),
  rngDefinition: z.string(),
  shotOwnership: z.array(shotOwnershipRowSchema),
  simulations: z.array(
    z.object({
      seed: z.string(),
      normal: runSchema,
      dev: runSchema,
      capture: runSchema,
      normalDevCaptureCanonicalParity: z.literal(true),
      normalDevCaptureRngParity: z.literal(true),
      identities: z.array(identityRowSchema),
    }),
  ),
});

const contexts = shotOwnershipRowSchema.shape.context.options;
const sources = [
  'autonomous_npc',
  'autonomous_routine',
  'dev_ai_selected',
  'restart_liveness_watchdog',
] as const;
const shotFixture = (seed: string, context: (typeof contexts)[number]) => {
  let state = initial(seed);
  state.time = 30;
  state.actionCooldown = 0;
  state.scenario = 'open_play';
  state.ballOwnershipStartedAt = 20;
  delete state.restart;
  for (const player of state.players) {
    player.position = { x: player.team === 'home' ? 20 : 40, y: 8 };
    player.target = { ...player.position };
    player.velocity = { x: 0, y: 0 };
  }
  let shooter = state.players.find(
    (player) => player.team === 'home' && player.slot.position === 'striker',
  )!;
  const keeper = state.players.find(
    (player) => player.team === 'away' && player.slot.position === 'goalkeeper',
  )!;
  const passer = state.players.find(
    (player) => player.team === 'home' && player.id !== shooter.id,
  )!;
  const defender = state.players.find(
    (player) => player.team === 'away' && player.slot.position !== 'goalkeeper',
  )!;
  shooter.position = { x: 91, y: 34 };
  shooter.target = { ...shooter.position };
  shooter.facingAngle = Math.PI / 2;
  keeper.position = { x: 103, y: 34 };
  keeper.target = { ...keeper.position };
  keeper.facingAngle = -Math.PI / 2;
  state.ball = { ...shooter.position, height: 0.11, ownerId: shooter.id };
  state.possessionTeam = 'home';
  state.currentPressure = 0;
  if (context === 'pressure') {
    defender.position = { x: 91.9, y: 34.4 };
    defender.target = { ...defender.position };
    defender.velocity = { x: -4, y: 0 };
    state.currentPressure = 0.9;
  }
  if (context === 'first_time' || context === 'header' || context === 'rebound') {
    const rebound = context === 'rebound';
    state.ball = {
      x: rebound ? 91.3 : 90.7,
      y: 34,
      height: context === 'header' ? 1.8 : 0.11,
      airborne: context === 'header',
      from: { x: rebound ? 102 : 83, y: 34 },
      target: { ...shooter.position },
      velocity: { x: rebound ? -8 : 14, y: 0, z: 0 },
      lastTouchPlayerId: rebound ? keeper.id : passer.id,
      travelKind: rebound ? 'shot' : 'cross',
      sourceAction: rebound ? 'shot' : 'cross',
      intendedReceiverId: shooter.id,
    };
  }
  if (context === 'direct_free_kick') {
    state = applyRestartScenario(state, 'free_kick_close', { restartTeam: 'home' });
    shooter = state.players.find((player) => player.id === state.restart!.takerId)!;
  }
  state.statistics = createMatchStatistics(state);
  state.controlledFootballerId = shooter.id;
  state.playerAgencyEnabled = true;
  const action =
    context === 'direct_free_kick'
      ? enumerateRestartActions(state).find((candidate) => candidate.type === 'shot')
      : enumerateCanonicalShootingOptions(state, shooter.id)[0];
  assert(action, `No legal shot in ${context}`);
  return { state, action };
};

const run = (base: TacticalMatchState, mode: 'normal' | 'dev' | 'capture') => {
  let state = base;
  let telemetry = createMatchFlowTelemetry(base.seed);
  const pressure = mode === 'normal' ? undefined : new PressureSupportTracker();
  const central = mode === 'normal' ? undefined : new CentralConnectivityTracker();
  const passing = mode === 'normal' ? undefined : new PassingConnectivityTracker();
  const pressing = mode === 'normal' ? undefined : new PressingTracker();
  const replay = mode === 'normal' ? undefined : new MatchReplayHistory();
  const recorder = mode === 'capture' ? new MatchDebugRecorder() : undefined;
  let ticks = 0;
  const started = performance.now();
  resetTrace();
  while (
    state.time < config.seconds &&
    !['half_time', 'full_time', 'abandoned'].includes(state.status ?? '')
  ) {
    const previous = state;
    state =
      mode === 'normal'
        ? stepTacticalMatch(state, FIXED_MATCH_DT)
        : stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    assert(state.time > previous.time, `Simulation stalled at ${state.time}`);
    if (mode !== 'normal') {
      observing = true;
      telemetry = observeMatchFlow(telemetry, previous, state);
      pressure!.observe(previous, state);
      central!.observe(previous, state);
      passing!.observe(previous, state);
      pressing!.observe(previous, state);
      replay!.observe(state);
    }
    if (recorder) {
      recorder.record(state);
      assert(!recorder.lastObservationError, recorder.lastObservationError);
    }
    observing = false;
    ticks += 1;
  }
  pressing?.close(state);
  const pressingSnapshot = pressing?.snapshot();
  assertMatchStatisticsInvariants(state.statistics!, state);
  return runSchema.parse({
    canonicalHash: hash(canonical(state)),
    ...traceResult(),
    ticks,
    elapsedMs: performance.now() - started,
    pressingObserver: pressingSnapshot
      ? {
          episodes: pressingSnapshot.episodes,
          retainedEpisodes: pressingSnapshot.retainedEpisodes.length,
          maximumRetainedEvolutionSamples: Math.max(
            0,
            ...pressingSnapshot.retainedEpisodes.map((episode) => episode.samples.length),
          ),
        }
      : null,
  });
};

const results: z.infer<typeof evidenceSchema> = {
  config,
  sourceFingerprint,
  fixedStepSeconds: 0.025,
  exclusions: ['controlledFootballerId', 'playerAgencyEnabled'],
  rngDefinition:
    'SHA256 of ordered actual post-draw RNG exports within canonical engine entry. Optional diagnostic probes recreate independent seeded ranking noise; those draws are reported separately and cannot alter the engine stream. Blocked shots compare every football field except the permitted shotAgencyRequest and consume zero draws.',
  shotOwnership: [],
  simulations: [],
};
const out = resolve(args.get('out') ?? '.benchmark-artifacts/pr157-integrity.json');
const save = () => {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(evidenceSchema.parse(results), null, 2) + '\n');
};

try {
  if (config.checks.includes('ownership'))
    for (const seed of config.seeds)
      for (const context of contexts) {
        const { state, action } = shotFixture(`${seed}:ownership`, context);
        const before = hash(state);
        for (const source of sources) {
          resetTrace();
          const blocked = resolveMatchAction(state, action, source);
          assert.equal(
            hash(shotGuardState(blocked)),
            hash(shotGuardState(state)),
            `${context}/${source} changed football at ${findCanonicalDifference(shotGuardState(state), shotGuardState(blocked))}`,
          );
          assert.equal(hash(state), before, `${context}/${source} mutated input`);
          assert.equal(randomCalls, 0, `${context}/${source} consumed RNG`);
          const repeated = resolveMatchAction(blocked, action, source);
          assert.deepEqual(
            repeated,
            blocked,
            `${context}/${source} repeated proposal changed state`,
          );
          assert.equal(randomCalls, 0, `${context}/${source} repeated proposal consumed RNG`);
        }
        resetTrace();
        const human = resolveMatchAction(state, action, 'human_selected');
        const humanTrace = traceResult();
        const npcState = structuredClone(state);
        delete npcState.controlledFootballerId;
        resetTrace();
        const npc = resolveMatchAction(npcState, action, 'autonomous_npc');
        const npcTrace = traceResult();
        assert(human.ball.shot, `${context} human choice did not release a shot`);
        assert.deepEqual(human.ball, npc.ball, `${context} human/NPC launch differs`);
        assert.deepEqual(humanTrace, npcTrace, `${context} human/NPC RNG differs`);
        results.shotOwnership.push(
          shotOwnershipRowSchema.parse({
            context,
            seed,
            contact: human.ball.shot.contact,
            proposalsBlocked: sources.length * 2,
            blockedRngDraws: 0,
            footballStateUnchanged: true,
            humanShotReleased: true,
            humanNpcLaunchParity: true,
            humanNpcRngParity: true,
            ballHash: hash(human.ball),
          }),
        );
      }
  if (config.checks.includes('simulation'))
    for (const seed of config.seeds) {
      const base = initial(seed);
      const normal = run(base, 'normal');
      const dev = run(base, 'dev');
      const capture = run(base, 'capture');
      for (const variant of [dev, capture]) {
        assert.equal(
          variant.canonicalHash,
          normal.canonicalHash,
          `${seed}: observer changed canonical state`,
        );
        assert.equal(
          variant.randomCalls,
          normal.randomCalls,
          `${seed}: observer changed RNG calls`,
        );
        assert.equal(
          variant.randomStreamHash,
          normal.randomStreamHash,
          `${seed}: observer changed RNG stream`,
        );
      }
      const identities: z.infer<typeof identityRowSchema>[] = [];
      for (const player of base.players) {
        const disabled = run(
          { ...base, controlledFootballerId: player.id, playerAgencyEnabled: false },
          'normal',
        );
        assert.equal(
          disabled.canonicalHash,
          normal.canonicalHash,
          `${seed}/${player.id}: identity changes football`,
        );
        assert.equal(
          disabled.randomCalls,
          normal.randomCalls,
          `${seed}/${player.id}: identity changes RNG count`,
        );
        assert.equal(
          disabled.randomStreamHash,
          normal.randomStreamHash,
          `${seed}/${player.id}: identity changes RNG stream`,
        );
        let reference = base;
        let enabled: TacticalMatchState = {
          ...base,
          controlledFootballerId: player.id,
          playerAgencyEnabled: true,
        };
        let matchingReference = reference;
        let matchingEnabled = enabled;
        let comparedTicks = 0;
        let independentAgencyRankingDraws = 0;
        let actionBoundaryDivergence = false;
        let opportunity = projectPlayerDecisionOpportunity(enabled);
        while (enabled.time < config.seconds && !opportunity) {
          captureStepDraws = true;
          const precedingDecisionIndex = reference.decisionIndex;
          resetTrace();
          reference = stepTacticalMatchAfterDecisionProbe(reference, FIXED_MATCH_DT);
          const referenceDraws = [...stepDraws];
          resetTrace();
          enabled = stepTacticalMatchAfterDecisionProbe(enabled, FIXED_MATCH_DT);
          const enabledDraws = [...stepDraws];
          captureStepDraws = false;
          opportunity = projectPlayerDecisionOpportunity(enabled);
          const difference = findCanonicalDifference(canonical(reference), canonical(enabled));
          // The first genuine opportunity may project seeded option rankings or stop a CPU
          // proposal in this tick. Compare the complete prefix preceding that boundary.
          if (opportunity) {
            actionBoundaryDivergence = difference !== null;
            break;
          }
          if (difference !== null) {
            assert.fail(`${seed}/${player.id}: pre-decision leak at ${enabled.time}${difference}`);
          }
          const rankingSeeds = new Set(
            [precedingDecisionIndex, reference.decisionIndex].map((index) =>
              hashRandomSeed(`${seed}:decision:${index}:${player.id}`),
            ),
          );
          let canonicalCursor = 0;
          for (const draw of enabledDraws) {
            if (draw === referenceDraws[canonicalCursor]) canonicalCursor += 1;
            else {
              const exported = JSON.parse(draw) as { seedHash: number };
              assert(
                rankingSeeds.has(exported.seedHash),
                `${seed}/${player.id}: non-ranking RNG divergence at ${enabled.time}`,
              );
              independentAgencyRankingDraws += 1;
            }
          }
          assert.equal(
            canonicalCursor,
            referenceDraws.length,
            `${seed}/${player.id}: canonical draw lost at ${enabled.time}`,
          );
          comparedTicks += 1;
          matchingReference = reference;
          matchingEnabled = enabled;
        }
        // Ranking/projection are observers, even under enabled human agency.
        const prefix = hash(matchingEnabled);
        resetTrace();
        observing = true;
        const ranking = rankAvailableActionsForAI(matchingEnabled, player.id);
        const projected = projectPlayerDecisionOpportunity(matchingEnabled);
        assert.deepEqual(rankAvailableActionsForAI(matchingEnabled, player.id), ranking);
        assert.deepEqual(projectPlayerDecisionOpportunity(matchingEnabled), projected);
        assert.equal(hash(matchingEnabled), prefix, 'Projection mutated the agency prefix');
        observing = false;
        identities.push(
          identityRowSchema.parse({
            playerId: player.id,
            disabled,
            disabledCanonicalParity: true,
            disabledRngParity: true,
            enabledPrefix: {
              comparedTicks,
              comparedThrough: matchingEnabled.time,
              canonicalParity: true,
              canonicalDrawSequencePreserved: true,
              independentAgencyRankingDraws,
              seededProjectionDraws: observerRandomCalls,
              opportunity: opportunity?.kind ?? null,
              actionBoundaryDivergence,
              canonicalHash: hash(canonical(matchingEnabled)),
              referenceCanonicalHash: hash(canonical(matchingReference)),
            },
          }),
        );
      }
      results.simulations.push({
        seed,
        normal,
        dev,
        capture,
        normalDevCaptureCanonicalParity: true,
        normalDevCaptureRngParity: true,
        identities,
      });
      save();
      process.stderr.write(
        `${seed}: ${identities.length} identities; normal/DEV/capture exact parity\n`,
      );
    }
  assert.deepEqual(
    runtimeSourceFingerprint(),
    sourceFingerprint,
    'Runtime sources changed during run',
  );
  save();
} finally {
  RandomGenerator.prototype.float = originalFloat;
}
