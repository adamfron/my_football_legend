import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import {
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats.ts';
import { projectMatchCentreStatistics } from '../src/core/matchSimulation/matchCentreStatistics.ts';
import { evaluateTransitionOpportunity } from '../src/core/matchSimulation/attackingTransition.ts';
import {
  PerformanceProfiler,
  withPerformanceProfiler,
} from '../src/core/matchSimulation/performanceProfiling.ts';
import { attacksRight } from '../src/core/matchSimulation/matchSpace.ts';
import { Pr175Observer } from './pr175Observer.ts';
import { pr172SourceHash, pr172Hash as sha } from './pr172Evidence.ts';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const policy = args.get('policy') ?? 'state-value-v1',
  split = args.get('split') ?? 'development';
const out = args.get('out') ?? `../pr178-${split}-${policy}`;
const historical = args.has('historical');
const inputs = historical
  ? 'docs/performance/PR176-pr177-initial-states.json.gz'
  : 'docs/performance/pr178-evidence/initial-states.json.gz';
const fixtures = JSON.parse(gunzipSync(readFileSync(inputs))).filter(
  (f) =>
    f.design.split === split &&
    (!args.has('ids') || args.get('ids').split(',').includes(f.design.id)),
);
const sourceHash = pr172SourceHash();
const manifest = {
  version: 1,
  sourceHash,
  policy,
  node: process.version,
  dt: 0.025,
  historical,
  harnessHash: sha(readFileSync('scripts/benchmarkPr178.mjs', 'utf8').replaceAll('\r\n', '\n')),
  observerHash: sha(readFileSync('scripts/pr175Observer.ts', 'utf8').replaceAll('\r\n', '\n')),
  timing: args.has('serial')
    ? 'serial; no concurrent research/test jobs'
    : 'research jobs may overlap; not a serial CPU ratio',
};
if (split === 'validation' && !historical) {
  const freeze = JSON.parse(readFileSync('docs/performance/PR178-validation-freeze.json', 'utf8'));
  if (freeze.sourceHash !== sourceHash || freeze.harnessHash !== manifest.harnessHash)
    throw new Error('Final validation source/harness is not frozen');
}
mkdirSync(out, { recursive: true });
const limit = Number(args.get('seconds') ?? 7200);
for (const f of fixtures) {
  if (sha(f.state) !== f.inputHash) throw new Error(`Input mismatch ${f.design.id}`);
  const path = `${out}/${f.design.id}.json`;
  if (existsSync(path)) {
    const existing = JSON.parse(readFileSync(path, 'utf8'));
    if (
      existing.manifest.sourceHash !== sourceHash ||
      existing.manifest.harnessHash !== manifest.harnessHash ||
      existing.limit !== limit
    )
      throw new Error('Incompatible existing receipt');
    console.log(`resume ${f.design.id}`);
    continue;
  }
  const run = (observed) => {
    let state = globalThis.structuredClone(f.state),
      ticks = 0,
      peakRss = 0,
      peakHeap = 0;
    state.decisionPolicy = policy;
    const observer = new Pr175Observer(),
      transitions = [],
      aerials = [],
      losses = [],
      roles = new Map(),
      checkpoints = [];
    const profiler = new PerformanceProfiler({ enabled: args.has('profile') });
    const hooks = ['decision', 'incoming', 'components'].map((n) => Symbol.for(`mfl.pr172.${n}`));
    globalThis[hooks[0]] = observed
      ? (s, a, r) => observer.decision(s, a, r, r[0]?.action)
      : undefined;
    globalThis[hooks[1]] = observed
      ? (s, a, r, selected) => observer.decision(s, a, r, selected, true)
      : undefined;
    globalThis[hooks[2]] = observed ? observer.component : undefined;
    let active;
    const started = performance.now(),
      cpu = process.cpuUsage();
    try {
      while (!['full_time', 'abandoned'].includes(state.status ?? '') && state.time < limit) {
        if (state.status === 'half_time') state = startSecondHalf(state);
        const previous = state;
        profiler.beginTick(ticks);
        state = withPerformanceProfiler(profiler, () =>
          stepTacticalMatchAfterDecisionProbe(state, 0.025),
        );
        ticks++;
        if (state === previous) throw new Error('Canonical spectator stalled');
        if (observed) {
          observer.observe(previous, state);
          if (
            state.lastAerialContact?.id !== previous.lastAerialContact?.id &&
            state.lastAerialContact
          )
            aerials.push({
              at: state.time,
              ...state.lastAerialContact,
              outcome: state.lastAerialResult,
              previousBall: previous.ball,
              ball: state.ball,
            });
          for (const player of state.players) {
            const key = `${player.id}:${player.slot.position}`;
            const entry = roles.get(key) ?? {
              id: player.id,
              team: player.team,
              role: player.slot.position,
              seconds: 0,
              metres: 0,
              forwardMetres: 0,
              pressSeconds: 0,
            };
            entry.seconds += 0.025;
            const before = previous.players.find((p) => p.id === player.id);
            if (before) {
              entry.metres += Math.hypot(
                player.position.x - before.position.x,
                player.position.y - before.position.y,
              );
              entry.forwardMetres += Math.max(
                0,
                (player.position.x - before.position.x) * (attacksRight(player) ? 1 : -1),
              );
            }
            if (player.locomotionReason?.includes('press')) entry.pressSeconds += 0.025;
            roles.set(key, entry);
          }
          if (
            state.lastPossessionLoss &&
            state.lastPossessionLoss.id !== previous.lastPossessionLoss?.id
          )
            losses.push({
              ...globalThis.structuredClone(state.lastPossessionLoss),
              endsSwitched: state.endsSwitched ?? false,
              attackingDepth: attacksRight({
                team: state.lastPossessionLoss.from,
                endsSwitched: state.endsSwitched,
              })
                ? state.lastPossessionLoss.position.x
                : 105 - state.lastPossessionLoss.position.x,
            });
          const owner = state.players.find((p) => p.id === state.ball.ownerId);
          if (owner && state.lastPossessionChange?.at !== previous.lastPossessionChange?.at) {
            if (active) {
              active.end = state.time;
              active.outcome = 'turnover';
              transitions.push(active);
            }
            const exposure = evaluateTransitionOpportunity(state, owner);
            active = {
              recovery: state.lastPossessionChange,
              ballRecovery: state.lastBallRecovery,
              at: state.time,
              team: owner.team,
              sourceRestart:
                previous.restart?.awardId ?? previous.restartTouchRestriction?.awardId ?? null,
              precedingShotId: previous.lastShot?.shotId ?? null,
              precedingShotOutcome: previous.lastShot?.outcome ?? null,
              origin: { ...state.ball },
              depth: attacksRight(owner) ? state.ball.x : 105 - state.ball.x,
              exposure,
              opponents: state.players
                .filter((p) => p.team !== owner.team)
                .map((p) => ({ id: p.id, position: p.position, velocity: p.velocity })),
              firstForwardAction: null,
              maxControlledProgress: 0,
              shots: [],
              defensiveRecoveryAt: null,
            };
          }
          if (active) {
            if (owner?.team === active.team) {
              active.maxControlledProgress = Math.max(
                active.maxControlledProgress,
                (attacksRight(owner) ? state.ball.x : 105 - state.ball.x) - active.depth,
              );
              if (
                active.defensiveRecoveryAt === null &&
                active.exposure.cover < 5 &&
                evaluateTransitionOpportunity(state, owner).cover >= 5
              )
                active.defensiveRecoveryAt = state.time;
            }
            const action = state.latestAction,
              actor = state.players.find((p) => p.id === action?.actorId);
            if (
              !active.firstForwardAction &&
              state.decisionIndex !== previous.decisionIndex &&
              action &&
              'target' in action &&
              actor?.team === active.team &&
              (action.target.x - active.origin.x) * (attacksRight(actor) ? 1 : -1) > 3
            )
              active.firstForwardAction = { at: state.time, action };
            if (state.lastShot?.shotId !== previous.lastShot?.shotId && state.lastShot)
              active.shots.push(state.lastShot.shotId);
            if (state.time - active.at >= 8 || state.scenario !== 'open_play') {
              active.end = state.time;
              active.outcome = state.scenario === 'open_play' ? 'window-ended' : state.scenario;
              transitions.push(active);
              active = undefined;
            }
          }
        }
        if (ticks % 4000 === 0) {
          const m = process.memoryUsage();
          peakRss = Math.max(peakRss, m.rss);
          peakHeap = Math.max(peakHeap, m.heapUsed);
        }
        if (ticks % 40000 === 0) {
          const usage = process.cpuUsage(cpu);
          checkpoints.push({
            time: state.time,
            cpuMs: (usage.user + usage.system) / 1000,
            wallMs: performance.now() - started,
            hash: sha(state),
          });
          console.log(`${f.design.id} ${policy} t=${state.time.toFixed(0)}`);
        }
      }
    } catch (error) {
      writeFileSync(`${out}/${f.design.id}-failure.json.gz`, gzipSync(JSON.stringify(state)));
      throw error;
    } finally {
      for (const hook of hooks) globalThis[hook] = undefined;
    }
    if (active) {
      active.end = state.time;
      active.outcome = 'run-ended';
      transitions.push(active);
    }
    assertMatchStatisticsInvariants(state.statistics);
    const usage = process.cpuUsage(cpu),
      wallMs = performance.now() - started;
    const observations = observed ? observer.snapshot(state) : null;
    return {
      finalHash: sha(state),
      ticks,
      status: state.status,
      time: state.time,
      score: state.score,
      official: projectMatchCentreStatistics(state),
      statistics: state.statistics,
      wallMs,
      cpuMs: (usage.user + usage.system) / 1000,
      peakRss,
      peakHeap,
      checkpoints,
      profile: profiler.snapshot(),
      observations,
      aerials,
      transitions,
      losses,
      roles: [...roles.values()],
    };
  };
  const result = run(!args.has('plain')),
    plain = args.has('equivalence') ? run(false) : null;
  if (plain && (plain.finalHash !== result.finalHash || plain.ticks !== result.ticks))
    throw new Error('Observer changes authoritative final state');
  if (pr172SourceHash() !== sourceHash) throw new Error('Source changed during experiment');
  const { observations, transitions, aerials, losses, roles, ...compact } = result;
  if (observations) {
    // Retain canonical lineage and outcomes, omit redundant per-decision decomposition blobs.
    for (const choice of observations.choices) {
      delete choice.winnerTerms;
      delete choice.progressiveTerms;
    }
    writeFileSync(
      `${out}/${f.design.id}-raw.json.gz`,
      gzipSync(JSON.stringify({ observations, transitions, aerials, losses, roles })),
    );
  }
  writeFileSync(
    path,
    JSON.stringify(
      {
        manifest,
        design: f.design,
        inputHash: f.inputHash,
        limit,
        ...compact,
        counts: observations?.counts,
        equivalence: plain
          ? {
              equal: true,
              finalHash: plain.finalHash,
              ticks: plain.ticks,
              cpuMs: plain.cpuMs,
              wallMs: plain.wallMs,
            }
          : null,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({
      id: f.design.id,
      policy,
      status: result.status,
      time: result.time,
      score: result.score,
      cpuMs: result.cpuMs,
    }),
  );
}
