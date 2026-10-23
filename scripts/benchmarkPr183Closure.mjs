import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL, URL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import {
  digest,
  pr183SourceHash as pr182SourceHash,
  pr183HarnessHash as pr182HarnessHash,
} from './pr183ClosureEvidence.mjs';
import { PolicyLineageEvidence } from './pr182Observation.ts';
import { RealismEvidence } from './pr183ClosureObservation.ts';
const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const root = resolve(args.get('source') ?? '.');
const load = (p) => import(pathToFileURL(resolve(root, p)).href);
const { configureMatchPolicy, RoleExperimentRecorder } = await load(
  'src/core/matchSimulation/roleExperiment.ts',
);
const { withRankingObserver } = await load('src/core/matchSimulation/decisionObservation.ts');
const { createTacticalMatch, startSecondHalf, stepTacticalMatchAfterDecisionProbe } = await load(
  'src/core/matchSimulation/matchSimulation.ts',
);
const { createMatchFlowTelemetry, observeMatchFlow } = await load(
  'src/core/matchSimulation/matchFlowTelemetry.ts',
);
const { scoreActionForAI } = await load('src/core/matchSimulation/matchActions.ts');
const { attacksRight } = await load('src/core/matchSimulation/matchSpace.ts');
const { assertMatchStatisticsInvariants } = await load(
  'src/core/matchSimulation/playerMatchStats.ts',
);
const { SpatialEvidence } = await load('scripts/pr181Observation.ts');
const { pr172SourceHash } = await load('scripts/pr172Evidence.ts');
const { PerformanceProfiler, withPerformanceProfiler } = await load(
  'src/core/matchSimulation/performanceProfiling.ts',
);
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const cohort = args.get('cohort') ?? 'development';
const out = args.get('out') ?? `../pr183-closure-${cohort}`;
mkdirSync(out, { recursive: true });
const policy = args.get('policy') ?? 'role-value-v1';
const sourceHash = pr172SourceHash(root);
const productionHash = pr182SourceHash(root);
const frozenHarnessHash = pr182HarnessHash();
if (cohort === 'validation') {
  if (args.has('seconds') || args.has('manual'))
    throw Error('Primary validation requires complete frozen fixtures');
  const freeze = JSON.parse(readFileSync('docs/performance/PR183-closure-freeze.json'));
  if (freeze.sourceHash !== productionHash || freeze.harnessHash !== frozenHarnessHash)
    throw Error('Validation requires the unchanged preregistered source and observer freeze');
}
const harnessHash = createHash('sha256')
  .update(readFileSync(new URL(import.meta.url)))
  .digest('hex');
const observationPath = resolve(root, 'scripts/pr181Observation.ts');
const observationHash = createHash('sha256').update(readFileSync(observationPath)).digest('hex');
let fixtures = JSON.parse(
  gunzipSync(
    readFileSync(
      args.has('fixtures')
        ? resolve(args.get('fixtures'))
        : resolve(`docs/performance/pr183-evidence/closure-${cohort}.json.gz`),
    ),
  ),
).filter((f) => f.design.split === (cohort === 'validation' ? 'validation' : 'development'));
if (args.has('manual')) {
  const { createCanonicalWorldDatabase } = await load('scripts/createCanonicalWorldDatabase.ts');
  const { createSingleMatchSession } = await load('src/core/singleMatch.ts');
  const session = createSingleMatchSession(createCanonicalWorldDatabase(), {
    homeClubId: 'pro_9',
    awayClubId: 'pro_1',
    seed: 'lab-mvh694xi',
    control: { mode: 'spectator' },
  });
  const state = createTacticalMatch(session);
  state.playerAgencyEnabled = false;
  fixtures = [
    {
      design: {
        id: 'manual-closest',
        tier: 'unverified',
        limitations:
          'Same seed and canonical club IDs. Original complete setup/roles/conditions were not exported; exact input equivalence is unproven.',
      },
      state,
      session,
      inputHash: sha(state),
      sessionHash: sha(session),
    },
  ];
}
if (args.has('ids'))
  fixtures = fixtures.filter((f) => args.get('ids').split(',').includes(f.design.id));
for (const f of fixtures) {
  if (digest(f.state) !== f.inputHash || digest(f.session) !== f.sessionHash)
    throw Error('Input bytes/hash mismatch');
  if (cohort === 'validation') {
    const manifest = JSON.parse(
      readFileSync('docs/performance/PR183-closure-validation-inputs.json'),
    );
    const declared = manifest.rows.find((r) => r.design.id === f.design.id);
    if (
      !declared ||
      declared.inputHash !== f.inputHash ||
      declared.sessionHash !== digest(f.session)
    )
      throw Error('Fixture not in the declared primary validation cohort');
  }
  let state = configureMatchPolicy(globalThis.structuredClone(f.state), policy),
    ticks = 0,
    errors = [],
    frozen = [];
  const spatial = new SpatialEvidence();
  const lineage = new PolicyLineageEvidence();
  const realism = new RealismEvidence();
  let maxRss = 0;
  let flow = createMatchFlowTelemetry(`${f.design.id}:${policy}`);
  const recorder = new RoleExperimentRecorder(state),
    profiler = new PerformanceProfiler({ enabled: true });
  const cpu = process.cpuUsage(),
    started = performance.now(),
    duration = Number(args.get('seconds') ?? 7200);
  const clock = { elapsed: 0, inPlay: 0, stoppage: 0, restartPreparation: 0, restartReady: 0 };
  const passes = new Map(),
    receptions = {},
    intervals = [],
    velocities = [];
  let lastPassAt;
  let ownerEpisode;
  const longRetreatSnapshots = [];
  const rank = (s, id, r) => {
    recorder.ranking(s, id, r);
    if (
      args.has('capture') &&
      s.ball.ownerId !== id &&
      r.some((x) => x.action.firstTime) &&
      frozen.length < 16
    ) {
      const actor = s.players.find((p) => p.id === id);
      frozen.push({
        state: globalThis.structuredClone(s),
        actorId: id,
        ranking: r,
        control: scoreActionForAI({ ...s, ballOwnershipStartedAt: s.time }, id, {
          type: 'hold',
          actorId: id,
        }),
        actor: actor?.position,
      });
    }
  };
  while (!['full_time', 'abandoned'].includes(state.status ?? '') && state.time < duration) {
    if (state.status === 'half_time') state = startSecondHalf(state);
    const previous = state;
    profiler.beginTick(ticks);
    state = withRankingObserver(rank, () =>
      withPerformanceProfiler(profiler, () => stepTacticalMatchAfterDecisionProbe(state, 0.025)),
    );
    if (previous === state) throw Error(`stalled ${state.time}`);
    recorder.observe(previous, state);
    spatial.observe(previous, state);
    lineage.observe(previous, state);
    realism.observe(previous, state);
    if (args.has('capture-long-retreats') && policy === 'phase-role-hybrid-v1') {
      const owner = state.players.find((p) => p.id === state.ball.ownerId);
      if (owner?.id !== ownerEpisode?.id)
        ownerEpisode = owner
          ? { id: owner.id, at: state.time, x: owner.position.x, saved: false }
          : undefined;
      if (
        owner &&
        ownerEpisode &&
        !ownerEpisode.saved &&
        longRetreatSnapshots.length < 8 &&
        state.time - ownerEpisode.at > 3 &&
        (ownerEpisode.x - owner.position.x) * (attacksRight(owner) ? 1 : -1) > 12
      ) {
        const file = `${f.design.id}-${policy}-retreat-${longRetreatSnapshots.length}.json.gz`;
        writeFileSync(`${out}/${file}`, gzipSync(JSON.stringify(state)));
        longRetreatSnapshots.push({
          file,
          sourceHash: productionHash,
          stateHash: digest(state),
          ownerId: owner.id,
          startedAt: ownerEpisode.at,
          x: ownerEpisode.x,
          at: state.time,
        });
        ownerEpisode.saved = true;
      }
    }
    if (ticks % 400 === 0) maxRss = Math.max(maxRss, process.memoryUsage().rss);
    if (
      args.has('capture-restart') &&
      state.scenario.startsWith('free_kick') &&
      state.stoppageLedger?.active?.ballReadyAt !== undefined &&
      state.stoppageLedger.active.legalReadyAt === undefined &&
      state.time - state.stoppageLedger.active.startedAt > 30
    ) {
      writeFileSync(
        `${out}/${f.design.id}-${policy}-restart-state.json.gz`,
        gzipSync(JSON.stringify(state)),
      );
      break;
    }
    try {
      flow = observeMatchFlow(flow, previous, state);
    } catch (e) {
      if (errors.length < 64) errors.push({ at: state.time, error: String(e) });
      if (args.has('capture') && errors.length === 1)
        writeFileSync(
          `${out}/${f.design.id}-${policy}-observer-failure.json.gz`,
          gzipSync(JSON.stringify({ previous, state, flow })),
        );
    }
    const dt = state.time - previous.time;
    clock.elapsed += dt;
    if (
      previous.stoppageLedger?.active ||
      (previous.restart && previous.restart.phase !== 'release')
    ) {
      clock.stoppage += dt;
      if (previous.stoppageLedger?.active?.legalReadyAt !== undefined) clock.restartReady += dt;
      else clock.restartPreparation += dt;
    } else if (previous.postGoal || previous.status === 'half_time') clock.stoppage += dt;
    else clock.inPlay += dt;
    for (const p of [state.lastPassDiagnostic, state.lastResolvedPass].filter(Boolean)) {
      if (!passes.has(p.passId)) {
        if (lastPassAt !== undefined) intervals.push(p.releasedAt - lastPassAt);
        lastPassAt = p.releasedAt;
        if (p.incomingSpeed !== undefined)
          velocities.push({ incoming: p.incomingSpeed, outgoing: state.ball.launchSpeed ?? null });
      }
      passes.set(p.passId, p);
    }
    if (
      state.lastReceptionOutcome !== previous.lastReceptionOutcome &&
      state.lastReceptionOutcome
    ) {
      const k = state.lastReceptionOutcome.kind;
      receptions[k] = (receptions[k] ?? 0) + 1;
    }
    ticks++;
    if (ticks % 8000 === 0)
      writeFileSync(
        `${out}/progress-${f.design.id}-${policy}.json`,
        JSON.stringify({
          fixture: f.design.id,
          policy,
          time: state.time,
          ticks,
          wall: (performance.now() - started) / 1000,
        }),
      );
    if (cohort === 'validation' && ticks % 8000 === 0) {
      const used = process.cpuUsage(cpu);
      if ((used.user + used.system) / 1e6 > 600) {
        errors.push({ at: state.time, error: 'Predeclared 600 CPU-second match budget exceeded' });
        break;
      }
    }
  }
  assertMatchStatisticsInvariants(state.statistics, state);
  if (!args.has('seconds') && state.status !== 'full_time') {
    writeFileSync(
      `${out}/${f.design.id}-${policy}-failure-state.json.gz`,
      gzipSync(JSON.stringify(state)),
    );
    process.exitCode = 1;
  }
  if (pr172SourceHash(root) !== sourceHash)
    throw new Error('Source changed during benchmark; rerun on frozen code');
  if (pr182SourceHash(root) !== productionHash || pr182HarnessHash() !== frozenHarnessHash)
    throw Error('Production or preregistered harness changed during benchmark');
  if (createHash('sha256').update(readFileSync(observationPath)).digest('hex') !== observationHash)
    throw new Error('Observation definitions changed during benchmark');
  const usage = process.cpuUsage(cpu),
    list = [...passes.values()],
    first = list.filter((p) => p.executionType === 'first_time');
  if (Math.abs(clock.inPlay + clock.stoppage - clock.elapsed) > 1e-6)
    throw Error('Live/dead canonical clock does not reconcile');
  const officialAttempts = state.statistics.players.reduce((n, p) => n + p.passesAttempted, 0);
  if (list.length !== officialAttempts || flow.firstTimePassAttempts !== first.length)
    throw Error('Canonical pass/first-time attempt identity mismatch');
  if (errors.length) process.exitCode = 1;
  intervals.sort((a, b) => a - b);
  const receipt = {
    schema: 'mfl-pr183-closure-benchmark-v1',
    cohort,
    productionHash,
    frozenHarnessHash,
    effectiveInputHash: digest(configureMatchPolicy(globalThis.structuredClone(f.state), policy)),
    policy,
    design: f.design,
    inputHash: f.inputHash,
    sessionHash: sha(f.session),
    sourceHash,
    harnessHash,
    observationHash,
    runtime: process.version,
    status: state.status,
    time: state.time,
    ticks,
    finalHash: sha(state),
    longRetreatSnapshots,
    official: state.statistics?.players.reduce(
      (s, p) => ({
        attempts: s.attempts + p.passesAttempted,
        completed: s.completed + p.passesCompleted,
      }),
      { attempts: 0, completed: 0 },
    ),
    passes: {
      unique: list.length,
      firstTime: first.length,
      firstTimeCompleted: first.filter((p) => p.finalResult === 'completed').length,
      outcomes: Object.fromEntries(
        [...new Set(list.map((p) => p.finalResult ?? 'unresolved'))].map((k) => [
          k,
          list.filter((p) => (p.finalResult ?? 'unresolved') === k).length,
        ]),
      ),
      intervalMedian: intervals[Math.floor(intervals.length / 2)],
      intervalMean: intervals.reduce((a, b) => a + b, 0) / Math.max(1, intervals.length),
      velocities: velocities.slice(0, 64),
    },
    receptions,
    spatial: spatial.export(state),
    lineage: lineage.export(state),
    realism: realism.export(state),
    teams: state.teams,
    substitutions: state.substitutionState?.completed,
    defensive: state.defensiveTelemetry,
    clock,
    observer: {
      errors,
      attempts: flow.firstTimePassAttempts,
      completed: flow.firstTimePassCompleted,
      uniqueResults: flow.observedPassResultIds.length,
      uniqueAttempts: flow.observedPassAttemptIds.length,
    },
    flow: {
      floatedCrosses: flow.floatedCrosses,
      drivenCrosses: flow.drivenCrosses,
      cutbacks: flow.cutbacks,
      shots: flow.shots,
      crosses: flow.crossAttempts,
      boxEntries: flow.boxEntries,
      finalThirdEntries: flow.finalThirdEntries,
      turnovers: flow.turnoverCauses,
      restarts: flow.restartAwards,
    },
    performance: {
      maxSampledRssBytes: maxRss,
      serial: args.has('serial'),
      cpuSeconds: (usage.user + usage.system) / 1e6,
      wallSeconds: (performance.now() - started) / 1000,
      profile: profiler.snapshot(),
    },
    report: recorder.export(f.session, state, sourceHash, process.version),
  };
  writeFileSync(`${out}/${f.design.id}-${policy}.json.gz`, gzipSync(JSON.stringify(receipt)));
  if (args.has('capture'))
    writeFileSync(
      `${out}/${f.design.id}-${policy}-frozen.json.gz`,
      gzipSync(JSON.stringify(frozen)),
    );
  console.log(
    JSON.stringify({
      id: f.design.id,
      policy,
      status: state.status,
      time: state.time,
      official: receipt.official,
      first: first.length,
      receptions,
      errors: errors.length,
      cpu: receipt.performance.cpuSeconds,
    }),
  );
}
