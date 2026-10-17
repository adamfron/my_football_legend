import { attacksRight } from './matchSpace';
import { isRestartSetup } from './restartPhase';
import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import { distance, distanceToSegment } from './matchSpace';
import { deriveCooperativePress } from './defensiveChallenges';
import { deriveBuildUpSupport } from './tacticalPositioning';
import { rankAvailableActionsForAI } from './matchActions';
import { signedForwardDistance } from './matchSpace';
import type { CombinationIntent } from './combinationState';

export const pressureSupportEpisodeSchema = z.object({
  actorId: z.string(),
  startedAt: z.number(),
  endedAt: z.number(),
  duration: z.number().nonnegative(),
  highPressureStationarySeconds: z.number().nonnegative(),
  maximumStationaryStall: z.number().nonnegative(),
  supportResponseLatency: z.number().nonnegative().nullable(),
  nearestSupportDistance: z.number().nonnegative(),
  pressureStartedAt: z.number().nullable(),
  secondSupportDistance: z.number().nonnegative(),
  viableOptions: z.number().int().nonnegative(),
  changedSupportPlayers: z.number().int().nonnegative(),
  continuedHoldingReason: z.string(),
  initialSupportDistances: z.array(z.number().nonnegative()),
  viableOptionsBefore: z.number().int().nonnegative(),
  responders: z.array(
    z.object({
      playerId: z.string(),
      role: z.string(),
      displacement: z.number().nonnegative(),
      laneClearance: z.number().nonnegative(),
    }),
  ),
  secondaryPresser: z.string().nullable(),
  secondaryPresserResponseLatency: z.number().nonnegative().nullable(),
  optionEvolution: z
    .array(
      z.object({
        at: z.number(),
        pressure: z.number(),
        viablePasses: z.number(),
        viableCarries: z.number(),
        escape: z.boolean(),
        pivot: z.boolean(),
        thirdMan: z.boolean(),
        width: z.boolean(),
        reset: z.boolean(),
        bestAction: z.string(),
        bestUtility: z.number(),
        reason: z.string(),
      }),
    )
    .max(64)
    .optional(),
});
export type PressureSupportEpisode = z.infer<typeof pressureSupportEpisodeSchema>;

export const combinationDiagnosticsSchema = z.object({
  counts: z.record(z.string(), z.number().int().nonnegative()),
  maximumCandidates: z.number().int().nonnegative(),
  traces: z
    .array(
      z.object({
        id: z.string(),
        kind: z.string(),
        at: z.number(),
        stage: z.string(),
        metres: z.number().optional(),
      }),
    )
    .max(128),
});

/** Opt-in observer. Physical IDs deduplicate repeated state observations. Forecast/rank totals
 * are distinct from actual contacts; no observer data is retained in career state. */
export class CombinationPlayTracker {
  private counts: Record<string, number> = {};
  private traces: z.infer<typeof combinationDiagnosticsSchema>['traces'] = [];
  private activeId = '';
  private runId = '';
  private firstCompletedId = '';
  private resultId = '';
  private probeKey = '';
  private maximumCandidates = 0;
  private previousPass:
    | { id: string; a: string; b: string; origin: { x: number; y: number } }
    | undefined;
  private lastRelease = '';
  private pendingReturn = '';
  private resolvedReturn = '';
  private add(key: string) {
    this.counts[key] = (this.counts[key] ?? 0) + 1;
  }
  private trace(c: CombinationIntent, stage: string, at: number) {
    if (this.traces.length < 128)
      this.traces.push({ id: c.id, kind: c.kind, at, stage, metres: c.runMetres });
  }
  observe(previous: TacticalMatchState, next: TacticalMatchState) {
    const pass = next.lastPassDiagnostic;
    if (pass && pass.passId !== this.lastRelease) {
      const old = this.previousPass;
      const runner = next.players.find((p) => p.id === pass.intendedReceiverId);
      if (
        old &&
        runner &&
        pass.passerId === old.b &&
        runner.id === old.a &&
        distance(old.origin, runner.position) >= 1.6 &&
        signedForwardDistance(old.origin, runner.position, runner) > 0.4
      ) {
        this.add('observed_moving_return_attempts');
        this.pendingReturn = pass.passId;
      }
      const a = previous.players.find((p) => p.id === pass.passerId);
      if (a)
        this.previousPass = {
          id: pass.passId,
          a: pass.passerId,
          b: pass.intendedReceiverId,
          origin: { ...a.position },
        };
      this.lastRelease = pass.passId;
    }
    for (const resolved of [next.lastResolvedPass, next.lastPassDiagnostic])
      if (
        resolved &&
        resolved.passId === this.pendingReturn &&
        resolved.resolvedAt !== undefined &&
        resolved.passId !== this.resolvedReturn
      ) {
        this.add(`observed_moving_return_${resolved.finalResult}`);
        this.resolvedReturn = resolved.passId;
      }
    const c =
      next.combinationIntent ??
      (next.lastCombination?.id !== this.resultId ? next.lastCombination : undefined);
    if (c) {
      if (c.id !== this.activeId) {
        this.add('intentions');
        this.add(`kind_${c.kind}`);
        this.activeId = c.id;
        this.trace(c, 'recognised', next.time);
      }
      if (c.runStartedAt !== undefined && c.id !== this.runId) {
        this.add('runs_started');
        this.runId = c.id;
        this.trace(c, 'physical_run', c.runStartedAt);
      }
      if (c.firstCompletedAt !== undefined && c.id !== this.firstCompletedId) {
        this.add('first_passes_completed');
        this.firstCompletedId = c.id;
      }
      const key = `${c.id}:${next.decisionIndex}:${next.ball.ownerId ?? 'flight'}`;
      if (
        next.ball.ownerId === c.partnerId &&
        key !== this.probeKey &&
        c.runStartedAt !== undefined
      ) {
        this.probeKey = key;
        const ranked = rankAvailableActionsForAI(next, c.partnerId);
        this.maximumCandidates = Math.max(this.maximumCandidates, ranked.length);
        const options = ranked.filter(
          (r) => r.action.type === 'pass' && r.action.receiverId === c.runnerId,
        );
        this.add('continuation_decisions_probed');
        if (options.length) this.add('continuation_options_generated');
        if (ranked[0]?.action.type === 'pass' && ranked[0].action.receiverId === c.runnerId)
          this.add('continuation_options_ranked_first');
      }
    }
    if (
      next.combinationIntent?.continuationPassId &&
      next.combinationIntent.continuationPassId !== previous.combinationIntent?.continuationPassId
    )
      this.add('continuations_physically_released');
    const result = next.lastCombination;
    if (result && result.id !== this.resultId) {
      this.resultId = result.id;
      this.add(`result_${result.result}`);
      this.trace(result, result.result, result.endedAt);
      if (result.result === 'completed') {
        this.add(`completed_${result.kind}`);
        if (signedForwardDistance(result.origin, next.ball, next.teams[result.team]) > 2)
          this.add('completed_with_controlled_progression');
      }
    }
  }
  snapshot() {
    return combinationDiagnosticsSchema.parse({
      counts: { ...this.counts },
      maximumCandidates: this.maximumCandidates,
      traces: [...this.traces],
    });
  }
}

/** Optional, read-only, bounded observer. Geometry/ranking probes run once per canonical second. */
export class PressureSupportTracker {
  constructor(private readonly probes = { deriveBuildUpSupport, rankAvailableActionsForAI }) {}
  private episodes: PressureSupportEpisode[] = [];
  private active: PressureSupportEpisode | undefined;
  private origins = new Map<string, { x: number; y: number }>();
  private changed = new Set<string>();
  private lastProbeAt = -1;
  private stationary = 0;
  observe(previous: TacticalMatchState, next: TacticalMatchState) {
    if (
      this.active &&
      (next.ball.ownerId !== this.active.actorId ||
        isRestartSetup(next) ||
        ['half_time', 'full_time'].includes(next.status ?? ''))
    ) {
      const episode = {
        ...this.active,
        endedAt: next.time,
        duration: next.time - this.active.startedAt,
      };
      this.episodes = [...this.episodes, episode].slice(-256);
      this.active = undefined;
    }
    const actor = next.players.find((p) => p.id === next.ball.ownerId);
    if (!actor || next.scenario !== 'open_play') return;
    if (!this.active) {
      this.active = {
        actorId: actor.id,
        startedAt: next.time,
        endedAt: next.time,
        duration: 0,
        highPressureStationarySeconds: 0,
        maximumStationaryStall: 0,
        supportResponseLatency: null,
        pressureStartedAt: null,
        nearestSupportDistance: 99,
        secondSupportDistance: 99,
        viableOptions: 0,
        changedSupportPlayers: 0,
        continuedHoldingReason: 'preparing',
        initialSupportDistances: next.players
          .filter((p) => p.team === actor.team && p.id !== actor.id)
          .map((p) => distance(actor.position, p.position))
          .sort((a, b) => a - b),
        viableOptionsBefore: 0,
        responders: [],
        secondaryPresser: null,
        secondaryPresserResponseLatency: null,
        optionEvolution: [],
      };
      this.origins = new Map(
        next.players
          .filter((p) => p.team === actor.team && p.id !== actor.id)
          .map((p) => [p.id, { ...p.position }]),
      );
      this.changed = new Set();
      this.stationary = 0;
      this.lastProbeAt = -1;
    }
    const elapsed = Math.max(0, next.time - previous.time);
    if (next.currentPressure >= 0.5 && this.active.pressureStartedAt === null) {
      this.active.pressureStartedAt = next.time;
      this.origins = new Map(
        next.players
          .filter((p) => p.team === actor.team && p.id !== actor.id)
          .map((p) => [p.id, { ...p.position }]),
      );
      this.changed.clear();
    }
    if (next.currentPressure >= 0.67 && Math.hypot(actor.velocity.x, actor.velocity.y) < 0.65) {
      this.active.highPressureStationarySeconds += elapsed;
      this.stationary += elapsed;
      this.active.maximumStationaryStall = Math.max(
        this.active.maximumStationaryStall,
        this.stationary,
      );
    } else this.stationary = 0;
    if (next.time - this.lastProbeAt < 1) return;
    this.lastProbeAt = next.time;
    const teammates = next.players.filter((p) => p.team === actor.team && p.id !== actor.id);
    const distances = teammates
      .map((p) => distance(actor.position, p.position))
      .sort((a, b) => a - b);
    this.active.nearestSupportDistance = distances[0] ?? 99;
    this.active.secondSupportDistance = distances[1] ?? 99;
    const assignments = this.probes.deriveBuildUpSupport(next, actor.team);
    this.active.responders = assignments.flatMap((assignment) => {
      const player = teammates.find((p) => p.id === assignment.playerId),
        origin = this.origins.get(assignment.playerId);
      return player && origin
        ? [
            {
              playerId: player.id,
              role: assignment.role ?? 'legacy_support',
              displacement: distance(origin, player.position),
              laneClearance: Math.max(
                0,
                Math.min(
                  10,
                  ...next.players
                    .filter((p) => p.team !== actor.team)
                    .map((p) => distanceToSegment(p.position, actor.position, player.position)),
                ),
              ),
            },
          ]
        : [];
    });
    const secondary = deriveCooperativePress(next, actor.team === 'home' ? 'away' : 'home');
    if (secondary) {
      this.active.secondaryPresser = secondary.secondaryId;
      if (
        this.active.secondaryPresserResponseLatency === null &&
        this.active.pressureStartedAt !== null
      )
        this.active.secondaryPresserResponseLatency = next.time - this.active.pressureStartedAt;
    }
    for (const assignment of assignments) {
      const player = teammates.find((p) => p.id === assignment.playerId);
      const origin = this.origins.get(assignment.playerId);
      if (
        player &&
        origin &&
        distance(origin, player.position) > 1.5 &&
        distance(player.position, assignment.target) < distance(origin, assignment.target) - 1
      )
        this.changed.add(player.id);
    }
    this.active.changedSupportPlayers = this.changed.size;
    if (
      this.changed.size &&
      this.active.supportResponseLatency === null &&
      this.active.pressureStartedAt !== null
    )
      this.active.supportResponseLatency = next.time - this.active.pressureStartedAt;
    const ranking = this.probes.rankAvailableActionsForAI(next, actor.id);
    this.active.viableOptions = ranking.filter(
      (r) => r.action.type === 'pass' && r.canonicalScore > 20,
    ).length;
    if (this.active.duration === 0 && next.time - this.active.startedAt < 0.05)
      this.active.viableOptionsBefore = this.active.viableOptions;
    this.active.duration = next.time - this.active.startedAt;
    this.active.continuedHoldingReason = next.ballCarrierIntent
      ? 'movement_committed'
      : next.onBallPreparation && next.time < next.onBallPreparation.readyAt
        ? 'physical_preparation'
        : ranking[0]?.action.type === 'hold'
          ? 'retention_best_value'
          : this.active.viableOptions === 0
            ? 'no_viable_outlet'
            : 'scanning_or_release_cooldown';
    const viablePasses = ranking.filter((r) => r.action.type === 'pass' && r.canonicalScore > 20);
    const offered = (role: string) =>
      assignments.some(
        (a) =>
          a.role === role &&
          viablePasses.some((r) => r.action.type === 'pass' && r.action.receiverId === a.playerId),
      );
    this.active.optionEvolution = [
      ...(this.active.optionEvolution ?? []),
      {
        at: next.time,
        pressure: next.currentPressure,
        viablePasses: viablePasses.length,
        viableCarries: ranking.filter((r) => r.action.type === 'carry' && r.canonicalScore > 20)
          .length,
        escape: offered('escape'),
        pivot: offered('pivot'),
        thirdMan: offered('third_man'),
        width: offered('width_run'),
        reset: viablePasses.some(
          (r) =>
            r.action.type === 'pass' &&
            (attacksRight(actor) ? 1 : -1) * (r.action.target.x - actor.position.x) < -3,
        ),
        bestAction: ranking[0]?.action.type ?? 'none',
        bestUtility: ranking[0]?.canonicalScore ?? 0,
        reason: this.active.continuedHoldingReason,
      },
    ].slice(-64);
  }
  snapshot() {
    return this.episodes.map((e) => ({ ...e }));
  }
}

const line = (role: string) =>
  role === 'goalkeeper'
    ? 'keeper'
    : role.includes('back')
      ? 'defence'
      : role.includes('midfielder')
        ? 'midfield'
        : 'attack';
export const formationConnectivitySchema = z.object({
  side: z.enum(['home', 'away']),
  formation: z.string(),
  players: z.array(
    z.object({
      playerId: z.string(),
      role: z.string(),
      line: z.string(),
      touchShare: z.number(),
      receivedShare: z.number(),
    }),
  ),
  lineInvolvement: z.record(z.string(), z.number()),
  receivedShareByLine: z.record(z.string(), z.number()),
  fullbackCirculationShare: z.number(),
  topEdgeShare: z.number(),
  warnings: z.array(z.string()),
});
export const projectFormationConnectivity = (state: TacticalMatchState) =>
  (['home', 'away'] as const).map((side) => {
    const players =
      state.statistics?.players.filter(
        (p) => state.statistics?.playerTeams?.[p.playerId] === side,
      ) ?? [];
    const touches = players.reduce((s, p) => s + p.touches, 0),
      received = players.reduce((s, p) => s + p.passesReceived, 0);
    const roles = players.map((p) => {
      const role = state.players.find((a) => a.id === p.playerId)?.slot.position ?? 'removed';
      return {
        playerId: p.playerId,
        role,
        line: line(role),
        touchShare: p.touches / Math.max(1, touches),
        receivedShare: p.passesReceived / Math.max(1, received),
      };
    });
    const edges =
      state.statistics?.passingNetwork.filter((e) =>
        players.some((p) => p.playerId === e.passerId),
      ) ?? [];
    const attempts = edges.reduce((s, e) => s + e.attempted, 0);
    const topEdgeShare = Math.max(0, ...edges.map((e) => e.attempted)) / Math.max(1, attempts);
    const warnings =
      state.time >= 15 * 60
        ? roles
            .filter((p) => ['defence', 'midfield'].includes(p.line) && p.touchShare < 0.02)
            .map((p) => `starved_central_or_defensive_role:${p.playerId}`)
        : [];
    if (attempts > 30 && topEdgeShare > 0.15) warnings.push('concentrated_passing_edge');
    return formationConnectivitySchema.parse({
      side,
      formation: state.teams[side].formation,
      players: roles,
      lineInvolvement: Object.fromEntries(
        ['keeper', 'defence', 'midfield', 'attack'].map((key) => [
          key,
          roles.filter((p) => p.line === key).reduce((s, p) => s + p.touchShare, 0),
        ]),
      ),
      topEdgeShare,
      receivedShareByLine: Object.fromEntries(
        ['keeper', 'defence', 'midfield', 'attack'].map((key) => [
          key,
          roles.filter((p) => p.line === key).reduce((s, p) => s + p.receivedShare, 0),
        ]),
      ),
      fullbackCirculationShare:
        edges
          .filter((e) =>
            roles.some(
              (p) =>
                p.playerId === e.receiverId &&
                ['left_back', 'right_back', 'left_wing_back', 'right_wing_back'].includes(p.role),
            ),
          )
          .reduce((s, e) => s + e.attempted, 0) / Math.max(1, attempts),
      warnings,
    });
  });

export const centralConnectivityEvidenceSchema = z.object({
  centralLaneAvailabilityEvents: z.number().int().nonnegative(),
  centralReceiverRejectedDespiteViableLane: z.number().int().nonnegative(),
  sampledSeconds: z.number().nonnegative(),
});
/** Read-only geometric availability. Count distinct carrier/receiver episodes, never award touches. */
export class CentralConnectivityTracker {
  private lastProbe = -1;
  private seen = new Set<string>();
  private evidence = {
    centralLaneAvailabilityEvents: 0,
    centralReceiverRejectedDespiteViableLane: 0,
    sampledSeconds: 0,
  };
  private available(state: TacticalMatchState) {
    const carrier = state.players.find((p) => p.id === state.ball.ownerId);
    if (!carrier || !carrier.slot.position.includes('back') || isRestartSetup(state)) return [];
    return state.players.filter(
      (p) =>
        p.team === carrier.team &&
        p.slot.position.includes('midfielder') &&
        distance(p.position, carrier.position) >= 4 &&
        distance(p.position, carrier.position) <= 28 &&
        state.players.every(
          (foe) =>
            foe.team === carrier.team ||
            distanceToSegment(foe.position, carrier.position, p.position) > 1.5,
        ),
    );
  }
  observe(previous: TacticalMatchState, next: TacticalMatchState) {
    if (next.time - this.lastProbe >= 1) {
      this.lastProbe = next.time;
      this.evidence.sampledSeconds++;
      for (const p of this.available(next)) {
        const key = `${next.ball.ownerId}:${next.ballOwnershipStartedAt}:${p.id}`;
        if (!this.seen.has(key)) {
          this.seen.add(key);
          this.evidence.centralLaneAvailabilityEvents++;
        }
      }
    }
    const action = next.latestAction;
    if (
      action?.type === 'pass' &&
      (next.decisionIndex !== previous.decisionIndex || action !== previous.latestAction)
    ) {
      const viable = this.available(previous);
      if (viable.length && !viable.some((p) => p.id === action.receiverId))
        this.evidence.centralReceiverRejectedDespiteViableLane++;
    }
  }
  snapshot() {
    return centralConnectivityEvidenceSchema.parse(this.evidence);
  }
}
