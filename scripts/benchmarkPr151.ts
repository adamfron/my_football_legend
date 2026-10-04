import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cpus } from 'node:os';
import { z } from 'zod';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import type { MatchMomentEpisode } from '../src/core/matchSimulation/matchPresentation';
import type { ConsequenceWindow } from '../src/core/matchSimulation/presentationWindows';

// Reuse the shipped decision, moment and consequence-window laws. No renderer, React, RAF,
// simulated thinking time or historical lead-in playback is included in headless work timing.
// A sequence is one transition from hidden football to visible football, including human lead-ins.
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const configSchema = z.object({
  minutes: z.coerce.number().positive().max(90).default(45),
  seeds: z.array(z.string().min(1)).nonempty(),
  scenarios: z.array(z.enum(['balanced-balanced', 'weak-strong', 'strong-weak'])).nonempty(),
  position: z
    .enum(['central_midfielder', 'right_winger', 'left_back', 'striker'])
    .default('central_midfielder'),
  policy: z.enum(['key_player', 'player_extended', 'full_match']).default('key_player'),
  repeats: z.coerce.number().int().min(1).max(3).default(1),
  revision: z.string(),
});
const config = configSchema.parse({
  minutes: args.get('minutes'),
  seeds: (args.get('seeds') ?? 'a,b,c').split(','),
  scenarios: (args.get('scenarios') ?? 'balanced-balanced').split(','),
  position: args.get('position'),
  policy: args.get('policy'),
  repeats: args.get('repeats'),
  revision: args.get('revision') ?? 'working-tree',
});
const engineRoot = resolve(args.get('engine-root') ?? process.cwd());
const importEngine = <T>(path: string): Promise<T> =>
  import(pathToFileURL(resolve(engineRoot, path)).href);
const [worldModule, fixtures, singleMatch, engine, decision, moments, presentation, windows] =
  await Promise.all([
    importEngine<typeof import('./createCanonicalWorldDatabase')>(
      'scripts/createCanonicalWorldDatabase.ts',
    ),
    importEngine<typeof import('./matchCalibrationBenchmark')>(
      'scripts/matchCalibrationBenchmark.ts',
    ),
    importEngine<typeof import('../src/core/singleMatch')>('src/core/singleMatch.ts'),
    importEngine<typeof import('../src/core/matchSimulation/matchSimulation')>(
      'src/core/matchSimulation/matchSimulation.ts',
    ),
    importEngine<typeof import('../src/core/matchSimulation/playerDecision')>(
      'src/core/matchSimulation/playerDecision.ts',
    ),
    importEngine<typeof import('../src/core/matchSimulation/matchMoment')>(
      'src/core/matchSimulation/matchMoment.ts',
    ),
    importEngine<typeof import('../src/core/matchSimulation/matchPresentation')>(
      'src/core/matchSimulation/matchPresentation.ts',
    ),
    importEngine<typeof import('../src/core/matchSimulation/presentationWindows')>(
      'src/core/matchSimulation/presentationWindows.ts',
    ),
  ]);
const world = worldModule.createCanonicalWorldDatabase();
const fingerprint = (value: unknown): string => {
  const stable = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(stable);
    if (input && typeof input === 'object')
      return Object.fromEntries(
        Object.entries(input)
          .filter(([, entry]) => entry !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, stable(entry)]),
      );
    return input;
  };
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
};
const scalarSchema = z.object({
  samples: z.number().int().nonnegative(),
  mean: z.number().nullable(),
});
const tacticalObservationSchema = z.object({
  samples: z.number().int().nonnegative(),
  maximumLineDepthMetres: z.number().nonnegative(),
  meanCaution: scalarSchema,
  responseReasons: z.record(z.string(), z.number().int().nonnegative()),
  maximumBuildUpLossEvidence: z.number().nonnegative(),
});
const resultSchema = z.object({
  seed: z.string(),
  scenario: z.string(),
  repeat: z.number().int(),
  canonicalSeconds: z.number().nonnegative(),
  status: z.string(),
  score: z.object({ home: z.number().int(), away: z.number().int() }),
  presentation: z.object({
    surfacedSequences: z.number().int().nonnegative(),
    nonInteractiveEpisodes: z.number().int().nonnegative(),
    humanLeadIns: z.number().int().nonnegative(),
    prompts: z.number().int().nonnegative(),
    promptsPerSequence: z.number().nullable(),
    hiddenCanonicalSeconds: z.number().nonnegative(),
    visibleCanonicalSeconds: z.number().nonnegative(),
  }),
  controlled: z.object({
    playerId: z.string().nullable(),
    position: z.string(),
    slotPosition: z.string(),
    touches: z.number().int().nonnegative(),
    carries: z.number().int().nonnegative(),
    passes: z.number().int().nonnegative(),
    shots: z.number().int().nonnegative(),
    distanceMetres: z.number().nonnegative(),
    sprintDistanceMetres: z.number().nonnegative(),
  }),
  football: z.object({
    passes: z.number().int().nonnegative(),
    shots: z.number().int().nonnegative(),
    touches: z.number().int().nonnegative(),
  }),
  structure: z.record(
    z.string(),
    z.object({
      defensiveLineOwnDepthMetres: scalarSchema,
      buildUpLineOwnDepthMetres: scalarSchema,
      outfieldWidthMetres: scalarSchema,
      outfieldLengthMetres: scalarSchema,
    }),
  ),
  tacticalMemory: z.unknown().nullable(),
  tacticalObservation: z.record(z.string(), tacticalObservationSchema).nullable(),
  hashes: z.object({
    canonicalState: z.string().length(64),
    statistics: z.string().length(64),
    tacticalTimeline: z.string().length(64),
  }),
  performance: z.object({
    elapsedMs: z.number().nonnegative(),
    hiddenWorkMs: z.number().nonnegative(),
    hiddenSpeed: z.number().nullable(),
    canonicalSpeed: z.number().nonnegative(),
    ticks: z.number().int().nonnegative(),
    rendererCallsBackground: z.literal(0),
  }),
});
type Scalar = z.infer<typeof scalarSchema>;
const scalar = (): Scalar => ({ samples: 0, mean: null });
const record = (target: Scalar, value: number) => {
  target.samples++;
  target.mean = (target.mean ?? 0) + (value - (target.mean ?? 0)) / target.samples;
};
const getMemory = (state: TacticalMatchState): unknown | null =>
  state.teams.home.threatMemory || state.teams.away.threatMemory
    ? { home: state.teams.home.threatMemory ?? null, away: state.teams.away.threatMemory ?? null }
    : null;
const results: z.infer<typeof resultSchema>[] = [];
for (const scenario of config.scenarios)
  for (const seed of config.seeds)
    for (let repeat = 1; repeat <= config.repeats; repeat++) {
      const session = (() => {
        if (scenario !== 'strong-weak' && config.position !== 'right_winger')
          return fixtures.createCalibrationSession(world, scenario, seed, config.position);
        const [homeIndex, awayIndex] =
          scenario === 'weak-strong' ? [63, 0] : scenario === 'strong-weak' ? [0, 63] : [0, 1];
        const spectator = singleMatch.createSingleMatchSession(world, {
          homeClubId: world.clubs[homeIndex]!.id,
          awayClubId: world.clubs[awayIndex]!.id,
          seed:
            scenario === 'strong-weak' ? `pr151:strong-weak:${seed}` : `pr148:${scenario}:${seed}`,
          control: { mode: 'spectator' },
        });
        const selected = spectator.home.players.find(
          (entry) => entry.profile.primaryPosition === config.position,
        );
        const playerId =
          selected?.footballerId ??
          (spectator.home.club.squadPlayerIds ?? []).find(
            (id) => world.footballers[id]?.profile.primaryPosition === config.position,
          );
        if (!playerId) throw new Error(`Fixture does not provide ${config.position}`);
        return singleMatch.createSingleMatchSession(world, {
          ...spectator.setup,
          control: {
            mode: 'player',
            clubId: spectator.home.club.id,
            footballerId: playerId,
            forceIntoXI: !selected,
          },
        });
      })();
      let state = engine.createTacticalMatch(session);
      const policy = moments.MATCH_PRESENTATION_POLICIES[config.policy];
      let visible = policy.fullMatch;
      let episode: MatchMomentEpisode | undefined;
      let consequence: ConsequenceWindow | undefined;
      let sequences = 0;
      let nonInteractive = 0;
      let humanLeadIns = 0;
      let prompts = 0;
      let hiddenSeconds = 0;
      let visibleSeconds = 0;
      let ticks = 0;
      let hiddenWorkMs = 0;
      let hiddenBatchStarted = performance.now();
      let lastSampleAt = -2;
      const tacticalTimeline = createHash('sha256');
      const structure = Object.fromEntries(
        ['home', 'away'].map((team) => [
          team,
          {
            defensiveLineOwnDepthMetres: scalar(),
            buildUpLineOwnDepthMetres: scalar(),
            outfieldWidthMetres: scalar(),
            outfieldLengthMetres: scalar(),
          },
        ]),
      );
      const tacticalObservation = Object.fromEntries(
        ['home', 'away'].map((team) => [
          team,
          {
            samples: 0,
            maximumLineDepthMetres: 0,
            meanCaution: scalar(),
            responseReasons: {} as Record<string, number>,
            maximumBuildUpLossEvidence: 0,
          },
        ]),
      );
      const targetSeconds = config.minutes * 60;
      const complete = () =>
        state.status === 'abandoned' ||
        (state.time + 1e-7 >= targetSeconds &&
          (targetSeconds !== 2700 || state.status === 'half_time') &&
          (targetSeconds !== 5400 || state.status === 'full_time'));
      const setVisible = (next: boolean) => {
        if (next === visible) return;
        if (!visible) hiddenWorkMs += performance.now() - hiddenBatchStarted;
        visible = next;
        if (!visible) hiddenBatchStarted = performance.now();
      };
      process.stderr.write(
        `${config.revision} ${scenario}:${seed} ${config.position} ${config.minutes}min repeat ${repeat}\n`,
      );
      const started = performance.now();
      hiddenBatchStarted = started;
      while (!complete()) {
        if (state.status === 'half_time') {
          state = engine.startSecondHalf(state);
          consequence = undefined;
          episode = undefined;
          setVisible(policy.fullMatch);
        }
        if (state.status === 'full_time') throw new Error('Match ended before benchmark target');
        const agency = decision.projectPlayerAgency(state);
        if (agency.opportunity) {
          prompts++;
          if (!visible) {
            sequences++;
            humanLeadIns++;
            setVisible(true);
          }
          consequence = windows.createConsequenceWindow(state, agency.opportunity.actorId);
          const resolved = decision.resolveDevPlayerDecision(state, agency.opportunity).state;
          if (resolved === state)
            throw new Error(`DEV choice did not commit ${agency.opportunity.id}`);
          state = resolved;
          // Match Lab re-probes the changed state at the same boundary. Only an exact negative
          // answer for that state permits the optimized canonical step on the next loop.
          continue;
        } else {
          if (consequence) {
            const result = windows.observeConsequenceWindow(consequence, state);
            consequence = result.window;
            if (result.endReason) {
              consequence = undefined;
              setVisible(policy.fullMatch);
            }
          }
          if (!policy.fullMatch && !consequence) {
            const candidate = moments.projectMatchMoment(state, null);
            if (
              !visible &&
              candidate.kind !== 'routine' &&
              moments.shouldSurfaceMatchMoment(candidate, policy)
            ) {
              episode = presentation.appendMomentCandidate(undefined, candidate);
              sequences++;
              nonInteractive++;
              setVisible(true);
            } else if (visible && episode) {
              const bounded =
                state.time - episode.startedAt >=
                windows.PRESENTATION_WINDOW_RULES.maximumEpisodeSeconds;
              if (
                !presentation.isInteractiveOutcomeWindowOpen(state) &&
                (bounded || presentation.isMomentEpisodeResolved(episode, candidate, state.time))
              ) {
                episode = undefined;
                setVisible(false);
              } else if (
                candidate.kind !== 'routine' &&
                candidate.kind !== episode.candidates.at(-1)?.kind
              ) {
                episode = presentation.appendMomentCandidate(episode, candidate);
              } else if (candidate.kind !== 'routine')
                episode = { ...episode, lastMeaningfulAt: state.time };
            }
          }
        }
        if (complete()) break;
        const previousTime = state.time;
        state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
        const seconds = state.time - previousTime;
        if (visible) visibleSeconds += seconds;
        else hiddenSeconds += seconds;
        ticks++;
        if (state.time - lastSampleAt >= 2 - 1e-7) {
          lastSampleAt = state.time;
          tacticalTimeline.update(JSON.stringify(getMemory(state)) + '\n');
          for (const team of ['home', 'away'] as const) {
            const memory = state.teams[team].threatMemory;
            if (memory) {
              const summary = tacticalObservation[team]!;
              summary.samples++;
              summary.maximumLineDepthMetres = Math.max(
                summary.maximumLineDepthMetres,
                memory.response.lineDepthMetres,
              );
              summary.maximumBuildUpLossEvidence = Math.max(
                summary.maximumBuildUpLossEvidence,
                ...memory.buildUpLosses,
              );
              record(summary.meanCaution, memory.response.caution);
              const reason = memory.response.reason;
              summary.responseReasons[reason] = (summary.responseReasons[reason] ?? 0) + 1;
            }
            const teamPlayers = state.players.filter(
              (player) => player.team === team && player.profile.primaryPosition !== 'goalkeeper',
            );
            const defenders = teamPlayers.filter((player) =>
              [
                'center_back',
                'left_back',
                'right_back',
                'left_wing_back',
                'right_wing_back',
              ].includes(player.profile.primaryPosition),
            );
            if (teamPlayers.length && state.scenario === 'open_play') {
              const xs = teamPlayers.map((player) => player.position.x);
              const ys = teamPlayers.map((player) => player.position.y);
              record(structure[team]!.outfieldWidthMetres, Math.max(...ys) - Math.min(...ys));
              record(structure[team]!.outfieldLengthMetres, Math.max(...xs) - Math.min(...xs));
              if (defenders.length) {
                const depth =
                  defenders.reduce(
                    (sum, player) =>
                      sum + (team === 'home' ? player.position.x : 105 - player.position.x),
                    0,
                  ) / defenders.length;
                record(structure[team]!.defensiveLineOwnDepthMetres, depth);
                if (state.possessionTeam === team)
                  record(structure[team]!.buildUpLineOwnDepthMetres, depth);
              }
            }
          }
        }
        if (ticks > Math.ceil(targetSeconds / engine.FIXED_MATCH_DT) + 10000)
          throw new Error('Canonical clock stopped advancing');
      }
      if (!visible) hiddenWorkMs += performance.now() - hiddenBatchStarted;
      const elapsedMs = performance.now() - started;
      const all = state.statistics?.players ?? [];
      const controlled = all.find((entry) => entry.playerId === state.controlledFootballerId);
      const result = resultSchema.parse({
        seed: session.setup.seed,
        scenario,
        repeat,
        canonicalSeconds: state.time,
        status: state.status,
        score: state.score,
        presentation: {
          surfacedSequences: sequences,
          nonInteractiveEpisodes: nonInteractive,
          humanLeadIns,
          prompts,
          promptsPerSequence: sequences ? prompts / sequences : null,
          hiddenCanonicalSeconds: hiddenSeconds,
          visibleCanonicalSeconds: visibleSeconds,
        },
        controlled: {
          playerId: state.controlledFootballerId ?? null,
          position:
            session.home.players.find(
              (entry) => entry.footballerId === state.controlledFootballerId,
            )?.profile.primaryPosition ?? config.position,
          slotPosition:
            session.home.players.find(
              (entry) => entry.footballerId === state.controlledFootballerId,
            )?.slot.position ?? config.position,
          touches: controlled?.touches ?? 0,
          carries: controlled?.carries ?? 0,
          passes: controlled?.passesAttempted ?? 0,
          shots: controlled?.shots ?? 0,
          distanceMetres: controlled?.distanceCovered ?? 0,
          sprintDistanceMetres: controlled?.sprintDistance ?? 0,
        },
        football: {
          passes: all.reduce((sum, player) => sum + player.passesAttempted, 0),
          shots: all.reduce((sum, player) => sum + player.shots, 0),
          touches: all.reduce((sum, player) => sum + player.touches, 0),
        },
        structure,
        tacticalMemory: getMemory(state),
        tacticalObservation: getMemory(state) ? tacticalObservation : null,
        hashes: {
          canonicalState: fingerprint(state),
          statistics: fingerprint(state.statistics),
          tacticalTimeline: tacticalTimeline.digest('hex'),
        },
        performance: {
          elapsedMs,
          hiddenWorkMs,
          hiddenSpeed: hiddenWorkMs ? (hiddenSeconds * 1000) / hiddenWorkMs : null,
          canonicalSpeed: (state.time * 1000) / elapsedMs,
          ticks,
          rendererCallsBackground: 0,
        },
      });
      if (Math.abs(hiddenSeconds + visibleSeconds - state.time) > 1e-5)
        throw new Error('Presentation seconds do not reconcile');
      const earlier = results.find(
        (other) => other.seed === result.seed && other.scenario === result.scenario,
      );
      if (
        earlier &&
        fingerprint({ ...earlier, repeat: 0, performance: null }) !==
          fingerprint({ ...result, repeat: 0, performance: null })
      )
        throw new Error(`Nondeterministic repeated fixture ${result.seed}`);
      results.push(result);
      process.stderr.write(
        `  ${sequences} sequences / ${prompts} prompts; ${(elapsedMs / 1000).toFixed(2)}s; ${result.performance.canonicalSpeed.toFixed(1)}x\n`,
      );
    }
const report = {
  schemaVersion: 1,
  config,
  environment: { node: process.version, cpu: cpus()[0]?.model },
  collectionScope: {
    canonical: 'complete',
    presentation: 'headless_shipped_window_laws',
    decisions: 'actual_opportunities_with_explicit_dev_selection',
    detailedPlayerAgency: 'not_collected',
    renderer: 'absent',
    leadInPlayback: 'not_timed_or_added_to_canonical_seconds',
  },
  sequenceDefinition:
    'hidden_to_visible_transition_including_human_lead_in; prompts_during_connected_outcome_share_sequence',
  timingScope:
    'one_exact_agency_probe_per_step; headless_work_includes_window_projection_and_2s_structure_samples; no_React_renderer_or_context_capture',
  inputPolicy: 'explicit_dev_ai_selection_at_exact_tick_boundary',
  results,
};
const json = JSON.stringify(report, null, 2) + '\n';
if (args.get('output')) {
  const output = resolve(args.get('output')!);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, json);
}
process.stdout.write(json);
