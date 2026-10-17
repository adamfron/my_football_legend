import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { createPr171Fixture, PR171_COHORT } from './pr171Fixtures';
import { AttackingFunnelTracker } from '../src/core/matchSimulation/attackingFunnel';
import { PassingConnectivityTracker } from '../src/core/matchSimulation/passingConnectivityDiagnostics';
import { OffensiveContinuationTracker } from '../src/core/matchSimulation/offensiveContinuationFunnel';
import {
  FIXED_MATCH_DT,
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats';
import { projectMatchCentreStatistics } from '../src/core/matchSimulation/matchCentreStatistics';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const mode = z.enum(['cohort', 'equivalence', 'confirm']).parse(args.get('mode') ?? 'cohort');
const seconds = z
  .number()
  .positive()
  .max(7200)
  .parse(Number(args.get('seconds') ?? 7200));
const out = resolve(args.get('output-dir') ?? '../pr171-full');
mkdirSync(out, { recursive: true });
export const digest = (value: unknown) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
const sourceDigest = () => {
  const walk = (p: string): string[] =>
    readdirSync(p, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(resolve(p, e.name))
        : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')
          ? [resolve(p, e.name)]
          : [],
    );
  return digest(
    walk('src/core/matchSimulation')
      .sort()
      .map(
        (p) =>
          `${relative('.', p).replaceAll('\\', '/')}\0${readFileSync(p, 'utf8').replaceAll('\r\n', '\n')}\0`,
      )
      .join(''),
  );
};
const source = sourceDigest();
const replicate = args.has('replicate')
  ? z
      .string()
      .regex(/^[a-z0-9-]{1,24}$/)
      .parse(args.get('replicate'))
  : undefined;
const manifest = {
  version: 1,
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: source,
  harnessHash: digest(
    readFileSync(new URL(import.meta.url), 'utf8') +
      readFileSync('scripts/pr171Fixtures.ts', 'utf8'),
  ),
  fixedDt: FIXED_MATCH_DT,
  node: process.version,
  secondsLimit: seconds,
  observer: 'existing attacking/continuation/passing trackers; opt-in audit extension',
};
const families = args.has('families')
  ? args
      .get('families')!
      .split(',')
      .map((v) => z.enum(PR171_COHORT).parse(v))
  : [...PR171_COHORT];
for (const family of families)
  for (const reversed of [false, true]) {
    const file = resolve(
      out,
      `${mode}-${family}${replicate ? `-${replicate}` : ''}-${reversed}.json`,
    );
    if (args.has('resume') && existsSync(file)) {
      const previous = JSON.parse(readFileSync(file, 'utf8'));
      if (
        previous.manifest.sourceHash !== source ||
        previous.manifest.harnessHash !== manifest.harnessHash ||
        previous.manifest.secondsLimit !== seconds
      )
        throw new Error('Incompatible checkpoint');
      console.log(`resume ${family} ${reversed}`);
      continue;
    }
    const fixture = createPr171Fixture(family, reversed, replicate);
    const run = (observed: boolean) => {
      let state = structuredClone(fixture.state);
      const initialStateHash = digest(state);
      const attacking = new AttackingFunnelTracker(undefined, true, true);
      const passing = new PassingConnectivityTracker();
      const continuation = new OffensiveContinuationTracker();
      const start = performance.now();
      let ticks = 0,
        observerMs = 0,
        halfTime: unknown = null;
      while (!['full_time', 'abandoned'].includes(state.status ?? '') && state.time < seconds) {
        if (state.status === 'half_time') {
          const before = state;
          state = startSecondHalf(state);
          halfTime = {
            at: before.time,
            statistics: before.statistics,
            keepersBefore: before.players
              .filter((p) => p.slot.position === 'goalkeeper')
              .map((p) => ({ id: p.id, position: p.position })),
            keepersAfter: state.players
              .filter((p) => p.slot.position === 'goalkeeper')
              .map((p) => ({ id: p.id, position: p.position, target: p.target })),
          };
        }
        const previous = state;
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
        if (state === previous) throw new Error('Unexpected stalled spectator match');
        ticks++;
        if (observed) {
          const t = performance.now();
          attacking.observe(previous, state);
          passing.observe(previous, state);
          continuation.observe(previous, state);
          observerMs += performance.now() - t;
        }
        if (ticks % 24000 === 0)
          console.log(
            `${mode} ${family} reversed=${reversed} observer=${observed} t=${state.time.toFixed(1)}`,
          );
      }
      const wallMs = performance.now() - start;
      assertMatchStatisticsInvariants(state.statistics!);
      const funnel = observed ? attacking.snapshot(state.time) : null;
      const continuous = observed ? continuation.snapshot() : null;
      const official = projectMatchCentreStatistics(state);
      const passAttempts = official.home.passesAttempted + official.away.passesAttempted;
      const completions = official.home.passesCompleted + official.away.passesCompleted;
      if (
        observed &&
        (continuous!.counts.released !== passAttempts ||
          (continuous!.counts.result_completed ?? 0) !== completions)
      )
        throw new Error('Pass ledger mismatch');
      const diagnosticPasses = funnel?.audit
        ? Object.values(funnel.audit.periods).reduce((n, p) => n + (p.passReleases ?? 0), 0)
        : null;
      if (observed && diagnosticPasses !== passAttempts)
        throw new Error(`Audit pass mismatch ${diagnosticPasses}/${passAttempts}`);
      const roster = [...state.players, ...(state.departedPlayers ?? [])];
      return {
        initialStateHash,
        finalStateHash: digest(state),
        ticks,
        wallMs,
        observerMs,
        time: state.time,
        status: state.status,
        score: state.score,
        decisionIndex: state.decisionIndex,
        official,
        statistics: state.statistics,
        roles: Object.fromEntries(
          roster.map((p) => [p.id, { team: p.team, position: p.slot?.position ?? null }]),
        ),
        halfTime,
        attacking: funnel,
        continuation: continuous,
        passing: observed ? passing.snapshot() : null,
        memory: {
          heapUsedBytes: process.memoryUsage().heapUsed,
          serializedDiagnosticsBytes: observed
            ? Buffer.byteLength(JSON.stringify({ funnel, continuous, passing: passing.snapshot() }))
            : 0,
        },
        reconciliation: {
          passAttempts,
          completions,
          diagnosticPasses,
          completedNetwork: state.statistics!.passingNetwork.reduce((n, e) => n + e.completed, 0),
          received: state.statistics!.players.reduce((n, p) => n + p.passesReceived, 0),
        },
      };
    };
    const checkpoint =
      mode === 'confirm'
        ? JSON.parse(readFileSync(resolve(out, `cohort-${family}-${reversed}.json`), 'utf8'))
        : null;
    if (
      checkpoint &&
      (checkpoint.manifest.sourceHash !== source ||
        checkpoint.fixture.fixtureHash !== digest(fixture.session) ||
        checkpoint.manifest.harnessHash !== manifest.harnessHash)
    )
      throw new Error('Confirmation source/fixture mismatch');
    const observed = checkpoint ? checkpoint.observed : run(true);
    let equivalence: unknown = null;
    if (mode === 'equivalence' || mode === 'confirm') {
      const disabled = run(false);
      if (disabled.finalStateHash !== observed.finalStateHash || disabled.ticks !== observed.ticks)
        throw new Error('Observer altered canonical match');
      equivalence = {
        disabled,
        completeCanonicalStateEqual: true,
        runtimeRatio: observed.wallMs / disabled.wallMs,
      };
    }
    if (sourceDigest() !== source) throw new Error('Source changed during experiment');
    writeFileSync(
      file,
      JSON.stringify(
        {
          manifest,
          fixture: {
            family: replicate ? `${family}:${replicate}` : family,
            seed: fixture.seed,
            reversed,
            fixtureHash: digest(fixture.session),
            home: {
              id: fixture.session.home.club.id,
              formation: fixture.session.home.formation,
              strength: fixture.session.home.strength,
              style: fixture.state.teams.home.style,
            },
            away: {
              id: fixture.session.away.club.id,
              formation: fixture.session.away.formation,
              strength: fixture.session.away.strength,
              style: fixture.state.teams.away.style,
            },
          },
          observed,
          equivalence,
        },
        null,
        2,
      ),
    );
    console.log(`saved ${file}`);
  }
