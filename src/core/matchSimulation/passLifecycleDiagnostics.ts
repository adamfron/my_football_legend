import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import { passDiagnosticSchema } from './matchState';
import { distance, physicalPointSchema } from './matchSpace';
import { collectContactEvidence, contactEvidenceSchema } from './contactEvidence';
import { type BoundedTrace, boundedTraceSchema } from './boundedIntelligence';
import { footContactExecutionSchema } from './footContact';

export const passFailureCauseSchema = z.enum([
  'completed',
  'target_selection',
  'obsolete_target',
  'inaccurate_launch',
  'launch_velocity',
  'spin_or_bounce',
  'receiver_approach',
  'late_reaction',
  'first_touch_failure',
  'lane_interception',
  'landing_race',
  'deflection',
  'out_of_play',
  'statistical_misclassification',
  'other_physical_control',
  'undetermined',
]);
const vector = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
const sampleSchema = z.object({
  at: z.number(),
  ball: physicalPointSchema,
  height: z.number(),
  velocity: vector,
  spin: vector.optional(),
  receiver: physicalPointSchema.optional(),
  receiverVelocity: physicalPointSchema.optional(),
  receiverTarget: physicalPointSchema.optional(),
  ownerId: z.string().optional(),
});
const playerSchema = z.object({
  id: z.string(),
  team: z.enum(['home', 'away']),
  position: physicalPointSchema,
  velocity: physicalPointSchema,
  facing: z.number(),
  attributes: z.record(z.string(), z.number()),
});
export const passLifecycleRecordSchema = z.object({
  diagnostic: passDiagnosticSchema,
  policy: z.string(),
  tacticalContext: z.string(),
  release: sampleSchema,
  players: playerSchema.array(),
  decision: boundedTraceSchema.optional(),
  preparation: boundedTraceSchema.optional(),
  firstContact: contactEvidenceSchema
    .extend({ source: z.string(), point: physicalPointSchema, controlled: z.boolean() })
    .optional(),
  contactPoints: z.array(
    z.object({
      playerId: z.string(),
      at: z.number(),
      point: physicalPointSchema,
      source: z.string(),
    }),
  ),
  trajectory: sampleSchema.array(),
  nearestReceiverDistance: z.number().nonnegative(),
  closestTargetAt: z.number(),
  closestTargetDistance: z.number().nonnegative(),
  failureCause: passFailureCauseSchema,
  evidence: z.string().array(),
  sameTeamRecovery: z.object({ playerId: z.string(), at: z.number() }).optional(),
  receptionQuality: z.number().optional(),
  surfaceRetained: z.boolean().optional(),
  firstTouchSurface: footContactExecutionSchema.optional(),
  releaseSurface: footContactExecutionSchema.optional(),
  contactingPlayer: playerSchema.optional(),
});
export type PassLifecycleRecord = z.infer<typeof passLifecycleRecordSchema>;
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const sample = (s: TacticalMatchState, receiverId: string) => {
  const receiver = s.players.find((p) => p.id === receiverId);
  return {
    at: s.time,
    ball: { x: s.ball.x, y: s.ball.y },
    height: s.ball.height ?? 0.11,
    velocity: {
      x: s.ball.velocity?.x ?? 0,
      y: s.ball.velocity?.y ?? 0,
      z: s.ball.velocity?.z ?? 0,
    },
    spin: { x: s.ball.spin?.x ?? 0, y: s.ball.spin?.y ?? 0, z: s.ball.spin?.z ?? 0 },
    ...(receiver
      ? {
          receiver: { ...receiver.position },
          receiverVelocity: { ...receiver.velocity },
          receiverTarget: { ...receiver.target },
        }
      : {}),
    ...(s.ball.ownerId ? { ownerId: s.ball.ownerId } : {}),
  };
};

/** Passive state-transition observer. No RNG, forecasts, engine writes or possession awards.
 * Causes below require observed evidence. Missing evidence stays undetermined; the enum is
 * deliberately broader than the causes this first observer can establish. */
export class PassLifecycleDiagnostics {
  readonly records = new Map<string, PassLifecycleRecord>();
  private active = new Set<string>();
  private decisions = new Map<string, BoundedTrace>();
  private preparations = new Map<string, BoundedTrace>();
  private seenContacts = new Set<string>();
  trace(t: Readonly<BoundedTrace>) {
    if (t.stage !== 'decision') return;
    this.decisions.set(t.actorId, copy(t));
    if (t.decision?.preparationCandidateId) this.preparations.set(t.actorId, copy(t));
  }
  observe(previous: TacticalMatchState, next: TacticalMatchState) {
    const passes = new Map(
      [next.lastResolvedPass, next.lastPassDiagnostic]
        .filter((p) => Boolean(p))
        .map((p) => [p!.passId, p!]),
    );
    for (const pass of passes.values()) {
      if (this.records.has(pass.passId)) continue;
      const release = sample(next, pass.intendedReceiverId);
      const r: PassLifecycleRecord = {
        diagnostic: copy(pass),
        policy: next.decisionPolicy ?? 'state-value-v1',
        tacticalContext: `${next.scenario}:${next.teams[next.possessionTeam].phase}`,
        release,
        players: next.players.map((p) => ({
          id: p.id,
          team: p.team,
          position: { ...p.position },
          velocity: { ...p.velocity },
          facing: p.facingAngle,
          attributes: { ...p.profile.attributes },
        })),
        ...(this.decisions.has(pass.passerId)
          ? { decision: copy(this.decisions.get(pass.passerId)!) }
          : {}),
        ...(this.preparations.has(pass.passerId)
          ? { preparation: copy(this.preparations.get(pass.passerId)!) }
          : {}),
        contactPoints: [],
        trajectory: [release],
        nearestReceiverDistance: release.receiver ? distance(release.ball, release.receiver) : 999,
        closestTargetAt: next.time,
        closestTargetDistance: distance(next.ball, pass.predictedReceptionPoint),
        failureCause: 'undetermined',
        evidence: [],
      };
      // A launch made inside a tick can already have advanced; flag this precision limit.
      if (Math.abs(next.time - pass.releasedAt) > 1e-8)
        r.evidence.push('release_observed_at_end_of_40hz_tick');
      if (next.ball.launchVelocity) r.release.velocity = { ...next.ball.launchVelocity };
      if (next.ball.from) r.release.ball = { ...next.ball.from };
      r.release.at = pass.releasedAt;
      this.records.set(pass.passId, r);
      if (
        next.lastGroundContact?.actorId === pass.passerId &&
        next.lastGroundContact.at === pass.releasedAt &&
        next.lastGroundContact.surfaceContact
      )
        r.releaseSurface = copy(next.lastGroundContact.surfaceContact);
      this.active.add(pass.passId);
      if (pass.finalResult) {
        delete r.diagnostic.finalResult;
        delete r.diagnostic.resolvedAt;
      }
    }
    const contacts = collectContactEvidence(previous, next).filter((c) => {
      if (this.seenContacts.has(c.id)) return false;
      this.seenContacts.add(c.id);
      return true;
    });
    for (const id of this.active) {
      const r = this.records.get(id)!;
      const live = passes.get(r.diagnostic.passId);
      if (
        !live &&
        next.lastPassDiagnostic &&
        next.lastPassDiagnostic.releasedAt > r.diagnostic.releasedAt
      ) {
        r.evidence.push('superseded_without_canonical_result');
        this.active.delete(id);
        continue;
      }
      const newlyResolved = live?.finalResult && !r.diagnostic.finalResult;
      const wasUnresolved = !r.diagnostic.finalResult;
      if (live) r.diagnostic = copy(live);
      if (wasUnresolved || newlyResolved) {
        const s = sample(next, r.diagnostic.intendedReceiverId);
        if (next.time - r.trajectory.at(-1)!.at >= 0.0999 || newlyResolved) r.trajectory.push(s);
        if (s.receiver)
          r.nearestReceiverDistance = Math.min(
            r.nearestReceiverDistance,
            distance(next.ball, s.receiver),
          );
        const targetDistance = distance(next.ball, r.diagnostic.predictedReceptionPoint);
        if (targetDistance < r.closestTargetDistance) {
          r.closestTargetDistance = targetDistance;
          r.closestTargetAt = next.time;
        }
        for (const c of contacts) {
          if (
            c.at <= r.diagnostic.releasedAt + 1e-8 ||
            c.at > (r.diagnostic.resolvedAt ?? Infinity) + 1e-8
          )
            continue;
          if (c.source === 'pass_release' || c.source === 'shot_release') continue;
          const flight = next.lastBallContact;
          const point =
            c.source === 'flight_contact' && flight?.at === c.at
              ? { x: flight.point.x, y: flight.point.y }
              : newlyResolved && c.at === r.diagnostic.resolvedAt && r.diagnostic.actualContactPoint
                ? { ...r.diagnostic.actualContactPoint }
                : { x: next.ball.x, y: next.ball.y };
          r.contactPoints.push({ playerId: c.playerId, at: c.at, point, source: c.source });
          if (!r.firstContact)
            r.firstContact = { ...c, point, controlled: next.ball.ownerId === c.playerId };
        }
        if (newlyResolved) {
          if (
            !r.firstContact &&
            next.pendingPossessionLoss?.passId === r.diagnostic.passId &&
            next.pendingPossessionLoss.id.includes(':pass-deflection:') &&
            next.ball.lastTouchPlayerId
          ) {
            const point = r.diagnostic.actualContactPoint ?? { x: next.ball.x, y: next.ball.y };
            const contact = {
              id: next.pendingPossessionLoss.id,
              source: 'canonical_deflection',
              playerId: next.ball.lastTouchPlayerId,
              at: r.diagnostic.resolvedAt!,
              point,
              controlled: false,
            };
            r.firstContact = contact;
            r.contactPoints.push(contact);
          }
          const reception = next.lastReceptionOutcome;
          if (reception && r.diagnostic.receptionOutcome === reception.kind)
            r.receptionQuality = reception.quality?.score;
          if (next.lastGroundContact && next.lastGroundContact.at === r.diagnostic.resolvedAt)
            r.surfaceRetained = next.lastGroundContact.retained;
          if (
            next.lastGroundContact &&
            next.lastGroundContact.at === r.diagnostic.resolvedAt &&
            next.lastGroundContact.surfaceContact
          )
            r.firstTouchSurface = copy(next.lastGroundContact.surfaceContact);
          const actor = next.players.find((p) => p.id === r.firstContact?.playerId);
          if (actor)
            r.contactingPlayer = {
              id: actor.id,
              team: actor.team,
              position: { ...actor.position },
              velocity: { ...actor.velocity },
              facing: actor.facingAngle,
              attributes: { ...actor.profile.attributes },
            };
          this.classify(r);
        }
      }
      if (
        r.diagnostic.receptionOutcome &&
        r.diagnostic.resolvedAt !== undefined &&
        next.time - r.diagnostic.resolvedAt <= 8 &&
        !r.sameTeamRecovery &&
        next.ball.ownerId &&
        next.time > r.diagnostic.resolvedAt
      ) {
        const passer = r.players.find((p) => p.id === r.diagnostic.passerId);
        const owner = next.players.find((p) => p.id === next.ball.ownerId);
        if (owner && owner.team === passer?.team)
          r.sameTeamRecovery = { playerId: owner.id, at: next.time };
        else if (owner) this.active.delete(id);
      }
      if (
        r.diagnostic.resolvedAt !== undefined &&
        (r.sameTeamRecovery ||
          !['heavy_touch', 'failed_control'].includes(r.diagnostic.receptionOutcome ?? '') ||
          next.time - r.diagnostic.resolvedAt > 8)
      )
        this.active.delete(id);
    }
  }
  private classify(r: PassLifecycleRecord) {
    const p = r.diagnostic;
    if (p.finalResult === 'completed') {
      r.failureCause = 'completed';
      return;
    }
    if (p.receptionOutcome === 'heavy_touch' || p.receptionOutcome === 'failed_control') {
      r.failureCause = 'first_touch_failure';
      r.evidence.push(`canonical_reception:${p.receptionOutcome}`);
      return;
    }
    const passer = r.players.find((x) => x.id === p.passerId);
    const toucher = r.players.find((x) => x.id === r.firstContact?.playerId);
    if (toucher && passer && toucher.team !== passer.team) {
      if (
        ['flight_contact', 'canonical_deflection'].includes(r.firstContact!.source) &&
        !r.firstContact!.controlled
      ) {
        r.failureCause = 'deflection';
        r.evidence.push('observed_flight_contact_without_control');
      } else {
        const a = r.release.ball,
          b = p.predictedReceptionPoint,
          c = r.firstContact!.point;
        const fraction =
          ((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) /
          Math.max(0.001, distance(a, b) ** 2);
        r.failureCause = fraction < 0.85 ? 'lane_interception' : 'landing_race';
        r.evidence.push(`opponent_contact_path_fraction:${fraction.toFixed(4)}`);
      }
      return;
    }
    if (p.finalResult === 'out_of_play') {
      r.failureCause = 'out_of_play';
      r.evidence.push('canonical_boundary_result');
      return;
    }
    // A sampled aim error alone cannot establish why an opponent collected the ball.
    // Keep hypotheses visible without promoting them into a causal finding.
    if (p.physicalTarget && p.intendedTarget)
      r.evidence.push(
        `sampled_target_error_metres:${distance(p.physicalTarget, p.intendedTarget).toFixed(4)}`,
      );
    r.evidence.push('insufficient_contact_or_control_evidence');
  }
  snapshot() {
    return [...this.records.values()].map((r) => passLifecycleRecordSchema.parse(r));
  }
}
