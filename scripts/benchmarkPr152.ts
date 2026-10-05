import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  pr152Distribution,
  pr152DistributionSchema,
  pr152Fingerprint,
  pr152RunResultSchema,
  createPr152BenchmarkConfig,
  pr152BenchmarkConfigSchema,
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
const config = createPr152BenchmarkConfig(process.argv.slice(2));
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
  for (const position of config.positions)
    for (const seed of config.seeds)
      for (const minutes of config.minutes)
        for (const variant of config.variants)
          for (const presentationPolicy of config.presentationPolicies)
            for (const observerMode of config.observerModes)
              for (let repeat = 1; repeat <= config.repeats; repeat++) {
                const session = fixtures.createCalibrationSession(world, scenario, seed, position);
                process.stderr.write(
                  `${config.revision} ${scenario}:${position}:${seed} ${minutes}min ${variant} ${presentationPolicy} ${observerMode} repeat ${repeat}\n`,
                );
                const result = runPr152MatchSanity(
                  session,
                  { minutes, variant, observerMode, presentationPolicy },
                  modules,
                );
                if (result.fixture.position !== position)
                  throw new Error(
                    `Fixture silently changed requested position ${position} to ${result.fixture.position}`,
                  );
                if (!config.allowInvariantFailures && result.invariantFailures.length)
                  throw new Error(
                    `Statistical invariant violation: ${result.invariantFailures.join(', ')}`,
                  );
                const previous = results.find(
                  (entry) =>
                    entry.scenario === scenario &&
                    entry.fixture.position === position &&
                    entry.seed === result.seed &&
                    entry.requestedMinutes === minutes &&
                    entry.variant === variant &&
                    entry.presentationPolicy === presentationPolicy &&
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
                    entry.fixture.position === position &&
                    entry.seed === result.seed &&
                    entry.requestedMinutes === minutes &&
                    entry.variant === variant &&
                    entry.presentationPolicy === presentationPolicy &&
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
                          entry.fixture.position === position &&
                          entry.seed === result.seed &&
                          entry.requestedMinutes === minutes &&
                          entry.variant !== variant &&
                          entry.variant !== 'surfaced' &&
                          entry.observerMode === observerMode &&
                          entry.presentationPolicy === presentationPolicy,
                      );
                if (equivalent && equivalent.hashes.behaviour !== result.hashes.behaviour)
                  throw new Error(
                    `Controlled vs NPC changed canonical football behavior ${result.seed}`,
                  );
                const policyEquivalent = results.find(
                  (entry) =>
                    entry.scenario === scenario &&
                    entry.fixture.position === position &&
                    entry.seed === result.seed &&
                    entry.requestedMinutes === minutes &&
                    entry.variant === variant &&
                    entry.observerMode === observerMode &&
                    entry.presentationPolicy !== presentationPolicy,
                );
                if (
                  policyEquivalent &&
                  pr152Fingerprint(policyEquivalent.hashes) !== pr152Fingerprint(result.hashes)
                )
                  throw new Error(
                    `Presentation policy changed canonical simulation ${result.seed}`,
                  );
                results.push({ ...result, scenario, repeat });
                process.stderr.write(
                  `  ${result.canonical.controlled?.possessionEpisodes} touches / ${result.presentation.prompts} prompts; ${(result.performance.elapsedMs / 1000).toFixed(2)}s; ${result.performance.canonicalSpeed.toFixed(1)}x\n`,
                );
              }

const distributions: Record<string, Record<string, z.infer<typeof pr152DistributionSchema>>> = {};
for (const scenario of config.scenarios)
  for (const position of config.positions)
    for (const minutes of config.minutes)
      for (const variant of config.variants)
        for (const presentationPolicy of config.presentationPolicies)
          for (const mode of config.observerModes) {
            const group = results.filter(
              (result) =>
                result.requestedMinutes === minutes &&
                result.variant === variant &&
                result.observerMode === mode &&
                result.scenario === scenario &&
                result.fixture.position === position &&
                result.presentationPolicy === presentationPolicy &&
                result.repeat === 1,
            );
            if (!group.length) continue;
            const metrics = (result: Pr152RunResult): Record<string, number | null> => {
              const { home, away } = result.canonical.teams;
              const player = result.canonical.controlled;
              const scale = 5400 / result.canonical.canonicalSeconds;
              const activeScale =
                player && player.activeTime.seconds > 0 ? 5400 / player.activeTime.seconds : null;
              return {
                playerPossessionEpisodes: player?.possessionEpisodes ?? 0,
                playerPossessionEpisodesPerActive90:
                  activeScale === null ? null : player!.possessionEpisodes * activeScale,
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
                playerVisiblePossessionEpisodes:
                  player?.presentationCoverage?.visiblePossessionEpisodes ?? null,
                playerVisibleInvolvingSequences:
                  player?.presentationCoverage?.visiblePlayerInvolvingSequences ?? null,
                playerHiddenDefensiveInvolvements:
                  player?.presentationCoverage?.hidden.defensiveInvolvements ?? null,
                playerVisibleDefensiveInvolvements:
                  player?.presentationCoverage?.visibleDefensiveInvolvements ?? null,
                playerTeamEpisodeShare: result.canonical.ratios.controlledPlayerTouchShare,
                playerTeamCompletedPassesFromShare:
                  result.canonical.ratios.controlledPlayerCompletedPassesFromShare,
                playerTeamCompletedPassesToShare:
                  result.canonical.ratios.controlledPlayerCompletedPassesToShare,
                comparableRolePlayers: player?.comparableRolePlayers.length ?? null,
                comparableRoleMeanPossessionsPerActive90: player?.comparableRolePlayers.some(
                  (peer) => peer.possessionEpisodesPerActive90 !== null,
                )
                  ? player.comparableRolePlayers.reduce(
                      (sum, peer) => sum + (peer.possessionEpisodesPerActive90 ?? 0),
                      0,
                    ) /
                    player.comparableRolePlayers.filter(
                      (peer) => peer.possessionEpisodesPerActive90 !== null,
                    ).length
                  : null,
                prompts: result.presentation.prompts,
                promptsPerActive45: result.canonical.ratios.humanPromptsPerActive45,
                promptsPerActive90: result.canonical.ratios.humanPromptsPerActive90,
                presentationPromptsPerCanonical90:
                  result.canonical.ratios.presentationPromptsPerCanonical90,
                passesPer90: (home.passesAttempted + away.passesAttempted) * scale,
                passesCompletedPer90: (home.passesCompleted + away.passesCompleted) * scale,
                possessionEpisodesPer90:
                  (home.possessionEpisodes + away.possessionEpisodes) * scale,
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
                ...Object.fromEntries(
                  Object.entries(home.turnoverCauses ?? {}).map(([cause, value]) => [
                    `turnoverCause_${cause}`,
                    value +
                      (away.turnoverCauses?.[
                        cause as keyof NonNullable<typeof away.turnoverCauses>
                      ] ?? 0),
                  ]),
                ),
                ...Object.fromEntries(
                  (result.canonical.challengeCalibration ?? []).flatMap((entry) => [
                    [`challenge_${entry.technique}_attempts`, entry.counters.attempted],
                    [`challenge_${entry.technique}_foulRatePerAttempt`, entry.foulRatePerAttempt],
                    [
                      `challenge_${entry.technique}_yellowRatePerAttempt`,
                      entry.yellowRatePerAttempt,
                    ],
                    [`challenge_${entry.technique}_redRatePerAttempt`, entry.redRatePerAttempt],
                    [
                      `challenge_${entry.technique}_cardIncidentRatePerAttempt`,
                      entry.cardIncidentRatePerAttempt,
                    ],
                    [`challenge_${entry.technique}_yellowRatePerFoul`, entry.yellowRatePerFoul],
                    [
                      `challenge_${entry.technique}_cardIncidentRatePerFoul`,
                      entry.cardIncidentRatePerFoul,
                    ],
                  ]),
                ),
                ...Object.fromEntries(
                  Object.entries(result.foulSeverity).map(([severity, count]) => [
                    `foulSeverity_${severity}`,
                    count,
                  ]),
                ),
              };
            };
            const rows = group.map(metrics);
            distributions[
              `${scenario}:${position}:${minutes}min:${variant}:${presentationPolicy}:${mode}`
            ] = Object.fromEntries(
              [...new Set(rows.flatMap((row) => Object.keys(row)))].flatMap((key) => {
                const values = rows
                  .map((row) => row[key])
                  .filter((value): value is number => typeof value === 'number');
                return values.length ? [[key, pr152Distribution(values)]] : [];
              }),
            );
          }
const reportSchema = z.object({
  schemaVersion: z.literal(2),
  config: pr152BenchmarkConfigSchema,
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
  schemaVersion: 2,
  config,
  environment: { node: process.version, cpu: cpus()[0]?.model ?? null },
  collectionScope: {
    canonical: 'whole_match_existing_counters_and_presentation_owned_delta_attribution',
    presentation: 'selected_shipped_policy_window_laws_explicit_dev_choices_for_surfaced_variant',
    renderer: 'absent',
    normalObservers:
      'normal_no_detailed_observers_capture_includes_MatchDebugRecorder_without_video',
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
