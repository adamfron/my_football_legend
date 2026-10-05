import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  pr152Distribution,
  pr152DistributionSchema,
  pr152Fingerprint,
  pr152RunConfigSchema,
  pr152RunResultSchema,
  runPr152MatchSanity,
  type Pr152EngineModules,
  type Pr152RunResult,
} from './pr152MatchSanityBenchmark';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const configSchema = z.object({
  minutes: z.array(z.coerce.number().positive().max(90)).nonempty(),
  seeds: z.array(z.string().min(1)).nonempty(),
  scenarios: z
    .array(z.enum(['balanced-balanced', 'weak-strong', 'aggressive-defenders']))
    .nonempty(),
  position: z.enum(['central_midfielder', 'left_back', 'striker']).default('central_midfielder'),
  variants: z.array(pr152RunConfigSchema.shape.variant).nonempty(),
  observerModes: z.array(pr152RunConfigSchema.shape.observerMode).nonempty(),
  repeats: z.coerce.number().int().min(1).max(3).default(1),
  revision: z.string(),
  allowInvariantFailures: z.boolean().default(false),
});
const config = configSchema.parse({
  minutes: (args.get('minutes') ?? '45,90').split(','),
  seeds: (args.get('seeds') ?? 'a,b,c').split(','),
  scenarios: (args.get('scenarios') ?? 'balanced-balanced').split(','),
  position: args.get('position'),
  variants: (args.get('variants') ?? 'surfaced').split(','),
  observerModes: (args.get('observer-modes') ?? 'normal').split(','),
  repeats: args.get('repeats'),
  revision: args.get('revision') ?? 'working-tree',
  allowInvariantFailures: args.has('allow-invariant-failures'),
});
const engineRoot = resolve(args.get('engine-root') ?? process.cwd());
const importEngine = <T>(path: string): Promise<T> =>
  import(pathToFileURL(resolve(engineRoot, path)).href);
const [worldModule, fixtures, engine, decisions, moments, presentation, windows, flow, agency] =
  await Promise.all([
    importEngine<typeof import('./createCanonicalWorldDatabase')>(
      'scripts/createCanonicalWorldDatabase.ts',
    ),
    importEngine<typeof import('./matchCalibrationBenchmark')>(
      'scripts/matchCalibrationBenchmark.ts',
    ),
    importEngine<Pr152EngineModules['engine']>('src/core/matchSimulation/matchSimulation.ts'),
    importEngine<Pr152EngineModules['decisions']>('src/core/matchSimulation/playerDecision.ts'),
    importEngine<Pr152EngineModules['moments']>('src/core/matchSimulation/matchMoment.ts'),
    importEngine<Pr152EngineModules['presentation']>(
      'src/core/matchSimulation/matchPresentation.ts',
    ),
    importEngine<Pr152EngineModules['windows']>('src/core/matchSimulation/presentationWindows.ts'),
    importEngine<Pr152EngineModules['flow']>('src/core/matchSimulation/matchFlowTelemetry.ts'),
    importEngine<Pr152EngineModules['agency']>('src/core/matchSimulation/playerAgency.ts'),
  ]);
const modules: Pr152EngineModules = {
  engine,
  decisions,
  moments,
  presentation,
  windows,
  flow,
  agency,
};
const world = worldModule.createCanonicalWorldDatabase();
const results: (Pr152RunResult & { scenario: string; repeat: number })[] = [];
for (const scenario of config.scenarios)
  for (const seed of config.seeds)
    for (const minutes of config.minutes)
      for (const variant of config.variants)
        for (const observerMode of config.observerModes)
          for (let repeat = 1; repeat <= config.repeats; repeat++) {
            const session = fixtures.createCalibrationSession(
              world,
              scenario,
              seed,
              config.position,
            );
            process.stderr.write(
              `${config.revision} ${scenario}:${seed} ${minutes}min ${variant} ${observerMode} repeat ${repeat}\n`,
            );
            const result = runPr152MatchSanity(
              session,
              { minutes, variant, observerMode },
              modules,
            );
            if (result.fixture.position !== config.position)
              throw new Error(
                `Fixture silently changed requested position ${config.position} to ${result.fixture.position}`,
              );
            if (!config.allowInvariantFailures && result.invariantFailures.length)
              throw new Error(
                `Statistical invariant violation: ${result.invariantFailures.join(', ')}`,
              );
            const previous = results.find(
              (entry) =>
                entry.scenario === scenario &&
                entry.seed === result.seed &&
                entry.requestedMinutes === minutes &&
                entry.variant === variant &&
                entry.observerMode === observerMode,
            );
            if (
              previous &&
              pr152Fingerprint({ ...previous, repeat: 0, performance: null }) !==
                pr152Fingerprint({ ...result, scenario, repeat: 0, performance: null })
            )
              throw new Error(`Non-deterministic repeated fixture ${result.seed}`);
            const parity = results.find(
              (entry) =>
                entry.scenario === scenario &&
                entry.seed === result.seed &&
                entry.requestedMinutes === minutes &&
                entry.variant === variant &&
                entry.observerMode !== observerMode,
            );
            if (parity && pr152Fingerprint(parity.hashes) !== pr152Fingerprint(result.hashes))
              throw new Error(`Observer mode changed canonical simulation ${result.seed}`);
            const equivalent =
              variant === 'surfaced'
                ? undefined
                : results.find(
                    (entry) =>
                      entry.scenario === scenario &&
                      entry.seed === result.seed &&
                      entry.requestedMinutes === minutes &&
                      entry.variant !== variant &&
                      entry.variant !== 'surfaced' &&
                      entry.observerMode === observerMode,
                  );
            if (equivalent && equivalent.hashes.behaviour !== result.hashes.behaviour)
              throw new Error(
                `Controlled vs NPC changed canonical football behavior ${result.seed}`,
              );
            results.push({ ...result, scenario, repeat });
            process.stderr.write(
              `  ${result.canonical.controlled?.possessionEpisodes} touches / ${result.presentation.prompts} prompts; ${(result.performance.elapsedMs / 1000).toFixed(2)}s; ${result.performance.canonicalSpeed.toFixed(1)}x\n`,
            );
          }

const distributions: Record<string, Record<string, z.infer<typeof pr152DistributionSchema>>> = {};
for (const scenario of config.scenarios)
  for (const minutes of config.minutes)
    for (const variant of config.variants)
      for (const mode of config.observerModes) {
        const group = results.filter(
          (result) =>
            result.requestedMinutes === minutes &&
            result.variant === variant &&
            result.observerMode === mode &&
            result.scenario === scenario &&
            result.repeat === 1,
        );
        if (!group.length) continue;
        const metrics = (result: Pr152RunResult): Record<string, number> => {
          const { home, away } = result.canonical.teams;
          const player = result.canonical.controlled;
          const scale = 5400 / result.canonical.canonicalSeconds;
          return {
            playerPossessionEpisodes: player?.possessionEpisodes ?? 0,
            playerPossessionEpisodesPer90: (player?.possessionEpisodes ?? 0) * scale,
            playerMinutes: player?.minutes ?? 0,
            playerPassesReceived: player?.passesReceived ?? 0,
            playerPassesAttempted: player?.passesAttempted ?? 0,
            playerCarries: player?.carries ?? 0,
            playerShots: player?.shots ?? 0,
            playerTacklesAttempted: player?.defense.attempts ?? 0,
            playerTacklesWon: player?.defense.tacklesWon ?? 0,
            playerInterceptions: player?.defense.interceptions ?? 0,
            playerDistanceMetres: player?.distanceMetres ?? 0,
            playerSprintDistanceMetres: player?.sprintDistanceMetres ?? 0,
            playerHiddenPossessionEpisodes:
              player?.presentationCoverage?.hidden.possessionEpisodes ?? 0,
            playerVisibleEpisodes:
              player?.presentationCoverage?.visibleEpisodesInvolvingPlayer ?? 0,
            prompts: result.presentation.prompts,
            promptsPer90: result.presentation.prompts * scale,
            passesPer90: (home.passesAttempted + away.passesAttempted) * scale,
            passesCompletedPer90: (home.passesCompleted + away.passesCompleted) * scale,
            possessionEpisodesPer90: (home.possessionEpisodes + away.possessionEpisodes) * scale,
            shotsPer90: (home.shots + away.shots) * scale,
            shotsOnTargetPer90: (home.shotsOnTarget + away.shotsOnTarget) * scale,
            foulsPer90: (home.fouls + away.fouls) * scale,
            yellowCardsPer90: (home.yellowCards + away.yellowCards) * scale,
            redCardsPer90: (home.redCards + away.redCards) * scale,
            cardsPer90:
              (home.yellowCards + away.yellowCards + home.redCards + away.redCards) * scale,
            penaltiesPer90: (home.restarts.penalties + away.restarts.penalties) * scale,
            tacklesAttemptedPer90: (home.tacklesAttempted + away.tacklesAttempted) * scale,
            tacklesWonPer90: (home.tacklesWon + away.tacklesWon) * scale,
            tackleSuccess:
              home.tacklesAttempted + away.tacklesAttempted
                ? (home.tacklesWon + away.tacklesWon) /
                  (home.tacklesAttempted + away.tacklesAttempted)
                : 0,
            interceptionsPer90: (home.interceptions + away.interceptions) * scale,
            possessionChangesPer90: (home.possessionChanges + away.possessionChanges) * scale,
            throwInsPer90: (home.restarts.throwIns + away.restarts.throwIns) * scale,
            cornersPer90: (home.restarts.corners + away.restarts.corners) * scale,
            goalKicksPer90: (home.restarts.goalKicks + away.restarts.goalKicks) * scale,
            freeKicksPer90: (home.restarts.freeKicks + away.restarts.freeKicks) * scale,
            offsidesPer90: (home.offsides + away.offsides) * scale,
            homePossessionShare: home.possessionShare ?? 0,
            elapsedMs: result.performance.elapsedMs,
            canonicalSpeed: result.performance.canonicalSpeed,
          };
        };
        const rows = group.map(metrics);
        distributions[`${scenario}:${config.position}:${minutes}min:${variant}:${mode}`] =
          Object.fromEntries(
            Object.keys(rows[0]!).map((key) => [
              key,
              pr152Distribution(rows.map((row) => row[key]!)),
            ]),
          );
      }
const reportSchema = z.object({
  schemaVersion: z.literal(1),
  config: configSchema,
  environment: z.object({ node: z.string(), cpu: z.string().nullable() }),
  collectionScope: z.object({
    canonical: z.string(),
    presentation: z.string(),
    renderer: z.literal('absent'),
    normalObservers: z.string(),
    legacyCounters: z.string(),
    timing: z.string(),
  }),
  distributions: z.record(z.string(), z.record(z.string(), pr152DistributionSchema)),
  results: z.array(
    pr152RunResultSchema.extend({ scenario: z.string(), repeat: z.number().int().positive() }),
  ),
});
const report = reportSchema.parse({
  schemaVersion: 1,
  config,
  environment: { node: process.version, cpu: cpus()[0]?.model ?? null },
  collectionScope: {
    canonical: 'whole_match_existing_counters_and_presentation_owned_delta_attribution',
    presentation: 'shipped_key_player_window_laws_explicit_dev_choices_for_surfaced_variant',
    renderer: 'absent',
    normalObservers: 'no_detailed_flow_or_agency_observer',
    legacyCounters:
      'missing_goal_kick_penalty_kickoff_and_possession_change_counts_derived_from_canonical_award_identity_ledgers',
    timing:
      'headless_driver_work_including_in_loop_action_timeline_hashing_invariant_checks_and_optional_dev_observers_final_hashing_validation_export_excluded_no_React_renderer_or_lead_in_playback',
  },
  distributions,
  results,
});
const json = JSON.stringify(report, null, 2) + '\n';
if (args.get('output')) {
  const output = resolve(args.get('output')!);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, json);
}
process.stdout.write(json);
