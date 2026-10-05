import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SingleMatchSession } from '../src/core/singleMatch';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import * as canonicalEngine from '../src/core/matchSimulation/matchSimulation';
import * as canonicalDecisions from '../src/core/matchSimulation/playerDecision';
import * as canonicalMoments from '../src/core/matchSimulation/matchMoment';
import * as canonicalPresentation from '../src/core/matchSimulation/matchPresentation';
import * as canonicalWindows from '../src/core/matchSimulation/presentationWindows';
import * as canonicalFlow from '../src/core/matchSimulation/matchFlowTelemetry';
import * as canonicalAgency from '../src/core/matchSimulation/playerAgency';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats';
import {
  CanonicalParticipationTracker,
  canonicalMatchSanitySchema,
  projectCanonicalMatchSanity,
} from '../src/core/matchSimulation/canonicalMatchSanity';

export const pr152RunConfigSchema = z.object({
  minutes: z.number().positive().max(90).default(45),
  variant: z.enum(['surfaced', 'controlled_autonomous', 'npc']).default('surfaced'),
  observerMode: z.enum(['normal', 'dev']).default('normal'),
});
export type Pr152EngineModules = {
  engine: typeof canonicalEngine;
  decisions: typeof canonicalDecisions;
  moments: typeof canonicalMoments;
  presentation: typeof canonicalPresentation;
  windows: typeof canonicalWindows;
  flow: typeof canonicalFlow;
  agency: typeof canonicalAgency;
};
const shipped: Pr152EngineModules = {
  engine: canonicalEngine,
  decisions: canonicalDecisions,
  moments: canonicalMoments,
  presentation: canonicalPresentation,
  windows: canonicalWindows,
  flow: canonicalFlow,
  agency: canonicalAgency,
};

export const pr152Fingerprint = (value: unknown): string => {
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

export const pr152RunResultSchema = z.object({
  seed: z.string(),
  requestedMinutes: z.number().positive(),
  variant: pr152RunConfigSchema.shape.variant,
  observerMode: pr152RunConfigSchema.shape.observerMode,
  fixture: z.object({
    playerId: z.string(),
    position: z.string(),
    slotPosition: z.string(),
    homeFormation: z.string(),
    awayFormation: z.string(),
  }),
  targetReached: z.boolean(),
  completionReason: z.enum(['requested_duration', 'abandoned']),
  status: z.string(),
  score: z.object({ home: z.number().int(), away: z.number().int() }),
  canonical: canonicalMatchSanitySchema,
  presentation: z.object({
    sequences: z.number().int().nonnegative(),
    prompts: z.number().int().nonnegative(),
    nonInteractiveEpisodes: z.number().int().nonnegative(),
    humanLeadIns: z.number().int().nonnegative(),
    hiddenCanonicalSeconds: z.number().nonnegative(),
    visibleCanonicalSeconds: z.number().nonnegative(),
  }),
  positionalInvolvement: z.object({
    samples: z.number().int().nonnegative(),
    meanX: z.number().nullable(),
    meanY: z.number().nullable(),
    minimumX: z.number().nullable(),
    maximumX: z.number().nullable(),
    attackingThirdSeconds: z.number().nonnegative(),
    defendingThirdSeconds: z.number().nonnegative(),
  }),
  invariantFailures: z.array(z.string()),
  hashes: z.object({
    canonicalState: z.string().length(64),
    statistics: z.string().length(64),
    actionTimeline: z.string().length(64),
    behaviour: z.string().length(64),
  }),
  performance: z.object({
    elapsedMs: z.number().nonnegative(),
    hiddenWorkMs: z.number().nonnegative(),
    canonicalSpeed: z.number().nonnegative(),
    hiddenSpeed: z.number().nullable(),
    ticks: z.number().int().nonnegative(),
    rendererCallsBackground: z.literal(0),
    detailedObserverCalls: z.number().int().nonnegative(),
  }),
});
export type Pr152RunResult = z.infer<typeof pr152RunResultSchema>;

/** Same fixture and shipped window laws in all revisions. Observer mode only adds pure observers.
 * No React, renderer, historical lead-in playback, or synthetic thinking time enters this driver. */
export const runPr152MatchSanity = (
  session: SingleMatchSession,
  input: z.input<typeof pr152RunConfigSchema> = {},
  modules: Pr152EngineModules = shipped,
): Pr152RunResult => {
  const config = pr152RunConfigSchema.parse(input);
  const { engine, decisions, moments, presentation, windows, flow, agency } = modules;
  let state = engine.createTacticalMatch(session);
  const playerId = state.controlledFootballerId;
  if (!playerId) throw new Error('PR152 fixture requires a measured controlled player');
  const selected = [...session.home.players, ...session.away.players].find(
    (player) => player.footballerId === playerId,
  );
  if (!selected) throw new Error('Measured footballer missing from initial XI');
  if (config.variant !== 'surfaced') {
    state = { ...state, playerAgencyEnabled: false };
    if (config.variant === 'npc') delete state.controlledFootballerId;
  }
  const participation = new CanonicalParticipationTracker();
  const runtime = presentation.createPresentationRuntimeTelemetry();
  const policy = moments.MATCH_PRESENTATION_POLICIES.key_player;
  let episode: canonicalPresentation.MatchMomentEpisode | undefined;
  let consequence: canonicalWindows.ConsequenceWindow | undefined;
  let visible = false;
  let hiddenBatchStart = performance.now();
  let hiddenWorkMs = 0;
  let ticks = 0;
  let detailedObserverCalls = 0;
  let detailedFlow = config.observerMode === 'dev' ? flow.createMatchFlowTelemetry() : undefined;
  const detailedAgency =
    config.observerMode === 'dev' ? new agency.PlayerAgencyTracker() : undefined;
  const timeline = createHash('sha256');
  let lastEventId: string | undefined;
  const positional = {
    samples: 0,
    meanX: null as number | null,
    meanY: null as number | null,
    minimumX: null as number | null,
    maximumX: null as number | null,
    attackingThirdSeconds: 0,
    defendingThirdSeconds: 0,
  };
  const setVisible = (next: boolean) => {
    if (next === visible) return;
    if (!visible) hiddenWorkMs += performance.now() - hiddenBatchStart;
    visible = next;
    if (!visible) {
      hiddenBatchStart = performance.now();
      participation.beginHiddenSequence();
    }
  };
  const target = config.minutes * 60;
  const complete = () =>
    state.status === 'abandoned' ||
    (state.time + 1e-7 >= target &&
      (target !== 2700 || state.status === 'half_time') &&
      (target !== 5400 || state.status === 'full_time'));
  const invariantFailures = new Set<string>();
  const observeTransition = (before: TacticalMatchState, after: TacticalMatchState) => {
    participation.observe(before, after, !visible, playerId);
    const seconds = Math.max(0, after.time - before.time);
    if (visible) runtime.visibleCanonicalSeconds += seconds;
    else runtime.hiddenCanonicalSeconds += seconds;
    const events = after.actionEvents ?? [];
    const start = lastEventId ? events.findIndex((event) => event.id === lastEventId) + 1 : 0;
    for (const event of events.slice(start)) timeline.update(JSON.stringify(event) + '\n');
    lastEventId = events.at(-1)?.id ?? lastEventId;
    const player = after.players.find((entry) => entry.id === playerId);
    if (player && seconds > 0) {
      positional.samples++;
      positional.meanX =
        (positional.meanX ?? 0) +
        (player.position.x - (positional.meanX ?? 0)) / positional.samples;
      positional.meanY =
        (positional.meanY ?? 0) +
        (player.position.y - (positional.meanY ?? 0)) / positional.samples;
      positional.minimumX = Math.min(positional.minimumX ?? player.position.x, player.position.x);
      positional.maximumX = Math.max(positional.maximumX ?? player.position.x, player.position.x);
      const ownDepth = player.team === 'home' ? player.position.x : 105 - player.position.x;
      if (ownDepth > 70) positional.attackingThirdSeconds += seconds;
      if (ownDepth < 35) positional.defendingThirdSeconds += seconds;
    }
    for (const player of after.statistics?.players ?? []) {
      if (player.tacklesWon > player.tacklesAttempted)
        invariantFailures.add(`tacklesWon>attempted:${player.playerId}`);
      if (player.shotsOnTarget > player.shots)
        invariantFailures.add(`shotsOnTarget>shots:${player.playerId}`);
      if (player.passesCompleted > player.passesAttempted)
        invariantFailures.add(`passesCompleted>attempted:${player.playerId}`);
    }
    if (detailedFlow) {
      detailedFlow = flow.observeMatchFlow(detailedFlow, before, after);
      detailedObserverCalls++;
    }
  };
  const started = performance.now();
  hiddenBatchStart = started;
  while (!complete()) {
    if (state.status === 'half_time') {
      state = engine.startSecondHalf(state);
      consequence = undefined;
      episode = undefined;
      setVisible(false);
    }
    if (state.status === 'full_time') throw new Error('Match ended before requested duration');
    const projection =
      config.variant === 'surfaced' ? decisions.projectPlayerAgency(state) : undefined;
    if (detailedAgency && projection) {
      detailedAgency.observe(state, projection);
      detailedObserverCalls++;
    }
    if (projection?.opportunity) {
      runtime.humanDecisionPromptsShown++;
      if (!visible) {
        runtime.episodesPresented++;
        runtime.episodeLeadIns++;
        setVisible(true);
      }
      participation.markVisiblePlayerInvolvement();
      consequence = windows.createConsequenceWindow(state, projection.opportunity.actorId);
      const before = state;
      state = decisions.resolveDevPlayerDecision(state, projection.opportunity).state;
      if (state === before) throw new Error(`DEV selection failed ${projection.opportunity.id}`);
      observeTransition(before, state);
      continue;
    }
    if (config.variant === 'surfaced') {
      if (consequence) {
        const result = windows.observeConsequenceWindow(consequence, state);
        consequence = result.window;
        if (result.endReason) {
          consequence = undefined;
          setVisible(false);
        }
      }
      if (!consequence) {
        const candidate = moments.projectMatchMoment(state, null);
        if (
          !visible &&
          candidate.kind !== 'routine' &&
          moments.shouldSurfaceMatchMoment(candidate, policy)
        ) {
          episode = presentation.appendMomentCandidate(undefined, candidate);
          runtime.episodesPresented++;
          runtime.qualifyingCandidates++;
          setVisible(true);
          if (candidate.controlledPlayerInvolved) participation.markVisiblePlayerInvolvement();
        } else if (visible && episode) {
          if (candidate.controlledPlayerInvolved) participation.markVisiblePlayerInvolvement();
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
          )
            episode = presentation.appendMomentCandidate(episode, candidate);
          else if (candidate.kind !== 'routine')
            episode = { ...episode, lastMeaningfulAt: state.time };
        }
      }
    }
    if (complete()) break;
    const before = state;
    state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
    observeTransition(before, state);
    ticks++;
    if (ticks > Math.ceil(target / engine.FIXED_MATCH_DT) + 10000)
      throw new Error('Canonical clock stopped');
  }
  if (!visible) hiddenWorkMs += performance.now() - hiddenBatchStart;
  const elapsedMs = performance.now() - started;
  if (state.statistics) {
    try {
      assertMatchStatisticsInvariants(state.statistics);
    } catch (error) {
      invariantFailures.add(error instanceof Error ? error.message : String(error));
    }
  }
  const canonical = projectCanonicalMatchSanity(state, runtime, participation.snapshot(), playerId);
  if (!canonical) throw new Error('Canonical statistics unavailable');
  const finalStatistics = state.statistics;
  // Compare football behavior while preserving full raw-state hashes separately. Autonomous
  // action source labels and control/agency identity are intentionally absent from this projection.
  const behaviour = {
    time: state.time,
    score: state.score,
    statistics: finalStatistics,
    players: state.players.map((player) => ({
      id: player.id,
      position: player.position,
      velocity: player.velocity,
    })),
    positional,
  };
  const result = pr152RunResultSchema.parse({
    seed: session.setup.seed,
    requestedMinutes: config.minutes,
    variant: config.variant,
    fixture: {
      playerId,
      position: selected.profile.primaryPosition,
      slotPosition: selected.slot.position,
      homeFormation: session.home.formation,
      awayFormation: session.away.formation,
    },
    targetReached: state.time + 1e-7 >= target,
    completionReason: state.status === 'abandoned' ? 'abandoned' : 'requested_duration',
    observerMode: config.observerMode,
    status: state.status,
    score: state.score,
    canonical,
    presentation: {
      sequences: runtime.episodesPresented,
      prompts: runtime.humanDecisionPromptsShown,
      nonInteractiveEpisodes: runtime.qualifyingCandidates,
      humanLeadIns: runtime.episodeLeadIns,
      hiddenCanonicalSeconds: runtime.hiddenCanonicalSeconds,
      visibleCanonicalSeconds: runtime.visibleCanonicalSeconds,
    },
    positionalInvolvement: positional,
    invariantFailures: [...invariantFailures].sort(),
    hashes: {
      canonicalState: pr152Fingerprint(state),
      statistics: pr152Fingerprint(finalStatistics),
      actionTimeline: timeline.digest('hex'),
      behaviour: pr152Fingerprint(behaviour),
    },
    performance: {
      elapsedMs,
      hiddenWorkMs,
      canonicalSpeed: (state.time * 1000) / elapsedMs,
      hiddenSpeed: hiddenWorkMs ? (runtime.hiddenCanonicalSeconds * 1000) / hiddenWorkMs : null,
      ticks,
      rendererCallsBackground: 0,
      detailedObserverCalls,
    },
  });
  if (
    Math.abs(
      result.presentation.hiddenCanonicalSeconds +
        result.presentation.visibleCanonicalSeconds -
        state.time,
    ) > 1e-5
  )
    throw new Error('Presentation coverage does not partition canonical time');
  if (
    canonical.controlled &&
    canonical.controlled.possessionEpisodes !==
      participation.snapshot().hidden.possessionEpisodes +
        participation.snapshot().visiblePossessionEpisodes
  )
    throw new Error('Possession coverage does not partition canonical player episodes');
  if (state.status !== 'abandoned' && !result.targetReached)
    throw new Error('Driver stopped without reaching requested duration');
  return result;
};

export const pr152DistributionSchema = z.object({
  samples: z.number().int().positive(),
  minimum: z.number(),
  median: z.number(),
  maximum: z.number(),
  mean: z.number(),
});
export const pr152Distribution = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) throw new Error('Cannot summarize an empty distribution');
  const middle = Math.floor(sorted.length / 2);
  return pr152DistributionSchema.parse({
    samples: sorted.length,
    minimum: sorted[0],
    maximum: sorted.at(-1),
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
  });
};
