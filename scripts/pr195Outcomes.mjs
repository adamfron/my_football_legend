import { z } from 'zod';
const time = z.number().nullable();
export const summarySchema = z.object({
  released: z.boolean(),
  candidateExists: z.boolean(),
  candidateSameIntentExists: z.boolean(),
  contactPossibleAtRequest: z.boolean().nullable(),
  receiverProximityAt: time,
  receiverTouchAt: time,
  receiverControlAt: time,
  defenderTouchAt: time,
  defenderControlAt: time,
  defenderProximityAt: time,
  defenderReachableAt: time,
  defenderDisruptionAt: time,
  fixedTargetArrivalAt: time,
  predictedFixedTargetArrival: z.number(),
  boundedFixedTargetArrival: z.number(),
  predictedCompletion: time,
  predictedRetained: time,
  completion: z.boolean().nullable(),
  retained: z.boolean().nullable(),
  predictedGoal: time,
  shotId: z.string().nullable(),
  shotOutcome: z.string().nullable(),
  goal: z.boolean().nullable(),
  goalkeeperAction: z.string().nullable(),
  looseAtHorizon: z.boolean(),
  exitAt: time,
  restart: z.string().nullable(),
  attackingCorner: z.boolean(),
  attackingSecondBall: z.boolean(),
  observationSeconds: z.number(),
});
const firstAt = (xs, fn) => xs.find(fn)?.at ?? null;
export const summariseTrial = (r, receiverId, defenderId) => {
  const actor = r.snapshot.state.players.find((p) => p.id === r.action.actorId),
    teamIds = new Set(
      r.snapshot.state.players.filter((p) => p.team === actor.team).map((p) => p.id),
    );
  const newContacts = new Map();
  for (const [i, o] of r.observations.entries()) {
    const previous = i ? r.observations[i - 1] : null;
    const ids = new Set();
    if (previous) {
      if (o.lastTouchPlayerId && o.lastTouchPlayerId !== previous.lastTouchPlayerId)
        ids.add(o.lastTouchPlayerId);
      if (
        o.groundContact?.executed &&
        o.groundContact.at >= r.requestedAt &&
        JSON.stringify(o.groundContact) !== JSON.stringify(previous.groundContact)
      )
        ids.add(o.groundContact.actorId);
      if (
        o.flightContact?.playerId &&
        o.flightContact.at >= r.requestedAt &&
        JSON.stringify(o.flightContact) !== JSON.stringify(previous.flightContact)
      )
        ids.add(o.flightContact.playerId);
    }
    newContacts.set(o, ids);
  }
  const contact = (o, id) => newContacts.get(o).has(id);
  const isPass = r.action.type === 'pass',
    isShot = ['shot', 'header'].includes(r.action.type);
  // Stop original-delivery attribution once either side controls or a restart occurs.
  const controlIndex = r.observations.findIndex(
    (o, i) => i > 1 && ((o.ownerId && o.ownerId !== actor.id) || o.restart),
  );
  const episode = controlIndex < 0 ? r.observations : r.observations.slice(0, controlIndex + 1);
  const receiverTouchAt = firstAt(episode, (o) => contact(o, receiverId)),
    receiverControlAt = firstAt(episode, (o) => o.ownerId === receiverId);
  const retentionSample =
    receiverControlAt === null
      ? null
      : r.observations.find((o) => o.at >= receiverControlAt + 1 - 1e-8);
  const shotId = isShot && r.released ? r.observations[1]?.shotId : null;
  const shotOutcome = shotId
    ? (r.observations.find((o) => o.shotId === shotId && o.shotOutcome)?.shotOutcome ?? null)
    : null;
  const arrival = firstAt(
    r.observations,
    (o) => o.defenderTargetDistance !== null && o.defenderTargetDistance <= 0.8,
  );
  return summarySchema.parse({
    released: r.released,
    candidateExists: r.candidateExists,
    candidateSameIntentExists: r.candidateSameIntentExists,
    contactPossibleAtRequest: r.contactPossibleAtRequest,
    receiverProximityAt: firstAt(
      episode,
      (o) => o.receiverDistance !== null && o.receiverDistance <= 1.05,
    ),
    receiverTouchAt,
    receiverControlAt,
    defenderTouchAt: firstAt(episode, (o) => contact(o, defenderId)),
    defenderControlAt: firstAt(episode, (o) => o.ownerId === defenderId),
    defenderProximityAt: firstAt(
      episode,
      (o) => o.defenderDistance !== null && o.defenderDistance <= 0.8,
    ),
    defenderReachableAt: firstAt(episode, (o) => o.defenderReachable),
    defenderDisruptionAt: firstAt(
      episode,
      (o) =>
        (contact(o, defenderId) &&
          o.flightContact?.playerId === defenderId &&
          o.flightContact.at >= r.requestedAt &&
          Math.abs(o.flightContact.preContactSpeed - o.flightContact.postContactSpeed) > 0.5) ||
        (contact(o, defenderId) &&
          o.groundContact?.actorId === defenderId &&
          o.groundContact.executed &&
          Math.hypot(
            o.groundContact.outgoingVelocity.x - o.groundContact.incomingVelocity.x,
            o.groundContact.outgoingVelocity.y - o.groundContact.incomingVelocity.y,
          ) > 0.5),
    ),
    fixedTargetArrivalAt: arrival,
    predictedFixedTargetArrival: r.truthForecast.defenderArrival.estimatedTime,
    boundedFixedTargetArrival: r.truthForecast.boundedDefenderArrival.playableSeconds,
    predictedCompletion: r.truthForecast.pass?.expectedCompletion ?? null,
    predictedRetained: r.truthForecast.pass?.expectedRetainedPossession ?? null,
    completion:
      isPass && r.released && (receiverTouchAt !== null || controlIndex >= 0)
        ? receiverTouchAt !== null
        : null,
    retained:
      isPass && r.released
        ? receiverControlAt === null
          ? controlIndex >= 0
            ? false
            : null
          : retentionSample
            ? teamIds.has(retentionSample.ownerId)
            : null
        : null,
    predictedGoal: r.truthForecast.shot?.effectiveScoringExpectation ?? null,
    shotId: shotId ?? null,
    shotOutcome,
    goal: isShot && r.released && shotOutcome !== null ? shotOutcome === 'goal' : null,
    goalkeeperAction:
      r.observations.find((o) => o.shotId === shotId && o.goalkeeperAction)?.goalkeeperAction ??
      null,
    looseAtHorizon: !r.observations.at(-1).ownerId && !r.observations.at(-1).restart,
    exitAt: firstAt(episode, (o) => o.restart !== null),
    restart: episode.find((o) => o.restart)?.restart ?? null,
    attackingCorner: r.observations.some(
      (o) => o.restart === 'corner' && o.restartTeam === actor.team,
    ),
    attackingSecondBall: r.observations.some(
      (o) =>
        o.at > r.requestedAt + 0.1 && o.ownerId && teamIds.has(o.ownerId) && o.ownerId !== actor.id,
    ),
    observationSeconds: r.observations.at(-1).at - r.requestedAt,
  });
};
