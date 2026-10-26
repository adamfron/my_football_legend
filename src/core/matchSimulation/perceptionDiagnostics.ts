import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import type { BoundedTrace } from './boundedIntelligence';
import { boundedTraceSchema } from './boundedIntelligence';
import { distance, physicalPointSchema } from './matchSpace';
import { groundContactFactSchema } from './ballContactGeometry';

export const perceptionDiagnosticsSchema = z.object({
  scans: z.number().int(),
  preparedReceptions: z.number().int(),
  unpreparedReceptions: z.number().int(),
  matchedPreparedReleases: z.number().int(),
  invalidatedOptions: z.number().int(),
  positionMoves: z.number().int(),
  reasons: z.record(z.string(), z.number().int()),
  latencies: z.number().array().max(2048),
  circulationSamples: z
    .array(
      z.object({
        at: z.number(),
        team: z.enum(['home', 'away']),
        points: physicalPointSchema.array().max(6),
        decisions: boundedTraceSchema.array().max(6),
      }),
    )
    .max(6),
  receptionSamples: z
    .array(
      z.object({
        contact: groundContactFactSchema,
        prepared: z.boolean(),
        informationAge: z.number().nullable(),
      }),
    )
    .max(24),
});
/** Entirely passive truth/outcome accounting. Nothing from this class enters player state. */
export class PerceptionDiagnostics {
  private data: z.infer<typeof perceptionDiagnosticsSchema> = {
    scans: 0,
    preparedReceptions: 0,
    unpreparedReceptions: 0,
    matchedPreparedReleases: 0,
    invalidatedOptions: 0,
    positionMoves: 0,
    reasons: {},
    latencies: [],
    circulationSamples: [],
    receptionSamples: [],
  };
  private decisions = new Map<string, BoundedTrace>();
  private pending = new Map<string, number>();
  private paths = {
    home: [] as { point: { x: number; y: number }; decision?: BoundedTrace }[],
    away: [] as { point: { x: number; y: number }; decision?: BoundedTrace }[],
  };
  private seen = new Set<string>();
  decision(t: Readonly<BoundedTrace>) {
    if (t.stage === 'decision') this.decisions.set(t.actorId, structuredClone(t));
  }
  observe(before: TacticalMatchState, after: TacticalMatchState) {
    for (const [id, m] of Object.entries(after.activePerceptionRuntime?.memory ?? {}))
      this.data.scans += Math.max(
        0,
        m.scans - (before.activePerceptionRuntime?.memory[id]?.scans ?? 0),
      );
    for (const [id, p] of Object.entries(after.activePerceptionRuntime?.plans ?? {})) {
      this.data.invalidatedOptions += p.invalidated.filter(
        (q) =>
          !before.activePerceptionRuntime?.plans[id]?.invalidated.some(
            (old) => old.id === q.id && old.reason === q.reason,
          ),
      ).length;
      if (p.usedId && p.usedId !== before.activePerceptionRuntime?.plans[id]?.usedId)
        this.data.matchedPreparedReleases++;
    }
    for (const [id, p] of Object.entries(after.activePerceptionRuntime?.positions ?? {})) {
      const actor = after.players.find((q) => q.id === id),
        key = id + ':' + p.observedAt;
      if (actor && distance(actor.position, p.origin) > 1.5 && !this.seen.has(key)) {
        this.seen.add(key);
        this.data.positionMoves++;
      }
    }
    const contact = after.lastGroundContact;
    if (
      contact?.executed &&
      contact.at !== before.lastGroundContact?.at &&
      before.ball.ownerId !== contact.actorId
    ) {
      const plan = before.activePerceptionRuntime?.plans[contact.actorId];
      const prepared = Boolean(
        plan && plan.createdAt < contact.at && plan.expiresAt > contact.at && plan.options.length,
      );
      this.data[prepared ? 'preparedReceptions' : 'unpreparedReceptions']++;
      this.pending.set(contact.actorId, contact.at);
      if (this.data.receptionSamples.length < 24)
        this.data.receptionSamples.push({
          contact: structuredClone(contact),
          prepared,
          informationAge: plan ? contact.at - plan.createdAt : null,
        });
    }
    if (after.decisionIndex !== before.decisionIndex && after.latestAction) {
      const t = this.pending.get(after.latestAction.actorId);
      if (t !== undefined && after.time >= t) {
        if (this.data.latencies.length < 2048) this.data.latencies.push(after.time - t);
        this.pending.delete(after.latestAction.actorId);
      }
    }
    const pass = after.lastPassDiagnostic;
    if (pass && pass.passId !== before.lastPassDiagnostic?.passId) {
      const actor = before.players.find((p) => p.id === pass.passerId),
        target = pass.intendedTarget ?? pass.predictedReceptionPoint;
      if (actor && target) {
        const trace = this.decisions.get(actor.id),
          candidate = trace?.candidates?.find((c) => c.id === trace.decision?.selectedCandidateId);
        const progress =
          (target.x - actor.position.x) *
          ((actor.team === 'home') !== Boolean(after.endsSwitched) ? 1 : -1);
        const reason =
          candidate?.goal === 'escape'
            ? 'escape_pressure'
            : candidate?.opportunity &&
                candidate.opportunity.closesAt !== null &&
                candidate.opportunity.closesAt - after.time < 0.8
              ? 'temporary_lane'
              : progress > 5
                ? 'progression'
                : Math.abs(target.y - actor.position.y) > 20
                  ? 'switch_play'
                  : candidate?.goal === 'retain'
                    ? 'safe_retention'
                    : 'lateral_or_return';
        this.data.reasons[reason] = (this.data.reasons[reason] ?? 0) + 1;
        const path = this.paths[actor.team];
        path.push({ point: { ...actor.position }, ...(trace ? { decision: trace } : {}) });
        if (path.length > 6) path.shift();
        if (
          path.length === 6 &&
          Math.max(...path.map((p) => p.point.x)) - Math.min(...path.map((p) => p.point.x)) < 8 &&
          Math.max(...path.map((p) => p.point.y)) - Math.min(...path.map((p) => p.point.y)) < 12
        ) {
          this.data.reasons.repeated_local_circulation =
            (this.data.reasons.repeated_local_circulation ?? 0) + 1;
          if (this.data.circulationSamples.length < 6)
            this.data.circulationSamples.push({
              at: after.time,
              team: actor.team,
              points: path.map((p) => p.point),
              decisions: path.flatMap((p) => (p.decision ? [p.decision] : [])),
            });
        }
      }
    }
    if (before.possessionTeam !== after.possessionTeam) {
      this.paths.home = [];
      this.paths.away = [];
    }
  }
  report() {
    return perceptionDiagnosticsSchema.parse(this.data);
  }
}
