import { createHash } from 'node:crypto';
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
import { z } from 'zod';
import type { MatchPlayerState } from '../src/core/matchSimulation/matchState';
import {
  derivePressingOpportunity,
  deriveTacticalSuitability,
  deriveTeamTacticalPreferences,
  tacticalPreferencesSchema,
  tacticalSuitabilitySchema,
} from '../src/core/matchSimulation/tacticalPreferences';
import { distance } from '../src/core/matchSimulation/matchSpace';
import {
  ContactTacticalTracker,
  contactTacticalSummarySchema,
} from '../src/core/matchSimulation/contactTacticalDiagnostics';
import { PR158_TACTICAL_PROFILES } from './pr158TacticalProfiles';

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key!, value.join('=')];
  }),
);
const config = z
  .object({
    seconds: z.number().positive().max(5400),
    seeds: z.array(z.string()).min(1),
    revision: z.string(),
    root: z.string(),
  })
  .parse({
    seconds: Number(args.get('seconds') ?? 600),
    seeds: (args.get('seeds') ?? 'lab-muwhj3er,pr155-natural-b,pr155-natural-c').split(','),
    revision: args.get('revision') ?? 'PR158',
    root: resolve(args.get('engine-root') ?? process.cwd()),
  });
const load = <T>(path: string): Promise<T> =>
  import(pathToFileURL(resolve(config.root, path)).href);
const [worldModule, sessions, engine, defence] = await Promise.all([
  load<typeof import('./createCanonicalWorldDatabase')>('scripts/createCanonicalWorldDatabase.ts'),
  load<typeof import('../src/core/singleMatch')>('src/core/singleMatch.ts'),
  load<typeof import('../src/core/matchSimulation/matchSimulation')>(
    'src/core/matchSimulation/matchSimulation.ts',
  ),
  load<typeof import('../src/core/matchSimulation/defensiveChallenges')>(
    'src/core/matchSimulation/defensiveChallenges.ts',
  ),
]);
const sourceHash = () => {
  const sourceRoot = resolve(config.root, 'src/core/matchSimulation');
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) files.push(file);
    }
  };
  walk(sourceRoot);
  const hash = createHash('sha256');
  for (const file of files.sort())
    hash
      .update(relative(sourceRoot, file).replaceAll('\\', '/'))
      .update('\0')
      .update(readFileSync(file))
      .update('\0');
  return hash.digest('hex');
};
const frozenSourceHash = sourceHash();
const observerHash = () =>
  createHash('sha256')
    .update(readFileSync(resolve('src/core/matchSimulation/tacticalPreferences.ts')))
    .update(readFileSync(resolve('src/core/matchSimulation/contactTacticalDiagnostics.ts')))
    .digest('hex');
const frozenObserverHash = observerHash();
const world = worldModule.createCanonicalWorldDatabase();
const profiles = PR158_TACTICAL_PROFILES;
const families = [
  'balanced',
  'fast_wings',
  'central_passers',
  'pressing_athletes',
  'slow_cover',
  'fragile_playmaker',
  'strong_vs_weak',
] as const;
const mutate = (player: MatchPlayerState, family: (typeof families)[number]) => {
  if (player.profile.primaryPosition === 'goalkeeper') return;
  const a = player.profile.attributes;
  const central = player.slot.position === 'central_midfielder';
  const wide = ['left_winger', 'right_winger', 'left_midfielder', 'right_midfielder'].includes(
    player.slot.position,
  );
  if (family === 'fast_wings') {
    if (wide) {
      a.pace = 92;
      a.agility = 87;
      a.dribbling = 83;
    }
    if (central) {
      a.passing = 45;
      a.technique = 48;
    }
  }
  if (family === 'central_passers' && central) {
    a.passing = 92;
    a.technique = 88;
    a.firstTouch = 90;
    a.gameReading = 91;
    a.positioning = 86;
  }
  if (family === 'pressing_athletes' && player.duty !== 'defend') {
    a.pace = 88;
    a.agility = 87;
    a.stamina = 92;
    a.aggression = 84;
    a.gameReading = 85;
    a.concentration = 88;
  }
  if (
    family === 'slow_cover' &&
    (player.duty === 'defend' || player.slot.position === 'center_back')
  ) {
    a.pace = 32;
    a.agility = 36;
    a.positioning = 44;
    a.gameReading = 42;
  }
  if (family === 'fragile_playmaker' && central) {
    a.passing = 94;
    a.technique = 92;
    a.firstTouch = 89;
    a.gameReading = 90;
    a.stamina = 22;
    a.pace = 48;
    a.aggression = 28;
  }
};
const countersSchema = z.object({
  defensiveSamples: z.number().int().nonnegative(),
  organisedPressSamples: z.number().int().nonnegative(),
  counterpressSamples: z.number().int().nonnegative(),
  blockSamples: z.number().int().nonnegative(),
  safeOutlets: z.number().nonnegative(),
  plannedEngagement: z.number().nonnegative(),
  highEngagementWithSafeOutlets: z.number().int().nonnegative(),
  screenSamples: z.number().int().nonnegative(),
  engageSamples: z.number().int().nonnegative(),
  pressingDepth: z.number().nonnegative(),
  distanceToTarget: z.number().nonnegative(),
  holdNearUsefulTarget: z.number().int().nonnegative(),
});
const rowSchema = z.object({
  profile: z.string(),
  family: z.string(),
  seed: z.string(),
  canonicalSeconds: z.number().nonnegative(),
  ticks: z.number().int().nonnegative(),
  elapsedMs: z.number().nonnegative(),
  canonicalStateHash: z.string(),
  preferences: tacticalPreferencesSchema,
  suitability: tacticalSuitabilitySchema,
  contactTransitionsAndWorkload: contactTacticalSummarySchema,
  diagnostics: countersSchema,
  football: z.object({
    touches: z.number().int().nonnegative(),
    passes: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    carries: z.number().int().nonnegative(),
    attempts: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
    shots: z.number().int().nonnegative(),
    goals: z.number().int().nonnegative(),
    distanceMetres: z.number().nonnegative(),
    sprintMetres: z.number().nonnegative(),
    centralPasses: z.number().int().nonnegative(),
  }),
});
const out = resolve(args.get('out') ?? 'docs/performance/PR158-tactics-after.json');
const selectedFamilies = families.filter(
  (value) => !args.has('families') || args.get('families')!.split(',').includes(value),
);
const selectedProfiles = profiles.filter(
  (value) => !args.has('profiles') || args.get('profiles')!.split(',').includes(value.id),
);
const keyFor = (row: { family: string; profile: string; seed: string }) =>
  `${row.family}/${row.profile}/${row.seed}`;
const expectedKeys = new Set(
  selectedFamilies.flatMap((family) =>
    selectedProfiles.flatMap((profile) =>
      config.seeds.map((seed) => keyFor({ family, profile: profile.id, seed })),
    ),
  ),
);
if (expectedKeys.size !== selectedFamilies.length * selectedProfiles.length * config.seeds.length)
  throw new Error('Duplicate fixture/profile/seed configuration.');
const checkpointSchema = z.object({
  config: z.object({
    seconds: z.number(),
    seeds: z.array(z.string()),
    revision: z.string(),
    root: z.string(),
  }),
  canonicalSourceHash: z.string(),
  observerSourceHash: z.string(),
  tacticalProfiles: z.array(
    z.object({ id: z.string(), style: z.string(), preferences: tacticalPreferencesSchema }),
  ),
  results: z.array(rowSchema),
});
const results: z.infer<typeof rowSchema>[] = [];
const completedKeys = new Set<string>();
if (args.has('resume')) {
  if (!existsSync(out)) throw new Error(`Resume checkpoint is missing: ${out}`);
  const checkpoint = checkpointSchema.parse(JSON.parse(readFileSync(out, 'utf8')));
  if (
    JSON.stringify(checkpoint.config) !== JSON.stringify(config) ||
    checkpoint.canonicalSourceHash !== frozenSourceHash ||
    checkpoint.observerSourceHash !== frozenObserverHash ||
    JSON.stringify(checkpoint.tacticalProfiles) !== JSON.stringify(profiles)
  )
    throw new Error(
      'Resume checkpoint configuration, canonical source, observer or profiles differ.',
    );
  for (const row of checkpoint.results) {
    const key = keyFor(row);
    if (!expectedKeys.has(key) || completedKeys.has(key))
      throw new Error(`Unexpected or duplicate completed fixture: ${key}`);
    if (
      row.canonicalSeconds < config.seconds ||
      row.canonicalSeconds > config.seconds + 0.026 ||
      !/^[a-f0-9]{64}$/.test(row.canonicalStateHash)
    )
      throw new Error(`Incomplete or mismatched completed fixture: ${key}`);
    completedKeys.add(key);
    results.push(row);
  }
  process.stdout.write(
    `Resuming ${results.length}/${expectedKeys.size} validated completed tactical fixtures.\n`,
  );
}
mkdirSync(dirname(out), { recursive: true });
const save = () => {
  if (sourceHash() !== frozenSourceHash)
    throw new Error(
      'Canonical source changed; discard this tactical matrix and repeat after freeze.',
    );
  if (observerHash() !== frozenObserverHash)
    throw new Error('Observer source changed; discard this tactical matrix and repeat.');
  writeFileSync(
    `${out}.checkpoint-tmp`,
    JSON.stringify(
      {
        config,
        canonicalSourceHash: frozenSourceHash,
        observerSourceHash: frozenObserverHash,
        tacticalProfiles: profiles,
        observerDefinition:
          'One-second snapshots of the same PR158 pure opportunity observer on both engines; they are planned tactical opportunities, not provider pressure events. Style/squad variants are paired by fixture, seed and fixed 25ms duration. CPU-contended runtime is diagnostic only.',
        results,
      },
      null,
      2,
    ) + '\n',
  );
  renameSync(`${out}.checkpoint-tmp`, out);
};
for (const family of selectedFamilies)
  for (const profile of selectedProfiles)
    for (const seed of config.seeds) {
      const fixtureKey = keyFor({ family, profile: profile.id, seed });
      if (completedKeys.has(fixtureKey)) continue;
      let state = engine.createTacticalMatch(
        sessions.createSingleMatchSession(world, {
          homeClubId: 'pro_9',
          awayClubId: family === 'strong_vs_weak' ? world.clubs[63]!.id : 'pro_1',
          seed,
          control: { mode: 'spectator' },
        }),
      );
      state.playerAgencyEnabled = false;
      state.teams.home.style = profile.style;
      state.teams.home.tacticalPreferences = { ...profile.preferences };
      state.teams.away.style = 'balanced';
      // Match sessions retain canonical world profile references. Family edits belong to
      // this fixture only; mutating the world would change later squads and XI selection.
      state.players = state.players.map((player) => ({
        ...player,
        profile: { ...player.profile, attributes: { ...player.profile.attributes } },
      }));
      state.players
        .filter((player) => player.team === 'home')
        .forEach((player) => mutate(player, family));
      const preferences = deriveTeamTacticalPreferences(state, 'home');
      const suitability = deriveTacticalSuitability(state, 'home');
      const counters = countersSchema.parse({
        defensiveSamples: 0,
        organisedPressSamples: 0,
        counterpressSamples: 0,
        blockSamples: 0,
        safeOutlets: 0,
        plannedEngagement: 0,
        highEngagementWithSafeOutlets: 0,
        screenSamples: 0,
        engageSamples: 0,
        pressingDepth: 0,
        distanceToTarget: 0,
        holdNearUsefulTarget: 0,
      });
      let ticks = 0;
      const tracker = new ContactTacticalTracker();
      let nextSample = 0;
      const start = performance.now();
      while (
        state.time < config.seconds &&
        !['full_time', 'abandoned'].includes(state.status ?? '')
      ) {
        if (state.status === 'half_time') state = engine.startSecondHalf(state);
        if (state.time >= nextSample) {
          nextSample = state.time + 1;
          const carrier = state.players.find((player) => player.id === state.ball.ownerId);
          if (carrier?.team === 'away') {
            const opportunity = derivePressingOpportunity(state, 'home');
            counters.defensiveSamples++;
            if (opportunity.mode === 'organised_press') counters.organisedPressSamples++;
            else if (opportunity.mode === 'counterpress') counters.counterpressSamples++;
            else counters.blockSamples++;
            counters.safeOutlets += opportunity.safeOutletCount;
            counters.plannedEngagement += opportunity.engagement;
            if (opportunity.safeOutletCount >= 2 && opportunity.engagement >= 0.4)
              counters.highEngagementWithSafeOutlets++;
            const nearest = state.players
              .filter(
                (player) =>
                  player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
              )
              .sort(
                (a, b) =>
                  distance(a.position, carrier.position) - distance(b.position, carrier.position),
              )[0];
            if (nearest) {
              const plan = defence.derivePressingPlan(state, nearest.id);
              if (plan?.intention === 'screen' || plan?.intention === 'contain')
                counters.screenSamples++;
              else if (plan) counters.engageSamples++;
              counters.pressingDepth += nearest.position.x;
              counters.distanceToTarget += distance(nearest.position, nearest.target);
              if (
                distance(nearest.position, nearest.target) <= 1.5 &&
                Math.hypot(nearest.velocity.x, nearest.velocity.y) < 1
              )
                counters.holdNearUsefulTarget++;
            }
          }
        }
        const previous = state;
        state = engine.stepTacticalMatch(state, 0.025);
        tracker.observe(previous, state);
        ticks++;
        if (state === previous)
          throw new Error('Unexpected agency/stalled lifecycle in tactical spectator matrix.');
      }
      const stats =
        state.statistics?.players.filter(
          (player) =>
            state.statistics?.playerTeams?.[player.playerId] === 'home' ||
            state.players.some((active) => active.id === player.playerId && active.team === 'home'),
        ) ?? [];
      const total = (key: keyof (typeof stats)[number]) =>
        stats.reduce((sum, player) => sum + Number(player[key] ?? 0), 0);
      const centralIds = new Set(
        state.players
          .filter(
            (player) => player.team === 'home' && player.slot.position === 'central_midfielder',
          )
          .map((player) => player.id),
      );
      results.push(
        rowSchema.parse({
          profile: profile.id,
          family,
          seed,
          canonicalSeconds: state.time,
          ticks,
          elapsedMs: performance.now() - start,
          canonicalStateHash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
          preferences,
          suitability,
          contactTransitionsAndWorkload: tracker.snapshot(state),
          diagnostics: counters,
          football: {
            touches: total('touches'),
            passes: total('passesAttempted'),
            completed: total('passesCompleted'),
            carries: total('carries'),
            attempts: total('tacklesAttempted'),
            wins: total('tacklesWon'),
            shots: total('shots'),
            goals: total('goals'),
            distanceMetres: total('distanceCovered'),
            sprintMetres: total('sprintDistance'),
            centralPasses:
              state.statistics?.passingNetwork.reduce(
                (sum, edge) =>
                  sum +
                  (centralIds.has(edge.passerId) || centralIds.has(edge.receiverId)
                    ? edge.completed
                    : 0),
                0,
              ) ?? 0,
          },
        }),
      );
      completedKeys.add(fixtureKey);
      save();
      process.stdout.write(
        `${config.revision} ${family}/${profile.id}/${seed}: ${state.time.toFixed(3)}s; ${counters.defensiveSamples} defensive snapshots\n`,
      );
    }
if (completedKeys.size !== expectedKeys.size)
  throw new Error('Tactical matrix has incomplete fixture coverage.');
save();
