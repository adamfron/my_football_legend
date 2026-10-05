import { z } from 'zod';
import {
  distance,
  physicalPointSchema,
  pitchPointSchema,
  teamSideSchema,
  type PitchPoint,
  type TeamSide,
} from './matchSpace';
import type { TacticalMatchState } from './matchState';
import { passExecutionTypeSchema } from './passExecution';

/** Enough canonical evidence for the six-second context and ten-second replay contracts.
 * The ledger is presentation evidence, not another statistics store or a source of RNG. */
export const ACTION_EVENT_RETENTION_SECONDS = 12;
export const ACTION_EVENT_CAPACITY = 96;
export const canonicalActionEventSchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  at: z.number().nonnegative().finite(),
  kind: z.enum([
    'pass',
    'through_pass',
    'cross',
    'reception',
    'heavy_touch',
    'interception',
    'challenge',
    'tackle',
    'slide_tackle',
    'block',
    'clearance',
    'shot',
    'save',
    'foul',
    'card',
    'advantage',
    'offside',
    'dribble',
  ]),
  actorId: z.string().min(1),
  team: teamSideSchema,
  targetId: z.string().optional(),
  position: physicalPointSchema,
  outcome: z.string().min(1),
  cause: z.string().min(1),
  parentId: z.string().optional(),
  executionType: passExecutionTypeSchema.optional(),
  requestedSpace: pitchPointSchema.optional(),
});
export type CanonicalActionEvent = z.infer<typeof canonicalActionEventSchema>;

type EventFact = Omit<CanonicalActionEvent, 'id' | 'sequence'> & { key: string };

/** Called after the authoritative transition. Selection alone never emits a football event.
 * Unchanged diagnostics take the allocation-free path; retention never grows with match length. */
export const emitCanonicalActionEvents = (
  previous: TacticalMatchState,
  next: TacticalMatchState,
): TacticalMatchState => {
  if (previous === next) return next;
  const retained = next.actionEvents ?? previous.actionEvents ?? [];
  let events = retained;
  let sequence = next.actionEventSequence ?? previous.actionEventSequence ?? 0;
  const eventId = (key: string) => `${next.seed}:action:${key}`;
  const add = ({ key, ...fact }: EventFact) => {
    const id = eventId(key);
    if (events.some((event) => event.id === id)) return;
    if (events === retained) events = retained.slice();
    events.push({ id, sequence: sequence++, ...fact });
  };
  const actorFact = (
    actorId: string,
    position: PitchPoint | undefined,
  ): { actorId: string; team: TeamSide; position: PitchPoint } | undefined => {
    const player =
      next.players.find((candidate) => candidate.id === actorId) ??
      previous.players.find((candidate) => candidate.id === actorId);
    if (!player) return undefined;
    const point = position ?? player.position;
    return { actorId, team: player.team, position: { x: point.x, y: point.y } };
  };
  const releasedPass = next.lastPassDiagnostic;
  const pass =
    next.lastResolvedPass &&
    (next.lastResolvedPass.resolvedAt ?? -1) > (releasedPass?.resolvedAt ?? -1)
      ? next.lastResolvedPass
      : releasedPass;
  const previousPass =
    previous.lastResolvedPass?.passId === pass?.passId
      ? previous.lastResolvedPass
      : previous.lastPassDiagnostic;
  const carry = next.ballCarrierIntent ?? previous.ballCarrierIntent;
  const carrier = carry && next.players.find((player) => player.id === carry.actorId);
  const previousCarrier = carry && previous.players.find((player) => player.id === carry.actorId);
  if (
    carry &&
    carrier &&
    previousCarrier &&
    next.ball.ownerId === carrier.id &&
    distance(carry.startPosition, carrier.position) >= 0.8 &&
    distance(carry.startPosition, previousCarrier.position) < 0.8
  ) {
    let parent: CanonicalActionEvent | undefined;
    for (let index = retained.length - 1; index >= 0; index--) {
      const event = retained[index]!;
      if (
        event.actorId === carrier.id &&
        event.kind === 'reception' &&
        event.at <= carry.startedAt
      ) {
        parent = event;
        break;
      }
    }
    add({
      key: `carry:${carrier.id}:${carry.startedAt.toFixed(6)}`,
      at: next.time,
      kind: 'dribble',
      actorId: carrier.id,
      team: carrier.team,
      position: carrier.position,
      outcome: 'controlled',
      cause: carry.executionMode ?? 'controlled',
      ...(parent ? { parentId: parent.id } : {}),
    });
  }
  if (releasedPass && releasedPass.passId !== previous.lastPassDiagnostic?.passId) {
    const actor = actorFact(releasedPass.passerId, next.ball.from);
    if (actor)
      add({
        ...actor,
        key: `pass:${releasedPass.passId}`,
        at: releasedPass.releasedAt,
        kind: releasedPass.intent === 'through' ? 'through_pass' : 'pass',
        targetId: releasedPass.intendedReceiverId,
        outcome: 'released',
        cause: releasedPass.intent ?? 'support',
        executionType: releasedPass.executionType,
        requestedSpace: releasedPass.requestedSpace,
      });
  }
  const reception = next.lastReceptionOutcome;
  if (reception && reception !== previous.lastReceptionOutcome) {
    const actor = actorFact(reception.receiverId, reception.contactPoint);
    if (actor) {
      const matchingPass =
        pass &&
        (pass?.actualReceiverId ?? pass?.intendedReceiverId) === reception.receiverId &&
        pass.resolvedAt !== undefined &&
        pass.resolvedAt >= previous.time - 0.001 &&
        pass.resolvedAt !== previousPass?.resolvedAt;
      const at = matchingPass ? pass.resolvedAt! : next.time;
      add({
        ...actor,
        key: `reception:${reception.receiverId}:${at.toFixed(6)}`,
        at,
        kind: ['heavy_touch', 'failed_control'].includes(reception.kind)
          ? 'heavy_touch'
          : 'reception',
        outcome: reception.kind,
        cause: 'physical_first_touch',
        ...(matchingPass
          ? { parentId: eventId(`pass:${pass.passId}`), targetId: pass.passerId }
          : {}),
      });
    }
  }
  // A first-time finish or an unprepared intended receiver still has a physical pass contact.
  // Its diagnostic is evidence; it must not be guessed from ownership or an animation cue.
  if (
    pass?.finalResult === 'completed' &&
    pass.actualContactPoint &&
    pass.resolvedAt !== undefined &&
    (pass.passId !== previousPass?.passId || pass.resolvedAt !== previousPass?.resolvedAt) &&
    !(
      reception !== previous.lastReceptionOutcome &&
      reception?.receiverId === (pass.actualReceiverId ?? pass.intendedReceiverId)
    )
  ) {
    const actor = actorFact(
      pass.actualReceiverId ?? pass.intendedReceiverId,
      pass.actualContactPoint,
    );
    if (actor)
      add({
        ...actor,
        key: `reception:${actor.actorId}:${pass.resolvedAt.toFixed(6)}`,
        at: pass.resolvedAt,
        kind: 'reception',
        outcome: 'completed',
        cause: 'physical_pass_contact',
        targetId: pass.passerId,
        parentId: eventId(`pass:${pass.passId}`),
      });
  }
  const shot = next.ball.shot ?? next.lastShot;
  const oldShot = previous.ball.shot ?? previous.lastShot;
  if (shot && shot.shotId !== oldShot?.shotId) {
    const actor = actorFact(shot.shooterId, next.ball.from);
    if (actor)
      add({
        ...actor,
        key: `shot:${shot.shotId}`,
        at: shot.releasedAt ?? next.time,
        kind: 'shot',
        outcome: 'released',
        cause: shot.intent ?? 'driven',
      });
  }
  if (
    next.ball.launchVelocity &&
    next.ball.lastTouchPlayerId &&
    ['cross', 'header'].includes(next.ball.sourceAction ?? '') &&
    !next.ball.shot &&
    next.ball.flightTime === 0 &&
    next.ball.launchVelocity !== previous.ball.launchVelocity
  ) {
    const actor = actorFact(next.ball.lastTouchPlayerId, next.ball.from);
    if (actor)
      add({
        ...actor,
        key: `delivery:${actor.actorId}:${next.time.toFixed(6)}`,
        at: next.time,
        kind:
          next.ball.sourceAction === 'cross'
            ? 'cross'
            : next.latestAction?.type === 'header' &&
                next.latestAction.intent === 'header_clearance'
              ? 'clearance'
              : 'pass',
        outcome: 'released',
        cause:
          next.latestAction?.type === 'header' ? next.latestAction.intent : next.ball.sourceAction!,
        targetId: next.ball.intendedReceiverId,
      });
  }
  const contact = next.lastBallContact;
  if (contact?.playerId && contact !== previous.lastBallContact) {
    const actor = actorFact(contact.playerId, contact.point);
    if (actor && ['goalkeeper', 'defender'].includes(contact.kind)) {
      // Passive keeper body collisions have no canonical save credit.
      const saved = contact.kind === 'goalkeeper' && next.lastShot?.outcome === 'save';
      add({
        ...actor,
        key: `contact:${contact.playerId}:${contact.at.toFixed(6)}`,
        at: contact.at,
        kind: saved ? 'save' : 'block',
        outcome: saved ? 'save' : 'deflection',
        cause: contact.kind,
        ...(shot ? { parentId: eventId(`shot:${shot.shotId}`), targetId: shot.shooterId } : {}),
      });
    }
  }
  const possession = next.lastPossessionChange;
  if (possession && possession !== previous.lastPossessionChange) {
    const ownerId = possession.winnerId ?? next.ball.ownerId ?? next.ball.lastTouchPlayerId;
    const actor = ownerId && actorFact(ownerId, next.ball);
    if (actor && actor.team === possession.to) {
      let parent: CanonicalActionEvent | undefined;
      for (let index = events.length - 1; index >= 0; index--) {
        const event = events[index]!;
        if (
          event.kind === 'heavy_touch' &&
          event.team === possession.from &&
          possession.at - event.at >= 0 &&
          possession.at - event.at < 2
        ) {
          parent = event;
          break;
        }
      }
      if (possession.cause !== 'claim' || parent)
        add({
          ...actor,
          key: `possession:${ownerId}:${possession.at.toFixed(6)}`,
          at: possession.at,
          kind: possession.cause === 'tackle' ? 'tackle' : 'interception',
          outcome: 'won',
          cause: possession.cause,
          targetId:
            parent?.actorId ??
            (possession.winnerId
              ? possession.loserId
              : (possession.loserId ?? previous.ball.ownerId)),
          ...(parent ? { parentId: parent.id } : {}),
        });
    }
  }
  const challenge = next.lastChallenge;
  if (challenge && challenge.id !== previous.lastChallenge?.id)
    add({
      key: `challenge:${challenge.id}`,
      at: challenge.at,
      actorId: challenge.actorId,
      team: challenge.team,
      targetId: challenge.opponentId,
      position: { ...challenge.position },
      kind:
        challenge.technique === 'slide'
          ? 'slide_tackle'
          : challenge.outcome === 'clean_win'
            ? 'tackle'
            : 'challenge',
      outcome: challenge.outcome,
      cause: challenge.technique,
    });
  const offside = next.lastOffsideOffence;
  if (offside && offside !== previous.lastOffsideOffence) {
    const actor = actorFact(offside.playerId, previous.ball);
    if (actor)
      add({
        ...actor,
        key: `offside:${offside.playerId}:${offside.at.toFixed(6)}`,
        at: offside.at,
        kind: 'offside',
        outcome: 'indirect_free_kick',
        cause: offside.reason,
        targetId: offside.passerId,
        ...(pass && pass.passerId === offside.passerId
          ? { parentId: eventId(`pass:${pass.passId}`) }
          : {}),
      });
  }
  const foul = next.lastFoul;
  if (foul && foul.id !== previous.lastFoul?.id)
    add({
      key: `foul:${foul.id}`,
      at: foul.at,
      actorId: foul.actorId,
      team: foul.team,
      targetId: foul.opponentId,
      position: { ...foul.position },
      kind: 'foul',
      outcome:
        next.pendingAdvantage?.foul.id === foul.id
          ? 'advantage'
          : foul.penalty
            ? 'penalty'
            : 'free_kick',
      cause: foul.tactical ? 'tactical' : foul.severity,
      parentId: eventId(`challenge:${foul.challengeId}`),
    });
  const cards = next.recentCards !== previous.recentCards ? next.recentCards : undefined;
  for (const card of cards ??
    (next.lastCard && next.lastCard.id !== previous.lastCard?.id ? [next.lastCard] : [])) {
    if (previous.recentCards?.some((previousCard) => previousCard.id === card.id)) continue;
    add({
      key: `card:${card.id}`,
      at: card.at,
      actorId: card.actorId,
      team: card.team,
      position: { ...card.position },
      kind: 'card',
      outcome: card.kind,
      cause: card.reason,
      parentId: eventId(`foul:${card.foulId}`),
    });
  }
  const advantage = next.lastAdvantage;
  if (advantage && advantage !== previous.lastAdvantage)
    add({
      key: `advantage:${advantage.id}:${advantage.outcome}`,
      at: advantage.at,
      actorId: advantage.actorId,
      team: advantage.team,
      position: { ...advantage.position },
      kind: 'advantage',
      outcome: advantage.outcome,
      cause: 'useful_attacking_possession',
      parentId: eventId(`foul:${advantage.foulId}`),
    });
  const cutoff = next.time - ACTION_EVENT_RETENTION_SECONDS;
  if ((events[0]?.at ?? next.time) < cutoff || events.length > ACTION_EVENT_CAPACITY)
    events = events.filter((event) => event.at >= cutoff).slice(-ACTION_EVENT_CAPACITY);
  return events === retained && next.actionEvents
    ? next
    : { ...next, actionEvents: events, actionEventSequence: sequence };
};
