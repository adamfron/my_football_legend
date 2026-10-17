import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  createDynamicFixture,
  dynamicFixtureOptionsSchema,
  type DynamicFixtureOptions,
} from '../src/core/matchSimulation/pr173Fixtures';
import { pr172Hash, pr172SourceHash } from './pr172Evidence';
import {
  tacticalMatchStateSchema,
  type TacticalMatchState,
  type MatchAction,
} from '../src/core/matchSimulation/matchState';
import { distance, signedForwardDistance } from '../src/core/matchSimulation/matchSpace';
import { normalizeAngle } from '../src/core/matchSimulation/playerOrientation';
import { OffensiveContinuationTracker } from '../src/core/matchSimulation/offensiveContinuationFunnel';
import { createPr173ResearchFixture } from './pr173ResearchFixtures';

const args = new Map(
  process.argv.slice(2).map((v) => {
    const [k, ...r] = v.replace(/^--/, '').split('=');
    return [k, r.join('=')];
  }),
);
const root = resolve(args.get('engine-root') ?? '.');
const stage = args.get('stage') ?? 'A';
const out = resolve(args.get('output-dir') ?? 'docs/performance');
mkdirSync(out, { recursive: true });
const moduleAt = (path: string) =>
  import(pathToFileURL(resolve(root, 'src/core/matchSimulation', path)).href);
const sim = (await moduleAt(
  'matchSimulation.ts',
)) as typeof import('../src/core/matchSimulation/matchSimulation');
const actions = (await moduleAt(
  'matchActions.ts',
)) as typeof import('../src/core/matchSimulation/matchActions');
const fitness = (await moduleAt(
  'matchFitness.ts',
)) as typeof import('../src/core/matchSimulation/matchFitness');
const arrival = (await moduleAt(
  'playerArrival.ts',
)) as typeof import('../src/core/matchSimulation/playerArrival');
const passing = (await moduleAt(
  'passDecision.ts',
)) as typeof import('../src/core/matchSimulation/passDecision');
const shooting = (await moduleAt(
  'shootingOpportunity.ts',
)) as typeof import('../src/core/matchSimulation/shootingOpportunity');
const manifest = {
  version: 1,
  stage,
  sourceHash: pr172SourceHash(root),
  node: process.version,
  dt: 0.025,
  method:
    'Identical frozen full states and seeded execution. Prescribed opening action, then ordinary autonomous canonical decisions for 5s. Times are seconds; distances metres. Indices are uncalibrated forecasts, not success probabilities.',
  harnessHash: pr172Hash(
    readFileSync('scripts/benchmarkPr173.ts', 'utf8') +
      readFileSync('scripts/pr173ResearchFixtures.ts', 'utf8') +
      readFileSync('src/core/matchSimulation/pr173Fixtures.ts', 'utf8'),
  ),
};
const sampleSchema = z.object({
  at: z.number(),
  separation: z.number(),
  speed: z.number(),
  defenderSpeed: z.number(),
  position: z.object({ x: z.number(), y: z.number() }),
  ballGap: z.number(),
  headingChange: z.number(),
  facingChange: z.number(),
  ownerId: z.string().nullable(),
  teamRetained: z.boolean(),
  forward: z.number(),
  defenderTurn: z.number(),
  nextOptions: z
    .object({
      clearPassLanes: z.number(),
      clearForwardPassLanes: z.number(),
      shootingCategory: z.string(),
      visibleGoalArea: z.number(),
      bestAction: z.string().nullable(),
    })
    .nullable(),
});
const runSchema = z.object({
  initialHash: z.string(),
  finalHash: z.string(),
  accepted: z.boolean(),
  firstReception: z.unknown(),
  firstPassRelease: z.unknown(),
  firstActionAfterReception: z.unknown(),
  firstIntervention: z.unknown(),
  firstChallengeCommitment: z.unknown(),
  duels: z.array(z.unknown()),
  canonicalContacts: z.number(),
  fouls: z.number(),
  cards: z.number(),
  turnover: z.unknown(),
  restart: z.unknown(),
  samples: z.array(sampleSchema),
  continuation: z.unknown(),
  wallMs: z.number(),
  maxControlledForward: z.number(),
});
const run = (
  input: TacticalMatchState,
  action?: MatchAction,
  actorId = action?.actorId ?? input.ball.ownerId!,
  observe = true,
) => {
  const initial = structuredClone(input),
    actor = initial.players.find((p) => p.id === actorId)!;
  const initialFouls = initial.defensiveTelemetry?.fouls ?? 0;
  const initialCards = Object.values(initial.discipline ?? {}).reduce(
    (n, p) => n + (p.yellowCards ?? 0) + (p.sentOff ? 1 : 0),
    0,
  );
  const defender = initial.players
    .filter((p) => p.team !== actor.team)
    .sort(
      (a, b) => distance(a.position, actor.position) - distance(b.position, actor.position),
    )[0]!;
  let state = action ? actions.resolveMatchAction(initial, action, 'autonomous_npc') : initial;
  const accepted = !action || state !== initial;
  const tracker = new OffensiveContinuationTracker(true);
  if (observe) tracker.observe(initial, state);
  const samples: z.infer<typeof sampleSchema>[] = [];
  let firstReception: unknown = null,
    firstActionAfterReception: unknown = null,
    receptionAt: number | undefined;
  let firstPassRelease: unknown = null;
  let firstIntervention: unknown = null,
    contacts = 0,
    maxControlledForward = 0;
  let firstChallengeCommitment: unknown = null;
  const duels: unknown[] = [];
  const started = performance.now();
  for (let tick = 0; tick < 200; tick++) {
    const previous = state;
    state = sim.stepTacticalMatchAfterDecisionProbe(state, 0.025);
    if (observe) tracker.observe(previous, state);
    const player = state.players.find((p) => p.id === actorId)!;
    const marker = state.players.find((p) => p.id === defender.id)!;
    const old = previous.players.find((p) => p.id === actorId)!;
    const elapsed = state.time - initial.time;
    if (
      firstPassRelease === null &&
      state.lastPassDiagnostic?.passerId === actorId &&
      state.lastPassDiagnostic.passId !== initial.lastPassDiagnostic?.passId
    )
      firstPassRelease = {
        at: elapsed,
        action: state.latestAction,
        speed: Math.hypot(player.velocity.x, player.velocity.y),
        position: player.position,
        ball: state.ball,
      };
    if (
      state.lastReceptionOutcome !== previous.lastReceptionOutcome &&
      state.lastReceptionOutcome?.receiverId === actorId &&
      firstReception === null
    ) {
      receptionAt = state.time;
      firstReception = {
        at: elapsed,
        outcome: state.lastReceptionOutcome,
        speedBefore: Math.hypot(old.velocity.x, old.velocity.y),
        speedAfter: Math.hypot(player.velocity.x, player.velocity.y),
        ballAtPreviousTick: previous.ball,
        ballAtContactTick: state.ball,
        playerPosition: player.position,
      };
    }
    if (
      receptionAt !== undefined &&
      !firstActionAfterReception &&
      state.decisionIndex !== previous.decisionIndex &&
      state.latestAction?.actorId === actorId
    )
      firstActionAfterReception = { delay: state.time - receptionAt, action: state.latestAction };
    if (state.ball.ownerId === actorId)
      maxControlledForward = Math.max(
        maxControlledForward,
        signedForwardDistance(actor.position, player.position, player),
      );
    if (firstChallengeCommitment === null && state.defensiveChallenge?.opponentId === actorId)
      firstChallengeCommitment = { at: elapsed, challenge: state.defensiveChallenge };
    const challenge =
      state.lastChallenge?.id !== previous.lastChallenge?.id ? state.lastChallenge : undefined;
    if (challenge) duels.push(challenge);
    if (
      firstIntervention === null &&
      ((state.ball.ownerId &&
        state.players.find((p) => p.id === state.ball.ownerId)?.team !== actor.team) ||
        (challenge?.opponentId === actorId && (challenge.ballFirst || challenge.opponentContact)))
    )
      firstIntervention = {
        at: elapsed,
        challenge: challenge ?? null,
        ownerId: state.ball.ownerId ?? null,
      };
    if (
      state.lastGroundContact?.at !== previous.lastGroundContact?.at &&
      state.lastGroundContact?.executed
    )
      contacts++;
    if ([20, 40, 80, 200].includes(tick + 1)) {
      let nextOptions = null;
      if (observe && state.ball.ownerId === actorId && state.scenario === 'open_play') {
        const ranking = actions.rankAvailableActionsForAI(state, actorId);
        const passes = ranking
          .filter((r) => r.action.type === 'pass')
          .map((r) => {
            const a = r.action as Extract<MatchAction, { type: 'pass' }>;
            const receiver = state.players.find((p) => p.id === a.receiverId)!;
            return {
              action: a,
              forecast: passing.evaluatePassDecision(
                state,
                player,
                receiver,
                a.target,
                a.intent,
                a.delivery,
                undefined,
                a.firstTime,
              ),
            };
          })
          .filter(
            (p) =>
              p.forecast.laneOccupation === 0 && (p.forecast.expectedRetainedPossession ?? 0) > 0.6,
          );
        const shot = shooting.evaluateShootingOpportunity(state, player);
        nextOptions = {
          clearPassLanes: passes.length,
          clearForwardPassLanes: passes.filter(
            (p) => signedForwardDistance(player.position, p.action.target, player) > 5,
          ).length,
          shootingCategory: shot.category,
          visibleGoalArea: shot.visibleTargetArea,
          bestAction: ranking[0]?.action.type ?? null,
        };
      }
      samples.push(
        sampleSchema.parse({
          at: elapsed,
          separation: distance(player.position, marker.position),
          speed: Math.hypot(player.velocity.x, player.velocity.y),
          defenderSpeed: Math.hypot(marker.velocity.x, marker.velocity.y),
          position: player.position,
          ballGap: distance(player.position, state.ball),
          headingChange: Math.abs(
            normalizeAngle(
              Math.atan2(player.velocity.x, player.velocity.y) -
                Math.atan2(actor.velocity.x, actor.velocity.y),
            ),
          ),
          facingChange: Math.abs(normalizeAngle(player.facingAngle - actor.facingAngle)),
          ownerId: state.ball.ownerId ?? null,
          teamRetained: state.possessionTeam === actor.team,
          forward: signedForwardDistance(actor.position, player.position, player),
          defenderTurn: Math.abs(normalizeAngle(marker.facingAngle - defender.facingAngle)),
          nextOptions,
        }),
      );
    }
  }
  const discipline = Object.values(state.discipline ?? {});
  return runSchema.parse({
    initialHash: pr172Hash(input),
    finalHash: pr172Hash(state),
    accepted,
    firstReception,
    firstPassRelease,
    firstActionAfterReception,
    firstIntervention,
    firstChallengeCommitment,
    duels,
    canonicalContacts: contacts,
    fouls: (state.defensiveTelemetry?.fouls ?? 0) - initialFouls,
    cards:
      discipline.reduce((n, p) => n + (p.yellowCards ?? 0) + (p.sentOff ? 1 : 0), 0) - initialCards,
    turnover: state.lastPossessionLoss ?? null,
    restart: state.restart ?? null,
    samples,
    continuation: observe ? tracker.snapshot() : null,
    maxControlledForward,
    wallMs: performance.now() - started,
  });
};

const mode = args.get('mode') ?? 'scenarios';
if (mode === 'extensions') {
  const rows = [];
  for (const opening of ['layoff', 'layoff_run', 'overlap', 'revalidation'] as const)
    for (const cover of [false, true])
      for (const mirrored of [false, true]) {
        const f = createPr173ResearchFixture({ opening, cover, mirrored }, sim.createTacticalMatch);
        tacticalMatchStateSchema.parse(f.state);
        rows.push({
          options: f.extension,
          initialHash: pr172Hash(f.state),
          selectedIntent:
            f.state.pendingReceptionIntent ?? f.state.receptionPreparation?.continuation,
          result: run(f.state, undefined, f.actorId),
        });
      }
  writeFileSync(
    resolve(out, `PR173-${stage}-extensions.json`),
    JSON.stringify({ manifest, rows }, null, 2) + '\n',
  );
  console.log(`${rows.length} canonical layoff/overlap/revalidation continuations`);
} else if (mode === 'scenarios') {
  const rows: unknown[] = [];
  for (const scenario of dynamicFixtureOptionsSchema.shape.scenario.options) {
    const cases: DynamicFixtureOptions[] = [];
    const base = { scenario };
    cases.push(base);
    for (const motion of ['aligned', 'stationary', 'recovering'] as const)
      cases.push({ ...base, motion });
    for (const cover of [true]) cases.push({ ...base, cover });
    for (const skill of [25, 55]) cases.push({ ...base, skill });
    for (const agility of [25]) cases.push({ ...base, agility });
    for (const readiness of [0.6, 0.3, 0.1, 0.01]) cases.push({ ...base, readiness });
    cases.push({ ...base, facingAway: true }, { ...base, approachSpeed: 2 });
    for (const mirrored of [true])
      cases.push({ ...base, mirrored }, { ...base, mirrored, secondHalf: true });
    cases.push({ ...base, secondHalf: true });
    if (scenario.endsWith('1a'))
      cases.push({ ...base, receiverSpeed: 0 }, { ...base, passSpeed: 20 });
    else
      for (const direction of ['straight', 'outside'] as const) cases.push({ ...base, direction });
    for (const input of cases) {
      const fixture = createDynamicFixture(input, sim.createTacticalMatch);
      tacticalMatchStateSchema.parse(fixture.state);
      const actor = fixture.state.players.find((p) => p.id === fixture.actorId)!;
      const marker = fixture.state.players.find((p) => p.id === fixture.defenderId)!;
      const target =
        'target' in fixture.action && !scenario.endsWith('1a')
          ? fixture.action.target
          : actor.target;
      const result = run(
        fixture.state,
        scenario.endsWith('1a') ? undefined : fixture.action,
        fixture.actorId,
      );
      rows.push({
        options: fixture.options,
        initialHash: pr172Hash(fixture.state),
        defender: {
          position: marker.position,
          velocity: marker.velocity,
          facing: marker.facingAngle,
        },
        legacyEta: arrival.estimatePlayerArrivalTime(fixture.state, marker, target, 'intercept'),
        result,
      });
    }
  }
  writeFileSync(
    resolve(out, `PR173-${stage}-scenarios.json`),
    JSON.stringify({ manifest, rows }, null, 2) + '\n',
  );
  console.log(`stage ${stage}: ${rows.length} canonical scenario continuations`);
} else if (mode === 'pressure') {
  const dynamic = (await moduleAt(
    'dynamicIntervention.ts',
  )) as typeof import('../src/core/matchSimulation/dynamicIntervention');
  const rows = [];
  for (const motion of ['crossing', 'aligned', 'stationary', 'recovering'] as const)
    for (const readiness of [1, 0.6, 0.3, 0.1, 0.01])
      for (const cover of [false, true]) {
        const f = createDynamicFixture(
          { scenario: 'pr173-winger-cut-1b', motion, cover },
          sim.createTacticalMatch,
        );
        const actor = f.state.players.find((p) => p.id === f.actorId)!,
          marker = f.state.players.find((p) => p.id === f.defenderId)!;
        marker.fitness!.burstReadiness = readiness;
        const target = { x: 72, y: 15 };
        rows.push({
          motion,
          readiness,
          cover,
          initialHash: pr172Hash(f.state),
          position: marker.position,
          velocity: marker.velocity,
          legacy: arrival.estimatePlayerArrivalTime(f.state, marker, target, 'intercept'),
          dynamic: dynamic.projectDynamicIntervention(marker, target),
          earliest: dynamic.earliestDynamicIntervention(f.state, actor, target),
        });
      }
  writeFileSync(
    resolve(out, `PR173-relative-motion-pressure.json`),
    JSON.stringify({ manifest, rows }, null, 2) + '\n',
  );
} else if (mode === 'intervention') {
  const dynamic = (await moduleAt(
    'dynamicIntervention.ts',
  )) as typeof import('../src/core/matchSimulation/dynamicIntervention');
  const geometry = (await moduleAt(
    'ballContactGeometry.ts',
  )) as typeof import('../src/core/matchSimulation/ballContactGeometry');
  const rows = [];
  for (const motion of ['crossing', 'aligned', 'stationary', 'recovering'] as const)
    for (const readiness of [1, 0.3, 0.01])
      for (const agility of [25, 85]) {
        const f = createDynamicFixture(
          { scenario: 'pr173-winger-cut-1b', motion },
          sim.createTacticalMatch,
        );
        const actor = f.state.players.find((p) => p.id === f.actorId)!,
          defender = f.state.players.find((p) => p.id === f.defenderId)!;
        const target = { x: 72, y: 15 };
        actor.position = { x: 71, y: 15 };
        actor.target = { ...actor.position };
        actor.velocity = { x: 0, y: 0 };
        defender.profile.attributes.agility = agility;
        defender.fitness!.burstReadiness = readiness;
        f.state.ball = { ...target, ownerId: actor.id, lastTouchPlayerId: actor.id, height: 0.11 };
        f.state.actionCooldown = 3;
        delete f.state.onBallPreparation;
        f.state.playerMovementIntent = {
          actorId: defender.id,
          type: 'attack_space',
          target,
          startedAt: f.state.time,
          expiresAt: f.state.time + 3,
        };
        const forecast = dynamic.projectDynamicIntervention(defender, target);
        const legacy = arrival.estimatePlayerArrivalTime(f.state, defender, target, 'intercept');
        const initialHash = pr172Hash(f.state);
        let state = f.state,
          actualEnvelopeArrival: number | null = null,
          actualBallIntervention: number | null = null;
        for (let tick = 0; tick < 100; tick++) {
          state = sim.stepTacticalMatchAfterDecisionProbe(state);
          const d = state.players.find((p) => p.id === defender.id)!,
            feet = geometry.playerContactGeometry(d),
            elapsed = state.time - f.state.time;
          if (
            actualEnvelopeArrival === null &&
            (distance(d.position, target) <= 0.8 ||
              Math.min(distance(feet.leftFoot, target), distance(feet.rightFoot, target)) <=
                feet.footReach)
          )
            actualEnvelopeArrival = elapsed;
          if (
            actualBallIntervention === null &&
            (state.ball.ownerId === defender.id ||
              (state.lastChallenge?.actorId === defender.id && state.lastChallenge.ballFirst))
          )
            actualBallIntervention = elapsed;
        }
        rows.push({
          motion,
          readiness,
          agility,
          initialHash,
          target,
          forecast,
          legacy,
          actualEnvelopeArrival,
          actualBallIntervention,
          forecastError:
            actualEnvelopeArrival === null ? null : forecast.seconds - actualEnvelopeArrival,
          lastChallenge: state.lastChallenge ?? null,
          finalHash: pr172Hash(state),
        });
      }
  writeFileSync(
    resolve(out, 'PR173-intervention-validation.json'),
    JSON.stringify(
      {
        manifest,
        method:
          'Prescribed defender route to a fixed initially occupied ball location through the canonical match. Actual fixed-point envelope arrival and actual ball intervention are separate; the owner can control/move the ball and real challenges/contacts remain active. Censor at 2.5s; do not substitute censored values into mean error.',
        rows,
      },
      null,
      2,
    ) + '\n',
  );
} else if (mode === 'fitness') {
  const rows: unknown[] = [];
  for (const speed of [0, 1.5, 3, 4.5, 7.5])
    for (const pressing of [false, true]) {
      const f = createDynamicFixture(
        { scenario: 'pr173-winger-cut-1b', readiness: 0.01 },
        sim.createTacticalMatch,
      );
      let player = f.state.players.find((p) => p.id === f.actorId)!;
      const readings: unknown[] = [];
      for (let tick = 0; tick < 2400; tick++) {
        player = {
          ...player,
          fitness: fitness.advanceMatchFitness(player, {
            dt: 0.025,
            speed,
            previousSpeed: speed,
            distance: speed * 0.025,
            turnRadians: 0,
            pressing,
          }),
        };
        if ([40, 400, 1200, 2400].includes(tick + 1))
          readings.push({ seconds: (tick + 1) * 0.025, fitness: player.fitness });
      }
      rows.push({
        speed,
        pressing,
        readings,
        halftime: fitness.recoverHalftimeFitness(player).fitness,
      });
    }
  const lab = (await moduleAt(
    'fitnessMicroLab.ts',
  )) as typeof import('../src/core/matchSimulation/fitnessMicroLab');
  const drills = [];
  for (const readiness of [0.01, 1])
    for (const drill of lab.fitnessDrillSchema.options) {
      const f = createDynamicFixture(
        { scenario: 'pr173-winger-cut-1b', readiness },
        sim.createTacticalMatch,
      );
      const actor = f.state.players.find((p) => p.id === f.actorId)!;
      drills.push({
        drill,
        initialReadiness: readiness,
        seconds: 60,
        fitness: lab.runFitnessDrill(actor, drill, 60).fitness,
      });
    }
  const decisions = [];
  for (const readiness of [1, 0.6, 0.3, 0.1, 0.01])
    for (const receiverSpeed of [0, 4]) {
      const f = createDynamicFixture(
        { scenario: 'pr173-winger-cut-1b', readiness, receiverSpeed },
        sim.createTacticalMatch,
      );
      const actor = f.state.players.find((p) => p.id === f.actorId)!;
      const available = actions.enumerateAvailableActions(f.state, actor.id);
      const short = available.find((a) => a.type === 'pass' && a.receiverId === f.supportId);
      decisions.push({
        readiness,
        receiverSpeed,
        physicalModifiers: fitness.deriveFitnessPhysicalModifiers(actor),
        actions: Object.fromEntries(
          [...new Set(available.map((a) => a.type))].map((type) => [
            type,
            available.filter((a) => a.type === type).length,
          ]),
        ),
        shortPassScore: short ? actions.scoreActionForAI(f.state, actor.id, short) : null,
        ranking: actions.rankAvailableActionsForAI(f.state, actor.id).slice(0, 5),
      });
    }
  writeFileSync(
    resolve(out, `PR173-${stage}-burst-readiness.json`),
    JSON.stringify({ manifest, rows, drills, decisions }, null, 2) + '\n',
  );
  console.log(`${rows.length} controlled workload/recovery traces`);
} else if (mode === 'natural') {
  const rows: unknown[] = [];
  for (const name of ['central_possession', 'wide_direct', 'youth_native']) {
    const payload = JSON.parse(
      gunzipSync(readFileSync(`docs/performance/pr172-decisions/${name}.json.gz`)).toString(),
    ) as { cases: { id: string; category: string; state: TacticalMatchState }[] };
    for (const frozen of payload.cases) {
      const actorId = frozen.state.ball.ownerId!;
      const ranking = actions.rankAvailableActionsForAI(frozen.state, actorId);
      const action = ranking[0]!.action;
      rows.push({
        id: frozen.id,
        category: frozen.category,
        initialHash: pr172Hash(frozen.state),
        ranking: ranking.slice(0, 8),
        selected: run(frozen.state, action, actorId),
        carryCounterfactuals: ranking
          .filter((r) => r.action.type === 'carry')
          .slice(0, 3)
          .map((r) => ({ action: r.action, result: run(frozen.state, r.action, actorId) })),
      });
    }
  }
  writeFileSync(
    resolve(out, `PR173-${stage}-short-continuations.json`),
    JSON.stringify({ manifest, rows }, null, 2) + '\n',
  );
  console.log(`${rows.length} original natural frozen decisions`);
} else if (mode === 'manifest') {
  const files = readdirSync(resolve(root, 'docs/performance')).filter((n) =>
    /^PR17[12]-.*\.json$/.test(n),
  );
  const evidence = files.map((name) => ({
    name,
    sha256: pr172Hash(readFileSync(resolve(root, 'docs/performance', name), 'utf8')),
    normalizedLfSha256: pr172Hash(
      readFileSync(resolve(root, 'docs/performance', name), 'utf8').replaceAll('\r\n', '\n'),
    ),
  }));
  const historical = JSON.parse(
    readFileSync(resolve(root, 'docs/performance/PR172-after-baseline.json'), 'utf8'),
  );
  const archives = ['pr172-states', 'pr172-decisions'].flatMap((directory) =>
    readdirSync(resolve(root, 'docs/performance', directory))
      .filter((name) => name.endsWith('.gz'))
      .map((name) => ({
        path: `${directory}/${name}`,
        sha256: createHash('sha256')
          .update(readFileSync(resolve(root, 'docs/performance', directory, name)))
          .digest('hex'),
      })),
  );
  writeFileSync(
    resolve(out, 'PR173-baseline-manifest.json'),
    JSON.stringify({ manifest, evidence, archives, reference: historical.summary }, null, 2) + '\n',
  );
  console.log(`${files.length} untouched PR171/PR172 receipts`);
} else if (mode === 'parity') {
  const rows = [];
  for (const scenario of dynamicFixtureOptionsSchema.shape.scenario.options) {
    const f = createDynamicFixture({ scenario }, sim.createTacticalMatch);
    const action = scenario.endsWith('1a') ? undefined : f.action;
    const observed = run(f.state, action, f.actorId),
      plain = run(f.state, action, f.actorId, false);
    if (observed.finalHash !== plain.finalHash) throw new Error('Observer changed canonical state');
    rows.push({ scenario, initialHash: observed.initialHash, finalHash: observed.finalHash });
  }
  writeFileSync(
    resolve(out, `PR173-${stage}-observer-equivalence.json`),
    JSON.stringify({ manifest, rows }, null, 2) + '\n',
  );
} else if (mode === 'persistence') {
  const rows = [];
  for (const scenario of dynamicFixtureOptionsSchema.shape.scenario.options)
    for (const mirrored of [false, true]) {
      const f = createDynamicFixture({ scenario, mirrored }, sim.createTacticalMatch);
      let state = scenario.endsWith('1a') ? f.state : actions.resolveMatchAction(f.state, f.action);
      const checkpoints = [];
      for (let tick = 0; tick < 80; tick++) {
        if (tick % 20 === 0) {
          // Player profile/slot fields deliberately pass through this existing runtime schema.
          const saved = tacticalMatchStateSchema.parse(
            JSON.parse(JSON.stringify(state)),
          ) as unknown as TacticalMatchState;
          const direct = sim.stepTacticalMatchAfterDecisionProbe(structuredClone(state));
          const restored = sim.stepTacticalMatchAfterDecisionProbe(saved);
          // Compare the complete JSON save contract. JSON itself normalizes signed zero
          // and absent/undefined properties; do not mistake -0 vs 0 for sporting drift.
          const a = JSON.parse(JSON.stringify(tacticalMatchStateSchema.parse(direct))),
            b = JSON.parse(JSON.stringify(tacticalMatchStateSchema.parse(restored)));
          if (!isDeepStrictEqual(a, b))
            throw new Error(`Save/reload changed canonical contract ${scenario}/${tick}`);
          checkpoints.push({ at: state.time, nextHash: pr172Hash(a) });
        }
        state = sim.stepTacticalMatchAfterDecisionProbe(state);
      }
      rows.push({ scenario, mirrored, checkpoints });
    }
  writeFileSync(
    resolve(out, 'PR173-save-reload.json'),
    JSON.stringify(
      {
        manifest,
        scope:
          'Every JSON-compatible validated canonical state field; schema-order and JSON signed-zero/undefined normalization, no hand-selected state exclusions.',
        rows,
      },
      null,
      2,
    ) + '\n',
  );
} else throw new Error(`Unknown mode ${mode}`);
