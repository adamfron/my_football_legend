import type { BoundedScene } from './boundedPerception';
import { knownBoundedPlayers } from './boundedPerception';
import type { BoundedCandidate } from './boundedDecision';
import { clampPitchPoint, distance } from './matchSpace';
import { observedPassDelivery } from './observedPassDelivery';
import {
  estimatePassWindow,
  boundedContinuationThreat,
  boundedPositionThreat,
  observedOffsideAssessment,
} from './opportunityWindows';
import { angleForVector, normalizeAngle } from './playerOrientation';

/** A missing delivery repertoire, limited to two already observed moving receivers
 * inside the existing 36m menu. The launch routine plans the player's OWN proposed
 * kick, not the actual error, future opposition or released-ball destination. */
export const observedLoftedCandidates = (
  s: BoundedScene,
  base: BoundedCandidate[],
): BoundedCandidate[] => {
  if (!s.observedLoftedExperiment || !s.ball || s.ball.ownerId !== s.observerId || !s.knowledge)
    return [];
  const known = knownBoundedPlayers(s);
  const options = base
    .filter((c) => c.action.type === 'pass' && c.action.intent === 'through')
    .sort((a, b) => b.progress - a.progress || a.id.localeCompare(b.id));
  const result: BoundedCandidate[] = [];
  const used = new Set<string>();
  for (const c of options) {
    if (result.length === 2) break;
    if (c.action.type !== 'pass' || used.has(c.action.receiverId)) continue;
    const receiverId = c.action.receiverId;
    const receiver = known.find((p) => p.id === receiverId && p.team === s.team);
    const evidence = s.knowledge.find((k) => k.id === receiver?.id);
    if (
      !receiver ||
      !evidence ||
      s.at - evidence.observedAt > 0.5 ||
      evidence.uncertainty > 1.5 ||
      evidence.confidence < 0.5
    )
      continue;
    if (
      s.direction * receiver.velocity.x < 0.35 ||
      Math.hypot(receiver.velocity.x, receiver.velocity.y) < 0.8
    )
      continue;
    const target = clampPitchPoint(c.action.target);
    const metres = distance(s.position, target);
    if (metres < 12 || metres > 36 || distance(s.position, receiver.position) > 36) continue;
    const action = observedPassDelivery(
      s,
      { ...c.action, target, delivery: 'lofted' },
      c.passTravelSeconds ?? 1,
    );
    if (action.type !== 'pass' || !action.deliveryPlan) continue;
    const launch = action.deliveryPlan;
    const turn =
      Math.abs(
        normalizeAngle(
          angleForVector({ x: target.x - s.position.x, y: target.y - s.position.y }) - s.facing,
        ),
      ) / Math.PI;
    const skill = (s.attributes.firstTouch + s.attributes.technique + s.attributes.composure) / 300;
    const readyAt =
      s.readyAt + Math.max(0, turn * 0.55 + Math.max(0, metres - 10) / 70 - skill * 0.22);
    const window = estimatePassWindow(
      s,
      receiver.id,
      target,
      launch.predictedArrivalTime,
      Math.max(0, readyAt - s.at),
      {
        verticalSpeed: launch.velocity.z,
        releaseHeight: Math.max(0.11, s.ball.height),
      },
    );
    if (!window) continue;
    const interference = Math.max(0, Math.min(1, (0.18 - window.contactMargin) / 0.8));
    const error = Math.max(
      0,
      Math.min(1, (1 - s.attributes.passing / 100) * (0.07 + metres / 100)),
    );
    // Reuse the existing loss/consequence units. No reward for loft, attack or uncertainty.
    const offside = observedOffsideAssessment(s, receiver.position);
    const failure = Math.max(interference, offside.risk);
    const penalty = Math.min(
      0.28,
      Math.max(
        0,
        ...s.knowledge.filter((k) => c.evidenceIds.includes(k.id)).map((k) => k.uncertainty),
      ) * 0.045,
    );
    const risk = Math.min(
      1,
      error + (1 - error) * failure + (1 - error - (1 - error) * failure) * penalty,
    );
    const before = boundedPositionThreat(s.direction, s.position);
    result.push({
      ...c,
      id: `${c.id}:lofted`,
      action,
      readyAt,
      passTravelSeconds: launch.predictedArrivalTime,
      opportunity: window,
      closesAt: window.closesAt ?? s.at + 0.2,
      risk,
      benefit:
        (1 - risk) * boundedContinuationThreat(s, target, receiver.id) -
        before -
        risk * boundedPositionThreat(-s.direction, target) -
        penalty * (before + 0.04),
      feasible: s.contactReady && c.legal !== false,
    });
    used.add(receiver.id);
  }
  return result;
};
