import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import { rankAvailableActionsForAI, resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { startSecondHalf, stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats.ts';
import { projectMatchCentreStatistics } from '../src/core/matchSimulation/matchCentreStatistics.ts';
import { Pr175Observer } from './pr175Observer.ts';
import { evaluateTransitionOpportunity } from '../src/core/matchSimulation/attackingTransition.ts';
import { attacksRight, distance } from '../src/core/matchSimulation/matchSpace.ts';
import { evaluateStateValueAction } from '../src/core/matchSimulation/decisionStateValue.ts';
import { deriveFeasiblePassPlans, derivePassLaunchPlan } from '../src/core/matchSimulation/passLaunchPlan.ts';
import { projectFutureBallTrajectory } from '../src/core/matchSimulation/ballPhysics.ts';
import { PerformanceProfiler, withPerformanceProfiler } from '../src/core/matchSimulation/performanceProfiling.ts';
import { createReformFixture, reformScenarioSchema } from './pr177Fixtures.ts';

const args = new Map(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=')]; }));
const sha = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
const mode = args.get('mode') ?? 'frozen';
const policy = args.get('policy') ?? 'legacy-pr176';
const out = args.get('out') ?? `../pr177-${mode}-${policy}`;
mkdirSync(out, { recursive: true });
const sourceFiles = readdirSync('src/core/matchSimulation').filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts')).sort();
const sourceHash = sha(sourceFiles.map((p) => `${p}\0${readFileSync(`src/core/matchSimulation/${p}`, 'utf8').replaceAll('\r\n', '\n')}\0`).join(''));
const manifest = { version: 1, mode, policy, ablation: args.get('ablation') ?? 'none', sourceHash, node: process.version, dt: 0.025, harnessHash: sha(readFileSync('scripts/benchmarkPr177.mjs', 'utf8').replaceAll('\r\n', '\n')) };
const emit = (name, value) => writeFileSync(`${out}/${name}.json`, JSON.stringify({ manifest, ...value }, null, 2) + '\n');
const frozen = () => ['pr175-natural', 'pr175-natural-dev-strength'].flatMap((g) => JSON.parse(gunzipSync(readFileSync(`../pr176-inputs/${g}.json.gz`))).map((c, i) => ({ ...c, id: `${g}:${i}` })));
const apply = (s) => { const state = globalThis.structuredClone(s); state.decisionPolicy = policy; if (args.has('ablation')) state.decisionAblation = args.get('ablation'); return state; };
const rank = (s, actorId) => rankAvailableActionsForAI(s, actorId);
const samples = (initial, duration) => {
  let s = initial; const rows = [];
  for (let tick = 0; tick < duration * 40; tick++) {
    s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
    if ([2, 3, 5, 8].some((n) => tick + 1 === n * 40)) rows.push({ seconds: (tick + 1) / 40, hash: sha(s), ball: s.ball, score: s.score, possession: s.possessionTeam,
      movements: s.players.map((p) => ({ id: p.id, position: p.position, velocity: p.velocity, target: p.target })),
      lastPass: s.lastResolvedPass, lastShot: s.lastShot, lastLoss: s.lastPossessionLoss, lastContact: s.lastGroundContact });
  }
  return { rows, finalHash: sha(s) };
};

if (mode === 'scenarios') {
  const rows = reformScenarioSchema.options.map((id) => {
    const f = createReformFixture(id), s = apply(f.state), ranking = rank(s, f.actor.id);
    return { id, initialHash: sha(s), actors: { actor: f.actor, runner: f.runner },
      ranking, evaluations: policy === 'state-value-v1' ? ranking.map((r) => ({ action: r.action, ...evaluateStateValueAction(s, f.actor, r.action) })) : null,
      continuation: samples(s, 8) };
  });
  emit('scenarios', { rows }); console.log(JSON.stringify({ mode, policy, scenarios: rows.length }));
} else if (mode === 'frozen') {
  const rows = frozen().map((c) => {
    const s = apply(tacticalMatchStateSchema.parse(c.state)); const before = sha(s);
    const ranking = rank(s, c.actorId);
    if (sha(s) !== before) throw new Error('Ranker mutates state');
    const actor = s.players.find((p) => p.id === c.actorId);
    return { id: c.id, originalStateHash: sha(c.state), ranking, oldWinner: c.ranking[0],
      evaluations: policy === 'state-value-v1' ? ranking.map((r) => ({ action: r.action, ...evaluateStateValueAction(s, actor, r.action) })) : null,
      continuation: samples(s, 8) };
  });
  emit('frozen', { rows }); console.log(JSON.stringify({ mode, policy, states: rows.length, sourceHash }));
} else if (mode === 'flight') {
  const s = apply(frozen()[0].state), actor = s.players.find((p) => p.id === s.ball.ownerId), receiver = s.players.find((p) => p.team === actor.team && p.id !== actor.id);
  s.players.forEach((p) => { p.position = { x: 2, y: 2 }; p.velocity = { x: 0, y: 0 }; });
  actor.position = { x: 12, y: 34 }; s.ball = { x: 12, y: 34, ownerId: actor.id }; s.time += 5; s.onBallPreparation = undefined;
  const rows = [];
  for (const metres of [5, 10, 15, 25, 35, 45, 60]) for (const geometry of ['straight', 'diagonal']) for (const delivery of ['ground', 'lofted']) {
    const target = { x: 12 + metres * (geometry === 'straight' ? 1 : 0.8), y: 34 + metres * (geometry === 'straight' ? 0 : 0.6) };
    if (target.y > 66) target.y = 34 - metres * 0.4;
    receiver.position = target; receiver.target = target;
    const plan = derivePassLaunchPlan(s, actor, receiver, target, 'direct', delivery);
    const alternatives = deriveFeasiblePassPlans(s, actor, receiver, target, 'direct', true);
    const action = { type: 'pass', actorId: actor.id, receiverId: receiver.id, target, intent: 'direct', delivery, deliveryPlan: plan };
    const released = resolveMatchAction(s, action, 'dev_ai_selected');
    const trajectory = projectFutureBallTrajectory({ position: { x: released.ball.x, y: released.ball.y, z: 0.11 }, velocity: released.ball.velocity, airborne: delivery === 'lofted', bounceCount: 0 }, 8, 0.025);
    const nearest = trajectory.reduce((a, b) => distance(a.ball.position, target) < distance(b.ball.position, target) ? a : b);
    rows.push({ metres, geometry, delivery, plan, alternatives, actualSpeed: released.ball.launchSpeed, actualVelocity: released.ball.launchVelocity,
      actualArrival: nearest.at, miss: distance(nearest.ball.position, target), finalBall: trajectory.at(-1).ball,
      interpretation: 'prescribed release; execution error retained; no defenders, not a reception/interception success' });
  }
  emit('flight', { rows }); console.log(JSON.stringify({ mode, rows: rows.length }));
} else {
  const initial = JSON.parse(gunzipSync(readFileSync('docs/performance/PR176-pr177-initial-states.json.gz')));
  const expected = JSON.parse(readFileSync('docs/performance/PR176-pr177-new-fixtures.json', 'utf8'));
  for (const f of initial) { const e = expected.designs.find((d) => d.design.id === f.design.id); if (sha(f.state) !== e.inputHash || sha(f.session) !== e.sessionHash) throw new Error('Original fixture hash mismatch'); }
  const split = mode === 'validation' ? 'validation' : 'development';
  const fixtures = initial.filter((f) => f.design.split === split && (!args.has('ids') || args.get('ids').split(',').includes(f.design.id)));
  const limit = Number(args.get('seconds') ?? 7200);
  for (const f of fixtures) {
    const file = `${out}/${f.design.id}.json`;
    if (existsSync(file)) {
      const old = JSON.parse(readFileSync(file, 'utf8'));
      if (old.manifest.sourceHash !== sourceHash || old.manifest.harnessHash !== manifest.harnessHash || old.limit !== limit) throw new Error('Incompatible existing run');
      console.log(`resume ${f.design.id}`); continue;
    }
    const run = (observed) => {
      let s = apply(f.state), ticks = 0;
      const observer = new Pr175Observer(), transitions = [], profiler = new PerformanceProfiler({ enabled: args.has('profile') });
      const hooks = ['decision', 'incoming', 'components'].map((n) => Symbol.for(`mfl.pr172.${n}`));
      globalThis[hooks[0]] = observed ? (s, a, r) => {
        observer.decision(s, a, r, r[0]?.action);
        if (active?.exposure.active) active.candidates.push({ at: s.time, actorId: a, selected: r[0]?.action,
          options: r.map((x) => ({ action: x.action, value: x.canonicalScore })) });
      } : undefined;
      globalThis[hooks[1]] = observed ? (s, a, r, selected) => observer.decision(s, a, r, selected, true) : undefined;
      globalThis[hooks[2]] = observed ? observer.component : undefined;
      const start = performance.now(), cpu = process.cpuUsage(); let active;
      try {
        while (!['full_time', 'abandoned'].includes(s.status ?? '') && s.time < limit) {
          if (s.status === 'half_time') s = startSecondHalf(s);
          const before = s;
          profiler.beginTick(ticks);
          s = withPerformanceProfiler(profiler, () => stepTacticalMatchAfterDecisionProbe(s, 0.025)); ticks++;
          if (s === before) throw new Error('Canonical spectator stalled');
          if (observed) {
            observer.observe(before, s);
            const owner = s.players.find((p) => p.id === s.ball.ownerId);
            if (owner && before.possessionTeam !== s.possessionTeam) {
              if (active) { active.end = s.time; active.outcome = 'turnover'; transitions.push(active); }
              const exposure = evaluateTransitionOpportunity(s, owner);
              active = { at: s.time, team: owner.team, origin: { ...owner.position }, depth: attacksRight(owner) ? owner.position.x : 105 - owner.position.x,
                exposure, cause: s.lastPossessionLoss?.cause, firstForwardAction: null, maxControlledProgress: 0, shots: [], candidates: [], recovered: false };
            }
            if (active) {
              if (owner?.team === active.team) {
                const depth = attacksRight(owner) ? owner.position.x : 105 - owner.position.x;
                active.maxControlledProgress = Math.max(active.maxControlledProgress, depth - active.depth);
                if (evaluateTransitionOpportunity(s, owner).cover >= 5) active.recovered = true;
              }
              const action = s.latestAction;
              const acting = s.players.find((p) => p.id === action?.actorId);
              if (!active.firstForwardAction && s.decisionIndex !== before.decisionIndex && action && 'target' in action && acting?.team === active.team &&
                (attacksRight(acting) ? action.target.x - active.origin.x : active.origin.x - action.target.x) > 3)
                active.firstForwardAction = { at: s.time, action };
              if (s.lastShot?.shotId !== before.lastShot?.shotId && s.lastShot) active.shots.push(s.lastShot);
              if (s.time - active.at >= 8 || s.scenario !== 'open_play') { active.end = s.time; active.outcome = s.scenario === 'open_play' ? 'window-ended' : s.scenario; transitions.push(active); active = undefined; }
            }
          }
          if (ticks % 40000 === 0) console.log(`${f.design.id} ${policy} t=${s.time.toFixed(0)}`);
        }
      } catch (error) { writeFileSync(`${out}/${f.design.id}-failure-state.json.gz`, gzipSync(JSON.stringify(s))); throw error; }
      finally { hooks.forEach((k) => { globalThis[k] = undefined; }); }
      if (active) { active.end = s.time; active.outcome = 'run-ended'; transitions.push(active); }
      assertMatchStatisticsInvariants(s.statistics);
      const usage = process.cpuUsage(cpu);
      return { finalHash: sha(s), ticks, status: s.status, time: s.time, score: s.score, official: projectMatchCentreStatistics(s),
        statistics: s.statistics, wallMs: performance.now() - start, cpuMs: (usage.user + usage.system) / 1000,
        memory: process.memoryUsage(), profiler: profiler.snapshot(), transitions, observations: observed ? observer.snapshot(s) : null };
    };
    const result = run(!args.has('plain'));
    const plain = args.has('equivalence') ? run(false) : null;
    if (plain && (plain.finalHash !== result.finalHash || plain.ticks !== result.ticks)) throw new Error('Observer changes canonical state');
    const afterHash = sha(sourceFiles.map((p) => `${p}\0${readFileSync(`src/core/matchSimulation/${p}`, 'utf8').replaceAll('\r\n', '\n')}\0`).join(''));
    if (afterHash !== sourceHash) throw new Error('Production source changed during run; retain censored run separately');
    const { observations, transitions, ...compact } = result;
    writeFileSync(`${out}/${f.design.id}-raw.json.gz`, gzipSync(JSON.stringify({ observations, transitions })));
    emit(f.design.id, { design: f.design, inputHash: f.inputHash, limit, ...compact, counts: observations?.counts,
      observationChoices: observations?.choices.length, transitions: transitions.length, exposedTransitions: transitions.filter((t) => t.exposure.active).length,
      equivalence: plain ? { equal: true, ...plain, observations: undefined } : null });
    console.log(JSON.stringify({ id: f.design.id, policy, status: result.status, time: result.time, score: result.score, cpuMs: result.cpuMs }));
  }
}
