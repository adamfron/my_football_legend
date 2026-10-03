import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import { distance } from './matchSpace';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';

export const contactEvidenceSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  at: z.number().nonnegative(),
  source: z.enum([
    'pass_release',
    'pass_reception',
    'shot_release',
    'flight_contact',
    'controlled_contact',
    'delivery_release',
    'carry_control',
  ]),
});
export type ContactEvidence = z.infer<typeof contactEvidenceSchema>;

/** Discrete football contacts: release, reception, physical contact, acquisition and one control
 * contact per executed carry. Ownership maintenance and last-touch provenance are not contacts.
 * First-time reception/shot evidence describes one physical contact at the same player/time. */
export const collectContactEvidence = (
  previous: TacticalMatchState,
  next: TacticalMatchState,
): ContactEvidence[] => {
  const evidenceSpan = startPerformanceSpan('pass_contact_evidence');
  try {
    const events = new Map<string, ContactEvidence>();
    const add = (
      playerId: string,
      at: number,
      source: ContactEvidence['source'],
      legacyId?: string,
    ) => {
      const id = `${next.seed}:contact:${playerId}:${legacyId ?? at.toFixed(6)}`;
      if (!events.has(id)) events.set(id, { id, playerId, at, source });
    };
    const pass = next.lastPassDiagnostic;
    if (pass) {
      add(pass.passerId, pass.releasedAt, 'pass_release');
      if (
        pass.actualContactPoint &&
        pass.resolvedAt !== undefined &&
        pass.finalResult === 'completed'
      )
        add(pass.intendedReceiverId, pass.resolvedAt, 'pass_reception');
    }
    const shot = next.ball.shot ?? next.lastShot;
    if (shot)
      add(
        shot.shooterId,
        shot.releasedAt ?? next.time,
        'shot_release',
        shot.releasedAt === undefined ? shot.shotId : undefined,
      );
    const contact = next.lastBallContact;
    if (contact?.playerId) add(contact.playerId, contact.at, 'flight_contact');
    const contactAt = (playerId: string) => {
      if (contact?.playerId === playerId && contact.at !== previous.lastBallContact?.at)
        return contact.at;
      if (
        pass?.intendedReceiverId === playerId &&
        pass !== previous.lastPassDiagnostic &&
        pass.actualContactPoint &&
        pass.resolvedAt !== undefined
      )
        return pass.resolvedAt;
      if (
        next.ball.shot?.shooterId === playerId &&
        next.ball.shot.shotId !== previous.ball.shot?.shotId
      )
        return next.ball.shot.releasedAt ?? next.time;
      return next.time;
    };
    const reception = next.lastReceptionOutcome;
    const previousReception = previous.lastReceptionOutcome;
    const newReception =
      reception &&
      (!previousReception ||
        reception.receiverId !== previousReception.receiverId ||
        reception.kind !== previousReception.kind ||
        distance(reception.contactPoint, previousReception.contactPoint) > 0.000001 ||
        (next.onBallPreparation?.actorId === reception.receiverId &&
          next.onBallPreparation.gainedAt !== previous.onBallPreparation?.gainedAt));
    if (newReception)
      add(reception.receiverId, contactAt(reception.receiverId), 'controlled_contact');
    if (
      next.ball.ownerId &&
      next.ball.ownerId !== previous.ball.ownerId &&
      next.restart?.phase !== 'setup'
    )
      add(next.ball.ownerId, contactAt(next.ball.ownerId), 'controlled_contact');
    const carry = next.ballCarrierIntent ?? previous.ballCarrierIntent;
    const carrier = carry && next.players.find((player) => player.id === carry.actorId);
    if (
      carry &&
      carrier &&
      next.ball.ownerId === carrier.id &&
      distance(carry.startPosition, carrier.position) >= 0.8
    )
      add(carrier.id, carry.startedAt, 'carry_control', `carry:${carry.startedAt.toFixed(6)}`);
    // Crosses and non-shot headers are releases too, although separately classified from passes.
    if (
      next.ball.launchVelocity &&
      next.ball.lastTouchPlayerId &&
      ['cross', 'header'].includes(next.ball.sourceAction ?? '') &&
      next.ball.flightTime === 0 &&
      !next.ball.shot
    )
      add(next.ball.lastTouchPlayerId, next.time, 'delivery_release');
    return [...events.values()];
  } finally {
    endPerformanceSpan('pass_contact_evidence', evidenceSpan);
  }
};
