import { isRestartSetup } from './restartPhase';
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
    'physical_control',
  ]),
});
export type ContactEvidence = z.infer<typeof contactEvidenceSchema>;

/** Public football touches describe continuous control, rather than each physical contact. */
export const controlEpisodeSchema = z.object({
  playerId: z.string(),
  startedAt: z.number().nonnegative(),
  lastContactAt: z.number().nonnegative(),
});
export type ControlEpisode = z.infer<typeof controlEpisodeSchema>;

/** Bounded episode projection: a carry, shield or release continues the receiver's touch.
 * A first-time action is one episode even when reception/release have separate evidence.
 * The caller supplies only new, exactly-once contacts; granular contacts remain available. */
export const projectControlEpisodes = (
  previous: TacticalMatchState,
  next: TacticalMatchState,
  contacts: readonly ContactEvidence[],
  active?: ControlEpisode,
) => {
  let episode = active && { ...active };
  const started: ControlEpisode[] = [];
  for (const contact of [...contacts].sort((a, b) => a.at - b.at)) {
    const reception = next.lastReceptionOutcome;
    if (
      contact.source === 'controlled_contact' &&
      reception?.receiverId === contact.playerId &&
      (reception.kind === 'heavy_touch' || reception.kind === 'failed_control') &&
      next.ball.ownerId !== contact.playerId &&
      episode?.playerId !== contact.playerId &&
      !contacts.some(
        (other) =>
          other.playerId === contact.playerId &&
          other.at === contact.at &&
          ['pass_release', 'shot_release', 'delivery_release'].includes(other.source),
      )
    )
      continue;
    // A deflection or a parry has granular contact evidence, but does not itself constitute
    // controlled possession. The acquisition/reception/release sources remain episode evidence.
    if (
      contact.source === 'flight_contact' &&
      next.ball.ownerId !== contact.playerId &&
      !(
        next.lastPossessionChange?.winnerId === contact.playerId &&
        next.lastPossessionChange.at === contact.at
      ) &&
      !(
        next.lastBallRecovery?.playerId === contact.playerId &&
        next.lastBallRecovery.at === contact.at
      )
    )
      continue;
    if (!episode || episode.playerId !== contact.playerId) {
      episode = {
        playerId: contact.playerId,
        startedAt: contact.at,
        lastContactAt: contact.at,
      };
      started.push({ ...episode });
    } else episode.lastContactAt = Math.max(episode.lastContactAt, contact.at);
  }
  // Placement at a restart is not control. Released/loose/contested balls close continuous
  // ownership; a subsequent recovery is a new public episode, even for the same footballer.
  if (
    episode &&
    (next.ball.ownerId !== episode.playerId ||
      !next.players.some((player) => player.id === episode!.playerId) ||
      isRestartSetup(next) ||
      next.status === 'half_time' ||
      next.status === 'full_time' ||
      next.status === 'abandoned')
  )
    episode = undefined;
  // An ownership loss with no contact evidence must also close a previously active episode.
  if (episode && previous.ball.ownerId === episode.playerId && !next.ball.ownerId)
    episode = undefined;
  return { active: episode, started };
};

/** Discrete football contacts: release, reception, physical contact and acquisition.
 * Ownership maintenance and last-touch provenance are not contacts.
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
    const passes = [next.lastResolvedPass, next.lastPassDiagnostic].filter(
      (pass): pass is NonNullable<typeof pass> => Boolean(pass),
    );
    for (const pass of passes) {
      add(pass.passerId, pass.releasedAt, 'pass_release');
      if (
        pass.actualContactPoint &&
        pass.resolvedAt !== undefined &&
        pass.finalResult === 'completed'
      )
        add(pass.actualReceiverId ?? pass.intendedReceiverId, pass.resolvedAt, 'pass_reception');
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
    const reception = next.lastReceptionOutcome;
    const newlyResolvedPasses = passes.filter(
      (pass) =>
        pass.actualContactPoint &&
        pass.resolvedAt !== undefined &&
        pass.resolvedAt >= previous.time - 0.001 &&
        ![previous.lastResolvedPass, previous.lastPassDiagnostic].some(
          (observed) =>
            observed?.passId === pass.passId &&
            observed.resolvedAt === pass.resolvedAt &&
            observed.finalResult === pass.finalResult,
        ),
    );
    const resolvedReception = newlyResolvedPasses.find(
      (pass) =>
        reception &&
        pass.actualContactPoint &&
        pass.receptionOutcome === reception.kind &&
        (!pass.actualReceiverId || pass.actualReceiverId === reception.receiverId) &&
        distance(pass.actualContactPoint, reception.contactPoint) <= 0.000001,
    );
    const contactAt = (playerId: string) => {
      if (contact?.playerId === playerId && contact.at !== previous.lastBallContact?.at)
        return contact.at;
      if (resolvedReception && reception?.receiverId === playerId)
        return resolvedReception.resolvedAt!;
      const pass = newlyResolvedPasses.find(
        (candidate) =>
          (candidate.actualReceiverId ?? candidate.intendedReceiverId) === playerId &&
          candidate.actualContactPoint &&
          candidate.resolvedAt !== undefined,
      );
      if (
        pass &&
        (pass?.actualReceiverId ?? pass?.intendedReceiverId) === playerId &&
        pass.actualContactPoint &&
        pass.resolvedAt !== undefined &&
        pass.resolvedAt >= previous.time - 0.001
      )
        return pass.resolvedAt;
      if (
        next.ball.shot?.shooterId === playerId &&
        next.ball.shot.shotId !== previous.ball.shot?.shotId
      )
        return next.ball.shot.releasedAt ?? next.time;
      return next.time;
    };
    const previousReception = previous.lastReceptionOutcome;
    const newReception =
      reception &&
      (resolvedReception ||
        !previousReception ||
        reception.receiverId !== previousReception.receiverId ||
        reception.kind !== previousReception.kind ||
        distance(reception.contactPoint, previousReception.contactPoint) > 0.000001 ||
        (next.onBallPreparation?.actorId === reception.receiverId &&
          next.onBallPreparation.gainedAt !== previous.onBallPreparation?.gainedAt));
    if (newReception)
      add(reception.receiverId, contactAt(reception.receiverId), 'controlled_contact');
    if (next.ball.ownerId && next.ball.ownerId !== previous.ball.ownerId && !isRestartSetup(next))
      add(next.ball.ownerId, contactAt(next.ball.ownerId), 'controlled_contact');
    const carry = next.ballCarrierIntent ?? previous.ballCarrierIntent;
    const carrier = carry && next.players.find((player) => player.id === carry.actorId);
    if (
      carry &&
      carrier &&
      !next.controlledBallContact &&
      next.ball.ownerId === carrier.id &&
      distance(carry.startPosition, carrier.position) >= 0.8
    )
      add(carrier.id, carry.startedAt, 'carry_control', `carry:${carry.startedAt.toFixed(6)}`);
    const physicalControl = next.controlledBallContact;
    if (
      physicalControl &&
      physicalControl.physicalContacts > 0 &&
      (physicalControl.actorId !== previous.controlledBallContact?.actorId ||
        physicalControl.lastContactAt !== previous.controlledBallContact?.lastContactAt)
    )
      add(physicalControl.actorId, physicalControl.lastContactAt, 'physical_control');
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
