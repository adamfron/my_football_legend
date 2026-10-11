import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import {
  benchmarkFixtureSchema,
  createFormationBenchmarkSession,
  formationIdSchema,
} from '../src/core/matchSimulation/benchmarkFixtures';
import {
  AttackingFunnelTracker,
  FUNNEL_VERSION,
} from '../src/core/matchSimulation/attackingFunnel';
import { TACTICAL_PREFERENCE_DEFAULTS } from '../src/core/matchSimulation/tacticalPreferences';
import { tacticalStyleSchema } from '../src/core/matchSimulation/matchState';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=')];
  }),
);
const config = z
  .object({
    anchor: formationIdSchema,
    opponents: z.array(formationIdSchema).min(1),
    attributes: z.number().int().min(1).max(100),
    opponentAttributes: z.number().int().min(1).max(100),
    seeds: z.array(z.string().min(1)).min(1),
    minutes: z.number().positive().max(120),
    style: tacticalStyleSchema,
    normaliseDuties: z.boolean(),
    traces: z.boolean(),
    mode: z.enum(['geometry', 'clubs', 'baseline']),
    observer: z.boolean(),
  })
  .parse({
    anchor: args.get('anchor') ?? '4-4-2',
    opponents: (args.get('opponents') ?? '4-3-3,4-2-3-1,4-4-2,3-4-2-1,3-5-2').split(','),
    attributes: Number(args.get('attributes') ?? 50),
    opponentAttributes: Number(args.get('opponent-attributes') ?? args.get('attributes') ?? 50),
    seeds: args.has('seeds')
      ? args.get('seeds')!.split(',')
      : Array.from({ length: Number(args.get('seed-count') ?? 3) }, (_, i) => `pr162-${i + 1}`),
    minutes: Number(args.get('minutes') ?? 90),
    style: args.get('style') ?? 'balanced',
    normaliseDuties: args.has('normalise-duties'),
    traces: args.has('traces'),
    mode: args.get('mode') ?? 'geometry',
    observer: !args.has('no-observer'),
  });
if (
  new Set(config.seeds).size !== config.seeds.length ||
  new Set(config.opponents).size !== config.opponents.length
)
  throw new Error('Seeds and formations must be unique.');
const root = resolve(args.get('engine-root') ?? process.cwd());
const load = <T>(path: string): Promise<T> => import(pathToFileURL(resolve(root, path)).href);
const engine = await load<typeof import('../src/core/matchSimulation/matchSimulation')>(
  'src/core/matchSimulation/matchSimulation.ts',
);
const actions = await load<typeof import('../src/core/matchSimulation/matchActions')>(
  'src/core/matchSimulation/matchActions.ts',
);
const shooting = await load<typeof import('../src/core/matchSimulation/shootingOpportunity')>(
  'src/core/matchSimulation/shootingOpportunity.ts',
);
const options = await load<typeof import('../src/core/matchSimulation/shootingOptions')>(
  'src/core/matchSimulation/shootingOptions.ts',
);
const digest = (content: string) => createHash('sha256').update(content).digest('hex');
const sourceHash = () => {
  const files: string[] = [];
  const walk = (folder: string) => {
    for (const e of readdirSync(folder, { withFileTypes: true })) {
      const p = resolve(folder, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.ts$/.test(p) && !/\.test\.ts$/.test(p)) files.push(p);
    }
  };
  // Includes squad generation, profiles, schemas and physics, not only the match subtree.
  for (const folder of ['src/core', 'src/schemas', 'src/types']) walk(resolve(root, folder));
  return digest(
    files
      .sort()
      .map(
        (file) =>
          `${relative(root, file).replaceAll('\\', '/')}\0${readFileSync(file, 'utf8').replaceAll('\r\n', '\n')}\0`,
      )
      .join(''),
  );
};
const benchmarkHash = () =>
  digest(
    [
      'scripts/benchmarkFormationGeometry.ts',
      'src/core/matchSimulation/benchmarkFixtures.ts',
      'src/core/matchSimulation/attackingFunnel.ts',
    ]
      .map((p) => readFileSync(resolve(p), 'utf8').replaceAll('\r\n', '\n'))
      .join('\0'),
  );
const manifest = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  engineHash: sourceHash(),
  benchmarkHash: benchmarkHash(),
  telemetryVersion: FUNNEL_VERSION,
  fixedDt: engine.FIXED_MATCH_DT,
  node: process.version,
  config,
};
if (args.has('revision') && args.get('revision') !== manifest.commit)
  throw new Error('Requested revision does not match checkout HEAD.');
const out = resolve(
  args.get('output') ?? args.get('out') ?? 'docs/performance/PR162-formation-pilot.json',
);
mkdirSync(dirname(out), { recursive: true });
const checkpoint =
  args.has('resume') && existsSync(out)
    ? (JSON.parse(readFileSync(out, 'utf8')) as { manifest: typeof manifest; results: Result[] })
    : undefined;
if (checkpoint && JSON.stringify(checkpoint.manifest) !== JSON.stringify(manifest))
  throw new Error('Resume rejected: immutable source/configuration differs.');
type Result = {
  key: string;
  formation: string;
  seed: string;
  reversed: boolean;
  fixtureHash: string;
  initialStateHash: string;
  finalStatus: string;
  finalTime: number;
  ticks: number;
  wallMs: number;
  stateHash: string;
  finalDiagnostics: unknown;
  statistics: Pick<
    NonNullable<ReturnType<typeof engine.createTacticalMatch>['statistics']>,
    'players' | 'playerTeams' | 'teamAccounting' | 'passingNetwork'
  >;
  score: { home: number; away: number };
  funnel: ReturnType<AttackingFunnelTracker['snapshot']> | null;
};
const results: Result[] = checkpoint?.results ?? [];
const profiles: Record<string, unknown> =
  checkpoint && 'profiles' in checkpoint ? (checkpoint.profiles as Record<string, unknown>) : {};
const world = config.mode === 'geometry' ? undefined : createCanonicalWorldDatabase();
const blekitni = world?.clubs.find((c) => c.name.includes('Błękitni Port'));
const gornik = world?.clubs.find((c) => c.name.includes('Górnik Brzeziny'));
if (world && (!blekitni || !gornik)) throw new Error('Actual clubs not found.');
const fixtures =
  config.mode === 'geometry'
    ? config.opponents
    : config.mode === 'clubs'
      ? ['clubs']
      : ['clubs', 'balanced', 'strong-weak', 'high-press'];
const paired = () =>
  fixtures.map((formation) => {
    const blocks = config.seeds.flatMap((seed) => {
      const pair = results.filter((r) => r.formation === formation && r.seed === seed);
      if (pair.length !== 2) return [];
      const values = pair.map((r) => {
        const anchor = r.reversed ? 'away' : 'home';
        const opponent = r.reversed ? 'home' : 'away';
        const players = (side: string) =>
          r.statistics.players.filter((p) => r.statistics.playerTeams?.[p.playerId] === side);
        const shots = (side: string) => players(side).reduce((s, p) => s + p.shots, 0);
        const entries = (side: 'home' | 'away') => r.funnel?.teams[side].events.final_entry ?? 0;
        return {
          goals: r.score[anchor] - r.score[opponent],
          shots: shots(anchor) - shots(opponent),
          finalEntries: entries(anchor) - entries(opponent),
        };
      });
      return [
        {
          seed,
          goals: (values[0]!.goals + values[1]!.goals) / 2,
          shots: (values[0]!.shots + values[1]!.shots) / 2,
          finalEntries: (values[0]!.finalEntries + values[1]!.finalEntries) / 2,
        },
      ];
    });
    return {
      formation,
      completedPairs: blocks.length,
      plannedPairs: config.seeds.length,
      blocks,
      metrics: Object.fromEntries(
        ['goals', 'shots', 'finalEntries'].map((metric) => {
          const a = blocks.map((b) => b[metric as 'goals']).sort((a, b) => a - b);
          const n = a.length;
          const mean = n ? a.reduce((s, x) => s + x, 0) / n : null;
          const sd =
            n > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - mean!) ** 2, 0) / (n - 1)) : null;
          const critical = [
            0, 0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201,
          ][Math.min(n, 12)]!;
          const margin = sd === null ? null : (critical * sd) / Math.sqrt(n);
          return [
            metric,
            {
              n,
              mean,
              median: n ? (a[Math.floor((n - 1) / 2)]! + a[Math.floor(n / 2)]!) / 2 : null,
              sd,
              exploratory95Interval: margin === null ? null : [mean! - margin, mean! + margin],
            },
          ];
        }),
      ),
    };
  });
const save = () => {
  if (sourceHash() !== manifest.engineHash || benchmarkHash() !== manifest.benchmarkHash)
    throw new Error('Source changed during the run.');
  const payload = {
    manifest,
    expectedMatches: fixtures.length * config.seeds.length * 2,
    completedMatches: results.length,
    methodology:
      'Canonical fixed-step spectator simulation; native whistle at 90 minutes, otherwise fixed horizon. Mirrored orientations averaged per seed; exploratory seed-block t intervals. Candidate observations sampled every >=2s, not complete decision counts. Profiles omit unused session x/y: createTacticalMatch starts at neutral anchors.',
    profiles,
    results,
    paired: paired(),
  };
  writeFileSync(`${out}.tmp`, JSON.stringify(payload) + '\n');
  renameSync(`${out}.tmp`, out);
};
save();
for (const formation of fixtures)
  for (const seed of config.seeds)
    for (const reversed of [false, true]) {
      const key = `${formation}:${seed}:${reversed}`;
      if (results.some((r) => r.key === key)) continue;
      let session: ReturnType<typeof createSingleMatchSession>;
      if (config.mode === 'geometry')
        session = createFormationBenchmarkSession(
          benchmarkFixtureSchema.parse({
            anchor: config.anchor,
            opponent: formation,
            seed,
            reversed,
            attributes: config.attributes,
            opponentAttributes: config.opponentAttributes,
            style: config.style,
            normaliseDuties: config.normaliseDuties,
          }),
        );
      else {
        const first = formation === 'balanced' ? world!.clubs[2]! : blekitni!;
        const second = formation === 'strong-weak' ? world!.clubs[63]! : gornik!;
        session = createSingleMatchSession(world!, {
          seed,
          homeClubId: (reversed ? second : first).id,
          awayClubId: (reversed ? first : second).id,
          control: { mode: 'spectator' },
        });
      }
      let state = engine.createTacticalMatch(session);
      state.playerAgencyEnabled = false;
      if (config.mode === 'geometry' || formation !== 'clubs')
        for (const side of ['home', 'away'] as const) {
          const style = formation === 'high-press' ? 'pressing' : config.style;
          state.teams[side].style = style;
          state.teams[side].tacticalPreferences = { ...TACTICAL_PREFERENCE_DEFAULTS[style] };
        }
      const profileRecord = {
        home: {
          ...session.home,
          players: session.home.players.map(({ x: _x, y: _y, ...p }) => {
            void [_x, _y];
            return p;
          }),
        },
        away: {
          ...session.away,
          players: session.away.players.map(({ x: _x, y: _y, ...p }) => {
            void [_x, _y];
            return p;
          }),
        },
        tactics: state.teams,
      };
      const fixtureHash = digest(JSON.stringify(profileRecord));
      profiles[fixtureHash] = profileRecord;
      const initialStateHash = digest(JSON.stringify(state));
      const tracker = config.observer
        ? new AttackingFunnelTracker(
            {
              ranking: actions.rankAvailableActionsForAI,
              opportunity: shooting.evaluateShootingOpportunity,
              executable: options.canExecuteCanonicalShot,
              delay: actions.npcPossessionDecisionDelay,
            },
            config.traces,
          )
        : undefined;
      const start = performance.now();
      let ticks = 0;
      const horizon = config.minutes === 90 ? 7200 : config.minutes * 60;
      while (state.time < horizon && !['full_time', 'abandoned'].includes(state.status ?? '')) {
        if (state.status === 'half_time') state = engine.startSecondHalf(state);
        const previous = state;
        state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
        tracker?.observe(previous, state);
        ticks++;
      }
      assertMatchStatisticsInvariants(state.statistics!, state);
      const { players, playerTeams, teamAccounting, passingNetwork } = state.statistics!;
      results.push({
        key,
        formation,
        seed,
        reversed,
        fixtureHash,
        initialStateHash,
        finalStatus: state.status ?? 'unknown',
        finalTime: state.time,
        ticks,
        wallMs: performance.now() - start,
        stateHash: digest(JSON.stringify(state)),
        finalDiagnostics: {
          timekeeping: state.timekeeping,
          restart: state.restart,
          ball: state.ball,
          injuryAssessment: state.injuryAssessment,
          restartLiveness: state.restartLivenessDiagnostics,
          looseBallLiveness: state.looseBallLivenessDiagnostics,
          substitutions: state.substitutionState?.completed,
        },
        statistics: { players, playerTeams, teamAccounting, passingNetwork },
        score: state.score,
        funnel: tracker?.snapshot(state.time) ?? null,
      });
      save();
      console.info(
        JSON.stringify({
          completed: results.length,
          planned: fixtures.length * config.seeds.length * 2,
          key,
          status: state.status,
          time: state.time,
          shots: state.statistics!.players.reduce((s, p) => s + p.shots, 0),
          score: state.score,
          wallMs: Math.round(results.at(-1)!.wallMs),
        }),
      );
    }
