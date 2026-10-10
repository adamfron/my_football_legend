import { isMatchGoalkeeper } from './matchGoalkeeper';
import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import { distance, distanceToSegment, pitchPointSchema } from './matchSpace';
import { derivePressingAssignment, deriveBuildUpSupport } from './tacticalPositioning';
import {
  deriveDefensiveContext,
  enumerateDefensiveChallengeActions,
  chooseNpcDefensiveChallengeAction,
  deriveCooperativePress,
  protectedPressReceiver,
} from './defensiveChallenges';
import { rankAvailableActionsForAI } from './matchActions';

const metric = z.number().finite();
export const pressingEvolutionSchema = z.object({
  at: metric,
  stage: z.enum(['approach', 'contain_screen', 'engage_contact']),
  intention: z.string(),
  distance: metric,
  relativeSpeed: metric,
  presserSpeed: metric,
  carrierSpeed: metric,
  ballRelativeSpeed: metric,
  target: pitchPointSchema,
  pressure: metric,
  availableChallenges: z.array(z.string()).max(4),
  selectedChallenge: z.string().nullable(),
  challengeReason: z.string(),
  carrierActions: z.array(z.string()).max(8),
  carrierIntent: z.string(),
  escapeOptions: z.number().int(),
  passingLanes: z.number().int(),
  coveringDefenders: z.number().int(),
  uncoveredReceivers: z.array(z.string()).max(10),
  cooperativePress: z.object({ primary: z.string(), secondary: z.string() }).nullable(),
  secondaryDistance: metric.nullable(),
  localDefenderDistance: metric,
  defenderCentroid: pitchPointSchema,
  supportDisplacement: metric,
});
export const pressingEpisodeSchema = z.object({
  carrier: z.string(),
  primary: z.string(),
  secondary: z.string().nullable(),
  startedAt: metric,
  endedAt: metric,
  duration: metric,
  initialDistance: metric,
  initialSecondaryDistance: metric.nullable(),
  minimumDistance: metric,
  staticSeconds: metric,
  maximumStaticSeconds: metric,
  stationaryCarrierSeconds: metric,
  containmentSeconds: metric,
  engageSeconds: metric,
  carrierDistance: metric,
  otherPlayerDistance: metric,
  supportResponseSeconds: metric.nullable(),
  secondaryInvolved: z.boolean(),
  localCompression: metric,
  centroidDistance: metric,
  maximumEscapeOptions: z.number().int(),
  initialEscapeOptions: z.number().int(),
  structuralExposureSamples: z.number().int(),
  outcome: z.string(),
  samples: z.array(pressingEvolutionSchema).max(8),
});
export type PressingEpisode = z.infer<typeof pressingEpisodeSchema>;
export const pressingSummarySchema = z.object({
  episodes: z.number().int(),
  staticEpisodes: z.number().int(),
  totalDuration: metric,
  staticSeconds: metric,
  stationaryCarrierSeconds: metric,
  containmentSeconds: metric,
  engageSeconds: metric,
  carrierDistance: metric,
  otherPlayerDistance: metric,
  supportResponses: z.number().int(),
  supportResponseSeconds: metric,
  cooperativeEpisodes: z.number().int(),
  secondaryInvolvement: z.number().int(),
  localCompression: metric,
  centroidDistance: metric,
  createdEscapeOptions: z.number().int(),
  structuralExposureSamples: z.number().int(),
  outcomes: z.record(z.string(), z.number().int()),
  challengeEvents: z.record(z.string(), z.number().int()),
  durationHistogram: z.array(z.number().int()).length(241),
  retainedEpisodes: z.array(pressingEpisodeSchema).max(256),
});

/** Definition only: close <=2.6m, actor/relative-ball speeds <0.35m/s,
 * unchanged football solution >=2s. Repeated decision identities do not reset it.
 * No canonical system imports this observer or consumes its timer. */
export const STATIC_PRESSURE_DIAGNOSTIC = { distance: 2.6, speed: 0.35, seconds: 2 } as const;
const speed = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);
const centroid = (points: { x: number; y: number }[]) => ({
  x: points.reduce((s, p) => s + p.x, 0) / Math.max(1, points.length),
  y: points.reduce((s, p) => s + p.y, 0) / Math.max(1, points.length),
});
export class PressingTracker {
  constructor(
    private readonly probes = {
      derivePressingAssignment,
      deriveBuildUpSupport,
      deriveDefensiveContext,
      enumerateDefensiveChallengeActions,
      chooseNpcDefensiveChallengeAction,
      deriveCooperativePress,
      protectedPressReceiver,
      rankAvailableActionsForAI,
    },
    private readonly plan?: (
      state: TacticalMatchState,
      actorId: string,
    ) => { intention: string; target: { x: number; y: number } } | undefined,
  ) {}
  private active: PressingEpisode | undefined;
  private lastProbeAt = -1;
  private lastAssignmentAt = -1;
  private assignment: ReturnType<typeof derivePressingAssignment> = { screen: [] };
  private unchangedSince = 0;
  private stationary = 0;
  private lastSignature = '';
  private lastTarget = { x: 0, y: 0 };
  private origins = new Map<string, { x: number; y: number }>();
  private initialCentroid = { x: 0, y: 0 };
  private initialLocalDistance = 0;
  private lastChallengeId = '';
  private challengeOutcome = '';
  private totals = {
    episodes: 0,
    staticEpisodes: 0,
    totalDuration: 0,
    staticSeconds: 0,
    stationaryCarrierSeconds: 0,
    containmentSeconds: 0,
    engageSeconds: 0,
    carrierDistance: 0,
    otherPlayerDistance: 0,
    supportResponses: 0,
    supportResponseSeconds: 0,
    cooperativeEpisodes: 0,
    secondaryInvolvement: 0,
    localCompression: 0,
    centroidDistance: 0,
    createdEscapeOptions: 0,
    structuralExposureSamples: 0,
    outcomes: {} as Record<string, number>,
    challengeEvents: {} as Record<string, number>,
    durationHistogram: Array<number>(241).fill(0),
    retainedEpisodes: [] as PressingEpisode[],
  };
  private finish(state: TacticalMatchState, outcome: string) {
    const e = this.active;
    if (!e) return;
    e.endedAt = state.time;
    e.duration = state.time - e.startedAt;
    e.outcome = this.challengeOutcome || outcome;
    this.totals.episodes++;
    this.totals.staticEpisodes += Number(
      e.maximumStaticSeconds >= STATIC_PRESSURE_DIAGNOSTIC.seconds,
    );
    this.totals.totalDuration += e.duration;
    for (const key of [
      'staticSeconds',
      'stationaryCarrierSeconds',
      'containmentSeconds',
      'engageSeconds',
      'carrierDistance',
      'otherPlayerDistance',
      'localCompression',
      'centroidDistance',
      'structuralExposureSamples',
    ] as const)
      this.totals[key] += e[key];
    if (e.supportResponseSeconds !== null) {
      this.totals.supportResponses++;
      this.totals.supportResponseSeconds += e.supportResponseSeconds;
    }
    this.totals.cooperativeEpisodes += Number(e.secondary !== null);
    this.totals.secondaryInvolvement += Number(e.secondaryInvolved);
    this.totals.createdEscapeOptions += Math.max(
      0,
      e.maximumEscapeOptions - e.initialEscapeOptions,
    );
    this.totals.outcomes[e.outcome] = (this.totals.outcomes[e.outcome] ?? 0) + 1;
    this.totals.durationHistogram[Math.min(240, Math.floor(e.duration))]!++;
    this.totals.retainedEpisodes.push(pressingEpisodeSchema.parse(e));
    if (this.totals.retainedEpisodes.length > 256) this.totals.retainedEpisodes.shift();
    this.active = undefined;
  }
  observe(previous: TacticalMatchState, next: TacticalMatchState) {
    if (this.active && next.lastChallenge?.id !== this.lastChallengeId) {
      const c = next.lastChallenge;
      if (
        c?.opponentId === this.active.carrier &&
        (c.actorId === this.active.primary || c.actorId === this.active.secondary)
      ) {
        this.totals.challengeEvents[c.outcome] = (this.totals.challengeEvents[c.outcome] ?? 0) + 1;
        this.challengeOutcome =
          c.outcome === 'clean_win'
            ? 'successful_tackle'
            : c.outcome === 'loose_ball'
              ? 'loose_ball_challenge'
              : c.outcome === 'foul'
                ? 'foul'
                : '';
      }
      this.lastChallengeId = c?.id ?? '';
    }
    const carrier = next.players.find((p) => p.id === next.ball.ownerId);
    if (
      this.active &&
      (!carrier ||
        carrier.id !== this.active.carrier ||
        next.scenario !== 'open_play' ||
        ['half_time', 'full_time', 'abandoned'].includes(next.status ?? ''))
    ) {
      const release = next.lastPassDiagnostic;
      const previousCarrier = previous.players.find((p) => p.id === this.active!.carrier);
      const origin = this.origins.get(this.active.carrier);
      const pass =
        release?.passerId === this.active.carrier &&
        (release.releasedAt ?? -1) >= this.active.startedAt;
      const reset =
        pass &&
        origin &&
        previousCarrier &&
        (previousCarrier.team === 'home' ? 1 : -1) *
          ((release!.intendedTarget?.x ?? next.ball.x) - origin.x) <
          -3;
      this.finish(
        next,
        pass
          ? reset
            ? 'backwards_reset_pass'
            : 'pressure_release'
          : next.scenario !== 'open_play'
            ? 'restart_or_out_of_play'
            : 'control_change',
      );
    }
    if (
      !carrier ||
      next.scenario !== 'open_play' ||
      ['half_time', 'full_time', 'abandoned'].includes(next.status ?? '')
    )
      return;
    const side = carrier.team === 'home' ? 'away' : 'home';
    if (next.time - this.lastAssignmentAt >= 0.25 || carrier.id !== this.active?.carrier) {
      this.assignment = this.probes.derivePressingAssignment(next, side);
      this.lastAssignmentAt = next.time;
    }
    const assignment = this.assignment;
    const primary = next.players.find((p) => p.id === assignment.primary);
    if (!primary) return;
    const gap = distance(primary.position, carrier.position);
    const closing =
      (primary.velocity.x - carrier.velocity.x) * (carrier.position.x - primary.position.x) +
      (primary.velocity.y - carrier.velocity.y) * (carrier.position.y - primary.position.y);
    if (this.active && primary.id !== this.active.primary) this.finish(next, 'press_handoff');
    if (this.active && gap > 14) this.finish(next, 'carrier_escape_or_shape_recovery');
    if (!this.active && gap <= 12 && (closing > 0.05 || gap <= 4)) {
      const secondary =
        assignment.secondary && next.players.find((p) => p.id === assignment.secondary!.playerId);
      this.active = {
        carrier: carrier.id,
        primary: primary.id,
        secondary: secondary?.id ?? null,
        startedAt: next.time,
        endedAt: next.time,
        duration: 0,
        initialDistance: gap,
        initialSecondaryDistance: secondary ? distance(secondary.position, carrier.position) : null,
        minimumDistance: gap,
        staticSeconds: 0,
        maximumStaticSeconds: 0,
        stationaryCarrierSeconds: 0,
        containmentSeconds: 0,
        engageSeconds: 0,
        carrierDistance: 0,
        otherPlayerDistance: 0,
        supportResponseSeconds: null,
        secondaryInvolved: false,
        localCompression: 0,
        centroidDistance: 0,
        maximumEscapeOptions: 0,
        initialEscapeOptions: 0,
        structuralExposureSamples: 0,
        outcome: 'active',
        samples: [],
      };
      this.origins = new Map(next.players.map((p) => [p.id, { ...p.position }]));
      const defenders = next.players.filter((p) => p.team === side && !isMatchGoalkeeper(p));
      this.initialCentroid = centroid(defenders.map((p) => p.position));
      this.initialLocalDistance =
        defenders
          .map((p) => distance(p.position, carrier.position))
          .sort((a, b) => a - b)
          .slice(0, 4)
          .reduce((s, d) => s + d, 0) / 4;
      this.lastProbeAt = -1;
      this.stationary = 0;
      this.unchangedSince = next.time;
      this.lastSignature = '';
      this.challengeOutcome = '';
      this.lastChallengeId = next.lastChallenge?.id ?? '';
    }
    const e = this.active;
    if (!e) return;
    const dt = Math.max(0, next.time - previous.time);
    e.minimumDistance = Math.min(e.minimumDistance, gap);
    const cs = speed(carrier.velocity),
      ps = speed(primary.velocity);
    if (next.currentPressure >= 0.67 && cs < 0.35) e.stationaryCarrierSeconds += dt;
    const priorCarrier = previous.players.find((p) => p.id === carrier.id);
    if (priorCarrier) e.carrierDistance += distance(priorCarrier.position, carrier.position);
    for (const p of next.players) {
      if (p.id === carrier.id || p.id === primary.id || isMatchGoalkeeper(p)) continue;
      e.otherPlayerDistance += speed(p.velocity) * dt;
    }
    const latest = e.samples.at(-1);
    if (
      latest?.intention === 'engage' ||
      latest?.intention === 'emergency' ||
      next.defensiveChallenge?.actorId === primary.id
    )
      e.engageSeconds += dt;
    else if (gap <= 4) e.containmentSeconds += dt;
    const relativeBallSpeed =
      dt > 0 && priorCarrier && previous.ball.ownerId === carrier.id
        ? Math.hypot(
            (next.ball.x - carrier.position.x - (previous.ball.x - priorCarrier.position.x)) / dt,
            (next.ball.y - carrier.position.y - (previous.ball.y - priorCarrier.position.y)) / dt,
          )
        : Math.hypot(
            (next.ball.velocity?.x ?? carrier.velocity.x) - carrier.velocity.x,
            (next.ball.velocity?.y ?? carrier.velocity.y) - carrier.velocity.y,
          );
    if (
      next.currentAction?.type !== previous.currentAction?.type ||
      next.ballCarrierIntent?.executionMode !== previous.ballCarrierIntent?.executionMode ||
      next.onBallPreparation?.micro?.phase !== previous.onBallPreparation?.micro?.phase
    ) {
      this.unchangedSince = next.time;
      this.stationary = 0;
    }
    const stationary =
      gap <= STATIC_PRESSURE_DIAGNOSTIC.distance &&
      cs < STATIC_PRESSURE_DIAGNOSTIC.speed &&
      ps < STATIC_PRESSURE_DIAGNOSTIC.speed &&
      relativeBallSpeed < STATIC_PRESSURE_DIAGNOSTIC.speed &&
      !next.defensiveChallenge &&
      next.time - this.unchangedSince >= 0.25;
    this.stationary = stationary ? this.stationary + dt : 0;
    if (stationary) e.staticSeconds += dt;
    e.maximumStaticSeconds = Math.max(e.maximumStaticSeconds, this.stationary);
    if (next.time - this.lastProbeAt < 1) return;
    this.lastProbeAt = next.time;
    const coop = this.probes.deriveCooperativePress(next, side);
    const secondary = coop && next.players.find((p) => p.id === coop.secondaryId);
    if (secondary) {
      e.secondary = secondary.id;
      e.secondaryInvolved ||= distance(secondary.position, carrier.position) < 3.2;
    }
    const context = this.probes.deriveDefensiveContext(next, primary.id);
    const options = this.probes.enumerateDefensiveChallengeActions(next, primary.id);
    const selected = this.probes.chooseNpcDefensiveChallengeAction(next, primary.id, coop ?? null);
    const ranking = this.probes.rankAvailableActionsForAI(next, carrier.id);
    const supports = this.probes.deriveBuildUpSupport(next, carrier.team);
    const viable = ranking.filter((r) => r.action.type === 'pass' && r.canonicalScore > 20);
    const defenders = next.players.filter((p) => p.team === side && !isMatchGoalkeeper(p));
    const uncovered = next.players.filter(
      (p) =>
        p.team === carrier.team &&
        p.id !== carrier.id &&
        (carrier.team === 'home' ? p.position.x : 105 - p.position.x) > 71 &&
        distance(carrier.position, p.position) < 30 &&
        Math.min(...defenders.map((d) => distance(d.position, p.position))) > 8,
    );
    const targetPlan = this.plan?.(next, primary.id);
    const target = targetPlan?.target ?? primary.target;
    const intention =
      targetPlan?.intention ??
      (selected || next.defensiveChallenge?.actorId === primary.id
        ? 'engage'
        : this.probes.protectedPressReceiver(next, primary)
          ? 'screen'
          : 'contain');
    const intent =
      next.ballCarrierIntent?.executionMode ??
      next.currentAction?.type ??
      next.onBallPreparation?.micro?.phase ??
      'prepare';
    const carry = next.ballCarrierIntent;
    const signature = [
      carry?.target.x,
      carry?.target.y,
      context?.covering,
      uncovered
        .map((p) => p.id)
        .sort()
        .join(','),
      intention,
      selected?.technique,
      intent,
      next.onBallPreparation?.micro?.phase,
      viable
        .map((r) => (r.action.type === 'pass' ? r.action.receiverId : ''))
        .sort()
        .join(','),
    ].join('|');
    if (signature !== this.lastSignature || distance(target, this.lastTarget) > 0.2) {
      this.unchangedSince = next.time;
      this.stationary = 0;
    }
    this.lastSignature = signature;
    this.lastTarget = { ...target };
    const supportDisplacement = Math.max(
      0,
      ...supports.map((s) => {
        const p = next.players.find((p) => p.id === s.playerId),
          origin = this.origins.get(s.playerId);
        return p && origin ? distance(p.position, origin) : 0;
      }),
    );
    if (supportDisplacement > 1.5 && e.supportResponseSeconds === null)
      e.supportResponseSeconds = next.time - e.startedAt;
    const local =
      defenders
        .map((p) => distance(p.position, carrier.position))
        .sort((a, b) => a - b)
        .slice(0, 4)
        .reduce((s, d) => s + d, 0) / 4;
    e.localCompression = this.initialLocalDistance - local;
    e.centroidDistance = distance(this.initialCentroid, centroid(defenders.map((p) => p.position)));
    e.structuralExposureSamples += Number(uncovered.length > 0);
    e.maximumEscapeOptions = Math.max(e.maximumEscapeOptions, viable.length);
    if (!e.samples.length) e.initialEscapeOptions = viable.length;
    const sample = pressingEvolutionSchema.parse({
      at: next.time,
      stage:
        gap > 4
          ? 'approach'
          : intention === 'engage' || intention === 'emergency'
            ? 'engage_contact'
            : 'contain_screen',
      intention,
      distance: gap,
      relativeSpeed: Math.hypot(
        primary.velocity.x - carrier.velocity.x,
        primary.velocity.y - carrier.velocity.y,
      ),
      presserSpeed: ps,
      carrierSpeed: cs,
      ballRelativeSpeed: relativeBallSpeed,
      target,
      pressure: next.currentPressure,
      availableChallenges: options.map((a) => a.technique),
      selectedChallenge: selected?.technique ?? null,
      challengeReason: next.defensiveChallenge
        ? 'active_contact'
        : selected
          ? 'context_and_access'
          : !options.length
            ? 'geometry_or_episode_lock'
            : 'risk_reach_or_structure',
      carrierActions: [...new Set(ranking.map((r) => r.action.type))].slice(0, 8),
      carrierIntent: intent,
      escapeOptions: viable.length,
      passingLanes: supports.filter((s) => {
        const p = next.players.find((p) => p.id === s.playerId);
        return (
          p &&
          defenders.every((d) => distanceToSegment(d.position, carrier.position, p.position) > 1.5)
        );
      }).length,
      coveringDefenders: context?.covering ?? 0,
      uncoveredReceivers: uncovered.map((p) => p.id),
      cooperativePress: coop ? { primary: coop.primaryId, secondary: coop.secondaryId } : null,
      secondaryDistance: secondary ? distance(secondary.position, carrier.position) : null,
      localDefenderDistance: local,
      defenderCentroid: centroid(defenders.map((p) => p.position)),
      supportDisplacement,
    });
    if (e.samples.length < 8) e.samples.push(sample);
    else e.samples[7] = sample;
  }
  close(state: TacticalMatchState) {
    this.finish(state, 'unresolved_at_observation_end');
  }
  snapshot() {
    return pressingSummarySchema.parse(this.totals);
  }
}
