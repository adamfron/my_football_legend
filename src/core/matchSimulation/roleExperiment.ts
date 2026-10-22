import { z } from 'zod';
import type { SingleMatchSession } from '../singleMatch';
import { frozenMatchTacticsSchema } from '../singleMatch';
import { TACTICAL_PREFERENCE_DEFAULTS } from './tacticalPreferences';
import type { TacticalMatchState } from './matchState';
import { matchActionSchema } from './matchState';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import type { RankedAiAction } from './matchActions';
import { assignTacticalRoles, tacticalRoleFor, rolePlanSchema } from './tacticalRoles';
import { deriveTacticalRolePhase, forecastWaiting } from './roleTactics';
import { decisionPolicyIdSchema, type DecisionPolicyId } from './decisionPolicyConfig';
import { attacksRight, distance, pitchPointSchema } from './matchSpace';
import { matchCentreStatisticsSchema, projectMatchCentreStatistics } from './matchCentreStatistics';

export const configureMatchPolicy = (
  state: TacticalMatchState,
  policy: DecisionPolicyId,
): TacticalMatchState => {
  decisionPolicyIdSchema.parse(policy);
  if (state.time !== 0) throw new Error('Replay policy can only be selected before kickoff');
  return {
    ...state,
    decisionPolicy: policy,
    rolePlan: state.rolePlan ?? assignTacticalRoles(state),
  };
};
export const frozenMatchInputs = (session: SingleMatchSession) => {
  const { decisionPolicy: policy, ...setup } = session.setup;
  void policy;
  return {
    setup,
    home: session.home,
    away: session.away,
    presentation: session.presentation,
    frozenTactics: session.frozenTactics,
  };
};
export const captureMatchTactics = (state: TacticalMatchState) => {
  if (state.time !== 0) throw new Error('Freeze tactical inputs before kickoff');
  return frozenMatchTacticsSchema.parse({
    roles: state.rolePlan?.assignments ?? assignTacticalRoles(state).assignments,
    preferences: Object.fromEntries(
      (['home', 'away'] as const).map((side) => [
        side,
        state.teams[side].tacticalPreferences ??
          TACTICAL_PREFERENCE_DEFAULTS[state.teams[side].style],
      ]),
    ),
  });
};
export const fixtureIdentity = (session: SingleMatchSession) => {
  let hash = 2166136261;
  for (const c of JSON.stringify(frozenMatchInputs(session)))
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `fixture-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};
const traceEntrySchema = z.object({
  at: z.number().nonnegative(),
  kind: z.string(),
  id: z.string(),
  data: z.unknown(),
});
const traceAction = (action: TacticalMatchState['latestAction']) => {
  if (action?.type !== 'pass') return action;
  const { deliveryPlan, ...summary } = action;
  void deliveryPlan;
  return summary;
};
const holdSchema = z.object({
  actorId: z.string(),
  startedAt: z.number().nonnegative(),
  endedAt: z.number().nonnegative(),
  consecutiveHolds: z.number().int().nonnegative(),
  displacement: z.number().nonnegative(),
  availableAlternatives: z.number().int().nonnegative(),
  teammateMovement: z.number().nonnegative(),
  opponentInterventions: z.number().int().nonnegative(),
  pathological: z.boolean(),
  reason: z.string(),
  origin: pitchPointSchema,
});
export const roleExperimentExportSchema = z.object({
  schema: z.literal('mfl-role-experiment-v1'),
  metadata: z.object({
    matchId: z.string(),
    fixtureId: z.string(),
    engine: z.literal('canonical'),
    policy: decisionPolicyIdSchema,
    sourceRevision: z.string(),
    seed: z.string(),
    runtime: z.string(),
    status: z.string(),
    time: z.number(),
    teams: z.unknown(),
    formations: z.unknown(),
    tacticalStyle: z.unknown(),
    preMatchStrength: z.unknown(),
    fixtureInputs: z.unknown(),
    roles: rolePlanSchema,
    result: z.object({ home: z.number(), away: z.number() }),
  }),
  summary: z.object({
    official: matchCentreStatisticsSchema,
    canonicalStatistics: z.unknown(),
    positionalInvolvement: z.unknown(),
    passTypes: z.record(z.string(), z.number()),
    turnoversByArea: z.record(z.string(), z.number()),
    possessionDurations: z.array(z.number()),
    tacticalAdjustments: rolePlanSchema.shape.changes,
    actionCounts: z.record(z.string(), z.number()),
    shots: z.array(z.unknown()),
    credibleOpportunityEpisodes: z.number().int().nonnegative(),
    turnoverConsequences: z.array(z.unknown()),
    teamAdjustments: z.array(z.unknown()),
    stoppages: z.unknown(),
    transitions: z.unknown(),
    comparisonCounters: z.record(z.string(), z.number().nonnegative()),
    coachDecisions: z.unknown(),
    substitutions: z.unknown(),
  }),
  trace: z.array(traceEntrySchema).max(4096),
  diagnostics: z.object({
    holds: z.array(holdSchema).max(128),
    maxHoldSeconds: z.number().nonnegative(),
    pathologicalHolds: z.number().int().nonnegative(),
    omittedTraceEvents: z.number().int().nonnegative(),
    omittedHoldEpisodes: z.number().int().nonnegative(),
    rankingSamples: z.number().int().nonnegative(),
    candidateCount: z.number().int().nonnegative(),
    movementTargetConflicts: z.number().int().nonnegative(),
    missingSupportSamples: z.number().int().nonnegative(),
    observerErrors: z.array(z.string()).max(16),
  }),
});
export type RoleExperimentExport = z.infer<typeof roleExperimentExportSchema>;

/** Opt-in, bounded observer of actual ranking and canonical facts. No presentation inference.
 * Counts/maximums cover the complete observed match even when the detailed tail is bounded. */
export class RoleExperimentRecorder {
  readonly trace: z.infer<typeof traceEntrySchema>[] = [];
  readonly holds: z.infer<typeof holdSchema>[] = [];
  private rankings = new Map<string, { index: number; alternatives: number; sample: unknown }>();
  private hold: z.infer<typeof holdSchema> | undefined;
  private possessionStart = 0;
  private possessionDurations: number[] = [];
  private actions: Record<string, number> = {};
  private passTypes: Record<string, number> = {};
  private turnovers: Record<string, number> = {};
  private shots: NonNullable<TacticalMatchState['lastShot']>[] = [];
  private credibleEpisodes = new Set<string>();
  private turnoverConsequences: {
    lossId: string;
    at: number;
    team: string;
    winnerId?: string | undefined;
    shotIds: string[];
  }[] = [];
  private teamAdjustments: unknown[] = [];
  private maxHoldSeconds = 0;
  private pathologicalHolds = 0;
  private omittedHolds = 0;
  private omitted = 0;
  private rankSamples = 0;
  private candidates = 0;
  private conflicts = 0;
  private missingSupport = 0;
  private errors: string[] = [];
  private comparisonCounters: Record<string, number> = {};
  private lastSampleAt = -1;
  private involvement = new Map<
    string,
    { seconds: number; x: number; y: number; depth: number; wide: number; role: string }
  >();
  private initialRoles: ReturnType<typeof assignTacticalRoles>;
  private transitions: {
    at: number;
    team: string;
    phase: string;
    origin: number;
    progress: number;
    shotIds: string[];
  }[] = [];

  constructor(readonly initial: TacticalMatchState) {
    this.initialRoles = initial.rolePlan ?? assignTacticalRoles(initial);
    this.possessionStart = initial.time;
    this.lastSampleAt = initial.time;
  }
  private add(at: number, kind: string, id: string, data: unknown) {
    this.trace.push({ at, kind, id, data });
    if (this.trace.length > 1024) {
      this.trace.shift();
      this.omitted++;
    }
  }
  readonly ranking = (
    state: TacticalMatchState,
    actorId: string,
    ranked: readonly RankedAiAction[],
  ) => {
    try {
      const actor = state.players.find((p) => p.id === actorId);
      if (!actor) return;
      this.rankSamples++;
      this.candidates += ranked.length;
      const opportunity = evaluateShootingOpportunity(state, actor);
      if (['credible', 'high_value'].includes(opportunity.category)) {
        const id = `${actorId}:${state.ballEpisode ?? 0}`;
        if (!this.credibleEpisodes.has(id)) {
          this.credibleEpisodes.add(id);
          this.add(state.time, 'credible_opportunity', id, opportunity);
        }
      }
      const sample = {
        role: tacticalRoleFor(state, actor).id,
        phase: deriveTacticalRolePhase(state, actor.team),
        candidateCount: ranked.length,
        alternatives: ranked
          .slice(0, 4)
          .map((r) => ({ action: traceAction(r.action), value: r.canonicalScore })),
        ...(ranked[0]?.action.type === 'hold'
          ? { waiting: forecastWaiting(state, actor).diagnostic }
          : {}),
      };
      this.rankings.set(actorId, {
        index: state.decisionIndex,
        alternatives: ranked.filter((r) => r.action.type !== 'hold').length,
        sample,
      });
      if (ranked[0]?.action.type !== 'hold' || this.rankSamples % 50 === 0)
        this.add(state.time, 'ranking_sample', `${state.decisionIndex}:${actorId}`, sample);
    } catch (error) {
      if (this.errors.length < 16) this.errors.push(String(error));
    }
  };
  private finishHold(at: number) {
    if (!this.hold) return;
    const h = { ...this.hold, endedAt: at };
    h.pathological = h.endedAt - h.startedAt >= 30 && h.displacement < 1 && h.consecutiveHolds >= 3;
    this.maxHoldSeconds = Math.max(this.maxHoldSeconds, at - h.startedAt);
    if (h.pathological) {
      this.pathologicalHolds++;
      this.add(at, 'pathological_stagnation', `${h.actorId}:${h.startedAt}`, h);
    }
    this.holds.push(h);
    if (this.holds.length > 128) {
      this.holds.shift();
      this.omittedHolds++;
    }
    this.hold = undefined;
  }
  observe(previous: TacticalMatchState, next: TacticalMatchState) {
    if (next === previous) return;
    for (const side of ['home', 'away'] as const) {
      const before = previous.teams[side],
        after = next.teams[side];
      if (
        before.style !== after.style ||
        JSON.stringify(before.tacticalPreferences) !== JSON.stringify(after.tacticalPreferences)
      ) {
        const change = {
          at: next.time,
          side,
          from: { style: before.style, preferences: before.tacticalPreferences },
          to: { style: after.style, preferences: after.tacticalPreferences },
        };
        this.teamAdjustments.push(change);
        this.add(next.time, 'team_instruction_change', `${side}:${next.time}`, change);
      }
    }
    if (next.lastCombination && next.lastCombination !== previous.lastCombination)
      this.add(
        next.time,
        'combination_result',
        `${next.lastCombination.initiatorId}:${next.lastCombination.startedAt}`,
        next.lastCombination,
      );
    if (next.lastCarryDiagnostic && next.lastCarryDiagnostic !== previous.lastCarryDiagnostic)
      this.add(
        next.time,
        'carry_ended',
        `${next.lastCarryDiagnostic.actorId}:${next.time}`,
        next.lastCarryDiagnostic,
      );
    const action = next.latestAction;
    if (next.decisionIndex !== previous.decisionIndex && action) {
      this.actions[action.type] = (this.actions[action.type] ?? 0) + 1;
      const rank = this.rankings.get(action.actorId);
      const actor = next.players.find((p) => p.id === action.actorId);
      if (action.type !== 'hold' || action.actorId !== this.hold?.actorId)
        this.finishHold(previous.time);
      if (action.type === 'hold' && actor) {
        this.hold ??= {
          actorId: actor.id,
          startedAt: previous.time,
          endedAt: next.time,
          consecutiveHolds: 0,
          displacement: 0,
          availableAlternatives: 0,
          teammateMovement: 0,
          opponentInterventions: 0,
          pathological: false,
          reason: 'unobserved_ranking',
          origin: { ...actor.position },
        };
        this.hold.consecutiveHolds++;
        this.hold.availableAlternatives = rank?.alternatives ?? 0;
        this.hold.reason = forecastWaiting(next, actor).diagnostic.reason;
        if (this.hold.availableAlternatives === 0) this.missingSupport++;
      }
      if (action.type !== 'hold' || this.hold?.consecutiveHolds === 1)
        this.add(next.time, 'selected_action', `${next.decisionIndex}:${action.actorId}`, {
          action: matchActionSchema.parse(traceAction(action)),
          ranking: rank?.index === previous.decisionIndex ? rank.sample : null,
          role: actor ? tacticalRoleFor(next, actor).id : null,
        });
    }
    if (this.hold) {
      const actor = next.players.find((p) => p.id === this.hold!.actorId);
      if (!actor || next.ball.ownerId !== actor.id) this.finishHold(next.time);
      else {
        this.hold.displacement = Math.max(
          this.hold.displacement,
          distance(actor.position, this.hold.origin),
        );
        this.hold.endedAt = next.time;
        for (const p of next.players.filter((p) => p.team === actor.team && p.id !== actor.id)) {
          const before = previous.players.find((b) => b.id === p.id);
          if (before) this.hold.teammateMovement += distance(before.position, p.position);
        }
        if (next.defensiveChallenge && next.defensiveChallenge !== previous.defensiveChallenge)
          this.hold.opponentInterventions++;
      }
    }
    for (const event of next.actionEvents ?? [])
      if (event.sequence >= (previous.actionEventSequence ?? 0))
        this.add(event.at, event.kind, event.id, event);
    const count = (key: string) => {
      this.comparisonCounters[key] = (this.comparisonCounters[key] ?? 0) + 1;
    };
    const carry = next.ballCarrierIntent;
    if (carry && carry.startedAt !== previous.ballCarrierIntent?.startedAt) {
      const actor = next.players.find((p) => p.id === carry.actorId);
      if (actor && Math.abs(actor.position.y - 34) > 15) count('wideCarryIntentions');
    }
    const aerial = next.lastAerialContact;
    if (aerial?.id && aerial.id !== previous.lastAerialContact?.id && aerial.winnerId) {
      const participants = [...next.players, ...(next.departedPlayers ?? [])];
      const teams = new Set(
        [...aerial.contestantIds, ...(aerial.challengerIds ?? [])]
          .map((id) => participants.find((p) => p.id === id)?.team)
          .filter(Boolean),
      );
      if (teams.size === 2 && aerial.contestantIds.includes(aerial.winnerId))
        count('contestedAerialContacts');
    }
    const pass = next.lastPassDiagnostic;
    if (
      pass &&
      pass.passId !== previous.lastPassDiagnostic?.passId &&
      distance(
        next.ball.from ?? previous.ball,
        pass.intendedTarget ?? pass.predictedReceptionPoint,
      ) >= 30
    )
      count('longPassReleases');
    if (pass && pass.passId !== previous.lastPassDiagnostic?.passId)
      this.passTypes[pass.intent ?? 'restart'] =
        (this.passTypes[pass.intent ?? 'restart'] ?? 0) + 1;
    const shot = next.lastShot;
    if (shot && shot.shotId !== previous.lastShot?.shotId) {
      this.shots.push(shot);
      for (const t of this.transitions)
        if (
          next.time - t.at < 10 &&
          t.team === next.players.find((p) => p.id === shot.shooterId)?.team
        )
          t.shotIds.push(shot.shotId);
      for (const loss of this.turnoverConsequences)
        if (
          next.time - loss.at <= 10 &&
          loss.team === next.players.find((p) => p.id === shot.shooterId)?.team
        )
          loss.shotIds.push(shot.shotId);
    }
    if (shot && shot !== previous.lastShot && shot.shotId === previous.lastShot?.shotId) {
      const index = this.shots.findIndex((s) => s.shotId === shot.shotId);
      if (index >= 0) this.shots[index] = shot;
    }
    if (previous.possessionTeam !== next.possessionTeam) {
      this.possessionDurations.push(next.time - this.possessionStart);
      this.possessionStart = next.time;
      this.transitions.push({
        at: next.time,
        team: next.possessionTeam,
        phase: deriveTacticalRolePhase(next, next.possessionTeam),
        origin: next.ball.x,
        progress: 0,
        shotIds: [],
      });
    }
    const loss = next.lastPossessionLoss;
    if (loss && loss.id !== previous.lastPossessionLoss?.id) {
      this.turnoverConsequences.push({
        lossId: loss.id,
        at: next.time,
        team: loss.to,
        winnerId: loss.winnerId,
        shotIds: [],
      });
      const depth = attacksRight({ team: loss.from, endsSwitched: next.endsSwitched })
        ? loss.position.x
        : 105 - loss.position.x;
      const area = depth < 35 ? 'defensive' : depth > 70 ? 'attacking' : 'middle';
      this.turnovers[area] = (this.turnovers[area] ?? 0) + 1;
      const actor = previous.players.find((p) => p.id === loss.loserId);
      this.add(next.time, 'turnover_context', loss.id, {
        loss,
        area,
        attempted: previous.latestAction,
        role: actor ? tacticalRoleFor(previous, actor).id : null,
        capability: actor?.profile.attributes,
        pressure: previous.currentPressure,
        alternatives: actor ? this.rankings.get(actor.id)?.sample : null,
      });
    }
    const activeTransition = this.transitions.at(-1);
    if (
      activeTransition &&
      next.time - activeTransition.at < 10 &&
      next.possessionTeam === activeTransition.team &&
      next.ball.ownerId
    )
      activeTransition.progress = Math.max(
        activeTransition.progress,
        (next.ball.x - activeTransition.origin) *
          (attacksRight({ team: next.possessionTeam, endsSwitched: next.endsSwitched }) ? 1 : -1),
      );
    if (next.time - this.lastSampleAt >= 1) {
      const dt = this.lastSampleAt < 0 ? 0 : next.time - this.lastSampleAt;
      this.lastSampleAt = next.time;
      for (const player of next.players) {
        const role = tacticalRoleFor(next, player).id,
          key = `${player.id}:${role}`;
        const row = this.involvement.get(key) ?? {
          seconds: 0,
          x: 0,
          y: 0,
          depth: 0,
          wide: 0,
          role,
        };
        row.seconds += dt;
        row.x += player.position.x * dt;
        row.y += player.position.y * dt;
        row.depth += (attacksRight(player) ? player.position.x : 105 - player.position.x) * dt;
        row.wide += Math.abs(player.position.y - 34) > 18 ? dt : 0;
        this.involvement.set(key, row);
        if (
          next.combinationIntent?.runnerId === player.id &&
          distance(next.combinationIntent.target, player.idealTarget) > 3
        )
          this.conflicts++;
      }
    }
  }
  export(
    session: SingleMatchSession,
    state: TacticalMatchState,
    sourceRevision: string,
    runtime: string,
  ): RoleExperimentExport {
    const rolePlan = {
      ...(state.rolePlan ?? this.initialRoles),
      assignments: Object.fromEntries(
        state.players.map((p) => [p.id, tacticalRoleFor(state, p).id]),
      ),
    };
    const hold = this.hold
      ? {
          ...this.hold,
          endedAt: state.time,
          pathological:
            state.time - this.hold.startedAt >= 30 &&
            this.hold.displacement < 1 &&
            this.hold.consecutiveHolds >= 3,
        }
      : undefined;
    return roleExperimentExportSchema.parse({
      schema: 'mfl-role-experiment-v1',
      metadata: {
        matchId: `${fixtureIdentity(session)}:${state.decisionPolicy}`,
        fixtureId: fixtureIdentity(session),
        engine: 'canonical',
        policy: state.decisionPolicy ?? 'legacy-pr176',
        sourceRevision,
        seed: state.seed,
        runtime,
        status: state.status ?? 'first_half',
        time: state.time,
        teams: { home: session.home.club.name, away: session.away.club.name },
        formations: { home: session.home.formation, away: session.away.formation },
        tacticalStyle: state.teams,
        preMatchStrength: {
          home: session.home.strength,
          away: session.away.strength,
          classification: 'unclassified',
          definition:
            'Match Lab preserves the native XI rating; research tiers use the frozen population manifest.',
        },
        fixtureInputs: frozenMatchInputs(session),
        roles: rolePlan,
        result: state.score,
      },
      summary: {
        official: projectMatchCentreStatistics(state),
        canonicalStatistics: state.statistics,
        positionalInvolvement: Object.fromEntries(
          [...this.involvement].map(([id, r]) => [
            id,
            {
              ...r,
              averageX: r.x / Math.max(1, r.seconds),
              averageY: r.y / Math.max(1, r.seconds),
              averageDepth: r.depth / Math.max(1, r.seconds),
            },
          ]),
        ),
        passTypes: this.passTypes,
        turnoversByArea: this.turnovers,
        possessionDurations: [...this.possessionDurations, state.time - this.possessionStart],
        tacticalAdjustments: rolePlan.changes,
        actionCounts: this.actions,
        shots: this.shots,
        credibleOpportunityEpisodes: this.credibleEpisodes.size,
        turnoverConsequences: this.turnoverConsequences,
        teamAdjustments: this.teamAdjustments,
        stoppages: state.stoppageLedger,
        transitions: this.transitions,
        comparisonCounters: this.comparisonCounters,
        coachDecisions: {
          home: state.teams.home.coaching?.decisions ?? [],
          away: state.teams.away.coaching?.decisions ?? [],
        },
        substitutions: state.substitutionState?.completed ?? [],
      },
      trace: this.trace,
      diagnostics: {
        holds: [...this.holds, ...(hold ? [hold] : [])].slice(-128),
        maxHoldSeconds: Math.max(this.maxHoldSeconds, hold ? state.time - hold.startedAt : 0),
        pathologicalHolds: this.pathologicalHolds + (hold?.pathological ? 1 : 0),
        omittedTraceEvents: this.omitted,
        omittedHoldEpisodes: this.omittedHolds,
        rankingSamples: this.rankSamples,
        candidateCount: this.candidates,
        movementTargetConflicts: this.conflicts,
        missingSupportSamples: this.missingSupport,
        observerErrors: this.errors,
      },
    });
  }
}
