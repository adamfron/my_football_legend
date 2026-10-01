import { z } from 'zod';
import type { TacticalMatchState } from './matchState';

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
  ]),
});
export type ContactEvidence = z.infer<typeof contactEvidenceSchema>;

/** Canonical contact evidence, never inferred from presentation or animation. A first-time
 * reception/shot and an ownership observer describe one contact at the same player/time. */
export const collectContactEvidence = (
  previous: TacticalMatchState,
  next: TacticalMatchState,
): ContactEvidence[] => {
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
    if (contact?.playerId === playerId && contact !== previous.lastBallContact) return contact.at;
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
  if (next.lastReceptionOutcome && next.lastReceptionOutcome !== previous.lastReceptionOutcome)
    add(
      next.lastReceptionOutcome.receiverId,
      contactAt(next.lastReceptionOutcome.receiverId),
      'controlled_contact',
    );
  if (
    next.ball.lastTouchPlayerId &&
    next.ball.lastTouchPlayerId !== previous.ball.lastTouchPlayerId &&
    next.restart?.phase !== 'setup'
  )
    add(next.ball.lastTouchPlayerId, contactAt(next.ball.lastTouchPlayerId), 'controlled_contact');
  if (
    next.ball.ownerId &&
    next.ball.ownerId !== previous.ball.ownerId &&
    next.restart?.phase !== 'setup'
  )
    add(next.ball.ownerId, contactAt(next.ball.ownerId), 'controlled_contact');
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
};
