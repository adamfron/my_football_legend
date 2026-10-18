import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { createPr175Fixture, PR175_DESIGNS } from './pr175Fixtures';
import { Pr175Observer } from './pr175Observer';
import { pr172Hash, pr172SourceHash } from './pr172Evidence';
import { AttackingFunnelTracker } from '../src/core/matchSimulation/attackingFunnel';
import { CombinationPlayTracker } from '../src/core/matchSimulation/footballIntelligenceDiagnostics';
import { startSecondHalf, stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats';
import { projectMatchCentreStatistics } from '../src/core/matchSimulation/matchCentreStatistics';
import type { MatchAction, TacticalMatchState } from '../src/core/matchSimulation/matchState';
import type { RankedAiAction } from '../src/core/matchSimulation/matchActions';

const args = new Map(process.argv.slice(2).map((s) => { const [k, ...v] = s.replace(/^--/, '').split('='); return [k, v.join('=')]; }));
const out = resolve(args.get('output-dir') ?? '../pr175-development');
const mode = z.enum(['manifest', 'cohort', 'plain', 'equivalence']).parse(args.get('mode') ?? 'cohort');
const split = z.enum(['development', 'validation']).parse(args.get('split') ?? 'development');
const limit = z.coerce.number().positive().max(7200).parse(args.get('seconds') ?? 7200);
mkdirSync(out, { recursive: true });
const scripts = ['scripts/benchmarkPr175.ts', 'scripts/pr175Fixtures.ts', 'scripts/pr175Observer.ts', 'scripts/pr172DecisionLoader.mjs', 'scripts/pr167Fixtures.ts', 'scripts/createCanonicalWorldDatabase.ts'];
const manifest = {
  version: 1, baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: pr172SourceHash(), harnessHashes: Object.fromEntries(scripts.map((p) => [p, pr172Hash(readFileSync(p, 'utf8').replaceAll('\r\n', '\n'))])),
  node: process.version, fixedDt: 0.025, limit, mode,
  fixtureDesign: '12 fresh seeds/design blocks; six development, six validation; no mirrors; prescribed attribute strata are not native population estimates',
};
if (mode === 'manifest') {
  const designs = PR175_DESIGNS.map((d) => {
    const f = createPr175Fixture(d.id);
    return { ...d, fixtureHash: pr172Hash(f.session), initialHash: pr172Hash(f.state),
      actualClubs: [f.session.home.club.id, f.session.away.club.id],
      teams: Object.fromEntries((['home', 'away'] as const).map((side) => [side, {
        strength: f.session[side].strength, players: f.session[side].players.map((p) => ({ id: p.footballerId, position: p.slot.position, attributes: p.profile.attributes })),
      }])) };
  });
  const path = resolve('docs/performance/PR175-new-fixture-manifest.json');
  if (existsSync(path)) throw new Error('Frozen fixture manifest already exists; do not overwrite');
  writeFileSync(path, JSON.stringify({ manifest, frozenBeforeGameplayChanges: true, validationConsumed: false,
    primaryOutcomes: ['credible choices and candidate/release conversion', 'controlled progression and recycling', 'event/goal reconciliation', 'defensive losses and discipline'],
    designs }, null, 2) + '\n');
  console.log(`frozen ${designs.length} designs`);
} else {
  const frozen = JSON.parse(readFileSync('docs/performance/PR175-new-fixture-manifest.json', 'utf8'));
  const ids = args.has('ids') ? args.get('ids')!.split(',') : PR175_DESIGNS.filter((d) => d.split === split).map((d) => d.id);
  const hooks = globalThis as unknown as Record<symbol, ((...a: never[]) => void) | undefined>;
  for (const id of ids) {
    const fixture = createPr175Fixture(id), design = frozen.designs.find((d: { id: string }) => d.id === id);
    if (!design || design.initialHash !== pr172Hash(fixture.state) || design.fixtureHash !== pr172Hash(fixture.session)) throw new Error('Frozen input mismatch');
    const path = resolve(out, `${id}-${mode}.json`);
    if (args.has('resume') && existsSync(path)) {
      const old = JSON.parse(readFileSync(path, 'utf8'));
      if (old.manifest.sourceHash !== manifest.sourceHash || pr172Hash(old.manifest.harnessHashes) !== pr172Hash(manifest.harnessHashes) || old.manifest.limit !== limit) throw new Error('Incompatible receipt');
      console.log(`resume ${id}`); continue;
    }
    const run = (observed: boolean) => {
      let state = structuredClone(fixture.state);
      const observer = new Pr175Observer(), attacking = new AttackingFunnelTracker(undefined, true, true), combinations = new CombinationPlayTracker();
      hooks[Symbol.for('mfl.pr172.decision')] = observed ? ((s: TacticalMatchState, a: string, r: RankedAiAction[]) => observer.decision(s, a, r, r[0]?.action)) as never : undefined;
      hooks[Symbol.for('mfl.pr172.incoming')] = observed ? ((s: TacticalMatchState, a: string, r: RankedAiAction[], selected?: MatchAction) => observer.decision(s, a, r, selected, true)) as never : undefined;
      hooks[Symbol.for('mfl.pr172.components')] = observed ? observer.component as never : undefined;
      let ticks = 0, observerMs = 0;
      const started = performance.now(), cpu = process.cpuUsage();
      try {
        while (!['full_time', 'abandoned'].includes(state.status ?? '') && state.time < limit) {
          if (state.status === 'half_time') state = startSecondHalf(state);
          const before = state;
          state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
          if (state === before) throw new Error('Unexpected spectator stall');
          ticks++;
          if (observed) {
            const t = performance.now(); observer.observe(before, state); attacking.observe(before, state); combinations.observe(before, state); observerMs += performance.now() - t;
          }
          if (ticks % 24000 === 0) console.log(`${id} observed=${observed} t=${state.time.toFixed(1)}`);
        }
      } catch (error) {
        writeFileSync(resolve(out, `${id}-failure-state.json.gz`), gzipSync(JSON.stringify(state)));
        writeFileSync(resolve(out, `${id}-failure.json`), JSON.stringify({ manifest, at: state.time, ticks, error: String(error) }, null, 2));
        throw error;
      } finally {
        for (const key of ['decision', 'incoming', 'components']) hooks[Symbol.for(`mfl.pr172.${key}`)] = undefined;
      }
      const usage = process.cpuUsage(cpu), wallMs = performance.now() - started;
      assertMatchStatisticsInvariants(state.statistics!);
      const official = projectMatchCentreStatistics(state), data = observed ? observer.snapshot(state) : null;
      if (data) {
        if (data.passes.length !== official.home.passesAttempted + official.away.passesAttempted) throw new Error('Research pass release mismatch');
        if (data.shots.length !== official.home.shots + official.away.shots) throw new Error('Research shot release mismatch');
        if (data.goals.length !== state.score.home + state.score.away) throw new Error('Research goal mismatch');
        if (!data.choices.length) throw new Error('Actual-decision hook absent; use registerPr172DecisionObserver.mjs');
      }
      return { initialHash: pr172Hash(fixture.state), finalHash: pr172Hash(state), ticks, status: state.status, time: state.time,
        score: state.score, official, statistics: state.statistics,
        roles: Object.fromEntries([...state.players, ...(state.departedPlayers ?? [])].map((p) => [p.id, { team: p.team, position: p.slot.position, attributes: p.profile.attributes }])),
        defence: state.defensiveTelemetry, threatMemory: { home: state.teams.home.threatMemory, away: state.teams.away.threatMemory },
        wallMs, cpuMs: (usage.user + usage.system) / 1000, observerMs, memory: process.memoryUsage(),
        attacking: observed ? attacking.snapshot(state.time) : null, combinations: observed ? combinations.snapshot() : null, data };
    };
    const result = run(mode !== 'plain');
    const plain = mode === 'equivalence' ? run(false) : null;
    if (plain && (plain.finalHash !== result.finalHash || plain.ticks !== result.ticks)) throw new Error('Whole canonical observer equivalence failed');
    if (pr172SourceHash() !== manifest.sourceHash) throw new Error('Source changed during match');
    if (result.data) {
      const bytes = gzipSync(JSON.stringify(result.data));
      writeFileSync(resolve(out, `${id}-observations.json.gz`), bytes);
      const { data, ...compact } = result;
      writeFileSync(path, JSON.stringify({ manifest, design, ...compact, observation: { file: `${id}-observations.json.gz`, sha256: pr172Hash(bytes.toString('base64')), counts: data.counts,
        choices: data.choices.length, episodes: data.episodes.length, shots: data.shots, goals: data.goals, compressedBytes: bytes.length }, plain, completeCanonicalStateEqual: plain ? true : null }, null, 2));
    } else writeFileSync(path, JSON.stringify({ manifest, design, ...result }, null, 2));
    console.log(`saved ${id} ${result.status}`);
  }
}
