import { z } from 'zod';
import { teamSideSchema } from './matchSpace';
import type { TacticalMatchState } from './matchState';

export const matchEventKindSchema = z.enum([
  'goal',
  'yellow_card',
  'second_yellow_red',
  'red_card',
  'penalty',
  'foul',
  'offside',
  'kick_off',
  'substitution',
  'injury',
]);
/** Permanent football facts. Short-lived action labels and replay retention are independent. */
export const matchEventSchema = z.object({
  id: z.string().min(1),
  at: z.number().nonnegative().finite(),
  kind: matchEventKindSchema,
  team: teamSideSchema,
  actorId: z.string().optional(),
  relatedPlayerId: z.string().optional(),
  score: z
    .object({ home: z.number().int().nonnegative(), away: z.number().int().nonnegative() })
    .optional(),
  actionEventId: z.string().optional(),
  contactId: z.string().optional(),
  replayKey: z.string().min(1),
});
export type MatchEvent = z.infer<typeof matchEventSchema>;

/** Observe actual canonical transitions, including hidden simulation. No RNG or renderer. */
export const emitMatchEvents = (
  previous: TacticalMatchState,
  next: TacticalMatchState,
): TacticalMatchState => {
  const retained = next.matchEvents ?? previous.matchEvents ?? [];
  let events = retained;
  const add = (fact: Omit<MatchEvent, 'replayKey'>) => {
    if (events.some((event) => event.id === fact.id)) return;
    if (events === retained) events = retained.slice();
    events.push({ ...fact, replayKey: fact.id });
  };
  const actionRef = (key: string | undefined) =>
    key
      ? next.actionEvents?.find((event) => event.id === `${next.seed}:action:${key}`)?.id
      : undefined;
  for (const change of next.substitutionState?.completed ?? []) {
    if (previous.substitutionState?.completed.some((old) => old.id === change.id)) continue;
    add({
      id: change.id,
      at: change.enteredAt,
      kind: 'substitution',
      team: change.team,
      actorId: change.incomingId,
      relatedPlayerId: change.outgoingId,
    });
  }
  for (const injury of next.injuries ?? []) {
    if (previous.injuries?.some((old) => old.id === injury.id)) continue;
    const actor =
      next.players.find((player) => player.id === injury.playerId) ??
      next.departedPlayers?.find((player) => player.id === injury.playerId) ??
      previous.players.find((player) => player.id === injury.playerId);
    if (actor)
      add({ id: injury.id, at: injury.at, kind: 'injury', team: actor.team, actorId: actor.id });
  }
  for (const team of ['home', 'away'] as const) {
    if (next.score[team] <= previous.score[team]) continue;
    const shot = next.lastShot?.outcome === 'goal' ? next.lastShot : undefined;
    add({
      id: `${next.seed}:goal:${next.score.home}:${next.score.away}`,
      at: next.time,
      kind: 'goal',
      team,
      actorId: shot?.shooterId,
      score: { ...next.score },
      contactId: shot?.shotId,
      actionEventId: actionRef(shot ? `shot:${shot.shotId}` : undefined),
    });
  }
  const foul = next.lastFoul;
  const offside = next.lastOffsideOffence;
  if (offside && offside !== previous.lastOffsideOffence) {
    const actor =
      next.players.find((player) => player.id === offside.playerId) ??
      previous.players.find((player) => player.id === offside.playerId);
    if (actor)
      add({
        id: `${next.seed}:offside:${offside.playerId}:${offside.at.toFixed(6)}`,
        at: offside.at,
        kind: 'offside',
        team: actor.team,
        actorId: actor.id,
        relatedPlayerId: offside.passerId,
        actionEventId: actionRef(`offside:${offside.playerId}:${offside.at.toFixed(6)}`),
      });
  }
  if (foul && foul.id !== previous.lastFoul?.id) {
    add({
      id: foul.id,
      at: foul.at,
      kind: 'foul',
      team: foul.team,
      actorId: foul.actorId,
      relatedPlayerId: foul.opponentId,
      contactId: foul.challengeId,
      actionEventId: actionRef(`foul:${foul.id}`),
    });
  }
  const cards = next.recentCards !== previous.recentCards ? (next.recentCards ?? []) : [];
  for (const card of [
    ...cards,
    ...(next.lastCard && next.lastCard.id !== previous.lastCard?.id ? [next.lastCard] : []),
  ]) {
    if (previous.recentCards?.some((old) => old.id === card.id)) continue;
    add({
      id: card.id,
      at: card.at,
      kind:
        card.kind === 'yellow'
          ? 'yellow_card'
          : card.kind === 'red'
            ? 'red_card'
            : 'second_yellow_red',
      team: card.team,
      actorId: card.actorId,
      contactId: card.foulId,
      actionEventId: actionRef(`card:${card.id}`),
    });
  }
  const awardedFoul = [
    next.lastFoul,
    previous.lastFoul,
    previous.pendingAdvantage?.foul,
    next.pendingAdvantage?.foul,
  ].find((candidate) => candidate?.id === next.lastPenaltyAwardId);
  if (
    next.lastPenaltyAwardId &&
    next.lastPenaltyAwardId !== previous.lastPenaltyAwardId &&
    awardedFoul
  ) {
    const foul = awardedFoul;
    add({
      id: `${foul.id}:penalty`,
      at: next.time,
      kind: 'penalty',
      team: foul.awardedTeam,
      actorId: foul.opponentId,
      relatedPlayerId: foul.actorId,
      contactId: foul.challengeId,
    });
  }
  if (
    next.scenario === 'kick_off' &&
    next.restart &&
    next.restart.startedAt !== previous.restart?.startedAt
  ) {
    add({
      id: `${next.seed}:kickoff:${next.restart.startedAt}`,
      at: next.restart.startedAt,
      kind: 'kick_off',
      team: next.restart.restartTeam,
      actorId: next.restart.takerId,
      score: { ...next.score },
    });
  }
  return events === retained ? next : { ...next, matchEvents: events };
};
