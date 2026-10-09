import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import {
  ContactTacticalTracker,
  contactTacticalSummarySchema,
} from '../src/core/matchSimulation/contactTacticalDiagnostics';
import {
  derivePressingOpportunity,
  pressingOpportunitySchema,
} from '../src/core/matchSimulation/tacticalPreferences';
import { PR158_TACTICAL_PROFILES, type Pr158TacticalProfile } from './pr158TacticalProfiles';

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key!, value.join('=')];
  }),
);
const config = z
  .object({
    root: z.string(),
    revision: z.string(),
    seconds: z.number().positive().max(60),
    seeds: z.array(z.string()).min(1),
  })
  .parse({
    root: resolve(args.get('engine-root') ?? process.cwd()),
    revision: args.get('revision') ?? 'PR158',
    seconds: Number(args.get('seconds') ?? 12),
    seeds: (args.get('seeds') ?? 'lab-muwhj3er,pr155-natural-b,pr155-natural-c').split(','),
  });
const load = <T>(path: string): Promise<T> =>
  import(pathToFileURL(resolve(config.root, path)).href);
const [worldModule, sessions, engine, defence, positioning] = await Promise.all([
  load<typeof import('./createCanonicalWorldDatabase')>('scripts/createCanonicalWorldDatabase.ts'),
  load<typeof import('../src/core/singleMatch')>('src/core/singleMatch.ts'),
  load<typeof import('../src/core/matchSimulation/matchSimulation')>(
    'src/core/matchSimulation/matchSimulation.ts',
  ),
  load<typeof import('../src/core/matchSimulation/defensiveChallenges')>(
    'src/core/matchSimulation/defensiveChallenges.ts',
  ),
  load<typeof import('../src/core/matchSimulation/tacticalPositioning')>(
    'src/core/matchSimulation/tacticalPositioning.ts',
  ),
]);
const fingerprint = () => {
  const hash = createHash('sha256');
  const source = resolve(config.root, 'src/core/matchSimulation');
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) files.push(path);
    }
  };
  walk(source);
  files
    .sort()
    .forEach((file) =>
      hash
        .update(relative(source, file).replaceAll('\\', '/'))
        .update('\0')
        .update(readFileSync(file))
        .update('\0'),
    );
  return hash.digest('hex');
};
const frozen = fingerprint();
const observerFingerprint = () =>
  createHash('sha256')
    .update(readFileSync(resolve('src/core/matchSimulation/tacticalPreferences.ts')))
    .update(readFileSync(resolve('src/core/matchSimulation/contactTacticalDiagnostics.ts')))
    .digest('hex');
const frozenObserver = observerFingerprint();
const world = worldModule.createCanonicalWorldDatabase();
const profiles = PR158_TACTICAL_PROFILES;
const scenarios = [
  'safe_cb_outlets',
  'isolated_pursuit',
  'covered_heavy_touch',
  'coordinated_press',
  'early_counterpress',
  'late_local_counterpress',
  'reorganised_opponent',
] as const;
const fixture = (
  profile: Pr158TacticalProfile,
  scenario: (typeof scenarios)[number],
  seed: string,
) => {
  const state = engine.createTacticalMatch(
    sessions.createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed,
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  delete state.currentAction;
  delete state.latestAction;
  delete state.onBallPreparation;
  state.scenario = 'open_play';
  state.time = 30;
  state.ballOwnershipStartedAt = 30;
  state.timeSincePossessionChanged = 15;
  state.actionCooldown = 0;
  state.playerAgencyEnabled = false;
  state.possessionTeam = 'away';
  state.teams.home.style = profile.style;
  state.teams.home.tacticalPreferences = { ...profile.preferences };
  state.teams.away.style = 'balanced';
  state.teams.home.phase = 'defensive_block';
  state.teams.away.phase = 'positional_attack';
  state.players.forEach((player, index) => {
    player.position = {
      x: player.team === 'home' ? 28 + (index % 3) * 9 : 74 + (index % 3) * 8,
      y: 8 + (index % 8) * 7,
    };
    player.velocity = { x: 0, y: 0 };
    player.facingAngle = player.team === 'home' ? Math.PI / 2 : -Math.PI / 2;
    player.target = { ...player.position };
    player.idealTarget = { ...player.position };
    if (player.slot.position === 'goalkeeper')
      player.position = { x: player.team === 'home' ? 5.5 : 99.5, y: 34 };
  });
  const carrier = state.players.find(
    (player) => player.team === 'away' && player.slot.position === 'center_back',
  )!;
  const defenders = state.players.filter(
    (player) => player.team === 'home' && player.slot.position !== 'goalkeeper',
  );
  const receivers = state.players.filter(
    (player) =>
      player.team === 'away' && player.id !== carrier.id && player.slot.position !== 'goalkeeper',
  );
  carrier.position = { x: 83, y: 34 };
  defenders[0]!.position = { x: 77, y: 34 };
  receivers.slice(0, 3).forEach((player, index) => {
    player.position = [
      { x: 91, y: 34 },
      { x: 83, y: 17 },
      { x: 73, y: 47 },
    ][index]!;
  });
  if (scenario === 'isolated_pursuit')
    defenders.slice(1).forEach((player) => {
      player.position = { x: 12, y: 34 };
    });
  if (
    [
      'covered_heavy_touch',
      'coordinated_press',
      'early_counterpress',
      'late_local_counterpress',
    ].includes(scenario)
  ) {
    carrier.position = { x: 45, y: scenario === 'covered_heavy_touch' ? 3 : 14 };
    receivers.forEach((player) => {
      player.position = { x: 87, y: 50 };
    });
    defenders.slice(0, scenario === 'covered_heavy_touch' ? 2 : 5).forEach((player, index) => {
      player.position = { x: 43 - index * 2, y: carrier.position.y + 2 + index };
    });
  }
  if (
    ['early_counterpress', 'late_local_counterpress', 'reorganised_opponent'].includes(scenario)
  ) {
    state.timeSincePossessionChanged = scenario === 'late_local_counterpress' ? 8.1 : 0.5;
    state.teams.home.phase =
      scenario === 'late_local_counterpress' ? 'defensive_block' : 'defensive_transition';
    state.lastPossessionChange = {
      at: state.time - state.timeSincePossessionChanged,
      from: 'home',
      to: 'away',
      cause: 'interception',
      winnerId: carrier.id,
    };
  }
  state.ball = {
    x: carrier.position.x - (scenario === 'covered_heavy_touch' ? 1.8 : 0.55),
    y: carrier.position.y,
    ownerId: carrier.id,
    velocity: { x: 0, y: 0 },
    height: 0,
    airborne: false,
  };
  return { state, presser: defenders[0]!.id };
};
const rowSchema = z.object({
  profile: z.string(),
  scenario: z.string(),
  seed: z.string(),
  initialOpportunity: pressingOpportunitySchema,
  initialIntention: z.string(),
  initialPrimaryTarget: z.object({ x: z.number(), y: z.number() }),
  finalOwnerTeam: z.string(),
  finalOwnerId: z.string().optional(),
  canonicalSeconds: z.number().nonnegative(),
  ticks: z.number().int().positive(),
  canonicalStateHash: z.string().regex(/^[a-f0-9]{64}$/),
  statistics: z.object({
    attempts: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
    passes: z.number().int().nonnegative(),
    possessionChanges: z.number().int().nonnegative(),
  }),
  observed: contactTacticalSummarySchema,
});
const results: z.infer<typeof rowSchema>[] = [];
for (const scenario of scenarios)
  for (const profile of profiles)
    for (const seed of config.seeds) {
      const initial = fixture(profile, scenario, seed);
      const initialOpportunity = derivePressingOpportunity(initial.state, 'home');
      const initialIntention =
        defence.derivePressingPlan(initial.state, initial.presser)?.intention ?? 'none';
      const initialPrimaryTarget = positioning
        .deriveTacticalTargets(initial.state)
        .find((player) => player.id === initial.presser)!.idealTarget;
      const tracker = new ContactTacticalTracker();
      let state: TacticalMatchState = initial.state;
      const end = state.time + config.seconds;
      let ticks = 0;
      while (state.time < end) {
        const previous = state;
        state = engine.stepTacticalMatch(state, 0.025);
        if (state === previous) throw new Error('Unexpected stalled fixture.');
        tracker.observe(previous, state);
        ticks++;
      }
      const stats = state.statistics?.players ?? [];
      results.push(
        rowSchema.parse({
          profile: profile.id,
          scenario,
          seed,
          initialOpportunity,
          initialIntention,
          initialPrimaryTarget,
          finalOwnerTeam: state.possessionTeam,
          finalOwnerId: state.ball.ownerId,
          canonicalSeconds: state.time - initial.state.time,
          ticks,
          canonicalStateHash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
          statistics: {
            attempts: stats.reduce((sum, player) => sum + player.tacklesAttempted, 0),
            wins: stats.reduce((sum, player) => sum + player.tacklesWon, 0),
            passes: stats.reduce((sum, player) => sum + player.passesAttempted, 0),
            possessionChanges:
              (state.statistics?.teamAccounting?.home.possessionChanges ?? 0) +
              (state.statistics?.teamAccounting?.away.possessionChanges ?? 0),
          },
          observed: tracker.snapshot(state),
        }),
      );
    }
if (fingerprint() !== frozen)
  throw new Error('Canonical source changed during bounded tactical scenarios.');
if (observerFingerprint() !== frozenObserver)
  throw new Error('Observer source changed during bounded tactical scenarios.');
const out = resolve(args.get('out') ?? 'docs/performance/PR158-tactical-scenarios-after.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      config,
      canonicalSourceHash: frozen,
      observerSourceHash: frozenObserver,
      tacticalProfiles: profiles,
      definition:
        'Synthetic bounded physical setups; observed subsequent outcomes are not forced. Three deterministic seeds per scenario/profile. Initial turnover fixtures are explicitly configured and not counted as naturally observed match losses.',
      results,
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write(
  `${config.revision}: ${results.length} bounded tactical scenario/profile/seed runs\n`,
);
