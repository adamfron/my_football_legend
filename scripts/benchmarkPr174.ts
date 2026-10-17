import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createCombinationFixture, PR174_DEVELOPMENT, PR174_HELD_OUT } from './pr174Fixtures';
import { pr172Hash, pr172SourceHash } from './pr172Evidence';
import {
  tacticalMatchStateSchema,
  type TacticalMatchState,
} from '../src/core/matchSimulation/matchState';
import { distance, signedForwardDistance } from '../src/core/matchSimulation/matchSpace';

const args = new Map(
  process.argv.slice(2).map((v) => {
    const [k, ...rest] = v.replace(/^--/, '').split('=');
    return [k, rest.join('=')];
  }),
);
const root = resolve(args.get('engine-root') ?? '.');
const out = resolve(args.get('output-dir') ?? '../pr174-research');
mkdirSync(out, { recursive: true });
const at = (name: string) =>
  import(pathToFileURL(resolve(root, 'src/core/matchSimulation', name)).href);
const sim = (await at(
  'matchSimulation.ts',
)) as typeof import('../src/core/matchSimulation/matchSimulation');
const actions = (await at(
  'matchActions.ts',
)) as typeof import('../src/core/matchSimulation/matchActions');
const stage = args.get('stage') ?? 'A';
const historical = readdirSync('docs/performance').filter((p) => /^PR17[123].*\.json$/.test(p));
const manifest = {
  stage,
  sourceHash: pr172SourceHash(root),
  node: process.version,
  platform: process.platform,
  dt: 0.025,
  harnessHash: pr172Hash(
    readFileSync('scripts/benchmarkPr174.ts', 'utf8') +
      readFileSync('scripts/pr174Fixtures.ts', 'utf8'),
  ),
  retainedEvidence: Object.fromEntries(
    historical.map((p) => [p, pr172Hash(readFileSync(resolve('docs/performance', p), 'utf8'))]),
  ),
  method:
    'Prescribed physically released opening, autonomous canonical continuation; snapshots at 1/2/5/8s. Development and held-out labels fixed before policy implementation. Mirrors and variants are dependent, not population replicates.',
};
const fixtures = args.get('set') === 'held-out' ? PR174_HELD_OUT : PR174_DEVELOPMENT;
const runs = fixtures.map((input) => {
  const f = createCombinationFixture(input);
  const initial = structuredClone(f.state);
  const initialHash = pr172Hash(initial);
  const start = performance.now();
  const source =
    f.options.scenario === 'human' ? ('human_selected' as const) : ('autonomous_npc' as const);
  let state = actions.resolveMatchAction(initial, f.action, source);
  const firstPass = state.lastPassDiagnostic?.passId;
  const passes = new Map<string, unknown>();
  const choices: unknown[] = [],
    combinations = new Map<string, unknown>(),
    samples: unknown[] = [];
  let runInitiated = false,
    maxControlledForward = 0,
    losses = 0,
    reloadEqual = true,
    humanPending = false;
  let priorDecision = state.decisionIndex;
  const actor = initial.players.find((p) => p.id === f.a)!;
  const startFouls = initial.defensiveTelemetry?.fouls ?? 0;
  for (let tick = 0; tick < 320; tick++) {
    const previous = state;
    // The human scenario deliberately stops at an actual pending choice; it is never auto-resolved.
    state =
      f.options.scenario === 'human'
        ? sim.stepTacticalMatch(state, 0.025)
        : sim.stepTacticalMatchAfterDecisionProbe(state, 0.025);
    if (state === previous) {
      humanPending = true;
      break;
    }
    const a = state.players.find((p) => p.id === f.a)!;
    if (
      distance(a.position, actor.position) >= 1 &&
      signedForwardDistance(actor.position, a.position, actor) > 0.5
    )
      runInitiated = true;
    const owner = state.players.find((p) => p.id === state.ball.ownerId);
    if (owner?.team === actor.team)
      maxControlledForward = Math.max(
        maxControlledForward,
        signedForwardDistance(actor.position, owner.position, actor),
      );
    if (
      state.lastPossessionLoss?.id !== previous.lastPossessionLoss?.id &&
      state.lastPossessionLoss?.from === actor.team
    )
      losses++;
    for (const p of [state.lastPassDiagnostic, state.lastResolvedPass])
      if (p && p.releasedAt >= initial.time) passes.set(p.passId, structuredClone(p));
    const dynamic = state as typeof state & {
      combinationIntent?: { id: string };
      lastCombination?: { id: string };
    };
    for (const c of [dynamic.combinationIntent, dynamic.lastCombination])
      if (c) combinations.set(c.id, structuredClone(c));
    if (state.decisionIndex !== priorDecision) {
      choices.push({ at: state.time - initial.time, action: state.latestAction });
      priorDecision = state.decisionIndex;
    }
    if ([39, 79, 199, 319].includes(tick)) {
      const ranked =
        owner?.team === actor.team
          ? actions.rankAvailableActionsForAI(state, owner.id).slice(0, 5)
          : [];
      samples.push({
        at: (tick + 1) * 0.025,
        ownerId: state.ball.ownerId ?? null,
        retained: owner?.team === actor.team,
        position: a.position,
        speed: Math.hypot(a.velocity.x, a.velocity.y),
        maxControlledForward,
        ranked,
      });
      // Compare the schema-normalised complete state on both paths; key order is not authority.
      const normal = tacticalMatchStateSchema.parse(state) as unknown as TacticalMatchState;
      const reload = tacticalMatchStateSchema.parse(
        JSON.parse(JSON.stringify(state)),
      ) as unknown as TacticalMatchState;
      reloadEqual &&=
        pr172Hash(sim.stepTacticalMatchAfterDecisionProbe(normal, 0.025)) ===
        pr172Hash(sim.stepTacticalMatchAfterDecisionProbe(reload, 0.025));
    }
  }
  return {
    options: f.options,
    initialHash,
    firstPass,
    finalHash: pr172Hash(state),
    runInitiated,
    passes: [...passes.values()],
    choices,
    combinations: [...combinations.values()],
    samples,
    losses,
    fouls: (state.defensiveTelemetry?.fouls ?? 0) - startFouls,
    maxControlledForward,
    reloadEqual,
    humanPending,
    wallMs: performance.now() - start,
  };
});
const result = { manifest, set: args.get('set') ?? 'development', runs };
writeFileSync(
  resolve(out, `PR174-${stage}-${result.set}.json`),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    stage,
    set: result.set,
    runs: runs.length,
    reloadEqual: runs.every((r) => r.reloadEqual),
    supportedRuns: runs.filter((r) => r.runInitiated).length,
    losses: runs.reduce((n, r) => n + r.losses, 0),
  }),
);
